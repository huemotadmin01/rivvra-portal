import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Search, Plus, Loader2, FileText, ChevronLeft, ChevronRight,
  Calendar, X, ArrowUpDown, Building2,
} from 'lucide-react';

const TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Received' },
  { key: 'paid', label: 'Paid' },
];

const STATUS_STYLES = {
  draft:     { bg: 'bg-dark-700',        text: 'text-dark-300',    dot: 'bg-dark-400' },
  sent:      { bg: 'bg-blue-500/10',     text: 'text-blue-400',    dot: 'bg-blue-500' },
  received:  { bg: 'bg-blue-500/10',     text: 'text-blue-400',    dot: 'bg-blue-500' },
  partial:   { bg: 'bg-amber-500/10',    text: 'text-amber-400',   dot: 'bg-amber-500' },
  paid:      { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', dot: 'bg-emerald-500' },
  overdue:   { bg: 'bg-red-500/10',      text: 'text-red-400',     dot: 'bg-red-500' },
  cancelled: { bg: 'bg-dark-800',        text: 'text-dark-500',    dot: 'bg-dark-600' },
};

function StatusBadge({ status }) {
  const st = STATUS_STYLES[status] || STATUS_STYLES.draft;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${st.bg} ${st.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

export default function VendorBillList() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { showToast } = useToast();

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const limit = 20;

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        type: 'vendor_bill',
        sort: sortField,
        order: sortOrder,
      };
      if (activeTab) params.status = activeTab;
      if (search.trim()) params.search = search.trim();

      const res = await invoicingApi.listBills(orgSlug, params);
      setBills(res.bills || res.data || []);
      setTotalPages(
        res.totalPages || res.pages || Math.max(1, Math.ceil((res.total || 0) / limit))
      );
      setTotal(res.total || 0);
    } catch (err) {
      showToast(err.message || 'Failed to load bills', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, activeTab, search, sortField, sortOrder]);

  useEffect(() => {
    if (orgSlug) loadBills();
  }, [loadBills, orgSlug]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

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

  // Tab counts from API or local filter
  const tabCounts = useMemo(() => {
    const counts = { '': total };
    TABS.forEach(t => {
      if (t.key) {
        counts[t.key] = bills.filter(b => b.status === t.key).length;
      }
    });
    // If we have the total, use it for 'All'
    counts[''] = total;
    return counts;
  }, [bills, total]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Vendor Bills</h1>
          <p className="text-sm text-dark-400 mt-0.5">Manage purchase bills from vendors</p>
        </div>
        <button
          onClick={() => navigate(orgPath('/invoicing/bills/new'))}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Create Bill
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-dark-700">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-rivvra-500 text-rivvra-400'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bills..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
        </div>
      ) : bills.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search || activeTab ? 'No bills match your filters' : 'No vendor bills yet'}</p>
          {!search && !activeTab && (
            <button
              onClick={() => navigate(orgPath('/invoicing/bills/new'))}
              className="mt-3 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
            >
              Create your first bill
            </button>
          )}
        </div>
      ) : (
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3">
                    <SortHeader field="number">Number</SortHeader>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Vendor</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Reference</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="date">Date</SortHeader>
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="dueDate">Due Date</SortHeader>
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="total">Total</SortHeader>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bills.map(bill => (
                  <tr
                    key={bill._id}
                    onClick={() => navigate(orgPath(`/invoicing/bills/${bill._id}`))}
                    className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{bill.number || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-dark-500 shrink-0" />
                        <span className="text-dark-300 truncate max-w-[180px]">
                          {bill.contactName || bill.contact?.name || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-dark-400">
                      {bill.vendorReference || bill.reference || '-'}
                    </td>
                    <td className="px-4 py-3 text-dark-400">{formatDate(bill.date)}</td>
                    <td className="px-4 py-3 text-dark-400">{formatDate(bill.dueDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      {formatCurrency(bill.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={bill.status} />
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
                Page {page} of {totalPages} ({total} bills)
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
