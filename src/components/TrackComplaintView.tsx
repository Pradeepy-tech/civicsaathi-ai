import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Upload,
  Trash2,
  Loader2,
  Star,
  RotateCcw,
} from 'lucide-react';
import { CivicImage, compressImageFile } from './CivicImage.tsx';
import { normalizePinCode, normalizeTrackingCode, safeFetchJson } from '../lib/apiClient.ts';
import { CATEGORY_LABELS, STATUS_LABELS, UI_COPY } from '../i18n/translations.ts';
import type {
  CivicCategory,
  ComplaintDetail,
  ComplaintStatus,
  PublicDemoCard,
  UiLanguage,
} from '../types/civic.ts';

interface TrackComplaintViewProps {
  uiLang: UiLanguage;
  sampleComplaints: PublicDemoCard[];
  initialTrackingCode?: string;
  initialPin?: string;
  onStatusMutated: () => void;
}

export const TrackComplaintView: React.FC<TrackComplaintViewProps> = ({
  uiLang,
  sampleComplaints,
  initialTrackingCode = '',
  initialPin = '',
  onStatusMutated,
}) => {
  const t = UI_COPY[uiLang];

  const [trackingCode, setTrackingCode] = useState(initialTrackingCode);
  const [pin, setPin] = useState(initialPin);
  const [activePin, setActivePin] = useState(initialPin);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);

  const [verifyMode, setVerifyMode] = useState<'confirmed' | 'reopened'>('confirmed');
  const [rating, setRating] = useState<number>(5);
  const [verifyComment, setVerifyComment] = useState('');
  const [reopenImageUri, setReopenImageUri] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifySuccessMsg, setVerifySuccessMsg] = useState<string | null>(null);

  const fetchComplaint = useCallback(async (codeToFetch: string, pinToUse: string) => {
    const cleanCode = normalizeTrackingCode(codeToFetch);
    const cleanPin = normalizePinCode(pinToUse);
    if (!cleanCode || !cleanPin) return;
    setLoading(true);
    setErrorMessage(null);
    setVerifySuccessMsg(null);
    try {
      let data: ComplaintDetail;
      try {
        data = await safeFetchJson<ComplaintDetail>(
          '/api/complaints/track',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trackingCode: cleanCode,
              pin: cleanPin,
            }),
          },
          { fallbackError: 'Could not unlock complaint details.' }
        );
      } catch (postErr: unknown) {
        const msg = postErr instanceof Error ? postErr.message : '';
        // Only fall back to GET if POST suffered a transport/proxy interruption (not a 403/400 validation error)
        if (
          msg.includes('Invalid Complaint ID') ||
          msg.includes('required') ||
          msg.includes('Too many requests')
        ) {
          throw postErr;
        }
        const qs = new URLSearchParams({ trackingCode: cleanCode }).toString();
        data = await safeFetchJson<ComplaintDetail>(
          `/api/complaints/track?${qs}`,
          {
            method: 'GET',
            headers: { 'X-Civic-Pin': cleanPin },
          },
          { fallbackError: 'Could not unlock complaint details.' }
        );
      }
      setDetail(data);
      setTrackingCode(cleanCode);
      setActivePin(cleanPin);
    } catch (err: unknown) {
      setDetail(null);
      setErrorMessage(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTrackingCode && initialPin) {
      setTrackingCode(initialTrackingCode);
      setPin(initialPin);
      fetchComplaint(initialTrackingCode, initialPin);
    }
  }, [initialTrackingCode, initialPin, fetchComplaint]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingCode.trim() || !pin.trim()) {
      setErrorMessage(
        uiLang === 'hi'
          ? 'कृपया शिकायत आईडी और 4-अंकीय पिन दोनों दर्ज करें।'
          : 'Both Complaint ID and 4-digit PIN are required.'
      );
      return;
    }
    fetchComplaint(trackingCode, pin);
  };

  const handleReopenPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setReopenImageUri(compressed);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid photo selected.');
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setVerifying(true);
    setErrorMessage(null);
    setVerifySuccessMsg(null);
    try {
      const data = await safeFetchJson<ComplaintDetail>(
        '/api/complaints/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackingCode: normalizeTrackingCode(detail.trackingCode),
            pin: normalizePinCode(activePin),
            outcome: verifyMode,
            rating: verifyMode === 'confirmed' ? rating : null,
            comment:
              verifyComment.trim() ||
              (verifyMode === 'confirmed'
                ? 'Repair verified on ground by citizen.'
                : 'Problem remains unresolved on ground.'),
            reopenImageDataUri: verifyMode === 'reopened' ? reopenImageUri : null,
          }),
        },
        { fallbackError: 'Could not record verification.' }
      );
      setDetail(data);
      setVerifyComment('');
      setReopenImageUri(null);
      setVerifySuccessMsg(
        verifyMode === 'confirmed'
          ? uiLang === 'hi'
            ? 'समाधान की पुष्टि दर्ज कर ली गई है। धन्यवाद!'
            : 'Thank you — your resolution confirmation has been permanently recorded.'
          : uiLang === 'hi'
            ? 'शिकायत पुनः खोल (Reopen) दी गई है और उच्च प्राथमिकता पर एस्केलेट कर दी गई है।'
            : 'Complaint has been reopened to In Progress with elevated priority for officer action.'
      );
      onStatusMutated();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const renderStatusState = (status: string, isEscalated: boolean) => {
    const label = STATUS_LABELS[status as ComplaintStatus]?.[uiLang] || status;
    if (status === 'Resolved') {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#138808]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    if (status === 'Rejected') {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#162E51]/60">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    if (isEscalated) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#DC2626]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{label} · SLA Escalated</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#B45309]">
        <Clock className="w-4 h-4 shrink-0" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] block mb-1">
          {uiLang === 'hi' ? 'निजी स्थिति जाँच' : 'PIN-Protected Grievance Status'}
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#162E51]">
          {t.trackTitle}
        </h1>
        <p className="text-sm text-[#162E51]/70 mt-1.5">{t.trackSub}</p>
      </div>

      {/* Lookup Panel */}
      <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-5">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
          <div className="sm:col-span-6">
            <label
              htmlFor="track-id-input"
              className="block font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] mb-1.5"
            >
              Complaint ID
            </label>
            <input
              id="track-id-input"
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="e.g. CS-BLR-2026-1002"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-sm text-[#162E51] placeholder:text-[#162E51]/40 focus:outline-none focus:border-[#005EA2] focus:bg-white"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="track-pin-input"
              className="block font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] mb-1.5"
            >
              Secret 4-Digit PIN
            </label>
            <input
              id="track-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-sm text-[#162E51] placeholder:text-[#162E51]/40 focus:outline-none focus:border-[#005EA2] focus:bg-white"
            />
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs font-bold uppercase tracking-wider shadow-sm disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Search className="w-4 h-4 shrink-0" />
              )}
              <span>{t.quickTrackBtn}</span>
            </button>
          </div>
        </form>

        {sampleComplaints.length > 0 && (
          <div className="pt-4 border-t border-[#162E51]/10 space-y-2">
            <p className="text-xs text-[#162E51]/65">
              {uiLang === 'hi'
                ? 'तुरंत परीक्षण हेतु काल्पनिक डेमो शिकायत चुनें (वास्तविक नागरिक शिकायतें पिन के बिना गोपनीय रहती हैं):'
                : 'One-click fictional sample tickets for demonstration (real citizen tickets remain strictly private):'}
            </p>
            <div className="flex flex-wrap gap-2">
              {sampleComplaints.map((sample) => (
                <button
                  key={sample.trackingCode}
                  type="button"
                  onClick={() => {
                    setTrackingCode(sample.trackingCode);
                    setPin(sample.demoPin);
                    fetchComplaint(sample.trackingCode, sample.demoPin);
                  }}
                  className="px-3 py-1.5 rounded-md text-xs bg-[#F8F9FA] text-[#162E51] border border-[#162E51]/15 hover:border-[#005EA2] hover:text-[#005EA2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="font-mono font-semibold text-[#005EA2] tabular-nums">
                    {sample.trackingCode}
                  </span>
                  <span className="text-[#162E51]/70"> · {sample.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-xs sm:text-sm text-red-900"
        >
          <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {verifySuccessMsg && (
        <div
          role="status"
          className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-xs sm:text-sm text-emerald-950"
        >
          <CheckCircle2 className="w-5 h-5 text-[#138808] shrink-0 mt-0.5" />
          <span>{verifySuccessMsg}</span>
        </div>
      )}

      {/* Unlocked Complaint Detail */}
      {detail && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#162E51]/12">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#162E51]/65">
                  <span className="font-bold text-[#005EA2] text-sm tabular-nums">
                    {detail.trackingCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {CATEGORY_LABELS[detail.category as CivicCategory]?.[uiLang] || detail.category}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Priority: {detail.priority}</span>
                  {detail.isSampleDemo && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#B45309]">Fictional Sample Record</span>
                    </>
                  )}
                </div>

                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#162E51]">
                  {detail.interpretedSummary}
                </h2>
              </div>

              <div className="shrink-0">
                {renderStatusState(detail.status, detail.isEscalated)}
              </div>
            </div>

            {detail.isEscalated && detail.status !== 'Resolved' && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-xs sm:text-sm text-red-900">
                <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#DC2626]">
                    Automatic SLA Escalation Active
                  </p>
                  <p className="text-red-900/85 mt-0.5">
                    This complaint exceeded its configured response deadline and has been flagged for Nodal Supervisory attention.
                  </p>
                </div>
              </div>
            )}

            {/* 4-Cell Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#F8F9FA] rounded-lg border border-[#162E51]/10 p-4">
                <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
                  Responsible Department
                </span>
                <span className="font-semibold text-[#162E51] text-sm block mt-1">
                  {detail.departmentName}
                </span>
                {detail.requiresManualAssignment && (
                  <span className="text-[#B45309] font-medium block mt-1">
                    Pending Manual Nodal Assignment
                  </span>
                )}
              </div>

              <div className="bg-[#F8F9FA] rounded-lg border border-[#162E51]/10 p-4">
                <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
                  Location &amp; Ward
                </span>
                <span className="font-semibold text-[#162E51] text-sm block mt-1">
                  {detail.locality}, {detail.city}
                </span>
                <span className="text-[#162E51]/65 block mt-0.5">{detail.wardName}</span>
              </div>

              <div className="bg-[#F8F9FA] rounded-lg border border-[#162E51]/10 p-4">
                <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
                  Submitted On
                </span>
                <span className="font-semibold text-[#162E51] text-sm tabular-nums block mt-1">
                  {new Date(detail.createdAt).toLocaleString()}
                </span>
                <span className="text-[#162E51]/65 block mt-0.5">
                  Assigned: {detail.assignedOfficerName || 'Awaiting Officer Claim'}
                </span>
              </div>

              <div className="bg-[#F8F9FA] rounded-lg border border-[#162E51]/10 p-4">
                <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
                  Expected SLA Deadline
                </span>
                <span className="font-semibold text-[#162E51] text-sm tabular-nums block mt-1">
                  {new Date(detail.slaDeadline).toLocaleString()}
                </span>
                <span className="text-[#162E51]/65 block mt-0.5">
                  {detail.classificationSource === 'ai'
                    ? 'AI Multilingual Triage'
                    : 'Rule-Based Fallback Triage'}
                </span>
              </div>
            </div>

            {/* Original Citizen Text & Duplicate Cluster */}
            <div className="pt-2 space-y-2">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2]">
                Original Submitted Text ({detail.language.toUpperCase()}):
              </p>
              <p className="text-sm text-[#162E51] bg-[#F8F9FA] p-4 rounded-lg border border-[#162E51]/12 whitespace-pre-line">
                {detail.rawDescription}
              </p>
              {detail.duplicateOfTrackingCode && (
                <p className="text-xs text-[#162E51]/75">
                  Grouped with primary neighborhood report{' '}
                  <span className="font-mono text-[#005EA2] font-semibold">
                    {detail.duplicateOfTrackingCode}
                  </span>{' '}
                  (your individual Tracking ID remains active).
                </p>
              )}
              {detail.linkedDuplicateCodes && detail.linkedDuplicateCodes.length > 0 && (
                <p className="text-xs text-[#162E51]/75">
                  Primary cluster ticket ({detail.duplicateClusterCount} total reports in locality:{' '}
                  <span className="font-mono text-[#005EA2] font-semibold">
                    {detail.linkedDuplicateCodes.join(', ')}
                  </span>
                  ).
                </p>
              )}
            </div>

            {/* Evidence Gallery */}
            {detail.evidence.length > 0 && (
              <div className="pt-4 border-t border-[#162E51]/12 space-y-3">
                <h3 className="font-display text-xl font-bold text-[#162E51]">
                  Uploaded Visual Evidence (Before &amp; After)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {detail.evidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-[#162E51]/12 overflow-hidden bg-[#F8F9FA]"
                    >
                      <div className="h-52 w-full bg-white">
                        <CivicImage
                          src={ev.imageUrl}
                          alt={ev.caption || ev.stage}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3 text-xs flex items-center justify-between gap-2 border-t border-[#162E51]/12">
                        <span className="font-mono font-bold text-[#005EA2] uppercase tracking-wider">
                          {ev.stage === 'submission_before'
                            ? 'Before Photo (Citizen)'
                            : ev.stage === 'resolution_after'
                              ? 'After Repair Photo (Officer)'
                              : 'Follow-Up Proof (Citizen)'}
                        </span>
                        <span className="tabular-nums text-[#162E51]/60">
                          {new Date(ev.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Citizen Resolution Verification Panel */}
          {detail.status === 'Resolved' && detail.resolutionVerifiedStatus !== 'confirmed' && (
            <div className="bg-white rounded-xl border border-[#005EA2]/35 p-6 sm:p-8 space-y-5">
              <div>
                <h3 className="font-display text-2xl font-bold text-[#162E51]">
                  {uiLang === 'hi'
                    ? 'नागरिक समाधान सत्यापन'
                    : 'Verify Municipal Resolution on Ground'}
                </h3>
                <p className="text-sm text-[#162E51]/75 mt-1">
                  {uiLang === 'hi'
                    ? 'अधिकारी ने इस शिकायत को समाधान पूर्ण (Resolved) चिह्नित किया है। कृपया पुष्टि करें कि समस्या हल हो गई है, या यदि समस्या बनी हुई है तो इसे पुनः खोलें।'
                    : 'The assigned department marked this issue Resolved. Confirm if the repair is complete, or reopen the complaint if the problem persists.'}
                </p>
              </div>

              <div className="inline-flex p-1 rounded-lg border border-[#162E51]/15 bg-[#F8F9FA]">
                <button
                  type="button"
                  onClick={() => setVerifyMode('confirmed')}
                  className={`px-4 py-2 rounded-md text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    verifyMode === 'confirmed'
                      ? 'bg-[#138808] text-white'
                      : 'text-[#162E51]/70 hover:text-[#162E51]'
                  }`}
                >
                  Confirm Issue Resolved
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyMode('reopened')}
                  className={`px-4 py-2 rounded-md text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    verifyMode === 'reopened'
                      ? 'bg-[#DC2626] text-white'
                      : 'text-[#162E51]/70 hover:text-[#162E51]'
                  }`}
                >
                  Report Unresolved (Reopen)
                </button>
              </div>

              <form onSubmit={handleSubmitVerification} className="space-y-4">
                {verifyMode === 'confirmed' && (
                  <div>
                    <span className="block text-xs font-semibold text-[#162E51] mb-1.5">
                      Satisfaction Rating
                    </span>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs tabular-nums cursor-pointer ${
                            rating >= star
                              ? 'bg-[#FF9933] border-[#FF9933] text-[#162E51] font-bold'
                              : 'bg-[#F8F9FA] border-[#162E51]/20 text-[#162E51]/60'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span>{star}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="verify-comment"
                    className="block text-xs font-semibold text-[#162E51] mb-1.5"
                  >
                    {verifyMode === 'confirmed'
                      ? 'Verification Feedback'
                      : 'Why is the issue still unresolved? *'}
                  </label>
                  <textarea
                    id="verify-comment"
                    rows={2}
                    required={verifyMode === 'reopened'}
                    value={verifyComment}
                    onChange={(e) => setVerifyComment(e.target.value)}
                    placeholder={
                      verifyMode === 'confirmed'
                        ? 'e.g. Road surface has been leveled and water puddle is gone.'
                        : 'e.g. Pothole was only loosely filled with gravel and washed away again.'
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-sm text-[#162E51] placeholder:text-[#162E51]/40 focus:outline-none focus:border-[#005EA2] focus:bg-white"
                  />
                </div>

                {verifyMode === 'reopened' && (
                  <div>
                    {!reopenImageUri ? (
                      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F8F9FA] border border-dashed border-[#162E51]/25 text-xs font-medium text-[#162E51] hover:border-[#005EA2] hover:text-[#005EA2] cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>Attach Current Spot Photo (Optional)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleReopenPhotoUpload}
                          className="sr-only"
                        />
                      </label>
                    ) : (
                      <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-lg border border-[#162E51]/20 bg-[#F8F9FA]">
                        <span className="text-xs font-semibold text-[#138808]">
                          Follow-up photo attached
                        </span>
                        <button
                          type="button"
                          onClick={() => setReopenImageUri(null)}
                          className="text-[#162E51]/60 hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={verifying}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded text-xs font-bold uppercase tracking-wider text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      verifyMode === 'confirmed'
                        ? 'bg-[#138808] hover:bg-emerald-800'
                        : 'bg-[#DC2626] hover:bg-red-700'
                    }`}
                  >
                    {verifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : verifyMode === 'confirmed' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>
                      {verifyMode === 'confirmed'
                        ? 'Submit Citizen Confirmation'
                        : 'Reopen & Escalate Grievance'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {detail.resolutionVerifiedStatus === 'confirmed' && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-xs sm:text-sm text-emerald-950">
              <CheckCircle2 className="w-5 h-5 text-[#138808] shrink-0" />
              <span className="font-semibold">
                Resolution Verified by Citizen — This grievance is closed with confirmed citizen satisfaction.
              </span>
            </div>
          )}

          {/* Timestamped Status History & Notification Ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-4">
              <h3 className="font-display text-xl font-bold text-[#162E51]">
                Timestamped Status History
              </h3>
              <ol className="space-y-4">
                {detail.history.map((item) => (
                  <li
                    key={item.id}
                    className="pb-4 border-b border-[#162E51]/10 last:border-b-0 last:pb-0 space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#162E51]">
                        {item.previousStatus ? `${item.previousStatus} → ` : ''}
                        {item.newStatus} · {item.actorName}
                      </span>
                      <span className="font-mono tabular-nums text-[#162E51]/55">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-[#162E51]/75">{item.comment}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lg:col-span-5 bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-4">
              <h3 className="font-display text-xl font-bold text-[#162E51]">
                Citizen Notification Ledger
              </h3>
              <ul className="space-y-3">
                {detail.notifications.map((n) => (
                  <li
                    key={n.id}
                    className="pb-3 border-b border-[#162E51]/10 last:border-b-0 last:pb-0 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#162E51]">{n.subject}</span>
                      <span className="font-mono tabular-nums text-[#162E51]/55">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[#162E51]/75">{n.message}</p>
                    <p className="text-[#162E51]/50">
                      Recipient: {n.recipientMasked} ·{' '}
                      {n.deliveryState === 'logged_no_external_provider'
                        ? 'Portal Log (No external SMS credentials)'
                        : 'Portal Update Delivered'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
