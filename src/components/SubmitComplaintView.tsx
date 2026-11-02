import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Mic,
  Square,
  Upload,
  Trash2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { CivicImage, compressImageFile } from './CivicImage.tsx';
import { safeFetchJson } from '../lib/apiClient.ts';
import {
  CIVIC_CATEGORIES,
  COMPLAINT_PRIORITIES,
  SUPPORTED_INPUT_LANGUAGES,
  type CivicCategory,
  type ComplaintPriority,
  type InputLanguageCode,
  type TriageResult,
  type UiLanguage,
  type WardRecord,
} from '../types/civic.ts';
import { CATEGORY_LABELS, PRIORITY_LABELS, UI_COPY } from '../i18n/translations.ts';
import {
  MUNICIPAL_CITIES,
  ORDERED_STATES_UTS,
  getCategoryMetadata,
  getCityMetadata,
  matchVerifiedLocalityToWard,
} from '../data/municipalDirectory.ts';

const UNLISTED_LOCALITY_VALUE = '__UNLISTED_LOCALITY__';

interface SubmitComplaintViewProps {
  uiLang: UiLanguage;
  wards: WardRecord[];
  initialCity?: string;
  initialLocality?: string;
  onComplaintRegistered: () => void;
  onOpenTracker: (trackingCode: string, pin: string) => void;
}

interface RegistrationReceipt {
  trackingCode: string;
  accessPin: string;
  departmentName: string;
  wardName: string;
  slaDeadline: string;
  requiresManualAssignment: boolean;
}

export const SubmitComplaintView: React.FC<SubmitComplaintViewProps> = ({
  uiLang,
  wards,
  initialCity,
  initialLocality,
  onComplaintRegistered,
  onOpenTracker,
}) => {
  const t = UI_COPY[uiLang];

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [languageCode, setLanguageCode] = useState<InputLanguageCode>('hi');
  const [description, setDescription] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [city, setCity] = useState(initialCity || 'Chandigarh');
  const [locality, setLocality] = useState(initialLocality || 'Sector 17 Plaza');
  const [customLocality, setCustomLocality] = useState('');
  const [landmark, setLandmark] = useState('');
  const [categoryOverride, setCategoryOverride] = useState<string>('');
  const [citizenName, setCitizenName] = useState('');
  const [citizenPhone, setCitizenPhone] = useState('');
  const [citizenEmail, setCitizenEmail] = useState('');
  const [beforeImageUri, setBeforeImageUri] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const browserSpeechRef = useRef<{ stop: () => void } | null>(null);
  const browserTranscriptRef = useRef<string>('');
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      browserSpeechRef.current?.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const [analyzing, setAnalyzing] = useState(false);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [editableSummary, setEditableSummary] = useState('');
  const [confirmedCategory, setConfirmedCategory] = useState<CivicCategory>('Water Supply');
  const [confirmedPriority, setConfirmedPriority] = useState<ComplaintPriority>('Medium');
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [selectedDuplicateCode, setSelectedDuplicateCode] = useState<string | null>(null);
  const [citizenConfirmedCheck, setCitizenConfirmedCheck] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredCityEntries = useMemo(() => {
    if (stateFilter === 'ALL') return MUNICIPAL_CITIES;
    return MUNICIPAL_CITIES.filter((c) => c.stateUt === stateFilter);
  }, [stateFilter]);

  const selectedCityMeta = useMemo(() => getCityMetadata(city), [city]);

  const cityWards = useMemo(() => {
    const dbMatching = wards.filter((w) => w.city.toLowerCase() === city.toLowerCase());
    if (dbMatching.length > 0) return dbMatching;
    if (!selectedCityMeta) return [];
    return selectedCityMeta.wards.map((w, idx) => ({
      id: idx + 1,
      city: selectedCityMeta.city,
      municipalBody: w.municipalBodyOverride || selectedCityMeta.municipalBodyShort,
      wardNumber: w.wardNumber,
      wardName: w.wardName,
      wardCode: w.wardCode,
      verifiedLocalities: w.localities.join(', '),
      zoneName: w.zoneName,
    }));
  }, [wards, city, selectedCityMeta]);

  const wardLocalityGroups = useMemo(() => {
    return cityWards.map((w) => ({
      wardCode: w.wardCode,
      wardHeading: `Ward ${w.wardNumber} · ${w.wardName} (${w.zoneName})`,
      localities: w.verifiedLocalities
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }));
  }, [cityWards]);

  const effectiveLocality = useMemo(() => {
    if (locality === UNLISTED_LOCALITY_VALUE) {
      return customLocality.trim() || 'Unlisted Locality';
    }
    return locality.trim();
  }, [locality, customLocality]);

  const verifiedWardMatch = useMemo(() => {
    if (locality === UNLISTED_LOCALITY_VALUE && !customLocality.trim()) {
      return null;
    }
    return matchVerifiedLocalityToWard(cityWards, effectiveLocality);
  }, [cityWards, locality, customLocality, effectiveLocality]);

  const handleCityChange = (nextCity: string, preferredLocality?: string) => {
    setCity(nextCity);
    setCustomLocality('');
    const meta = getCityMetadata(nextCity);
    const dbMatching = wards.filter((w) => w.city.toLowerCase() === nextCity.toLowerCase());
    const firstFromDb = dbMatching[0]?.verifiedLocalities.split(',')[0]?.trim();
    const firstFromMeta = meta?.wards[0]?.localities[0];
    setLocality(preferredLocality || firstFromDb || firstFromMeta || '');
  };

  const handleStateFilterChange = (nextState: string) => {
    setStateFilter(nextState);
    if (nextState !== 'ALL') {
      const stateCities = MUNICIPAL_CITIES.filter((c) => c.stateUt === nextState);
      if (stateCities.length > 0 && !stateCities.some((c) => c.city === city)) {
        handleCityChange(stateCities[0].city);
      }
    }
  };

  useEffect(() => {
    if (initialCity) {
      const meta = getCityMetadata(initialCity);
      if (meta) {
        setStateFilter(meta.stateUt);
      } else {
        setStateFilter('ALL');
      }
      handleCityChange(initialCity, initialLocality || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCity, initialLocality]);

  const handleUseSamplePhrase = () => {
    const langObj = SUPPORTED_INPUT_LANGUAGES.find((l) => l.code === languageCode);
    if (langObj) {
      setDescription(langObj.samplePrompt);
      setErrorMessage(null);
    }
  };

  const startVoiceRecording = async () => {
    setErrorMessage(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMessage(
        uiLang === 'hi'
          ? 'इस ब्राउज़र में माइक्रोफ़ोन रिकॉर्डिंग समर्थित नहीं है।'
          : 'Microphone recording is not supported in this browser.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const candidateMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ];
      const supportedMime =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? candidateMimes.find((m) => MediaRecorder.isTypeSupported(m))
          : undefined;

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      browserTranscriptRef.current = '';

      // Start optional browser speech recognition in parallel strictly as a backup if server quota is exhausted
      try {
        const speechLangMap: Record<InputLanguageCode, string> = {
          hi: 'hi-IN',
          hinglish: 'en-IN',
          en: 'en-IN',
          mr: 'mr-IN',
          pa: 'pa-IN',
          ta: 'ta-IN',
          bn: 'bn-IN',
          te: 'te-IN',
        };
        const w = window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult: ((ev: { results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }> }) => void) | null;
            onerror: (() => void) | null;
            start: () => void;
            stop: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult: ((ev: { results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }> }) => void) | null;
            onerror: (() => void) | null;
            start: () => void;
            stop: () => void;
          };
        };
        const SpeechCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (SpeechCtor) {
          const rec = new SpeechCtor();
          rec.lang = speechLangMap[languageCode] || 'hi-IN';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (ev) => {
            const parts: string[] = [];
            for (let i = 0; i < ev.results.length; i++) {
              const tPart = ev.results[i]?.[0]?.transcript?.trim();
              if (tPart) parts.push(tPart);
            }
            if (parts.length > 0) {
              browserTranscriptRef.current = parts.join(' ').trim();
            }
          };
          rec.onerror = () => {
            /* ignore — server transcription is primary */
          };
          rec.start();
          browserSpeechRef.current = rec;
        }
      } catch {
        /* ignore optional browser speech backup errors */
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        browserSpeechRef.current?.stop();
        browserSpeechRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const effectiveMime = (recorder.mimeType || supportedMime || 'audio/webm').split(';')[0].trim();
        const blob = new Blob(chunksRef.current, { type: effectiveMime || 'audio/webm' });

        if (blob.size < 100) {
          if (browserTranscriptRef.current) {
            const fallbackText = browserTranscriptRef.current;
            setDescription((prev) => (prev.trim() ? `${prev.trim()} ${fallbackText}` : fallbackText));
            return;
          }
          setErrorMessage(
            uiLang === 'hi'
              ? 'रिकॉर्डिंग बहुत छोटी थी। कृपया माइक के पास स्पष्ट रूप से बोलें और पुनः प्रयास करें।'
              : 'Recording was too brief. Please speak clearly for at least 1–2 seconds and try again.'
          );
          return;
        }

        setTranscribing(true);
        try {
          let base64Audio = '';
          let uploadMime = effectiveMime || 'audio/webm';

          // Convert recorded audio to universal 16kHz mono PCM WAV for maximum Speech-to-Text compatibility
          try {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
              const arrayBuf = await blob.arrayBuffer();
              const decodeCtx = new AudioCtx();
              try {
                const decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
                const targetRate = 16000;
                const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
                const offline = new OfflineAudioContext(1, frameCount, targetRate);
                const src = offline.createBufferSource();
                src.buffer = decoded;
                src.connect(offline.destination);
                src.start(0);
                const rendered = await offline.startRendering();
                const samples = rendered.getChannelData(0);

                const dataBytes = samples.length * 2;
                const wavBuffer = new ArrayBuffer(44 + dataBytes);
                const view = new DataView(wavBuffer);
                const writeStr = (offset: number, str: string) => {
                  for (let i = 0; i < str.length; i++) {
                    view.setUint8(offset + i, str.charCodeAt(i));
                  }
                };
                writeStr(0, 'RIFF');
                view.setUint32(4, 36 + dataBytes, true);
                writeStr(8, 'WAVEfmt ');
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true);
                view.setUint16(22, 1, true);
                view.setUint32(24, targetRate, true);
                view.setUint32(28, targetRate * 2, true);
                view.setUint16(32, 2, true);
                view.setUint16(34, 16, true);
                writeStr(36, 'data');
                view.setUint32(40, dataBytes, true);

                for (let i = 0; i < samples.length; i++) {
                  const s = Math.max(-1, Math.min(1, samples[i]));
                  view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
                }

                const wavBytes = new Uint8Array(wavBuffer);
                let binary = '';
                const chunkSize = 0x8000;
                for (let i = 0; i < wavBytes.length; i += chunkSize) {
                  binary += String.fromCharCode(...wavBytes.subarray(i, i + chunkSize));
                }
                base64Audio = window.btoa(binary);
                uploadMime = 'audio/wav';
              } finally {
                await decodeCtx.close().catch(() => {});
              }
            }
          } catch {
            // Fallback to original MediaRecorder blob encoding below
          }

          if (!base64Audio) {
            base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('Failed to read audio recording.'));
              reader.onloadend = () => {
                const res = String(reader.result || '');
                const commaIdx = res.indexOf(',');
                resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
              };
              reader.readAsDataURL(blob);
            });
          }

          const data = await safeFetchJson<{ transcript: string }>(
            '/api/ai/transcribe',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Audio,
                mimeType: uploadMime,
                languageCode,
              }),
            },
            { fallbackError: 'Voice transcription failed.' }
          );
          setDescription((prev) =>
            prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript
          );
        } catch (err: unknown) {
          if (browserTranscriptRef.current) {
            const fallbackText = browserTranscriptRef.current;
            setDescription((prev) => (prev.trim() ? `${prev.trim()} ${fallbackText}` : fallbackText));
          } else {
            setErrorMessage(
              err instanceof Error ? err.message : 'Unable to transcribe recorded audio.'
            );
          }
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 40) {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
            setIsRecording(false);
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setErrorMessage(
          uiLang === 'hi'
            ? 'माइक्रोफ़ोन अनुमति अस्वीकृत है। कृपया ब्राउज़र में माइक की अनुमति दें और पुनः प्रयास करें।'
            : 'Microphone permission was blocked. Please allow microphone access in your browser settings and try again.'
        );
      } else {
        setErrorMessage(
          err instanceof Error
            ? `Microphone access unavailable: ${err.message}`
            : 'Could not access microphone.'
        );
      }
    }
  };

  const stopVoiceRecording = () => {
    browserSpeechRef.current?.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    try {
      const compressed = await compressImageFile(file);
      setBeforeImageUri(compressed);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not process selected photo.');
    }
  };

  const runAiTriage = async (extraFollowUp?: string) => {
    setErrorMessage(null);
    if (description.trim().length < 5) {
      setErrorMessage(
        uiLang === 'hi'
          ? 'कृपया अपनी समस्या का कम से कम एक वाक्य में वर्णन करें।'
          : 'Please describe your civic issue (at least 5 characters).'
      );
      return;
    }
    if (!citizenName.trim() || citizenName.trim().length < 2) {
      setErrorMessage(
        uiLang === 'hi'
          ? 'कृपया शिकायत पावती के लिए अपना नाम दर्ज करें।'
          : 'Please enter your name for the grievance receipt.'
      );
      return;
    }
    if (!effectiveLocality || (locality === UNLISTED_LOCALITY_VALUE && customLocality.trim().length < 2)) {
      setErrorMessage(
        uiLang === 'hi'
          ? 'कृपया अपना मोहल्ला / सेक्टर चुनें या नाम लिखें।'
          : 'Please select a verified locality or enter your neighborhood name.'
      );
      return;
    }

    setAnalyzing(true);
    try {
      const triageData = await safeFetchJson<TriageResult>(
        '/api/ai/classify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: description.trim(),
            languageCode,
            city,
            locality: effectiveLocality,
            followUpContext: extraFollowUp ?? followUpAnswer,
            categoryOverride: categoryOverride || undefined,
          }),
        },
        { fallbackError: 'Classification request failed.' }
      );
      setTriage(triageData);
      setEditableSummary(triageData.interpretedSummaryEn);
      setConfirmedCategory(triageData.category);
      setConfirmedPriority(triageData.priority);
      if (triageData.potentialDuplicates.length > 0) {
        setSelectedDuplicateCode(triageData.potentialDuplicates[0].trackingCode);
      } else {
        setSelectedDuplicateCode(null);
      }
      setCitizenConfirmedCheck(false);
      setStep(2);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to analyze complaint.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!triage) return;
    if (!citizenConfirmedCheck) {
      setErrorMessage(
        uiLang === 'hi'
          ? 'पंजीकरण से पहले कृपया व्याख्यायित सारांश और विभाग की पुष्टि करें।'
          : 'Please check the confirmation box verifying the interpreted summary and department.'
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const fullRawDescription = followUpAnswer.trim()
        ? `${description.trim()}\n[Follow-up Details]: ${followUpAnswer.trim()}`
        : description.trim();

      const data = await safeFetchJson<RegistrationReceipt>(
        '/api/complaints',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: languageCode,
            rawDescription: fullRawDescription,
            interpretedSummary: editableSummary.trim() || triage.interpretedSummaryEn,
            category: confirmedCategory,
            priority: confirmedPriority,
            priorityReason: triage.priorityReason,
            classificationSource: triage.classificationSource,
            city,
            locality: effectiveLocality,
            landmark: landmark.trim() || null,
            citizenName: citizenName.trim(),
            citizenPhone: citizenPhone.trim() || null,
            citizenEmail: citizenEmail.trim() || null,
            duplicateOfTrackingCode: selectedDuplicateCode,
            beforeImageDataUri: beforeImageUri,
          }),
        },
        { fallbackError: 'Failed to register grievance.' }
      );
      setReceipt(data);
      setStep(3);
      onComplaintRegistered();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyReceipt = async () => {
    if (!receipt) return;
    const text = `CivicSaathi AI Complaint ID: ${receipt.trackingCode} | Secret PIN: ${receipt.accessPin}`;
    await navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  const resetForm = () => {
    setStep(1);
    setDescription('');
    setLandmark('');
    setFollowUpAnswer('');
    setBeforeImageUri(null);
    setTriage(null);
    setReceipt(null);
    setErrorMessage(null);
  };

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-sm text-[#162E51] placeholder:text-[#162E51]/45 focus:outline-none focus:border-[#005EA2] focus:bg-white transition-colors';
  const selectClass =
    'w-full px-3.5 py-2.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-sm text-[#162E51] focus:outline-none focus:border-[#005EA2] focus:bg-white transition-colors';
  const optionClass = 'bg-white text-[#162E51]';

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] block mb-1">
          {uiLang === 'hi' ? 'नागरिक शिकायत पंजीकरण' : 'Multilingual Grievance Filing'}
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#162E51]">
          {t.submitTitle}
        </h1>
        <p className="text-sm text-[#162E51]/70 mt-1.5">{t.submitSub}</p>

        {/* Step Indicator */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 rounded-lg overflow-hidden border border-[#162E51]/15 bg-white text-xs">
          <div
            className={`px-4 py-3 border-b sm:border-b-0 sm:border-r border-[#162E51]/12 ${
              step === 1
                ? 'bg-[#005EA2] text-white font-bold'
                : 'bg-[#F8F9FA] text-[#162E51]/65 font-medium'
            }`}
          >
            01. {uiLang === 'hi' ? 'विवरण एवं स्थान' : 'Describe & Locate'}
          </div>
          <div
            className={`px-4 py-3 border-b sm:border-b-0 sm:border-r border-[#162E51]/12 ${
              step === 2
                ? 'bg-[#005EA2] text-white font-bold'
                : 'bg-[#F8F9FA] text-[#162E51]/65 font-medium'
            }`}
          >
            02. {uiLang === 'hi' ? 'एआई समीक्षा एवं पुष्टि' : 'AI Review & Confirm'}
          </div>
          <div
            className={`px-4 py-3 ${
              step === 3
                ? 'bg-[#138808] text-white font-bold'
                : 'bg-[#F8F9FA] text-[#162E51]/65 font-medium'
            }`}
          >
            03. {uiLang === 'hi' ? 'शिकायत आईडी एवं पिन' : 'Tracking ID & PIN'}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-xs sm:text-sm text-red-900"
        >
          <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: INPUT & EVIDENCE */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 sm:p-8 space-y-7">
          {/* Language & Voice Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="input-lang"
                className="block font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] mb-1.5"
              >
                {uiLang === 'hi' ? 'शिकायत की भाषा चुनें' : 'Preferred Input Language'}
              </label>
              <select
                id="input-lang"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value as InputLanguageCode)}
                className={selectClass}
              >
                {SUPPORTED_INPUT_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className={optionClass}>
                    {uiLang === 'hi' ? lang.labelHi : lang.labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <div className="flex flex-wrap items-center gap-2.5">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    disabled={transcribing}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-[#005EA2] text-[#005EA2] text-xs font-bold uppercase tracking-wider hover:bg-[#005EA2] hover:text-white disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {transcribing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{uiLang === 'hi' ? 'आवाज़ लिखी जा रही है...' : 'Transcribing...'}</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 shrink-0" />
                        <span>{uiLang === 'hi' ? 'बोलकर शिकायत दर्ज करें' : 'Record Voice'}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#DC2626] text-white text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Square className="w-4 h-4 shrink-0" />
                    <span className="tabular-nums">Stop ({recordingSeconds}s)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleUseSamplePhrase}
                  className="px-3.5 py-2.5 rounded-lg text-xs font-medium text-[#162E51] bg-[#F8F9FA] border border-[#162E51]/20 hover:border-[#005EA2] hover:text-[#005EA2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {uiLang === 'hi' ? 'उदाहरण वाक्य भरें' : 'Insert Sample Phrase'}
                </button>
              </div>
            </div>
          </div>

          {/* Complaint Textarea */}
          <div>
            <label
              htmlFor="complaint-desc"
              className="block font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] mb-1.5"
            >
              {uiLang === 'hi'
                ? 'समस्या का विवरण (अपनी भाषा या हिंग्लिश में लिखें)'
                : 'Grievance Description (Hindi, English, Hinglish, or Regional Script)'}
            </label>
            <textarea
              id="complaint-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                SUPPORTED_INPUT_LANGUAGES.find((l) => l.code === languageCode)?.samplePrompt ||
                'Describe the civic issue, street location, and urgency...'
              }
              className={inputClass}
            />
            <p className="text-xs text-[#162E51]/60 mt-1.5">
              {uiLang === 'hi'
                ? 'एआई आपकी शिकायत का अर्थ समझकर श्रेणी और जिम्मेदार विभाग का सुझाव देगा।'
                : 'AI interprets regional phrasing, identifies the civic category, and checks for existing complaints in your ward.'}
            </p>
          </div>

          {/* Municipal Body, Verified Locality & Category Section */}
          <div className="pt-5 border-t border-[#162E51]/12 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2]">
                {uiLang === 'hi'
                  ? 'नगर निकाय, सत्यापित सेक्टर/मोहल्ला एवं श्रेणी सत्यापन'
                  : 'Municipal Body, Locality & Grievance Category Verification'}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'Chandigarh (MCC)', cityVal: 'Chandigarh' },
                  { label: 'Gurugram (MCG)', cityVal: 'Gurugram' },
                  { label: 'Faridabad (MCF)', cityVal: 'Faridabad' },
                  { label: 'Panchkula (MCP)', cityVal: 'Panchkula' },
                  { label: 'Jaipur (JMC)', cityVal: 'Jaipur' },
                  { label: 'Udaipur (UMC)', cityVal: 'Udaipur' },
                  { label: 'New Delhi (MCD)', cityVal: 'New Delhi' },
                ].map((quick) => (
                  <button
                    key={quick.cityVal}
                    type="button"
                    onClick={() => {
                      setStateFilter('ALL');
                      handleCityChange(quick.cityVal);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                      city === quick.cityVal
                        ? 'bg-[#005EA2] text-white border-[#005EA2]'
                        : 'bg-[#F8F9FA] text-[#162E51]/75 border-[#162E51]/15 hover:border-[#005EA2] hover:text-[#005EA2]'
                    }`}
                  >
                    {quick.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="state-filter-select"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi' ? 'राज्य / केंद्र शासित प्रदेश' : 'State / Union Territory'}
                </label>
                <select
                  id="state-filter-select"
                  value={stateFilter}
                  onChange={(e) => handleStateFilterChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="ALL" className={optionClass}>
                    {uiLang === 'hi'
                      ? `संपूर्ण भारत (${MUNICIPAL_CITIES.length} नगर निकाय)`
                      : `All States & UTs (${MUNICIPAL_CITIES.length} ULBs)`}
                  </option>
                  {ORDERED_STATES_UTS.map((st) => {
                    const count = MUNICIPAL_CITIES.filter((c) => c.stateUt === st.stateUt).length;
                    return (
                      <option key={st.stateUt} value={st.stateUt} className={optionClass}>
                        {uiLang === 'hi' ? st.stateUtHi : st.stateUt} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label
                  htmlFor="city-select"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi' ? 'शहर / नगर निगम चुनें' : 'City & Municipal Body'}
                </label>
                <select
                  id="city-select"
                  value={city}
                  onChange={(e) => handleCityChange(e.target.value)}
                  className={selectClass}
                >
                  {stateFilter === 'ALL'
                    ? ORDERED_STATES_UTS.map((st) => {
                        const groupCities = MUNICIPAL_CITIES.filter(
                          (c) => c.stateUt === st.stateUt
                        );
                        return (
                          <optgroup
                            key={st.stateUt}
                            label={uiLang === 'hi' ? `${st.stateUtHi} (${st.stateUt})` : st.stateUt}
                          >
                            {groupCities.map((c) => (
                              <option key={c.city} value={c.city} className={optionClass}>
                                {uiLang === 'hi'
                                  ? `${c.cityHi} (${c.city}) — ${c.municipalBodyShort}`
                                  : `${c.city} — ${c.municipalBodyShort}`}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })
                    : filteredCityEntries.map((c) => (
                        <option key={c.city} value={c.city} className={optionClass}>
                          {uiLang === 'hi'
                            ? `${c.cityHi} (${c.city}) — ${c.municipalBodyShort}`
                            : `${c.city} — ${c.municipalBodyShort}`}
                        </option>
                      ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="locality-select"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi'
                    ? 'सत्यापित सेक्टर / मोहल्ला / वार्ड क्षेत्र'
                    : 'Verified Sector / Locality (Grouped by Ward)'}
                </label>
                <select
                  id="locality-select"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className={selectClass}
                >
                  {wardLocalityGroups.map((grp) => (
                    <optgroup key={grp.wardCode} label={grp.wardHeading}>
                      {grp.localities.map((loc) => (
                        <option key={`${grp.wardCode}-${loc}`} value={loc} className={optionClass}>
                          {loc}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={UNLISTED_LOCALITY_VALUE} className={optionClass}>
                    {uiLang === 'hi'
                      ? 'अन्य / असूचीबद्ध क्षेत्र — अपना मोहल्ला लिखें (नोडल वार्ड सत्यापन)'
                      : 'Other / Unlisted Locality — Enter Custom Area Name'}
                  </option>
                </select>
              </div>
            </div>

            {locality === UNLISTED_LOCALITY_VALUE && (
              <div>
                <label
                  htmlFor="custom-locality-input"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi'
                    ? 'अपने मोहल्ले / सेक्टर / कॉलोनी का नाम लिखें *'
                    : 'Enter Your Neighborhood / Sector / Colony Name *'}
                </label>
                <input
                  id="custom-locality-input"
                  type="text"
                  value={customLocality}
                  onChange={(e) => setCustomLocality(e.target.value)}
                  placeholder={
                    uiLang === 'hi'
                      ? `उदा. ${city} का सेक्टर, कॉलोनी या गाँव का नाम`
                      : `e.g. Exact sector, colony, or urban village in ${city}`
                  }
                  className={inputClass}
                />
              </div>
            )}

            {/* Live Municipal Body & Ward Verification Readout */}
            <div className="p-3.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/12 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
                  {uiLang === 'hi' ? 'सत्यापित नगर निकाय' : 'Verified Municipal Authority'}
                </span>
                <p className="font-semibold text-[#162E51] mt-0.5">
                  {selectedCityMeta
                    ? `${selectedCityMeta.municipalBodyFull} · ${selectedCityMeta.stateUt}`
                    : `${city} Municipal Body`}
                </p>
                {selectedCityMeta && (
                  <p className="text-[#162E51]/65 mt-0.5">
                    {uiLang === 'hi' ? 'नागरिक हेल्पलाइन:' : 'Civic Helpline:'}{' '}
                    <span className="font-mono font-semibold text-[#162E51]/85">
                      {selectedCityMeta.civicHelpline}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
                  {uiLang === 'hi' ? 'मोहल्ला एवं वार्ड सत्यापन स्थिति' : 'Locality & Ward Verification'}
                </span>
                {verifiedWardMatch ? (
                  <div className="mt-0.5 space-y-0.5">
                    <p className="inline-flex items-center gap-1.5 font-semibold text-[#138808]">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {uiLang === 'hi' ? 'सत्यापित क्षेत्र:' : 'Verified:'} Ward{' '}
                        {verifiedWardMatch.wardNumber} — {verifiedWardMatch.wardName}
                      </span>
                    </p>
                    <p className="text-[#162E51]/65">
                      {verifiedWardMatch.zoneName} · {verifiedWardMatch.municipalBody} (
                      {verifiedWardMatch.wardCode})
                    </p>
                  </div>
                ) : (
                  <div className="mt-0.5 space-y-0.5">
                    <p className="inline-flex items-center gap-1.5 font-semibold text-[#B45309]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {uiLang === 'hi'
                          ? 'असूचीबद्ध क्षेत्र — नोडल अधिकारी द्वारा मैनुअल वार्ड आवंटन'
                          : 'Unlisted Area — Queued for Manual Nodal Ward Verification'}
                      </span>
                    </p>
                    <p className="text-[#162E51]/65">
                      {uiLang === 'hi'
                        ? 'सटीक पहचान चिह्न (Landmark) जोड़ने से वार्ड इंजीनियर तुरंत स्थान खोज सकेंगे।'
                        : 'Include a clear nearby landmark below for accurate field crew dispatch.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Category Override & Verified Scope */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div>
                <label
                  htmlFor="cat-hint"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi'
                    ? 'शिकायत श्रेणी (वैकल्पिक — एआई स्वतः पहचानेगा)'
                    : 'Grievance Category (Optional — Auto-Detected by AI)'}
                </label>
                <select
                  id="cat-hint"
                  value={categoryOverride}
                  onChange={(e) => setCategoryOverride(e.target.value)}
                  className={selectClass}
                >
                  <option value="" className={optionClass}>
                    {uiLang === 'hi'
                      ? 'एआई द्वारा स्वतः पहचानें (सभी 12 सत्यापित श्रेणियाँ)'
                      : 'Auto-detect via AI Triage (All 12 Verified Categories)'}
                  </option>
                  {CIVIC_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} className={optionClass}>
                      {CATEGORY_LABELS[cat][uiLang]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-[#F8F9FA] border border-[#162E51]/12 text-xs">
                {categoryOverride ? (
                  (() => {
                    const meta = getCategoryMetadata(categoryOverride);
                    return (
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[#162E51]">
                          {uiLang === 'hi' ? meta.departmentNameHi : meta.departmentNameEn}{' '}
                          <span className="font-mono text-[#005EA2]">
                            (Critical {meta.slaCriticalHours}h · Std {meta.slaMediumHours}h SLA)
                          </span>
                        </p>
                        <p className="text-[#162E51]/70">
                          {uiLang === 'hi' ? meta.verifiedScopeHi : meta.verifiedScopeEn}
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-[#162E51]/70 leading-relaxed">
                    {uiLang === 'hi'
                      ? '12 सत्यापित नगर श्रेणियाँ सक्रिय: जलापूर्ति, सीवेज/नाला, सड़क, स्वच्छता, स्ट्रीटलाइट, बिजली, पार्क/वृक्ष, अतिक्रमण, आवारा पशु, फॉगिंग/जन-स्वास्थ्य, जन-सुरक्षा व अन्य।'
                      : '12 verified municipal categories active: Water, Drainage/Sewage, Roads, Sanitation, Streetlights, Electricity, Parks & Trees, Encroachment, Stray Cattle/Animals, Fogging/Health, Safety & General.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="landmark-input"
                className="block text-xs font-semibold text-[#162E51] mb-1.5"
              >
                {uiLang === 'hi' ? 'नजदीकी पहचान चिह्न (Landmark)' : 'Street / Nearby Landmark'}
              </label>
              <input
                id="landmark-input"
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={
                  uiLang === 'hi'
                    ? 'उदा. मेट्रो गेट 2 के सामने, स्कूल के पास'
                    : 'e.g. Opposite Metro Pillar 48, Near Govt School'
                }
                className={inputClass}
              />
            </div>

            {/* Optional Photo Upload */}
            <div>
              <span className="block text-xs font-semibold text-[#162E51] mb-1.5">
                {uiLang === 'hi' ? 'घटनास्थल की फोटो (वैकल्पिक)' : 'Photo Evidence (Optional)'}
              </span>
              {!beforeImageUri ? (
                <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F8F9FA] border border-dashed border-[#162E51]/25 text-xs font-medium text-[#162E51] hover:border-[#005EA2] hover:text-[#005EA2] cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>{uiLang === 'hi' ? 'फोटो चुनें (JPEG/PNG)' : 'Attach Street Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[#162E51]/20 bg-[#F8F9FA]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded overflow-hidden shrink-0 border border-[#162E51]/15">
                      <CivicImage src={beforeImageUri} alt="Attached grievance preview" />
                    </div>
                    <span className="text-xs font-semibold text-[#138808] truncate">
                      {uiLang === 'hi' ? 'फोटो संलग्न है' : 'Before-photo attached'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBeforeImageUri(null)}
                    aria-label="Remove attached photo"
                    className="p-1.5 text-[#162E51]/60 hover:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Citizen Contact Details */}
          <div className="pt-5 border-t border-[#162E51]/12 space-y-4">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2]">
              {uiLang === 'hi'
                ? 'नागरिक संपर्क विवरण (केवल अधिकृत अधिकारियों हेतु सुरक्षित)'
                : 'Citizen Contact Information (Protected — Never Shown Publicly)'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="citizen-name" className="block text-xs font-semibold text-[#162E51] mb-1">
                  {uiLang === 'hi' ? 'पूरा नाम *' : 'Your Name *'}
                </label>
                <input
                  id="citizen-name"
                  type="text"
                  required
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  placeholder={uiLang === 'hi' ? 'उदा. अमित कुमार' : 'e.g. Amit Kumar'}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="citizen-phone" className="block text-xs font-semibold text-[#162E51] mb-1">
                  {uiLang === 'hi' ? 'मोबाइल नंबर (वैकल्पिक)' : 'Phone Number (Optional)'}
                </label>
                <input
                  id="citizen-phone"
                  type="tel"
                  value={citizenPhone}
                  onChange={(e) => setCitizenPhone(e.target.value)}
                  placeholder="+91 98XXXXXX00"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="citizen-email" className="block text-xs font-semibold text-[#162E51] mb-1">
                  {uiLang === 'hi' ? 'ईमेल (वैकल्पिक)' : 'Email Address (Optional)'}
                </label>
                <input
                  id="citizen-email"
                  type="email"
                  value={citizenEmail}
                  onChange={(e) => setCitizenEmail(e.target.value)}
                  placeholder="citizen@example.org"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#162E51]/12 flex items-center justify-end">
            <button
              type="button"
              onClick={() => runAiTriage()}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-6 py-3 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{uiLang === 'hi' ? 'एआई विश्लेषण हो रहा है...' : 'Analyzing Grievance...'}</span>
                </>
              ) : (
                <>
                  <span>
                    {uiLang === 'hi'
                      ? 'एआई वर्गीकरण एवं विभाग देखें'
                      : 'Analyze & Preview Department Routing'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: AI TRIAGE REVIEW, FOLLOW-UP & CITIZEN CONFIRMATION */}
      {step === 2 && triage && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#162E51]/12">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#162E51]">
                  {uiLang === 'hi'
                    ? 'अपनी व्याख्यायित शिकायत और प्रस्तावित विभाग की पुष्टि करें'
                    : 'Review Interpreted Grievance & Proposed Department'}
                </h2>
                <p className="text-xs text-[#162E51]/65 mt-1">
                  <span>Detected Language: {triage.detectedLanguage}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="font-semibold text-[#005EA2]">
                    {triage.classificationSource === 'ai'
                      ? 'Classified by Multilingual AI Model'
                      : 'Automated Rule-Based Classification (AI Fallback Active)'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#162E51]/20 bg-[#F8F9FA] text-xs font-semibold text-[#162E51] hover:border-[#005EA2] hover:text-[#005EA2] self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{uiLang === 'hi' ? 'विवरण संपादित करें' : 'Edit Original Text'}</span>
              </button>
            </div>

            {triage.needsFollowUp && triage.followUpQuestions.length > 0 && (
              <div className="p-5 rounded-xl bg-amber-50/70 border border-amber-300 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#92400E]">
                      {uiLang === 'hi'
                        ? 'त्वरित समाधान हेतु कुछ अतिरिक्त विवरण उपयोगी होंगे:'
                        : 'Optional Follow-Up Questions for Faster Field Dispatch:'}
                    </p>
                    <ul className="list-disc list-inside text-xs text-[#162E51]/85 space-y-1">
                      {triage.followUpQuestions.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <input
                    type="text"
                    value={followUpAnswer}
                    onChange={(e) => setFollowUpAnswer(e.target.value)}
                    placeholder={
                      uiLang === 'hi'
                        ? 'यहाँ अतिरिक्त पहचान चिह्न या विवरण लिखें...'
                        : 'Add missing landmark, house number, or severity details...'
                    }
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => runAiTriage(followUpAnswer)}
                    disabled={analyzing || !followUpAnswer.trim()}
                    className="px-4 py-2.5 rounded-lg bg-[#005EA2] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#162E51] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {analyzing ? 'Updating...' : 'Update Summary'}
                  </button>
                </div>
              </div>
            )}

            {/* Interpreted Summary */}
            <div className="space-y-2.5">
              <label
                htmlFor="editable-summary"
                className="block font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2]"
              >
                {uiLang === 'hi'
                  ? 'आधिकारिक शिकायत सारांश (आप इसे संशोधित कर सकते हैं)'
                  : 'Official Interpreted Summary (Editable before registration)'}
              </label>
              <textarea
                id="editable-summary"
                rows={2}
                value={editableSummary}
                onChange={(e) => setEditableSummary(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-[#162E51]/80">
                <span className="font-bold text-[#162E51]">हिन्दी सारांश: </span>
                {triage.interpretedSummaryHi}
              </p>
            </div>

            {/* Category & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-[#162E51]/12">
              <div>
                <label
                  htmlFor="confirm-category"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi' ? 'चयनित शिकायत श्रेणी' : 'Identified Grievance Category'}
                </label>
                <select
                  id="confirm-category"
                  value={confirmedCategory}
                  onChange={(e) => setConfirmedCategory(e.target.value as CivicCategory)}
                  className={selectClass}
                >
                  {CIVIC_CATEGORIES.map((c) => (
                    <option key={c} value={c} className={optionClass}>
                      {CATEGORY_LABELS[c][uiLang]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[#162E51]/65 mt-1">
                  {uiLang === 'hi'
                    ? getCategoryMetadata(confirmedCategory).verifiedScopeHi
                    : getCategoryMetadata(confirmedCategory).verifiedScopeEn}
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm-priority"
                  className="block text-xs font-semibold text-[#162E51] mb-1.5"
                >
                  {uiLang === 'hi' ? 'निर्धारित प्राथमिकता एवं समय-सीमा' : 'Assessed Priority & SLA'}
                </label>
                <select
                  id="confirm-priority"
                  value={confirmedPriority}
                  onChange={(e) => setConfirmedPriority(e.target.value as ComplaintPriority)}
                  className={selectClass}
                >
                  {COMPLAINT_PRIORITIES.map((p) => (
                    <option key={p} value={p} className={optionClass}>
                      {PRIORITY_LABELS[p][uiLang]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[#162E51]/65 mt-1">{triage.priorityReason}</p>
              </div>
            </div>

            {/* Proposed Municipal Ward & Department Box */}
            <div className="p-5 rounded-xl bg-[#F8F9FA] border border-[#162E51]/12 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
                  {uiLang === 'hi' ? 'प्रस्तावित जिम्मेदार विभाग' : 'Proposed Responsible Department'}
                </p>
                <p className="text-sm font-bold text-[#162E51] mt-1">
                  {uiLang === 'hi'
                    ? triage.recommendedDepartmentNameHi
                    : triage.recommendedDepartmentNameEn}
                </p>
                {triage.requiresManualAssignment && (
                  <p className="text-xs font-medium text-[#B45309] mt-1">
                    Manual Assignment Required — Will be reviewed by Nodal Triage Officer
                  </p>
                )}
              </div>

              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
                  {uiLang === 'hi' ? 'सत्यापित नगर वार्ड एवं समय-सीमा' : 'Mapped Municipal Ward & SLA'}
                </p>
                <p className="text-sm font-semibold text-[#162E51] mt-1">
                  {triage.resolvedWard
                    ? `${triage.resolvedWard.wardName} · ${triage.resolvedWard.municipalBody}`
                    : `${city} — Nodal Manual Ward Queue`}
                </p>
                <p className="text-xs tabular-nums text-[#162E51]/70 mt-0.5">
                  Expected Response Window: {triage.slaHours} hours
                </p>
              </div>
            </div>

            {/* Duplicate Complaint Detection Panel */}
            {triage.potentialDuplicates.length > 0 && (
              <div className="p-5 rounded-xl bg-[#F8F9FA] border border-[#162E51]/15 space-y-3">
                <div>
                  <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-[#005EA2]">
                    {uiLang === 'hi'
                      ? 'इसी मोहल्ले से समान सक्रिय शिकायत पाई गई'
                      : 'Similar Active Grievance Found in Your Locality'}
                  </h3>
                  <p className="text-xs text-[#162E51]/70 mt-1">
                    {uiLang === 'hi'
                      ? 'आप अपनी शिकायत को मौजूदा समूह से जोड़ सकते हैं—आपको फिर भी अपनी अलग शिकायत आईडी और पिन मिलेगा।'
                      : 'Grouping helps municipal engineers prioritize neighborhood-wide outages while still issuing your own independent Complaint ID and secret PIN.'}
                  </p>
                </div>

                <div className="space-y-2">
                  {triage.potentialDuplicates.map((dup) => (
                    <label
                      key={dup.trackingCode}
                      className="flex items-start gap-3 p-3 rounded-lg bg-white border border-[#162E51]/15 hover:border-[#005EA2] cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="duplicate-choice"
                        checked={selectedDuplicateCode === dup.trackingCode}
                        onChange={() => setSelectedDuplicateCode(dup.trackingCode)}
                        className="mt-1 accent-[#005EA2]"
                      />
                      <div className="text-xs space-y-0.5">
                        <p className="font-semibold text-[#162E51]">
                          <span className="font-mono text-[#005EA2] tabular-nums">{dup.trackingCode}</span>
                          <span> · {dup.locality} · {dup.status}</span>
                        </p>
                        <p className="text-[#162E51]/75">{dup.interpretedSummary}</p>
                      </div>
                    </label>
                  ))}

                  <label className="flex items-center gap-3 p-3 rounded-lg bg-white border border-[#162E51]/15 hover:border-[#005EA2] cursor-pointer text-xs text-[#162E51]">
                    <input
                      type="radio"
                      name="duplicate-choice"
                      checked={selectedDuplicateCode === null}
                      onChange={() => setSelectedDuplicateCode(null)}
                      className="accent-[#005EA2]"
                    />
                    <span>
                      {uiLang === 'hi'
                        ? 'अलग स्वतंत्र शिकायत के रूप में दर्ज करें (समूह से न जोड़ें)'
                        : 'Register as a separate standalone issue (do not group)'}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Explicit Citizen Confirmation Checkbox */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-[#162E51]/20 bg-[#F8F9FA] cursor-pointer">
              <input
                type="checkbox"
                checked={citizenConfirmedCheck}
                onChange={(e) => setCitizenConfirmedCheck(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#005EA2]"
              />
              <span className="text-xs text-[#162E51]/90 leading-relaxed">
                {uiLang === 'hi'
                  ? 'मैं पुष्टि करता/करती हूँ कि उपरोक्त व्याख्यायित शिकायत सारांश, स्थान और प्रस्तावित विभाग सही हैं। मुझे ज्ञात है कि यह एक प्रोटोटाइप पोर्टल है।'
                  : 'I confirm that the interpreted complaint summary, ward location, and proposed responsible department accurately reflect my grievance, and I understand this record is stored in the CivicSaathi AI prototype database.'}
              </span>
            </label>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-[#162E51] border border-[#162E51]/25 hover:border-[#005EA2] hover:text-[#005EA2] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {uiLang === 'hi' ? 'पीछे जाएँ' : 'Back to Edit'}
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-3 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{uiLang === 'hi' ? 'पंजीकरण हो रहा है...' : 'Registering...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {uiLang === 'hi'
                        ? 'पुष्टि करें और शिकायत दर्ज करें'
                        : 'Confirm & Submit Grievance'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: OFFICIAL REGISTRATION RECEIPT */}
      {step === 3 && receipt && (
        <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-7 h-7 text-[#138808] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#162E51]">
                {uiLang === 'hi'
                  ? 'शिकायत सफलतापूर्वक पंजीकृत हो गई है'
                  : 'Grievance Registered in CivicSaathi AI'}
              </h2>
              <p className="text-sm text-[#162E51]/75 mt-1">
                {uiLang === 'hi'
                  ? 'कृपया अपनी शिकायत आईडी और 4-अंकीय गुप्त पिन सुरक्षित रखें। निजी विवरण देखने और समाधान सत्यापित करने के लिए दोनों आवश्यक हैं।'
                  : 'Save your unique Complaint ID and 4-digit secret PIN below. Both are required to view private updates and confirm resolution.'}
              </p>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-[#162E51] text-white grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-white/70">
                Unique Complaint ID
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-[#FF9933] mt-1">
                {receipt.trackingCode}
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-white/70">
                Secret 4-Digit Access PIN
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-white mt-1">
                {receipt.accessPin}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs py-4 border-y border-[#162E51]/12">
            <div>
              <span className="block font-mono font-bold text-[#005EA2] uppercase tracking-wider text-[11px]">
                Assigned Department
              </span>
              <span className="font-semibold text-[#162E51] block mt-0.5">
                {receipt.departmentName}
              </span>
            </div>
            <div>
              <span className="block font-mono font-bold text-[#005EA2] uppercase tracking-wider text-[11px]">
                Mapped Municipal Ward
              </span>
              <span className="font-semibold text-[#162E51] block mt-0.5">
                {receipt.wardName}
              </span>
            </div>
            <div>
              <span className="block font-mono font-bold text-[#005EA2] uppercase tracking-wider text-[11px]">
                Expected Response By
              </span>
              <span className="font-semibold text-[#162E51] tabular-nums block mt-0.5">
                {new Date(receipt.slaDeadline).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCopyReceipt}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-[#162E51] bg-[#F8F9FA] border border-[#162E51]/20 hover:border-[#005EA2] hover:text-[#005EA2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedCredentials ? (
                <>
                  <Check className="w-4 h-4 text-[#138808]" />
                  <span>Copied ID &amp; PIN</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy ID &amp; Secret PIN</span>
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-[#162E51] border border-[#162E51]/20 hover:border-[#005EA2] hover:text-[#005EA2] whitespace-nowrap shrink-0 cursor-pointer"
              >
                File Another Grievance
              </button>
              <button
                type="button"
                onClick={() => onOpenTracker(receipt.trackingCode, receipt.accessPin)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Track Live Status</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
