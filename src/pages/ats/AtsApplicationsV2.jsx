import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import { downloadFile } from '../../utils/download';
import RefuseModal from '../../components/ats/RefuseModal';
import StageBadge from '../../components/ats/StageBadge';
import { AiScoreBadge } from '../../components/ats/AiResumeInsights';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { useDensity } from '../../hooks/useDensity';
import { DataTable, FilterBar, Pagination, EmptyState, Button, Chip, DensityToggle, GroupedHeader, BulkActionBar } from '../../components/ds';
import {
  useListParams, usePageParam, useSearchParamValue,
  SelectChipV2, BooleanChipV2, GroupByChipV2, MoreFiltersV2, PageHeaderV2,
} from '../../components/platform/v2/listkit';
import { Users, Star, Loader2, Download, XCircle } from 'lucide-react';

const APP_GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'stage', label: 'Stage' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'job', label: 'Job Position' },
];

const LEGACY_FEEDBACK_NORMALISE = {
  selected: 'Proceed', accepted: 'Proceed', proceed: 'Proceed',
  hold: 'Awaited', awaited: 'Awaited',
  rejected: 'Reject', reject: 'Reject',
};

function roundLabel(rk) {
  if (!rk) return '';
  if (rk === 'hr') return 'HR';
  return String(rk).toUpperCase();
}
function formatDateTimeShort(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function legacyToRec(legacy) {
  if (!legacy || typeof legacy !== 'string') return null;
  return LEGACY_FEEDBACK_NORMALISE[legacy.trim().toLowerCase()] || null;
}

function FeedbackChip({ result, legacy }) {
  let rec = result?.recommendation;
  if (!rec && legacy && typeof legacy === 'string') rec = legacyToRec(legacy);
  if (!rec) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
  const tone = rec === 'Proceed' ? 'brand' : rec === 'Awaited' ? 'warn' : 'danger';
  return <Chip tone={tone} title={legacy || ''}>{rec}</Chip>;
}

function RoundCell({ interview }) {
  const dt = formatDateTimeShort(interview?.datetime);
  if (!interview || (!dt && !interview.recommendation && !interview.legacyFeedback)) {
    return <span style={{ color: 'var(--fg-4)' }}>—</span>;
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {dt
        ? <span style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{dt}</span>
        : <span style={{ color: 'var(--fg-4)', fontSize: 11.5 }}>Not scheduled</span>}
      <span><FeedbackChip result={interview.recommendation ? { recommendation: interview.recommendation } : null} legacy={interview.legacyFeedback} /></span>
    </span>
  );
}

function InterviewSummaryCell({ app }) {
  const interviews = app.interviews || [];
  if (interviews.length === 0 && !app.currentRoundKey) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
  let primary = app.currentRoundKey ? interviews.find(i => i.roundKey === app.currentRoundKey) : null;
  if (!primary) {
    const scheduled = interviews.filter(i => i.datetime);
    primary = scheduled.length ? scheduled[scheduled.length - 1] : null;
  }
  const dt = formatDateTimeShort(primary?.datetime);
  const label = roundLabel(primary?.roundKey || app.currentRoundKey);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ whiteSpace: 'nowrap' }}>
        {label && <span style={{ color: 'var(--fg-2)', fontWeight: 550, marginRight: 5 }}>{label}</span>}
        {dt
          ? <span style={{ color: 'var(--fg-4)' }}>{dt}</span>
          : (label ? <span style={{ color: 'var(--fg-4)' }}>not scheduled</span> : <span style={{ color: 'var(--fg-4)' }}>—</span>)}
      </span>
      {interviews.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {interviews.map(i => {
            const rec = i.recommendation || legacyToRec(i.legacyFeedback);
            const color = rec === 'Proceed' ? 'var(--brand)' : rec === 'Reject' ? 'var(--danger)' : rec === 'Awaited' ? 'var(--warn)' : 'var(--fg-4)';
            return (
              <span key={i.roundKey} style={{ font: '500 10px/1 var(--font)', color }}
                title={`${roundLabel(i.roundKey)}${rec ? ' · ' + rec : ''}${i.datetime ? ' · ' + formatDateTimeShort(i.datetime) : ''}`}>
                {roundLabel(i.roundKey)}{rec === 'Proceed' ? '✓' : ''}
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}

function EvalStars({ value = 0, max = 3 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} size={12} style={i < value ? { color: 'var(--warn)', fill: 'var(--warn)' } : { color: 'var(--fg-faint)' }} />
      ))}
    </span>
  );
}

// Same 4-segment chip semantics as the legacy page (Ongoing / Hired /
// Refused / Archived), token-styled.
function LifecycleToggleV2({ lifecycle, counts, onChange }) {
  const segments = [
    { key: 'ongoing', label: 'Ongoing', dot: 'var(--brand)' },
    { key: 'hired', label: 'Hired', dot: 'var(--brand-hi, var(--brand))' },
    { key: 'refused', label: 'Refused', dot: 'var(--danger)' },
    { key: 'archived', label: 'Archived', dot: 'var(--fg-4)' },
  ];
  const seg = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', flexShrink: 0,
    borderRadius: 'var(--r-full, 999px)', font: "500 12px/1 'Inter', system-ui, sans-serif",
    background: on ? 'var(--surface-4)' : 'transparent',
    color: on ? 'var(--fg)' : 'var(--fg-4)', whiteSpace: 'nowrap',
    transition: 'background 120ms var(--e-out), color 120ms var(--e-out)',
  });
  return (
    // Four segments come to ~410px, which is wider than a phone. The strip
    // scrolls inside itself rather than pushing the page sideways — the
    // segments keep flexShrink:0 so they never squash into unreadable stubs.
    <span
      className="ats-lifecycle"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2,
        maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none',
        borderRadius: 'var(--r-full, 999px)', background: 'var(--surface-2)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
      }}
    >
      <style>{'.ats-lifecycle::-webkit-scrollbar{display:none}'}</style>
      {segments.map(s => (
        <button key={s.key} type="button" style={seg(lifecycle === s.key)} onClick={() => onChange(s.key)} aria-pressed={lifecycle === s.key}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: s.dot, flexShrink: 0 }} />
          {s.label}
          {/* The count follows the segment. On the ACTIVE pill the backdrop
              is --surface-4, the darkest surface, where --fg-4 measures 4.31
              against a 4.5 floor; --fg-2 there is 8.50. Inactive segments sit
              on --surface-2, where --fg-4 is 5.12 and correct. */}
          {counts[s.key] != null && (
            <span style={{
              font: '600 10px/1 var(--font)', fontVariantNumeric: 'tabular-nums',
              color: lifecycle === s.key ? 'var(--fg-2)' : 'var(--fg-4)',
            }}>{counts[s.key]}</span>
          )}
        </button>
      ))}
    </span>
  );
}

// Token-styled checkbox mirroring DataTable's internal Check — needed here
// because rows are custom (ownership-gated selection).
function RowCheck({ checked, indeterminate, disabled, onChange, label, inputRef }) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      ref={inputRef}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) { e.preventDefault(); e.stopPropagation(); onChange(!checked); } }}
      title={disabled ? 'Only the assigned recruiter or an admin can act on this application' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        opacity: disabled ? 0.35 : 1,
        background: (checked || indeterminate) && !disabled ? 'var(--brand)' : 'transparent',
        boxShadow: `inset 0 0 0 ${(checked || indeterminate) && !disabled ? 0 : 1.5}px var(--line-strong, rgba(255,255,255,.18))`,
        transition: 'background 120ms var(--e-out), box-shadow 120ms var(--e-out)',
      }}
    >
      {indeterminate ? (
        <span style={{ width: 7, height: 2, borderRadius: 1, background: 'var(--brand-fg)' }} />
      ) : checked && !disabled ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--brand-fg, #041209)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : null}
    </span>
  );
}

/* v2 All Applications (Slice 3 Wave B) — the heavyweight list. Same data
   flow as AtsApplications.jsx: lifecycle segments with $facet counts,
   grouping, dynamic per-round interview columns when filtered to one job,
   ownership-gated bulk selection + bulk refuse (RefuseModal reused).
   Rows render through DataTable's children slot in BOTH modes because the
   built-in selection can't express per-row eligibility. */
export default function AtsApplicationsV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useListParams([
    'search', 'stageId', 'jobId', 'recruiter', 'archived',
    'source', 'employmentType', 'applicationStatus', 'groupBy', 'sort', 'dir',
    'hiredOnly', 'refusedOnly', 'mine', 'team', 'unclaimed', 'aiScoreMin',
  ]);
  const { density, setDensity } = useDensity('ats:applications');
  const [page, setPage] = usePageParam();
  const [searchValue, setSearchValue] = useSearchParamValue('search');
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);
  const singleJobId = (!isGrouped && filterParams.jobId) ? filterParams.jobId : null;

  const lifecycle = (() => {
    if (filterParams.archived === '1' || filterParams.archived === 'true') return 'archived';
    if (filterParams.applicationStatus === 'hired' || filterParams.hiredOnly === '1' || filterParams.hiredOnly === 'true') return 'hired';
    if (filterParams.applicationStatus === 'refused' || filterParams.refusedOnly === '1' || filterParams.refusedOnly === 'true') return 'refused';
    return 'ongoing';
  })();

  const setLifecycle = (next) => {
    const np = new URLSearchParams(searchParams);
    np.delete('page');
    np.delete('archived');
    np.delete('applicationStatus');
    np.delete('hiredOnly');
    np.delete('refusedOnly');
    if (next === 'archived') np.set('archived', '1');
    else if (next === 'hired') np.set('applicationStatus', 'hired');
    else if (next === 'refused') np.set('applicationStatus', 'refused');
    else if (next === 'ongoing') np.set('applicationStatus', 'ongoing');
    setSearchParams(np);
  };

  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ ongoing: null, hired: null, refused: null, archived: null });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  const [jobs, setJobs] = useState([]);
  const [stages, setStages] = useState([]);
  const [jobRounds, setJobRounds] = useState([]);
  const [jobStages, setJobStages] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [sources, setSources] = useState([]);
  const [employmentTypes, setEmploymentTypes] = useState([]);
  const [exporting, setExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [showBulkRefuseModal, setShowBulkRefuseModal] = useState(false);
  const [refuseReasons, setRefuseReasons] = useState([]);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const [myEmployeeId, setMyEmployeeId] = useState(null);
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.getMyProfile(orgSlug)
      .then((res) => { if (res?.success && res.employee) setMyEmployeeId(res.employee._id); })
      .catch(() => {});
  }, [orgSlug]);
  const canActOnApp = (app) => isAdmin || (app?.recruiterId && myEmployeeId && String(app.recruiterId) === String(myEmployeeId));

  // Default groupBy=stage on Ongoing — same sessionStorage guard as legacy
  // so a user-cleared chip stays cleared across reloads.
  useEffect(() => {
    if (searchParams.has('groupBy')) return;
    const lifecycleKey = `ats-apps-groupby-applied:${
      searchParams.get('archived') === '1' ? 'archived'
      : searchParams.get('applicationStatus') === 'hired' ? 'hired'
      : searchParams.get('applicationStatus') === 'refused' ? 'refused'
      : 'ongoing'
    }`;
    if (sessionStorage.getItem(lifecycleKey)) return;
    const isArchived = searchParams.get('archived') === '1' || searchParams.get('archived') === 'true';
    const isHired = searchParams.get('applicationStatus') === 'hired'
      || searchParams.get('hiredOnly') === '1' || searchParams.get('hiredOnly') === 'true';
    const isRefused = searchParams.get('applicationStatus') === 'refused'
      || searchParams.get('refusedOnly') === '1' || searchParams.get('refusedOnly') === 'true';
    if (isArchived || isHired || isRefused) return;
    const np = new URLSearchParams(searchParams);
    np.set('groupBy', 'stage');
    setSearchParams(np, { replace: true });
    sessionStorage.setItem(lifecycleKey, '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const fetchApplications = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    let aborted = false;
    try {
      const listParams = {
        page: isGrouped ? 1 : page,
        limit: isGrouped ? 5000 : 25,
        sort: 'appliedOn',
        dir: 'desc',
        ...filterParams,
        _requestKey: 'ats:applications:list',
      };
      if (lifecycle === 'ongoing' && !listParams.applicationStatus) {
        listParams.applicationStatus = 'ongoing';
      }
      const res = await atsApi.listApplications(orgSlug, listParams);
      if (res.success) {
        setApplications(res.applications || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setFetchError(null);
      }
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      console.error('Failed to load applications:', err);
      setFetchError(err?.message || 'Failed to load applications');
      showToast('Failed to load applications', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, lifecycle, JSON.stringify(filterParams), showToast]);

  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

  const fetchDropdowns = useCallback(async () => {
    if (!orgSlug) return;
    setJobs([]);
    setStages([]);
    setRecruiters([]);
    setSources([]);
    setEmploymentTypes([]);
    try {
      const [jobsRes, stagesRes, recruitersRes, sourcesRes, empTypesRes] = await Promise.all([
        atsApi.listJobs(orgSlug, { limit: 200 }),
        atsApi.listStages(orgSlug),
        atsApi.listRecruiters(orgSlug),
        atsApi.listConfig(orgSlug, 'sources').catch(() => null),
        atsApi.listConfig(orgSlug, 'employment-types').catch(() => null),
      ]);
      if (jobsRes.success) setJobs(jobsRes.jobs || []);
      if (stagesRes.success) setStages(stagesRes.stages || []);
      if (recruitersRes.success) setRecruiters(recruitersRes.recruiters || recruitersRes.members || []);
      if (sourcesRes?.success) setSources(sourcesRes.items || sourcesRes.sources || []);
      if (empTypesRes?.success) setEmploymentTypes(empTypesRes.items || empTypesRes.employmentTypes || []);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  useEffect(() => {
    let alive = true;
    if (!singleJobId || !orgSlug) { setJobRounds([]); setJobStages([]); return; }
    atsApi.listStages(orgSlug, singleJobId)
      .then((res) => {
        if (!alive) return;
        if (res?.success) {
          const all = res.stages || [];
          setJobStages(all);
          setJobRounds(all
            .filter((s) => s.roundKey)
            .map((s) => ({ roundKey: s.roundKey, label: roundLabel(s.roundKey) })));
        }
      })
      .catch(() => { if (alive) { setJobRounds([]); setJobStages([]); } });
    return () => { alive = false; };
  }, [singleJobId, orgSlug]);

  // One $facet counts request for all four lifecycle segments.
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    const baseParams = { ...filterParams, limit: 1, page: 1, counts: '1', _requestKey: 'ats:applications:counts' };
    delete baseParams.archived;
    delete baseParams.applicationStatus;
    delete baseParams.hiredOnly;
    delete baseParams.refusedOnly;
    delete baseParams.groupBy;
    atsApi.listApplications(orgSlug, baseParams)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.counts) setCounts(res.counts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined, applicationStatus: undefined, hiredOnly: undefined, refusedOnly: undefined, groupBy: undefined })]);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    atsApi.listRefuseReasons(orgSlug)
      .then((res) => { if (!cancelled && res?.success) setRefuseReasons(res.items || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id]);

  // Clear selection whenever the visible set shifts under the user.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [JSON.stringify(filterParams), page]);

  const allVisibleIds = applications.filter(a => canActOnApp(a)).map(a => a._id);
  const allOnPageSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someOnPageSelected = allVisibleIds.some(id => selectedIds.has(id));

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) for (const id of allVisibleIds) next.delete(id);
      else for (const id of allVisibleIds) next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkRefuse = async ({ refuseReasonId, sendEmail }) => {
    if (!orgSlug || selectedIds.size === 0) return;
    setBulkSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await atsApi.bulkRefuse(orgSlug, ids, { refuseReasonId, sendEmail });
      if (res?.success) {
        const sent = res.emailsSent ?? 0;
        const refusedMsg = `Refused ${res.modified} application${res.modified === 1 ? '' : 's'}`;
        const emailMsg = sendEmail && sent > 0 ? ` — ${sent} email${sent === 1 ? '' : 's'} sent` : '';
        showToast(refusedMsg + emailMsg);
        clearSelection();
        setShowBulkRefuseModal(false);
        await fetchApplications();
      } else {
        showToast(res?.error || 'Bulk refuse failed', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Bulk refuse failed', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleExport = async () => {
    if (!orgSlug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => { if (v) params.set(k, v); });
      if (lifecycle === 'ongoing' && !params.get('applicationStatus')) {
        params.set('applicationStatus', 'ongoing');
      }
      const qs = params.toString();
      const today = new Date().toISOString().slice(0, 10);
      await downloadFile(
        `/api/org/${orgSlug}/ats/applications/export.csv${qs ? '?' + qs : ''}`,
        `applications_${today}.csv`,
      );
    } catch (err) {
      showToast(err?.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const stageOptions = useMemo(
    () => ((singleJobId && jobStages.length > 0) ? jobStages : stages).map((s) => ({ value: s._id, label: s.name })),
    [stages, jobStages, singleJobId],
  );
  const jobOptions = useMemo(() => jobs.map((j) => ({ value: j._id, label: j.name })), [jobs]);
  const recruiterOptions = useMemo(() => recruiters.map((r) => ({ value: r._id, label: r.name || r.email || r._id })), [recruiters]);
  const sourceOptions = useMemo(() => sources.map((s) => ({ value: s.name || s._id, label: s.name || s._id })), [sources]);
  const employmentTypeOptions = useMemo(() => employmentTypes.map((t) => ({
    value: t.name || t.value || t.key || t,
    label: t.label || t.name || t.value || t.key || t,
  })), [employmentTypes]);

  const groupedApplications = useMemo(() => {
    if (!groupBy) return null;
    const extractor = (app) => {
      if (groupBy === 'stage') return [{ key: app.stageId || '__unknown__', label: app.stageName || 'Unknown stage' }];
      if (groupBy === 'recruiter') {
        return [{
          key: app.recruiterId || '__unknown__',
          label: app.recruiterName || (app.recruiterId ? 'Unknown recruiter' : 'No recruiter'),
        }];
      }
      if (groupBy === 'job') return [{ key: app.jobPositionId || '__unknown__', label: app.jobName || 'Unknown job' }];
      return [];
    };
    return sortGroupsByCount(groupRecords(applications, extractor));
  }, [applications, groupBy]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const formatDate = (dateStr) => dateStr
    ? new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const showRoundColumns = Boolean(singleJobId) && jobRounds.length > 0;

  // Sort via DataTable headers → legacy sort/dir params (default appliedOn desc).
  const dsSort = filterParams.sort ? { key: filterParams.sort, dir: filterParams.dir === 'desc' ? 'desc' : 'asc' } : null;
  const onSortChange = (next) => {
    const np = new URLSearchParams(searchParams);
    if (!next) { np.delete('sort'); np.delete('dir'); }
    else { np.set('sort', next.key); np.set('dir', next.dir); }
    np.delete('page');
    setSearchParams(np);
  };

  const columns = [
    {
      key: '__sel', width: 40,
      header: (
        <RowCheck
          checked={allOnPageSelected}
          indeterminate={!allOnPageSelected && someOnPageSelected}
          onChange={toggleSelectAllOnPage}
          label="Select all on this page"
        />
      ),
    },
    { key: 'candidateName', header: 'Candidate', sortable: true, width: 220 },
    { key: 'candidateEmail', header: 'Email', width: 190 },
    { key: 'jobPositionId', header: 'Job Position', sortable: true, width: 200 },
    { key: 'stageId', header: 'Stage', sortable: true, width: 130 },
    { key: 'recruiterName', header: 'Recruiter', width: 140 },
    { key: 'evaluation', header: 'Evaluation', sortable: true, align: 'center', width: 90 },
    { key: 'aiJobFitScore', header: 'AI Fit', sortable: true, align: 'center', width: 80 },
    { key: 'appliedOn', header: 'Applied', sortable: true, width: 110 },
    ...(showRoundColumns
      ? jobRounds.map((r) => ({ key: `round-${r.roundKey}`, header: r.label, width: 130 }))
      : [{ key: 'interview', header: 'Interview', width: 160 }]),
  ];

  const hasFilters = Object.values(filterParams).some(Boolean);
  const pad = density === 'compact' ? '6px 12px' : '11px 14px';
  const cellFont = density === 'compact' ? '450 13px/1.4 var(--font)' : '450 13.5px/1.45 var(--font)';
  const td = (extra = {}) => ({
    padding: pad, font: cellFont, color: 'var(--fg-2)', borderBottom: '1px solid var(--line)',
    verticalAlign: 'middle', ...extra,
  });

  const renderRow = (app, keySuffix = '') => {
    const refused = app.applicationStatus === 'refused' || app.refused;
    const selected = selectedIds.has(app._id);
    const editable = canActOnApp(app);
    return (
      <tr
        key={`${app._id}${keySuffix}`}
        onClick={() => navigate(orgPath(`/ats/applications/${app._id}`))}
        style={{ cursor: 'pointer', background: selected ? 'var(--brand-soft)' : 'transparent', transition: 'background 110ms var(--e-out)' }}
        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={td()} onClick={(e) => e.stopPropagation()}>
          <RowCheck
            checked={selected}
            disabled={!editable}
            onChange={() => editable && toggleSelectOne(app._id)}
            label={`Select ${app.candidateName || 'application'}`}
          />
        </td>
        <td style={td()}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: refused ? 'var(--danger-soft, rgba(239,68,68,.14))' : 'var(--brand-soft)',
              // Initials are TEXT on their own tint — --brand there measures
              // 4.37 in light. --brand-ink is the pairing built for it.
              color: refused ? 'var(--danger)' : 'var(--brand-ink)',
              font: "600 11px/1 'Inter', system-ui, sans-serif",
            }}>
              {(app.candidateName || '?')[0].toUpperCase()}
            </span>
            {app.candidateId ? (
              <Link
                to={orgPath(`/ats/candidates/${app.candidateId}`)}
                onClick={(e) => e.stopPropagation()}
                style={{ color: refused ? 'var(--danger)' : 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {app.candidateName || 'Unnamed'}
              </Link>
            ) : (
              <span style={{ color: refused ? 'var(--danger)' : 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {app.candidateName || 'Unnamed'}
              </span>
            )}
          </span>
        </td>
        <td style={td({ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })} title={app.candidateEmail || ''}>
          {app.candidateEmail || <span style={{ color: 'var(--fg-4)' }}>—</span>}
        </td>
        <td style={td({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
          {app.jobPositionId && app.jobName ? (
            <Link to={orgPath(`/ats/jobs/${app.jobPositionId}`)} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>
              {app.jobName}
            </Link>
          ) : (app.jobName || <span style={{ color: 'var(--fg-4)' }}>—</span>)}
        </td>
        <td style={td()}>
          <StageBadge stageName={stages.find((s) => s._id === app.stageId)?.name || app.stageName || app.stageId?.name} />
        </td>
        <td style={td({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
          {app.recruiterId && app.recruiterName ? (
            <Link to={orgPath(`/employee/${app.recruiterId}`)} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>
              {app.recruiterName}
            </Link>
          ) : (app.recruiterName || <span style={{ color: 'var(--fg-4)' }}>—</span>)}
        </td>
        <td style={td({ textAlign: 'center' })}><EvalStars value={app.evaluation || 0} /></td>
        <td style={td({ textAlign: 'center' })}><AiScoreBadge score={app.aiJobFitScore} size="sm" /></td>
        <td style={td({ color: 'var(--fg-4)', fontSize: 12, whiteSpace: 'nowrap' })}>{formatDate(app.appliedOn)}</td>
        {showRoundColumns ? (
          jobRounds.map((r) => {
            const iv = (app.interviews || []).find((i) => i.roundKey === r.roundKey);
            return <td key={r.roundKey} style={td({ fontSize: 12 })}><RoundCell interview={iv} /></td>;
          })
        ) : (
          <td style={td({ fontSize: 12 })}><InterviewSummaryCell app={app} /></td>
        )}
      </tr>
    );
  };

  const bodyRows = () => {
    if (!isGrouped) return applications.map((a) => renderRow(a));
    return (groupedApplications || []).flatMap(([key, group]) => {
      const collapsed = collapsedGroups.has(key);
      const accent = groupBy === 'stage' ? 'var(--info, #3b82f6)'
        : groupBy === 'recruiter' ? 'var(--a-ats, #8b5cf6)'
        : 'var(--info, #06b6d4)';
      const header = (
        <GroupedHeader
          key={`__group__${key}`}
          label={group.label}
          count={group.records.length}
          noun="application"
          colSpan={columns.length}
          collapsed={collapsed}
          onToggle={() => toggleGroup(key)}
          accent={accent}
          avatarText={groupBy === 'recruiter' ? undefined : ''}
          sticky
          stickyTop={30}
        />
      );
      const rows = collapsed ? [] : group.records.map((a) => renderRow(a, `__${key}`));
      return [header, ...rows];
    });
  };

  return (
    <div>
      <PageHeaderV2
        title="All Applications"
        sub={`${total} ${total === 1 ? 'application' : 'applications'} total`}
        actions={(
          <>
            <DensityToggle density={density} onChange={setDensity} />
            <Button
              variant="ghost"
              size="sm"
              disabled={exporting || total === 0}
              iconLeft={exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              onClick={handleExport}
              title="Download the current filtered list as a CSV file"
            >
              Export CSV
            </Button>
          </>
        )}
      />

      <FilterBar
        search={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search by candidate name or email…"
        resultCount={total}
        noun="application"
        onClearAll={hasFilters ? () => setSearchParams(new URLSearchParams()) : undefined}
        filters={[]}
        left={(
          <>
            <SelectChipV2 paramKey="stageId" label="Stage" options={stageOptions} />
            <SelectChipV2 paramKey="jobId" label="Job Position" options={jobOptions} />
            <SelectChipV2 paramKey="recruiter" label="Recruiter" options={recruiterOptions} />
            <BooleanChipV2 paramKey="unclaimed" label="Unclaimed" />
            <GroupByChipV2 options={APP_GROUP_BY_OPTIONS} />
            <MoreFiltersV2 paramKeys={['source', 'employmentType', 'aiScoreMin']}>
              <SelectChipV2 paramKey="source" label="Source" options={sourceOptions} placeholder="No sources" />
              <SelectChipV2 paramKey="employmentType" label="Employment Type" options={employmentTypeOptions} placeholder="No types" />
              <SelectChipV2 paramKey="aiScoreMin" label="AI Fit ≥" options={[
                { value: '60', label: '60 (any reasonable match)' },
                { value: '70', label: '70 (decent match)' },
                { value: '80', label: '80 (strong match)' },
                { value: '90', label: '90 (excellent match)' },
              ]} />
            </MoreFiltersV2>
            <LifecycleToggleV2 lifecycle={lifecycle} counts={counts} onChange={setLifecycle} />
          </>
        )}
        style={{ marginBottom: 14 }}
      />

      {fetchError && applications.length === 0 && !loading ? (
        <EmptyState
          icon={<Users size={22} />}
          tone="warn"
          title="Couldn't load applications"
          actions={<Button variant="secondary" size="sm" onClick={() => fetchApplications()}>Retry</Button>}
        >
          {fetchError}
        </EmptyState>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={[]}
            density={density}
            loading={loading}
            resizable={false}
            sort={dsSort}
            onSortChange={onSortChange}
            empty={(
              <EmptyState
                icon={<Users size={22} />}
                title="No applications found"
                actions={hasFilters && (
                  <Button variant="secondary" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>Clear all filters</Button>
                )}
              >
                {hasFilters
                  ? 'Try adjusting your search or filters.'
                  : 'Create your first application or use the Pipeline view to add candidates.'}
              </EmptyState>
            )}
          >
            {!loading && applications.length ? bodyRows() : null}
          </DataTable>

          {!isGrouped && total > 0 && (
            <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} noun="application" />
          )}
        </>
      )}

      <BulkActionBar
        count={selectedIds.size}
        noun="application"
        onClear={clearSelection}
        actions={[
          {
            label: bulkSubmitting ? 'Refusing…' : 'Refuse',
            tone: 'danger',
            icon: <XCircle size={13} />,
            disabled: bulkSubmitting,
            onClick: () => setShowBulkRefuseModal(true),
          },
        ]}
      />

      <RefuseModal
        show={showBulkRefuseModal}
        onClose={() => { if (!bulkSubmitting) setShowBulkRefuseModal(false); }}
        onConfirm={handleBulkRefuse}
        reasons={refuseReasons}
        saving={bulkSubmitting}
        mode="bulk"
        applications={applications.filter((a) => selectedIds.has(a._id))}
      />
    </div>
  );
}
