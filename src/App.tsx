import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Check, Search } from 'lucide-react';
import { AuthProvider } from './context/AuthContext.tsx';
import { Navbar, type ActiveTab } from './components/Navbar.tsx';
import { HomeView } from './components/HomeView.tsx';
import { SubmitComplaintView } from './components/SubmitComplaintView.tsx';
import { TrackComplaintView } from './components/TrackComplaintView.tsx';
import { OfficerDashboardView } from './components/OfficerDashboardView.tsx';
import { AskSaathiWidget } from './components/AskSaathiWidget.tsx';
import { normalizePinCode, normalizeTrackingCode, safeFetchJson } from './lib/apiClient.ts';
import { UI_COPY } from './i18n/translations.ts';
import { INITIAL_WARDS } from './db/seedData.ts';
import type { PublicOverviewResponse, UiLanguage, WardRecord } from './types/civic.ts';

const FALLBACK_WARDS: WardRecord[] = INITIAL_WARDS.map((w, idx) => ({
  id: idx + 1,
  ...w,
}));

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [uiLang, setUiLang] = useState<UiLanguage>('en');
  const [overview, setOverview] = useState<PublicOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [prefillTrackCode, setPrefillTrackCode] = useState<string>('');
  const [prefillPin, setPrefillPin] = useState<string>('');
  const [prefillSubmitCity, setPrefillSubmitCity] = useState<string>('');
  const [prefillSubmitLocality, setPrefillSubmitLocality] = useState<string>('');

  const [asideCode, setAsideCode] = useState<string>('');
  const [asidePin, setAsidePin] = useState<string>('');
  const [asideError, setAsideError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const data = await safeFetchJson<PublicOverviewResponse>(
        '/api/public/overview',
        undefined,
        { fallbackError: 'Could not load civic overview.' }
      );
      setOverview(data);
    } catch (err: unknown) {
      setOverviewError(
        err instanceof Error ? err.message : 'Unable to reach civic backend service.'
      );
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const scrollMainStageTop = () => {
    const stage = document.getElementById('main-stage-scroll');
    if (stage) {
      stage.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenTracker = (trackingCode: string, pin: string) => {
    setPrefillTrackCode(trackingCode);
    setPrefillPin(pin);
    setActiveTab('track');
    scrollMainStageTop();
  };

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    scrollMainStageTop();
  };

  const handleOpenSubmitForLocation = (targetCity: string, targetLocality?: string) => {
    setPrefillSubmitCity(targetCity);
    setPrefillSubmitLocality(targetLocality || '');
    setActiveTab('submit');
    scrollMainStageTop();
  };

  const handleAsideTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = normalizeTrackingCode(asideCode);
    const cleanPin = normalizePinCode(asidePin);
    if (!cleanCode || !cleanPin) {
      setAsideError(
        uiLang === 'hi'
          ? 'शिकायत आईडी और 4-अंकीय पिन दोनों आवश्यक हैं।'
          : 'Enter both Complaint Reference Number and 4-digit PIN.'
      );
      return;
    }
    setAsideError(null);
    handleOpenTracker(cleanCode, cleanPin);
  };

  const t = UI_COPY[uiLang];

  return (
    <AuthProvider>
      <div className="min-h-screen lg:h-screen bg-[#F8F9FA] text-[#162E51] flex flex-col lg:grid lg:grid-rows-[auto_1fr_auto] lg:overflow-hidden">
        {/* Row 1: Institutional Top Header */}
        <Navbar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          uiLang={uiLang}
          onChangeUiLang={setUiLang}
        />

        {/* Row 2: 2-Column Portal Workspace (Main Stage + 360px Right Sidebar) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] lg:overflow-hidden">
          <main
            id="main-stage-scroll"
            className="civic-content-bg overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-9 pb-24"
          >
            {/* Contextual Workspace Bar: Prototype Transparency + Bilingual Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-8 border-b border-[#162E51]/12">
              <p className="text-xs text-[#162E51]/65 leading-relaxed">
                {t.prototypeNotice}
              </p>

              <div
                role="group"
                aria-label="Interface Language"
                className="inline-flex items-center p-0.5 rounded-md border border-[#162E51]/15 bg-white self-start sm:self-auto shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setUiLang('en')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    uiLang === 'en'
                      ? 'bg-[#005EA2] text-white'
                      : 'text-[#162E51]/75 hover:text-[#162E51]'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setUiLang('hi')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    uiLang === 'hi'
                      ? 'bg-[#005EA2] text-white'
                      : 'text-[#162E51]/75 hover:text-[#162E51]'
                  }`}
                >
                  हिन्दी
                </button>
              </div>
            </div>

            {overviewError && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-xs text-red-900">
                <span>{overviewError}</span>
                <button
                  type="button"
                  onClick={fetchOverview}
                  className="px-3.5 py-1.5 rounded bg-[#005EA2] text-white font-semibold hover:bg-[#162E51] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {activeTab === 'home' && (
              <HomeView
                uiLang={uiLang}
                overview={overview}
                loadingOverview={loadingOverview}
                onNavigateSubmit={() => handleSelectTab('submit')}
                onNavigateSubmitWithLocation={handleOpenSubmitForLocation}
                onQuickTrack={handleOpenTracker}
                onNavigateOfficer={() => handleSelectTab('officer')}
              />
            )}

            {activeTab === 'submit' && (
              <SubmitComplaintView
                uiLang={uiLang}
                wards={overview?.wards && overview.wards.length > 0 ? overview.wards : FALLBACK_WARDS}
                initialCity={prefillSubmitCity}
                initialLocality={prefillSubmitLocality}
                onComplaintRegistered={fetchOverview}
                onOpenTracker={handleOpenTracker}
              />
            )}

            {activeTab === 'track' && (
              <TrackComplaintView
                uiLang={uiLang}
                sampleComplaints={overview?.sampleComplaints ?? []}
                initialTrackingCode={prefillTrackCode}
                initialPin={prefillPin}
                onStatusMutated={fetchOverview}
              />
            )}

            {activeTab === 'officer' && (
              <OfficerDashboardView
                uiLang={uiLang}
                onDataUpdated={fetchOverview}
              />
            )}
          </main>

          {/* Right Sidebar (360px on lg+) */}
          <aside
            aria-label="Case Tracking and Service Capabilities"
            className="bg-white border-t lg:border-t-0 lg:border-l border-[#162E51]/12 p-6 lg:p-7 flex flex-col gap-6 overflow-y-auto pb-24"
          >
            {/* Variation 5 Navy Case Tracker Card */}
            <div className="bg-[#162E51] text-white p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-[#FF9933]">
                  {uiLang === 'hi' ? 'अपनी शिकायत ट्रैक करें' : 'Track Your Case'}
                </h2>
                <span className="font-mono text-[11px] text-white/60">ID + PIN</span>
              </div>

              <form onSubmit={handleAsideTrackSubmit} className="space-y-3">
                <div>
                  <label htmlFor="aside-complaint-id" className="sr-only">
                    Complaint Reference Number
                  </label>
                  <input
                    id="aside-complaint-id"
                    type="text"
                    value={asideCode}
                    onChange={(e) => setAsideCode(e.target.value)}
                    placeholder={
                      uiLang === 'hi'
                        ? 'शिकायत संदर्भ संख्या (उदा. CS-BLR-2026-1002)'
                        : 'Complaint Reference Number'
                    }
                    className="w-full px-3.5 py-2.5 rounded bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/55 focus:outline-none focus:border-[#FF9933]"
                  />
                </div>

                <div>
                  <label htmlFor="aside-pin-code" className="sr-only">
                    4-Digit Secure PIN
                  </label>
                  <input
                    id="aside-pin-code"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={asidePin}
                    onChange={(e) => setAsidePin(e.target.value)}
                    placeholder={uiLang === 'hi' ? '4-अंकीय गुप्त पिन' : '4-Digit Secure PIN'}
                    className="w-full px-3.5 py-2.5 rounded bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/55 focus:outline-none focus:border-[#FF9933]"
                  />
                </div>

                {asideError && (
                  <p role="alert" className="text-xs text-[#FF9933] font-medium">
                    {asideError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded bg-[#FF9933] hover:bg-[#ffaa4d] text-[#162E51] text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{uiLang === 'hi' ? 'स्थिति खोजें' : 'Check Case Status'}</span>
                </button>
              </form>

              {(overview?.sampleComplaints ?? []).length > 0 && (
                <div className="pt-3.5 border-t border-white/15 space-y-2">
                  <p className="font-mono text-[11px] text-white/65">
                    {uiLang === 'hi' ? 'नमूना डेमो टिकट (1-Click):' : 'Sample Demo Cases (1-Click):'}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {(overview?.sampleComplaints ?? []).slice(0, 3).map((sample) => (
                      <button
                        key={sample.trackingCode}
                        type="button"
                        onClick={() => {
                          setAsideCode(sample.trackingCode);
                          setAsidePin(sample.demoPin);
                          setAsideError(null);
                          handleOpenTracker(sample.trackingCode, sample.demoPin);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded bg-white/8 hover:bg-white/15 border border-white/10 text-xs text-left transition-colors cursor-pointer"
                      >
                        <span className="font-mono font-semibold text-[#FF9933] tabular-nums">
                          {sample.trackingCode}
                        </span>
                        <span className="text-white/80 truncate ml-2">{sample.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Variation 5 Service Capabilities Card */}
            <div className="border border-[#162E51]/12 p-5 rounded-xl bg-[#FEFEFE] space-y-4">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
                {uiLang === 'hi' ? 'सेवा क्षमताएँ' : 'Service Capabilities'}
              </span>

              <ul className="space-y-2.5 text-xs text-[#162E51]/85">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {uiLang === 'hi'
                      ? 'बहुभाषी आवाज़ एवं हिंग्लिश एआई वर्गीकरण'
                      : 'Multilingual Voice & Hinglish Triage'}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {uiLang === 'hi'
                      ? 'सत्यापित मोहल्ला एवं वार्ड स्मार्ट रूटिंग'
                      : 'Smart Municipal Ward Routing'}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {uiLang === 'hi'
                      ? 'डुप्लीकेट शिकायत समूह पहचान'
                      : 'Neighborhood Duplicate Detection'}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {uiLang === 'hi'
                      ? 'SHA-256 गुप्त पिन गोपनीयता सुरक्षा'
                      : 'Salted SHA-256 PIN Privacy'}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {uiLang === 'hi'
                      ? 'पहले-और-बाद की फोटो द्वारा नागरिक सत्यापन'
                      : 'Before & After Citizen Verification'}
                  </span>
                </li>
              </ul>

              <div className="pt-2 border-t border-[#162E51]/10">
                <button
                  type="button"
                  onClick={() => handleSelectTab(activeTab === 'officer' ? 'submit' : 'officer')}
                  className="w-full inline-flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-[#005EA2]/30 text-xs font-semibold text-[#005EA2] hover:bg-[#005EA2] hover:text-white transition-colors cursor-pointer"
                >
                  <span>
                    {activeTab === 'officer' ? t.ctaFileGrievance : t.navOfficer}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mt-auto pt-2 text-xs text-[#162E51]/55 space-y-1">
              <p className="font-mono font-semibold text-[#162E51]/70">
                MCC · MCG · MCF · JMC · MCD · BMC · BBMP
              </p>
              <p>© 2026 CivicSaathi AI Prototype. Private submissions require ID + PIN.</p>
            </div>
          </aside>
        </div>

        {/* Row 3: Deep Navy Institutional Footer */}
        <footer className="bg-[#162E51] text-white/90 px-4 sm:px-8 py-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="truncate max-w-3xl text-white/80">{t.footerDisclaimer}</p>
          <nav aria-label="Footer Navigation" className="flex items-center gap-5 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectTab('home')}
              className="hover:text-[#FF9933] transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.navHome}
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('submit')}
              className="hover:text-[#FF9933] transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.navSubmit}
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('track')}
              className="hover:text-[#FF9933] transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.navTrack}
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('officer')}
              className="hover:text-[#FF9933] transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.navOfficer}
            </button>
          </nav>
        </footer>
      </div>
      <AskSaathiWidget />
    </AuthProvider>
  );
}
