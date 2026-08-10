import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import FilterBar, { FilterChip, GroupByChip, MoreFiltersPopover, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { useDensity } from '../../hooks/useDensity';
import DensityToggle from '../../components/shared/DensityToggle';
import SortableHeader from '../../components/shared/SortableHeader';
import GroupedHeader from '../../components/shared/GroupedHeader';

// Non-grouped page size. Must match the value passed to listJobs so the
// "Showing x–y" label lines up with what the server actually returned —
// previously the label hardcoded 20 while the API defaulted to 25.
const PAGE_SIZE = 25;

const JOB_GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'client', label: 'Client' },
  { value: 'status', label: 'Status' },
  { value: 'department', label: 'Department' },
];

const JOB_APPROVAL_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const JOB_HIRING_MODE_OPTIONS = [
  { value: 'C2C', label: 'C2C' },
  { value: 'Full-time Hire', label: 'Full-time Hire' },
  { value: 'Contract', label: 'Contract' },
];

const JOB_EXPERIENCE_OPTIONS = [
  { value: '0-2', label: '0–2 years' },
  { value: '3-4', label: '3–4 years' },
  { value: '5+', label: '5+ years' },
  { value: '7-8', label: '7–8 years' },
  { value: '8-10', label: '8–10 years' },
];
import {
  Plus, Loader2, Briefcase,
  ChevronLeft, ChevronRight, ChevronDown, X,
} from 'lucide-react';

/* ── Status badge helper ──────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const styles = {
    open: 'bg-emerald-500/10 text-emerald-400',
    on_hold: 'bg-amber-500/10 text-amber-400',
    closed: 'bg-red-500/10 text-red-400',
  };
  const labels = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Unknown'}
    </span>
  );
}

/* ── Approval status badge helper ─────────────────────────────────────── */
function ApprovalBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    approved: 'bg-emerald-500/20 text-emerald-400',
    rejected: 'bg-red-500/20 text-red-400',
  };
  const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  const key = (status || 'pending').toLowerCase();

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Pending'}
    </span>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsJobPositions() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams([
    'search', 'status', 'department', 'archived',
    'approvalStatus', 'hiringMode', 'requiredExperience', 'clientName', 'groupBy', 'sort', 'dir',
  ]);
  const { density, setDensity } = useDensity('ats:jobs');
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);

  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  // 2026-05-17 Phase L: harden page-param parsing (see AtsApplications).
  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  // 2026-05-17 health-check F.3: legacy `departments` state removed —
  // facetDepartments (loaded from /jobs/facets) is the canonical source
  // for the filter chip now.

  // 2026-05-17 health-check F.1: removed dead showModal + debounceRef.
  // The NewJobModal is gone — internal-role creation lives at the routed
  // /ats/jobs/new page (client roles come from CRM Won conversion); the
  // debounce ref was declared but FilterBar owns its own search debounce.
  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // Apply the three landing defaults atomically (status / approvalStatus /
  // groupBy). Each default is opt-in only when the URL didn't already
  // specify the key — so clearing a chip reapplies the default on next
  // mount, but picking a specific value sticks across reloads.
  //
  // 2026-05-18 PM: merged what were three separate mount effects into one
  // pass. Each effect was building its `np` from the same pre-mutation
  // `searchParams` snapshot and calling setSearchParams independently,
  // so the second update to flush overwrote the first — a race that
  // showed up as the bare /ats/jobs URL sometimes loading with only
  // groupBy or only status applied, depending on React's flush order.
  // One effect + one setSearchParams call eliminates the race.
  //
  // 2026-05-19: deps changed from [] to [location.pathname]. Empty deps
  // worked on hard reload but failed when the user re-entered the route
  // via the sidebar after visiting /ats/applications — the previous
  // mount's effect closure had already fired and React's mount-on-
  // remount didn't reliably re-fire it for this user. Keying on
  // pathname makes "re-applying defaults on route entry" the
  // semantic, which is exactly what the intent comment promises.
  // Within-route filter changes leave pathname stable, so this won't
  // stomp a user's cleared chip.
  //
  // History entry uses `replace: true` so the default-application
  // doesn't pollute back-button history.
  useEffect(() => {
    // 2026-05-25 health-check F-P1-8: only inject defaults when ALL of
    // the relevant landing keys are absent. Previously the per-key
    // `searchParams.has(x)` checks ran independently, so a bookmarked
    // URL like `/ats/jobs?status=closed` would still get
    // `approvalStatus=approved` slammed on top, narrowing the view to
    // closed-AND-approved. Treat any explicit filter key as a signal
    // that the user is driving the URL and skip default-injection
    // entirely. Within-route entries (sidebar re-click) preserve the
    // user's URL; a fresh /ats/jobs visit still gets all three defaults.
    // 2026-07-18 audit D1: the previous explicit-key list missed
    // department/sort/dir/page, so a deep link like
    // `/ats/jobs?department=Engineering&sort=name` still had the three
    // defaults slammed on top, narrowing the view. ANY present query key
    // now counts as user intent and skips default-injection entirely.
    const userHasFilters = [...searchParams.keys()].length > 0;
    if (userHasFilters) return;
    const np = new URLSearchParams(searchParams);
    np.set('status', 'open');
    np.set('approvalStatus', 'approved');
    np.set('groupBy', 'status');
    setSearchParams(np, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ── Fetch jobs ─────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!orgSlug) return;
    // 2026-05-17 health-check D.1: don't blank prior view; dedup via
    // _requestKey so rapid filter typing auto-aborts stale requests.
    setLoading(true);
    // 2026-05-19: aborted-flag so the finally below skips setLoading
    // (false) when the fetch is cancelled by a newer one — JS finally
    // runs even when catch returns. Without this, every aborted fetch
    // flashes the empty-state for one frame.
    let aborted = false;
    try {
      // 2026-05-17 ATS-JOBS-GROUP-FETCH: when groupBy is active, pull the
      // full filtered set in one shot (cap 5000, matches API ceiling) so
      // groups aren't fragmented or undercounted. Default landing now
      // groups by Status, so this path is the common case — without
      // limit:5000 the 812-job tenant would show only the first 25 in
      // grouped buckets.
      const res = await atsApi.listJobs(orgSlug, {
        page: isGrouped ? 1 : page,
        ...(isGrouped ? { limit: 5000 } : { limit: PAGE_SIZE }),
        ...filterParams,
        _requestKey: 'ats:jobs:list',
      });
      if (res.success) {
        setJobs(res.jobs || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        // 2026-05-17 health-check F.3: page-distinct departments removed
        // — facet endpoint owns this now.
      }
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      console.error('Failed to load jobs:', err);
      showToast('Failed to load job positions', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, isGrouped, JSON.stringify(filterParams), showToast]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // 2026-05-17 Phase L: page-clamp guard (see AtsApplications for rationale).
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

  // Archived count for the segmented Active/Archived chip.
  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    atsApi.listJobs(orgSlug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined })]);

  // 2026-05-17 health-check F.3: load department + client distinct
  // values across the WHOLE jobs slice (not just page 1). Previously the
  // chips were built from `jobs` which only had the current page's rows
  // — pagination silently changed the dropdown contents. /jobs/facets
  // returns the canonical distinct sets for both fields. Refetched when
  // the company switches or the archived view toggles, since the facet
  // set differs per scope.
  const [facetDepartments, setFacetDepartments] = useState([]);
  const [facetClients, setFacetClients] = useState([]);
  useEffect(() => {
    if (!orgSlug) return undefined;
    const controller = new AbortController();
    atsApi.getJobFacets(orgSlug, { archived: filterParams.archived === '1' ? '1' : undefined })
      .then((res) => {
        if (controller.signal.aborted || !res?.success) return;
        setFacetDepartments(res.departments || []);
        setFacetClients(res.clients || []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [orgSlug, currentCompany?._id, filterParams.archived]);

  // Filter options
  const statusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'closed', label: 'Closed' },
  ];
  const departmentOptions = useMemo(
    () => facetDepartments.map((d) => ({ value: d.value, label: d.value })),
    [facetDepartments],
  );
  // 2026-05-17 health-check F.3: clients now come from /jobs/facets, not
  // from the current page's `jobs` array. The legacy fall-back to
  // page-1 distinct values is kept commented for traceability.
  const clientOptions = useMemo(
    () => facetClients.map((c) => ({ value: c.value, label: c.value })),
    [facetClients],
  );

  // ── Grouped data (Phase 1: client / status / department) ─────────────
  const groupedJobs = useMemo(() => {
    if (!groupBy) return null;
    const extractor = (job) => {
      if (groupBy === 'client') {
        return [{
          key: job.clientName || job.partnerId || '__unknown__',
          label: job.clientName || (job.partnerId ? 'Unknown client' : 'No client'),
        }];
      }
      if (groupBy === 'status') {
        const labelMap = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };
        return [{
          key: job.status || '__unknown__',
          label: labelMap[job.status] || job.status || 'Unknown',
        }];
      }
      if (groupBy === 'department') {
        return [{
          key: job.department || '__unknown__',
          label: job.department || 'No department',
        }];
      }
      return [];
    };
    return sortGroupsByCount(groupRecords(jobs, extractor));
  }, [jobs, groupBy]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Pagination
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

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
    <div className="p-3 sm:p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Positions</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'position' : 'positions'} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DensityToggle density={density} onChange={setDensity} />
          {/* Creation is split by role type: client roles come from converting
              a Won opportunity on CrmOpportunityDetail (the sales funnel,
              canonical since 2026-05-10); internal roles use the direct
              /ats/jobs/new form (added 2026-08-04 so nobody has to fabricate
              a placeholder opportunity for in-house hires). */}
          {isAdmin && (
            <button
              onClick={() => navigate(orgPath('/ats/jobs/new'))}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors"
            >
              <Plus size={16} /> New Internal Job
            </button>
          )}
        </div>
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <FilterBar searchPlaceholder="Search by position name, department, or client…">
        <FilterChip type="select" paramKey="status" label="Status" options={statusOptions} />
        <FilterChip type="select" paramKey="department" label="Department" options={departmentOptions} />
        <FilterChip type="select" paramKey="clientName" label="Client" options={clientOptions} placeholder="No clients" />
        <FilterChip type="select" paramKey="approvalStatus" label="Approval" options={JOB_APPROVAL_OPTIONS} />
        <GroupByChip options={JOB_GROUP_BY_OPTIONS} />
        <MoreFiltersPopover paramKeys={['hiringMode', 'requiredExperience']}>
          <FilterChip type="select" paramKey="hiringMode" label="Hiring Mode" options={JOB_HIRING_MODE_OPTIONS} />
          <FilterChip type="select" paramKey="requiredExperience" label="Experience" options={JOB_EXPERIENCE_OPTIONS} />
        </MoreFiltersPopover>
        <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
      </FilterBar>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : jobs.length === 0 ? (
        // 2026-05-17 Phase M.2: filter-active empty state gets a
        // "Clear all filters" affordance. Same pattern as Applications
        // + Candidates.
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No job positions found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm mb-4">
            {Object.values(filterParams).some(Boolean)
              ? 'Try adjusting your search or filters.'
              : 'Client roles are created by converting a Won CRM opportunity (Convert to Job Position). For internal roles, use the New Internal Job button above.'}
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
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    {/* 2026-05-13 audit Q4 = A: sortable column headers. */}
                    <SortableHeader column="name">Name</SortableHeader>
                    <SortableHeader column="department" className="hidden md:table-cell">Department</SortableHeader>
                    <SortableHeader column="status" className="hidden sm:table-cell">Status</SortableHeader>
                    <SortableHeader column="requiredExperience" className="hidden lg:table-cell">Experience</SortableHeader>
                    <SortableHeader column="hiringMode" className="hidden lg:table-cell">Hiring Mode</SortableHeader>
                    <SortableHeader column="approvalStatus" className="hidden lg:table-cell">Approval</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                    <SortableHeader column="clientName" className="hidden lg:table-cell">Client</SortableHeader>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Published</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Applications</th>
                    <SortableHeader column="expectedHires" align="center" className="hidden xl:table-cell">Expected</SortableHeader>
                    <SortableHeader column="createdAt" className="hidden xl:table-cell">Created</SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                  const renderRow = (job, keySuffix = '') => (
                    // 2026-05-17 Phase M.3: keyboard + a11y for the
                    // navigable row (same pattern as AtsApplications).
                    <tr
                      key={`${job._id}${keySuffix}`}
                      onClick={() => navigate(orgPath(`/ats/jobs/${job._id}`))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(orgPath(`/ats/jobs/${job._id}`));
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open job: ${job.name || 'Unknown'}${job.clientName ? ` for ${job.clientName}` : ''}`}
                      className={`border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors focus:outline-none focus:bg-dark-800/70 focus:ring-1 focus:ring-rivvra-500/40 ${density === 'compact' ? '[&>td]:py-1.5' : '[&>td]:py-3'}`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                            <Briefcase size={14} className="text-rivvra-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{job.name}</p>
                            {job.location && (
                              <p className="text-dark-500 text-xs truncate">{job.location}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        {job.department || '\u2014'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <StatusBadge status={job.status} />
                      </td>

                      {/* Required Experience */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.requiredExperience || '\u2014'}
                      </td>

                      {/* Hiring Mode */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.hiringMode || '\u2014'}
                      </td>

                      {/* Approval Status */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <ApprovalBadge status={job.approvalStatus} />
                      </td>

                      {/* Recruiter. 2026-05-17 Phase N: conditional inner
                          Link to employee when recruiterId resolves. Some
                          migrated rows have name without a Rivvra employee
                          id \u2014 fall back to plain text in that case. */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.recruiterId && job.recruiterName ? (
                          <Link
                            to={orgPath(`/employee/${job.recruiterId}`)}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-rivvra-300 hover:underline"
                          >
                            {job.recruiterName}
                          </Link>
                        ) : (
                          job.recruiterName || '\u2014'
                        )}
                      </td>

                      {/* Client. Phase N: inner Link to the contact when
                          clientContactId is present. */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.clientContactId && job.clientName ? (
                          <Link
                            to={orgPath(`/contacts/${job.clientContactId}`)}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-rivvra-300 hover:underline"
                          >
                            {job.clientName}
                          </Link>
                        ) : (
                          job.clientName || '\u2014'
                        )}
                      </td>

                      {/* Published — publishToCareers is what the careers
                          publish flow writes; the legacy `published` flag is
                          never set, so live public jobs showed "No". */}
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          job.publishToCareers ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-500'
                        }`}>
                          {job.publishToCareers ? 'Yes' : 'No'}
                        </span>
                      </td>

                      {/* Applications count */}
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        <span className="bg-dark-700 text-dark-300 text-xs px-2 py-0.5 rounded-full">
                          {job.applicationCount ?? job.applications ?? 0}
                        </span>
                      </td>

                      {/* Expected Hires */}
                      <td className="px-4 py-3 text-center text-dark-300 hidden xl:table-cell">
                        {job.expectedHires ?? '\u2014'}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        {formatDate(job.createdAt)}
                      </td>
                    </tr>
                  );
                  // 2026-05-12 ATS audit Q2 = A: when groupBy is set, wrap
                  // row stream in collapsible group sections.
                  if (!isGrouped) {
                    return jobs.map((j) => renderRow(j));
                  }
                  return (groupedJobs || []).flatMap(([key, group]) => {
                    const collapsed = collapsedGroups.has(key);
                    // 2026-05-13 audit Q3 = A+B: client → cyan accent
                    // with initials avatar (clients are entities);
                    // status → amber (state); department → slate (taxonomy).
                    const accent = groupBy === 'client' ? 'bg-cyan-500'
                      : groupBy === 'status' ? 'bg-amber-500'
                      : 'bg-slate-500';
                    const avatarColor = groupBy === 'client'
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : '';
                    const header = (
                      <GroupedHeader
                        key={`__group__${key}`}
                        label={group.label}
                        count={group.records.length}
                        recordSingular="job"
                        colSpan={12}
                        collapsed={collapsed}
                        onToggle={() => toggleGroup(key)}
                        accent={accent}
                        avatarText={groupBy === 'client' ? undefined : ''}
                        avatarColor={avatarColor}
                        sticky
                        stickyTop="-1px"
                      />
                    );
                    const rows = collapsed ? [] : group.records.map((j) => renderRow(j, `__${key}`));
                    return [header, ...rows];
                  });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {!isGrouped && totalPages > 1 && (
            <div className="flex items-center justify-between pr-40">
              {/* pr-40 clears the floating Ask AI pill (fixed bottom-right on
                  ATS pages) so page-number buttons are never rendered under it. */}
              <p className="text-dark-400 text-sm">
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

      {/* 2026-05-17 health-check F.1: NewJobModal mount removed — it stayed
          dead in this file pulling in the chunk on every list render.
          2026-08-04: the header "+ New Internal Job" button navigates to the
          routed /ats/jobs/new page (internal roles only; client roles come
          from CRM Won conversion). */}
    </div>
  );
}
