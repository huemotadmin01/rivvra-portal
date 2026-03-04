import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Star,
  Building2, Trophy, XCircle, Briefcase, Loader2, ArrowUpDown,
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

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageId, setStageId] = useState('');
  const [isLost, setIsLost] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [stages, setStages] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const params = { page, limit, sortBy, sortDir };
      if (search) params.search = search;
      if (stageId) params.stageId = stageId;
      if (isLost) params.isLost = isLost;
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
  }, [slug, page, limit, search, stageId, isLost, sortBy, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    crmApi.listStages(slug).then(res => {
      if (res.success) setStages(res.stages || []);
    }).catch(() => {});
  }, [slug]);

  const totalPages = Math.ceil(total / limit);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
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

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search opportunities..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-dark-800 border border-dark-700 rounded-lg text-dark-200 focus:border-rivvra-500 focus:outline-none"
          />
        </div>
        <select
          value={stageId} onChange={e => { setStageId(e.target.value); setPage(1); }}
          className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none"
        >
          <option value="">All Stages</option>
          {stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select
          value={isLost} onChange={e => { setIsLost(e.target.value); setPage(1); }}
          className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="false">Active</option>
          <option value="true">Lost</option>
        </select>
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
                  <td className="px-3 py-2.5 text-xs text-dark-300">{opp.expectedRevenue ? `₹${Number(opp.expectedRevenue).toLocaleString('en-IN')}` : '—'}</td>
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
