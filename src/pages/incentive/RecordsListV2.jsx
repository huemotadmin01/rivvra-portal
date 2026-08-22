// ============================================================================
// RecordsListV2.jsx — Admin-facing list of all incentive records, on ds.
// ============================================================================
//
// A commission list, so the money is spliced in byte-identically and so is the
// one piece of arithmetic that lives in the render:
//
//     formatAmount((r.recruiterIncentive || 0) + (r.accountManagerIncentive || 0), r.currency)
//
// That sum is the "Incentive (R+AM)" column. Splicing everything above
// `return (` would have missed it — this is exactly the case that rule exists
// for. `formatAmount` itself, `StatusCell`'s four-branch divergence rule, the
// debounce, `fetchRecords`, `onExport`, and `getTabCount` (including its
// `reduce` over the status buckets) are all carried across unchanged.
//
// The status *tones* are re-expressed as ds Chip tones — same five states, same
// meanings: draft neutral, approved info, partially paid warn, paid brand,
// cancelled neutral-with-strikethrough.
//
// `MonthPicker` stays as it is: a shared filter widget, not a styling primitive.
//
// Not triggered: CSV export.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { currencySymbol } from '../../utils/formatCurrency';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import MonthPicker from '../../components/incentive/MonthPicker';
import { Loader2, Download, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, SearchInput, EmptyState, PageSpinner,
} from '../../components/ds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Each row carries its own `currency` (the reporting currency the incentive
// was computed in). Reading it is what utils/formatCurrency's header means by
// "pass the record's own currency field" — the previous local formatINR
// hard-coded INR, so a non-INR record printed a ₹ glyph over a foreign figure.
//
// The ROUNDING is deliberately unchanged from that formatINR: whole units, no
// paise. This dense list has never shown paise and the shared formatCurrency /
// formatMoney helpers both would — switching precision on a commission surface
// is a product decision, not part of fixing the currency. Only the symbol and
// grouping locale are now derived from the record.
function formatAmount(amount, ccy) {
  const cur = String(ccy || 'INR').toUpperCase();
  if (amount == null) return `${currencySymbol(cur)}0`;
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Unknown/garbage ISO code — Intl throws rather than degrading.
    return `${cur} ${Math.round(Number(amount) || 0)}`;
  }
}
// Matches the invoice lifecycle → payment-status split, adapted for the
// incentive record FSM (draft → approved → paid, plus cancelled).
const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'approved', label: 'Approved' },
  // Phase 2: a record is `partially_paid` when one party has been paid and
  // the other is still live (e.g. recruiter=paid + AM=approved).  Without
  // this tab those records were only visible under "All" — admins had no way
  // to triage them.
  { key: 'partially_paid', label: 'Partially paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
];
const SHORT_STATUS = {
  draft: 'Draft',
  approved: 'Approved',
  partially_paid: 'Partial',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Same five states the legacy pill palette carried, mapped to ds Chip tones.
const STATUS_TONE = {
  draft: 'neutral',
  approved: 'info',
  partially_paid: 'warn',
  paid: 'brand',
  cancelled: 'neutral',
};

function StatusPill({ status }) {
  const label = SHORT_STATUS[status] || (status ? status[0].toUpperCase() + status.slice(1) : '—');
  return (
    <Chip
      tone={STATUS_TONE[status] || 'neutral'}
      style={status === 'cancelled' ? { textDecoration: 'line-through' } : undefined}
    >
      {label}
    </Chip>
  );
}

// When recruiterStatus and accountManagerStatus diverge (e.g. one cancelled,
// one approved), the record-level rollup hides the split. Render two compact
// per-party pills so admins can see at a glance which side is off-track.
// Falls back to the single record-level pill when (a) only one party is
// assigned, or (b) both parties share the same status (the common case).
function StatusCell({ record }) {
  const r = record.recruiterStatus;
  const a = record.accountManagerStatus;
  const hasR = r && r !== 'n/a';
  const hasA = a && a !== 'n/a';
  // No per-party fields yet (legacy) → just the record-level pill.
  if (!hasR && !hasA) return <StatusPill status={record.status} />;
  // Both present and matching → record-level pill is sufficient.
  if (hasR && hasA && r === a) return <StatusPill status={record.status} />;
  // Only one party present → record-level rollup already mirrors it.
  if (hasR !== hasA) return <StatusPill status={record.status} />;
  // True split — show both pills inline so the divergence is visible.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Chip tone={STATUS_TONE[r] || 'neutral'} title={`Recruiter: ${r}`}>
        R: {SHORT_STATUS[r] || r}
      </Chip>
      <Chip tone={STATUS_TONE[a] || 'neutral'} title={`Account Manager: ${a}`}>
        AM: {SHORT_STATUS[a] || a}
      </Chip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RecordsListV2() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
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
    setRecords([]);
    setTotal(0);
    setTotalPages(1);
    setStatusCounts({});
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
      showToast(e?.message || 'Failed to load records', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, statusFilter, payoutMonth, search, page, showToast, currentCompany?._id]);

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
      showToast('Export downloaded', 'success');
    } catch (e) {
      console.error('Export failed', e);
      showToast(e?.message || 'Export failed. Please try again.', 'error');
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

  const th = {
    padding: '10px 14px', whiteSpace: 'nowrap',
    font: "500 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em',
    textTransform: 'uppercase', color: 'var(--fg-4)', background: 'var(--surface-2)',
  };
  const td = { padding: '11px 14px', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Incentive Records"
        sub="All Recruiter / AM commission entries"
        actions={(
          <Button variant="secondary" size="sm" onClick={onExport} disabled={exporting}
            iconLeft={exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
            Export CSV
          </Button>
        )}
      />

      {/* Status tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--line-2)', overflowX: 'auto', marginBottom: 14 }}>
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.key;
          const count = getTabCount(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                padding: '9px 14px', marginBottom: -1, cursor: 'pointer',
                background: 'none', border: 0,
                borderBottom: `2px solid ${isActive ? 'var(--brand)' : 'transparent'}`,
                font: "500 12.5px/1.3 'Inter', system-ui, sans-serif",
                color: isActive ? 'var(--fg)' : 'var(--fg-4)',
              }}
            >
              {tab.label}
              {count != null && <Chip tone={isActive ? 'brand' : 'neutral'}>{count}</Chip>}
            </button>
          );
        })}
      </div>

      {/* Search + month */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search client, consultant, recruiter, invoice #…"
            aria-label="Search records"
            width="100%"
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
      <Panel flush>
        {loading ? (
          <PageSpinner label="Loading records…" />
        ) : records.length === 0 ? (
          <EmptyState icon={<Inbox size={22} />} title="No records found">
            {search || statusFilter || payoutMonth
              ? 'Try adjusting your filters or search term'
              : 'Records are auto-created when invoices are marked paid.'}
          </EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Invoice</th>
                  <th style={{ ...th, textAlign: 'left' }}>Client</th>
                  <th style={{ ...th, textAlign: 'left' }}>Consultant</th>
                  <th style={{ ...th, textAlign: 'left' }}>Recruiter</th>
                  <th style={{ ...th, textAlign: 'left' }}>AM</th>
                  <th style={{ ...th, textAlign: 'right' }}>Net Profit</th>
                  <th style={{ ...th, textAlign: 'right' }} title="Combined Recruiter + Account Manager incentive">
                    Incentive (R+AM)
                  </th>
                  <th style={{ ...th, textAlign: 'left' }}>Payout</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r._id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open record ${r.invoiceNumber || r._id}`}
                    onClick={() => navigate(orgPath(`/incentive/records/${r._id}`))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); navigate(orgPath(`/incentive/records/${r._id}`)); } }}
                    style={{ borderTop: '1px solid var(--line-2)', cursor: 'pointer' }}
                  >
                    <td style={td}>
                      <span style={{
                        fontWeight: 500,
                        color: r.invoiceNumber ? 'var(--fg)' : 'var(--fg-4)',
                        fontStyle: r.invoiceNumber ? 'normal' : 'italic',
                      }}>
                        {r.invoiceNumber || '—'}
                      </span>
                    </td>
                    <td style={td}>{r.clientName || '—'}</td>
                    <td style={td}>{r.consultantName || '—'}</td>
                    <td style={td}>{r.recruiterName || '—'}</td>
                    <td style={td}>{r.accountManagerName || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount(r.netProfit, r.currency)}
                    </td>
                    {/* The one arithmetic expression in this render — spliced verbatim. */}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount((r.recruiterIncentive || 0) + (r.accountManagerIncentive || 0), r.currency)}
                    </td>
                    <td style={{ ...td, color: 'var(--fg-4)' }}>{r.payoutMonth || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <StatusCell record={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && records.length > 0 && totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '10px 14px', borderTop: '1px solid var(--line-2)', background: 'var(--surface-2)',
          }}>
            <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Page {page} of {totalPages} ({total} record{total !== 1 ? 's' : ''})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1} iconLeft={<ChevronLeft size={14} />}>Prev</Button>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages} iconRight={<ChevronRight size={14} />}>Next</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
