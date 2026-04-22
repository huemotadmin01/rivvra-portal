import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import contactsApi from '../../utils/contactsApi';
import {
  Search, Plus, Loader2, FileText, ChevronLeft, ChevronRight,
  Calendar, X, ArrowUpDown, Building2, Upload, Sparkles, UserPlus, UserCheck,
} from 'lucide-react';

// Tab model: separates document lifecycle (draft/cancelled) from payment status
// (not_paid/partial/paid) and treats overdue as a derived view.
const TABS = [
  { key: '', label: 'All', filterKind: null },
  { key: 'draft', label: 'Draft', filterKind: 'status', value: 'draft' },
  { key: 'not_paid', label: 'Not Paid', filterKind: 'paymentStatus', value: 'not_paid' },
  { key: 'partial', label: 'Partial', filterKind: 'paymentStatus', value: 'partial' },
  { key: 'overdue', label: 'Overdue', filterKind: 'overdue', value: 'true' },
  { key: 'paid', label: 'Paid', filterKind: 'paymentStatus', value: 'paid' },
  { key: 'cancelled', label: 'Cancelled', filterKind: 'status', value: 'cancelled' },
];

function resolveInitialTab(sp) {
  if (sp.get('overdue') === 'true') return 'overdue';
  const ps = sp.get('paymentStatus');
  if (ps === 'paid') return 'paid';
  if (ps === 'partial') return 'partial';
  if (ps === 'not_paid') return 'not_paid';
  const st = sp.get('status');
  if (st === 'unpaid') return 'not_paid';
  if (st === 'draft') return 'draft';
  if (st === 'cancelled') return 'cancelled';
  if (st === 'paid') return 'paid';
  if (st === 'partial') return 'partial';
  if (st === 'overdue') return 'overdue';
  return '';
}

function StatusChips({ bill }) {
  const { status, paymentStatus } = bill || {};

  if (status === 'draft') {
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-dark-700 text-dark-300">
      <span className="w-1.5 h-1.5 rounded-full bg-dark-400" />Draft
    </span>;
  }
  if (status === 'cancelled') {
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-dark-800 text-dark-500 line-through">
      <span className="w-1.5 h-1.5 rounded-full bg-dark-600" />Cancelled
    </span>;
  }

  const paymentStyles = {
    not_paid: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500', label: 'Not Paid' },
    partial:  { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500', label: 'Partial' },
    paid:     { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500', label: 'Paid' },
  };
  const st = paymentStyles[paymentStatus] || paymentStyles.not_paid;
  const isOverdue = bill?.dueDate && new Date(bill.dueDate) < new Date() && paymentStatus !== 'paid';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${st.bg} ${st.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
        {st.label}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400">
          Overdue
        </span>
      )}
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

const EMPLOYEE_JOURNAL_CODE = 'EMPBI';

export default function VendorBillList({ mode = 'vendor' } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgSlug, orgPath } = usePlatform();
  const { showToast } = useToast();
  const isEmployeeMode = mode === 'employee';
  const headerTitle = isEmployeeMode ? 'Employee Bills' : 'Vendor Bills';
  const headerSubtitle = isEmployeeMode
    ? 'Employee reimbursements and expense claims'
    : 'Manage purchase bills from vendors';
  const emptyHint = isEmployeeMode ? 'No employee bills yet' : 'No vendor bills yet';

  const initialTab = resolveInitialTab(searchParams);

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [paymentStatusCounts, setPaymentStatusCounts] = useState({});
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const limit = 20;

  // AI extraction state — only used on vendor-bill list (not employee bills)
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [aiStep, setAiStep] = useState('idle'); // idle | extracting | choose | creating
  const [aiPayload, setAiPayload] = useState(null); // { extracted, vendorMatch }
  const [aiFile, setAiFile] = useState(null); // PDF blob — re-uploaded as attachment on bill creation

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
      if (isEmployeeMode) params.journalCode = EMPLOYEE_JOURNAL_CODE;
      else params.journalCodeExclude = EMPLOYEE_JOURNAL_CODE;
      const tab = TABS.find(t => t.key === activeTab);
      if (tab?.filterKind === 'status') params.status = tab.value;
      else if (tab?.filterKind === 'paymentStatus') params.paymentStatus = tab.value;
      else if (tab?.filterKind === 'overdue') params.overdue = tab.value;
      if (search.trim()) params.search = search.trim();

      const res = await invoicingApi.listBills(orgSlug, params);
      setBills(res.bills || res.data || []);
      setTotalPages(
        res.totalPages || res.pages || Math.max(1, Math.ceil((res.total || 0) / limit))
      );
      setTotal(res.total || 0);
      if (res.statusCounts) setStatusCounts(res.statusCounts);
      if (res.paymentStatusCounts) setPaymentStatusCounts(res.paymentStatusCounts);
      if (res.overdueCount != null) setOverdueCount(res.overdueCount);
    } catch (err) {
      showToast(err.message || 'Failed to load bills', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, activeTab, search, sortField, sortOrder, isEmployeeMode]);

  useEffect(() => {
    if (orgSlug) loadBills();
  }, [loadBills, orgSlug]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  // ── AI extraction flow ─────────────────────────────────────────────────
  // 1. User drops a PDF → extractVendorBill → get { extracted, vendorMatch }
  // 2. If vendor matched → go straight to step 3.
  //    Else → open VendorChoiceModal for Create / Match / Blank.
  // 3. Create draft bill pre-filled from `extracted` + chosen contactId,
  //    then navigate to detail with ?ai=1 to show the yellow verify banner.
  const createBillFromExtracted = useCallback(async ({ extracted, contactId }) => {
    try {
      setAiStep('creating');
      const today = new Date().toISOString().split('T')[0];
      const invDate = extracted?.invoice?.date || today;
      const dueDate = extracted?.invoice?.dueDate || invDate;

      // Resolve tax IDs from extracted rates. Prefer IGST tax when the PDF
      // reports an IGST amount (inter-state), else GST (intra-state).
      let taxList = [];
      try {
        const taxRes = await invoicingApi.listTaxes(orgSlug);
        taxList = (taxRes?.taxes || []).filter(t => t.active !== false);
      } catch { /* non-blocking */ }
      const preferIgst = Number(extracted?.totals?.igstAmount || 0) > 0;
      const resolveTaxId = (rate) => {
        if (rate == null || rate === '' || isNaN(Number(rate))) return null;
        const r = Number(rate);
        const candidates = taxList.filter(t => Number(t.rate) === r);
        if (!candidates.length) return null;
        const match = candidates.find(t => preferIgst
          ? /igst/i.test(t.name)
          : !/igst/i.test(t.name));
        return (match || candidates[0])._id;
      };

      const lines = (extracted?.lines || []).length
        ? extracted.lines.map((l) => {
            const taxId = resolveTaxId(l.taxRate);
            return {
              description: l.description || '',
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              hsnSacCode: l.hsnSac || undefined,
              taxIds: taxId ? [taxId] : [],
            };
          })
        : [{ description: '', quantity: 1, unitPrice: 0, taxIds: [] }];

      // India-first extraction: if the PDF had a GSTIN on either side, it's
      // an INR invoice regardless of the contact's or journal's default.
      const looksIndian = !!(extracted?.vendor?.gstin);

      const payload = {
        type: 'vendor_bill',
        date: invDate,
        dueDate,
        contactId: contactId || undefined,
        currency: looksIndian ? 'INR' : undefined,
        vendorInvoiceNumber: extracted?.invoice?.number || undefined,
        placeOfSupply: extracted?.invoice?.placeOfSupply || undefined,
        gstTreatment: extracted?.invoice?.gstTreatment || undefined,
        customerGstin: extracted?.vendor?.gstin || undefined,
        tdsRate: Number(extracted?.tds?.rate) > 0 ? Number(extracted.tds.rate) : undefined,
        tdsSection: extracted?.tds?.section || undefined,
        lines,
      };
      const res = await invoicingApi.createInvoice(orgSlug, payload);
      const newId = res?.invoice?._id;
      if (!newId) throw new Error('Bill creation returned no id');

      // Attach the original PDF to the bill (non-blocking — don't fail the flow)
      if (aiFile) {
        try {
          await invoicingApi.uploadAttachment(orgSlug, newId, aiFile, 'Vendor PDF');
        } catch (e) {
          console.warn('Failed to attach PDF to bill:', e);
        }
      }

      showToast('Bill drafted from PDF — please verify');
      setAiFile(null);
      navigate(orgPath(`/invoicing/invoices/${newId}?ai=1`));
    } catch (err) {
      showToast(err.message || 'Failed to create bill', 'error');
      setAiStep('idle');
      setAiPayload(null);
      setAiFile(null);
    }
  }, [orgSlug, orgPath, navigate, showToast, aiFile]);

  const handlePdfDropped = useCallback(async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      return showToast('Only PDF files are supported', 'error');
    }
    if (file.size > 10 * 1024 * 1024) {
      return showToast('PDF must be under 10 MB', 'error');
    }
    try {
      setAiStep('extracting');
      setAiFile(file);
      const fd = new FormData();
      fd.append('file', file);
      const res = await invoicingApi.extractVendorBill(orgSlug, fd);
      const extracted = res?.extracted;
      const vendorMatch = res?.vendorMatch || null;
      if (!extracted) throw new Error('Extraction returned no data');
      if (vendorMatch?.contactId) {
        await createBillFromExtracted({ extracted, contactId: vendorMatch.contactId });
      } else {
        setAiPayload({ extracted, vendorMatch });
        setAiStep('choose');
      }
    } catch (err) {
      showToast(err.message || 'AI extraction failed', 'error');
      setAiStep('idle');
      setAiPayload(null);
      setAiFile(null);
    }
  }, [orgSlug, showToast, createBillFromExtracted]);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) handlePdfDropped(f);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handlePdfDropped(f);
  };

  const closeChoiceModal = () => {
    setAiStep('idle');
    setAiPayload(null);
    setAiFile(null);
  };

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

  // Tab counts from backend aggregate — stable regardless of active tab.
  const tabCounts = useMemo(() => {
    const counts = {};
    TABS.forEach(t => {
      if (!t.filterKind) {
        const totalAll = Object.values(statusCounts || {}).reduce((s, c) => s + (Number(c) || 0), 0);
        counts[t.key] = totalAll || total || null;
      } else if (t.filterKind === 'status') {
        counts[t.key] = statusCounts[t.value] ?? null;
      } else if (t.filterKind === 'paymentStatus') {
        counts[t.key] = paymentStatusCounts[t.value] ?? null;
      } else if (t.filterKind === 'overdue') {
        counts[t.key] = overdueCount || null;
      }
    });
    return counts;
  }, [statusCounts, paymentStatusCounts, overdueCount, total]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{headerTitle}</h1>
          <p className="text-sm text-dark-400 mt-0.5">{headerSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(orgPath('/invoicing/bills/new'))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Create Bill
          </button>
        </div>
      </div>

      {/* AI extraction drop zone (vendor bills only) */}
      {!isEmployeeMode && (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dragActive) setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => aiStep === 'idle' && fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors px-5 py-4 ${
            dragActive
              ? 'border-rivvra-500 bg-rivvra-500/10'
              : 'border-dark-700 hover:border-dark-600 bg-dark-850'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
              aiStep === 'extracting' || aiStep === 'creating'
                ? 'bg-rivvra-500/20 text-rivvra-400'
                : 'bg-dark-800 text-dark-400'
            }`}>
              {aiStep === 'extracting' || aiStep === 'creating'
                ? <Loader2 size={18} className="animate-spin" />
                : <Sparkles size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">
                {aiStep === 'extracting' ? 'Reading PDF with AI…'
                  : aiStep === 'creating' ? 'Creating draft bill…'
                  : 'Drop a vendor PDF here to auto-fill a new bill'}
              </div>
              <div className="text-xs text-dark-400 mt-0.5">
                Powered by GPT — extracts vendor, invoice #, GST, line items. PDFs up to 10 MB.
              </div>
            </div>
            {aiStep === 'idle' && (
              <div className="shrink-0 text-xs text-dark-400 inline-flex items-center gap-1">
                <Upload size={12} /> or click to upload
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vendor choice modal — shown when AI extract found no vendor match */}
      {aiStep === 'choose' && aiPayload && (
        <VendorChoiceModal
          extracted={aiPayload.extracted}
          orgSlug={orgSlug}
          onCancel={closeChoiceModal}
          onDone={(contactId) => createBillFromExtracted({ extracted: aiPayload.extracted, contactId })}
        />
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-dark-700 overflow-x-auto">
        {TABS.map(tab => {
          const count = tabCounts[tab.key];
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-rivvra-500 text-rivvra-400'
                  : 'border-transparent text-dark-400 hover:text-white'
              }`}
            >
              {tab.label}
              {count != null && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                  isActive ? 'bg-rivvra-500/20 text-rivvra-400' : 'bg-dark-800 text-dark-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
          <p className="text-sm">{search || activeTab ? 'No bills match your filters' : emptyHint}</p>
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
                    onClick={() => navigate(orgPath(`/invoicing/invoices/${bill._id}`))}
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
                      <StatusChips bill={bill} />
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

// ============================================================================
// VendorChoiceModal — prompts the user when AI extraction found no vendor match
// Three outcomes: create a new contact, match an existing one, or leave blank.
// ============================================================================
function VendorChoiceModal({ extracted, orgSlug, onCancel, onDone }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('create'); // create | match | blank
  const [creating, setCreating] = useState(false);
  const [matchQuery, setMatchQuery] = useState('');
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);

  const extractedName = extracted?.vendor?.name || '';
  const extractedGstin = extracted?.vendor?.gstin || '';
  const extractedAddress = extracted?.vendor?.address || '';

  useEffect(() => {
    if (mode !== 'match') return;
    let cancelled = false;
    const q = matchQuery.trim() || extractedName.trim();
    if (!q) { setMatchResults([]); return; }
    setMatchLoading(true);
    const t = setTimeout(() => {
      contactsApi.list(orgSlug, { search: q, limit: 10 })
        .then((res) => { if (!cancelled) setMatchResults(res?.contacts || res?.data || []); })
        .catch(() => { if (!cancelled) setMatchResults([]); })
        .finally(() => { if (!cancelled) setMatchLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode, matchQuery, extractedName, orgSlug]);

  async function handleCreate() {
    if (!extractedName.trim()) return showToast('No vendor name extracted', 'error');
    setCreating(true);
    try {
      const res = await contactsApi.create(orgSlug, {
        name: extractedName,
        companyName: extractedName,
        gstin: extractedGstin || undefined,
        address: extractedAddress || undefined,
        contactType: 'vendor',
      });
      const newId = res?.contact?._id || res?._id;
      if (!newId) throw new Error('Contact creation returned no id');
      onDone(newId);
    } catch (err) {
      showToast(err.message || 'Failed to create vendor', 'error');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <h3 className="text-base font-semibold text-white">No matching vendor found</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              AI extracted "<span className="text-white">{extractedName || '(no name)'}</span>"
              {extractedGstin && <> — GSTIN <span className="text-white">{extractedGstin}</span></>}
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setMode('create')}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                mode === 'create' ? 'border-rivvra-500 bg-rivvra-500/10 text-white' : 'border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              <UserPlus size={16} />
              <span className="font-medium">Create vendor</span>
            </button>
            <button
              onClick={() => setMode('match')}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                mode === 'match' ? 'border-rivvra-500 bg-rivvra-500/10 text-white' : 'border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              <UserCheck size={16} />
              <span className="font-medium">Match existing</span>
            </button>
            <button
              onClick={() => setMode('blank')}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                mode === 'blank' ? 'border-rivvra-500 bg-rivvra-500/10 text-white' : 'border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              <FileText size={16} />
              <span className="font-medium">Leave blank</span>
            </button>
          </div>

          {mode === 'create' && (
            <div className="text-xs text-dark-400 bg-dark-900/50 rounded-lg p-3 space-y-0.5">
              <div><span className="text-dark-500">Name:</span> <span className="text-white">{extractedName || '—'}</span></div>
              {extractedGstin && <div><span className="text-dark-500">GSTIN:</span> <span className="text-white">{extractedGstin}</span></div>}
              {extractedAddress && <div><span className="text-dark-500">Address:</span> <span className="text-white">{extractedAddress}</span></div>}
            </div>
          )}

          {mode === 'match' && (
            <div className="space-y-2">
              <input
                value={matchQuery}
                onChange={(e) => setMatchQuery(e.target.value)}
                placeholder={extractedName || 'Search vendors…'}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
              />
              <div className="max-h-52 overflow-y-auto space-y-1">
                {matchLoading ? (
                  <div className="text-xs text-dark-500 p-3">Searching…</div>
                ) : matchResults.length === 0 ? (
                  <div className="text-xs text-dark-500 p-3">No matches</div>
                ) : (
                  matchResults.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => onDone(c._id)}
                      className="w-full text-left rounded-lg px-3 py-2 hover:bg-dark-800 transition-colors"
                    >
                      <div className="text-sm text-white">{c.name || c.companyName || '(no name)'}</div>
                      <div className="text-xs text-dark-500">
                        {c.gstin ? `GSTIN ${c.gstin}` : c.email || '—'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {mode === 'blank' && (
            <div className="text-xs text-dark-400 bg-dark-900/50 rounded-lg p-3">
              Create the bill without a vendor. You can assign one later on the bill detail page.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-dark-700">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-dark-300 hover:bg-dark-800">
            Cancel
          </button>
          {mode === 'create' && (
            <button
              onClick={handleCreate}
              disabled={creating || !extractedName.trim()}
              className="px-3 py-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 text-sm font-medium text-white"
            >
              {creating ? 'Creating…' : 'Create vendor & bill'}
            </button>
          )}
          {mode === 'blank' && (
            <button
              onClick={() => onDone(null)}
              className="px-3 py-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-sm font-medium text-white"
            >
              Create bill
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
