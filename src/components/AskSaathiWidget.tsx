import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, X, AlertCircle, RotateCcw } from 'lucide-react';

interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; }
interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
}
type SpeechCtor = new () => SpeechRec;

const getSpeech = (): SpeechCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const strip = (s: string) => s.replace(/<[^>]*>/g, '');

function parseReplies(text: string): { body: string; opts: string[] } {
  const hits = Array.from(text.matchAll(/\[([^\][\n]{2,42})\]/g)).map((m) => m[1].trim());
  if (!hits.length) return { body: text, opts: [] };
  return {
    body: text.replace(/(?:\s*\[[^\][\n]{2,42}\])+\s*$/, '').trim() || text,
    opts: Array.from(new Set(hits)).slice(0, 4),
  };
}

const CHIPS = [
  ['Report an issue / शिकायत दर्ज करें', 'I want to report a civic issue in my area.', 'मुझे अपने क्षेत्र की एक नागरिक समस्या दर्ज करनी है।'],
  ['Check status / स्थिति देखें', 'How can I check the status of my complaint?', 'मैं अपनी शिकायत की स्थिति कैसे देख सकता हूँ?'],
  ['Nearest office / नज़दीकी कार्यालय', 'How do I find my nearest municipal ward office?', 'मैं अपना नज़दीकी नगर निगम वार्ड कार्यालय कैसे खोजूँ?'],
  ['Helpline / हेल्पलाइन', 'Share emergency and civic helpline numbers.', 'आपातकालीन और नागरिक हेल्पलाइन नंबर बताइए।'],
  ['How it works / कैसे काम करता है', 'How does CivicSaathi work and what details help resolve a report faster?', 'CivicSaathi कैसे काम करता है और शिकायत जल्दी हल करने के लिए क्या जानकारी दें?'],
] as const;

const SaathiMascot: React.FC<{ id: string; size?: number }> = ({ id, size = 44 }) => {
  const b = `asb-${id}`, f = `asf-${id}`, s = `ass-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={b} cx="35%" cy="28%" r="68%">
          <stop offset="0%" stopColor="#3B97DC" /><stop offset="55%" stopColor="#005EA2" /><stop offset="100%" stopColor="#003966" />
        </radialGradient>
        <radialGradient id={f} cx="42%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#F7FBFF" /><stop offset="65%" stopColor="#D9E8F6" /><stop offset="100%" stopColor="#B8D2EA" />
        </radialGradient>
        <radialGradient id={s} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(11,12,12,0.34)" /><stop offset="100%" stopColor="rgba(11,12,12,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="58.5" rx="15" ry="3.2" fill={`url(#${s})`} />
      <g className="as-mascot-float">
        <path d="M12 31A20 20 0 0 1 52 31" stroke="#162E51" strokeWidth="4.4" strokeLinecap="round" />
        <path d="M18 15.2A20.2 20.2 0 0 1 46 15.2" stroke="#FF9933" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M17.2 16.5A19.2 19.2 0 0 1 46.8 16.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M16.5 17.8A18.2 18.2 0 0 1 47.5 17.8" stroke="#138808" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="32" cy="33" r="19" fill={`url(#${b})`} />
        <path d="M20 21A15 15 0 0 1 43 20" stroke="rgba(255,255,255,0.42)" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="8.5" y="27" width="5.5" height="12" rx="2.7" fill="#162E51" />
        <rect x="50" y="27" width="5.5" height="12" rx="2.7" fill="#162E51" />
        <path d="M12 38Q14 45 22 45.5" stroke="#162E51" strokeWidth="2" strokeLinecap="round" />
        <circle cx="23" cy="45.5" r="2.2" fill="#005EA2" stroke="#FFFFFF" strokeWidth="0.8" />
        <rect x="17" y="23" width="30" height="20" rx="10" fill={`url(#${f})`} />
        <g className="as-mascot-eyes">
          <circle cx="25.5" cy="31.5" r="3.1" fill="#0B0C0C" /><circle cx="26.5" cy="30.4" r="1.05" fill="#FFFFFF" />
          <circle cx="38.5" cy="31.5" r="3.1" fill="#0B0C0C" /><circle cx="39.5" cy="30.4" r="1.05" fill="#FFFFFF" />
        </g>
        <ellipse cx="21.5" cy="35.5" rx="2.2" ry="1.2" fill="#9BC4E6" opacity="0.7" />
        <ellipse cx="42.5" cy="35.5" rx="2.2" ry="1.2" fill="#9BC4E6" opacity="0.7" />
        <path d="M28 36.8Q32 40.2 36 36.8" stroke="#162E51" strokeWidth="2" strokeLinecap="round" />
        <g className="as-mascot-hand">
          <circle cx="53.5" cy="44" r="4.5" fill={`url(#${b})`} stroke="#FFFFFF" strokeWidth="1" />
          <circle cx="52.2" cy="42.6" r="1.1" fill="rgba(255,255,255,0.45)" />
        </g>
      </g>
    </svg>
  );
};

export const AskSaathiWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [step, setStep] = useState<-1 | 0 | 1>(0);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryTxt, setRetryTxt] = useState<string | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [micOn, setMicOn] = useState(false);

  const openRef = useRef(isOpen);
  const launchRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => { openRef.current = isOpen; if (isOpen) setUnread(false); }, [isOpen]);
  useEffect(() => { setCanSpeak(Boolean(getSpeech())); return () => recRef.current?.stop(); }, []);
  useEffect(() => { if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, typing, err, notice, isOpen]);

  const close = useCallback(() => {
    recRef.current?.stop(); setMicOn(false); setIsOpen(false);
    window.requestAnimationFrame(() => launchRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const tId = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1], act = document.activeElement as HTMLElement | null;
        if (!panelRef.current.contains(act)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(tId); document.removeEventListener('keydown', onKey); };
  }, [isOpen, close]);

  const send = useCallback(async (raw: string, isRetry = false) => {
    const clean = strip(raw).trim();
    if (!clean || busy) return;
    setErr(null); setNotice(null); setRetryTxt(null);
    if (!isRetry) setInput('');

    const uMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: clean };
    const bId = `b-${Date.now() + 1}`;
    const baseMsgs = isRetry && msgs[msgs.length - 1]?.role === 'assistant' ? msgs.slice(0, -1) : msgs;
    const nextMsgs = isRetry ? baseMsgs : [...baseMsgs, uMsg];
    setMsgs(nextMsgs);
    const ctx = nextMsgs.slice(-10).map((m) => ({ role: m.role, content: strip(m.content) }));
    setBusy(true); setTyping(true);

    let acc = '', added = false;
    try {
      const res = await fetch('/api/ai/ask-saathi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: ctx }),
      });
      if (!res.ok || !res.body) {
        let m = 'Unable to connect to AskSaathi.';
        try { const j = await res.json(); if (j?.error) m = String(j.error); } catch { /* ignore */ }
        throw new Error(m);
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const rl of lines) {
          const ln = rl.trim();
          if (!ln.startsWith('data:')) continue;
          const d = ln.slice(5).trim();
          if (!d || d === '[DONE]') continue;
          const p = JSON.parse(d) as { delta?: string; notice?: string; error?: string };
          if (p.error) throw new Error(p.error);
          if (p.notice) { setNotice(strip(p.notice)); setRetryTxt(clean); }
          if (p.delta) {
            const pc = strip(p.delta);
            if (!pc) continue;
            acc += pc; setTyping(false);
            if (!added) { added = true; setMsgs((prev) => [...prev, { id: bId, role: 'assistant', content: acc }]); }
            else { const snap = acc; setMsgs((prev) => prev.map((x) => (x.id === bId ? { ...x, content: snap } : x))); }
          }
        }
      }
      if (!acc.trim()) throw new Error('AskSaathi returned an empty reply.');
      if (!openRef.current) setUnread(true);
    } catch (e: unknown) {
      if (added && !acc.trim()) setMsgs((p) => p.filter((x) => x.id !== bId));
      setRetryTxt(clean);
      setErr(e instanceof Error && e.message ? strip(e.message) : lang === 'hi' ? 'कनेक्शन में समस्या आई। कृपया पुनः प्रयास करें।' : 'Sorry, AskSaathi could not reply right now. Please try again.');
    } finally { setTyping(false); setBusy(false); }
  }, [lang, busy, msgs]);

  const toggleMic = () => {
    const Ctor = getSpeech();
    if (!Ctor) return;
    if (micOn) { recRef.current?.stop(); setMicOn(false); return; }
    try {
      const rec = new Ctor();
      rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      rec.interimResults = false; rec.continuous = false;
      rec.onresult = (ev) => {
        const txt = strip(ev.results?.[0]?.[0]?.transcript || '').trim();
        if (txt) setInput((p) => (p.trim() ? `${p.trim()} ${txt}` : txt));
      };
      rec.onerror = () => setMicOn(false);
      rec.onend = () => setMicOn(false);
      recRef.current = rec; rec.start(); setMicOn(true);
    } catch { setMicOn(false); }
  };

  const textSizeCls = step === -1 ? 'text-[14px]' : step === 1 ? 'text-[18px]' : 'text-[16px]';
  const launchLabel = unread ? 'AskSaathi citizen assistant (सहायता) — 1 unread reply' : isOpen ? 'Close AskSaathi citizen assistant' : 'Open AskSaathi citizen assistant (सहायता)';

  return (
    <div className="ask-saathi-scope">
      {isOpen && (
        <div id="asksaathi-chat-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="AskSaathi chat" className="ask-saathi-panel">
          <div className="grid grid-cols-3 h-[4px] w-full shrink-0" aria-hidden="true">
            <div className="bg-[#FF9933]" /><div className="bg-[#FFFFFF]" /><div className="bg-[#138808]" />
          </div>
          <div className="bg-[var(--primary-dark)] text-white px-3 py-1.5 flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="as-header-mascot shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><SaathiMascot id="hdr" size={34} /></div>
              <div className="min-w-0 leading-tight">
                <h2 className="text-sm font-bold text-white truncate">AskSaathi</h2>
                <p className="text-[11px] text-[#D9E8F6] truncate">आपका नागरिक सहायक</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => setLang((l) => (l === 'en' ? 'hi' : 'en'))} aria-label={lang === 'en' ? 'Switch language to Hindi' : 'Switch language to English'} className="as-hdr-btn whitespace-nowrap">
                <span className={lang === 'en' ? 'underline font-bold' : 'opacity-75'}>EN</span>
                <span aria-hidden="true" className="mx-1 opacity-60">|</span>
                <span className={lang === 'hi' ? 'underline font-bold' : 'opacity-75'}>हिं</span>
              </button>
              <button type="button" onClick={() => setStep((s) => (s > -1 ? ((s - 1) as -1 | 0) : -1))} disabled={step === -1} aria-label="Decrease text size" className="as-hdr-btn">A-</button>
              <button type="button" onClick={() => setStep((s) => (s < 1 ? ((s + 1) as 0 | 1) : 1))} disabled={step === 1} aria-label="Increase text size" className="as-hdr-btn">A+</button>
              <button type="button" onClick={close} aria-label="Close AskSaathi chat" className="min-w-[44px] min-h-[44px] -mr-1 rounded-lg flex items-center justify-center text-white hover:bg-white/15 cursor-pointer"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
          </div>

          <div aria-live="polite" aria-relevant="additions text" className={`flex-1 overflow-y-auto px-3.5 py-3 space-y-3 ${textSizeCls}`}>
            <div className="as-bubble-b">
              <p className="text-[11px] font-semibold text-[var(--muted)] mb-1">AskSaathi</p>
              <p className="whitespace-pre-wrap leading-normal">
                {lang === 'hi'
                  ? 'नमस्ते 🙏 मैं AskSaathi हूँ, आपका AI नागरिक सहायक। आप सड़क, पानी, बिजली, सफ़ाई या स्ट्रीटलाइट की समस्या हिंदी, English या Hinglish में बता सकते हैं।'
                  : 'नमस्ते 🙏 I am AskSaathi, your AI citizen assistant. Tell me about a civic issue or question in English, Hindi, or Hinglish.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick actions">
              {CHIPS.map(([label, en, hi]) => (
                <button key={label} type="button" disabled={busy} onClick={() => send(lang === 'hi' ? hi : en)} className="as-chip">{label}</button>
              ))}
            </div>
            {msgs.map((msg, idx) => {
              const isU = msg.role === 'user';
              const latestBot = !isU && idx === msgs.length - 1 && !busy;
              const { body, opts } = !isU ? parseReplies(msg.content) : { body: msg.content, opts: [] };
              return (
                <div key={msg.id} className="space-y-1.5">
                  <div className={`flex ${isU ? 'justify-end' : 'justify-start'}`}>
                    <div className={isU ? 'as-bubble-u' : 'as-bubble-b'}>
                      <span className={`block text-[11px] font-semibold mb-0.5 ${isU ? 'text-white/85' : 'text-[var(--muted)]'}`}>{isU ? (lang === 'hi' ? 'आप (You)' : 'You') : 'AskSaathi'}</span>
                      <p className="whitespace-pre-wrap break-words leading-normal">{body}</p>
                    </div>
                  </div>
                  {latestBot && opts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-1">{opts.map((o) => <button key={o} type="button" onClick={() => send(o)} className="as-chip">{o}</button>)}</div>
                  )}
                </div>
              );
            })}
            {typing && (
              <div className="flex justify-start">
                <div className="as-bubble-b inline-flex items-center gap-1.5 py-3">
                  <span className="sr-only">AskSaathi is typing</span>
                  <span className="as-typing-dot w-2 h-2 rounded-full bg-[var(--muted)]" aria-hidden="true" />
                  <span className="as-typing-dot w-2 h-2 rounded-full bg-[var(--muted)]" aria-hidden="true" />
                  <span className="as-typing-dot w-2 h-2 rounded-full bg-[var(--muted)]" aria-hidden="true" />
                </div>
              </div>
            )}
            {(err || notice) && (
              <div role={err ? 'alert' : 'status'} className={`rounded-xl bg-[var(--bot-bg)] p-2.5 text-xs text-[var(--text)] space-y-2 ${err ? 'border-2 border-[var(--danger)]' : 'border border-[var(--primary)]'}`}>
                <div className="flex items-start gap-2"><AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${err ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`} aria-hidden="true" /><p className="leading-snug">{err || notice}</p></div>
                {retryTxt && !busy && (
                  <button type="button" onClick={() => send(retryTxt, true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg bg-[var(--primary)] text-white font-semibold hover:bg-[var(--primary-dark)] cursor-pointer">
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /><span>{lang === 'hi' ? 'पुनः प्रयास करें / Try again' : 'Try again'}</span>
                  </button>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--bot-bg)] px-3 pt-2.5 pb-2 shrink-0 space-y-1.5">
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-1.5">
              <label htmlFor="asksaathi-input" className="sr-only">{lang === 'hi' ? 'अपना संदेश लिखें' : 'Type your message to AskSaathi'}</label>
              <input id="asksaathi-input" ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={lang === 'hi' ? 'यहाँ लिखें या माइक दबाएँ...' : 'Type in English, हिंदी, or Hinglish...'} maxLength={600} className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-base text-[var(--text)] placeholder:text-[var(--muted)]" />
              {canSpeak && (
                <button type="button" onClick={toggleMic} aria-pressed={micOn} aria-label={micOn ? 'Stop voice input' : lang === 'hi' ? 'आवाज़ से बोलें' : 'Voice input'} title={micOn ? 'Stop listening' : `Voice input (${lang === 'hi' ? 'hi-IN' : 'en-IN'})`} className={`min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${micOn ? 'bg-[var(--danger)] border-[var(--danger)] text-white' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)]'}`}>
                  {micOn ? <MicOff className="w-5 h-5" aria-hidden="true" /> : <Mic className="w-5 h-5" aria-hidden="true" />}
                </button>
              )}
              <button type="submit" disabled={!input.trim() || busy} aria-label={lang === 'hi' ? 'संदेश भेजें' : 'Send message'} className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-dark)] disabled:opacity-45 text-white font-semibold flex items-center justify-center shrink-0 cursor-pointer"><Send className="w-4 h-4" aria-hidden="true" /></button>
            </form>
            <p className="text-[11px] text-[var(--muted)] text-center leading-snug px-1">AskSaathi is an AI assistant and may make mistakes. For emergencies call <strong className="font-bold text-[var(--text)]">112</strong>.</p>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5">
        <button ref={launchRef} type="button" onClick={() => setIsOpen((p) => !p)} aria-label={launchLabel} aria-expanded={isOpen} aria-controls="asksaathi-chat-panel" className="as-launcher-btn group flex items-center gap-2.5 rounded-full bg-transparent border-0 p-0 cursor-pointer">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--bot-bg)] text-[var(--text)] border border-[var(--border)] shadow-md text-xs font-bold whitespace-nowrap">
            <span>AskSaathi</span><span aria-hidden="true" className="text-[var(--muted)] font-normal">·</span><span className="text-[var(--chip-fg)]">सहायता</span>
          </span>
          <span className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#FFFFFF] border-2 border-[var(--primary)] shadow-lg flex items-center justify-center transition-transform group-hover:scale-[1.03]">
            <SaathiMascot id="launch" size={48} />
            {unread && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] border-2 border-white text-white text-[10px] font-bold flex items-center justify-center leading-none">1</span>}
          </span>
        </button>
      </div>
    </div>
  );
};
