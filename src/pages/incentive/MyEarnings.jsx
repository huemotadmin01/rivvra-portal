// ============================================================================
// MyEarnings.jsx — Member-facing view of their own incentive records
// ============================================================================
// Shows only records where the logged-in employee is the Recruiter or the
// Account Manager. Backend strictly projects fields (no invoice value, no
// consultant salary, no peer's numbers).
//
// This page is read-only. Click-through to RecordDetail is allowed (the
// detail route is also member-accessible and applies the same self-projection
// on the server).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import IncentiveNotificationsBanner from '../../components/incentive/IncentiveNotificationsBanner';
import MonthPicker from '../../components/incentive/MonthPicker';
import {
  Loader2, Award, IndianRupee, Clock, CheckCircle2, XCircle,
  TrendingUp, FileText, Search, ArrowUp, ArrowDown, ArrowUpDown,
  HelpCircle, Hourglass,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatINR(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format an arbitrary currency amount. Falls back to INR formatter for INR
// (cleaner glyph) and a generic ISO-aware formatter otherwise.
function formatCurrency(amount, currency) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—';
  const ccy = String(currency || 'INR').toUpperCase();
  if (ccy === 'INR') return formatINR(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: ccy,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown / malformed code — show the value with a literal suffix so the
    // user still sees something useful.
    return `${ccy} ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
function formatMonth(ym) {
  if (!ym || typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return ym || '—';
  const [y, m] = ym.split('-').map(Number);
  if (m < 1 || m > 12) return ym;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Status styling — single source of truth used by stat cards, chips, pills
// ---------------------------------------------------------------------------

const STATUS_META = {
  draft:          { label: 'Draft',           pill: 'bg-dark-800 text-dark-300 border border-dark-700',    chip: 'bg-dark-850 text-dark-300 border-dark-700',    icon: FileText,      tone: 'text-dark-300' },
  approved:       { label: 'Approved',        pill: 'bg-blue-950 text-blue-300 border border-blue-900/40', chip: 'bg-blue-950/40 text-blue-300 border-blue-900/40', icon: Clock,         tone: 'text-blue-300' },
  partially_paid: { label: 'Partially paid',  pill: 'bg-amber-950 text-amber-300 border border-amber-900/40', chip: 'bg-amber-950/40 text-amber-300 border-amber-900/40', icon: Hourglass,    tone: 'text-amber-300' },
  paid:           { label: 'Paid',            pill: 'bg-emerald-950 text-emerald-300 border border-emerald-900/40', chip: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40', icon: CheckCircle2, tone: 'text-emerald-300' },
  cancelled:      { label: 'Cancelled',       pill: 'bg-red-950 text-red-300 border border-red-900/40',    chip: 'bg-red-950/40 text-red-300 border-red-900/40',    icon: XCircle,       tone: 'text-red-300' },
};

// Order to render the status filter chips (left → right)
const STATUS_ORDER = ['draft', 'approved', 'partially_paid', 'paid', 'cancelled'];

const ROLE_LABEL = {
  recruiter: 'Recruiter',
  account_manager: 'Account Manager',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, icon: Icon, tone, active, onClick, hint }) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={hint || ''}
      className={`text-left bg-dark-900 rounded-xl p-5 border transition-colors ${
        active
          ? 'border-fuchsia-500 ring-1 ring-fuchsia-500/40'
          : 'border-dark-800'
      } ${clickable ? 'hover:border-dark-600 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg bg-dark-850 ${tone}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-dark-500 mt-1">{sub}</p>}
    </button>
  );
}

function SortableTh({ children, align = 'left', sortKey, sortState, onSort }) {
  const isActive = sortState.key === sortKey;
  const dir = isActive ? sortState.dir : null;
  const Icon = !isActive ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-4 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-xs uppercase ${
          isActive ? 'text-white' : 'text-dark-400 hover:text-dark-200'
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
        title={isActive ? `Sorted ${dir === 'asc' ? 'ascending' : 'descending'} — click to flip` : 'Sort'}
      >
        <span>{children}</span>
        <Icon size={11} className="opacity-70" />
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MyEarnings() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  // Server-driven state -----------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});

  // Filters (server-side) ---------------------------------------------------
  const [monthFilter, setMonthFilter] = useState('');

  // Filters (client-side) ---------------------------------------------------
  // Status filter is applied client-side so the chip strip can flip without
  // a network round-trip; we still send it to the server when narrowing
  // wouldn't change item counts (kept simple — chip is a view-mask).
  const [statusFilter, setStatusFilter] = useState(''); // '', 'draft', 'paid', etc.
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, monthFilter]);

  async function load() {
    setLoading(true);
    try {
      const [recRes, sumRes] = await Promise.all([
        incentiveApi.listRecords(orgSlug, {
          scope: 'self',
          payoutMonth: monthFilter || undefined,
        }),
        incentiveApi.getSummary(orgSlug, {
          scope: 'self',
          month: monthFilter || undefined,
        }),
      ]);
      const list = recRes?.records || (Array.isArray(recRes) ? recRes : []);
      setRecords(list);
      setTotal(typeof recRes?.total === 'number' ? recRes.total : list.length);
      setStatusCounts(recRes?.statusCounts || {});
      setSummary(sumRes || null);
    } catch (e) {
      console.error('Failed to load earnings', e);
      showToast(e?.message || 'Failed to load your earnings', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Stats from server-side summary -----------------------------------------
  const stats = useMemo(() => {
    const paid           = summary?.stats?.paid           || { count: 0, amount: 0 };
    const approved       = summary?.stats?.approved       || { count: 0, amount: 0 };
    const draft          = summary?.stats?.draft          || { count: 0, amount: 0 };
    const partially_paid = summary?.stats?.partially_paid || { count: 0, amount: 0 };
    const ytd            = summary?.ytd                   || { count: 0, amount: 0 };
    return { paid, approved, draft, partially_paid, ytd };
  }, [summary]);

  // ------------------------------------------------------------------------
  // Client-side derived list — filter (status + search) + sort
  // ------------------------------------------------------------------------
  const visibleRecords = useMemo(() => {
    let list = records;
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (r.invoiceNumber || '').toLowerCase().includes(q)
        || (r.clientName || '').toLowerCase().includes(q)
        || (r.consultantName || '').toLowerCase().includes(q)
        || (ROLE_LABEL[r.yourRole] || '').toLowerCase().includes(q),
      );
    }
    // Sort — copy first to avoid mutating state
    const sorted = [...list].sort((a, b) => {
      const k = sort.key;
      const dir = sort.dir === 'asc' ? 1 : -1;
      // Numeric / amount field
      if (k === 'yourIncentive') {
        return (Number(a.yourIncentive || 0) - Number(b.yourIncentive || 0)) * dir;
      }
      // String compare for the rest (status + month strings sort
      // chronologically as strings since they're YYYY-MM)
      const av = String(a[k] ?? '');
      const bv = String(b[k] ?? '');
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [records, statusFilter, search, sort]);

  function toggleSort(key) {
    setSort((s) => {
      if (s.key === key) {
        return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      }
      // Default direction: numeric fields desc (highest first), else asc.
      const numeric = key === 'yourIncentive';
      return { key, dir: numeric ? 'desc' : 'asc' };
    });
  }

  function toggleStatus(s) {
    setStatusFilter((cur) => (cur === s ? '' : s));
  }

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
      </div>
    );
  }

  // Some users only fill one role across all their records — derive a more
  // accurate tagline so AM-only or Recruiter-only viewers don't see the
  // other role mentioned in the header.
  const roleSet = new Set(records.map((r) => r.yourRole).filter(Boolean));
  const roleTagline = (() => {
    if (roleSet.size === 0) return 'Your Recruiter / Account Manager incentives';
    if (roleSet.size === 1) {
      const only = [...roleSet][0];
      return `Your ${ROLE_LABEL[only] || 'incentive'} earnings`;
    }
    return 'Your Recruiter & Account Manager incentives';
  })();

  // Cap-aware item label: the list endpoint caps at 50 by default, so when
  // total > records.length we tell the user some rows are off-screen rather
  // than silently truncating to "50 items".
  const visibleCount = visibleRecords.length;
  const isCapped = total > records.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header --------------------------------------------------------- */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Award className="text-fuchsia-400" /> My Earnings
          </h1>
          <p className="text-sm text-dark-400 mt-1">{roleTagline}</p>
        </div>
        <MonthPicker
          value={monthFilter}
          onChange={setMonthFilter}
          placeholder="All months"
        />
      </div>

      <IncentiveNotificationsBanner />

      {/* Stat cards — clickable to filter the records list below ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Paid (YTD)"
          value={formatINR(stats.ytd.amount)}
          sub={`${stats.ytd.count} record${stats.ytd.count === 1 ? '' : 's'} this year`}
          icon={TrendingUp}
          tone="text-emerald-400"
          hint="Total paid from January through now (calendar YTD)."
        />
        <StatCard
          label={monthFilter ? `Paid (${formatMonth(monthFilter)})` : 'Paid (this period)'}
          value={formatINR(stats.paid.amount)}
          sub={`${stats.paid.count} record${stats.paid.count === 1 ? '' : 's'}`}
          icon={CheckCircle2}
          tone="text-emerald-400"
          active={statusFilter === 'paid'}
          onClick={() => toggleStatus('paid')}
          hint="Click to filter the table to paid records only."
        />
        <StatCard
          label="Partially paid"
          value={formatINR(stats.partially_paid.amount)}
          sub={`${stats.partially_paid.count} record${stats.partially_paid.count === 1 ? '' : 's'}`}
          icon={Hourglass}
          tone="text-amber-400"
          active={statusFilter === 'partially_paid'}
          onClick={() => toggleStatus('partially_paid')}
          hint="One party paid, the other still pending."
        />
        <StatCard
          label="Approved (awaiting payslip)"
          value={formatINR(stats.approved.amount)}
          sub={`${stats.approved.count} record${stats.approved.count === 1 ? '' : 's'}`}
          icon={Clock}
          tone="text-blue-400"
          active={statusFilter === 'approved'}
          onClick={() => toggleStatus('approved')}
          hint="Locked in but not yet attached to a payslip."
        />
        <StatCard
          label="In draft"
          value={formatINR(stats.draft.amount)}
          sub={`${stats.draft.count} record${stats.draft.count === 1 ? '' : 's'}`}
          icon={FileText}
          tone="text-dark-300"
          active={statusFilter === 'draft'}
          onClick={() => toggleStatus('draft')}
          hint="Auto-created from paid invoices, awaiting admin approval."
        />
      </div>

      {/* Records section -------------------------------------------------- */}
      <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-dark-800 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            Records
            {monthFilter && (
              <span className="text-xs font-normal text-dark-400">
                · {formatMonth(monthFilter)}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice, client, consultant…"
                className="bg-dark-850 border border-dark-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-dark-600 focus:outline-none focus:border-fuchsia-600 w-64"
              />
            </div>
            <span className="text-xs text-dark-400 whitespace-nowrap" title={isCapped ? `Showing the most recent ${records.length} of ${total} records` : ''}>
              {statusFilter || search
                ? `${visibleCount} of ${records.length} shown`
                : isCapped
                  ? `${records.length} of ${total} shown`
                  : `${visibleCount} item${visibleCount === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>

        {/* Status filter chips */}
        {records.length > 0 && (
          <div className="px-5 py-2.5 border-b border-dark-800 flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter('')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                !statusFilter
                  ? 'bg-fuchsia-600/20 text-white border-fuchsia-500'
                  : 'bg-dark-850 text-dark-300 border-dark-700 hover:border-dark-600'
              }`}
            >
              All <span className="text-dark-500">· {records.length}</span>
            </button>
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const count = statusCounts[s] || 0;
              if (!count) return null;
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? `${meta.chip} border-fuchsia-500 ring-1 ring-fuchsia-500/30`
                      : `${meta.chip} hover:border-dark-600`
                  }`}
                >
                  {meta.label} <span className="opacity-70">· {count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Table or empty state */}
        {records.length === 0 ? (
          <div className="p-10 text-center text-dark-400">
            <IndianRupee className="mx-auto mb-2 opacity-50" size={28} />
            <p className="text-sm font-medium text-dark-300">No incentive records yet.</p>
            <p className="text-xs text-dark-500 mt-1">
              Records auto-appear once an invoice you sourced is paid and the
              admin approves the draft.
            </p>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="p-10 text-center text-dark-400">
            <HelpCircle className="mx-auto mb-2 opacity-50" size={24} />
            <p className="text-sm">No records match the current filter.</p>
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setSearch(''); }}
              className="text-xs text-fuchsia-300 hover:text-fuchsia-200 mt-2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-850 text-dark-400 text-xs uppercase sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Invoice</th>
                  <th className="text-left px-4 py-2 font-medium">Client</th>
                  <th className="text-left px-4 py-2 font-medium">Consultant</th>
                  <SortableTh sortKey="serviceMonth" sortState={sort} onSort={toggleSort}>Service Month</SortableTh>
                  <th className="text-left px-4 py-2 font-medium">Your Role</th>
                  <SortableTh sortKey="yourIncentive" align="right" sortState={sort} onSort={toggleSort}>Your Incentive</SortableTh>
                  <SortableTh sortKey="payoutMonth" sortState={sort} onSort={toggleSort}>Payout Month</SortableTh>
                  <SortableTh sortKey="status" sortState={sort} onSort={toggleSort}>Status</SortableTh>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META.draft;
                  const isCancelled = r.status === 'cancelled';
                  const isForeignCcy = r.currency && r.currency !== 'INR';
                  return (
                    <tr
                      key={r._id}
                      className={`border-t border-dark-800 hover:bg-dark-850 cursor-pointer transition-colors ${
                        isCancelled ? 'opacity-70' : ''
                      }`}
                      onClick={() => navigate(orgPath(`/incentive/records/${r._id}`))}
                    >
                      <td className="px-4 py-3">
                        <span className={r.invoiceNumber ? 'text-white font-medium' : 'text-dark-500 italic'}>
                          {r.invoiceNumber || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white">{r.clientName || '—'}</td>
                      <td className="px-4 py-3 text-dark-300">{r.consultantName || '—'}</td>
                      <td className="px-4 py-3 text-dark-300">{formatMonth(r.serviceMonth)}</td>
                      <td className="px-4 py-3 text-dark-300">
                        {ROLE_LABEL[r.yourRole] || '—'}
                        {r.alsoRole && (
                          <span
                            className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-800 text-dark-300 border border-dark-700"
                            title={`You're also the ${ROLE_LABEL[r.alsoRole] || r.alsoRole} on this record.`}
                          >
                            + {r.alsoRole === 'recruiter' ? 'Recruiter' : 'AM'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-white">
                          {formatCurrency(r.yourIncentive, 'INR')}
                        </div>
                        {r.alsoIncentive ? (
                          <div className="text-[11px] text-dark-500" title="Your second-role incentive on the same record.">
                            + {formatCurrency(r.alsoIncentive, 'INR')}
                          </div>
                        ) : null}
                        {isForeignCcy && (
                          <div className="text-[11px] text-dark-500" title="Invoice was issued in this currency; commission is paid in INR after FX conversion.">
                            inv {r.currency}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dark-300">{formatMonth(r.payoutMonth)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.pill}`}
                          title={r.status}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer hint when the list is server-capped ---------------------- */}
      {isCapped && (
        <p className="text-[11px] text-dark-500 italic">
          Showing the {records.length} most recent records of {total} total. Use
          the month filter above to narrow further.
        </p>
      )}
    </div>
  );
}
