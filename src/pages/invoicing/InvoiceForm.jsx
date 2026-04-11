// ============================================================================
// InvoiceForm.jsx — Create / Edit invoice form
// ============================================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import api from '../../utils/api';
import {
  Save, Loader2, Plus, Trash2, X, Search, ChevronDown,
  ArrowLeft, Send, FileText, RefreshCw, Calendar, Check,
} from 'lucide-react';

// ── Empty line item ──
const emptyLine = () => ({
  _key: Date.now() + Math.random(),
  product: null,
  productSearch: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  taxes: [],
  _productResults: [],
  _showProductDropdown: false,
});

// ── Initial form state ──
const INITIAL_FORM = {
  customer: null,
  customerSearch: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  paymentTerms: '',
  currency: 'INR',
  lineItems: [emptyLine()],
  notes: '',
  internalNotes: '',
  isRecurring: false,
  recurringFrequency: 'monthly',
  recurringEndDate: '',
};

// ── Helpers ──
function calcLineTax(line, allTaxes) {
  const base = line.quantity * line.unitPrice;
  const afterDiscount = base - base * (line.discountPercent / 100);
  let taxAmount = 0;
  if (line.taxes?.length && allTaxes?.length) {
    for (const taxId of line.taxes) {
      const tax = allTaxes.find((t) => t._id === taxId);
      if (tax) taxAmount += afterDiscount * (tax.rate / 100);
    }
  }
  return taxAmount;
}

function calcLineTotal(line) {
  const base = line.quantity * line.unitPrice;
  return base - base * (line.discountPercent / 100);
}

const inputCls =
  'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent';
const labelCls = 'block text-sm font-medium text-dark-300 mb-1';
const smallInputCls =
  'bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-white text-sm placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent';

export default function InvoiceForm() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const { invoiceId } = useParams();
  const navigate = useNavigate();

  const isEdit = !!invoiceId;

  // ── State ──
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [sendAfterSave, setSendAfterSave] = useState(false);

  // Lookup data
  const [paymentTermsList, setPaymentTermsList] = useState([]);
  const [taxesList, setTaxesList] = useState([]);
  const [productsList, setProductsList] = useState([]);

  // Contact search
  const [contactResults, setContactResults] = useState([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactSearchTimer = useRef(null);
  const contactDropdownRef = useRef(null);

  // ── Load lookup data ──
  useEffect(() => {
    if (!orgSlug) return;
    const load = async () => {
      try {
        const [termsRes, taxesRes, productsRes] = await Promise.all([
          invoicingApi.listPaymentTerms(orgSlug),
          invoicingApi.listTaxes(orgSlug),
          invoicingApi.listProducts(orgSlug),
        ]);
        if (termsRes?.paymentTerms) setPaymentTermsList(termsRes.paymentTerms);
        if (taxesRes?.taxes) setTaxesList(taxesRes.taxes);
        if (productsRes?.products) setProductsList(productsRes.products);
      } catch (err) {
        console.error('Failed to load invoice lookup data', err);
      }
    };
    load();
  }, [orgSlug]);

  // ── Load existing invoice for edit ──
  useEffect(() => {
    if (!isEdit || !orgSlug) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await invoicingApi.getInvoice(orgSlug, invoiceId);
        const inv = res?.invoice;
        if (!inv) {
          showToast('Invoice not found', 'error');
          navigate(orgPath('/invoicing/invoices'));
          return;
        }
        setForm({
          customer: inv.customer || null,
          customerSearch: inv.customer?.name || inv.customer?.company || '',
          invoiceDate: inv.invoiceDate?.slice(0, 10) || '',
          dueDate: inv.dueDate?.slice(0, 10) || '',
          paymentTerms: inv.paymentTerms?._id || inv.paymentTerms || '',
          currency: inv.currency || 'INR',
          lineItems: (inv.lineItems || []).map((li) => ({
            _key: Date.now() + Math.random(),
            product: li.product || null,
            productSearch: li.product?.name || '',
            description: li.description || '',
            quantity: li.quantity ?? 1,
            unitPrice: li.unitPrice ?? 0,
            discountPercent: li.discountPercent ?? 0,
            taxes: (li.taxes || []).map((t) => (typeof t === 'object' ? t._id : t)),
            _productResults: [],
            _showProductDropdown: false,
          })),
          notes: inv.notes || '',
          internalNotes: inv.internalNotes || '',
          isRecurring: inv.isRecurring || false,
          recurringFrequency: inv.recurringFrequency || 'monthly',
          recurringEndDate: inv.recurringEndDate?.slice(0, 10) || '',
        });
      } catch (err) {
        showToast('Failed to load invoice', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isEdit, invoiceId, orgSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close contact dropdown on outside click ──
  useEffect(() => {
    const handler = (e) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Contact search ──
  const searchContacts = useCallback(
    (query) => {
      if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
      if (!query || query.length < 2) {
        setContactResults([]);
        setShowContactDropdown(false);
        return;
      }
      contactSearchTimer.current = setTimeout(async () => {
        try {
          const res = await api.request(
            `/api/org/${orgSlug}/contacts?search=${encodeURIComponent(query)}&limit=10`
          );
          const contacts = res?.contacts || res?.data || [];
          setContactResults(contacts);
          setShowContactDropdown(contacts.length > 0);
        } catch {
          setContactResults([]);
        }
      }, 300);
    },
    [orgSlug]
  );

  const selectContact = (contact) => {
    setForm((f) => ({
      ...f,
      customer: contact,
      customerSearch: contact.name || contact.company || contact.email || '',
    }));
    setShowContactDropdown(false);
    setContactResults([]);
  };

  const clearContact = () => {
    setForm((f) => ({ ...f, customer: null, customerSearch: '' }));
  };

  // ── Product search per line ──
  const searchProducts = useCallback(
    (query, lineIdx) => {
      if (!query || query.length < 1) {
        updateLine(lineIdx, { _productResults: [], _showProductDropdown: false });
        return;
      }
      const lower = query.toLowerCase();
      const matches = productsList.filter(
        (p) =>
          p.name?.toLowerCase().includes(lower) ||
          p.sku?.toLowerCase().includes(lower)
      );
      updateLine(lineIdx, { _productResults: matches.slice(0, 10), _showProductDropdown: matches.length > 0 });
    },
    [productsList] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selectProduct = (lineIdx, product) => {
    const updates = {
      product,
      productSearch: product.name || '',
      description: product.description || '',
      unitPrice: product.unitPrice ?? product.price ?? 0,
      taxes: product.taxes?.map((t) => (typeof t === 'object' ? t._id : t)) || [],
      _productResults: [],
      _showProductDropdown: false,
    };
    updateLine(lineIdx, updates);
  };

  // ── Line items helpers ──
  const updateLine = (idx, updates) => {
    setForm((f) => {
      const lines = [...f.lineItems];
      lines[idx] = { ...lines[idx], ...updates };
      return { ...f, lineItems: lines };
    });
  };

  const addLine = () => {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, emptyLine()] }));
  };

  const removeLine = (idx) => {
    setForm((f) => {
      if (f.lineItems.length <= 1) return f;
      return { ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) };
    });
  };

  // ── Totals calculation ──
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const line of form.lineItems) {
      const base = line.quantity * line.unitPrice;
      const discount = base * (line.discountPercent / 100);
      subtotal += base;
      totalDiscount += discount;
      totalTax += calcLineTax(line, taxesList);
    }

    const total = subtotal - totalDiscount + totalTax;
    return { subtotal, totalDiscount, totalTax, total };
  }, [form.lineItems, taxesList]);

  // ── Tax toggle for a line ──
  const toggleLineTax = (lineIdx, taxId) => {
    setForm((f) => {
      const lines = [...f.lineItems];
      const line = { ...lines[lineIdx] };
      const idx = line.taxes.indexOf(taxId);
      if (idx >= 0) {
        line.taxes = line.taxes.filter((t) => t !== taxId);
      } else {
        line.taxes = [...line.taxes, taxId];
      }
      lines[lineIdx] = line;
      return { ...f, lineItems: lines };
    });
  };

  // ── Build payload ──
  const buildPayload = () => {
    return {
      contactId: form.customer?._id || null,
      date: form.invoiceDate,
      dueDate: form.dueDate,
      paymentTermId: form.paymentTerms || undefined,
      currency: form.currency,
      lines: form.lineItems.filter(li => li.description || li.unitPrice).map((li) => ({
        productId: li.product?._id || li.product || undefined,
        description: li.description,
        quantity: Number(li.quantity) || 1,
        unitPrice: Number(li.unitPrice) || 0,
        discount: Number(li.discountPercent) || 0,
        taxIds: li.taxes || [],
      })),
      notes: form.notes,
      internalNotes: form.internalNotes,
      isRecurring: form.isRecurring,
      recurringFrequency: form.isRecurring ? form.recurringFrequency : undefined,
      recurringEndDate: form.isRecurring && form.recurringEndDate ? form.recurringEndDate : undefined,
    };
  };

  // ── Submit ──
  const handleSubmit = async (andSend = false) => {
    if (!form.customer && !form.customerSearch) {
      showToast('Please enter a customer name or select a contact', 'error');
      return;
    }
    if (!form.invoiceDate) {
      showToast('Invoice date is required', 'error');
      return;
    }
    if (form.lineItems.every((li) => !li.description && !li.unitPrice)) {
      showToast('Add at least one line item', 'error');
      return;
    }

    try {
      setSaving(true);
      setSendAfterSave(andSend);
      const payload = buildPayload();

      let savedInvoice;
      if (isEdit) {
        const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, payload);
        savedInvoice = res?.invoice;
        showToast('Invoice updated');
      } else {
        const res = await invoicingApi.createInvoice(orgSlug, payload);
        savedInvoice = res?.invoice;
        showToast('Invoice created');
      }

      if (andSend && savedInvoice?._id) {
        try {
          await invoicingApi.sendInvoice(orgSlug, savedInvoice._id);
          showToast('Invoice sent');
        } catch (err) {
          showToast('Invoice saved but sending failed', 'error');
        }
      }

      navigate(
        orgPath(`/invoicing/invoices/${savedInvoice?._id || invoiceId || ''}`)
      );
    } catch (err) {
      showToast(err.message || 'Failed to save invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Payment terms change => auto-compute due date ──
  const handlePaymentTermsChange = (termId) => {
    setForm((f) => {
      const term = paymentTermsList.find((t) => t._id === termId);
      let dueDate = f.dueDate;
      if (term?.days != null && f.invoiceDate) {
        const d = new Date(f.invoiceDate);
        d.setDate(d.getDate() + term.days);
        dueDate = d.toISOString().slice(0, 10);
      }
      return { ...f, paymentTerms: termId, dueDate };
    });
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-rivvra-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(orgPath('/invoicing/invoices'))}
            className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">
              {isEdit ? 'Edit Invoice' : 'New Invoice'}
            </h1>
            <p className="text-sm text-dark-400">
              {isEdit ? 'Update invoice details' : 'Create a new invoice'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* ── Customer & Dates Card ── */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
              Invoice Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Customer search */}
              <div className="lg:col-span-2 relative" ref={contactDropdownRef}>
                <label className={labelCls}>
                  Customer <span className="text-red-400">*</span>
                </label>
                {form.customer ? (
                  <div className="flex items-center gap-2 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">
                        {form.customer.name || form.customer.company || form.customer.email}
                      </p>
                      {form.customer.email && form.customer.name && (
                        <p className="text-xs text-dark-400 truncate">{form.customer.email}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearContact}
                      className="text-dark-400 hover:text-red-400 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                    <input
                      type="text"
                      value={form.customerSearch}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, customerSearch: e.target.value }));
                        searchContacts(e.target.value);
                      }}
                      placeholder="Search contacts by name, email, or company..."
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                )}
                {/* Dropdown */}
                {showContactDropdown && contactResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {contactResults.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => selectContact(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-dark-700 transition-colors border-b border-dark-700/50 last:border-0"
                      >
                        <p className="text-sm text-white">
                          {c.name || c.company || 'Unnamed'}
                        </p>
                        <p className="text-xs text-dark-400">
                          {[c.email, c.company].filter(Boolean).join(' - ')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Currency */}
              <div>
                <label className={labelCls}>Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className={inputCls}
                >
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="AUD">AUD - Australian Dollar</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                  <option value="SGD">SGD - Singapore Dollar</option>
                  <option value="AED">AED - UAE Dirham</option>
                </select>
              </div>

              {/* Invoice date */}
              <div>
                <label className={labelCls}>
                  Invoice Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {/* Payment terms */}
              <div>
                <label className={labelCls}>Payment Terms</label>
                <select
                  value={form.paymentTerms}
                  onChange={(e) => handlePaymentTermsChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select terms...</option>
                  {paymentTermsList.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due date */}
              <div>
                <label className={labelCls}>Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* ── Line Items ── */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
                Line Items
              </h2>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1.5 text-sm text-rivvra-500 hover:text-rivvra-400 transition-colors"
              >
                <Plus size={16} />
                Add Line
              </button>
            </div>

            {/* Header row (desktop) */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-2 mb-2 px-1">
              <div className="col-span-3 text-xs font-medium text-dark-400 uppercase">Product</div>
              <div className="col-span-2 text-xs font-medium text-dark-400 uppercase">Description</div>
              <div className="col-span-1 text-xs font-medium text-dark-400 uppercase">Qty</div>
              <div className="col-span-1 text-xs font-medium text-dark-400 uppercase">Unit Price</div>
              <div className="col-span-1 text-xs font-medium text-dark-400 uppercase">Disc %</div>
              <div className="col-span-2 text-xs font-medium text-dark-400 uppercase">Tax</div>
              <div className="col-span-1 text-xs font-medium text-dark-400 uppercase text-right">Total</div>
              <div className="col-span-1" />
            </div>

            {/* Lines */}
            <div className="space-y-3">
              {form.lineItems.map((line, idx) => (
                <LineItemRow
                  key={line._key}
                  line={line}
                  idx={idx}
                  taxesList={taxesList}
                  updateLine={updateLine}
                  removeLine={removeLine}
                  canRemove={form.lineItems.length > 1}
                  searchProducts={searchProducts}
                  selectProduct={selectProduct}
                  toggleLineTax={toggleLineTax}
                />
              ))}
            </div>

            {/* Totals */}
            <div className="mt-6 border-t border-dark-700 pt-4">
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Subtotal</span>
                    <span className="text-white font-medium">
                      {form.currency} {totals.subtotal.toFixed(2)}
                    </span>
                  </div>
                  {totals.totalDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Discount</span>
                      <span className="text-amber-400 font-medium">
                        -{form.currency} {totals.totalDiscount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {totals.totalTax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Tax</span>
                      <span className="text-white font-medium">
                        {form.currency} {totals.totalTax.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold border-t border-dark-600 pt-2">
                    <span className="text-white">Total</span>
                    <span className="text-rivvra-400">
                      {form.currency} {totals.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
              Notes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Notes (visible to customer)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Payment instructions, thank you note, etc."
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Internal Notes</label>
                <textarea
                  value={form.internalNotes}
                  onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
                  rows={3}
                  placeholder="Internal reference only, not shown on invoice..."
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* ── Recurring ── */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
                Recurring Invoice
              </h2>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.isRecurring ? 'bg-rivvra-500' : 'bg-dark-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    form.isRecurring ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {form.isRecurring && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Frequency</label>
                  <select
                    value={form.recurringFrequency}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, recurringFrequency: e.target.value }))
                    }
                    className={inputCls}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  <input
                    type="date"
                    value={form.recurringEndDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, recurringEndDate: e.target.value }))
                    }
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-end pb-8">
            <button
              type="button"
              onClick={() => navigate(orgPath('/invoicing/invoices'))}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit(false)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-white transition-colors disabled:opacity-50"
            >
              {saving && !sendAfterSave ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save as Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              {saving && sendAfterSave ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              Save & Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LineItemRow — single editable line item
// ============================================================================

function LineItemRow({
  line,
  idx,
  taxesList,
  updateLine,
  removeLine,
  canRemove,
  searchProducts,
  selectProduct,
  toggleLineTax,
}) {
  const lineTotal = calcLineTotal(line);
  const lineDropdownRef = useRef(null);
  const [showTaxDropdown, setShowTaxDropdown] = useState(false);
  const taxDropdownRef = useRef(null);

  // Close product dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (lineDropdownRef.current && !lineDropdownRef.current.contains(e.target)) {
        updateLine(idx, { _showProductDropdown: false });
      }
      if (taxDropdownRef.current && !taxDropdownRef.current.contains(e.target)) {
        setShowTaxDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTaxNames = taxesList
    .filter((t) => line.taxes.includes(t._id))
    .map((t) => t.name);

  return (
    <div className="lg:grid lg:grid-cols-12 gap-2 items-start bg-dark-800/50 rounded-lg p-3 lg:p-2 space-y-3 lg:space-y-0">
      {/* Product search */}
      <div className="col-span-3 relative" ref={lineDropdownRef}>
        <label className="lg:hidden text-xs text-dark-400 mb-1 block">Product</label>
        <div className="relative">
          <input
            type="text"
            value={line.productSearch}
            onChange={(e) => {
              updateLine(idx, { productSearch: e.target.value });
              searchProducts(e.target.value, idx);
            }}
            placeholder="Search product..."
            className={smallInputCls + ' w-full'}
          />
        </div>
        {line._showProductDropdown && line._productResults?.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {line._productResults.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => selectProduct(idx, p)}
                className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors text-sm text-white border-b border-dark-700/50 last:border-0"
              >
                <span>{p.name}</span>
                {p.unitPrice != null && (
                  <span className="ml-2 text-dark-400">@ {p.unitPrice}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="col-span-2">
        <label className="lg:hidden text-xs text-dark-400 mb-1 block">Description</label>
        <input
          type="text"
          value={line.description}
          onChange={(e) => updateLine(idx, { description: e.target.value })}
          placeholder="Description"
          className={smallInputCls + ' w-full'}
        />
      </div>

      {/* Quantity */}
      <div className="col-span-1">
        <label className="lg:hidden text-xs text-dark-400 mb-1 block">Qty</label>
        <input
          type="number"
          min="0"
          step="any"
          value={line.quantity}
          onChange={(e) => updateLine(idx, { quantity: e.target.value })}
          className={smallInputCls + ' w-full'}
        />
      </div>

      {/* Unit Price */}
      <div className="col-span-1">
        <label className="lg:hidden text-xs text-dark-400 mb-1 block">Unit Price</label>
        <input
          type="number"
          min="0"
          step="any"
          value={line.unitPrice}
          onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
          className={smallInputCls + ' w-full'}
        />
      </div>

      {/* Discount % */}
      <div className="col-span-1">
        <label className="lg:hidden text-xs text-dark-400 mb-1 block">Disc %</label>
        <input
          type="number"
          min="0"
          max="100"
          step="any"
          value={line.discountPercent}
          onChange={(e) => updateLine(idx, { discountPercent: e.target.value })}
          className={smallInputCls + ' w-full'}
        />
      </div>

      {/* Tax multi-select */}
      <div className="col-span-2 relative" ref={taxDropdownRef}>
        <label className="lg:hidden text-xs text-dark-400 mb-1 block">Tax</label>
        <button
          type="button"
          onClick={() => setShowTaxDropdown(!showTaxDropdown)}
          className={`${smallInputCls} w-full text-left flex items-center justify-between gap-1`}
        >
          <span className="truncate text-sm">
            {selectedTaxNames.length > 0 ? selectedTaxNames.join(', ') : 'Select taxes'}
          </span>
          <ChevronDown size={14} className="text-dark-400 shrink-0" />
        </button>
        {showTaxDropdown && taxesList.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {taxesList.map((tax) => {
              const checked = line.taxes.includes(tax._id);
              return (
                <button
                  key={tax._id}
                  type="button"
                  onClick={() => toggleLineTax(idx, tax._id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-dark-700 transition-colors text-sm text-white border-b border-dark-700/50 last:border-0"
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      checked
                        ? 'bg-rivvra-500 border-rivvra-500'
                        : 'border-dark-500'
                    }`}
                  >
                    {checked && <Check size={12} />}
                  </span>
                  <span>
                    {tax.name} ({tax.rate}%)
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Line total */}
      <div className="col-span-1 flex items-center justify-end">
        <label className="lg:hidden text-xs text-dark-400 mr-2">Total:</label>
        <span className="text-sm text-white font-medium">{lineTotal.toFixed(2)}</span>
      </div>

      {/* Remove */}
      <div className="col-span-1 flex items-center justify-center">
        {canRemove && (
          <button
            type="button"
            onClick={() => removeLine(idx)}
            className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-dark-700 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
