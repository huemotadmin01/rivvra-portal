import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import {
  Building2, Search, ChevronLeft, ChevronRight, Loader2,
  ArrowUpDown, Users
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'none', label: 'No Trial (Grandfathered)' },
  { value: 'trial', label: 'Trial Active' },
  { value: 'grace', label: 'Grace Period' },
  { value: 'archived', label: 'Archived' },
  { value: 'paid', label: 'Paid (Pro/Enterprise)' },
];

function AdminWorkspacesPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');

  const loadWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit: 25, sort, order };
      if (search) params.search = search;
      if (status !== 'all') params.status = status;

      const res = await api.getSuperAdminWorkspaces(params);
      setWorkspaces(res.workspaces || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 0);
    } catch (err) {
      setError(err.message || 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, sort, order]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const toggleSort = (col) => {
    if (sort === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setOrder('desc');
    }
    setPage(1);
  };

  const SortHeader = ({ column, children }) => (
    <button
      onClick={() => toggleSort(column)}
      className="flex items-center gap-1 text-xs font-medium text-dark-400 hover:text-white transition-colors uppercase tracking-wider"
    >
      {children}
      <ArrowUpDown className={`w-3 h-3 ${sort === column ? 'text-amber-400' : ''}`} />
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Workspaces</h1>
        <p className="text-dark-400 mt-1">Manage all customer organizations</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, slug, or domain..."
            className="input-field pl-10 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input-field text-sm w-48"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-sm text-dark-400">
          {total.toLocaleString()} workspace{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-800">
                <th className="px-5 py-3 text-left"><SortHeader column="name">Name</SortHeader></th>
                <th className="px-5 py-3 text-left"><SortHeader column="plan">Plan</SortHeader></th>
                <th className="px-5 py-3 text-left">
                  <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">Status</span>
                </th>
                <th className="px-5 py-3 text-left">
                  <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">Members</span>
                </th>
                <th className="px-5 py-3 text-left">
                  <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">Seats</span>
                </th>
                <th className="px-5 py-3 text-left">
                  <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">Owner</span>
                </th>
                <th className="px-5 py-3 text-left"><SortHeader column="createdAt">Created</SortHeader></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                  </td>
                </tr>
              ) : workspaces.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-dark-400">
                    No workspaces found
                  </td>
                </tr>
              ) : (
                workspaces.map((ws) => (
                  <tr
                    key={ws._id}
                    onClick={() => navigate(`/admin/workspaces/${ws._id}`)}
                    className="border-b border-dark-800/50 hover:bg-dark-800/20 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-dark-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{ws.name}</p>
                          <p className="text-xs text-dark-500">{ws.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <PlanBadge plan={ws.plan} />
                    </td>
                    <td className="px-5 py-3">
                      <TrialStatusBadge status={ws.trial?.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-dark-500" />
                        <span className="text-sm text-dark-300">{ws.memberCount || 0}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-dark-300">
                        {ws.billing?.seatsUsed || 0}/{ws.billing?.seatsTotal || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-dark-400 truncate max-w-[180px] block">
                        {ws.ownerEmail || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-dark-400">
                        {ws.createdAt ? new Date(ws.createdAt).toLocaleDateString() : '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-dark-800">
            <span className="text-sm text-dark-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanBadge({ plan }) {
  const colors = {
    trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    pro: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    enterprise: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors[plan] || colors.trial}`}>
      {(plan || 'trial').toUpperCase()}
    </span>
  );
}

function TrialStatusBadge({ status }) {
  if (!status || status === 'none') {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-dark-700/50 text-dark-400">none</span>;
  }
  const colors = {
    active: 'bg-green-500/10 text-green-400',
    grace: 'bg-amber-500/10 text-amber-400',
    archived: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] || ''}`}>
      {status}
    </span>
  );
}

export default AdminWorkspacesPage;
