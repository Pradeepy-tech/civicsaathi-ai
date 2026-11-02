import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  LogIn,
  LogOut,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Upload,
  Trash2,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { oAuthClientId } from '../lib/firebase.ts';
import { safeFetchJson } from '../lib/apiClient.ts';
import { CivicImage, compressImageFile } from './CivicImage.tsx';
import {
  CIVIC_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type ComplaintDetail,
  type ComplaintPriority,
  type ComplaintStatus,
  type OfficerDashboardResponse,
  type UiLanguage,
} from '../types/civic.ts';
import { UI_COPY } from '../i18n/translations.ts';
import { MUNICIPAL_CITIES, ORDERED_STATES_UTS } from '../data/municipalDirectory.ts';

interface OfficerDashboardViewProps {
  uiLang: UiLanguage;
  onDataUpdated: () => void;
}

export const OfficerDashboardView: React.FC<OfficerDashboardViewProps> = ({
  uiLang,
  onDataUpdated,
}) => {
  const t = UI_COPY[uiLang];
  const {
    user,
    authReady,
    signingIn,
    authError,
    signInOfficer,
    signInWithGoogleIdToken,
    signOutOfficer,
    getFreshIdToken,
  } = useAuth();
  const gsiButtonRef = React.useRef<HTMLDivElement | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const isEmbeddedFrame = typeof window !== 'undefined' && window.self !== window.top;

  const [dashboard, setDashboard] = useState<OfficerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | '24H' | '7D' | 'OVERDUE'>('ALL');

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<ComplaintStatus>('In Progress');
  const [nextPriority, setNextPriority] = useState<ComplaintPriority>('Medium');
  const [nextDeptCode, setNextDeptCode] = useState<string>('');
  const [nextOfficerName, setNextOfficerName] = useState<string>('');
  const [officerComment, setOfficerComment] = useState<string>('');
  const [afterImageUri, setAfterImageUri] = useState<string | null>(null);
  const [savingUpdate, setSavingUpdate] = useState(false);

  const [switchingRole, setSwitchingRole] = useState(false);
  const [showAdminDirectory, setShowAdminDirectory] = useState(false);

  const optionClass = 'bg-white text-[#162E51]';

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('Missing authentication token.');
      const parsed = await safeFetchJson<OfficerDashboardResponse>(
        '/api/officer/dashboard',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
        { fallbackError: 'Failed to load officer dashboard.' }
      );
      setDashboard(parsed);
      if (parsed.complaints.length > 0) {
        setSelectedCode((prev) =>
          prev && parsed.complaints.some((c) => c.trackingCode === prev)
            ? prev
            : parsed.complaints[0].trackingCode
        );
      } else {
        setSelectedCode(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading dashboard.');
    } finally {
      setLoading(false);
    }
  }, [user, getFreshIdToken]);

  useEffect(() => {
    if (user) {
      loadDashboard();
    } else {
      setDashboard(null);
    }
  }, [user, loadDashboard]);

  useEffect(() => {
    if (user || !authReady || !oAuthClientId) return;

    type GsiWindow = Window & {
      google?: {
        accounts?: {
          id?: {
            initialize: (cfg: {
              client_id: string;
              callback: (resp: { credential?: string }) => void;
              ux_mode?: 'popup';
              use_fedcm_for_prompt?: boolean;
            }) => void;
            renderButton: (
              parent: HTMLElement,
              options: {
                theme?: 'outline' | 'filled_blue';
                size?: 'large' | 'medium';
                text?: 'signin_with' | 'continue_with';
                shape?: 'rectangular';
                width?: number;
              }
            ) => void;
          };
        };
      };
    };

    const renderGsi = () => {
      const win = window as GsiWindow;
      if (!win.google?.accounts?.id || !gsiButtonRef.current) return;
      gsiButtonRef.current.innerHTML = '';
      win.google.accounts.id.initialize({
        client_id: oAuthClientId,
        ux_mode: 'popup',
        use_fedcm_for_prompt: true,
        callback: (resp) => {
          if (resp.credential) {
            void signInWithGoogleIdToken(resp.credential);
          }
        },
      });
      win.google.accounts.id.renderButton(gsiButtonRef.current, {
        theme: 'filled_blue',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 340,
      });
      setGsiReady(true);
    };

    const existingScript = document.getElementById('google-gsi-client-script') as HTMLScriptElement | null;
    if (existingScript) {
      renderGsi();
      existingScript.addEventListener('load', renderGsi);
      return () => existingScript.removeEventListener('load', renderGsi);
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = renderGsi;
    document.head.appendChild(script);
  }, [user, authReady, signInWithGoogleIdToken]);

  const selectedComplaint: ComplaintDetail | null = useMemo(() => {
    if (!dashboard || !selectedCode) return null;
    return dashboard.complaints.find((c) => c.trackingCode === selectedCode) || null;
  }, [dashboard, selectedCode]);

  useEffect(() => {
    if (selectedComplaint) {
      setNextStatus(selectedComplaint.status as ComplaintStatus);
      setNextPriority(selectedComplaint.priority as ComplaintPriority);
      setNextDeptCode(selectedComplaint.departmentCode);
      setNextOfficerName(
        selectedComplaint.assignedOfficerName || dashboard?.profile.displayName || ''
      );
      setOfficerComment('');
      setAfterImageUri(null);
    }
  }, [selectedComplaint, dashboard?.profile.displayName]);

  const filteredComplaints = useMemo(() => {
    if (!dashboard) return [];
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();

    return dashboard.complaints.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (cityFilter !== 'ALL' && c.city !== cityFilter) return false;
      if (deptFilter !== 'ALL' && c.departmentCode !== deptFilter) return false;

      if (dateFilter === '24H') {
        if (now - new Date(c.createdAt).getTime() > 24 * 3600 * 1000) return false;
      } else if (dateFilter === '7D') {
        if (now - new Date(c.createdAt).getTime() > 7 * 24 * 3600 * 1000) return false;
      } else if (dateFilter === 'OVERDUE') {
        const isOverdue =
          (c.status === 'Pending' || c.status === 'In Progress') &&
          (c.isEscalated || new Date(c.slaDeadline).getTime() < now);
        if (!isOverdue) return false;
      }

      if (q) {
        const hay =
          `${c.trackingCode} ${c.interpretedSummary} ${c.rawDescription} ${c.locality} ${c.wardName} ${c.citizenName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    dashboard,
    searchQuery,
    statusFilter,
    categoryFilter,
    cityFilter,
    deptFilter,
    dateFilter,
  ]);

  const handleAfterPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setAfterImageUri(compressed);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid resolution image.');
    }
  };

  const handleSaveComplaintUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    if (officerComment.trim().length < 3) {
      setErrorMsg('Please enter an official status remark (minimum 3 characters).');
      return;
    }

    setSavingUpdate(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      await safeFetchJson(
        `/api/officer/complaints/${selectedComplaint.trackingCode}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: nextStatus,
            priority: nextPriority,
            departmentCode: nextDeptCode,
            assignedOfficerName: nextOfficerName.trim(),
            comment: officerComment.trim(),
            afterImageDataUri: afterImageUri,
          }),
        },
        { fallbackError: 'Could not update complaint.' }
      );

      setSuccessMsg(`Updated ${selectedComplaint.trackingCode} to "${nextStatus}".`);
      setOfficerComment('');
      setAfterImageUri(null);
      await loadDashboard();
      onDataUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleSwitchRbacScope = async (
    targetUid: string,
    role: 'super_admin' | 'department_officer',
    departmentCode: string | null,
    cityScope: string | null = null
  ) => {
    setSwitchingRole(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('Authentication required.');
      await safeFetchJson(
        '/api/officer/rbac',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetUid,
            role,
            departmentCode,
            cityScope,
          }),
        },
        { fallbackError: 'Could not update RBAC scope.' }
      );
      setSuccessMsg(
        role === 'super_admin'
          ? 'Active RBAC scope set to Municipal Super Admin (All Departments).'
          : `Active RBAC scope restricted to Department: ${departmentCode}.`
      );
      await loadDashboard();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'RBAC update failed.');
    } finally {
      setSwitchingRole(false);
    }
  };

  if (!authReady) {
    return (
      <div className="py-16 text-center font-mono text-xs uppercase tracking-wider text-[#162E51]/60">
        Checking officer authentication state...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl py-6">
        <div className="bg-white rounded-xl border border-[#162E51]/12 p-8 space-y-6">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-lg bg-[#005EA2]/10 border border-[#005EA2]/25 text-[#005EA2] flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="font-display text-3xl font-bold text-[#162E51]">
              {t.officerTitle}
            </h1>
            <p className="text-sm text-[#162E51]/75 leading-relaxed">
              {uiLang === 'hi'
                ? 'नागरिकों की व्यक्तिगत जानकारी और शिकायत प्रबंधन केवल प्रमाणित नगर निगम अधिकारियों और नोडल प्रशासकों के लिए प्रतिबंधित है।'
                : 'Access to departmental queues, citizen contact records, assignment routing, and SLA analytics requires authenticated Google Sign-In with Role-Based Access Control (RBAC).'}
            </p>
          </div>

          {authError && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
              {authError}
            </div>
          )}

          <div className="space-y-3">
            <div
              ref={gsiButtonRef}
              className={gsiReady ? 'flex justify-center min-h-[44px]' : 'hidden'}
            />

            <button
              type="button"
              onClick={signInOfficer}
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm disabled:opacity-60 transition-colors cursor-pointer"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>
                {gsiReady
                  ? 'Alternate: Sign In via Popup Window'
                  : 'Sign In with Google (Officer / Admin Access)'}
              </span>
            </button>

            {isEmbeddedFrame && typeof window !== 'undefined' && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-[#162E51]/20 bg-[#F8F9FA] hover:border-[#005EA2] text-[#162E51] text-xs font-semibold transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#005EA2]" />
                <span>Open Portal in Full Browser Tab (Recommended if Popup Storage Is Blocked)</span>
              </a>
            )}
          </div>

          <p className="text-xs text-[#162E51]/60 border-t border-[#162E51]/10 pt-4 leading-relaxed">
            Department officers only see grievances routed to their authorized municipal wing. The project owner account is automatically provisioned with Nodal Super Admin access and an interactive RBAC department tester.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header & Officer Identity Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-[#162E51]/12">
        <div>
          <p className="font-mono text-xs text-[#162E51]/65">
            <span>Authenticated Console</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{dashboard?.profile.email || user.email}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-bold text-[#005EA2]">
              {dashboard?.profile.role === 'super_admin'
                ? 'SUPER ADMIN (ALL DEPARTMENTS)'
                : `DEPT OFFICER (${dashboard?.profile.departmentCode || 'ASSIGNED WING'})`}
            </span>
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#162E51] mt-1">
            {t.officerTitle}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {dashboard?.profile.canSimulateRoles && (
            <div className="flex items-center gap-2">
              <label htmlFor="rbac-scope-select" className="text-xs font-medium text-[#162E51]/75">
                RBAC Scope:
              </label>
              <select
                id="rbac-scope-select"
                disabled={switchingRole}
                value={
                  dashboard.profile.role === 'super_admin'
                    ? 'SUPER_ADMIN'
                    : dashboard.profile.departmentCode || 'WATER'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'SUPER_ADMIN') {
                    handleSwitchRbacScope(dashboard.profile.uid, 'super_admin', null);
                  } else {
                    handleSwitchRbacScope(dashboard.profile.uid, 'department_officer', val);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-white border border-[#162E51]/20 text-xs font-semibold text-[#005EA2] focus:outline-none focus:border-[#005EA2]"
              >
                <option value="SUPER_ADMIN" className={optionClass}>
                  Super Admin (All Departments)
                </option>
                {dashboard.departments.map((d) => (
                  <option key={d.code} value={d.code} className={optionClass}>
                    Officer — {d.code} Only
                  </option>
                ))}
              </select>
            </div>
          )}

          {dashboard?.profile.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => setShowAdminDirectory((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#162E51] bg-white border border-[#162E51]/20 hover:border-[#005EA2] hover:text-[#005EA2] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Routing &amp; Officers</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#162E51] bg-white border border-[#162E51]/20 hover:border-[#005EA2] hover:text-[#005EA2] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={signOutOfficer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#162E51] bg-[#F8F9FA] border border-[#162E51]/20 hover:border-[#DC2626] hover:text-[#DC2626] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3 text-xs sm:text-sm text-red-900"
        >
          <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-xs sm:text-sm text-emerald-950"
        >
          <CheckCircle2 className="w-5 h-5 text-[#138808] shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Optional Nodal Admin Routing & Officer Directory Panel */}
      {showAdminDirectory && dashboard && dashboard.profile.role === 'super_admin' && (
        <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-[#162E51]">
                Configured Department Routing Rules, Municipal Coverage &amp; Officer RBAC
              </h2>
              <p className="text-xs text-[#162E51]/65 mt-0.5">
                {ORDERED_STATES_UTS.length} States &amp; UTs · {MUNICIPAL_CITIES.length} Municipal Bodies (incl. Chandigarh MCC, 16 Haryana ULBs &amp; 12 Rajasthan ULBs) · {dashboard.wards.length} Verified Wards · {dashboard.departments.length} Departments
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminDirectory(false)}
              className="text-xs font-semibold text-[#005EA2] hover:underline cursor-pointer"
            >
              Close Panel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#162E51]/15 font-mono text-[#005EA2] uppercase">
                  <th className="py-2.5 pr-4 font-semibold">Dept Code</th>
                  <th className="py-2.5 pr-4 font-semibold">Department Name</th>
                  <th className="py-2.5 pr-4 font-semibold">Mapped Category</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Critical SLA</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">High SLA</th>
                  <th className="py-2.5 font-semibold text-right">Medium SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#162E51]/10">
                {dashboard.departments.map((d) => (
                  <tr key={d.code} className="h-9">
                    <td className="py-2 pr-4 font-mono font-bold text-[#162E51]">{d.code}</td>
                    <td className="py-2 pr-4 text-[#162E51]/85">{d.nameEn}</td>
                    <td className="py-2 pr-4 text-[#162E51]/65">{d.categoryMapped}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{d.slaHoursCritical}h</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{d.slaHoursHigh}h</td>
                    <td className="py-2 text-right tabular-nums">{d.slaHoursMedium}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-4 border-t border-[#162E51]/10">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2] mb-2.5">
              Registered Officer Accounts ({dashboard.officers.length})
            </h3>
            <div className="space-y-2">
              {dashboard.officers.map((off) => (
                <div
                  key={off.uid}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 px-3.5 rounded-lg bg-[#F8F9FA] border border-[#162E51]/12 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[#162E51]">{off.displayName}</span>
                    <span className="text-[#162E51]/60"> · {off.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Assign role for ${off.email}`}
                      value={off.role === 'super_admin' ? 'SUPER_ADMIN' : off.departmentCode || 'WATER'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'SUPER_ADMIN') {
                          handleSwitchRbacScope(off.uid, 'super_admin', null);
                        } else {
                          handleSwitchRbacScope(off.uid, 'department_officer', v);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded bg-white border border-[#162E51]/20 text-xs text-[#162E51]"
                    >
                      <option value="SUPER_ADMIN" className={optionClass}>
                        Super Admin (All Depts)
                      </option>
                      {dashboard.departments.map((d) => (
                        <option key={d.code} value={d.code} className={optionClass}>
                          Officer: {d.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5-Card Institutional KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('ALL');
            setDateFilter('ALL');
          }}
          className="text-left bg-white hover:border-[#005EA2] rounded-lg border border-[#162E51]/12 p-5 transition-colors cursor-pointer"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
            Total Authorized
          </p>
          <p className="text-2xl font-bold tabular-nums text-[#162E51] mt-1">
            {loading && !dashboard ? '—' : dashboard?.kpis.total ?? 0}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('Pending');
            setDateFilter('ALL');
          }}
          className="text-left bg-white hover:border-[#005EA2] rounded-lg border border-[#162E51]/12 p-5 transition-colors cursor-pointer"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#B45309]">
            Pending Triage
          </p>
          <p className="text-2xl font-bold tabular-nums text-[#B45309] mt-1">
            {loading && !dashboard ? '—' : dashboard?.kpis.pending ?? 0}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('In Progress');
            setDateFilter('ALL');
          }}
          className="text-left bg-white hover:border-[#005EA2] rounded-lg border border-[#162E51]/12 p-5 transition-colors cursor-pointer"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#005EA2]">
            In Progress
          </p>
          <p className="text-2xl font-bold tabular-nums text-[#162E51] mt-1">
            {loading && !dashboard ? '—' : dashboard?.kpis.inProgress ?? 0}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('Resolved');
            setDateFilter('ALL');
          }}
          className="text-left bg-white hover:border-[#005EA2] rounded-lg border border-[#162E51]/12 p-5 transition-colors cursor-pointer"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#138808]">
            Resolved
          </p>
          <p className="text-2xl font-bold tabular-nums text-[#138808] mt-1">
            {loading && !dashboard ? '—' : dashboard?.kpis.resolved ?? 0}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('ALL');
            setDateFilter('OVERDUE');
          }}
          className="text-left bg-white hover:border-[#DC2626] rounded-lg border border-[#162E51]/12 p-5 transition-colors cursor-pointer"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#DC2626]">
            Overdue Escalated
          </p>
          <p className="text-2xl font-bold tabular-nums text-[#DC2626] mt-1">
            {loading && !dashboard ? '—' : dashboard?.kpis.overdue ?? 0}
          </p>
        </button>
      </div>

      {/* Escalation & Manual Assignment Action Bar */}
      {dashboard && (dashboard.kpis.overdue > 0 || dashboard.kpis.manualQueue > 0) && (
        <div className="bg-amber-50/80 rounded-xl border border-amber-300 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#162E51]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0" />
            <span>
              <strong className="text-[#92400E] uppercase">Action Alerts:</strong>{' '}
              <span className="tabular-nums font-bold">{dashboard.kpis.overdue}</span> overdue SLA
              escalation(s) and{' '}
              <span className="tabular-nums font-bold">{dashboard.kpis.manualQueue}</span> ticket(s)
              requiring manual department assignment.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {dashboard.kpis.overdue > 0 && (
              <button
                type="button"
                onClick={() => setDateFilter('OVERDUE')}
                className="px-3.5 py-1.5 rounded bg-[#005EA2] text-white font-bold uppercase tracking-wider hover:bg-[#162E51] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Filter Overdue
              </button>
            )}
            {dateFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setDateFilter('ALL')}
                className="px-3.5 py-1.5 rounded bg-white border border-[#162E51]/20 text-[#162E51] font-semibold hover:border-[#005EA2] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Show All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[#162E51]">
                Volume &amp; Resolution by Category
              </h2>
              <span className="font-mono text-[11px] text-[#162E51]/55">Resolved vs Total</span>
            </div>
            {dashboard.byCategory.length === 0 ? (
              <p className="text-xs text-[#162E51]/60 py-6">
                No authorized complaints in current scope.
              </p>
            ) : (
              <div className="space-y-3">
                {dashboard.byCategory.map((item) => {
                  const maxVal = Math.max(1, ...dashboard.byCategory.map((x) => x.total));
                  const totalWidthPct = Math.round((item.total / maxVal) * 100);
                  const resolvedWidthPct =
                    item.total > 0 ? Math.round((item.resolved / item.total) * 100) : 0;

                  return (
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#162E51]">{item.category}</span>
                        <span className="font-mono tabular-nums text-[#162E51]/65">
                          {item.resolved}/{item.total} resolved
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[#F1F4F9] overflow-hidden">
                        <div
                          className="h-full bg-[#005EA2]/30 relative overflow-hidden"
                          style={{ width: `${totalWidthPct}%` }}
                        >
                          <div
                            className="h-full bg-[#138808]"
                            style={{ width: `${resolvedWidthPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[#162E51]">
                Municipal Corporation SLA Performance
              </h2>
              <span className="font-mono text-[11px] text-[#162E51]/55">
                Resolved · Active · Overdue
              </span>
            </div>
            {dashboard.byCity.length === 0 ? (
              <p className="text-xs text-[#162E51]/60 py-6">No city records in current scope.</p>
            ) : (
              <div className="space-y-4">
                {dashboard.byCity.map((c) => {
                  const resolvedPct = c.total > 0 ? Math.round((c.resolved / c.total) * 100) : 0;
                  const overduePct = c.total > 0 ? Math.round((c.overdue / c.total) * 100) : 0;
                  const activeOnTimePct = Math.max(0, 100 - resolvedPct - overduePct);

                  return (
                    <div key={c.city} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#162E51]">{c.city}</span>
                        <span className="font-mono tabular-nums text-[#162E51]/65">
                          Total: {c.total} · Resolved: {c.resolved} · Overdue: {c.overdue}
                        </span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-[#F1F4F9] overflow-hidden flex">
                        <div
                          title={`Resolved: ${c.resolved}`}
                          style={{ width: `${resolvedPct}%` }}
                          className="bg-[#138808] h-full"
                        />
                        <div
                          title="Active Within SLA"
                          style={{ width: `${activeOnTimePct}%` }}
                          className="bg-[#005EA2] h-full"
                        />
                        <div
                          title={`Overdue: ${c.overdue}`}
                          style={{ width: `${overduePct}%` }}
                          className="bg-[#DC2626] h-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search & Multi-Filter Queue Toolbar */}
      <div className="bg-white rounded-xl border border-[#162E51]/12 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-[#162E51]/45 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, locality, summary..."
              aria-label="Search complaints"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] placeholder:text-[#162E51]/45 focus:outline-none focus:border-[#005EA2] focus:bg-white"
            />
          </div>

          <select
            aria-label="Filter by Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
          >
            <option value="ALL" className={optionClass}>
              All Statuses
            </option>
            {COMPLAINT_STATUSES.map((s) => (
              <option key={s} value={s} className={optionClass}>
                {s}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
          >
            <option value="ALL" className={optionClass}>
              All Categories
            </option>
            {CIVIC_CATEGORIES.map((c) => (
              <option key={c} value={c} className={optionClass}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by City"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
          >
            <option value="ALL" className={optionClass}>
              All Cities ({MUNICIPAL_CITIES.length} ULBs)
            </option>
            {ORDERED_STATES_UTS.map((st) => {
              const stateCities = MUNICIPAL_CITIES.filter((c) => c.stateUt === st.stateUt);
              return (
                <optgroup key={st.stateUt} label={st.stateUt}>
                  {stateCities.map((c) => (
                    <option key={c.city} value={c.city} className={optionClass}>
                      {c.city} ({c.municipalBodyShort})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>

          <select
            aria-label="Filter by Department"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
          >
            <option value="ALL" className={optionClass}>
              All Authorized Depts
            </option>
            {(dashboard?.departments ?? []).map((d) => (
              <option key={d.code} value={d.code} className={optionClass}>
                {d.code} — {d.categoryMapped}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#162E51]/10">
          <div className="inline-flex p-0.5 rounded-lg border border-[#162E51]/15 bg-[#F8F9FA]">
            {(
              [
                { id: 'ALL', label: 'All Dates' },
                { id: '24H', label: 'Last 24h' },
                { id: '7D', label: 'Last 7d' },
                { id: 'OVERDUE', label: 'Overdue Only' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setDateFilter(btn.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  dateFilter === btn.id
                    ? 'bg-[#005EA2] text-white font-semibold'
                    : 'text-[#162E51]/70 hover:text-[#162E51]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <span className="font-mono text-xs tabular-nums text-[#162E51]/60">
            Showing {filteredComplaints.length} complaint(s)
          </span>
        </div>
      </div>

      {/* Main Split Workspace: Queue Table + Officer Action Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 bg-white rounded-xl border border-[#162E51]/12 overflow-hidden">
          {loading && !dashboard ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 rounded bg-[#F8F9FA] animate-pulse" />
              ))}
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-[#162E51]">
                No matching complaints in current view
              </p>
              <p className="text-xs text-[#162E51]/65">
                Adjust filters or switch RBAC department scope above to view other queues.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                  setCityFilter('ALL');
                  setDeptFilter('ALL');
                  setDateFilter('ALL');
                }}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-[#005EA2] text-white cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#162E51]/12 bg-[#F8F9FA] font-mono text-[#005EA2] uppercase">
                    <th className="py-3 px-4 font-semibold">Tracking ID</th>
                    <th className="py-3 px-3 font-semibold">Issue &amp; Locality</th>
                    <th className="py-3 px-3 font-semibold">Priority</th>
                    <th className="py-3 px-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162E51]/10">
                  {filteredComplaints.map((c) => {
                    const isSelected = c.trackingCode === selectedCode;
                    const isOverdue =
                      (c.status === 'Pending' || c.status === 'In Progress') &&
                      (c.isEscalated || new Date(c.slaDeadline).getTime() < Date.now());

                    return (
                      <tr
                        key={c.trackingCode}
                        onClick={() => setSelectedCode(c.trackingCode)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#005EA2]/8'
                            : 'hover:bg-[#F8F9FA]'
                        }`}
                      >
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <span className="font-mono font-bold text-[#005EA2] tabular-nums block">
                            {c.trackingCode}
                          </span>
                          <span className="font-mono text-[#162E51]/55 tabular-nums">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </td>

                        <td className="py-3 px-3 align-top max-w-xs">
                          <p className="font-semibold text-[#162E51] line-clamp-1">
                            {c.interpretedSummary}
                          </p>
                          <p className="text-[#162E51]/65 mt-0.5">
                            {c.locality}, {c.city} · {c.departmentCode}
                            {c.duplicateClusterCount && c.duplicateClusterCount > 1
                              ? ` · Cluster (${c.duplicateClusterCount})`
                              : ''}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              c.priority === 'Critical'
                                ? 'text-[#DC2626]'
                                : c.priority === 'High'
                                  ? 'text-[#B45309]'
                                  : 'text-[#162E51]/80'
                            }`}
                          >
                            {c.priority}
                          </span>
                          {isOverdue && (
                            <span className="block text-[#DC2626] font-semibold">Overdue</span>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                          {c.status === 'Resolved' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#138808]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Resolved</span>
                            </span>
                          ) : c.status === 'Rejected' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#162E51]/50">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Rejected</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#162E51]">
                              <Clock className="w-3.5 h-3.5 text-[#B45309]" />
                              <span>{c.status}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Complaint Inspection & Action Panel */}
        <div className="xl:col-span-5 bg-white rounded-xl border border-[#162E51]/12 p-6 space-y-5">
          {!selectedComplaint ? (
            <p className="text-xs text-[#162E51]/60 py-8 text-center">
              Select a complaint from the queue to inspect details and update status.
            </p>
          ) : (
            <>
              <div className="pb-4 border-b border-[#162E51]/12 space-y-1.5">
                <div className="flex items-center justify-between gap-2 font-mono text-xs text-[#162E51]/65">
                  <span className="font-bold text-[#005EA2] text-sm tabular-nums">
                    {selectedComplaint.trackingCode}
                  </span>
                  <span>
                    {selectedComplaint.wardName} · {selectedComplaint.city}
                  </span>
                </div>
                <h2 className="font-display text-xl font-bold text-[#162E51]">
                  {selectedComplaint.interpretedSummary}
                </h2>
                <p className="text-xs text-[#162E51]/65">{selectedComplaint.priorityReason}</p>
              </div>

              <div className="space-y-2 text-xs">
                <p className="font-mono font-bold uppercase tracking-wider text-[#005EA2]">
                  Original Citizen Submission ({selectedComplaint.language.toUpperCase()}):
                </p>
                <p className="p-3 rounded-lg bg-[#F8F9FA] border border-[#162E51]/12 text-[#162E51] whitespace-pre-line">
                  {selectedComplaint.rawDescription}
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[#162E51]/55 block">Citizen Name</span>
                    <span className="font-semibold text-[#162E51]">
                      {selectedComplaint.citizenName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#162E51]/55 block">Contact (Officer View)</span>
                    <span className="text-[#162E51]">
                      {selectedComplaint.citizenPhone ||
                        selectedComplaint.citizenEmail ||
                        'Portal Only'}
                    </span>
                  </div>
                </div>
                {selectedComplaint.duplicateOfTrackingCode && (
                  <p className="text-[#005EA2] font-semibold">
                    Linked Duplicate of {selectedComplaint.duplicateOfTrackingCode}
                  </p>
                )}
                {selectedComplaint.linkedDuplicateCodes &&
                  selectedComplaint.linkedDuplicateCodes.length > 0 && (
                    <p className="text-[#005EA2] font-semibold">
                      Grouped Cluster Reports: {selectedComplaint.linkedDuplicateCodes.join(', ')}
                    </p>
                  )}
              </div>

              {selectedComplaint.evidence.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#162E51]/10">
                  {selectedComplaint.evidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-lg border border-[#162E51]/12 overflow-hidden bg-[#F8F9FA]"
                    >
                      <div className="h-28 w-full">
                        <CivicImage src={ev.imageUrl} alt={ev.stage} />
                      </div>
                      <p className="p-1.5 font-mono text-[11px] font-semibold text-[#005EA2] truncate">
                        {ev.stage === 'submission_before'
                          ? 'Before (Citizen)'
                          : ev.stage === 'resolution_after'
                            ? 'After (Officer)'
                            : 'Reopen Proof'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={handleSaveComplaintUpdate}
                className="pt-4 border-t border-[#162E51]/12 space-y-3.5"
              >
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2]">
                  Update Status, Assignment &amp; Resolution Evidence
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="off-status"
                      className="block text-xs font-semibold text-[#162E51] mb-1"
                    >
                      Status
                    </label>
                    <select
                      id="off-status"
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)}
                      className="w-full px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
                    >
                      {COMPLAINT_STATUSES.map((s) => (
                        <option key={s} value={s} className={optionClass}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="off-priority"
                      className="block text-xs font-semibold text-[#162E51] mb-1"
                    >
                      Priority
                    </label>
                    <select
                      id="off-priority"
                      value={nextPriority}
                      onChange={(e) => setNextPriority(e.target.value as ComplaintPriority)}
                      className="w-full px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
                    >
                      {COMPLAINT_PRIORITIES.map((p) => (
                        <option key={p} value={p} className={optionClass}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {dashboard?.profile.role === 'super_admin' && (
                  <div>
                    <label
                      htmlFor="off-dept"
                      className="block text-xs font-semibold text-[#162E51] mb-1"
                    >
                      Routed Department (Nodal Override)
                    </label>
                    <select
                      id="off-dept"
                      value={nextDeptCode}
                      onChange={(e) => setNextDeptCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] focus:outline-none focus:border-[#005EA2]"
                    >
                      {dashboard.departments.map((d) => (
                        <option key={d.code} value={d.code} className={optionClass}>
                          {d.code} — {d.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="off-assignee"
                    className="block text-xs font-semibold text-[#162E51] mb-1"
                  >
                    Assigned Field Officer / Engineer
                  </label>
                  <input
                    id="off-assignee"
                    type="text"
                    value={nextOfficerName}
                    onChange={(e) => setNextOfficerName(e.target.value)}
                    placeholder="e.g. Er. Vikram Nair"
                    className="w-full px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] placeholder:text-[#162E51]/40 focus:outline-none focus:border-[#005EA2]"
                  />
                </div>

                {nextStatus === 'Resolved' && (
                  <div>
                    {!afterImageUri ? (
                      <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#F8F9FA] border border-dashed border-[#162E51]/25 text-xs font-medium text-[#162E51] hover:border-[#005EA2] hover:text-[#005EA2] cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Post-Repair "After" Photo (Optional)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAfterPhotoUpload}
                          className="sr-only"
                        />
                      </label>
                    ) : (
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-[#138808]">
                        <span>After-repair photo ready to attach</span>
                        <button
                          type="button"
                          onClick={() => setAfterImageUri(null)}
                          className="text-[#162E51]/60 hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="off-remark"
                    className="block text-xs font-semibold text-[#162E51] mb-1"
                  >
                    Official Action Comment *
                  </label>
                  <textarea
                    id="off-remark"
                    rows={2}
                    required
                    value={officerComment}
                    onChange={(e) => setOfficerComment(e.target.value)}
                    placeholder="Record field inspection finding, crew dispatch, or repair completion note..."
                    className="w-full px-3 py-2 rounded-lg bg-[#F8F9FA] border border-[#162E51]/20 text-xs text-[#162E51] placeholder:text-[#162E51]/40 focus:outline-none focus:border-[#005EA2]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingUpdate}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[#005EA2] hover:bg-[#162E51] text-white text-xs font-bold uppercase tracking-wider shadow-sm disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {savingUpdate && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Official Update</span>
                </button>
              </form>

              <div className="pt-3 border-t border-[#162E51]/10 space-y-2">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#005EA2]">
                  Recent Audit Log
                </h4>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {selectedComplaint.history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <div key={h.id} className="text-[11px] text-[#162E51]/75 border-b border-[#162E51]/10 pb-1.5">
                        <span className="font-bold text-[#162E51]">{h.newStatus}</span> ·{' '}
                        <span>{h.actorName}</span> ·{' '}
                        <span className="font-mono tabular-nums text-[#162E51]/50">
                          {new Date(h.createdAt).toLocaleString()}
                        </span>
                        <p className="text-[#162E51]/70 mt-0.5">{h.comment}</p>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
