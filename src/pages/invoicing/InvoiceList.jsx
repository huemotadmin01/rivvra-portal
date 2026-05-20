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
import {
  FileText, Plus, Search, ChevronLeft, ChevronRight,
  Loader2, Filter, Inbox, Download, X,
} from 'lucide-react';

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
  const isOverdue = !isCreditNote && invoice?.dueDate && new Date(invoice.dueDate) < new Date() && paymentStatus !== 'paid';
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

export default function InvoiceList() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const journalCode = searchParams.get('journalCode');
  const rawStatus = searchParams.get('status');
  const rawPaymentStatus = searchParams.get('paymentStatus');
  const rawOverdue = searchParams.get('overdue');
  // Translate URL params to a tab key. Legacy ?status=unpaid redirects to
  // Not Paid.
  const initialTab = (() => {
    if (rawOverdue === 'true') return 'overdue';
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

  // Tab change resets page
  function handleTabChange(key) {
    setStatusFilter(key);
    setPage(1);
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

  // Running totals per-currency for the visible page. Memo not needed — array is small.
  const pageTotals = invoices.reduce((acc, inv) => {
    const cur = (inv.currency || 'INR').toUpperCase();
    if (!acc[cur]) acc[cur] = { total: 0, due: 0, count: 0 };
    acc[cur].total += Number(inv.total) || 0;
    acc[cur].due += Number(inv.amountDue) || 0;
    acc[cur].count += 1;
    return acc;
  }, {});
  const totalsCurrencies = Object.keys(pageTotals);

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
      const headers = ['Number', 'Type', 'Customer', 'Date', 'Due Date', 'Currency', 'Total', 'Amount Paid', 'Amount Due', 'Status', 'Payment Status'];
      const csv = [headers.join(',')].concat(rows.map(r => [
        r.number || '',
        r.type === 'credit_note' ? 'Credit Note' : 'Invoice',
        (r.contactName || '').replace(/,/g, ' '),
        r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
        r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '',
        r.currency || 'INR',
        Number(r.total || 0).toFixed(2),
        Number(r.amountPaid || 0).toFixed(2),
        Number(r.amountDue || 0).toFixed(2),
        r.status || '',
        r.paymentStatus || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\n');

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

  return (
    <div className="bg-dark-900 min-h-screen">
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">
              {journalCode ? `Customer Invoices — ${journalCode}` : 'Customer Invoices'}
            </h1>
            <p className="text-xs text-dark-400 mt-0.5">
              {journalCode ? `Filtered by journal: ${journalCode}` : 'Manage and track all your invoices'}
            </p>
          </div>
          <button
            onClick={() => navigate(orgPath('/invoicing/invoices/new'))}
            className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus size={14} />
            Create Invoice
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-dark-700 overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const isActive = statusFilter === tab.key;
            const count = getTabCount(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors
                  ${isActive
                    ? 'text-amber-400'
                    : 'text-dark-400 hover:text-dark-200'
                  }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {count != null && (
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium
                      ${isActive
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

        {/* Toolbar: search + FY filter + clear + export */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="Search by number, customer..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full bg-dark-850 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 focus:ring-1 focus:ring-rivvra-500/30 transition-colors"
            />
          </div>
          <FYFilter value={fy} onChange={(v) => { setFy(v); setPage(1); }} />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white px-2 py-2 transition-colors"
              title="Clear all filters"
            >
              <X size={14} /> Clear filters
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={handleExportCSV}
            disabled={exporting || invoices.length === 0}
            className="flex items-center gap-1.5 bg-dark-850 border border-dark-700 hover:border-dark-600 rounded-lg px-3 py-2 text-sm text-white transition-colors disabled:opacity-50"
            title="Export current view to CSV"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export CSV
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-dark-850 border border-dark-700 rounded-xl flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-dark-400 animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-dark-850 border border-dark-700 rounded-xl flex flex-col items-center justify-center py-20 text-dark-500">
            <Inbox size={36} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No invoices found</p>
            <p className="text-xs mt-1 opacity-60">
              {search || statusFilter
                ? 'Try adjusting your filters or search term'
                : 'Create your first invoice to get started'}
            </p>
            {!search && !statusFilter && (
              <button
                onClick={() => navigate(orgPath('/invoicing/invoices/new'))}
                className="mt-4 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Plus size={14} />
                Create Invoice
              </button>
            )}
          </div>
        ) : (
          <ResizableTable
            storageKey="invoicing.customerInvoices.columns"
            rows={invoices}
            rowKey={(inv) => inv._id}
            onRowClick={(inv) => navigate(orgPath(`/invoicing/invoices/${inv._id}`))}
            emptyMessage="No invoices found"
            columns={[
              {
                key: 'number', width: 220, minWidth: 140, sticky: 'left',
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
                key: 'total', width: 140, minWidth: 100, align: 'right',
                label: <button onClick={() => handleSort('total')} className="font-medium hover:text-white">Total{sortArrow('total')}</button>,
                render: (inv) => (
                  <span className="text-white font-medium">
                    {formatCurrency(inv.total, inv.currency)}
                    <span className="text-[10px] text-dark-500 ml-1">{(inv.currency || 'INR').toUpperCase()}</span>
                  </span>
                ),
              },
              {
                key: 'amountDue', width: 140, minWidth: 100, align: 'right',
                label: 'Amount Due',
                render: (inv) => (
                  <span className={inv.amountDue > 0 ? 'text-amber-400 font-medium' : 'text-dark-400'}>
                    {formatCurrency(inv.amountDue, inv.currency)}
                  </span>
                ),
              },
              {
                key: 'status', width: 180, minWidth: 120, sticky: 'right', align: 'center',
                label: 'Status',
                render: (inv) => <StatusChips invoice={inv} />,
              },
            ]}
            footer={(
              <div>
                {totalsCurrencies.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-dark-700 bg-dark-800/40 flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-dark-500 font-semibold">Page totals</span>
                    {totalsCurrencies.map(cur => (
                      <span key={cur} className="text-xs text-dark-300">
                        <span className="text-dark-500">{cur} ({pageTotals[cur].count}):</span>{' '}
                        <span className="text-white font-medium">{formatCurrency(pageTotals[cur].total, cur)}</span>
                        <span className="text-dark-500"> · due </span>
                        <span className={pageTotals[cur].due > 0 ? 'text-amber-400' : 'text-dark-400'}>{formatCurrency(pageTotals[cur].due, cur)}</span>
                      </span>
                    ))}
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
    </div>
  );
}
