import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Search, Loader2, CreditCard, ChevronLeft, ChevronRight,
  X, ArrowUpDown, CheckCircle2, ArrowDownLeft, ArrowUpRight,
  Calendar, Filter,
} from 'lucide-react';

const PAYMENT_METHODS = [
  { key: '', label: 'All Methods' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'check', label: 'Check' },
  { key: 'credit_card', label: 'Credit Card' },
  { key: 'upi', label: 'UPI' },
  { key: 'other', label: 'Other' },
];

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

function TypeBadge({ type }) {
  const isInbound = type === 'inbound';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
      isInbound
        ? 'bg-emerald-500/10 text-emerald-400'
        : 'bg-amber-500/10 text-amber-400'
    }`}>
      {isInbound ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
      {isInbound ? 'Inbound' : 'Outbound'}
    </span>
  );
}

function MethodLabel({ method }) {
  const found = PAYMENT_METHODS.find(m => m.key === method);
  const label = found ? found.label : (method || '-').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span className="text-dark-400">{label}</span>;
}

export default function PaymentsList() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { showToast } = useToast();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  const limit = 20;

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        sort: sortField,
        order: sortOrder,
      };
      if (typeFilter) params.type = typeFilter;
      if (methodFilter) params.method = methodFilter;
      if (search.trim()) params.search = search.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await invoicingApi.listPayments(orgSlug, params);
      setPayments(res.payments || res.data || []);
      setTotalPages(res.totalPages || res.pages || 1);
      setTotal(res.total || 0);
    } catch (err) {
      showToast(err.message || 'Failed to load payments', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, typeFilter, methodFilter, search, dateFrom, dateTo, sortField, sortOrder]);

  useEffect(() => {
    if (orgSlug) loadPayments();
  }, [loadPayments, orgSlug]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, methodFilter, search, dateFrom, dateTo]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  function clearFilters() {
    setSearch('');
    setTypeFilter('');
    setMethodFilter('');
    setDateFrom('');
    setDateTo('');
  }

  const hasActiveFilters = search || typeFilter || methodFilter || dateFrom || dateTo;

  function SortHeader({ field, children }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 text-xs font-medium text-dark-400 hover:text-white transition-colors"
      >
        {children}
        <ArrowUpDown size={12} className={active ? 'text-rivvra-400' : 'text-dark-600'} />
      </button>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Payments</h1>
          <p className="text-sm text-dark-400 mt-0.5">Track all inbound and outbound payments</p>
        </div>
      </div>

      {/* Search & Filter Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search payments..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </div>

        <button
          onClick={() => setShowFilters(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:text-white'
          }`}
        >
          <Filter size={14} />
          Filters
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-rivvra-500" />
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Type</label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 focus:outline-none focus:border-rivvra-500"
              >
                <option value="">All Types</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-dark-400 mb-1 block">Method</label>
              <select
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 focus:outline-none focus:border-rivvra-500"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-dark-400 mb-1 block">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
              />
            </div>

            <div>
              <label className="text-xs text-dark-400 mb-1 block">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          <CreditCard size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{hasActiveFilters ? 'No payments match your filters' : 'No payments recorded yet'}</p>
        </div>
      ) : (
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3">
                    <SortHeader field="number">Payment #</SortHeader>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Invoice #</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Customer / Vendor</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Type</span>
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="amount">Amount</SortHeader>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Method</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="date">Date</SortHeader>
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Reconciled</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map(pmt => (
                  <tr
                    key={pmt._id}
                    onClick={() => navigate(orgPath(`/invoicing/payments/${pmt._id}`))}
                    className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{pmt.number || pmt.paymentNumber || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-dark-400">
                      {pmt.invoiceNumber || pmt.invoice?.number || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-dark-300 truncate max-w-[180px] block">
                        {pmt.contactName || pmt.contact?.name || pmt.customerName || pmt.vendorName || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={pmt.type || pmt.paymentType || 'inbound'} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      {formatCurrency(pmt.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <MethodLabel method={pmt.method || pmt.paymentMethod} />
                    </td>
                    <td className="px-4 py-3 text-dark-400">
                      {formatDate(pmt.date || pmt.paymentDate)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pmt.reconciled ? (
                        <CheckCircle2 size={16} className="text-emerald-400 mx-auto" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-dark-600 block mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700">
              <span className="text-xs text-dark-500">
                Page {page} of {totalPages} ({total} payments)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
