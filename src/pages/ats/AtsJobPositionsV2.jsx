import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { useDensity } from '../../hooks/useDensity';
import { DataTable, FilterBar, Pagination, EmptyState, Button, Chip, DensityToggle, GroupedHeader } from '../../components/ds';
import {
  useListParams, usePageParam, useSearchParamValue,
  SelectChipV2, GroupByChipV2, ArchivedToggleV2, MoreFiltersV2, PageHeaderV2,
} from '../../components/platform/v2/listkit';
import { Plus, Briefcase } from 'lucide-react';

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
const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'closed', label: 'Closed' },
];

const statusChip = (status) => {
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  const map = { open: ['brand', 'Open'], on_hold: ['warn', 'On Hold'], closed: ['danger', 'Closed'] };
  const [tone, label] = map[key] || ['neutral', status || 'Unknown'];
  return <Chip tone={tone}>{label}</Chip>;
};
const approvalChip = (status) => {
  const key = (status || 'pending').toLowerCase();
  const map = { pending: ['warn', 'Pending'], approved: ['brand', 'Approved'], rejected: ['danger', 'Rejected'] };
  const [tone, label] = map[key] || ['neutral', status];
  return <Chip tone={tone}>{label}</Chip>;
};

/* v2 Job Positions (Slice 3 Wave B) — same data flow, landing defaults,
   facets and grouping as AtsJobPositions.jsx on ds DataTable + listkit. */
export default function AtsJobPositionsV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useListParams([
    'search', 'status', 'department', 'archived',
    'approvalStatus', 'hiringMode', 'requiredExperience', 'clientName', 'groupBy', 'sort', 'dir',
  ]);
  const { density, setDensity } = useDensity('ats:jobs');
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [page, setPage] = usePageParam();
  const [searchValue, setSearchValue] = useSearchParamValue('search');

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  // Landing defaults (status=open, approvalStatus=approved, groupBy=status)
  // applied atomically, only on a bare URL — see the legacy page for the
  // full history of the race and deep-link bugs this shape avoids.
  useEffect(() => {
    const userHasFilters = [...searchParams.keys()].length > 0;
    if (userHasFilters) return;
    const np = new URLSearchParams(searchParams);
    np.set('status', 'open');
    np.set('approvalStatus', 'approved');
    np.set('groupBy', 'status');
    setSearchParams(np, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const fetchJobs = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    let aborted = false;
    try {
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

  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    atsApi.listJobs(orgSlug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined })]);

  // Facets = canonical distinct department/client sets across the whole
  // jobs slice (not the current page).
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

  const departmentOptions = useMemo(() => facetDepartments.map((d) => ({ value: d.value, label: d.value })), [facetDepartments]);
  const clientOptions = useMemo(() => facetClients.map((c) => ({ value: c.value, label: c.value })), [facetClients]);

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
        return [{ key: job.status || '__unknown__', label: labelMap[job.status] || job.status || 'Unknown' }];
      }
      if (groupBy === 'department') {
        return [{ key: job.department || '__unknown__', label: job.department || 'No department' }];
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

  const formatDate = (dateStr) => dateStr
    ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const hasFilters = Object.values(filterParams).some(Boolean);
  const goTo = (j) => navigate(orgPath(`/ats/jobs/${j._id}`));

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true, width: 260,
      render: (j) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}>
            <Briefcase size={13} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
            {j.location && <span style={{ display: 'block', font: '450 11.5px/1.3 var(--font)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.location}</span>}
          </span>
        </span>
      ),
    },
    { key: 'department', header: 'Department', sortable: true, muted: true, width: 140 },
    { key: 'status', header: 'Status', sortable: true, width: 100, render: (j) => statusChip(j.status) },
    { key: 'requiredExperience', header: 'Experience', sortable: true, muted: true, width: 110 },
    { key: 'hiringMode', header: 'Hiring Mode', sortable: true, muted: true, width: 120 },
    { key: 'approvalStatus', header: 'Approval', sortable: true, width: 110, render: (j) => approvalChip(j.approvalStatus) },
    {
      key: 'recruiterName', header: 'Recruiter', width: 140,
      render: (j) => (j.recruiterId && j.recruiterName) ? (
        <Link to={orgPath(`/employee/${j.recruiterId}`)} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>
          {j.recruiterName}
        </Link>
      ) : (j.recruiterName || null),
    },
    {
      key: 'clientName', header: 'Client', sortable: true, width: 150,
      render: (j) => (j.clientContactId && j.clientName) ? (
        <Link to={orgPath(`/contacts/${j.clientContactId}`)} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>
          {j.clientName}
        </Link>
      ) : (j.clientName || null),
    },
    {
      key: 'published', header: 'Published', align: 'center', width: 90,
      render: (j) => <Chip tone={j.publishToCareers ? 'brand' : 'neutral'}>{j.publishToCareers ? 'Yes' : 'No'}</Chip>,
    },
    {
      key: 'applicationCount', header: 'Applications', align: 'center', width: 100,
      render: (j) => <Chip>{j.applicationCount ?? j.applications ?? 0}</Chip>,
    },
    { key: 'expectedHires', header: 'Expected', sortable: true, align: 'center', muted: true, width: 90 },
    { key: 'createdAt', header: 'Created', sortable: true, muted: true, width: 110, render: (j) => formatDate(j.createdAt) },
  ];

  const dsSort = filterParams.sort ? { key: filterParams.sort, dir: filterParams.dir === 'desc' ? 'desc' : 'asc' } : null;
  const onSortChange = (next) => {
    const np = new URLSearchParams(searchParams);
    if (!next) { np.delete('sort'); np.delete('dir'); }
    else { np.set('sort', next.key); np.set('dir', next.dir); }
    np.delete('page');
    setSearchParams(np);
  };

  const renderGroupedRows = () => (groupedJobs || []).flatMap(([key, group]) => {
    const collapsed = collapsedGroups.has(key);
    const accent = groupBy === 'client' ? 'var(--info, #06b6d4)' : groupBy === 'status' ? 'var(--warn, #f59e0b)' : 'var(--fg-4)';
    const header = (
      <GroupedHeader
        key={`__group__${key}`}
        label={group.label}
        count={group.records.length}
        noun="job"
        colSpan={columns.length}
        collapsed={collapsed}
        onToggle={() => toggleGroup(key)}
        accent={accent}
        avatarText={groupBy === 'client' ? undefined : ''}
        sticky
        stickyTop={30}
      />
    );
    const pad = density === 'compact' ? '6px 12px' : '11px 14px';
    const rows = collapsed ? [] : group.records.map((j) => (
      <tr
        key={`${j._id}__${key}`}
        onClick={() => goTo(j)}
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {columns.map((col) => (
          <td key={col.key} style={{ padding: pad, font: density === 'compact' ? '450 13px/1.4 var(--font)' : '450 13.5px/1.45 var(--font)', color: col.muted ? 'var(--fg-3)' : 'var(--fg-2)', textAlign: col.align || 'left', borderBottom: '1px solid var(--line)', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.render ? col.render(j) : j?.[col.key] ?? <span style={{ color: 'var(--fg-4)' }}>—</span>}
          </td>
        ))}
      </tr>
    ));
    return [header, ...rows];
  });

  return (
    <div>
      <PageHeaderV2
        title="Job Positions"
        sub={`${total} ${total === 1 ? 'position' : 'positions'} total`}
        actions={(
          <>
            <DensityToggle density={density} onChange={setDensity} />
            {isAdmin && (
              <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate(orgPath('/ats/jobs/new'))}>
                New Internal Job
              </Button>
            )}
          </>
        )}
      />

      <FilterBar
        search={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search by position name, department, or client…"
        resultCount={total}
        noun="position"
        onClearAll={hasFilters ? () => setSearchParams(new URLSearchParams()) : undefined}
        filters={[]}
        left={(
          <>
            <SelectChipV2 paramKey="status" label="Status" options={STATUS_OPTIONS} />
            <SelectChipV2 paramKey="department" label="Department" options={departmentOptions} placeholder="No departments" />
            <SelectChipV2 paramKey="clientName" label="Client" options={clientOptions} placeholder="No clients" />
            <SelectChipV2 paramKey="approvalStatus" label="Approval" options={JOB_APPROVAL_OPTIONS} />
            <GroupByChipV2 options={JOB_GROUP_BY_OPTIONS} />
            <MoreFiltersV2 paramKeys={['hiringMode', 'requiredExperience']}>
              <SelectChipV2 paramKey="hiringMode" label="Hiring Mode" options={JOB_HIRING_MODE_OPTIONS} />
              <SelectChipV2 paramKey="requiredExperience" label="Experience" options={JOB_EXPERIENCE_OPTIONS} />
            </MoreFiltersV2>
            <ArchivedToggleV2 activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
          </>
        )}
        style={{ marginBottom: 14 }}
      />

      <DataTable
        columns={columns}
        rows={isGrouped ? [] : jobs}
        rowKey="_id"
        density={density}
        loading={loading}
        sort={dsSort}
        onSortChange={onSortChange}
        onRowClick={goTo}
        empty={(
          <EmptyState
            icon={<Briefcase size={22} />}
            title="No job positions found"
            actions={hasFilters && (
              <Button variant="secondary" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>Clear all filters</Button>
            )}
          >
            {hasFilters
              ? 'Try adjusting your search or filters.'
              : 'Client roles are created by converting a Won CRM opportunity. For internal roles, use the New Internal Job button above.'}
          </EmptyState>
        )}
      >
        {isGrouped && !loading && jobs.length ? renderGroupedRows() : null}
      </DataTable>

      {!isGrouped && total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} noun="position" />
      )}
    </div>
  );
}
