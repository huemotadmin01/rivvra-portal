// ============================================================================
// RecordsList.jsx — Admin-facing list of all incentive records.
// Layout/UX mirrors invoicing/InvoiceList.jsx: status tabs (with counts),
// debounced search, backend-driven pagination, compact table, status pills.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import incentiveApi from '../../utils/incentiveApi';
import MonthPicker from '../../components/incentive/MonthPicker';
import {
  Loader2, Plus, Search, Download, ChevronLeft, ChevronRight, Inbox,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Matches the invoice lifecycle → payment-status split, adapted for the
// incentive record FSM (draft → approved → paid, plus cancelled).
const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_PILL = {
  draft: 'bg-dark-700 text-dark-300',
  approved: 'bg-blue-500/10 text-blue-400',
  paid: 'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-dark-800 text-dark-500 line-through',
};

function StatusPill({ status }) {
  const cls = STATUS_PILL[status] || 'bg-dark-700 text-dark-300';
  const label = status ? status[0].toUpperCase() + status.slice(1) : '—';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RecordsList() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [payoutMonth, setPayoutMonth] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});

  // Debounce search input so we don't blast the server on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchRecords = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await incentiveApi.listRecords(orgSlug, {
        scope: 'admin',
        status: statusFilter || undefined,
        payoutMonth: payoutMonth || undefined,
        search: search || undefined,
        page,
      });
      setRecords(res?.records || []);
      const pageLimit = res?.limit || 50;
      setTotalPages(
        res?.totalPages || Math.max(1, Math.ceil((res?.total || 0) / pageLimit))
      );
      setTotal(res?.total || 0);
      if (res?.statusCounts) setStatusCounts(res.statusCounts);
    } catch (e) {
      console.error('Failed to load records', e);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, statusFilter, payoutMonth, search, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  async function onExport() {
    setExporting(true);
    try {
      await incentiveApi.exportRecordsCsv(orgSlug, {
        scope: 'admin',
        status: statusFilter || undefined,
        payoutMonth: payoutMonth || undefined,
        search: search || undefined,
      });
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  function handleTabChange(key) {
    setStatusFilter(key);
    setPage(1);
  }

  function getTabCount(key) {
    if (!key) {
      const sum = Object.values(statusCounts || {}).reduce(
        (s, c) => s + (Number(c) || 0),
        0
      );
      // When the "All" tab is active the server-side total equals the filtered
      // total; when any other tab is active we fall back to the sum across
      // status buckets (which ignores the status filter by design).
      return sum > 0 ? sum : (statusFilter ? null : total);
    }
    return statusCounts[key] ?? null;
  }

  return (
    <div className="bg-dark-900 min-h-screen">
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Incentive Records</h1>
            <p className="text-xs text-dark-400 mt-0.5">
              All Recruiter / AM commission entries
            </p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <button
              onClick={onExport}
              disabled={exporting}
              className="bg-dark-800 hover:bg-dark-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Export CSV
            </button>
            <button
              onClick={() => navigate(orgPath('/incentive/records/new'))}
              className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus size={14} />
              New Record
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-dark-700 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            const count = getTabCount(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'text-amber-400' : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {count != null && (
                    <span
                      className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-dark-800 text-dark-500'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Search + MonthPicker */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
            />
            <input
              type="text"
              placeholder="Search client, consultant, recruiter, invoice #…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-dark-850 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 focus:ring-1 focus:ring-rivvra-500/30 transition-colors"
            />
          </div>
          <MonthPicker
            value={payoutMonth}
            onChange={(v) => {
              setPayoutMonth(v);
              setPage(1);
            }}
            placeholder="Any payout month"
          />
        </div>

        {/* Table */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-dark-400 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-dark-500">
              <Inbox size={36} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No records found</p>
              <p className="text-xs mt-1 opacity-60">
                {search || statusFilter || payoutMonth
                  ? 'Try adjusting your filters or search term'
                  : 'Create your first incentive record to get started'}
              </p>
              {!search && !statusFilter && !payoutMonth && (
                <button
                  onClick={() => navigate(orgPath('/incentive/records/new'))}
                  className="mt-4 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Plus size={14} />
                  New Record
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Invoice</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Client</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Consultant</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Recruiter</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">AM</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Net Profit</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Incentive</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Payout</th>
                    <th className="text-center py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r._id}
                      onClick={() => navigate(orgPath(`/incentive/records/${r._id}`))}
                      className="border-b border-dark-700/50 last:border-0 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className={`font-medium ${r.invoiceNumber ? 'text-white' : 'text-dark-500 italic'}`}>
                          {r.invoiceNumber || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-dark-300">{r.clientName || '—'}</td>
                      <td className="py-3 px-4 text-dark-300">{r.consultantName || '—'}</td>
                      <td className="py-3 px-4 text-dark-300">{r.recruiterName || '—'}</td>
                      <td className="py-3 px-4 text-dark-300">{r.accountManagerName || '—'}</td>
                      <td className="py-3 px-4 text-right text-dark-300">{formatINR(r.netProfit)}</td>
                      <td className="py-3 px-4 text-right font-medium text-white">
                        {formatINR((r.recruiterIncentive || 0) + (r.accountManagerIncentive || 0))}
                      </td>
                      <td className="py-3 px-4 text-dark-400">{r.payoutMonth || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && records.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700 bg-dark-800/50">
              <span className="text-xs text-dark-400">
                Page {page} of {totalPages} ({total} record{total !== 1 ? 's' : ''})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
