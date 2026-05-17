import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { downloadFile } from '../../utils/download';
import FilterBar, { FilterChip, GroupByChip, MoreFiltersPopover, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { useDensity } from '../../hooks/useDensity';
import DensityToggle from '../../components/shared/DensityToggle';
import SortableHeader from '../../components/shared/SortableHeader';
import GroupedHeader from '../../components/shared/GroupedHeader';

const APP_GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'stage', label: 'Stage' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'job', label: 'Job Position' },
];

const APP_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'hired', label: 'Hired' },
  { value: 'refused', label: 'Refused' },
];
import StageBadge from '../../components/ats/StageBadge';
import {
  Plus, Loader2, Users,
  ChevronLeft, ChevronRight, ChevronDown, X,
  Star, Mail, Calendar, Download, ArrowRight, XCircle,
} from 'lucide-react';

/* ── Stage badge helper ──────────────────────────────────────────────── */
// StageBadge moved to ../../components/ats/StageBadge.jsx — shared
// across AtsApplications, AtsJobDetail, AtsCandidateDetail so the same
// stage renders in the same colour everywhere (audit P1 #12).

/* ── Feedback Badge ───────────────────────────────────────────────────────
 * 2026-05-12 audit: normalises interview-result display across structured
 * (l1Result.recommendation) and legacy (l1Feedback free-text) records.
 * Huemot's Odoo data uses "Selected" / "Rejected" / "Hold" — the importer
 * normalisation handles those at migration time (5-import-data.js), but
 * this badge also display-normalises any record that escaped the mapper
 * so live data renders cleanly without a re-run. */
const LEGACY_FEEDBACK_NORMALISE = {
  selected: 'Proceed',
  accepted: 'Proceed',
  proceed: 'Proceed',
  hold: 'Awaited',
  awaited: 'Awaited',
  rejected: 'Reject',
  reject: 'Reject',
};
function FeedbackBadge({ result, legacy }) {
  // Structured wins; fall back to normalised legacy.
  let rec = result?.recommendation;
  if (!rec && legacy && typeof legacy === 'string') {
    rec = LEGACY_FEEDBACK_NORMALISE[legacy.trim().toLowerCase()] || null;
  }
  if (!rec) return <span className="text-dark-500">—</span>;
  const cls = rec === 'Proceed'
    ? 'bg-emerald-500/10 text-emerald-400'
    : rec === 'Awaited'
    ? 'bg-amber-500/10 text-amber-400'
    : 'bg-red-500/10 text-red-400';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`} title={legacy || ''}>
      {rec}
    </span>
  );
}

/* ── Evaluation Stars (read-only) ─────────────────────────────────────── */
function EvalStars({ value = 0, max = 3 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
        />
      ))}
    </div>
  );
}

/* New Application Modal removed 2026-05-17 health-check G.1 — creation
   lives at the routed page /ats/jobs/:id/applications/new. The 240-line
   inline function (and its EMPTY_APP scaffold) was unreferenced after
   the route migration. */
/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsApplications() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams([
    'search', 'stageId', 'jobId', 'recruiter', 'archived',
    'source', 'employmentType', 'applicationStatus', 'groupBy', 'sort', 'dir',
    // 2026-05-16: hiredOnly + refusedOnly let the dashboard's KPI tiles
    // and funnel bars deep-link straight into the filtered list. Without
    // these in the allow-list, useFilterParams stripped them off the URL
    // and the API call landed unfiltered.
    'hiredOnly', 'refusedOnly',
  ]);
  const { density, setDensity } = useDensity('ats:applications');
  // 2026-05-17 Phase L: harden page-param parsing. parseInt('abc') returns
  // NaN, which broke prev-button disabled state and page-clamp comparisons.
  // Clamp to >= 1 and default to 1 on NaN / negative input.
  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);

  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  // Dropdown data
  const [jobs, setJobs] = useState([]);
  const [stages, setStages] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [sources, setSources] = useState([]);
  const [employmentTypes, setEmploymentTypes] = useState([]);

  const [exporting, setExporting] = useState(false);

  // 2026-05-17 health-check F.1: NewApplicationModal mount + showModal
  // state removed. Creation now happens at the routed page
  // /ats/jobs/:id/applications/new off the Job Position detail. The
  // legacy ?action=new deep-link auto-open was already disabled; the
  // modal itself stayed mounted (always closed) which still pulled in
  // the chunk on every list render.

  // Bulk actions — selection + action-bar dropdowns
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkAction, setBulkAction] = useState(null); // null | 'stage' | 'refuse'
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  // 2026-05-17 health-check D.2: styled confirm modal state. Replaces
  // window.confirm() which can't be themed and steals focus uglyly.
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [refuseReasons, setRefuseReasons] = useState([]);

  // 2026-05-17 health-check F.1: debounceRef removed — FilterBar owns
  // its own search debounce now, so this ref was declared but never
  // assigned, and the cleanup at the bottom of the page was a no-op.
  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // ── Fetch applications ─────────────────────────────────────────────────
  const fetchApplications = useCallback(async () => {
    if (!orgSlug) return;
    // 2026-05-17 health-check D.1: keep prior list visible while
    // refetching — pages no longer blank-flash between filter changes.
    // The api util auto-cancels the previous in-flight request keyed by
    // _requestKey so race-stale results can't overwrite a newer fetch.
    setLoading(true);
    try {
      // 2026-05-17 health-check P0: hard-coded sort/order used to come
      // AFTER `...filterParams`, overriding the URL's sort + dir params
      // that SortableHeader writes. Move the defaults BEFORE the spread.
      const res = await atsApi.listApplications(orgSlug, {
        page,
        limit: 25,
        sort: 'appliedOn',
        dir: 'desc',
        ...filterParams,
        _requestKey: 'ats:applications:list',
      });
      if (res.success) {
        setApplications(res.applications || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      // AbortError fires when the api util cancels this fetch in favour
      // of a newer one — don't toast or clear state on it.
      if (err?.name === 'AbortError') return;
      console.error('Failed to load applications:', err);
      showToast('Failed to load applications', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, JSON.stringify(filterParams), showToast]);

  // 2026-05-17 Phase L: page-clamp guard. When data shrinks (filter change
  // wipes most rows, company switch hits a smaller tenant, last-page row
  // gets archived) the URL still carries the old page number and the user
  // sees an empty list. This auto-rewinds them to the last real page.
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

  // ── Fetch dropdown data ────────────────────────────────────────────────
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

  // Archived count for the segmented Active/Archived chip.
  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    atsApi.listApplications(orgSlug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined })]);

  // Fetch refuse reasons once per (org, company) — used by the bulk-refuse
  // action bar's reason picker. Cheap; small set per org.
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    atsApi.listRefuseReasons(orgSlug)
      .then((res) => { if (!cancelled && res?.success) setRefuseReasons(res.items || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id]);

  // Clear selection whenever the visible set might have shifted under the
  // user (filter/search/page change). Avoids the trap of "you selected
  // these 5 then changed filter, now your selection points at rows you
  // can't see and a bulk action would still hit them".
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkAction(null);
  }, [JSON.stringify(filterParams), page]);

  // ── Bulk selection helpers ────────────────────────────────────────────
  const allVisibleIds = applications.map(a => a._id);
  const allOnPageSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someOnPageSelected = allVisibleIds.some(id => selectedIds.has(id));

  // 2026-05-17 health-check G.2: indeterminate is a DOM property, not an
  // attribute — React can't set it via JSX. Old code wrote it via an
  // inline `ref={(el) => ...}` that ran every render. useRef + useEffect
  // is the idiomatic pattern and runs only when the input identity is
  // stable, syncing on each indeterminate-state change.
  const selectAllCheckboxRef = useRef(null);
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = !allOnPageSelected && someOnPageSelected;
    }
  }, [allOnPageSelected, someOnPageSelected]);

  // 2026-05-17 health-check H.2: outside-click close for the bulk
  // action dropdowns. Without this, clicking the table or the page
  // background left "Move to Stage" / "Refuse" panels open until the
  // user clicked the toggle button again — every other dropdown in
  // the portal closes on outside-click (FilterChip / kebab menus).
  const bulkBarRef = useRef(null);
  useEffect(() => {
    if (!bulkAction) return undefined;
    const handler = (e) => {
      if (bulkBarRef.current && !bulkBarRef.current.contains(e.target)) {
        setBulkAction(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bulkAction]);

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
      if (allOnPageSelected) {
        // Deselect every visible row but keep selections from other pages.
        for (const id of allVisibleIds) next.delete(id);
      } else {
        for (const id of allVisibleIds) next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkAction(null);
  };

  const handleBulkMove = async (targetStageId) => {
    if (!orgSlug || selectedIds.size === 0 || !targetStageId) return;
    setBulkSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await atsApi.bulkMoveStage(orgSlug, ids, targetStageId);
      if (res?.success) {
        const stageName = stages.find(s => s._id === targetStageId)?.name || 'stage';
        showToast(`Moved ${res.modified} application${res.modified === 1 ? '' : 's'} to ${stageName}`);
        clearSelection();
        await fetchApplications();
      } else {
        showToast(res?.error || 'Bulk move failed', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Bulk move failed', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkRefuse = async (refuseReasonId) => {
    if (!orgSlug || selectedIds.size === 0) return;
    const n = selectedIds.size;
    setConfirmDialog({
      title: `Refuse ${n} application${n === 1 ? '' : 's'}?`,
      message: 'No emails will be sent to the candidates. Already-hired and already-refused applications in your selection are skipped automatically.',
      confirmLabel: `Refuse ${n}`,
      danger: true,
      action: async () => {
        setBulkSubmitting(true);
        try {
          const ids = Array.from(selectedIds);
          const res = await atsApi.bulkRefuse(orgSlug, ids, refuseReasonId);
          if (res?.success) {
            showToast(`Refused ${res.modified} application${res.modified === 1 ? '' : 's'}`);
            clearSelection();
            await fetchApplications();
          } else {
            showToast(res?.error || 'Bulk refuse failed', 'error');
          }
        } catch (err) {
          showToast(err?.message || 'Bulk refuse failed', 'error');
        } finally {
          setBulkSubmitting(false);
        }
      },
    });
  };

  // Mirrors fetchApplications' filter chain so the export matches the
  // on-screen filter state. Uses the same `recruiter` / `jobId` query-param
  // names that fetchApplications uses (the backend export endpoint accepts
  // both spellings — see ats.js).
  const handleExport = async () => {
    if (!orgSlug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => { if (v) params.set(k, v); });
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

  // Build filter options for the chip dropdowns. Memoised — these
  // arrays of {value,label} pairs are passed down to FilterChip whose
  // identity check triggers a re-render of every option in the dropdown
  // on any parent re-render (search keystroke, filter toggle).
  // 2026-05-12 audit P2 #17.
  const stageOptions = useMemo(
    () => stages.map((s) => ({ value: s._id, label: s.name })),
    [stages],
  );
  const jobOptions = useMemo(
    () => jobs.map((j) => ({ value: j._id, label: j.name })),
    [jobs],
  );
  const recruiterOptions = useMemo(
    () => recruiters.map((r) => ({ value: r._id, label: r.name || r.email || r._id })),
    [recruiters],
  );
  const sourceOptions = useMemo(
    () => sources.map((s) => ({ value: s.name || s._id, label: s.name || s._id })),
    [sources],
  );
  const employmentTypeOptions = useMemo(
    // Server returns rows from ats_employment_types picklist;
    // also accepts the hardcoded ATS_EMPLOYMENT_TYPE_KEYS fallback shape.
    () => employmentTypes.map((t) => ({
      value: t.name || t.value || t.key || t,
      label: t.label || t.name || t.value || t.key || t,
    })),
    [employmentTypes],
  );

  // ── Grouped data (Phase 1: stage / recruiter / job) ──────────────────
  const groupedApplications = useMemo(() => {
    if (!groupBy) return null;
    const extractor = (app) => {
      if (groupBy === 'stage') {
        return [{ key: app.stageId || '__unknown__', label: app.stageName || 'Unknown stage' }];
      }
      if (groupBy === 'recruiter') {
        return [{
          key: app.recruiterId || '__unknown__',
          label: app.recruiterName || (app.recruiterId ? 'Unknown recruiter' : 'No recruiter'),
        }];
      }
      if (groupBy === 'job') {
        return [{
          key: app.jobPositionId || '__unknown__',
          label: app.jobName || 'Unknown job',
        }];
      }
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

  // Pagination
  const pageStart = total === 0 ? 0 : (page - 1) * 25 + 1;
  const pageEnd = Math.min(page * 25, total);

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">All Applications</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'application' : 'applications'} total
          </p>
        </div>
        {/* New Application creation is intentionally not surfaced here
            since 2026-05-10. Applications are created from the Job
            Position detail page (/ats/jobs/:id) via "+ New Application",
            which is gated to jobs in `open` or `on_hold` status. The
            ?action=new deep-link below is also gone — landing here via
            that URL just shows the list. */}
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <FilterBar searchPlaceholder="Search by candidate name, email, or job position…">
            <FilterChip type="select" paramKey="stageId" label="Stage" options={stageOptions} />
            <FilterChip type="select" paramKey="jobId" label="Job Position" options={jobOptions} />
            <FilterChip type="select" paramKey="recruiter" label="Recruiter" options={recruiterOptions} />
            <FilterChip type="select" paramKey="applicationStatus" label="Status" options={APP_STATUS_OPTIONS} />
            <GroupByChip options={APP_GROUP_BY_OPTIONS} />
            <MoreFiltersPopover paramKeys={['source', 'employmentType']}>
              <FilterChip type="select" paramKey="source" label="Source" options={sourceOptions} placeholder="No sources" />
              <FilterChip type="select" paramKey="employmentType" label="Employment Type" options={employmentTypeOptions} placeholder="No types" />
            </MoreFiltersPopover>
            <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
          </FilterBar>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <DensityToggle density={density} onChange={setDensity} />
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            title="Download the current filtered list as a CSV file"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-dark-300 hover:text-white transition-colors rounded-lg hover:bg-dark-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : applications.length === 0 ? (
        // 2026-05-17 health-check H.2: when filters are active and the
        // result-set is empty, give the user a one-click "Clear filters"
        // affordance instead of leaving them to wipe each chip manually.
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No applications found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm mb-4">
            {Object.values(filterParams).some(Boolean)
              ? 'Try adjusting your search or filters.'
              : 'Create your first application or use the Pipeline view to add candidates.'}
          </p>
          {Object.values(filterParams).some(Boolean) && (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams())}
              className="text-xs text-rivvra-400 hover:text-rivvra-300 underline underline-offset-2"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Bulk action bar — appears when one or more rows are selected.
              Sits above the table so it's clearly tied to the list. */}
          {selectedIds.size > 0 && (
            <div
              ref={bulkBarRef}
              className="card flex flex-wrap items-center gap-3 p-3 bg-rivvra-500/10 border-rivvra-500/30"
            >
              <span className="text-sm text-white font-medium">
                {selectedIds.size} selected
              </span>
              <button
                onClick={clearSelection}
                disabled={bulkSubmitting}
                className="text-xs text-dark-400 hover:text-white transition-colors disabled:opacity-40"
              >
                Clear
              </button>

              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {/* Move to Stage */}
                <div className="relative">
                  <button
                    onClick={() => setBulkAction(bulkAction === 'stage' ? null : 'stage')}
                    disabled={bulkSubmitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-800 border border-dark-700 rounded-lg text-dark-200 hover:bg-dark-700 hover:text-white disabled:opacity-40"
                  >
                    {bulkSubmitting ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                    Move to Stage
                    <ChevronDown size={12} />
                  </button>
                  {bulkAction === 'stage' && (
                    <div className="absolute right-0 mt-1 w-56 max-w-[calc(100vw-2rem)] bg-dark-800 border border-dark-700 rounded-lg shadow-lg z-20 max-h-72 overflow-y-auto">
                      {stages.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-dark-500">No stages configured</div>
                      ) : stages.map((s) => (
                        <button
                          key={s._id}
                          onClick={() => { setBulkAction(null); handleBulkMove(s._id); }}
                          className="w-full text-left px-3 py-2 text-xs text-dark-200 hover:bg-dark-700 hover:text-white transition-colors"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refuse */}
                <div className="relative">
                  <button
                    onClick={() => setBulkAction(bulkAction === 'refuse' ? null : 'refuse')}
                    disabled={bulkSubmitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-800 border border-dark-700 rounded-lg text-dark-200 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30 disabled:opacity-40"
                  >
                    {bulkSubmitting ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                    Refuse
                    <ChevronDown size={12} />
                  </button>
                  {bulkAction === 'refuse' && (
                    <div className="absolute right-0 mt-1 w-56 max-w-[calc(100vw-2rem)] bg-dark-800 border border-dark-700 rounded-lg shadow-lg z-20 max-h-72 overflow-y-auto">
                      <button
                        onClick={() => { setBulkAction(null); handleBulkRefuse(null); }}
                        className="w-full text-left px-3 py-2 text-xs text-dark-300 hover:bg-dark-700 hover:text-white transition-colors italic"
                      >
                        No reason specified
                      </button>
                      {refuseReasons.length > 0 && (
                        <div className="border-t border-dark-700" />
                      )}
                      {refuseReasons.map((r) => (
                        <button
                          key={r._id}
                          onClick={() => { setBulkAction(null); handleBulkRefuse(r._id); }}
                          className="w-full text-left px-3 py-2 text-xs text-dark-200 hover:bg-dark-700 hover:text-white transition-colors"
                        >
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={selectAllCheckboxRef}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Select all on this page"
                        aria-checked={
                          allOnPageSelected ? 'true'
                          : someOnPageSelected ? 'mixed' : 'false'
                        }
                        className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500/30 cursor-pointer"
                      />
                    </th>
                    {/* 2026-05-13 audit Q4 = A: sortable column headers.
                        Candidate/Job/Stage/Recruiter/Evaluation/Applied
                        all sort; L1/L2 Feedback skip sort (structured
                        result data, not a comparable scalar). */}
                    <SortableHeader column="candidateName">Candidate</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                    <SortableHeader column="jobPositionId" className="hidden sm:table-cell">Job Position</SortableHeader>
                    <SortableHeader column="stageId">Stage</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                    <SortableHeader column="evaluation" align="center" className="hidden lg:table-cell">Evaluation</SortableHeader>
                    <SortableHeader column="appliedOn" className="hidden xl:table-cell">Applied</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">L1 Feedback</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">L2 Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                  const renderRow = (app, keySuffix = '') => (
                    // 2026-05-17 Phase M.3: tr behaves like a button
                    // (onClick navigates). Adds role + aria-label so
                    // screen readers announce it as an actionable
                    // application row instead of a generic table row.
                    <tr
                      key={`${app._id}${keySuffix}`}
                      onClick={() => navigate(orgPath(`/ats/applications/${app._id}`))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(orgPath(`/ats/applications/${app._id}`));
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open application: ${app.candidateName || 'Unknown'}${app.jobName ? ` for ${app.jobName}` : ''}`}
                      className={`border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors focus:outline-none focus:bg-dark-800/70 focus:ring-1 focus:ring-rivvra-500/40 ${selectedIds.has(app._id) ? 'bg-rivvra-500/5' : ''} ${density === 'compact' ? '[&>td]:py-1.5' : '[&>td]:py-3'}`}
                    >
                      {/* Bulk-select checkbox — stop click bubbling so the
                          row's onClick navigation doesn't fire. */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(app._id)}
                          onChange={() => toggleSelectOne(app._id)}
                          aria-label={`Select ${app.candidateName || 'application'}`}
                          className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500/30 cursor-pointer"
                        />
                      </td>
                      {/* Candidate. 2026-05-17 Phase N: inner Link to
                          the candidate when candidateId is present. The
                          row's onClick still navigates to the application
                          detail; stopPropagation makes the inner Link win
                          when the user clicks the name directly. */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-rivvra-400 text-xs font-semibold">
                              {(app.candidateName || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            {app.candidateId ? (
                              <Link
                                to={orgPath(`/ats/candidates/${app.candidateId}`)}
                                onClick={(e) => e.stopPropagation()}
                                className="text-white font-medium truncate block hover:text-rivvra-300 hover:underline"
                              >
                                {app.candidateName || 'Unnamed'}
                              </Link>
                            ) : (
                              <p className="text-white font-medium truncate">{app.candidateName || 'Unnamed'}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        <span className="truncate block max-w-[180px]" title={app.candidateEmail || ''}>
                          {app.candidateEmail || '\u2014'}
                        </span>
                      </td>

                      {/* Job Position. Phase N: inner Link. */}
                      <td className="px-4 py-3 text-dark-300 hidden sm:table-cell">
                        {app.jobPositionId && app.jobName ? (
                          <Link
                            to={orgPath(`/ats/jobs/${app.jobPositionId}`)}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-rivvra-300 hover:underline"
                          >
                            {app.jobName}
                          </Link>
                        ) : (
                          app.jobName || '\u2014'
                        )}
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-3">
                        <StageBadge stageName={app.stageName || app.stageId?.name} />
                      </td>

                      {/* Recruiter. Phase N: conditional Link to employee
                          when recruiterId resolves (post-migration some
                          rows have name without a Rivvra employee id \u2014
                          fall back to plain text in that case). */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {app.recruiterId && app.recruiterName ? (
                          <Link
                            to={orgPath(`/employee/${app.recruiterId}`)}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-rivvra-300 hover:underline"
                          >
                            {app.recruiterName}
                          </Link>
                        ) : (
                          app.recruiterName || '\u2014'
                        )}
                      </td>

                      {/* Evaluation */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex justify-center">
                          <EvalStars value={app.evaluation || 0} />
                        </div>
                      </td>

                      {/* Applied */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        {formatDate(app.appliedOn)}
                      </td>

                      {/* L1 Feedback \u2014 prefer structured l1Result.recommendation
                          (Proceed / Awaited / Reject), fall back to the legacy
                          free-text l1Feedback for any record whose Odoo value
                          didn't normalize (e.g. "Selected" \u2192 "Proceed").
                          2026-05-12 audit fix. */}
                      <td className="px-4 py-3 text-xs hidden xl:table-cell">
                        <FeedbackBadge result={app.l1Result} legacy={app.l1Feedback} />
                      </td>
                      {/* L2 Feedback */}
                      <td className="px-4 py-3 text-xs hidden xl:table-cell">
                        <FeedbackBadge result={app.l2Result} legacy={app.l2Feedback} />
                      </td>
                    </tr>
                  );
                  // 2026-05-12 ATS audit Q2 = A: when groupBy is set, wrap
                  // the row stream in collapsible group section headers.
                  if (!isGrouped) {
                    return applications.map((a) => renderRow(a));
                  }
                  return (groupedApplications || []).flatMap(([key, group]) => {
                    const collapsed = collapsedGroups.has(key);
                    // 2026-05-13 audit Q3 = A+B: visual hooks + sticky.
                    // Stage groups → blue accent, no avatar (stage isn't
                    // a person). Recruiter → violet accent + initials.
                    // Job → cyan accent, no avatar.
                    const accent = groupBy === 'stage' ? 'bg-blue-500'
                      : groupBy === 'recruiter' ? 'bg-violet-500'
                      : 'bg-cyan-500';
                    const avatarColor = groupBy === 'recruiter'
                      ? 'bg-violet-500/15 text-violet-300'
                      : '';
                    const header = (
                      <GroupedHeader
                        key={`__group__${key}`}
                        label={group.label}
                        count={group.records.length}
                        recordSingular="application"
                        colSpan={10}
                        collapsed={collapsed}
                        onToggle={() => toggleGroup(key)}
                        accent={accent}
                        avatarText={groupBy === 'recruiter' ? undefined : ''}
                        avatarColor={avatarColor}
                        sticky
                        stickyTop="-1px"
                      />
                    );
                    const rows = collapsed ? [] : group.records.map((a) => renderRow(a, `__${key}`));
                    return [header, ...rows];
                  });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination — hidden in grouped mode (server returns the full
              filtered set so grouping is correct; pagination would
              fragment groups). */}
          {!isGrouped && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-dark-400 text-sm">
                {/* 2026-05-17 Phase L: literal "\u2013" was rendering as backslash-u text
                    in production JSX (escape not interpreted in JSX children). */}
                Showing {pageStart}–{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-2 text-dark-500 text-sm">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          p === page
                            ? 'bg-rivvra-500 text-dark-950'
                            : 'text-dark-400 hover:text-white hover:bg-dark-800'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        busy={bulkSubmitting}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={async () => {
          await confirmDialog?.action?.();
          setConfirmDialog(null);
        }}
      />
    </div>
  );
}
