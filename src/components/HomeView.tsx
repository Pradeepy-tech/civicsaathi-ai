import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { CivicImage } from './CivicImage.tsx';
import { CATEGORY_LABELS, STATUS_LABELS, UI_COPY } from '../i18n/translations.ts';
import {
  MUNICIPAL_CITIES,
  ORDERED_STATES_UTS,
  VERIFIED_CATEGORY_DIRECTORY,
} from '../data/municipalDirectory.ts';
import type {
  CivicCategory,
  ComplaintStatus,
  PublicDemoCard,
  PublicOverviewResponse,
  UiLanguage,
} from '../types/civic.ts';

const heroCivicImg = '/src/assets/images/hero_civic_india_1793355192505.jpg';

interface HomeViewProps {
  uiLang: UiLanguage;
  overview: PublicOverviewResponse | null;
  loadingOverview: boolean;
  onNavigateSubmit: () => void;
  onNavigateSubmitWithLocation?: (city: string, locality?: string) => void;
  onQuickTrack: (trackingCode: string, pin: string) => void;
  onNavigateOfficer: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  uiLang,
  overview,
  loadingOverview,
  onNavigateSubmit,
  onNavigateSubmitWithLocation,
  onQuickTrack,
  onNavigateOfficer,
}) => {
  const t = UI_COPY[uiLang];

  const [directoryTab, setDirectoryTab] = useState<'municipalities' | 'categories'>('municipalities');
  const [regionTab, setRegionTab] = useState<'FOCUS' | 'Chandigarh (UT)' | 'Haryana' | 'Rajasthan' | 'ALL'>('FOCUS');
  const [dirSearch, setDirSearch] = useState('');
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllSamples, setShowAllSamples] = useState(false);

  const filteredDirectoryCities = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    return MUNICIPAL_CITIES.filter((c) => {
      if (regionTab === 'FOCUS' && !c.isFocusRegion) return false;
      if (
        regionTab !== 'FOCUS' &&
        regionTab !== 'ALL' &&
        c.stateUt !== regionTab
      ) {
        return false;
      }
      if (!q) return true;
      const localitiesJoined = c.wards
        .flatMap((w) => [w.wardName, w.zoneName, ...w.localities])
        .join(' ')
        .toLowerCase();
      const hay = `${c.city} ${c.cityHi} ${c.stateUt} ${c.stateUtHi} ${c.municipalBodyShort} ${c.municipalBodyFull} ${localitiesJoined}`.toLowerCase();
      return hay.includes(q);
    });
  }, [regionTab, dirSearch]);

  const padMetric = (n: number) => String(n).padStart(2, '0');

  const renderStatusText = (card: PublicDemoCard) => {
    const label =
      STATUS_LABELS[card.status as ComplaintStatus]?.[uiLang] || card.status;
    if (card.status === 'Resolved') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#138808]">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    }
    if (card.isEscalated) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#DC2626]">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{uiLang === 'hi' ? `${label} · समय-सीमा पार` : 'Escalated'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B45309]">
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-12">
      {/* Section 1: Hero Split + 4-Card Institutional Stats Grid */}
      <section className="space-y-10">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
          {/* Left Editorial Proposition */}
          <div className="xl:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="font-mono text-xs font-bold tracking-wider text-[#005EA2] block">
                {uiLang === 'hi'
                  ? 'नागरिक शिकायत पोर्टल · चंडीगढ़ · हरियाणा · राजस्थान · दिल्ली एनसीआर · संपूर्ण भारत'
                  : 'Citizen Grievance Redressal · Chandigarh · Haryana · Rajasthan · Pan-India ULBs'}
              </span>

              <h1
                className="font-display font-bold text-[#162E51] leading-[1.1]"
                style={{ fontSize: 'clamp(2.35rem, 4.2vw, 3.6rem)' }}
              >
                {t.heroHeadline}
              </h1>

              <p className="text-base text-[#162E51]/75 max-w-2xl leading-relaxed">
                {t.heroSubheadline}
              </p>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={onNavigateSubmit}
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-[0_2px_6px_rgba(0,94,162,0.22)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005EA2]"
              >
                <span>{t.heroPrimaryBtn}</span>
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onNavigateOfficer}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded bg-white border border-[#005EA2] text-xs sm:text-sm font-semibold text-[#005EA2] hover:bg-[#005EA2]/8 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{uiLang === 'hi' ? 'अधिकारी लॉगिन / डैशबोर्ड' : 'Officer Login'}</span>
              </button>
            </div>
          </div>

          {/* Right Framed Civic Photograph */}
          <div className="xl:col-span-5 flex">
            <div className="relative w-full min-h-[250px] rounded-xl border border-[#162E51]/12 bg-white overflow-hidden">
              <CivicImage
                src={heroCivicImg}
                alt="Clean tree-lined modern Indian metropolitan avenue with solar streetlights and pedestrian walkway"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#162E51]/90 via-[#162E51]/35 to-transparent flex flex-col justify-end p-5">
                <p className="font-mono text-xs font-bold text-[#FF9933]">
                  {uiLang === 'hi'
                    ? 'हिन्दी · अंग्रेज़ी · हिंग्लिश · मराठी · तमिल · पंजाबी · बंगाली · तेलुगु'
                    : 'Hindi · English · Hinglish · Marathi · Tamil · Punjabi · Bengali · Telugu'}
                </p>
                <p className="text-xs text-white/90 mt-1">
                  {uiLang === 'hi'
                    ? 'पंजीकरण से पूर्व नागरिक पुष्टि · गुप्त पिन सुरक्षा · समयबद्ध वार्ड रूटिंग'
                    : 'Citizen confirmation before registration · PIN-isolated privacy · Auditable SLA routing'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Variation 5 4-Column Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-lg border border-[#162E51]/12">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
              {uiLang === 'hi' ? 'पंजीकृत' : 'Registered'}
            </span>
            <span className="text-3xl font-bold tabular-nums text-[#162E51] block mt-1">
              {loadingOverview ? '—' : padMetric(overview?.stats.totalComplaints ?? 6)}
            </span>
          </div>

          <div className="bg-white p-5 rounded-lg border border-[#162E51]/12">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
              {uiLang === 'hi' ? 'समाधान पूर्ण' : 'Resolved'}
            </span>
            <span className="text-3xl font-bold tabular-nums text-[#138808] block mt-1">
              {loadingOverview ? '—' : padMetric(overview?.stats.resolvedCount ?? 1)}
            </span>
          </div>

          <div className="bg-white p-5 rounded-lg border border-[#162E51]/12">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
              {uiLang === 'hi' ? 'अनुपालन' : 'Compliance'}
            </span>
            <span className="text-3xl font-bold tabular-nums text-[#162E51] block mt-1">
              {loadingOverview ? '—' : `${overview?.stats.avgSlaCompliancePct ?? 83}%`}
            </span>
          </div>

          <div className="bg-white p-5 rounded-lg border border-[#162E51]/12">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2] block">
              {uiLang === 'hi' ? 'नगर निकाय / वार्ड' : 'ULBs & Wards'}
            </span>
            <span className="text-3xl font-bold tabular-nums text-[#162E51] block mt-1">
              {loadingOverview
                ? '—'
                : `${padMetric(overview?.stats.citiesCovered ?? MUNICIPAL_CITIES.length)} · ${padMetric(overview?.wards.length ?? 76)}W`}
            </span>
          </div>
        </div>
      </section>

      {/* Section 2: Recent Case Records (Fictional Demo Data) */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3.5 border-b border-[#162E51]/12">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#162E51]">
              {t.sectionCasesTitle}
            </h2>
            <p className="text-sm text-[#162E51]/70 mt-0.5">{t.sectionCasesSub}</p>
          </div>
          <span className="font-mono text-xs font-semibold text-[#162E51]/55 shrink-0">
            {uiLang === 'hi'
              ? 'केवल काल्पनिक डेमो रिकॉर्ड सार्वजनिक'
              : 'Fictional Demo Records Only'}
          </span>
        </div>

        {loadingOverview ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-28 rounded-xl bg-white border border-[#162E51]/12 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {(showAllSamples
              ? overview?.sampleComplaints ?? []
              : (overview?.sampleComplaints ?? []).slice(0, 6)
            ).map((sample) => {
              const catLabel =
                CATEGORY_LABELS[sample.category as CivicCategory]?.[uiLang] ||
                sample.category;

              return (
                <article
                  key={sample.trackingCode}
                  className="bg-white rounded-xl border border-[#162E51]/12 p-6 hover:border-[#005EA2]/35 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#162E51]/60">
                        <span className="font-bold text-[#005EA2]">
                          {sample.city.toUpperCase()} · {catLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-semibold text-[#162E51]">
                          ID: {sample.trackingCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{sample.departmentName}</span>
                      </div>

                      <h3 className="font-sans text-base font-semibold text-[#162E51]">
                        {sample.interpretedSummary}
                      </h3>

                      <p className="text-xs text-[#162E51]/70 italic line-clamp-2">
                        “{sample.rawDescription}”
                      </p>
                    </div>

                    {(sample.afterImageUrl || sample.beforeImageUrl) && (
                      <div className="w-full sm:w-40 h-24 rounded-lg border border-[#162E51]/12 bg-[#F8F9FA] shrink-0 overflow-hidden relative">
                        <CivicImage
                          src={sample.afterImageUrl || sample.beforeImageUrl || ''}
                          alt={sample.interpretedSummary}
                          className="w-full h-full object-cover"
                        />
                        {sample.beforeImageUrl && sample.afterImageUrl && (
                          <span className="absolute bottom-0 inset-x-0 bg-[#162E51]/85 px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
                            Before + After
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-2.5 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#162E51]/10">
                      {renderStatusText(sample)}
                      <span className="font-mono text-[11px] text-[#162E51]/60 tabular-nums">
                        PIN: <strong className="text-[#162E51]">{sample.demoPin}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => onQuickTrack(sample.trackingCode, sample.demoPin)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md border border-[#162E51]/20 bg-[#F8F9FA] hover:bg-[#005EA2] hover:text-white hover:border-[#005EA2] text-xs font-bold text-[#162E51] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span>
                          {sample.status === 'Resolved'
                            ? uiLang === 'hi'
                              ? 'सत्यापित करें'
                              : 'Verify'
                            : uiLang === 'hi'
                              ? 'ट्रैक करें'
                              : 'Track'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {(overview?.sampleComplaints?.length ?? 0) > 6 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllSamples((v) => !v)}
                  className="px-4 py-2 rounded-lg border border-[#162E51]/20 bg-white hover:border-[#005EA2] text-xs font-semibold text-[#005EA2] transition-colors cursor-pointer"
                >
                  {showAllSamples
                    ? uiLang === 'hi'
                      ? 'कम नमूना प्रकरण दिखाएँ'
                      : 'Show Fewer Sample Cases'
                    : uiLang === 'hi'
                      ? `सभी ${overview?.sampleComplaints.length} नमूना प्रकरण देखें (चंडीगढ़, गुरुग्राम, जयपुर सहित)`
                      : `Show All ${overview?.sampleComplaints.length} Sample Cases (incl. Chandigarh, Gurugram & Jaipur)`}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 2B: Verified All-India Municipal Bodies, Localities & Categories Directory */}
      <section className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3.5 border-b border-[#162E51]/12">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] block mb-0.5">
              {uiLang === 'hi'
                ? `${ORDERED_STATES_UTS.length} राज्य/केंद्र शासित प्रदेश · ${MUNICIPAL_CITIES.length} नगर निकाय · 12 सत्यापित श्रेणियाँ`
                : `${ORDERED_STATES_UTS.length} States & UTs · ${MUNICIPAL_CITIES.length} Municipal Bodies · 12 Verified Categories`}
            </span>
            <h2 className="font-display text-2xl font-bold text-[#162E51]">
              {uiLang === 'hi'
                ? 'सत्यापित नगर निगम, मोहल्ला/सेक्टर एवं शिकायत श्रेणी निर्देशिका'
                : 'Verified Municipal Bodies, Localities & Grievance Categories'}
            </h2>
          </div>

          <div
            role="group"
            aria-label="Directory View"
            className="inline-flex p-0.5 rounded-lg border border-[#162E51]/15 bg-white self-start md:self-auto shrink-0"
          >
            <button
              type="button"
              onClick={() => setDirectoryTab('municipalities')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                directoryTab === 'municipalities'
                  ? 'bg-[#005EA2] text-white'
                  : 'text-[#162E51]/75 hover:text-[#162E51]'
              }`}
            >
              {uiLang === 'hi'
                ? `नगर निकाय एवं मोहल्ले (${MUNICIPAL_CITIES.length})`
                : `Cities & Localities (${MUNICIPAL_CITIES.length})`}
            </button>
            <button
              type="button"
              onClick={() => setDirectoryTab('categories')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                directoryTab === 'categories'
                  ? 'bg-[#005EA2] text-white'
                  : 'text-[#162E51]/75 hover:text-[#162E51]'
              }`}
            >
              {uiLang === 'hi'
                ? `सत्यापित श्रेणियाँ (${VERIFIED_CATEGORY_DIRECTORY.length})`
                : `Verified Categories (${VERIFIED_CATEGORY_DIRECTORY.length})`}
            </button>
          </div>
        </div>

        {directoryTab === 'municipalities' ? (
          <div className="bg-white rounded-xl border border-[#162E51]/12 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    {
                      id: 'FOCUS',
                      labelEn: 'Focus: Chandigarh, Haryana & Rajasthan (29)',
                      labelHi: 'प्रमुख: चंडीगढ़, हरियाणा व राजस्थान (29)',
                    },
                    { id: 'Chandigarh (UT)', labelEn: 'Chandigarh (MCC)', labelHi: 'चंडीगढ़ (MCC)' },
                    { id: 'Haryana', labelEn: 'Haryana (16 ULBs)', labelHi: 'हरियाणा (16 निकाय)' },
                    { id: 'Rajasthan', labelEn: 'Rajasthan (12 ULBs)', labelHi: 'राजस्थान (12 निकाय)' },
                    {
                      id: 'ALL',
                      labelEn: `All India (${MUNICIPAL_CITIES.length})`,
                      labelHi: `संपूर्ण भारत (${MUNICIPAL_CITIES.length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setRegionTab(tab.id);
                      setShowAllCities(false);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                      regionTab === tab.id
                        ? 'bg-[#162E51] text-white border-[#162E51]'
                        : 'bg-[#F8F9FA] text-[#162E51]/75 border-[#162E51]/15 hover:border-[#005EA2] hover:text-[#005EA2]'
                    }`}
                  >
                    {uiLang === 'hi' ? tab.labelHi : tab.labelEn}
                  </button>
                ))}
              </div>

              <div className="relative w-full lg:w-72 shrink-0">
                <Search className="w-4 h-4 text-[#162E51]/45 absolute left-3 top-2.5" aria-hidden="true" />
                <input
                  type="text"
                  value={dirSearch}
                  onChange={(e) => {
                    setDirSearch(e.target.value);
                    setShowAllCities(true);
                  }}
                  placeholder={
                    uiLang === 'hi'
                      ? 'शहर, नगर निगम या सेक्टर खोजें...'
                      : 'Search city, ULB, sector, locality...'
                  }
                  aria-label="Search municipal bodies and verified localities"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] placeholder:text-[#162E51]/45 focus:outline-none focus:border-[#005EA2] focus:bg-white"
                />
              </div>
            </div>

            {filteredDirectoryCities.length === 0 ? (
              <p className="text-xs text-[#162E51]/65 py-6 text-center">
                {uiLang === 'hi'
                  ? 'कोई मिलान करने वाला शहर या सेक्टर नहीं मिला। कृपया "संपूर्ण भारत" टैब चुनें।'
                  : 'No matching city or locality in this filter. Switch to "All India" to search all 62 municipal bodies.'}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(showAllCities
                    ? filteredDirectoryCities
                    : filteredDirectoryCities.slice(0, 9)
                  ).map((entry) => {
                    const sampleLocalities = entry.wards.flatMap((w) => w.localities);
                    return (
                      <div
                        key={entry.city}
                        className="rounded-lg border border-[#162E51]/12 bg-[#F8F9FA] p-4 flex flex-col justify-between gap-3 hover:border-[#005EA2]/40 transition-colors"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-sans text-sm font-bold text-[#162E51]">
                                {uiLang === 'hi' ? `${entry.cityHi} (${entry.city})` : entry.city}
                              </h3>
                              <p className="font-mono text-[11px] font-semibold text-[#005EA2]">
                                {entry.municipalBodyFull}
                              </p>
                            </div>
                            <span className="font-mono text-[11px] text-[#162E51]/60 shrink-0 tabular-nums">
                              {entry.wards.length}W · {sampleLocalities.length}L
                            </span>
                          </div>

                          <p className="text-[11px] text-[#162E51]/65">
                            {uiLang === 'hi' ? entry.stateUtHi : entry.stateUt} · Helpline:{' '}
                            <span className="font-mono font-semibold text-[#162E51]/80">
                              {entry.civicHelpline}
                            </span>
                          </p>

                          <p className="text-xs text-[#162E51]/80 line-clamp-2 leading-relaxed">
                            <span className="font-semibold text-[#138808]">
                              {uiLang === 'hi' ? 'सत्यापित क्षेत्र: ' : 'Verified: '}
                            </span>
                            {sampleLocalities.slice(0, 7).join(', ')}
                            {sampleLocalities.length > 7
                              ? ` +${sampleLocalities.length - 7} more`
                              : ''}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-[#162E51]/10 flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-[#162E51]/55">
                            ID Prefix: CS-{entry.trackingPrefix}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onNavigateSubmitWithLocation
                                ? onNavigateSubmitWithLocation(entry.city, sampleLocalities[0])
                                : onNavigateSubmit()
                            }
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#005EA2] hover:text-[#162E51] cursor-pointer"
                          >
                            <span>
                              {uiLang === 'hi' ? 'यहाँ शिकायत दर्ज करें' : 'File Grievance'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredDirectoryCities.length > 9 && (
                  <div className="pt-1 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-[#162E51]/60 tabular-nums">
                      Showing{' '}
                      {showAllCities ? filteredDirectoryCities.length : Math.min(9, filteredDirectoryCities.length)}{' '}
                      of {filteredDirectoryCities.length} verified municipal bodies
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllCities((v) => !v)}
                      className="px-4 py-2 rounded-lg border border-[#162E51]/20 bg-[#F8F9FA] hover:border-[#005EA2] text-xs font-semibold text-[#005EA2] transition-colors cursor-pointer"
                    >
                      {showAllCities
                        ? uiLang === 'hi'
                          ? 'संक्षिप्त सूची दिखाएँ'
                          : 'Collapse List'
                        : uiLang === 'hi'
                          ? `सभी ${filteredDirectoryCities.length} नगर निकाय देखें`
                          : `View All ${filteredDirectoryCities.length} Municipal Bodies`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#162E51]/12 p-5 sm:p-6 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#162E51]/15 font-mono text-[#005EA2] uppercase">
                  <th className="py-2.5 pr-4 font-semibold">Verified Category</th>
                  <th className="py-2.5 pr-4 font-semibold">Responsible Municipal Wing</th>
                  <th className="py-2.5 pr-4 font-semibold">Covered Issues &amp; Verification Scope</th>
                  <th className="py-2.5 font-semibold text-right whitespace-nowrap">Critical / Std SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#162E51]/10">
                {VERIFIED_CATEGORY_DIRECTORY.map((item) => (
                  <tr key={item.category} className="align-top">
                    <td className="py-3 pr-4 font-semibold text-[#162E51] whitespace-nowrap">
                      {CATEGORY_LABELS[item.category][uiLang]}
                    </td>
                    <td className="py-3 pr-4 text-[#162E51]/85">
                      <span className="font-mono text-[11px] font-bold text-[#005EA2] mr-1.5">
                        [{item.departmentCode}]
                      </span>
                      {uiLang === 'hi' ? item.departmentNameHi : item.departmentNameEn}
                    </td>
                    <td className="py-3 pr-4 text-[#162E51]/70 max-w-md">
                      {uiLang === 'hi' ? item.verifiedScopeHi : item.verifiedScopeEn}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[#162E51] whitespace-nowrap">
                      <span className="font-bold text-[#DC2626]">{item.slaCriticalHours}h</span> /{' '}
                      <span>{item.slaMediumHours}h</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: 4-Chapter Civic Accountability Architecture */}
      <section className="space-y-5">
        <div className="pb-3.5 border-b border-[#162E51]/12">
          <h2 className="font-display text-2xl font-bold text-[#162E51]">
            {t.sectionHowTitle}
          </h2>
          <p className="text-sm text-[#162E51]/70 mt-0.5">{t.sectionHowSub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-2">
            <span className="font-mono text-xs font-bold text-[#005EA2]">01. Multilingual Triage</span>
            <h3 className="font-display text-xl font-bold text-[#162E51]">
              {uiLang === 'hi'
                ? 'बहुभाषी आवाज़ एवं क्षेत्रीय लिपि वर्गीकरण'
                : 'Voice & Regional Script Classification'}
            </h3>
            <p className="text-sm text-[#162E51]/75 leading-relaxed">
              {uiLang === 'hi'
                ? 'नागरिक अपनी क्षेत्रीय भाषा या हिंग्लिश में बोलकर या लिखकर समस्या बताते हैं। सर्वर एआई सारांश, श्रेणी और फॉलो-अप प्रश्न तैयार करता है तथा अनुपलब्धता में नियम-आधारित वर्गीकरण दिखाता है।'
                : 'Speak or type naturally in Hindi, Hinglish, Marathi, Tamil, Punjabi, Bengali, Telugu, or English. Server-side AI extracts location cues, asks follow-ups, and falls back to transparent keyword rules when needed.'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-2">
            <span className="font-mono text-xs font-bold text-[#005EA2]">02. Ward Routing</span>
            <h3 className="font-display text-xl font-bold text-[#162E51]">
              {uiLang === 'hi'
                ? 'सत्यापित मोहल्ला एवं विभाग स्मार्ट रूटिंग'
                : 'Configurable Locality-to-Ward Routing'}
            </h3>
            <p className="text-sm text-[#162E51]/75 leading-relaxed">
              {uiLang === 'hi'
                ? 'सत्यापित मोहल्ले या सेक्टर के आधार पर चंडीगढ़ (MCC), गुरुग्राम (MCG), फ़रीदाबाद (MCF), जयपुर (JMC), दिल्ली (MCD) और संपूर्ण भारत के नगर निकायों के वार्ड व विभाग स्वतः तय होते हैं।'
                : 'Maps verified sectors and localities across Chandigarh (MCC), Haryana (MCG, MCF, MCP, KMC & 12 ULBs), Rajasthan (JMC, JdMC, UMC, Kota & 8 ULBs), and Pan-India corporations to responsible municipal wings.'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-2">
            <span className="font-mono text-xs font-bold text-[#005EA2]">03. Hazard &amp; Duplicates</span>
            <h3 className="font-display text-xl font-bold text-[#162E51]">
              {uiLang === 'hi'
                ? 'डुप्लीकेट क्लस्टर एवं 6-घंटे आपातकालीन SLA'
                : 'Duplicate Clustering & 6h Critical SLA'}
            </h3>
            <p className="text-sm text-[#162E51]/75 leading-relaxed">
              {uiLang === 'hi'
                ? 'खुले मैनहोल, टूटे बिजली के तार या मुख्य पाइपलाइन फटने पर स्वतः Critical प्राथमिकता मिलती है और समान शिकायतें प्रत्येक नागरिक की स्वतंत्र आईडी सुरक्षित रखते हुए जुड़ती हैं।'
                : 'Assigns 6-hour Critical SLA to live wires, open manholes, and major pipe bursts while linking neighborhood duplicate reports without merging away individual Tracking IDs.'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-2">
            <span className="font-mono text-xs font-bold text-[#005EA2]">04. Citizen Verification</span>
            <h3 className="font-display text-xl font-bold text-[#162E51]">
              {uiLang === 'hi'
                ? 'पहले-और-बाद की फोटो द्वारा समाधान सत्यापन'
                : 'Before-and-After Citizen Sign-Off'}
            </h3>
            <p className="text-sm text-[#162E51]/75 leading-relaxed">
              {uiLang === 'hi'
                ? 'अधिकारी द्वारा Resolved चिह्नित करने के बाद नागरिक अपने पिन से मरम्मत की फोटो देखकर समाधान की पुष्टि कर सकते हैं या शिकायत को पुनः खोल सकते हैं।'
                : 'Citizens unlock their ticket with Tracking ID + PIN, inspect post-repair evidence alongside their original photo, and either confirm closure or reopen the ticket with elevated priority.'}
            </p>
            <div className="pt-1 flex items-center gap-2 text-xs font-semibold text-[#138808]">
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>PIN-Isolated Privacy · Automatic Overdue Escalation</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
