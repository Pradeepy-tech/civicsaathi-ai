import 'dotenv/config';
import http from 'http';
import path from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  CIVIC_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type CivicCategory,
  type ComplaintPriority,
  type ComplaintStatus,
} from './src/types/civic.ts';
import {
  createRateLimiter,
  sanitizeEmail,
  sanitizePhone,
  sanitizeText,
  validateEvidenceImage,
} from './src/server/security.ts';
import {
  classifyCitizenComplaint,
  getPythonAiEngineStatus,
  streamAskSaathiChat,
  transcribeCitizenAudio,
  type AskSaathiHistoryItem,
} from './src/server/pythonMlBridge.ts';
import {
  createCitizenComplaint,
  findPotentialDuplicates,
  getOfficerDashboardData,
  getOrCreateOfficerUser,
  getPublicOverview,
  resolveWardAndDepartment,
  submitResolutionVerification,
  trackComplaintWithPin,
  updateComplaintByOfficer,
  updateOfficerScope,
} from './src/db/repository.ts';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.NODE_ENV === 'production' ? Number(process.env.PORT || 3000) : 3000;

// Allow up to 6MB JSON payload for base64 audio recording and compressed photo evidence
app.use(express.json({ limit: '6mb' }));

// Rate limiters
const aiRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 25, label: 'AI-Triage' });
const submitRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 15,
  label: 'Complaint-Submission',
});
const pinLookupRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  label: 'PIN-Lookup',
});

// Health Check & Python AI/ML Engine Metadata
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/ai/status', async (_req: Request, res: Response) => {
  try {
    const status = await getPythonAiEngineStatus();
    res.json(status);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unable to query Python AI engine status.';
    res.status(500).json({ error: msg });
  }
});

// 1. Public Overview & Sample Demo Showcase
app.get('/api/public/overview', async (_req: Request, res: Response) => {
  try {
    const overview = await getPublicOverview();
    res.json(overview);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load public overview.';
    res.status(500).json({ error: msg });
  }
});

// 1b. Verified All-India Municipal Bodies, Localities & Categories Directory
app.get('/api/public/municipalities', async (_req: Request, res: Response) => {
  try {
    const { MUNICIPAL_CITIES, ORDERED_STATES_UTS, VERIFIED_CATEGORY_DIRECTORY } = await import(
      './src/data/municipalDirectory.ts'
    );
    const totalWards = MUNICIPAL_CITIES.reduce((acc, c) => acc + c.wards.length, 0);
    const totalLocalities = MUNICIPAL_CITIES.reduce(
      (acc, c) => acc + c.wards.reduce((wAcc, w) => wAcc + w.localities.length, 0),
      0
    );
    res.json({
      summary: {
        statesAndUtsCovered: ORDERED_STATES_UTS.length,
        citiesCovered: MUNICIPAL_CITIES.length,
        wardsCovered: totalWards,
        verifiedLocalitiesCount: totalLocalities,
        categoriesVerifiedCount: VERIFIED_CATEGORY_DIRECTORY.length,
        focusStates: ['Chandigarh (UT)', 'Haryana', 'Rajasthan'],
      },
      statesAndUts: ORDERED_STATES_UTS,
      cities: MUNICIPAL_CITIES,
      categories: VERIFIED_CATEGORY_DIRECTORY,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load municipal directory.';
    res.status(500).json({ error: msg });
  }
});

// 2. Server-Side Voice Transcription (Gemini 3.5 Transcribe)
app.post('/api/ai/transcribe', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const rawAudio =
      typeof req.body?.base64Audio === 'string'
        ? req.body.base64Audio.trim()
        : typeof req.body?.audioDataUri === 'string'
          ? req.body.audioDataUri.trim()
          : '';

    let extractedMime = sanitizeText(req.body?.mimeType, 80);
    let base64Audio = rawAudio;

    const dataUriMatch = rawAudio.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
    if (dataUriMatch) {
      if (!extractedMime) {
        extractedMime = dataUriMatch[1].trim();
      }
      base64Audio = dataUriMatch[2].trim();
    }

    base64Audio = base64Audio.replace(/\s+/g, '');

    const rawBaseMime = (extractedMime || 'audio/webm').split(';')[0].trim().toLowerCase();
    const mimeNormalizationMap: Record<string, string> = {
      'audio/x-m4a': 'audio/mp4',
      'audio/m4a': 'audio/mp4',
      'audio/mp4a-latm': 'audio/mp4',
      'video/webm': 'audio/webm',
      'video/mp4': 'audio/mp4',
      'audio/x-wav': 'audio/wav',
      'audio/wave': 'audio/wav',
    };
    const normalizedMime = mimeNormalizationMap[rawBaseMime] || rawBaseMime;
    const mimeType = /^audio\/[a-z0-9.+-]+$/.test(normalizedMime) ? normalizedMime : 'audio/webm';
    const languageCode = sanitizeText(req.body?.languageCode, 20) || 'hi';

    if (!base64Audio || base64Audio.length < 64) {
      res.status(400).json({ error: 'Audio recording data is empty or too short.' });
      return;
    }
    if (base64Audio.length > 5_500_000) {
      res.status(400).json({ error: 'Voice clip exceeds size limit. Please keep recordings under 45 seconds.' });
      return;
    }

    const result = await transcribeCitizenAudio({ base64Audio, mimeType, languageCode });
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Voice transcription failed.';
    console.warn('[Transcribe] Request failed:', msg);
    res.status(502).json({ error: msg });
  }
});

// 2b. AskSaathi Floating Citizen Assistant Streaming Chat (Gemini 3.8 Flash)
app.post('/api/ai/ask-saathi', aiRateLimiter, async (req: Request, res: Response) => {
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const sanitizedMessages: AskSaathiHistoryItem[] = rawMessages
    .slice(-10)
    .map((m: { role?: unknown; content?: unknown }) => ({
      role: (m?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: sanitizeText(m?.content, 1500),
    }))
    .filter((m: AskSaathiHistoryItem) => m.content.length > 0);

  while (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role !== 'user') {
    sanitizedMessages.pop();
  }

  if (sanitizedMessages.length === 0) {
    res.status(400).json({ error: 'Please enter a message for AskSaathi.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 5000);

  try {
    for await (const event of streamAskSaathiChat(sanitizedMessages)) {
      if (event.type === 'notice') {
        res.write(`data: ${JSON.stringify({ notice: event.message })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ delta: event.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : 'AskSaathi could not respond right now. Please try again.';
    console.warn('[AskSaathi] Stream request error:', msg);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
  }
});

// 3. Server-Side Multilingual AI Triage, Smart Routing & Duplicate Detection
app.post('/api/ai/classify', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const description = sanitizeText(req.body?.description, 2000);
    const languageCode = sanitizeText(req.body?.languageCode, 20) || 'hi';
    const city = sanitizeText(req.body?.city, 80) || 'New Delhi';
    const locality = sanitizeText(req.body?.locality, 120);
    const followUpContext = sanitizeText(req.body?.followUpContext, 800);
    const manualCategoryOverride = sanitizeText(req.body?.categoryOverride, 80);

    if (!description || description.length < 5) {
      res.status(400).json({ error: 'Please enter a complaint description (at least 5 characters).' });
      return;
    }

    const aiResult = await classifyCitizenComplaint({
      description,
      languageCode,
      city,
      locality,
      followUpContext: followUpContext || undefined,
    });

    const chosenCategory: CivicCategory =
      manualCategoryOverride && CIVIC_CATEGORIES.includes(manualCategoryOverride as CivicCategory)
        ? (manualCategoryOverride as CivicCategory)
        : aiResult.category;

    const routing = await resolveWardAndDepartment({
      city,
      locality: locality || aiResult.extractedLocationHint,
      category: chosenCategory,
      priority: aiResult.priority,
    });

    const potentialDuplicates = await findPotentialDuplicates({
      city,
      locality: locality || aiResult.extractedLocationHint,
      wardCode: routing.ward?.wardCode,
      category: chosenCategory,
      description,
      interpretedSummary: aiResult.interpretedSummaryEn,
    });

    res.json({
      detectedLanguage: aiResult.detectedLanguage,
      interpretedSummaryEn: aiResult.interpretedSummaryEn,
      interpretedSummaryHi: aiResult.interpretedSummaryHi,
      category: chosenCategory,
      extractedLocationHint: aiResult.extractedLocationHint,
      priority: aiResult.priority,
      priorityReason: aiResult.priorityReason,
      recommendedDepartmentCode: routing.department.code,
      recommendedDepartmentNameEn: routing.department.nameEn,
      recommendedDepartmentNameHi: routing.department.nameHi,
      requiresManualAssignment: routing.requiresManualAssignment,
      slaHours: routing.slaHours,
      needsFollowUp: aiResult.needsFollowUp,
      followUpQuestions: aiResult.followUpQuestions,
      classificationSource: aiResult.classificationSource,
      potentialDuplicates,
      resolvedWard: routing.ward
        ? {
            wardCode: routing.ward.wardCode,
            wardName: `${routing.ward.wardName} (Ward ${routing.ward.wardNumber})`,
            municipalBody: routing.ward.municipalBody,
            zoneName: routing.ward.zoneName,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error('Classification route error:', error);
    const msg = error instanceof Error ? error.message : 'Unable to classify complaint.';
    res.status(500).json({ error: msg });
  }
});

// 4. Register Confirmed Citizen Complaint
app.post('/api/complaints', submitRateLimiter, async (req: Request, res: Response) => {
  try {
    const language = sanitizeText(req.body?.language, 20) || 'hi';
    const rawDescription = sanitizeText(req.body?.rawDescription, 2000);
    const interpretedSummary = sanitizeText(req.body?.interpretedSummary, 1000);
    const categoryRaw = sanitizeText(req.body?.category, 80);
    const priorityRaw = sanitizeText(req.body?.priority, 30);
    const priorityReason = sanitizeText(req.body?.priorityReason, 400) || 'Standard municipal triage.';
    const classificationSource =
      req.body?.classificationSource === 'rule_fallback' ? 'rule_fallback' : 'ai';
    const city = sanitizeText(req.body?.city, 80);
    const locality = sanitizeText(req.body?.locality, 120);
    const landmark = sanitizeText(req.body?.landmark, 200) || null;
    const citizenName = sanitizeText(req.body?.citizenName, 100);
    const citizenPhone = sanitizePhone(req.body?.citizenPhone);
    const citizenEmail = sanitizeEmail(req.body?.citizenEmail);
    const duplicateOfTrackingCode = sanitizeText(req.body?.duplicateOfTrackingCode, 40) || null;

    if (!rawDescription || rawDescription.length < 5) {
      res.status(400).json({ error: 'Complaint description is required.' });
      return;
    }
    if (!city || !locality) {
      res.status(400).json({ error: 'City and locality are required for municipal ward routing.' });
      return;
    }
    if (!citizenName || citizenName.length < 2) {
      res.status(400).json({ error: 'Please provide your name for the complaint receipt.' });
      return;
    }

    const category: CivicCategory = CIVIC_CATEGORIES.includes(categoryRaw as CivicCategory)
      ? (categoryRaw as CivicCategory)
      : 'Other Civic Issues';

    const priority: ComplaintPriority = COMPLAINT_PRIORITIES.includes(priorityRaw as ComplaintPriority)
      ? (priorityRaw as ComplaintPriority)
      : 'Medium';

    let beforeEvidence: { mimeType: string; imageUrl: string } | null = null;
    if (req.body?.beforeImageDataUri) {
      beforeEvidence = validateEvidenceImage(req.body.beforeImageDataUri);
    }

    const receipt = await createCitizenComplaint({
      language,
      rawDescription,
      interpretedSummary: interpretedSummary || rawDescription,
      category,
      priority,
      priorityReason,
      classificationSource,
      city,
      locality,
      landmark,
      citizenName,
      citizenPhone,
      citizenEmail,
      duplicateOfTrackingCode,
      beforeEvidence,
    });

    res.status(201).json(receipt);
  } catch (error: unknown) {
    console.error('Create complaint error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to register complaint.';
    res.status(400).json({ error: msg });
  }
});

function cleanTrackingCodeInput(raw: unknown): string {
  return sanitizeText(raw, 40)
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
}

// 5. Private Citizen Tracking Lookup (Complaint ID + Secret PIN)
async function handleTrackLookup(trackingCodeRaw: unknown, pinRaw: unknown, res: Response) {
  try {
    const trackingCode = cleanTrackingCodeInput(trackingCodeRaw);
    const pin = sanitizeText(pinRaw, 12).replace(/\s+/g, '');

    if (!trackingCode || !pin) {
      res.status(400).json({ error: 'Both Complaint ID and 4-digit secret PIN are required.' });
      return;
    }

    const detail = await trackComplaintWithPin(trackingCode, pin);
    if (!detail) {
      res.status(403).json({
        error: 'Invalid Complaint ID or PIN. Private citizen complaints require matching credentials.',
      });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json(detail);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unable to retrieve complaint.';
    res.status(500).json({ error: msg });
  }
}

app.post('/api/complaints/track', pinLookupRateLimiter, async (req: Request, res: Response) => {
  await handleTrackLookup(req.body?.trackingCode, req.body?.pin, res);
});

app.get('/api/complaints/track', pinLookupRateLimiter, async (req: Request, res: Response) => {
  const headerPin = req.headers['x-civic-pin'];
  const pinInput = Array.isArray(headerPin) ? headerPin[0] : headerPin || req.query?.pin;
  await handleTrackLookup(req.query?.trackingCode, pinInput, res);
});

// 6. Citizen Resolution Verification (Confirm Fix or Reopen Unresolved)
app.post('/api/complaints/verify', pinLookupRateLimiter, async (req: Request, res: Response) => {
  try {
    const trackingCode = cleanTrackingCodeInput(req.body?.trackingCode);
    const pin = sanitizeText(req.body?.pin, 12).replace(/\s+/g, '');
    const outcome = req.body?.outcome === 'reopened' ? 'reopened' : 'confirmed';
    const ratingRaw = Number(req.body?.rating);
    const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
    const comment =
      sanitizeText(req.body?.comment, 800) ||
      (outcome === 'confirmed'
        ? 'Issue resolved satisfactorily on ground.'
        : 'Problem still persists at reported spot.');

    let reopenEvidence: { mimeType: string; imageUrl: string } | null = null;
    if (req.body?.reopenImageDataUri) {
      reopenEvidence = validateEvidenceImage(req.body.reopenImageDataUri);
    }

    const updated = await submitResolutionVerification({
      trackingCode,
      pin,
      outcome,
      rating,
      comment,
      reopenEvidence,
    });

    res.json(updated);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
      res.status(403).json({ error: 'Invalid Complaint ID or PIN.' });
      return;
    }
    if (error instanceof Error && error.message === 'NOT_IN_RESOLVED_STATE') {
      res.status(400).json({ error: 'Resolution verification is only available once status is Resolved.' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Failed to record verification.';
    res.status(400).json({ error: msg });
  }
});

// 7. Authenticated Officer Dashboard & Analytics (Google Sign-In + RBAC)
app.get('/api/officer/dashboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    const profile = await getOrCreateOfficerUser({
      uid: tokenUser.uid,
      email: tokenUser.email || `${tokenUser.uid}@officer.local`,
      displayName: tokenUser.name || tokenUser.email || 'Municipal Officer',
    });

    const data = await getOfficerDashboardData(profile);
    res.json(data);
  } catch (error: unknown) {
    console.error('Officer dashboard error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to load officer dashboard.';
    res.status(500).json({ error: msg });
  }
});

// 8. Authenticated Officer Complaint Status / Routing / Assignment Update
app.patch(
  '/api/officer/complaints/:trackingCode',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const profile = await getOrCreateOfficerUser({
        uid: tokenUser.uid,
        email: tokenUser.email || `${tokenUser.uid}@officer.local`,
        displayName: tokenUser.name || tokenUser.email || 'Municipal Officer',
      });

      const trackingCode = sanitizeText(req.params.trackingCode, 40);
      const statusRaw = sanitizeText(req.body?.status, 30);
      const priorityRaw = sanitizeText(req.body?.priority, 30);
      const departmentCode = sanitizeText(req.body?.departmentCode, 40) || undefined;
      const assignedOfficerName =
        req.body?.assignedOfficerName !== undefined
          ? sanitizeText(req.body.assignedOfficerName, 120)
          : undefined;
      const comment = sanitizeText(req.body?.comment, 1000);

      if (!comment || comment.length < 3) {
        res.status(400).json({ error: 'Please include an official action remark (at least 3 characters).' });
        return;
      }

      const newStatus: ComplaintStatus | undefined = COMPLAINT_STATUSES.includes(
        statusRaw as ComplaintStatus
      )
        ? (statusRaw as ComplaintStatus)
        : undefined;

      const newPriority: ComplaintPriority | undefined = COMPLAINT_PRIORITIES.includes(
        priorityRaw as ComplaintPriority
      )
        ? (priorityRaw as ComplaintPriority)
        : undefined;

      let afterEvidence: { mimeType: string; imageUrl: string } | null = null;
      if (req.body?.afterImageDataUri) {
        afterEvidence = validateEvidenceImage(req.body.afterImageDataUri);
      }

      const updated = await updateComplaintByOfficer({
        officer: profile,
        trackingCode,
        newStatus,
        newDepartmentCode: departmentCode,
        assignedOfficerName,
        newPriority,
        comment,
        afterEvidence,
      });

      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Complaint record not found.' });
        return;
      }
      if (error instanceof Error && error.message === 'FORBIDDEN_DEPARTMENT') {
        res.status(403).json({
          error: 'Access Denied: Your officer role is only authorized for your assigned department.',
        });
        return;
      }
      const msg = error instanceof Error ? error.message : 'Failed to update complaint.';
      res.status(400).json({ error: msg });
    }
  }
);

// 9. Super Admin / Bootstrapped Owner RBAC Role & Department Assignment
app.patch('/api/officer/rbac', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tokenUser = req.user!;
    await getOrCreateOfficerUser({
      uid: tokenUser.uid,
      email: tokenUser.email || `${tokenUser.uid}@officer.local`,
      displayName: tokenUser.name || tokenUser.email || 'Municipal Officer',
    });

    const targetUid = sanitizeText(req.body?.targetUid, 128) || tokenUser.uid;
    const role = req.body?.role === 'super_admin' ? 'super_admin' : 'department_officer';
    const departmentCode = sanitizeText(req.body?.departmentCode, 40) || null;
    const cityScope = sanitizeText(req.body?.cityScope, 60) || null;

    const updatedProfile = await updateOfficerScope({
      requesterUid: tokenUser.uid,
      requesterEmail: tokenUser.email || '',
      targetUid,
      role,
      departmentCode,
      cityScope,
    });

    res.json(updatedProfile);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FORBIDDEN_ROLE_CHANGE') {
      res.status(403).json({ error: 'Only Municipal Super Admins can modify RBAC role assignments.' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Failed to update officer RBAC scope.';
    res.status(400).json({ error: msg });
  }
});

// Ensure unmatched /api/* routes always return JSON rather than SPA index.html
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use('/src/assets/images', express.static(path.resolve(process.cwd(), 'src/assets/images')));
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicSaathi AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
