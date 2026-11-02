import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getTrackingPrefixForCity } from '../data/municipalDirectory.ts';

const DEFAULT_PIN_SALTS = [
  'civicsaathi-civic-pin-salt-v1',
  'civicsaathi-prototype-salt',
];

function getActivePinSalt(): string {
  return process.env.PIN_HASH_SALT?.trim() || DEFAULT_PIN_SALTS[0];
}

function computePinHashWithSalt(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');
}

export function hashAccessPin(pin: string): string {
  return computePinHashWithSalt(pin, getActivePinSalt());
}

export function verifyAccessPin(pin: string, expectedHash: string): boolean {
  const b = Buffer.from(expectedHash, 'hex');
  if (b.length === 0) return false;

  const candidateSalts = new Set<string>([getActivePinSalt(), ...DEFAULT_PIN_SALTS]);
  for (const salt of candidateSalts) {
    const a = Buffer.from(computePinHashWithSalt(pin, salt), 'hex');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export function generatePinCode(): string {
  return String(crypto.randomInt(1000, 9999));
}

export function generateTrackingCode(city: string): string {
  const cityCode = getTrackingPrefixForCity(city);
  const year = new Date().getFullYear();
  const suffix = crypto.randomInt(2000, 9999);
  return `CS-${cityCode}-${year}-${suffix}`;
}

export function sanitizeText(input: unknown, maxLength = 2000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>?/gm, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[^\d+\-\s]/g, '').trim().slice(0, 20);
  return cleaned.length >= 6 ? cleaned : null;
}

export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().toLowerCase().slice(0, 120);
  if (!cleaned) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : null;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'Not provided';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'In-Portal Citizen';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

export function validateEvidenceImage(dataUri: unknown): { mimeType: string; imageUrl: string } | null {
  if (typeof dataUri !== 'string' || !dataUri.trim()) return null;
  const trimmed = dataUri.trim();
  const match = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('Invalid image format. Only JPEG, PNG, or WebP evidence images are permitted.');
  }
  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const base64Body = match[2];
  // Restrict payload to ~1.5MB max binary size
  const approxBytes = Math.ceil((base64Body.length * 3) / 4);
  if (approxBytes > 1_600_000) {
    throw new Error('Uploaded photo is too large. Please attach an image under 1.5 MB.');
  }
  return { mimeType, imageUrl: trimmed };
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

export function createRateLimiter(options: { windowMs: number; maxRequests: number; label: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : req.socket.remoteAddress) || 'local';
    const key = `${options.label}:${ip}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now > existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      res.status(429).json({
        error: `Too many requests (${options.label}). Please wait a moment and try again.`,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
