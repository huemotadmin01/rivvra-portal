import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { downloadFile } from '../../utils/download';
import { formatMoney } from '../../utils/currency';
import FilterBar, { FilterChip, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import {
  ChevronLeft, ChevronRight, Plus, Star,
  Trophy, Loader2, ArrowUpDown, Download, Archive,
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

export default function CrmOpportunities() {
  const { orgSlug: slug } = useOrg();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams(['search', 'stageId', 'salespersonId', 'isLost', 'archived']);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 25;
  const sortBy = searchParams.get('sortBy') || 'updatedAt';
  const sortDir = searchParams.get('sortDir') || 'desc';

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [exporting, setExporting] = useState(false);

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  const fetchData = useCallback(async () => {
    try {
      const params = { page, limit, sortBy, sortDir, ...filterParams };
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
  }, [slug, page, limit, sortBy, sortDir, JSON.stringify(filterParams)]);

  // Load archived count for the segmented Active/Archived chip — same filter
  // shape, just flipped. Refreshes whenever the active list refreshes.
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    crmApi.listOpportunities(slug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then(res => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, JSON.stringify({ ...filterParams, archived: undefined })]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    crmApi.listStages(slug).then(res => {
      if (res.success) setStages(res.stages || []);
    }).catch(() => {});
  }, [slug]);

  const totalPages = Math.ceil(total / limit);

  // Mirrors fetchData's filter chain — keeps export and on-screen list aligned.
  const handleExport = async () => {
    if (!slug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => { if (v) params.set(k, v); });
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
          onClick={() => navigate(`/org/${slug}/crm/pipeline`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <FilterBar searchPlaceholder="Search opportunities…">
            <FilterChip
              type="select"
              paramKey="stageId"
              label="Stage"
              options={stages.map(s => ({ value: s._id, label: s.name }))}
            />
            <FilterChip
              type="select"
              paramKey="isLost"
              label="Status"
              options={[
                { value: 'false', label: 'Active' },
                { value: 'true', label: 'Lost' },
              ]}
            />
            <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
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
              {data.map(opp => (
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
                  <td className="px-3 py-2.5 text-xs text-dark-300">{formatMoney(opp.expectedRevenue, opp.currency)}</td>
                  <td className="px-3 py-2.5"><EvalStars value={opp.evaluation} /></td>
                  <td className="px-3 py-2.5 text-xs text-dark-300">{opp.salespersonName || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-dark-500">{new Date(opp.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-dark-500 text-sm">No opportunities found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-dark-700">
            <span className="text-xs text-dark-500">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded hover:bg-dark-700 disabled:opacity-30 text-dark-400">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-dark-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded hover:bg-dark-700 disabled:opacity-30 text-dark-400">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
