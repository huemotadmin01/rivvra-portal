import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import expensesApi from '../../utils/expensesApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  Plus, Search, Loader2, FileText, Receipt, CheckCircle2, XCircle,
  Clock, RefreshCw, Eye, Wallet, AlertCircle,
} from 'lucide-react';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'synced', label: 'Synced' },
  { key: 'reimbursed', label: 'Reimbursed' },
  { key: 'rejected', label: 'Rejected' },
];

function StatusBadge({ status }) {
  const map = {
    draft:     { bg: 'bg-dark-700',       text: 'text-dark-300',     dot: 'bg-dark-400',    label: 'Draft' },
    submitted: { bg: 'bg-amber-500/10',   text: 'text-amber-400',    dot: 'bg-amber-500',   label: 'Pending' },
    approved:  { bg: 'bg-blue-500/10',    text: 'text-blue-400',     dot: 'bg-blue-500',    label: 'Approved' },
    synced:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400',  dot: 'bg-emerald-500', label: 'Synced' },
    reimbursed:{ bg: 'bg-violet-500/10',  text: 'text-violet-400',   dot: 'bg-violet-500',  label: 'Reimbursed' },
    rejected:  { bg: 'bg-red-500/10',     text: 'text-red-400',      dot: 'bg-red-500',     label: 'Rejected' },
  };
  const s = map[status] || map.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SummaryCard({ icon: Icon, label, value, sub, accent = 'rivvra' }) {
  const accents = {
    rivvra:  'text-rivvra-400',
    amber:   'text-amber-400',
    blue:    'text-blue-400',
    emerald: 'text-emerald-400',
    red:     'text-red-400',
  };
  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-dark-400 uppercase tracking-wide">{label}</span>
        <Icon size={16} className={accents[accent] || accents.rivvra} />
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="text-xs text-dark-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function ExpenseList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole, orgRole } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  const expensesAppRole = getAppRole('expenses');
  const isTeamLead = expensesAppRole === 'team_lead';
  const isManager = isOrgAdmin || expensesAppRole === 'admin' || isTeamLead;
  const companyCurrency = (currentCompany?.currency || 'INR').toUpperCase();

  // Scope is derived from the URL path. The sidebar exposes one entry per scope,
  // so the URL is the source of truth — never localStorage.
  const requestedScope = useMemo(() => {
    if (location.pathname.endsWith('/expenses/all')) return 'all';
    if (location.pathname.endsWith('/expenses/team')) return 'team';
    return 'mine';
  }, [location.pathname]);

  // Guard: redirect users who hit a route their role can't use.
  useEffect(() => {
    if (requestedScope === 'all' && !isOrgAdmin && expensesAppRole !== 'admin') {
      navigate(orgPath('/expenses'), { replace: true });
    } else if (requestedScope === 'team' && !isManager) {
      navigate(orgPath('/expenses'), { replace: true });
    }
  }, [requestedScope, isOrgAdmin, expensesAppRole, isManager, navigate, orgPath]);

  const scope = requestedScope;
  const [statusTab, setStatusTab] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setRefreshing(true);
      setRows([]);
      setSummary(null);
      const params = { scope };
      if (statusTab) params.status = statusTab;
      if (search.trim()) params.q = search.trim();
      const [listRes, dashRes] = await Promise.all([
        expensesApi.list(orgSlug, params),
        expensesApi.getDashboard(orgSlug, { scope }),
      ]);
      setRows(listRes?.expenses || []);
      setSummary(dashRes?.summary || null);
    } catch (err) {
      showToast(err.message || 'Failed to load expenses', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, scope, statusTab, search, showToast, currentCompany?._id]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => rows, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <div className="bg-dark-850 border-b border-dark-700 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Wallet size={20} className="text-rivvra-400" />
              {scope === 'all' ? 'All Expenses' : scope === 'team' ? 'Team Expenses' : 'My Expenses'}
            </h1>
            <p className="text-sm text-dark-400 mt-0.5">
              {scope === 'all'
                ? 'Every expense claim in this company'
                : scope === 'team'
                ? 'Claims submitted by your direct reports'
                : 'Your expense claims'}
              {currentCompany && <span> · {currentCompany.name}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm text-dark-200 transition-colors disabled:opacity-60"
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => navigate(orgPath('/expenses/new'))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              New Expense
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              icon={Receipt}
              label="This Month"
              value={formatCurrency(summary.monthTotal || 0, companyCurrency)}
              sub={`${summary.monthCount || 0} ${summary.monthCount === 1 ? 'claim' : 'claims'}`}
              accent="rivvra"
            />
            <SummaryCard
              icon={Clock}
              label="Pending"
              value={summary.pending || 0}
              sub="Awaiting approval"
              accent="amber"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Approved / Synced"
              value={(summary.approved || 0) + (summary.synced || 0) + (summary.reimbursed || 0)}
              sub={`${(summary.synced || 0) + (summary.reimbursed || 0)} synced to bills`}
              accent="emerald"
            />
            <SummaryCard
              icon={XCircle}
              label="Rejected"
              value={summary.rejected || 0}
              sub="Returned to submitter"
              accent="red"
            />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex flex-wrap gap-1 bg-dark-850 border border-dark-700 rounded-lg p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key || 'all'}
                onClick={() => setStatusTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusTab === t.key
                    ? 'bg-rivvra-500 text-white'
                    : 'text-dark-300 hover:text-white hover:bg-dark-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, description, or merchant..."
              className="w-full pl-9 pr-3 py-2 bg-dark-850 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500 focus:border-rivvra-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          {filteredRows.length === 0 ? (
            <div className="text-center py-16">
              <FileText size={32} className="text-dark-600 mx-auto mb-3" />
              <p className="text-dark-400 text-sm">No expenses found</p>
              <button
                onClick={() => navigate(orgPath('/expenses/new'))}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-xs font-medium"
              >
                <Plus size={12} />
                Submit your first claim
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-dark-800 text-dark-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Submitted</th>
                    {scope === 'all' && <th className="text-left px-4 py-3 font-medium">Employee</th>}
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-right px-4 py-3 font-medium">Lines</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    {scope === 'all' && <th className="text-left px-4 py-3 font-medium">Approver</th>}
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Bill</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {filteredRows.map((r) => {
                    const lineCount = (r.lines || []).length;
                    return (
                      <tr
                        key={r._id}
                        className="hover:bg-dark-800/40 cursor-pointer transition-colors"
                        onClick={() => navigate(orgPath(`/expenses/${r._id}`))}
                      >
                        <td className="px-4 py-3 text-dark-200 whitespace-nowrap">
                          {formatDate(r.submittedAt || r.createdAt)}
                        </td>
                        {scope === 'all' && (
                          <td className="px-4 py-3 text-dark-200">
                            <div className="text-white">{r.submittedByName || '-'}</div>
                            {r.submittedByEmail && <div className="text-[11px] text-dark-500">{r.submittedByEmail}</div>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-dark-200 max-w-md">
                          <div className="text-white truncate">{r.title || <span className="text-dark-500 italic">Untitled</span>}</div>
                          {lineCount > 0 && r.lines?.[0]?.description && (
                            <div className="text-[11px] text-dark-500 truncate">{r.lines[0].description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-dark-200 whitespace-nowrap">
                          {lineCount}
                        </td>
                        <td className="px-4 py-3 text-right text-white font-medium whitespace-nowrap">
                          {formatCurrency(r.totalAmount || 0, r.claimCurrency || 'INR')}
                        </td>
                        {scope === 'all' && (
                          <td className="px-4 py-3 text-dark-200">
                            {r.approverName ? (
                              <div className="text-xs">{r.approverName}</div>
                            ) : (
                              <span className="text-[11px] text-dark-500 italic">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3">
                          {r.billId ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <CheckCircle2 size={12} />
                              {r.billNumber || 'Created'}
                            </span>
                          ) : r.status === 'rejected' ? (
                            <span className="text-[11px] text-dark-500">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-dark-500">
                              <AlertCircle size={12} />
                              Not yet
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(orgPath(`/expenses/${r._id}`)); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-dark-400 hover:text-white text-xs"
                            title="View"
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
