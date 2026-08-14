import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { downloadFile } from '../../utils/download';
import { formatMoney } from '../../utils/currency';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { DataTable, FilterBar, Pagination, EmptyState, Button, Chip, GroupedHeader } from '../../components/ds';
import {
  useListParams, usePageParam, useSearchParamValue,
  SelectChipV2, BooleanChipV2, GroupByChipV2, MoreFiltersV2, RangeFilterV2, PageHeaderV2,
} from '../../components/platform/v2/listkit';
import { Plus, Star, Trophy, Loader2, Download, Target } from 'lucide-react';

const REQUIREMENT_TYPE_OPTIONS = [
  { value: 'Staff Augmentation', label: 'Staff Augmentation' },
  { value: 'Project Based', label: 'Project Based' },
  { value: 'Full-time Hire', label: 'Full-time Hire' },
];
const CLIENT_TYPE_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'existing', label: 'Existing' },
];
const EVALUATION_OPTIONS = [
  { value: '1', label: '★☆☆' },
  { value: '2', label: '★★☆' },
  { value: '3', label: '★★★' },
];
const CONVERTED_OPTIONS = [
  { value: 'true', label: 'Converted' },
  { value: 'false', label: 'Not converted' },
];
const GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'stage', label: 'Stage' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'source', label: 'Source' },
  { value: 'requirementType', label: 'Requirement Type' },
  { value: 'closeMonth', label: 'Expected Close Month' },
  { value: 'company', label: 'Client / Company' },
];
const FILTER_PARAM_KEYS = [
  'search', 'stageId', 'salespersonId', 'source', 'requirementType',
  'isLost', 'isConverted', 'evaluation', 'clientType',
  'tagId', 'expectedClosingFrom', 'expectedClosingTo',
  'expectedRevenueFrom', 'expectedRevenueTo', 'mine', 'archived', 'groupBy',
  'status',
];
const MORE_FILTER_KEYS = [
  'tagId', 'clientType', 'evaluation', 'isConverted',
  'expectedClosingFrom', 'expectedClosingTo', 'expectedRevenueFrom', 'expectedRevenueTo',
];

// Same extractor table as legacy — keeps chip options and group keys in sync.
function buildGroupKey(groupBy, opp, stagesById) {
  switch (groupBy) {
    case 'stage': {
      const stage = stagesById.get(opp.stageId);
      const name = stage?.name || opp.stageName || 'Unknown stage';
      return [{ key: opp.stageId || '__none__', label: name }];
    }
    case 'salesperson':
      return [{ key: opp.salespersonId || '__none__', label: opp.salespersonName || 'Unassigned' }];
    case 'source':
      return [{ key: opp.source || '__none__', label: opp.source || 'No source' }];
    case 'requirementType':
      return [{ key: opp.requirementType || '__none__', label: opp.requirementType || 'No requirement type' }];
    case 'closeMonth': {
      if (!opp.expectedClosing) return [{ key: '__none__', label: 'No close date' }];
      const d = new Date(opp.expectedClosing);
      if (Number.isNaN(d.getTime())) return [{ key: '__none__', label: 'No close date' }];
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return [{ key, label }];
    }
    case 'company':
      return [{ key: opp.companyName || '__none__', label: opp.companyName || 'No company' }];
    default:
      return [];
  }
}

function stageChip(opp) {
  if (opp.isLost) return <Chip tone="danger">Lost</Chip>;
  if (opp.wonAt) return <Chip tone="warn">Won</Chip>;
  return <Chip>{opp.stageName}</Chip>;
}

function EvalStars({ value = 0 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3].map(i => (
        <Star key={i} size={11} style={i <= value
          ? { color: 'var(--warn)', fill: 'var(--warn)' }
          : { color: 'var(--fg-faint)' }} />
      ))}
    </span>
  );
}

// 4-segment lifecycle toggle (Open / Won / Lost / Archived) — same URL
// semantics as legacy: open=default, won/lost via status, archived=1.
function LifecycleToggleV2({ lifecycle, counts, onChange }) {
  const segments = [
    { key: 'open', label: 'Open', dot: 'var(--brand)' },
    { key: 'won', label: 'Won', dot: 'var(--warn)' },
    { key: 'lost', label: 'Lost', dot: 'var(--danger)' },
    { key: 'archived', label: 'Archived', dot: 'var(--fg-4)' },
  ];
  const seg = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
    borderRadius: 'var(--r-full, 999px)', font: "500 12px/1 'Inter', system-ui, sans-serif",
    background: on ? 'var(--surface-4)' : 'transparent',
    color: on ? 'var(--fg)' : 'var(--fg-4)', whiteSpace: 'nowrap',
    transition: 'background 120ms var(--e-out), color 120ms var(--e-out)',
  });
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, flexShrink: 0,
      borderRadius: 'var(--r-full, 999px)', background: 'var(--surface-2)',
      boxShadow: 'inset 0 0 0 1px var(--line)',
    }}>
      {segments.map(s => (
        <button key={s.key} type="button" style={seg(lifecycle === s.key)} onClick={() => onChange(s.key)} aria-pressed={lifecycle === s.key}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: s.dot, flexShrink: 0 }} />
          {s.label}
          {counts[s.key] != null && (
            <span style={{ font: '600 10px/1 var(--font)', color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>{counts[s.key]}</span>
          )}
        </button>
      ))}
    </span>
  );
}

/* v2 CRM Opportunities (Slice 3 Wave B) — same data flow, lifecycle
   segments, grouping (with per-group revenue) and export as
   CrmOpportunities.jsx on ds DataTable + listkit. */
export default function CrmOpportunitiesV2() {
  const { orgSlug: slug } = useOrg();
  const { currentCompany } = useCompany();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useListParams(FILTER_PARAM_KEYS);
  const [page, setPage] = usePageParam();
  const [searchValue, setSearchValue] = useSearchParamValue('search');
  const limit = 25;
  const sortBy = searchParams.get('sortBy') || 'updatedAt';
  const sortDir = searchParams.get('sortDir') || 'desc';
  const groupBy = searchParams.get('groupBy') || '';

  const lifecycle = (() => {
    if (filterParams.archived === '1' || filterParams.archived === 'true') return 'archived';
    if (filterParams.status === 'won') return 'won';
    if (filterParams.status === 'lost') return 'lost';
    return 'open';
  })();

  const setLifecycle = (next) => {
    const np = new URLSearchParams(searchParams);
    np.delete('page');
    np.delete('archived');
    np.delete('status');
    np.delete('isLost');
    if (next === 'archived') np.set('archived', '1');
    else if (next === 'won') np.set('status', 'won');
    else if (next === 'lost') np.set('status', 'lost');
    setSearchParams(np);
  };

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ open: null, won: null, lost: null, archived: null });
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [sources, setSources] = useState([]);
  const [tags, setTags] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const effectiveLimit = groupBy ? 200 : limit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let aborted = false;
    try {
      const params = {
        page: groupBy ? 1 : page,
        limit: effectiveLimit,
        sortBy,
        sortDir,
        ...filterParams,
        _requestKey: 'crm:opportunities:list',
      };
      delete params.groupBy;
      if (lifecycle === 'open' && !params.status) params.status = 'active';
      const res = await crmApi.listOpportunities(slug, params);
      if (res.success) {
        setData(res.opportunities || []);
        setTotal(res.total || 0);
      }
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      addToast('Failed to load opportunities', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id, page, effectiveLimit, sortBy, sortDir, groupBy, lifecycle, JSON.stringify(filterParams)]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Per-segment counts — base filters preserved, lifecycle clause varies.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const baseParams = { ...filterParams, limit: 1, page: 1 };
    delete baseParams.groupBy;
    delete baseParams.archived;
    delete baseParams.status;
    delete baseParams.isLost;
    const variants = {
      open: { ...baseParams, status: 'active' },
      won: { ...baseParams, status: 'won' },
      lost: { ...baseParams, status: 'lost' },
      archived: { ...baseParams, archived: '1' },
    };
    Promise.all(
      Object.entries(variants).map(([k, p]) =>
        crmApi.listOpportunities(slug, p)
          .then(res => [k, res?.success ? (res.total || 0) : null])
          .catch(() => [k, null])
      )
    ).then(entries => {
      if (cancelled) return;
      setCounts(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined, status: undefined, isLost: undefined, groupBy: undefined })]);

  const totalPagesForClamp = Math.max(1, Math.ceil(total / limit));
  useEffect(() => {
    if (!loading && total > 0 && page > totalPagesForClamp) setPage(totalPagesForClamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, total, page, totalPagesForClamp]);

  useEffect(() => {
    if (!slug) return;
    crmApi.listStages(slug).then(r => { if (r.success) setStages(r.stages || []); }).catch(() => {});
    crmApi.listSalespersons(slug).then(r => { if (r.success) setSalespersons(r.salespersons || []); }).catch(() => {});
    crmApi.listSources(slug).then(r => { if (r.success) setSources(r.sources || []); }).catch(() => {});
    crmApi.listTags(slug).then(r => { if (r.success) setTags(r.tags || []); }).catch(() => {});
  }, [slug]);

  const stagesById = useMemo(() => {
    const m = new Map();
    for (const s of stages) m.set(String(s._id), s);
    return m;
  }, [stages]);

  const handleExport = async () => {
    if (!slug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => { if (v && k !== 'groupBy') params.set(k, v); });
      if (lifecycle === 'open' && !params.get('status')) params.set('status', 'active');
      const qs = params.toString();
      const today = new Date().toISOString().slice(0, 10);
      await downloadFile(
        `/api/org/${slug}/crm/opportunities/export.csv${qs ? '?' + qs : ''}`,
        `opportunities_${today}.csv`,
      );
    } catch (err) {
      addToast(err?.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // DataTable's 3-state sort mapped onto the legacy sortBy/sortDir params.
  // Legacy never has a "no sort" state (default updatedAt desc), so the
  // null transition restores that default.
  const dsSort = { key: sortBy, dir: sortDir === 'asc' ? 'asc' : 'desc' };
  const onSortChange = (next) => {
    const np = new URLSearchParams(searchParams);
    if (!next) { np.delete('sortBy'); np.delete('sortDir'); }
    else { np.set('sortBy', next.key); np.set('sortDir', next.dir); }
    np.delete('page');
    setSearchParams(np);
  };

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = groupRecords(data, (opp) => buildGroupKey(groupBy, opp, stagesById));
    return sortGroupsByCount(map);
  }, [groupBy, data, stagesById]);

  const hasFilters = Object.values(filterParams).some(Boolean);
  const goTo = (opp) => navigate(`/org/${slug}/crm/opportunities/${opp._id}`);

  const columns = [
    {
      key: 'name', header: 'Opportunity', sortable: true, width: 240,
      render: (opp) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.name}</span>
          {opp.isConverted && <Trophy size={11} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
        </span>
      ),
    },
    {
      key: 'companyName', header: 'Company', sortable: true, width: 180,
      render: (opp) => (opp.contactCompanyId && opp.companyName) ? (
        <Link to={`/org/${slug}/contacts/${opp.contactCompanyId}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>
          {opp.companyName}
        </Link>
      ) : (opp.companyName || null),
    },
    { key: 'stage', header: 'Stage', width: 120, render: (opp) => stageChip(opp) },
    { key: 'expectedRole', header: 'Expected Role', sortable: true, width: 160, render: (opp) => opp.expectedRole ? <span style={{ color: 'var(--brand)' }}>{opp.expectedRole}</span> : null },
    {
      key: 'expectedRevenue', header: 'Revenue', sortable: true, align: 'right', width: 120,
      render: (opp) => Number(opp.expectedRevenue) > 0 ? formatMoney(opp.expectedRevenue, opp.currency) : null,
    },
    { key: 'evaluation', header: 'Rating', sortable: true, width: 80, render: (opp) => <EvalStars value={opp.evaluation} /> },
    {
      key: 'salespersonName', header: 'Salesperson', sortable: true, width: 140,
      render: (opp) => (opp.salespersonId && opp.salespersonName) ? (
        <Link to={`/org/${slug}/employee/${opp.salespersonId}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>
          {opp.salespersonName}
        </Link>
      ) : (opp.salespersonName || null),
    },
    { key: 'updatedAt', header: 'Updated', sortable: true, muted: true, width: 100, render: (opp) => new Date(opp.updatedAt).toLocaleDateString() },
  ];

  const renderGroupedRows = () => (grouped || []).flatMap(([key, group]) => {
    const collapsed = !!collapsedGroups[key];
    const groupRevenue = group.records.reduce((sum, o) => sum + (Number(o.expectedRevenue) || 0), 0);
    const header = (
      <GroupedHeader
        key={`__group__${key}`}
        label={group.label}
        count={group.records.length}
        noun="deal"
        colSpan={columns.length}
        collapsed={collapsed}
        onToggle={() => setCollapsedGroups(s => ({ ...s, [key]: !collapsed }))}
        accent="var(--a-crm, var(--brand))"
        avatarText={groupBy === 'salesperson' || groupBy === 'company' ? undefined : ''}
        sticky
        stickyTop={30}
      >
        {groupRevenue > 0 && <span style={{ color: 'var(--brand)' }}>{formatMoney(groupRevenue, group.records[0]?.currency)}</span>}
      </GroupedHeader>
    );
    const rows = collapsed ? [] : group.records.map((opp) => (
      <tr
        key={`${opp._id}__${key}`}
        onClick={() => goTo(opp)}
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {columns.map((col) => (
          <td key={col.key} style={{ padding: '11px 14px', font: '450 13.5px/1.45 var(--font)', color: 'var(--fg-2)', textAlign: col.align || 'left', borderBottom: '1px solid var(--line)', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.render ? col.render(opp) : opp?.[col.key] ?? <span style={{ color: 'var(--fg-4)' }}>—</span>}
          </td>
        ))}
      </tr>
    ));
    return [header, ...rows];
  });

  return (
    <div>
      <PageHeaderV2
        title="Opportunities"
        sub={`${total} total`}
        actions={(
          <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate(`/org/${slug}/crm/opportunities/new`)}>
            New Opportunity
          </Button>
        )}
      />

      <FilterBar
        search={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search opportunities…"
        resultCount={total}
        noun="deal"
        onClearAll={hasFilters ? () => setSearchParams(new URLSearchParams()) : undefined}
        filters={[]}
        left={(
          <>
            <BooleanChipV2 paramKey="mine" label="My deals" />
            <SelectChipV2 paramKey="salespersonId" label="Salesperson" options={salespersons.map(s => ({ value: s._id, label: s.name || 'Unknown' }))} />
            <SelectChipV2 paramKey="stageId" label="Stage" options={stages.map(s => ({ value: s._id, label: s.name }))} />
            <SelectChipV2 paramKey="source" label="Source" options={sources.map(s => ({ value: s, label: s }))} placeholder="No sources" />
            <SelectChipV2 paramKey="requirementType" label="Requirement" options={REQUIREMENT_TYPE_OPTIONS} />
            <MoreFiltersV2 paramKeys={MORE_FILTER_KEYS}>
              <SelectChipV2 paramKey="tagId" label="Tag" options={tags.map(t => ({ value: t._id, label: t.name }))} placeholder="No tags" />
              <SelectChipV2 paramKey="clientType" label="Client type" options={CLIENT_TYPE_OPTIONS} />
              <SelectChipV2 paramKey="evaluation" label="Rating" options={EVALUATION_OPTIONS} />
              <SelectChipV2 paramKey="isConverted" label="Converted" options={CONVERTED_OPTIONS} />
              <RangeFilterV2 fromKey="expectedClosingFrom" toKey="expectedClosingTo" label="Expected close" type="date" />
              <RangeFilterV2 fromKey="expectedRevenueFrom" toKey="expectedRevenueTo" label="Revenue" type="number" />
            </MoreFiltersV2>
            <LifecycleToggleV2 lifecycle={lifecycle} counts={counts} onChange={setLifecycle} />
            <GroupByChipV2 options={GROUP_BY_OPTIONS} />
          </>
        )}
        style={{ marginBottom: 14 }}
      >
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
      </FilterBar>

      <DataTable
        columns={columns}
        rows={groupBy ? [] : data}
        rowKey="_id"
        loading={loading && data.length === 0}
        sort={dsSort}
        onSortChange={groupBy ? undefined : onSortChange}
        onRowClick={goTo}
        empty={(
          <EmptyState
            icon={<Target size={22} />}
            title="No opportunities found"
            actions={hasFilters && (
              <Button variant="secondary" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>Clear all filters</Button>
            )}
          >
            {hasFilters ? 'Try adjusting your search or filters.' : 'Create your first opportunity to start tracking deals.'}
          </EmptyState>
        )}
      >
        {groupBy && !loading && data.length ? renderGroupedRows() : null}
      </DataTable>

      {groupBy && data.length >= 200 && (
        <p style={{ font: '450 11.5px/1.5 var(--font)', color: 'var(--warn)', margin: '8px 2px' }}>
          Showing the first 200 records grouped — narrow the filters to see the rest.
        </p>
      )}

      {!groupBy && total > 0 && (
        <Pagination page={page} pageSize={limit} total={total} onPageChange={setPage} noun="deal" />
      )}
    </div>
  );
}
