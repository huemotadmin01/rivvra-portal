import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  FileText, Plus, Search, ChevronLeft, ChevronRight,
  Loader2, Filter, Inbox,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
];

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-dark-700 text-dark-300',
    sent: 'bg-blue-500/10 text-blue-400',
    paid: 'bg-emerald-500/10 text-emerald-400',
    overdue: 'bg-red-500/10 text-red-400',
    partial: 'bg-amber-500/10 text-amber-400',
    cancelled: 'bg-dark-800 text-dark-500',
  };
  const key = (status || '').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || styles.draft}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Draft'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InvoiceList() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const journalCode = searchParams.get('journalCode');
  const journalStatus = searchParams.get('status');

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(journalStatus || '');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});

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
    try {
      const params = { page };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      if (journalCode) params.journalCode = journalCode;

      const res = await invoicingApi.listInvoices(orgSlug, params);
      if (res.success !== false) {
        setInvoices(res.invoices || res.data || []);
        setTotalPages(res.totalPages || res.pages || 1);
        setTotal(res.total || 0);
        if (res.statusCounts) setStatusCounts(res.statusCounts);
      }
    } catch {
      showToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, statusFilter, search, page, journalCode]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Tab change resets page
  function handleTabChange(key) {
    setStatusFilter(key);
    setPage(1);
  }

  function getTabCount(key) {
    if (!key) return total || statusCounts.all || null;
    return statusCounts[key] ?? null;
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

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="Search invoices by number, customer..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full bg-dark-850 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 focus:ring-1 focus:ring-rivvra-500/30 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-dark-400 animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-dark-500">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Number</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Customer</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Due Date</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Total</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Amount Due</th>
                    <th className="text-center py-3 px-4 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr
                      key={inv._id}
                      onClick={() => navigate(orgPath(`/invoicing/invoices/${inv._id}`))}
                      className="border-b border-dark-700/50 last:border-0 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className={`font-medium ${inv.number ? 'text-white' : 'text-dark-500 italic'}`}>
                          {inv.number || inv.invoiceNumber || 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-dark-300">{inv.contactName || inv.customerName || '-'}</td>
                      <td className="py-3 px-4 text-dark-400">{formatDate(inv.date || inv.createdAt)}</td>
                      <td className="py-3 px-4 text-dark-400">{formatDate(inv.dueDate)}</td>
                      <td className="py-3 px-4 text-white text-right font-medium">{formatCurrency(inv.total)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={inv.amountDue > 0 ? 'text-amber-400 font-medium' : 'text-dark-400'}>
                          {formatCurrency(inv.amountDue)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && invoices.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700 bg-dark-800/50">
              <span className="text-xs text-dark-400">
                Page {page} of {totalPages} ({total} invoice{total !== 1 ? 's' : ''})
              </span>
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
          )}
        </div>
      </div>
    </div>
  );
}
