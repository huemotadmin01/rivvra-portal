// ============================================================================
// MyEarningsV2.jsx — Member-facing view of their own incentive records, on ds
// ============================================================================
// Shows only records where the logged-in employee is the Recruiter or the
// Account Manager. Backend strictly projects fields (no invoice value, no
// consultant salary, no peer's numbers).
//
// This page is read-only. Click-through to RecordDetail is allowed (the
// detail route is also member-accessible and applies the same self-projection
// on the server).
//
// Money and the whole derivation chain are spliced in byte-identically:
// `formatINR`, `formatCurrency`, `formatMonth`, the `money()` aggregate wrapper
// that reads the *company* currency (rows read `r.currency` instead), `load`,
// the pagination arithmetic, `stats`, `userStatusOf`, `visibleRecords` (filter
// + sort, including the numeric branch for `yourIncentive`), `userStatusCounts`,
// and both toggles.
//
// The per-party vs record-level distinction is the subtle part and is carried
// through untouched: chips count and filter on `yourStatus`, not `r.status`, so
// a record where my share is cancelled but the AM's is live still appears under
// "Cancelled". Getting that backwards would show a member the wrong money.
//
// Two long-standing comments in the original are preserved verbatim with the
// code they annotate — the `isForeignCcy` caption reading the wrong field, and
// the tooltip that makes a domain claim about paying commission in INR. Both
// were already flagged as needing a product decision, not a drive-by fix.
//
// Not triggered: this page is read-only.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import IncentiveNotificationsBanner from '../../components/incentive/IncentiveNotificationsBanner';
import MonthPicker from '../../components/incentive/MonthPicker';
import {
  Award, IndianRupee, Clock, CheckCircle2, XCircle,
  TrendingUp, FileText, ArrowUp, ArrowDown, ArrowUpDown,
  HelpCircle, Hourglass, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  Panel, Chip, Stat, Button, SearchInput, EmptyState, PageSpinner,
} from '../../components/ds';

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

// Format an arbitrary currency amount. Falls back to the INR formatter for
// INR (cleaner glyph) and a generic ISO-aware formatter otherwise. For INR this
// IS formatINR, so nothing about the existing INR rendering changes.
//
// Two things deliberately left alone, both beyond a currency fix:
//
//  1. The `isForeignCcy` caption below tests `r.currency !== 'INR'` and labels
//     the result "inv {currency}". But rows come from listRecords, where
//     `currency` is the REPORTING currency and `nativeCurrency` is the invoice
//     currency — so the caption is reading the wrong field and never fires
//     (staging: 41 records carry nativeCurrency USD, 0 carry a non-INR
//     `currency`). Pointing it at `nativeCurrency` would newly surface a badge
//     on those rows; that is a visible change to a commission surface and
//     wants a decision, not a drive-by.
//  2. Its tooltip asserts "commission is paid in INR after FX conversion" —
//     a DOMAIN claim. If a non-INR company ever pays commission in its own
//     currency, that copy needs a product decision, not a code change.
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

// Same five states the legacy pill/chip palette carried, as ds Chip tones plus
// the icon and accent each stat card uses.
const STATUS_META = {
  draft:          { label: 'Draft',          tone: 'neutral', icon: FileText,     accent: 'var(--fg-3)' },
  approved:       { label: 'Approved',       tone: 'info',    icon: Clock,        accent: 'var(--info)' },
  partially_paid: { label: 'Partially paid', tone: 'warn',    icon: Hourglass,    accent: 'var(--warn-ink)' },
  paid:           { label: 'Paid',           tone: 'brand',   icon: CheckCircle2, accent: 'var(--brand)' },
  cancelled:      { label: 'Cancelled',      tone: 'danger',  icon: XCircle,      accent: 'var(--danger)' },
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

const thBase = {
  padding: '9px 14px', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 10,
  font: "500 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--fg-4)', background: 'var(--surface-2)',
  boxShadow: 'inset 0 -1px 0 0 var(--line-2)',
};
const td = { padding: '11px 14px', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

function SortableTh({ children, align = 'left', sortKey, sortState, onSort }) {
  const isActive = sortState.key === sortKey;
  const dir = isActive ? sortState.dir : null;
  const Glyph = !isActive ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th style={{ ...thBase, textAlign: align }}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${sortKey}`}
        title={isActive ? `Sorted ${dir === 'asc' ? 'ascending' : 'descending'} — click to flip` : 'Sort'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          flexDirection: align === 'right' ? 'row-reverse' : 'row',
          background: 'none', border: 0, padding: 0, font: 'inherit', letterSpacing: 'inherit',
          textTransform: 'inherit', color: isActive ? 'var(--fg)' : 'var(--fg-4)',
        }}
      >
        <span>{children}</span>
        <Glyph size={11} style={{ opacity: 0.7 }} />
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MyEarningsV2() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  // Aggregates have no per-record currency to read, so they take the active
  // company's — same call as the Incentive dashboards. The per-record rows
  // below use `r.currency` instead, which is the more precise source.
  const money = (amount) => formatCurrency(amount, currentCompany?.currency || 'INR');
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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Filters (client-side) ---------------------------------------------------
  // Status filter is applied client-side so the chip strip can flip without
  // a network round-trip; the chip is effectively a view-mask over the
  // currently-loaded page (status counts in the chip strip come from server).
  const [statusFilter, setStatusFilter] = useState(''); // '', 'draft', 'paid', etc.
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });

  // Reset to page 1 whenever the month filter changes — staying on a now-
  // out-of-range page would just render an empty table.
  useEffect(() => {
    setPage(1);
  }, [monthFilter]);

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, monthFilter, page]);

  async function load() {
    setLoading(true);
    setRecords([]);
    setSummary(null);
    setTotal(0);
    setStatusCounts({});
    try {
      const [recRes, sumRes] = await Promise.all([
        incentiveApi.listRecords(orgSlug, {
          scope: 'self',
          payoutMonth: monthFilter || undefined,
          page,
          limit: PAGE_SIZE,
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

  // Pagination math --------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  // Stats from server-side summary -----------------------------------------
  const stats = useMemo(() => {
    const paid           = summary?.stats?.paid           || { count: 0, amount: 0 };
    const approved       = summary?.stats?.approved       || { count: 0, amount: 0 };
    const draft          = summary?.stats?.draft          || { count: 0, amount: 0 };
    const partially_paid = summary?.stats?.partially_paid || { count: 0, amount: 0 };
    const ytd            = summary?.ytd                   || { count: 0, amount: 0 };
    return { paid, approved, draft, partially_paid, ytd };
  }, [summary]);

  // Helper: the status that matters for *this user* on this record.
  // Falls back to record-level for legacy rows that haven't been backfilled
  // with per-party fields yet.
  const userStatusOf = (r) => r.yourStatus || r.status;

  // ------------------------------------------------------------------------
  // Client-side derived list — filter (status + search) + sort
  // ------------------------------------------------------------------------
  // Filter on `yourStatus` so clicking a chip matches the pill the user
  // actually sees.  E.g. when the user's recruiter share is cancelled but
  // the record-level is still "approved" (other party still active),
  // clicking "Cancelled" must show that row — filtering on r.status would
  // hide it.
  const visibleRecords = useMemo(() => {
    let list = records;
    if (statusFilter) list = list.filter((r) => userStatusOf(r) === statusFilter);
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
      // Status sort — use the user's perspective so the column header
      // sorts what the column actually shows.
      if (k === 'status') {
        const av = userStatusOf(a);
        const bv = userStatusOf(b);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }
      // String compare for the rest (month strings sort chronologically
      // as strings since they're YYYY-MM)
      const av = String(a[k] ?? '');
      const bv = String(b[k] ?? '');
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [records, statusFilter, search, sort]);

  // Per-party chip counts.  The server only knows record-level counts, but
  // for *MyEarnings* the user wants to see "how many of MY shares are
  // cancelled".  Compute these from the currently-loaded page so the count
  // matches exactly what clicking the chip will show.  When pagination is
  // in play this is "counts on this page", which we surface in the toolbar
  // text below.
  const userStatusCounts = useMemo(() => {
    const c = { draft: 0, approved: 0, partially_paid: 0, paid: 0, cancelled: 0 };
    for (const r of records) {
      const s = userStatusOf(r);
      if (s in c) c[s] += 1;
    }
    return c;
  }, [records]);

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

  if (loading) return <PageSpinner label="Loading your earnings…" />;

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

  // Page-aware item label: with server pagination, "X items" reflects only
  // the current page; the chip strip + footer carry the cross-page totals.
  const visibleCount = visibleRecords.length;
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, (page - 1) * PAGE_SIZE + records.length);

  // Highlight ring for the stat card whose status is the active filter.
  const activeStat = { boxShadow: '0 0 0 1px var(--brand), 0 0 0 4px var(--brand-soft)' };


  return (
    <div>
      {/* Header --------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
            <Award size={17} style={{ color: 'var(--brand-ink)' }} /> My Earnings
          </h1>
          <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>{roleTagline}</p>
        </div>
        <MonthPicker value={monthFilter} onChange={setMonthFilter} placeholder="All months" />
      </div>

      <IncentiveNotificationsBanner />

      {/* Stat cards — clickable ones filter the table below --------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, margin: '14px 0' }}>
        <Stat
          label="Paid (YTD)"
          value={money(stats.ytd.amount)}
          note={`${stats.ytd.count} record${stats.ytd.count === 1 ? '' : 's'} this year`}
          icon={<TrendingUp size={14} />}
          color="var(--brand)"
          title="Total paid from January through now (calendar YTD)."
        />
        <Stat
          label={monthFilter ? `Paid (${formatMonth(monthFilter)})` : 'Paid (this period)'}
          value={money(stats.paid.amount)}
          note={`${stats.paid.count} record${stats.paid.count === 1 ? '' : 's'}`}
          icon={<CheckCircle2 size={14} />}
          color="var(--brand)"
          onClick={() => toggleStatus('paid')}
          style={statusFilter === 'paid' ? activeStat : undefined}
          title="Click to filter the table to paid records only."
        />
        <Stat
          label="Partially paid"
          value={money(stats.partially_paid.amount)}
          note={`${stats.partially_paid.count} record${stats.partially_paid.count === 1 ? '' : 's'}`}
          icon={<Hourglass size={14} />}
          color="var(--warn-ink)"
          onClick={() => toggleStatus('partially_paid')}
          style={statusFilter === 'partially_paid' ? activeStat : undefined}
          title="One party paid, the other still pending."
        />
        <Stat
          label="Approved (awaiting payslip)"
          value={money(stats.approved.amount)}
          note={`${stats.approved.count} record${stats.approved.count === 1 ? '' : 's'}`}
          icon={<Clock size={14} />}
          color="var(--info)"
          onClick={() => toggleStatus('approved')}
          style={statusFilter === 'approved' ? activeStat : undefined}
          title="Locked in but not yet attached to a payslip."
        />
        <Stat
          label="In draft"
          value={money(stats.draft.amount)}
          note={`${stats.draft.count} record${stats.draft.count === 1 ? '' : 's'}`}
          icon={<FileText size={14} />}
          color="var(--fg-3)"
          onClick={() => toggleStatus('draft')}
          style={statusFilter === 'draft' ? activeStat : undefined}
          title="Auto-created from paid invoices, awaiting admin approval."
        />
      </div>

      {/* Records --------------------------------------------------------- */}
      <Panel flush>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          padding: '11px 16px', borderBottom: '1px solid var(--line-2)',
        }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
            Records
            {monthFilter && (
              <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                · {formatMonth(monthFilter)}
              </span>
            )}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search invoice, client, consultant…"
              aria-label="Search your records"
              size="sm"
              width={256}
            />
            <span style={{ whiteSpace: 'nowrap', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              {statusFilter || search
                ? `${visibleCount} match${visibleCount === 1 ? '' : 'es'} on this page`
                : total > 0
                  ? `${pageStart}–${pageEnd} of ${total}`
                  : '0 records'}
            </span>
          </div>
        </div>

        {/* Status filter chips — always render all five so members see the
            full lifecycle (Approved/Partially-paid don't disappear at zero) */}
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '9px 16px', borderBottom: '1px solid var(--line-2)' }}>
            <Button
              variant={!statusFilter ? 'primary' : 'secondary'}
              size="sm"
              type="button"
              aria-pressed={!statusFilter}
              onClick={() => setStatusFilter('')}
            >
              All · {total}
            </Button>
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              // Per-party count (computed client-side from `yourStatus`) so
              // the chip's number matches what filtering on it will show.
              // Server-side `statusCounts` is by record-level rollup and is
              // wrong for the user's perspective whenever a record is split
              // (one party cancelled, the other still live).
              const count = userStatusCounts[s] || 0;
              const active = statusFilter === s;
              const empty = count === 0;
              return (
                <Button
                  key={s}
                  variant={active ? 'primary' : 'secondary'}
                  size="sm"
                  type="button"
                  aria-pressed={active}
                  onClick={() => !empty && toggleStatus(s)}
                  disabled={empty}
                  title={empty ? `No ${meta.label.toLowerCase()} records` : `Filter by ${meta.label.toLowerCase()}`}
                >
                  {meta.label} · {count}
                </Button>
              );
            })}
          </div>
        )}

        {/* Table or empty state */}
        {records.length === 0 ? (
          <EmptyState icon={<IndianRupee size={22} />} title="No incentive records yet.">
            Records auto-appear once an invoice you sourced is paid and the
            admin approves the draft.
          </EmptyState>
        ) : visibleRecords.length === 0 ? (
          <EmptyState
            icon={<HelpCircle size={22} />}
            title="No records match the current filter."
            actions={(
              <Button variant="secondary" size="sm" type="button"
                onClick={() => { setStatusFilter(''); setSearch(''); }}>
                Clear filters
              </Button>
            )}
          />
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, textAlign: 'left' }}>Invoice</th>
                  <th style={{ ...thBase, textAlign: 'left' }}>Client</th>
                  <th style={{ ...thBase, textAlign: 'left' }}>Consultant</th>
                  <SortableTh sortKey="serviceMonth" sortState={sort} onSort={toggleSort}>Service Month</SortableTh>
                  <th style={{ ...thBase, textAlign: 'left' }}>Your Role</th>
                  <SortableTh sortKey="yourIncentive" align="right" sortState={sort} onSort={toggleSort}>Your Incentive</SortableTh>
                  <SortableTh sortKey="payoutMonth" sortState={sort} onSort={toggleSort}>Payout Month</SortableTh>
                  <SortableTh sortKey="status" sortState={sort} onSort={toggleSort}>Status</SortableTh>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((r) => {
                  // Show the user's *own* per-party status, not the record-
                  // level rollup. When `yourStatus` isn't set (legacy records
                  // before Phase 2 backfill), fall back to record-level so
                  // pre-existing rows still render a sensible badge.
                  const yourStatus = r.yourStatus || r.status;
                  const meta = STATUS_META[yourStatus] || STATUS_META.draft;
                  // "Cancelled" striping is driven by the user's share, since
                  // a record where I'm cancelled but the AM is approved is,
                  // from my perspective, dead — even though the row carries
                  // record-level status='approved' for the admin's view.
                  const isCancelled = yourStatus === 'cancelled';
                  const isForeignCcy = r.currency && r.currency !== 'INR';
                  return (
                    <tr
                      key={r._id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open record ${r.invoiceNumber || r._id}`}
                      onClick={() => navigate(orgPath(`/incentive/records/${r._id}`))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); navigate(orgPath(`/incentive/records/${r._id}`)); } }}
                      style={{ borderTop: '1px solid var(--line-2)', cursor: 'pointer', opacity: isCancelled ? 0.7 : 1 }}
                    >
                      <td style={td}>
                        <span style={{
                          color: r.invoiceNumber ? 'var(--fg)' : 'var(--fg-4)',
                          fontWeight: r.invoiceNumber ? 500 : 400,
                          fontStyle: r.invoiceNumber ? 'normal' : 'italic',
                        }}>
                          {r.invoiceNumber || '—'}
                        </span>
                      </td>
                      <td style={{ ...td, color: 'var(--fg)' }}>{r.clientName || '—'}</td>
                      <td style={td}>{r.consultantName || '—'}</td>
                      <td style={td}>{formatMonth(r.serviceMonth)}</td>
                      <td style={td}>
                        {ROLE_LABEL[r.yourRole] || '—'}
                        {r.alsoRole && (
                          <span style={{ marginLeft: 6, display: 'inline-flex' }}
                            title={`You're also the ${ROLE_LABEL[r.alsoRole] || r.alsoRole} on this record.`}>
                            <Chip tone="neutral">+ {r.alsoRole === 'recruiter' ? 'Recruiter' : 'AM'}</Chip>
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(r.yourIncentive, r.currency)}
                        </div>
                        {r.alsoIncentive ? (
                          <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}
                            title="Your second-role incentive on the same record.">
                            + {formatCurrency(r.alsoIncentive, r.currency)}
                          </div>
                        ) : null}
                        {isForeignCcy && (
                          <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}
                            title="Invoice was issued in this currency; commission is paid in INR after FX conversion.">
                            inv {r.currency}
                          </div>
                        )}
                      </td>
                      <td style={td}>{formatMonth(r.payoutMonth)}</td>
                      <td style={td}>
                        <span
                          style={{ display: 'inline-flex' }}
                          title={
                            yourStatus !== r.status
                              ? `Your share: ${yourStatus} · Record: ${r.status}`
                              : yourStatus
                          }
                        >
                          <Chip tone={meta.tone}>{meta.label}</Chip>
                        </span>
                        {/* Dual-role rows (user is both recruiter AND AM)
                            need a second pill so they can see if one of their
                            two shares diverged. */}
                        {r.alsoStatus && r.alsoStatus !== yourStatus && (
                          <span style={{ display: 'inline-flex', marginLeft: 4 }}
                            title={`Your ${r.alsoRole === 'recruiter' ? 'Recruiter' : 'AM'} share: ${r.alsoStatus}`}>
                            <Chip tone={(STATUS_META[r.alsoStatus] || STATUS_META.draft).tone}>
                              {(STATUS_META[r.alsoStatus] || STATUS_META.draft).label}
                            </Chip>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer — only shown when more than one server page
            exists AND no client-side filter (status / search) is active.
            With a client-side filter on a single page's worth of records, the
            "Next" button would jump to a different server page where the
            filter would re-apply to a different subset, leaving the user with
            no way to reason about what page-N-of-the-filter would even mean.
            Cleaner: hide pagination while the filter is on so the user
            understands the current view is "filter applied to this page".
            They clear the filter to navigate.  */}
        {totalPages > 1 && !statusFilter && !search && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            padding: '11px 16px', borderTop: '1px solid var(--line-2)',
          }}>
            <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Showing <strong style={{ color: 'var(--fg)' }}>{pageStart}</strong>
              –<strong style={{ color: 'var(--fg)' }}>{pageEnd}</strong>
              {' of '}<strong style={{ color: 'var(--fg)' }}>{total}</strong>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Button variant="secondary" size="sm" type="button" onClick={goPrev} disabled={page <= 1}
                iconLeft={<ChevronLeft size={14} />}>Previous</Button>
              <span style={{ padding: '0 8px', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                Page <strong style={{ color: 'var(--fg)' }}>{page}</strong> of{' '}
                <strong style={{ color: 'var(--fg)' }}>{totalPages}</strong>
              </span>
              <Button variant="secondary" size="sm" type="button" onClick={goNext} disabled={page >= totalPages}
                iconRight={<ChevronRight size={14} />}>Next</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
