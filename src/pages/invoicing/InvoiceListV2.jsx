// ============================================================================
// InvoiceListV2.jsx — Customer invoices on ds (phase 14, invoicing money pass)
// ============================================================================
// Copied from InvoiceList.jsx. Money-pass rule: nothing above `return (` moves.
// That matters more here than on the reports, because this page computes money
// in two places that must agree with each other:
//
//   - `pageTotals` — per-currency running totals for the visible page, with
//     invoices and credit notes in SEPARATE buckets. Auto-netting them produced
//     Due > Total when a CN was visible without its source invoice. Untouched.
//   - the reversed-invoice rule — `reversedByCreditNoteId` means no receivable
//     exists, so the stored amountDue (kept for audit) counts as 0. It appears
//     in the totals reduce, in the Amount Due cell, and again in the CSV export.
//     All three untouched.
//
// `handleExportCSV` is likewise byte-identical: it is the one path here that
// leaves the browser with figures in it.
//
// **`ResizableTable` is deliberately KEPT rather than swapped for ds DataTable.**
// It is already themed for the v2 shell — `legacy-bridge.css` defines
// `--rt-sticky-head` / `--rt-sticky-cell` under `.ds-shell` *because of this
// page and Vendor Bills* — and it provides three things ds DataTable does not:
// column widths persisted per user (`storageKey`), sticky left/right columns,
// and a footer slot. On a seven-column money table whose footer carries the
// page totals, those are not cosmetic. Keeping it also means every money cell
// on this page renders through unchanged code.
//
// So the migration here is the page CHROME only: header, tab strip, toolbar,
// loading and empty states.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import ResizableTable from '../../components/ResizableTable';
import FYFilter from '../../components/shared/FYFilter';
// ChevronLeft/ChevronRight are used by the RETAINED ResizableTable footer,
// not by the migrated chrome — don't drop them when trimming this list.
import { Plus, Inbox, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button, EmptyState, PageHeader, PageSpinner, Panel, SearchInput, Spinner, Tabs,
} from '../../components/ds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// en-IN format: "20 May 2026" — consistent with accountant tools (Tally/Zoho).
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const PAGE_SIZES = [20, 50, 100, 200];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Tab model: separates document lifecycle (draft/cancelled) from payment status
// (not_paid/partial/paid) and treats overdue as a derived view.
// `filterKind` tells the fetch code which backend param to set.
const STATUS_TABS = [
  { key: '', label: 'All', filterKind: null },
  { key: 'invoices', label: 'Invoices', filterKind: 'type', value: 'customer_invoice' },
  { key: 'credit_notes', label: 'Credit Notes', filterKind: 'type', value: 'credit_note' },
  { key: 'draft', label: 'Draft', filterKind: 'status', value: 'draft' },
  { key: 'not_paid', label: 'Not Paid', filterKind: 'paymentStatus', value: 'not_paid' },
  { key: 'partial', label: 'Partial', filterKind: 'paymentStatus', value: 'partial' },
  { key: 'overdue', label: 'Overdue', filterKind: 'overdue', value: 'true' },
  { key: 'paid', label: 'Paid', filterKind: 'paymentStatus', value: 'paid' },
  { key: 'cancelled', label: 'Cancelled', filterKind: 'status', value: 'cancelled' },
];

function StatusChips({ invoice }) {
  const { status, paymentStatus } = invoice || {};
  const lifecycleStyles = {
    draft: 'bg-dark-700 text-dark-300',
    cancelled: 'bg-dark-800 text-dark-500 line-through',
  };
  const paymentStyles = {
    not_paid: 'bg-blue-500/10 text-blue-400',
    partial: 'bg-amber-500/10 text-amber-400',
    paid: 'bg-emerald-500/10 text-emerald-400',
  };
  const paymentLabel = {
    not_paid: 'Not Paid',
    partial: 'Partial',
    paid: 'Paid',
  };

  const isReversed = Boolean(invoice?.reversedByCreditNoteId);

  // Draft and Cancelled override payment state for a cleaner row
  if (status === 'draft') {
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${lifecycleStyles.draft}`}>Draft</span>;
  }
  if (status === 'cancelled') {
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${lifecycleStyles.cancelled}`}>Cancelled</span>;
  }
  if (isReversed) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400">Reversed</span>;
  }

  const isCreditNote = invoice?.type === 'credit_note';
  // End-of-day compare so an invoice due TODAY is not flagged overdue.
  const dueEnd = invoice?.dueDate ? new Date(invoice.dueDate) : null;
  if (dueEnd) dueEnd.setHours(23, 59, 59, 999);
  const isOverdue = !isCreditNote && dueEnd && dueEnd < new Date() && paymentStatus !== 'paid';
  // Credit notes never receive payment — relabel paid/partial as Applied/Open.
  const cnLabel = { paid: 'Applied', partial: 'Partially Applied', not_paid: 'Open' };
  const cnStyle = { paid: 'bg-purple-500/10 text-purple-400', partial: 'bg-amber-500/10 text-amber-400', not_paid: 'bg-blue-500/10 text-blue-400' };
  const label = isCreditNote
    ? (cnLabel[paymentStatus] || 'Open')
    : (paymentLabel[paymentStatus] || 'Not Paid');
  const style = isCreditNote
    ? (cnStyle[paymentStatus] || cnStyle.not_paid)
    : (paymentStyles[paymentStatus] || paymentStyles.not_paid);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
        {label}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400">
          Overdue
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InvoiceListV2() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const journalCode = searchParams.get('journalCode');
  const rawStatus = searchParams.get('status');
  const rawPaymentStatus = searchParams.get('paymentStatus');
  const rawOverdue = searchParams.get('overdue');
  const rawType = searchParams.get('type');
  // Translate URL params to a tab key. Legacy ?status=unpaid redirects to
  // Not Paid.
  const initialTab = (() => {
    if (rawOverdue === 'true') return 'overdue';
    if (rawType === 'customer_invoice') return 'invoices';
    if (rawType === 'credit_note') return 'credit_notes';
    if (rawPaymentStatus === 'paid') return 'paid';
    if (rawPaymentStatus === 'partial') return 'partial';
    if (rawPaymentStatus === 'not_paid') return 'not_paid';
    if (rawStatus === 'unpaid') return 'not_paid';
    if (rawStatus === 'draft') return 'draft';
    if (rawStatus === 'cancelled') return 'cancelled';
    if (rawStatus === 'paid') return 'paid';
    if (rawStatus === 'partial') return 'partial';
    if (rawStatus === 'overdue') return 'overdue';
    return '';
  })();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const stored = parseInt(localStorage.getItem('invoicing.customerInvoices.pageSize') || '20', 10);
    return PAGE_SIZES.includes(stored) ? stored : 20;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [paymentStatusCounts, setPaymentStatusCounts] = useState({});
  const [overdueCount, setOverdueCount] = useState(0);
  const [typeCounts, setTypeCounts] = useState({});
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [fy, setFy] = useState({ preset: 'all', dateFrom: null, dateTo: null });
  const [exporting, setExporting] = useState(false);

  useEffect(() => { localStorage.setItem('invoicing.customerInvoices.pageSize', String(pageSize)); }, [pageSize]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    // Reset state on every company switch so stale numbers from the previous
    // company never linger if the new fetch returns nothing.
    setInvoices([]);
    setTotal(0);
    setTotalPages(1);
    setStatusCounts({});
    setPaymentStatusCounts({});
    setOverdueCount(0);
    setTypeCounts({});
    try {
      const params = { page, limit: pageSize, sort: sortField, order: sortOrder };
      const tab = STATUS_TABS.find(t => t.key === statusFilter);
      if (tab?.filterKind === 'status') params.status = tab.value;
      else if (tab?.filterKind === 'paymentStatus') params.paymentStatus = tab.value;
      else if (tab?.filterKind === 'overdue') params.overdue = tab.value;
      else if (tab?.filterKind === 'type') params.type = tab.value;
      if (search) params.search = search;
      if (journalCode) params.journalCode = journalCode;
      if (fy.dateFrom) params.dateFrom = fy.dateFrom;
      if (fy.dateTo) params.dateTo = fy.dateTo;

      const res = await invoicingApi.listInvoices(orgSlug, params);
      if (res.success !== false) {
        setInvoices(res.invoices || res.data || []);
        const pageLimit = res.limit || pageSize;
        setTotalPages(
          res.totalPages || res.pages || Math.max(1, Math.ceil((res.total || 0) / pageLimit))
        );
        setTotal(res.total || 0);
        if (res.statusCounts) setStatusCounts(res.statusCounts);
        if (res.paymentStatusCounts) setPaymentStatusCounts(res.paymentStatusCounts);
        if (res.overdueCount != null) setOverdueCount(res.overdueCount);
        if (res.typeCounts) setTypeCounts(res.typeCounts);
      }
    } catch {
      showToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, currentCompany?._id, statusFilter, search, page, journalCode, pageSize, sortField, sortOrder, fy.dateFrom, fy.dateTo]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Tab change resets page and mirrors the tab into the URL so refresh /
  // back-forward / shared links restore the same view (matches resolveInitialTab).
  function handleTabChange(key) {
    setStatusFilter(key);
    setPage(1);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('status');
      next.delete('paymentStatus');
      next.delete('overdue');
      next.delete('type');
      const tab = STATUS_TABS.find(t => t.key === key);
      if (tab?.filterKind === 'status') next.set('status', tab.value);
      else if (tab?.filterKind === 'paymentStatus') next.set('paymentStatus', tab.value);
      else if (tab?.filterKind === 'overdue') next.set('overdue', tab.value);
      else if (tab?.filterKind === 'type') next.set('type', tab.value);
      return next;
    }, { replace: true });
  }

  function getTabCount(key) {
    const tab = STATUS_TABS.find(t => t.key === key);
    if (!tab || !tab.filterKind) {
      const sum = Object.values(statusCounts || {}).reduce((s, c) => s + (Number(c) || 0), 0);
      if (sum > 0) return sum;
      return statusCounts.all ?? (statusFilter ? null : total);
    }
    if (tab.filterKind === 'status') return statusCounts[tab.value] ?? null;
    if (tab.filterKind === 'paymentStatus') return paymentStatusCounts[tab.value] ?? null;
    if (tab.filterKind === 'overdue') return overdueCount || null;
    if (tab.filterKind === 'type') return typeCounts[tab.value] ?? null;
    return null;
  }

  function handleSort(field) {
    if (field === sortField) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
    setPage(1);
  }

  function sortArrow(field) {
    if (sortField !== field) return null;
    return <span className="text-rivvra-400 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  }

  // Running totals per-currency for the visible page. Invoices and credit
  // notes are kept in SEPARATE buckets — auto-netting them produced
  // mathematically broken displays when a CN was visible without its
  // source invoice (gross dropped, due didn't, so Due > Total). The
  // accountant sees three honest numbers (gross invoiced, credits issued,
  // amount still owed) and can compute net = gross − credits themselves.
  const pageTotals = invoices.reduce((acc, inv) => {
    const cur = (inv.currency || 'INR').toUpperCase();
    if (!acc[cur]) acc[cur] = { invoiced: 0, credited: 0, due: 0, invoiceCount: 0, creditCount: 0 };
    if (inv.type === 'credit_note') {
      acc[cur].credited += Number(inv.total) || 0;
      acc[cur].creditCount += 1;
    } else {
      acc[cur].invoiced += Number(inv.total) || 0;
      // Reversed originals: amountDue field still carries the pre-reversal
      // amount for audit, but no receivable exists. Treat as 0 for sums.
      const dueAmount = inv.reversedByCreditNoteId ? 0 : (Number(inv.amountDue) || 0);
      acc[cur].due += dueAmount;
      acc[cur].invoiceCount += 1;
    }
    return acc;
  }, {});
  const totalsCurrencies = Object.keys(pageTotals);

  // Tab-aware label for the "due" figure — same number, but the word
  // matters: "Due" on the All tab is total outstanding (not just overdue),
  // whereas on the Overdue tab it's the actual overdue exposure. Mismatch
  // confused the accountant during the audit.
  const dueLabel = (() => {
    if (statusFilter === 'overdue') return 'overdue';
    if (statusFilter === 'partial') return 'remaining';
    if (statusFilter === 'paid' || statusFilter === 'cancelled') return null; // hide
    return 'outstanding';
  })();

  const hasActiveFilters = Boolean(statusFilter || search || fy.preset !== 'all');
  function clearFilters() {
    setStatusFilter('');
    setSearchInput('');
    setSearch('');
    setFy({ preset: 'all', dateFrom: null, dateTo: null });
    setPage(1);
  }

  async function handleExportCSV() {
    if (exporting) return;
    setExporting(true);
    try {
      // Fetch up to 5000 rows in one shot — well above any realistic single-period filter.
      const params = { page: 1, limit: 5000, sort: sortField, order: sortOrder };
      const tab = STATUS_TABS.find(t => t.key === statusFilter);
      if (tab?.filterKind === 'status') params.status = tab.value;
      else if (tab?.filterKind === 'paymentStatus') params.paymentStatus = tab.value;
      else if (tab?.filterKind === 'overdue') params.overdue = tab.value;
      else if (tab?.filterKind === 'type') params.type = tab.value;
      if (search) params.search = search;
      if (journalCode) params.journalCode = journalCode;
      if (fy.dateFrom) params.dateFrom = fy.dateFrom;
      if (fy.dateTo) params.dateTo = fy.dateTo;

      const res = await invoicingApi.listInvoices(orgSlug, params);
      const rows = res.invoices || res.data || [];
      const headers = ['Number', 'Type', 'Customer', 'Date', 'Due Date', 'Currency', 'Total', 'Amount Paid', 'Amount Due', 'Status', 'Payment Status', 'Reversed', 'Credit Note For'];
      const csv = [headers.join(',')].concat(rows.map(r => {
        const isReversed = !!r.reversedByCreditNoteId;
        return [
          r.number || '',
          r.type === 'credit_note' ? 'Credit Note' : 'Invoice',
          (r.contactName || '').replace(/,/g, ' '),
          r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
          r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '',
          r.currency || 'INR',
          Number(r.total || 0).toFixed(2),
          Number(r.amountPaid || 0).toFixed(2),
          // CSV mirrors the row-display semantics: a reversed receivable is
          // not "due" anymore, so emit 0 rather than the stale pre-reversal
          // amount the field still carries.
          isReversed ? '0.00' : Number(r.amountDue || 0).toFixed(2),
          r.status || '',
          r.paymentStatus || '',
          isReversed ? 'Yes' : 'No',
          r.creditNoteForNumber || (r.creditNoteForId ? '(linked)' : ''),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      })).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `customer-invoices-${ts}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} rows`);
    } catch {
      showToast('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  }

  const tabs = STATUS_TABS.map(t => ({ key: t.key, label: t.label, count: getTabCount(t.key) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={journalCode ? `Customer Invoices — ${journalCode}` : 'Customer Invoices'}
        sub={journalCode ? `Filtered by journal: ${journalCode}` : 'Manage and track all your invoices'}
        actions={
          <Button onClick={() => navigate(orgPath('/invoicing/invoices/new'))} iconLeft={<Plus size={14} />}>
            Create Invoice
          </Button>
        }
      />

      {/* Accent is the invoicing app colour, not brand green — the tab strip
          sits inside the app's own chrome and the legacy bar was amber. */}
      <Tabs tabs={tabs} value={statusFilter} onChange={handleTabChange} accent="var(--a-invoice)" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SearchInput
          value={searchInput}
          onChange={(v) => setSearchInput(typeof v === 'string' ? v : v?.target?.value ?? '')}
          placeholder="Search by number, customer…"
          style={{ flex: 1, minWidth: 240, maxWidth: 420 }}
        />
        <FYFilter value={fy} onChange={(v) => { setFy(v); setPage(1); }} />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} iconLeft={<X size={14} />} title="Clear all filters">
            Clear filters
          </Button>
        )}
        <div style={{ flex: 1 }} />
        <Button
          variant="secondary"
          onClick={handleExportCSV}
          disabled={exporting || invoices.length === 0}
          iconLeft={exporting ? <Spinner size={14} /> : <Download size={14} />}
          title="Export current view to CSV"
        >
          Export CSV
        </Button>
      </div>

      {loading ? (
        <Panel><PageSpinner minHeight="40vh" /></Panel>
      ) : invoices.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Inbox size={22} />}
            title="No invoices found"
            actions={!search && !statusFilter ? (
              <Button onClick={() => navigate(orgPath('/invoicing/invoices/new'))} iconLeft={<Plus size={14} />}>
                Create Invoice
              </Button>
            ) : null}
          >
            {search || statusFilter
              ? 'Try adjusting your filters or search term'
              : 'Create your first invoice to get started'}
          </EmptyState>
        </Panel>
      ) : (
          <ResizableTable
            storageKey="invoicing.customerInvoices.columns"
            rows={invoices}
            rowKey={(inv) => inv._id}
            onRowClick={(inv) => navigate(orgPath(`/invoicing/invoices/${inv._id}`))}
            emptyMessage="No invoices found"
            columns={[
              {
                key: 'number', width: 170, minWidth: 130, sticky: 'left',
                label: 'Number',
                render: (inv) => (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`font-medium ${inv.number ? 'text-white' : 'text-dark-500 italic'}`}>
                      {inv.number || inv.invoiceNumber || 'Draft'}
                    </span>
                    {inv.type === 'credit_note' && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        CN
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'customer', width: 240, minWidth: 120,
                label: 'Customer',
                render: (inv) => <span className="text-dark-300 truncate block">{inv.contactName || inv.customerName || '-'}</span>,
              },
              {
                key: 'date', width: 130, minWidth: 100,
                label: <button onClick={() => handleSort('date')} className="font-medium hover:text-white">Date{sortArrow('date')}</button>,
                render: (inv) => <span className="text-dark-400">{formatDate(inv.date || inv.createdAt)}</span>,
              },
              {
                key: 'dueDate', width: 130, minWidth: 100,
                label: <button onClick={() => handleSort('dueDate')} className="font-medium hover:text-white">Due Date{sortArrow('dueDate')}</button>,
                render: (inv) => <span className="text-dark-400">{formatDate(inv.dueDate)}</span>,
              },
              {
                key: 'total', width: 160, minWidth: 130, align: 'right',
                label: <button onClick={() => handleSort('total')} className="font-medium hover:text-white">Total{sortArrow('total')}</button>,
                // Currency symbol (₹/$) from formatCurrency already identifies
                // the currency — no need for a redundant "INR"/"USD" suffix
                // that was eating column width and truncating large amounts.
                render: (inv) => (
                  <span className="text-white font-medium whitespace-nowrap tabular-nums">
                    {formatCurrency(inv.total, inv.currency)}
                  </span>
                ),
              },
              {
                key: 'amountDue', width: 130, minWidth: 110, align: 'right',
                label: 'Amount Due',
                render: (inv) => {
                  // Reversed invoices have no real receivable — the stored
                  // amountDue is the pre-reversal amount kept for audit, but
                  // displaying it as "due" misleads the accountant.
                  if (inv.reversedByCreditNoteId) {
                    return <span className="text-dark-500 italic whitespace-nowrap" title="Reversed by credit note">—</span>;
                  }
                  return (
                    <span className={`whitespace-nowrap tabular-nums ${inv.amountDue > 0 ? 'text-amber-400 font-medium' : 'text-dark-400'}`}>
                      {formatCurrency(inv.amountDue, inv.currency)}
                    </span>
                  );
                },
              },
              {
                key: 'status', width: 130, minWidth: 110, sticky: 'right', align: 'center',
                label: 'Status',
                render: (inv) => <StatusChips invoice={inv} />,
              },
            ]}
            footer={(
              <div>
                {totalsCurrencies.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-dark-700 bg-dark-800/40 flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-dark-500 font-semibold" title="Sum of visible rows on this page. Invoices and credit notes are summed separately so the math is always self-consistent.">Page totals</span>
                    {totalsCurrencies.map(cur => {
                      const b = pageTotals[cur];
                      return (
                        <span key={cur} className="text-xs text-dark-300">
                          <span className="text-dark-500">{cur}:</span>{' '}
                          {b.invoiceCount > 0 && (
                            <>
                              <span className="text-dark-500">invoiced ({b.invoiceCount})</span>{' '}
                              <span className="text-white font-medium tabular-nums">{formatCurrency(b.invoiced, cur)}</span>
                              {dueLabel && (
                                <>
                                  <span className="text-dark-500"> · {dueLabel} </span>
                                  <span className={`tabular-nums ${b.due > 0 ? (dueLabel === 'overdue' ? 'text-red-400' : 'text-amber-400') : 'text-dark-400'}`}>{formatCurrency(b.due, cur)}</span>
                                </>
                              )}
                            </>
                          )}
                          {b.creditCount > 0 && (
                            <>
                              {b.invoiceCount > 0 && <span className="text-dark-600 mx-1">·</span>}
                              <span className="text-dark-500">credited ({b.creditCount})</span>{' '}
                              <span className="text-purple-400 tabular-nums">−{formatCurrency(b.credited, cur)}</span>
                            </>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700 bg-dark-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-dark-400">
                      Page {page} of {totalPages} ({total.toLocaleString()} invoice{total !== 1 ? 's' : ''})
                    </span>
                    <label className="text-xs text-dark-500 flex items-center gap-1.5">
                      Per page:
                      <select
                        value={pageSize}
                        onChange={e => { setPageSize(+e.target.value); setPage(1); }}
                        className="bg-dark-900 border border-dark-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-rivvra-500"
                      >
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} />
                      Prev
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          />
      )}
    </div>
  );
}
