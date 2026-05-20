import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import contactsApi from '../../utils/contactsApi';
import employeeApi from '../../utils/employeeApi';
import EmployeePicker from '../../components/employee/EmployeePicker';
import ResizableTable from '../../components/ResizableTable';
import FYFilter from '../../components/shared/FYFilter';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  Search, Plus, Loader2, FileText, ChevronLeft, ChevronRight,
  Calendar, X, ArrowUpDown, Building2, Upload, Sparkles, UserPlus, UserCheck,
  Download,
} from 'lucide-react';

const PAGE_SIZES = [20, 50, 100, 200];

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

const EMPLOYEE_JOURNAL_CODE = 'EMPBI';

export default function VendorBillList({ mode = 'vendor' } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgSlug, orgPath } = usePlatform();
  const { currentCompany } = useCompany();
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
  // Employee Bill list filters (Phase 5).  Both stored as employee _id
  // strings; null/empty means "no filter".  No-ops on the vendor-bill list.
  const [submitterEmployeeId, setSubmitterEmployeeId] = useState('');
  const [approverEmployeeId, setApproverEmployeeId] = useState('');
  // Employee pool for the two pickers — fetched once on mount in employee
  // mode and scoped to the current company by the backend.  Kept light
  // (project: name + employeeId + designation) so the page stays snappy
  // even on tenants with thousands of employees.
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const storageKey = isEmployeeMode ? 'invoicing.employeeBills.pageSize' : 'invoicing.vendorBills.pageSize';
  const [pageSize, setPageSize] = useState(() => {
    const stored = parseInt(localStorage.getItem(storageKey) || '20', 10);
    return PAGE_SIZES.includes(stored) ? stored : 20;
  });
  useEffect(() => { localStorage.setItem(storageKey, String(pageSize)); }, [pageSize, storageKey]);
  const [fy, setFy] = useState({ preset: 'all', dateFrom: null, dateTo: null });
  const [exporting, setExporting] = useState(false);
  // AI-extraction drop zone is collapsed by default — was always-visible above
  // the tabs, which the accountant audit flagged as clutter on lists with no
  // import use case.
  const [showAiZone, setShowAiZone] = useState(false);

  // AI extraction state — only used on vendor-bill list (not employee bills)
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [aiStep, setAiStep] = useState('idle'); // idle | extracting | choose | creating
  const [aiPayload, setAiPayload] = useState(null); // { extracted, vendorMatch, file }

  const loadBills = useCallback(async () => {
    setLoading(true);
    // Reset on company switch so the previous company's bills don't linger
    // if the new fetch returns nothing.
    setBills([]);
    setTotal(0);
    setTotalPages(1);
    setStatusCounts({});
    setPaymentStatusCounts({});
    setOverdueCount(0);
    try {
      const params = {
        page,
        limit: pageSize,
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
      if (fy.dateFrom) params.dateFrom = fy.dateFrom;
      if (fy.dateTo) params.dateTo = fy.dateTo;
      // Employee Bill picker filters — only meaningful in employee mode but
      // sending them in vendor mode is harmless (backend filters on the
      // sourceEmployeeId / approverEmployeeId fields which are null on
      // vendor bills, so the result naturally collapses to zero rows).
      if (isEmployeeMode) {
        if (submitterEmployeeId) params.submitterEmployeeId = submitterEmployeeId;
        if (approverEmployeeId) params.approverEmployeeId = approverEmployeeId;
      }

      const res = await invoicingApi.listBills(orgSlug, params);
      setBills(res.bills || res.data || []);
      setTotalPages(
        res.totalPages || res.pages || Math.max(1, Math.ceil((res.total || 0) / pageSize))
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
  }, [orgSlug, currentCompany?._id, page, activeTab, search, sortField, sortOrder, isEmployeeMode, submitterEmployeeId, approverEmployeeId, pageSize, fy.dateFrom, fy.dateTo]);

  useEffect(() => {
    if (orgSlug) loadBills();
  }, [loadBills, orgSlug]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, search, submitterEmployeeId, approverEmployeeId, fy.dateFrom, fy.dateTo, pageSize]);

  // Load employee pool for the picker filters once per company in employee
  // mode.  Skip in vendor mode — the pickers don't render there, so paying
  // for the fetch would be wasted.  Backend scopes by req.companyId via
  // orgMiddleware, matching the bill list's own scope.
  useEffect(() => {
    if (!orgSlug || !isEmployeeMode) {
      setEmployeeOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await employeeApi.list(orgSlug, { limit: 1000 });
        if (cancelled) return;
        const list = res?.employees || res?.data || [];
        setEmployeeOptions(
          list.map((e) => ({
            _id: String(e._id),
            fullName: e.fullName || e.name || '',
            employeeId: e.employeeId || '',
            designation: e.designation || '',
          })).filter(e => e.fullName)
        );
      } catch {
        /* fail-quiet — pickers just stay empty rather than blocking the page */
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id, isEmployeeMode]);

  // ── AI extraction flow ─────────────────────────────────────────────────
  // 1. User drops a PDF → extractVendorBill → get { extracted, vendorMatch }
  // 2. If vendor matched → go straight to step 3.
  //    Else → open VendorChoiceModal for Create / Match / Blank.
  // 3. Create draft bill pre-filled from `extracted` + chosen contactId,
  //    then navigate to detail with ?ai=1 to show the yellow verify banner.
  const createBillFromExtracted = useCallback(async ({ extracted, contactId, file }) => {
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
              // Phase Q6/C: prompt now extracts `unit` ("Days" / "Months" /
              // "GB" / etc.) per line.  Surfaces in the new vendor-bill
              // Unit column.  expenseCategory was dropped from the prompt
              // schema in the same change.
              unit: l.unit || undefined,
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

      // Attach the original PDF to the bill (non-blocking — don't fail the flow).
      // `file` is passed through the call chain instead of read from state to avoid
      // a stale-closure bug where the aiFile state update hasn't flushed by the
      // time this callback reads it.
      if (file) {
        try {
          await invoicingApi.uploadAttachment(orgSlug, newId, file, 'Vendor PDF');
        } catch (e) {
          console.warn('Failed to attach PDF to bill:', e);
        }
      }

      showToast('Bill drafted from PDF — please verify');
      navigate(orgPath(`/invoicing/invoices/${newId}?ai=1`));
    } catch (err) {
      showToast(err.message || 'Failed to create bill', 'error');
      setAiStep('idle');
      setAiPayload(null);
    }
  }, [orgSlug, orgPath, navigate, showToast]);

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
      const fd = new FormData();
      fd.append('file', file);
      const res = await invoicingApi.extractVendorBill(orgSlug, fd);
      const extracted = res?.extracted;
      const vendorMatch = res?.vendorMatch || null;
      if (!extracted) throw new Error('Extraction returned no data');
      if (vendorMatch?.contactId) {
        await createBillFromExtracted({ extracted, contactId: vendorMatch.contactId, file });
      } else {
        setAiPayload({ extracted, vendorMatch, file });
        setAiStep('choose');
      }
    } catch (err) {
      showToast(err.message || 'AI extraction failed', 'error');
      setAiStep('idle');
      setAiPayload(null);
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
        {active
          ? <span className="text-rivvra-400 text-[11px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
          : <ArrowUpDown size={12} className="text-dark-600" />}
      </button>
    );
  }

  // Running totals per-currency for the visible page.
  const pageTotals = bills.reduce((acc, b) => {
    const cur = (b.currency || 'INR').toUpperCase();
    if (!acc[cur]) acc[cur] = { total: 0, due: 0, count: 0 };
    acc[cur].total += Number(b.total) || 0;
    acc[cur].due += Number(b.amountDue) || 0;
    acc[cur].count += 1;
    return acc;
  }, {});
  const totalsCurrencies = Object.keys(pageTotals);

  const hasActiveFilters = Boolean(activeTab || search || fy.preset !== 'all' || submitterEmployeeId || approverEmployeeId);

  function clearAllFilters() {
    setActiveTab('');
    setSearch('');
    setSubmitterEmployeeId('');
    setApproverEmployeeId('');
    setFy({ preset: 'all', dateFrom: null, dateTo: null });
    setPage(1);
  }

  async function handleExportCSV() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = {
        page: 1, limit: 5000, type: 'vendor_bill',
        sort: sortField, order: sortOrder,
      };
      if (isEmployeeMode) params.journalCode = EMPLOYEE_JOURNAL_CODE;
      else params.journalCodeExclude = EMPLOYEE_JOURNAL_CODE;
      const tab = TABS.find(t => t.key === activeTab);
      if (tab?.filterKind === 'status') params.status = tab.value;
      else if (tab?.filterKind === 'paymentStatus') params.paymentStatus = tab.value;
      else if (tab?.filterKind === 'overdue') params.overdue = tab.value;
      if (search.trim()) params.search = search.trim();
      if (fy.dateFrom) params.dateFrom = fy.dateFrom;
      if (fy.dateTo) params.dateTo = fy.dateTo;
      if (isEmployeeMode) {
        if (submitterEmployeeId) params.submitterEmployeeId = submitterEmployeeId;
        if (approverEmployeeId) params.approverEmployeeId = approverEmployeeId;
      }
      const res = await invoicingApi.listBills(orgSlug, params);
      const rows = res.bills || res.data || [];
      const headers = ['Number', 'Vendor', 'Reference', 'Date', 'Due Date', 'Currency', 'Total', 'Amount Paid', 'Amount Due', 'Status', 'Payment Status'];
      const csv = [headers.join(',')].concat(rows.map(r => [
        r.number || '',
        (r.contactName || '').replace(/,/g, ' '),
        (r.vendorReference || r.reference || '').replace(/,/g, ' '),
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
      link.download = `${isEmployeeMode ? 'employee-bills' : 'vendor-bills'}-${ts}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} rows`);
    } catch {
      showToast('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
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
          {!isEmployeeMode && !showAiZone && aiStep === 'idle' && (
            <button
              onClick={() => setShowAiZone(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-700 hover:border-dark-600 text-dark-300 hover:text-white text-sm font-medium transition-colors"
              title="Extract a bill from a PDF using AI"
            >
              <Sparkles size={14} /> Import from PDF
            </button>
          )}
          <button
            onClick={() => navigate(orgPath('/invoicing/bills/new'))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Create Bill
          </button>
        </div>
      </div>

      {/* AI extraction drop zone (vendor bills only) — collapsed by default,
          shown when the user clicks "Import from PDF" or while an extraction
          is in flight (so progress stays visible across re-renders). */}
      {!isEmployeeMode && (showAiZone || aiStep !== 'idle') && (
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
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowAiZone(false); }}
                className="shrink-0 text-xs text-dark-400 hover:text-white inline-flex items-center gap-1"
                title="Hide importer"
              >
                <X size={12} />
              </button>
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
          onDone={(contactId) => createBillFromExtracted({ extracted: aiPayload.extracted, contactId, file: aiPayload.file })}
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
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-dark-400 hover:text-white'
              }`}
            >
              {tab.label}
              {count != null && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                  isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-dark-800 text-dark-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar: search + FY filter + employee pickers + clear + export */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <label className="block text-[10px] uppercase tracking-wider text-dark-500 mb-1">Search</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isEmployeeMode ? 'Search by number, employee…' : 'Search by number, vendor, reference…'}
              className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-dark-500 mb-1">Financial Year</label>
          <FYFilter value={fy} onChange={(v) => { setFy(v); setPage(1); }} />
        </div>
        {/* Submitter / Approver filters — only on /employee-bills. */}
        {isEmployeeMode && (
          <>
            <div className="min-w-[200px] max-w-[260px] flex-1">
              <label className="block text-[10px] uppercase tracking-wider text-dark-500 mb-1">Submitted by</label>
              <EmployeePicker
                value={submitterEmployeeId}
                employees={employeeOptions}
                onChange={setSubmitterEmployeeId}
                placeholder="Any employee…"
              />
            </div>
            <div className="min-w-[200px] max-w-[260px] flex-1">
              <label className="block text-[10px] uppercase tracking-wider text-dark-500 mb-1">Approved by</label>
              <EmployeePicker
                value={approverEmployeeId}
                employees={employeeOptions}
                onChange={setApproverEmployeeId}
                placeholder="Any approver…"
              />
            </div>
          </>
        )}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            title="Clear all filters"
          >
            <X size={12} /> Clear filters
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={handleExportCSV}
          disabled={exporting || bills.length === 0}
          className="flex items-center gap-1.5 bg-dark-850 border border-dark-700 hover:border-dark-600 rounded-lg px-3 py-2 text-sm text-white transition-colors disabled:opacity-50"
          title="Export current view to CSV"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export CSV
        </button>
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
        <ResizableTable
          storageKey={`invoicing.${isEmployeeMode ? 'employeeBills' : 'vendorBills'}.columns`}
          rows={bills}
          rowKey={(b) => b._id}
          onRowClick={(b) => navigate(orgPath(`/invoicing/invoices/${b._id}`))}
          emptyMessage="No bills"
          columns={[
            {
              key: 'number', width: 200, minWidth: 120, sticky: 'left',
              headerRender: () => <SortHeader field="number">Number</SortHeader>,
              render: (b) => <span className="font-medium text-white">{b.number || '-'}</span>,
            },
            {
              key: 'vendor', width: 240, minWidth: 120,
              headerRender: () => <span className="text-xs font-medium text-dark-400">Vendor</span>,
              render: (b) => (
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={14} className="text-dark-500 shrink-0" />
                  <span className="text-dark-300 truncate">{b.contactName || b.contact?.name || '-'}</span>
                </div>
              ),
            },
            {
              key: 'reference', width: 160, minWidth: 80,
              headerRender: () => <span className="text-xs font-medium text-dark-400">Reference</span>,
              render: (b) => <span className="text-dark-400 truncate block">{b.vendorReference || b.reference || '-'}</span>,
            },
            {
              key: 'date', width: 130, minWidth: 100,
              headerRender: () => <SortHeader field="date">Date</SortHeader>,
              render: (b) => <span className="text-dark-400">{formatDate(b.date)}</span>,
            },
            {
              key: 'dueDate', width: 130, minWidth: 100,
              headerRender: () => <SortHeader field="dueDate">Due Date</SortHeader>,
              render: (b) => <span className="text-dark-400">{formatDate(b.dueDate)}</span>,
            },
            {
              key: 'total', width: 160, minWidth: 130, align: 'right',
              headerRender: () => <SortHeader field="total">Total</SortHeader>,
              // Currency symbol from formatCurrency already identifies currency —
              // dropping the redundant suffix that was truncating wider amounts.
              render: (b) => (
                <span className="font-medium text-white whitespace-nowrap tabular-nums">
                  {formatCurrency(b.total, b.currency)}
                </span>
              ),
            },
            {
              key: 'status', width: 180, minWidth: 120, sticky: 'right',
              headerRender: () => <span className="text-xs font-medium text-dark-400">Status</span>,
              render: (b) => <StatusChips bill={b} />,
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
                      <span className="text-white font-medium tabular-nums">{formatCurrency(pageTotals[cur].total, cur)}</span>
                      <span className="text-dark-500"> · due </span>
                      <span className={`tabular-nums ${pageTotals[cur].due > 0 ? 'text-amber-400' : 'text-dark-400'}`}>{formatCurrency(pageTotals[cur].due, cur)}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dark-500">
                    Page {page} of {totalPages} ({total.toLocaleString()} bill{total !== 1 ? 's' : ''})
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
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight size={14} />
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
