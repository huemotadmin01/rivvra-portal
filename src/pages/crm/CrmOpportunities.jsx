import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { downloadFile } from '../../utils/download';
import { formatMoney } from '../../utils/currency';
import FilterBar, {
  FilterChip, ArchivedToggle, MoreFiltersPopover, GroupByChip, useFilterParams,
} from '../../components/shared/FilterBar';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import {
  ChevronLeft, ChevronRight, Plus, Star,
  Trophy, Loader2, ArrowUpDown, Download, ChevronDown,
} from 'lucide-react';

function StageBadge({ name, isWon, isLost }) {
  if (isLost) return <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/15 text-red-400 border border-red-500/20">Lost</span>;
  if (isWon) return <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Won</span>;
  return <span className="px-2 py-0.5 text-[10px] rounded-full bg-dark-700 text-dark-300 border border-dark-600">{name}</span>;
}

function EvalStars({ value = 0 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <Star key={i} size={11} className={i <= value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'} />
      ))}
    </div>
  );
}

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
const STATUS_OPTIONS = [
  { value: 'false', label: 'Active' },
  { value: 'true', label: 'Lost' },
];
const CONVERTED_OPTIONS = [
  { value: 'true', label: 'Converted' },
  { value: 'false', label: 'Not converted' },
];

// Group-By dimension extractors. Keep these in one place so the Group-By
// chip options + the per-record key extractor stay in sync.
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
];

const MORE_FILTER_KEYS = [
  'tagId', 'clientType', 'evaluation', 'isConverted',
  'expectedClosingFrom', 'expectedClosingTo', 'expectedRevenueFrom', 'expectedRevenueTo',
];

export default function CrmOpportunities() {
  const { orgSlug: slug } = useOrg();
  const { currentCompany } = useCompany();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams(FILTER_PARAM_KEYS);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 25;
  const sortBy = searchParams.get('sortBy') || 'updatedAt';
  const sortDir = searchParams.get('sortDir') || 'desc';
  const groupBy = searchParams.get('groupBy') || '';

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [sources, setSources] = useState([]);
  const [tags, setTags] = useState([]);
  const [exporting, setExporting] = useState(false);
  // Per-group collapse state — keyed by group key, default expanded.
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // 2026-05-14: when groupBy is active we pull the full filtered set in
  // one shot (cap 200) so groups aren't split across pages. The flat
  // view still paginates normally; this is the same tradeoff the ATS
  // list pages made for grouped renders.
  const effectiveLimit = groupBy ? 200 : limit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: groupBy ? 1 : page,
        limit: effectiveLimit,
        sortBy,
        sortDir,
        ...filterParams,
      };
      // groupBy is a view-mode control, not an API filter.
      delete params.groupBy;
      const res = await crmApi.listOpportunities(slug, params);
      if (res.success) {
        setData(res.opportunities || []);
        setTotal(res.total || 0);
      }
    } catch {
      addToast('Failed to load opportunities', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id, page, effectiveLimit, sortBy, sortDir, groupBy, JSON.stringify(filterParams)]);

  // Load archived count for the segmented Active/Archived chip — same filter
  // shape, just flipped. Refreshes whenever the active list refreshes.
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    const archivedParams = { ...filterParams, archived: '1', limit: 1, page: 1 };
    delete archivedParams.groupBy;
    crmApi.listOpportunities(slug, archivedParams)
      .then(res => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, JSON.stringify({ ...filterParams, archived: undefined, groupBy: undefined })]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Picklist loads — fired once per org (the chip option lists rarely change).
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

  const totalPages = Math.ceil(total / limit);

  // Mirrors fetchData's filter chain — keeps export and on-screen list aligned.
  const handleExport = async () => {
    if (!slug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => { if (v && k !== 'groupBy') params.set(k, v); });
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

  const handleSort = (field) => {
    const np = new URLSearchParams(searchParams);
    if (sortBy === field) {
      np.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      np.set('sortBy', field);
      np.set('sortDir', 'desc');
    }
    setSearchParams(np);
  };

  const SortHeader = ({ field, children }) => (
    <th
      className="text-left px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase tracking-wider cursor-pointer hover:text-dark-200 select-none"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortBy === field && <ArrowUpDown size={10} className="text-rivvra-400" />}
      </span>
    </th>
  );

  // Group the visible records when groupBy is active. Sort by count desc;
  // Unknown buckets always last.
  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = groupRecords(data, (opp) => buildGroupKey(groupBy, opp, stagesById));
    return sortGroupsByCount(map);
  }, [groupBy, data, stagesById]);

  const renderRow = (opp) => (
    <tr
      key={opp._id}
      onClick={() => navigate(`/org/${slug}/crm/opportunities/${opp._id}`)}
      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-100 font-medium">{opp.name}</span>
          {opp.isConverted && <Trophy size={11} className="text-amber-400" />}
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-dark-300">{opp.companyName || '—'}</td>
      <td className="px-3 py-2.5">
        <StageBadge name={opp.stageName} isWon={!!opp.wonAt && !opp.isLost} isLost={opp.isLost} />
      </td>
      <td className="px-3 py-2.5 text-xs text-emerald-400">{opp.expectedRole || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-dark-300">{Number(opp.expectedRevenue) > 0 ? formatMoney(opp.expectedRevenue, opp.currency) : '—'}</td>
      <td className="px-3 py-2.5"><EvalStars value={opp.evaluation} /></td>
      <td className="px-3 py-2.5 text-xs text-dark-300">{opp.salespersonName || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-dark-500">{new Date(opp.updatedAt).toLocaleDateString()}</td>
    </tr>
  );

  if (!slug || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-dark-100">Opportunities</h1>
          <span className="text-xs text-dark-500">{total} total</span>
        </div>
        <button
          onClick={() => navigate(`/org/${slug}/crm/opportunities/new`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600"
        >
          <Plus size={14} /> New Opportunity
        </button>
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <FilterBar searchPlaceholder="Search opportunities…">
            <FilterChip type="boolean" paramKey="mine" label="My deals" />
            <FilterChip
              type="select"
              paramKey="salespersonId"
              label="Salesperson"
              options={salespersons.map(s => ({ value: s._id, label: s.name || 'Unknown' }))}
            />
            <FilterChip
              type="select"
              paramKey="stageId"
              label="Stage"
              options={stages.map(s => ({ value: s._id, label: s.name }))}
            />
            <FilterChip
              type="select"
              paramKey="source"
              label="Source"
              options={sources.map(s => ({ value: s, label: s }))}
            />
            <FilterChip
              type="select"
              paramKey="requirementType"
              label="Requirement"
              options={REQUIREMENT_TYPE_OPTIONS}
            />
            <FilterChip
              type="select"
              paramKey="isLost"
              label="Status"
              options={STATUS_OPTIONS}
            />
            <MoreFiltersPopover paramKeys={MORE_FILTER_KEYS}>
              <FilterChip
                type="select"
                paramKey="tagId"
                label="Tag"
                options={tags.map(t => ({ value: t._id, label: t.name }))}
              />
              <FilterChip
                type="select"
                paramKey="clientType"
                label="Client type"
                options={CLIENT_TYPE_OPTIONS}
              />
              <FilterChip
                type="select"
                paramKey="evaluation"
                label="Rating"
                options={EVALUATION_OPTIONS}
              />
              <FilterChip
                type="select"
                paramKey="isConverted"
                label="Converted"
                options={CONVERTED_OPTIONS}
              />
              <DateRangeFilter
                fromKey="expectedClosingFrom"
                toKey="expectedClosingTo"
                label="Expected close"
              />
              <NumberRangeFilter
                fromKey="expectedRevenueFrom"
                toKey="expectedRevenueTo"
                label="Revenue"
              />
              {/* 2026-05-14: Medium / Campaign chips removed — there's
                  no picklist source for either field yet, so they
                  rendered as permanently empty selects. Will return as
                  real chips once we capture marketing attribution. */}
            </MoreFiltersPopover>
            <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
            <GroupByChip options={GROUP_BY_OPTIONS} />
          </FilterBar>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || total === 0}
          title="Download the current filtered list as a CSV file"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-800 border border-dark-700 rounded-lg text-dark-200 hover:bg-dark-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700 bg-dark-800/50">
                <SortHeader field="name">Opportunity</SortHeader>
                <SortHeader field="companyName">Company</SortHeader>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase tracking-wider">Stage</th>
                <SortHeader field="expectedRole">Expected Role</SortHeader>
                <SortHeader field="expectedRevenue">Revenue</SortHeader>
                <SortHeader field="evaluation">Rating</SortHeader>
                <SortHeader field="salespersonName">Salesperson</SortHeader>
                <SortHeader field="updatedAt">Updated</SortHeader>
              </tr>
            </thead>
            <tbody>
              {!grouped && data.map(renderRow)}
              {grouped && grouped.map(([key, group]) => {
                const collapsed = !!collapsedGroups[key];
                const groupRevenue = group.records.reduce((sum, o) => sum + (Number(o.expectedRevenue) || 0), 0);
                return (
                  <GroupSection
                    key={key}
                    groupKey={key}
                    label={group.label}
                    count={group.records.length}
                    revenue={groupRevenue}
                    currency={group.records[0]?.currency}
                    collapsed={collapsed}
                    onToggle={() => setCollapsedGroups(s => ({ ...s, [key]: !collapsed }))}
                    rows={collapsed ? null : group.records.map(renderRow)}
                  />
                );
              })}
              {data.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-dark-500 text-sm">No opportunities found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — hidden when grouped (we pull the full set) */}
        {!groupBy && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-dark-700">
            <span className="text-xs text-dark-500">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="p-1 rounded hover:bg-dark-700 disabled:opacity-30 text-dark-400">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-dark-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="p-1 rounded hover:bg-dark-700 disabled:opacity-30 text-dark-400">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        {groupBy && data.length >= 200 && (
          <div className="px-4 py-2 border-t border-dark-700 text-[11px] text-amber-300/80">
            Showing the first 200 records grouped — narrow the filters to see the rest.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Group section row (collapsible header + nested rows) ────────────────
function GroupSection({ groupKey: _gk, label, count, revenue, currency, collapsed, onToggle, rows }) {
  return (
    <>
      <tr className="bg-dark-800/40 border-b border-dark-700">
        <td colSpan={8} className="px-3 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2">
              <ChevronDown
                size={12}
                className={`text-dark-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
              />
              <span className="text-xs font-semibold text-dark-100 uppercase tracking-wider">{label}</span>
              <span className="text-[10px] text-dark-500">{count}</span>
            </span>
            {revenue > 0 && (
              <span className="text-[11px] text-emerald-400">{formatMoney(revenue, currency)}</span>
            )}
          </button>
        </td>
      </tr>
      {rows}
    </>
  );
}

// ─── Range filter primitives (date + number) for the More-filters popover.
// Local controls because FilterChip only supports single-value selects.
// ───────────────────────────────────────────────────────────────────────
function DateRangeFilter({ fromKey, toKey, label }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get(fromKey) || '';
  const to = searchParams.get(toKey) || '';
  const set = (key, value) => {
    const np = new URLSearchParams(searchParams);
    if (value) np.set(key, value); else np.delete(key);
    np.delete('page');
    setSearchParams(np);
  };
  return (
    <div>
      <div className="text-[11px] text-dark-400 mb-1">{label}</div>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={from}
          onChange={(e) => set(fromKey, e.target.value)}
          className="flex-1 min-w-0 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
        />
        <span className="text-[10px] text-dark-500">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => set(toKey, e.target.value)}
          className="flex-1 min-w-0 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

function NumberRangeFilter({ fromKey, toKey, label }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get(fromKey) || '';
  const to = searchParams.get(toKey) || '';
  const set = (key, value) => {
    const np = new URLSearchParams(searchParams);
    if (value) np.set(key, value); else np.delete(key);
    np.delete('page');
    setSearchParams(np);
  };
  return (
    <div>
      <div className="text-[11px] text-dark-400 mb-1">{label}</div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          placeholder="Min"
          value={from}
          onChange={(e) => set(fromKey, e.target.value)}
          className="flex-1 min-w-0 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
        />
        <span className="text-[10px] text-dark-500">to</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Max"
          value={to}
          onChange={(e) => set(toKey, e.target.value)}
          className="flex-1 min-w-0 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
