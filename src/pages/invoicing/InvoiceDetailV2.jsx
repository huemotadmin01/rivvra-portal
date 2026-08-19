// ============================================================================
// InvoiceDetailV2.jsx — Odoo-style invoice detail with inline editing, on ds
// ============================================================================
//
// The largest page in the portal (5,189 legacy lines) and the one that decides
// what a customer is billed. Nothing about the arithmetic moves.
//
// Spliced in byte-identically, in full:
//
//   • `localTotals` — the invoice subtotal / tax / total / discount, including
//     the inclusive-vs-exclusive tax branch and the four `Math.round(x*100)/100`
//     roundings. A single transposed character here changes an invoice.
//   • `buildTaxBreakdown` — allocates a multi-tax line's amount by rate-weight
//     so the per-type rows (CGST/SGST/IGST/TDS/CESS) still sum to the invoice's
//     tax total, with the rich-taxes-vs-taxIds fallback for Odoo-migrated rows.
//   • `calculateBillingRate` and the two 6-decimal unit-price roundings
//     (`Math.round(rate * 1000000) / 1000000`).
//   • Every fetch, action handler, attachment handler, and the AI re-extract
//     flow, plus the debounced auto-save.
//   • Each modal's own money: the TDS computation and `remaining` in
//     `RecordPaymentModal`, and `remaining` in `EmployeeBillRecordPaymentModal`.
//
// The legacy file's own lint problems come across with the code that causes
// them, including two React Compiler diagnostics (`Cannot access refs during
// render` in `useDebounce`, and a synchronous `setState` inside an effect).
// Both are pre-existing and neither is silenced.
//
// Not triggered: post, send, email, record payment, credit note, delete,
// archive, e-invoice generate/cancel, GST hold.
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useBreadcrumbContext } from '../../context/BreadcrumbContext';
import invoicingApi from '../../utils/invoicingApi';
import contactsApi from '../../utils/contactsApi';
import api from '../../utils/api';
import { formatCurrency } from '../../utils/formatCurrency';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import { validateGstin } from '../../utils/gstin';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import ActivityPanel from '../../components/shared/ActivityPanel';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import RecordMeta from '../../components/shared/RecordMeta';
import VendorChoiceModal from './VendorChoiceModal';
import {
  ArrowLeft, Send, Trash2, Download, Mail, Copy, Archive, ArchiveRestore,
  CreditCard, XCircle, RotateCcw, Loader2, X, FileText,
  AlertTriangle, Check, Info, Upload, Eye, Paperclip,
  User, Calendar, Clock, RefreshCw, BellRing, Edit3,
  Pencil, Plus, Search, Package, ShieldCheck, Sparkles, CheckCircle2,
} from 'lucide-react';
import {
  Panel, Chip, Button, Input, Select, Textarea, Field,
  Modal, Callout, EmptyState, PageSpinner, StageBar,
} from '../../components/ds';

// ── Helpers ──

function formatDate(d, cc = 'IN') {
  if (!d) return '-';
  const locale = cc === 'US' ? 'en-US' : 'en-IN';
  return new Date(d).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Status stepper config ──
const STATUS_STEPS = ['draft', 'posted', 'paid'];

function getStepIndex(status) {
  if (status === 'paid') return 2;
  if (status === 'posted' || status === 'overdue' || status === 'partial' || status === 'viewed') return 1;
  if (status === 'cancelled') return -1;
  return 0;
}

function getInvoiceTypeLabel(invoice) {
  if (invoice.type === 'credit_note' || invoice.isCreditNote) return 'Credit Note';
  if (invoice.type === 'vendor_bill' || invoice.isVendorBill) return 'Vendor Bill';
  return 'Customer Invoice';
}

// Route back to the list page that matches this document's type so a bill
// doesn't land on /invoicing/invoices (and vice versa).
function listUrlForDoc(invoice) {
  if (!invoice) return '/invoicing/invoices';
  const isBill = invoice.type === 'vendor_bill' || invoice.isVendorBill;
  if (isBill) {
    return invoice.journalCode === 'EMPBI'
      ? '/invoicing/employee-bills'
      : '/invoicing/bills';
  }
  return '/invoicing/invoices';
}

const GST_TREATMENTS = [
  'Registered Business - Regular',
  'Registered Business - Composition',
  'Unregistered Business',
  'Consumer',
  'Overseas',
  'SEZ',
];

// Shared platform list (INR/USD/CAD/AUD/SGD/EUR/GBP/AED) — single source of
// truth in utils/currency.js, kept in sync with the API's SUPPORTED_CURRENCIES.
const CURRENCIES = SUPPORTED_CURRENCIES;

// ── Debounce hook ──
function useDebounce(callback, delay) {
  const timerRef = useRef(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debounced = useCallback((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
  }, [delay]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return debounced;
}

// ============================================================================
// EditableField — click-to-edit field for draft invoices
// ============================================================================

export default function InvoiceDetailV2() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const handleScoped404 = useCompanyScoped404('invoice');
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Yellow "AI-filled, verify" banner is opt-in via ?ai=1 on the URL
  // (set by VendorBillList after a PDF extraction). Dismissed on first edit.
  const [showAiBanner, setShowAiBanner] = useState(searchParams.get('ai') === '1');

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeTab, setActiveTab] = useState('lines');

  // Live GSTIN status (active/cancelled) — on-demand IRP lookup
  const [gstinLive, setGstinLive] = useState(null);      // { status, source, details? }
  const [gstinLiveLoading, setGstinLiveLoading] = useState(false);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);

  // E-Invoice
  const [eInvoiceStep, setEInvoiceStep] = useState(null); // null | 'validating' | 'submitting' | 'done' | 'error'
  const [eInvoiceError, setEInvoiceError] = useState(null);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // AI re-extract (vendor bill draft only)
  const aiFileInputRef = useRef(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  // After a re-extract on an UNLINKED draft, hold the extracted vendor so we can
  // offer Create / Match / Leave-blank — the same prompt the list drop-zone shows.
  const [reExtractVendor, setReExtractVendor] = useState(null); // { extracted } | null

  // ── Inline editing state ──
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState(null); // flash "Saved" indicator
  const [paymentTermsList, setPaymentTermsList] = useState([]);
  const [allTaxes, setAllTaxes] = useState([]);
  const [previewNumber, setPreviewNumber] = useState(null);
  const [customerDefaultProduct, setCustomerDefaultProduct] = useState(null); // { _id, name }
  // VP_GEN system product cached on mount when the invoice is a vendor
  // bill — used as the new-line default so admins clicking "Add a line"
  // get Product=Vendor Payouts + Qty=1 pre-filled (per the Q3/B decision
  // for the vendor-bill rework).  HSN and Tax stay blank to force an
  // explicit choice.
  const [vendorBillDefaultProduct, setVendorBillDefaultProduct] = useState(null);
  const [consultantRates, setConsultantRates] = useState({}); // { consultantId: clientBillingRate }
  const [expenseCategories, setExpenseCategories] = useState([]); // vendor bill line categorization
  const [tdsConfigs, setTdsConfigs] = useState([]); // vendor bill TDS sections
  const [journals, setJournals] = useState([]); // journals of matching type for DRAFT journal change

  const isDraft = invoice?.status === 'draft';
  // Real Vendor Bills are identified by type, NOT the journal: a vendor bill
  // created before a BILL/purchase journal was configured has journalCode=null
  // and would otherwise be misclassified as a customer invoice (e.g. wrongly
  // forced to fill Start/End dates on confirm). Employee Bills (EMPBI) share
  // type='vendor_bill' but are reimbursement vouchers, so exclude them here.
  const isVendorBill = invoice?.type === 'vendor_bill' && invoice?.journalCode !== 'EMPBI';
  // Employee Bills are reimbursement vouchers, not vendor invoices.  The
  // line-item table renders a different column set (Date / Merchant / Payment
  // Mode / Receipt) instead of the staff-aug-style Consultant / Start / End
  // / Rate columns — see Phase 4 in the plan.
  const isEmployeeBill = invoice?.journalCode === 'EMPBI';

  // Vendor bills and employee bills share the /invoicing/invoices/:id route
  // with customer invoices; override the parent crumb so it reads the right
  // list name AND links back to the right list page.
  const { setDetailLabel, clearDetailLabel } = useBreadcrumbContext();
  useEffect(() => {
    if (!invoice?._id) return;
    const parent = '/invoicing/invoices';
    const jc = invoice?.journalCode;
    if (jc === 'BILL') {
      setDetailLabel(parent, 'Vendor Bills', { pathOverride: '/invoicing/bills' });
      return () => clearDetailLabel(parent);
    }
    if (jc === 'EMPBI') {
      setDetailLabel(parent, 'Employee Bills', { pathOverride: '/invoicing/employee-bills' });
      return () => clearDetailLabel(parent);
    }
  }, [invoice?.journalCode, invoice?._id, setDetailLabel, clearDetailLabel]);

  // Prefer the server-normalised companyCountryCode (added 2026-05-24 to fix
  // the US-vendor-bill GST gate). Fall back to parsing companyCountry only
  // when the API hasn't been redeployed yet.
  const countryCode = (() => {
    const code = String(invoice?.companyCountryCode || '').trim().toUpperCase();
    if (code === 'IN' || code === 'US' || code === 'CA') return code;
    const c = String(invoice?.companyCountry || '').trim().toLowerCase();
    if (['us', 'usa', 'united states', 'united states of america'].includes(c)) return 'US';
    if (['ca', 'canada'].includes(c)) return 'CA';
    return 'IN';
  })();
  const isIndia = countryCode === 'IN';

  // Sync editForm when invoice changes
  useEffect(() => {
    if (invoice) {
      setEditForm({
        contactId: invoice.contactId,
        contactName: invoice.contactName || invoice.customer?.name || '',
        contactEmail: invoice.contactEmail || invoice.customer?.email || '',
        contactAddress: invoice.contactAddress || invoice.customer?.address || '',
        invoiceDate: (invoice.date || invoice.invoiceDate || '')?.split?.('T')?.[0] || '',
        date: (invoice.date || invoice.invoiceDate || '')?.split?.('T')?.[0] || '',
        dueDate: (invoice.dueDate || '')?.split?.('T')?.[0] || '',
        paymentTermId: invoice.paymentTermId || (typeof invoice.paymentTerms === 'object' ? invoice.paymentTerms?._id : '') || '',
        currency: invoice.currency || 'INR',
        lines: (invoice.lines || invoice.lineItems || []).map((li, i) => ({
          _id: li._id,
          productId: li.productId || li.product?._id || li.product?.id || '',
          productName: li.product?.name || li.productName || '',
          description: li.description || '',
          consultantId: li.consultantId || '',
          consultantName: li.consultantName || '',
          startDate: li.startDate?.split?.('T')?.[0] || li.startDate || '',
          endDate: li.endDate?.split?.('T')?.[0] || li.endDate || '',
          quantity: li.quantity ?? 1,
          unitPrice: li.unitPrice ?? 0,
          lineCurrency: invoice.currency || li.lineCurrency || 'INR',
          taxIds: (li.taxIds || li.taxes || []).map(t => typeof t === 'object' ? (t._id || t.id) : t),
          taxNames: (li.taxIds || li.taxes || []).map(t => typeof t === 'object' ? t.name : ''),
          discount: li.discount ?? 0,
          expenseCategory: li.expenseCategory || '',
        })),
        notes: invoice.notes || '',
        internalNotes: invoice.internalNotes || '',
        gstTreatment: invoice.gstTreatment || '',
        placeOfSupply: invoice.placeOfSupply || '',
        customerGstin: invoice.customerGstin || '',
        vendorGstin: invoice.vendorGstin || '',
        vendorInvoiceNumber: invoice.vendorInvoiceNumber || '',
        tdsConfigId: invoice.tdsConfigId || '',
        tdsSection: invoice.tdsSection || '',
        tdsRate: invoice.tdsRate ?? 0,
        journalId: invoice.journalId || '',
        journalCode: invoice.journalCode || '',
        journalName: invoice.journalName || '',
      });
    }
  }, [invoice]);

  // Fetch payment terms for dropdown
  useEffect(() => {
    if (orgSlug) {
      invoicingApi.listPaymentTerms(orgSlug)
        .then(res => setPaymentTermsList(res?.paymentTerms || res?.data || []))
        .catch(() => {});
      invoicingApi.listTaxes(orgSlug).then(r => setAllTaxes(r?.taxes || [])).catch(() => {});
    }
  }, [orgSlug]);

  // Vendor-bill-only: fetch expense categories + TDS configs
  useEffect(() => {
    if (!orgSlug || !isVendorBill) return;
    invoicingApi.listExpenseCategories(orgSlug)
      .then(res => setExpenseCategories(res?.categories || []))
      .catch(() => {});
    invoicingApi.listTdsConfig(orgSlug, { active: 'true' })
      .then(res => setTdsConfigs(res?.rows || res?.configs || []))
      .catch(() => {});
  }, [orgSlug, isVendorBill]);

  // Fetch active journals of the matching type so users can correct the
  // journal on a DRAFT invoice. listJournals is scoped to the current company
  // via the X-Company-Id header, so this is already per-company correct.
  useEffect(() => {
    if (!orgSlug || !isDraft || !invoice?.type) { setJournals([]); return; }
    const journalType = invoice.type === 'vendor_bill' ? 'purchase' : 'sale';
    invoicingApi.listJournals(orgSlug, { active: 'true', type: journalType })
      .then(res => setJournals(res?.journals || res?.data || []))
      .catch(() => setJournals([]));
  }, [orgSlug, isDraft, invoice?.type]);

  // Fetch preview number for drafts without a number
  useEffect(() => {
    if (!orgSlug || !invoice || invoice.number || invoice.status !== 'draft') return;
    const params = { type: invoice.type || 'customer_invoice' };
    if (invoice.journalId) params.journalId = invoice.journalId;
    if (invoice.date) params.date = new Date(invoice.date).toISOString().split('T')[0];
    invoicingApi.previewNumber(orgSlug, params)
      .then(res => { if (res?.previewNumber) setPreviewNumber(res.previewNumber); })
      .catch(() => {});
  }, [orgSlug, invoice?.number, invoice?.status, invoice?.journalId, invoice?.date, invoice?.type]);

  // Fetch customer's default product when invoice has a contact
  useEffect(() => {
    if (!orgSlug || !invoice?.contactId) { setCustomerDefaultProduct(null); return; }
    (async () => {
      try {
        const cRes = await contactsApi.get(orgSlug, invoice.contactId);
        const contact = cRes?.contact;
        if (contact?.defaultProductId) {
          const pRes = await invoicingApi.listProducts(orgSlug, {});
          const product = (pRes?.products || []).find(p => p._id === contact.defaultProductId);
          if (product) {
            setCustomerDefaultProduct({ _id: product._id, name: product.name, internalRef: product.internalRef || '', hsnSacCode: product.hsnSacCode || '', unit: product.unit || '', defaultTaxIds: product.defaultTaxIds || product.taxIds || [] });
            return;
          }
        }
        setCustomerDefaultProduct(null);
      } catch { setCustomerDefaultProduct(null); }
    })();
  }, [orgSlug, invoice?.contactId]);

  // Fetch VP_GEN once for vendor bills so "Add a line" can pre-fill
  // Product + Qty without making admins pick from the dropdown every
  // time.  Skipped on customer invoices and EMPBI bills.  HSN + Tax
  // are deliberately not inherited from the product (per Q3/B) so admins
  // make those choices explicitly.
  useEffect(() => {
    if (!orgSlug || !isVendorBill) { setVendorBillDefaultProduct(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const pRes = await invoicingApi.listProducts(orgSlug, { search: 'VP_GEN' });
        const product = (pRes?.products || []).find(
          (p) => p.internalRef === 'VP_GEN' || p.sku === 'VP_GEN'
        );
        if (cancelled) return;
        if (product) {
          setVendorBillDefaultProduct({ _id: product._id, name: product.name });
        } else {
          setVendorBillDefaultProduct(null);
        }
      } catch { if (!cancelled) setVendorBillDefaultProduct(null); }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, isVendorBill]);

  // ── Auto-save with debounce ──
  const saveToApi = useCallback(async (data) => {
    if (!orgSlug || !invoiceId || !isDraft) return;
    try {
      setSaving(true);
      const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, data);
      // Update local invoice with response if available
      if (res?.invoice) {
        setInvoice(prev => ({ ...prev, ...res.invoice, payments: prev?.payments || [] }));
      }
      setSavedField('all');
      setTimeout(() => setSavedField(null), 1500);
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }, [orgSlug, invoiceId, isDraft, showToast]);

  const debouncedSave = useDebounce(saveToApi, 500);

  // Save a single field immediately
  const saveField = useCallback(async (field, value) => {
    if (!isDraft) return;
    const updates = { [field]: value };

    // Auto-calculate due date when invoice date or payment terms change
    if (field === 'date' || field === 'invoiceDate') {
      const termId = editForm.paymentTermId || invoice?.paymentTermId;
      if (termId && paymentTermsList.length) {
        const term = paymentTermsList.find(t => t._id === termId);
        if (term?.days != null) {
          const d = new Date(value);
          d.setDate(d.getDate() + term.days);
          updates.dueDate = d.toISOString().split('T')[0];
        }
      }
    }
    if (field === 'paymentTermId') {
      const invDate = editForm.invoiceDate || editForm.date || invoice?.date;
      if (invDate && paymentTermsList.length) {
        const term = paymentTermsList.find(t => t._id === value);
        if (term?.days != null) {
          const d = new Date(invDate);
          d.setDate(d.getDate() + term.days);
          updates.dueDate = d.toISOString().split('T')[0];
        }
      }
    }

    if (field === 'currency') {
      // Sync lineCurrency on all lines when invoice currency changes
      const updatedLines = editForm.lines.map(l => ({ ...l, lineCurrency: value }));
      setEditForm(prev => ({ ...prev, ...updates, lines: updatedLines }));
      saveLines(updatedLines);
    } else {
      setEditForm(prev => ({ ...prev, ...updates }));
    }
    try {
      setSaving(true);
      const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, updates);
      if (res?.invoice) {
        setInvoice(prev => ({ ...prev, ...res.invoice, payments: prev?.payments || [] }));
      }
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }, [orgSlug, invoiceId, isDraft, showToast, editForm, invoice, paymentTermsList]);

  // Save lines (debounced)
  const saveLines = useCallback((lines) => {
    const cleanLines = lines.map(l => ({
      _id: l._id,
      productId: l.productId || undefined,
      productName: l.productName || undefined,
      internalRef: l.internalRef || undefined,
      hsnSacCode: l.hsnSacCode || undefined,
      unit: l.unit || undefined,
      description: l.description,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      taxIds: l.taxIds || [],
      discount: Number(l.discount) || 0,
      consultantId: l.consultantId || undefined,
      consultantName: l.consultantName || undefined,
      startDate: l.startDate || undefined,
      endDate: l.endDate || undefined,
      lineCurrency: l.lineCurrency || undefined,
      expenseCategory: l.expenseCategory || undefined,
    }));
    debouncedSave({ lines: cleanLines });
  }, [debouncedSave]);

  // Handle contact selection
  const handleContactSelect = useCallback(async (contact) => {
    const cId = contact._id || contact.id;
    const cName = contact.name || contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    const cEmail = contact.email || '';

    const updates = {
      contactId: cId,
      contactName: cName,
      contactEmail: cEmail,
    };

    // Auto-populate fields from contact
    if (contact.gstTreatment) updates.gstTreatment = contact.gstTreatment;
    if (contact.gstin) {
      // On a vendor bill the contact IS the vendor, so its GSTIN is the vendor
      // GSTIN (drives GSTR-2B reconciliation). On a customer invoice it's the
      // customer GSTIN.
      if (isVendorBill) updates.vendorGstin = contact.gstin;
      else updates.customerGstin = contact.gstin;
    }
    if (contact.address) updates.contactAddress = contact.address;
    if (contact.placeOfSupply) updates.placeOfSupply = contact.placeOfSupply;
    if (contact.defaultPaymentTermId) updates.paymentTermId = contact.defaultPaymentTermId;
    // Currency: use contact default, or infer INR for Indian addresses
    if (contact.defaultCurrency) {
      updates.currency = contact.defaultCurrency;
    } else if (contact.address?.country?.toLowerCase() === 'india' || contact.placeOfSupply || contact.gstin) {
      updates.currency = 'INR';
    }

    // Auto-populate product on all lines from contact's defaultProductId
    if (contact.defaultProductId) {
      try {
        const prodRes = await invoicingApi.listProducts(orgSlug, { search: '' });
        const product = (prodRes?.products || []).find(p => p._id === contact.defaultProductId);
        if (product) {
          updates.defaultProductId = product._id;
          updates.defaultProductName = product.name;
          updates.defaultProductRef = product.internalRef || '';
          updates.defaultProductHsn = product.hsnSacCode || '';
          updates.defaultProductUnit = product.unit || '';
          updates.defaultProductTaxIds = product.defaultTaxIds || product.taxIds || [];
          setCustomerDefaultProduct({ _id: product._id, name: product.name, internalRef: product.internalRef || '', hsnSacCode: product.hsnSacCode || '', unit: product.unit || '', defaultTaxIds: product.defaultTaxIds || product.taxIds || [] });
        }
      } catch {}
    } else {
      setCustomerDefaultProduct(null);
    }

    setEditForm(prev => {
      const updated = { ...prev, ...updates };
      // If product resolved, auto-fill on all lines
      if (updates.defaultProductId) {
        updated.lines = (prev.lines || []).map(line => ({
          ...line,
          productId: updates.defaultProductId,
          productName: updates.defaultProductName || '',
          internalRef: updates.defaultProductRef || '',
          hsnSacCode: updates.defaultProductHsn || '',
          unit: updates.defaultProductUnit || '',
          taxIds: (line.taxIds && line.taxIds.length) ? line.taxIds : (updates.defaultProductTaxIds || []),
        }));
      }
      return updated;
    });

    try {
      setSaving(true);
      // Build line updates with product if available
      const savePayload = { ...updates };
      if (updates.defaultProductId) {
        delete savePayload.defaultProductId;
        delete savePayload.defaultProductName;
        delete savePayload.defaultProductRef;
        delete savePayload.defaultProductHsn;
        delete savePayload.defaultProductUnit;
        delete savePayload.defaultProductTaxIds;
        // Update lines with product
        const currentLines = editForm.lines || invoice?.lines || [];
        savePayload.lines = currentLines.map(line => ({
          ...line,
          productId: updates.defaultProductId,
          productName: updates.defaultProductName || '',
          internalRef: updates.defaultProductRef || '',
          hsnSacCode: updates.defaultProductHsn || '',
          unit: updates.defaultProductUnit || '',
          taxIds: (line.taxIds && line.taxIds.length) ? line.taxIds : (updates.defaultProductTaxIds || []),
        }));
      }
      const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, savePayload);
      if (res?.invoice) {
        setInvoice(prev => ({ ...prev, ...res.invoice, payments: prev?.payments || [] }));
      }
      setSavedField('contact');
      setTimeout(() => setSavedField(null), 1500);
    } catch (err) {
      showToast(err.message || 'Failed to save contact', 'error');
    } finally {
      setSaving(false);
    }
  }, [orgSlug, invoiceId, showToast, editForm, invoice]);

  // Handle payment term change — auto-recalculate due date
  const handlePaymentTermChange = useCallback(async (field, value) => {
    // Calculate due date locally
    const invDate = editForm.invoiceDate || editForm.date || invoice?.date;
    const term = paymentTermsList.find(t => t._id === value);
    let newDueDate;
    if (invDate && term?.days != null) {
      const d = new Date(invDate);
      d.setDate(d.getDate() + term.days);
      newDueDate = d.toISOString().split('T')[0];
    }

    const updates = { paymentTermId: value };
    if (newDueDate) updates.dueDate = newDueDate;

    setEditForm(prev => ({ ...prev, paymentTermId: value, ...(newDueDate ? { dueDate: newDueDate } : {}) }));
    try {
      setSaving(true);
      const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, updates);
      if (res?.invoice) {
        setInvoice(prev => ({ ...prev, ...res.invoice, payments: prev?.payments || [] }));
        if (res.invoice.dueDate) {
          setEditForm(prev => ({ ...prev, dueDate: res.invoice.dueDate.split('T')[0] }));
        }
      }
      setSavedField('paymentTermId');
      setTimeout(() => setSavedField(null), 1500);
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
    // editForm + paymentTermsList were missing here, so the closure captured
    // their initial (empty) values and the due-date auto-calc never fired.
  }, [orgSlug, invoiceId, showToast, editForm, invoice, paymentTermsList]);

  // ── Line item helpers ──

  const addLine = useCallback(() => {
    setEditForm(prev => {
      // Default-product resolution order:
      //   1. Customer's `defaultProductId` (set on the contact) — full
      //      inheritance: product, HSN, unit, default taxes.  Customer-side
      //      preferences take priority because they're explicitly chosen
      //      per-relationship.
      //   2. VP_GEN system product (vendor bills only) — bare-bones fill:
      //      product + name only.  HSN and taxes stay blank per Q3/B so
      //      the admin makes an explicit choice (avoids accidentally
      //      booking a non-services bill at SAC 998513 / 18% IGST).
      //   3. Empty — for customer invoices without a contact-default,
      //      keeps the current "blank line" behaviour.
      const useVendorDefault = isVendorBill && !customerDefaultProduct && vendorBillDefaultProduct;
      const defaultTaxIds = customerDefaultProduct?.defaultTaxIds || customerDefaultProduct?.taxIds || [];
      const newLines = [...prev.lines, {
        productId: customerDefaultProduct?._id || (useVendorDefault ? vendorBillDefaultProduct._id : ''),
        productName: customerDefaultProduct?.name || (useVendorDefault ? vendorBillDefaultProduct.name : ''),
        internalRef: customerDefaultProduct?.internalRef || '',
        hsnSacCode: customerDefaultProduct?.hsnSacCode || '',
        unit: customerDefaultProduct?.unit || '',
        description: '',
        consultantId: '',
        consultantName: '',
        startDate: '',
        endDate: '',
        quantity: 1,
        unitPrice: 0,
        lineCurrency: prev.currency || invoice?.currency || 'INR',
        taxIds: defaultTaxIds,
        taxNames: [],
        discount: 0,
      }];
      return { ...prev, lines: newLines };
    });
  }, [invoice, customerDefaultProduct, isVendorBill, vendorBillDefaultProduct]);

  const removeLine = useCallback((index) => {
    setEditForm(prev => {
      const newLines = prev.lines.filter((_, i) => i !== index);
      setTimeout(() => saveLines(newLines), 0);
      return { ...prev, lines: newLines };
    });
  }, [saveLines]);

  const handleProductSelect = useCallback((index, product) => {
    setEditForm(prev => {
      const newLines = [...prev.lines];
      newLines[index] = {
        ...newLines[index],
        productId: product._id || product.id,
        productName: product.name || '',
        internalRef: product.internalRef || newLines[index].internalRef || '',
        hsnSacCode: product.hsnSacCode || newLines[index].hsnSacCode || '',
        unit: product.unit || newLines[index].unit || '',
        description: product.description || newLines[index].description || '',
        unitPrice: product.unitPrice ?? product.price ?? newLines[index].unitPrice,
        taxIds: product.defaultTaxIds || product.taxIds || newLines[index].taxIds || [],
      };
      setTimeout(() => saveLines(newLines), 0);
      return { ...prev, lines: newLines };
    });
  }, [saveLines]);

  // ── Billing rate calculation based on product + assignment + dates ──
  const calculateBillingRate = useCallback((line) => {
    const rate = line._clientBillingRate;
    if (!rate || !line.startDate || !line.endDate) return null;

    const start = new Date(line.startDate);
    const end = new Date(line.endDate);
    if (isNaN(start) || isNaN(end) || end < start) return null;

    // Use internalRef for reliable matching, fallback to name
    const ref = (line.internalRef || '').toUpperCase();
    const name = (line.productName || '').toLowerCase();

    const isMonthlyWD = ref === 'CONS-MONTH-WD' || name.includes('monthly-working day') || name.includes('month-wd');
    const isMonthly = !isMonthlyWD && (ref === 'CONS-MONTHLY' || name.includes('monthly'));
    const isHourly = ref === 'CONS-HOUR' || name.includes('hour');
    const isDaily = ref === 'CONS-DAY' || name.includes('day');

    if (isMonthlyWD) {
      const monthly = Number(rate.monthly) || 0;
      if (!monthly) return null;
      const year = start.getFullYear();
      const month = start.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let workingDays = 0;
      for (let i = 1; i <= daysInMonth; i++) {
        if (new Date(year, month, i).getDay() % 6 !== 0) workingDays++;
      }
      return workingDays > 0 ? monthly / workingDays : null;
    }
    if (isMonthly) {
      const monthly = Number(rate.monthly) || 0;
      if (!monthly) return null;
      return monthly / new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    }
    if (isHourly) {
      return Number(rate.hourly) || null;
    }
    if (isDaily) {
      return Number(rate.daily) || null;
    }
    // Other products: no auto-calculation, stays 0
    return null;
  }, []);

  const handleConsultantSelect = useCallback((index, emp) => {
    // Store the billing rate in the map (keyed by consultantId) so it survives editForm resets
    if (emp.clientBillingRate && emp._id) {
      setConsultantRates(prev => ({ ...prev, [emp._id]: emp.clientBillingRate }));
    }
    setEditForm(prev => {
      const newLines = [...prev.lines];
      const line = {
        ...newLines[index],
        consultantId: emp._id,
        consultantName: emp.fullName,
      };
      // Auto-calculate billing rate if all required fields are present
      const rateData = emp.clientBillingRate || null;
      if (rateData) {
        const calcLine = { ...line, _clientBillingRate: rateData };
        const rate = calculateBillingRate(calcLine);
        if (rate !== null) {
          line.unitPrice = Math.round(rate * 1000000) / 1000000;
        }
      }
      newLines[index] = line;
      setTimeout(() => saveLines(newLines), 0);
      return { ...prev, lines: newLines };
    });
  }, [saveLines, calculateBillingRate]);

  // Recalculate billing rate when start/end date changes (if consultant has assignment rate)
  const updateLine = useCallback((index, field, value) => {
    setEditForm(prev => {
      const newLines = [...prev.lines];
      const updatedLine = { ...newLines[index], [field]: value };
      if (field === 'taxIds') {
        updatedLine.taxNames = value.map(id => {
          const tax = allTaxes.find(t => (t._id || t.id) === id);
          return tax?.name || '';
        }).filter(Boolean);
      }
      // Recalculate billing rate when dates change and consultant has an assignment rate
      if ((field === 'startDate' || field === 'endDate') && updatedLine.consultantId) {
        const rateData = consultantRates[updatedLine.consultantId];
        if (rateData) {
          const calcLine = { ...updatedLine, _clientBillingRate: rateData };
          const rate = calculateBillingRate(calcLine);
          if (rate !== null) {
            updatedLine.unitPrice = Math.round(rate * 1000000) / 1000000;
          }
        }
      }
      newLines[index] = updatedLine;
      setTimeout(() => saveLines(newLines), 0);
      return { ...prev, lines: newLines };
    });
  }, [saveLines, allTaxes, calculateBillingRate, consultantRates]);

  // Calculate local totals
  const localTotals = useMemo(() => {
    const lines = editForm.lines || [];
    let subtotal = 0;
    let taxTotal = 0;
    lines.forEach(l => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const discPct = Number(l.discount) || 0;
      const lineSubtotal = qty * price * (1 - discPct / 100);
      subtotal += lineSubtotal;
      // Estimate tax from loaded taxes
      (l.taxIds || []).forEach(taxId => {
        const tax = allTaxes.find(t => (t._id || t.id) === taxId);
        if (tax?.rate) {
          if (tax.inclusive) {
            taxTotal += lineSubtotal - (lineSubtotal / (1 + tax.rate / 100));
          } else {
            taxTotal += lineSubtotal * (tax.rate / 100);
          }
        }
      });
    });
    const total = subtotal + taxTotal;
    const discountTotal = lines.reduce((s, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const discPct = Number(l.discount) || 0;
      return s + qty * price * (discPct / 100);
    }, 0);
    return { subtotal: Math.round(subtotal * 100) / 100, taxTotal: Math.round(taxTotal * 100) / 100, total: Math.round(total * 100) / 100, discountTotal: Math.round(discountTotal * 100) / 100 };
  }, [editForm.lines, allTaxes]);

  // Build a per-tax-type breakdown (CGST / SGST / IGST / TDS / CESS, etc.) from invoice lines.
  // For lines with multiple taxes, allocate the line's tax amount by rate-weight so the
  // sum of per-type rows equals the invoice's total tax.
  const taxMapById = useMemo(() => {
    const m = {};
    (allTaxes || []).forEach(t => { m[String(t._id || t.id)] = t; });
    return m;
  }, [allTaxes]);

  // Prefer line.taxes (rich objects, populated by Odoo migration with name/rate/amount),
  // fall back to taxIds + taxMap for natively-created invoices.
  const buildTaxBreakdown = useCallback((lines) => {
    const totals = {};
    for (const line of lines || []) {
      let entries = [];
      let fromRichTaxes = false;
      if (Array.isArray(line.taxes) && line.taxes.length > 0 && typeof line.taxes[0] === 'object') {
        fromRichTaxes = true;
        entries = line.taxes.map(t => ({
          name: t.name || '',
          rate: Number(t.rate) || 0,
          amount: t.amount != null ? Number(t.amount) : null,
        }));
      } else {
        const taxIds = line.taxIds || [];
        entries = taxIds
          .map(id => taxMapById[String(id)])
          .filter(Boolean)
          .map(t => ({ name: t.name || '', rate: Number(t.rate) || 0, amount: null, inclusive: !!t.inclusive }));
      }
      if (entries.length === 0) continue;

      if (entries.every(e => e.amount != null)) {
        for (const e of entries) {
          const key = e.name || '(Tax)';
          totals[key] = (totals[key] || 0) + e.amount;
        }
        continue;
      }

      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const discPct = Number(line.discount) || 0;
      const taxable = qty * price * (1 - discPct / 100);

      // Only trust stored line.taxAmount for rich (Odoo-imported) lines where it
      // travels alongside line.taxes. For native taxIds-driven lines, recompute
      // from live rates so signed lines (e.g. negative adjustments) stay
      // sign-consistent with the Taxable Value rollup. Stored taxAmount can be
      // stale or zero if taxes were edited after the last server recompute.
      const lineTaxAmount = (fromRichTaxes && line.taxAmount != null)
        ? Number(line.taxAmount) || 0
        : entries.reduce((s, e) => {
            if (e.inclusive) return s + (taxable - taxable / (1 + e.rate / 100));
            return s + taxable * (e.rate / 100);
          }, 0);

      const totalRate = entries.reduce((s, e) => s + e.rate, 0);
      if (totalRate === 0) continue;

      for (const e of entries) {
        const key = e.name || '(Tax)';
        totals[key] = (totals[key] || 0) + ((e.rate / totalRate) * lineTaxAmount);
      }
    }
    return Object.entries(totals).map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
    }));
  }, [taxMapById]);

  // ── Fetch invoice ──
  // Monotonic sequence guards against a stale response (e.g. rapid navigation
  // between invoices) clobbering the newer invoice's state.
  const fetchSeqRef = useRef(0);
  const fetchInvoice = useCallback(async () => {
    if (!orgSlug || !invoiceId) return;
    const seq = ++fetchSeqRef.current;
    try {
      setLoading(true);
      setError(null);
      const res = await invoicingApi.getInvoice(orgSlug, invoiceId);
      if (seq !== fetchSeqRef.current) return; // stale — a newer fetch started
      if (res?.invoice) {
        setInvoice({ ...res.invoice, payments: res.payments || res.invoice.payments || [] });
      } else {
        setError('Invoice not found');
        showToast('Invoice not found', 'error');
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      if (handleScoped404(err)) return;
      setError(err.message || 'Failed to load invoice');
      showToast('Failed to load invoice', 'error');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [orgSlug, invoiceId, handleScoped404]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch attachments ──
  const fetchAttachments = useCallback(async () => {
    if (!orgSlug || !invoiceId) return;
    try {
      setAttachmentsLoading(true);
      const res = await invoicingApi.listAttachments(orgSlug, invoiceId);
      setAttachments(res?.attachments || res?.documents || []);
    } catch {
      // silent fail for attachments
    } finally {
      setAttachmentsLoading(false);
    }
  }, [orgSlug, invoiceId]);

  useEffect(() => {
    fetchInvoice();
    fetchAttachments();
  }, [fetchInvoice, fetchAttachments]);

  // ── Action handlers ──
  const handleSend = async (maybeOpts = {}) => {
    // When wired as `onClick={handleSend}`, React passes the SyntheticEvent
    // here — stringifying it later fails with "circular structure" (event →
    // currentTarget → __reactFiber$ → stateNode → event). Only treat the arg
    // as options if it's a plain object (no nativeEvent).
    const opts = maybeOpts && !maybeOpts.nativeEvent && !maybeOpts.preventDefault ? maybeOpts : {};
    // Validate before confirming
    if (!invoice.contactId && !editForm.contactId) {
      return showToast(isVendorBill ? 'Please select a vendor before confirming' : 'Please select a customer before confirming', 'error');
    }
    const lines = editForm.lines || invoice.lines || [];
    const hasValidLine = lines.some(l => (Number(l.unitPrice) || 0) > 0 && (Number(l.quantity) || 0) > 0);
    if (!hasValidLine) {
      return showToast('At least one line item must have a quantity and billing rate', 'error');
    }
    if (isVendorBill) {
      if (!(editForm.vendorInvoiceNumber || invoice.vendorInvoiceNumber)) {
        return showToast('Vendor Invoice Number is required', 'error');
      }
      if (isIndia) {
        if (!(editForm.placeOfSupply || invoice.placeOfSupply)) {
          return showToast('Place of Supply is required', 'error');
        }
        if (!(editForm.gstTreatment || invoice.gstTreatment)) {
          return showToast('GST Treatment is required', 'error');
        }
      }
    } else {
      // Customer invoices: start/end dates required on every revenue line
      const linesWithAmounts = lines.filter(l => (Number(l.unitPrice) || 0) > 0 && (Number(l.quantity) || 0) > 0);
      const missingDates = linesWithAmounts.some(l => !l.startDate || !l.endDate);
      if (missingDates) {
        return showToast('Start Date and End Date are required on all line items', 'error');
      }
    }
    try {
      setActionLoading('send');
      await invoicingApi.sendInvoice(orgSlug, invoiceId, opts);
      showToast(isVendorBill ? 'Bill confirmed' : 'Invoice confirmed');
      fetchInvoice();
    } catch (err) {
      // Vendor bill: soft-warn on duplicate vendor invoice number
      if (err.message === 'duplicate_vendor_bill' || /duplicate/i.test(err.message || '')) {
        setShowDuplicateBillConfirm(true);
      } else {
        showToast(err.message || 'Failed to confirm invoice', 'error');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDuplicateBill = () => {
    setShowDuplicateBillConfirm(false);
    handleSend({ confirmDuplicate: true });
  };

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDuplicateBillConfirm, setShowDuplicateBillConfirm] = useState(false);
  const handleCancel = async () => {
    try {
      setActionLoading('cancel');
      await invoicingApi.cancelInvoice(orgSlug, invoiceId);
      showToast('Invoice cancelled');
      setShowCancelConfirm(false);
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to cancel invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetToDraft = async () => {
    try {
      setActionLoading('reset');
      await invoicingApi.resetToDraft(orgSlug, invoiceId);
      showToast('Invoice reset to draft');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to reset invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async () => {
    try {
      setActionLoading('duplicate');
      const res = await invoicingApi.duplicateInvoice(orgSlug, invoiceId);
      showToast('Invoice duplicated');
      if (res?.invoice?._id) {
        navigate(orgPath(`/invoicing/invoices/${res.invoice._id}`));
      }
    } catch (err) {
      showToast(err.message || 'Failed to duplicate invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCreditNote = () => setShowCreditNoteModal(true);

  const handleMarkApplied = async () => {
    try {
      setActionLoading('markApplied');
      await invoicingApi.markCreditNoteApplied(orgSlug, invoiceId);
      showToast('Credit note marked as applied');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to mark credit note as applied', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // E-Invoice: generate IRN via IRP
  const handleGenerateEInvoice = async () => {
    setEInvoiceError(null);
    setEInvoiceStep('validating');
    try {
      setEInvoiceStep('submitting');
      const res = await invoicingApi.generateEInvoice(orgSlug, invoiceId);
      if (!res?.success) throw new Error(res?.error || 'E-invoice generation failed');
      setEInvoiceStep('done');
      showToast(`E-Invoice generated — IRN: ${res.irn}`);
      fetchInvoice(); // refresh to show IRN on invoice
    } catch (err) {
      setEInvoiceError(err.message || 'E-invoice generation failed');
      setEInvoiceStep('error');
    }
  };

  // E-Invoice: cancel IRN at IRP (within 24 hours)
  const [cancelEInvoiceModal, setCancelEInvoiceModal] = useState(null);
  // GST payment-hold reason prompt (replaces the old window.prompt)
  const [gstHoldModal, setGstHoldModal] = useState(null); // { reason } | null
  const handleCancelEInvoice = () => {
    setCancelEInvoiceModal({ reason: 'Data Entry Mistake', remarks: '' });
  };
  const submitCancelEInvoice = async () => {
    if (!cancelEInvoiceModal) return;
    const { reason, remarks } = cancelEInvoiceModal;
    setCancelEInvoiceModal(null);
    try {
      setActionLoading('cancelEInvoice');
      const res = await invoicingApi.cancelEInvoice(orgSlug, invoiceId, {
        cancelReason: reason,
        cancelRemarks: (remarks || '').slice(0, 100),
      });
      if (!res?.success) throw new Error(res?.error || 'E-invoice cancellation failed');
      showToast('E-Invoice cancelled');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to cancel e-invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const [voidPaymentId, setVoidPaymentId] = useState(null);
  const handleVoidPayment = async (paymentId) => {
    const pid = paymentId || voidPaymentId;
    if (!pid) return;
    setVoidPaymentId(null);
    try {
      setActionLoading('voidPayment');
      await invoicingApi.deletePayment(orgSlug, pid);
      showToast('Payment voided');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to void payment', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setActionLoading('pdf');
      const response = await invoicingApi.downloadPdf(orgSlug, invoiceId);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(invoice?.number || invoiceId || 'invoice').replace(/\//g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('PDF downloaded');
    } catch (err) {
      showToast(err.message || 'Failed to download PDF', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    try {
      setActionLoading('delete');
      await invoicingApi.deleteInvoice(orgSlug, invoiceId);
      showToast('Invoice deleted');
      navigate(orgPath(listUrlForDoc(invoice)));
    } catch (err) {
      showToast(err.message || 'Failed to delete invoice', 'error');
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleSendFollowUp = async () => {
    try {
      setActionLoading('followup');
      await invoicingApi.sendFollowUp(orgSlug, invoiceId, {});
      showToast('Follow-up sent');
    } catch (err) {
      showToast(err.message || 'Failed to send follow-up', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Attachment handlers ──
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be under 10MB', 'error');
      return;
    }
    try {
      setUploadingFile(true);
      await invoicingApi.uploadAttachment(orgSlug, invoiceId, file);
      showToast('File uploaded');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to upload file', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  // Auth-fetch the attachment as a blob and trigger a save dialog. The bare
  // anchor `href` 401s because the GET route requires Bearer auth, and the
  // browser doesn't send headers from a plain link click.
  const handleDownloadAttachment = async (docId, filename) => {
    try {
      const token = localStorage.getItem('rivvra_token');
      const url = invoicingApi.getAttachmentUrl(orgSlug, invoiceId, docId);
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      showToast(err.message || 'Download failed', 'error');
    }
  };

  // ── AI re-extract: drop a PDF onto an existing draft vendor bill ──
  // Reuses the same /vendor-bills/extract endpoint used on the list page,
  // then PATCHes the extracted fields onto THIS bill (no new bill is created)
  // and uploads the PDF as an attachment.
  const handleAiReExtract = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      return showToast('Only PDF files are supported', 'error');
    }
    if (file.size > 10 * 1024 * 1024) {
      return showToast('PDF must be under 10 MB', 'error');
    }
    try {
      setAiExtracting(true);
      const fd = new FormData();
      fd.append('file', file);
      const res = await invoicingApi.extractVendorBill(orgSlug, fd);
      const extracted = res?.extracted;
      const vendorMatch = res?.vendorMatch || null;
      if (!extracted) throw new Error('Extraction returned no data');

      // Resolve tax IDs from extracted line rates (prefer IGST when PDF reports it)
      const taxList = (allTaxes || []).filter(t => t.active !== false);
      const preferIgst = Number(extracted?.totals?.igstAmount || 0) > 0;
      const resolveTaxId = (rate) => {
        if (rate == null || rate === '' || isNaN(Number(rate))) return null;
        const r = Number(rate);
        const candidates = taxList.filter(t => Number(t.rate) === r);
        if (!candidates.length) return null;
        const match = candidates.find(t => preferIgst ? /igst/i.test(t.name) : !/igst/i.test(t.name));
        return (match || candidates[0])._id;
      };
      // Currency from the AI (ISO 4217 — "USD", "INR", "EUR", …). Used by
      // both line-level lineCurrency and the invoice-level currency below.
      const extractedCurrency = (extracted?.invoice?.currency || '').trim().toUpperCase() || null;
      const newLines = (extracted?.lines || []).map((l) => {
        const taxId = resolveTaxId(l.taxRate);
        return {
          description: l.description || '',
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          hsnSacCode: l.hsnSac || undefined,
          taxIds: taxId ? [taxId] : [],
          expenseCategory: l.expenseCategory || undefined,
          lineCurrency: extractedCurrency || undefined,
        };
      });

      // Prefer the currency the AI parsed off the bill. Falls back to INR
      // only when the extracted vendor has a GSTIN (strongly implies an
      // Indian B2B bill). Previous version hardcoded INR whenever ANY
      // vendor.gstin came back, so a mis-extracted buyer GSTIN on a $20
      // USD bill caused the bill to be recorded as ₹20 INR.
      const updates = {
        date: extracted?.invoice?.date || undefined,
        dueDate: extracted?.invoice?.dueDate || extracted?.invoice?.date || undefined,
        currency: extractedCurrency || (extracted?.vendor?.gstin ? 'INR' : undefined),
        vendorInvoiceNumber: extracted?.invoice?.number || undefined,
        placeOfSupply: extracted?.invoice?.placeOfSupply || undefined,
        gstTreatment: extracted?.invoice?.gstTreatment || undefined,
        // Extracted GSTIN belongs to the VENDOR (this is a vendor bill) — store
        // it as vendorGstin for GSTR-2B reconciliation, not customerGstin.
        vendorGstin: extracted?.vendor?.gstin || undefined,
        tdsRate: Number(extracted?.tds?.rate) > 0 ? Number(extracted.tds.rate) : undefined,
        tdsSection: extracted?.tds?.section || undefined,
      };
      // Strip undefineds so they don't overwrite existing values with null
      Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
      if (newLines.length) updates.lines = newLines;

      const saveRes = await invoicingApi.updateInvoice(orgSlug, invoiceId, updates);
      if (saveRes?.invoice) {
        setInvoice(prev => ({ ...prev, ...saveRes.invoice, payments: prev?.payments || [] }));
      }

      // Attach the PDF (non-blocking)
      try {
        await invoicingApi.uploadAttachment(orgSlug, invoiceId, file, 'Vendor PDF');
        fetchAttachments();
      } catch (e) {
        console.warn('Failed to attach PDF:', e);
      }

      // Fill-blanks enrichment of the linked vendor contact. Re-extract used
      // to leave the contact untouched, so contacts created by the pre-2026-05-24
      // India-only extract path (wrong type=individual, empty address) stayed
      // broken even after the user re-ran extraction with the structured-output
      // schema. Rule: only complete blank fields — never overwrite anything the
      // user (or a later edit) has populated.
      let contactEnriched = false;
      const linkedContactId = invoice?.contactId || saveRes?.invoice?.contactId;
      if (linkedContactId && extracted?.vendor) {
        try {
          const cRes = await contactsApi.get(orgSlug, linkedContactId);
          const existing = cRes?.contact || cRes;
          const ev = extracted.vendor;
          const evName = ev?.name || existing?.name || '';
          const COMPANY_SUFFIX_RE = /\b(pvt|private|ltd|limited|inc|incorporated|llp|llc|pllc|plc|corp|corporation|co|company|gmbh|sa|sarl|bv|pte|ag|ab|kk|cpas?)\b\.?/i;
          const patch = {};

          if (existing?.type === 'individual' && COMPANY_SUFFIX_RE.test(evName)) {
            patch.type = 'company';
          }

          const existingAddr = existing?.address || {};
          const addrIsEmpty = !['street','street2','city','state','zip','country','countryCode']
            .some(k => (existingAddr[k] || '').toString().trim());
          if (addrIsEmpty) {
            const ea = ev?.address;
            if (ea && typeof ea === 'object') {
              const filled = ['street','street2','city','state','zip','country']
                .some(k => (ea[k] || '').toString().trim());
              if (filled) {
                patch.address = {
                  street:  ea.street  || '',
                  street2: ea.street2 || '',
                  city:    ea.city    || '',
                  state:   ea.state   || '',
                  zip:     ea.zip     || '',
                  country: ea.country || '',
                  countryCode: countryCode || existingAddr.countryCode || '',
                };
              }
            }
          }

          if (!existing?.gstin && ev?.gstin) patch.gstin = ev.gstin;
          if (!existing?.countryCode && countryCode) patch.countryCode = countryCode;

          if (Object.keys(patch).length > 0) {
            await contactsApi.update(orgSlug, linkedContactId, patch);
            contactEnriched = true;
          }
        } catch (e) {
          console.warn('Vendor contact enrichment failed:', e);
        }
      }

      // No vendor linked yet? Offer to create / match — the same prompt the
      // list-page drop zone shows. Without this, "Extract from PDF" on an
      // unlinked draft silently left the Vendor blank (e.g. a foreign vendor
      // bill recorded under an Indian company never prompted to add the vendor).
      // Trigger on ANY vendor signal (name / gstin / taxId), not just name —
      // the model can return a null name for an overseas vendor while still
      // having captured a tax id, and we still want to prompt.
      const hasVendorSignal = !!(extracted?.vendor?.name || extracted?.vendor?.gstin || extracted?.vendor?.taxId);
      if (!linkedContactId && hasVendorSignal) {
        if (vendorMatch?.contactId) {
          await linkVendorContact(vendorMatch.contactId);
          showToast(`Bill updated — linked existing vendor "${vendorMatch.contactName || extracted.vendor.name}"`);
        } else {
          setReExtractVendor({ extracted });
          showToast('Bill updated — choose or create the vendor');
        }
        return;
      }

      showToast(contactEnriched
        ? 'Bill updated from PDF — vendor contact refreshed'
        : 'Bill updated from PDF — please verify');
    } catch (err) {
      showToast(err.message || 'AI extraction failed', 'error');
    } finally {
      setAiExtracting(false);
    }
  };

  // Link a contact to THIS bill (used by the re-extract vendor prompt). PATCHes
  // contactId and syncs local state so the Vendor block fills in immediately.
  const linkVendorContact = async (contactId) => {
    if (!contactId) return;
    const saveRes = await invoicingApi.updateInvoice(orgSlug, invoiceId, { contactId });
    if (saveRes?.invoice) {
      setInvoice(prev => ({ ...prev, ...saveRes.invoice, payments: prev?.payments || [] }));
    }
  };

  const [deleteAttachId, setDeleteAttachId] = useState(null);
  const handleDeleteAttachment = async (docId) => {
    const did = docId || deleteAttachId;
    if (!did) return;
    setDeleteAttachId(null);
    try {
      await invoicingApi.deleteAttachment(orgSlug, invoiceId, did);
      showToast('Attachment deleted');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to delete attachment', 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  // ── Loading state ──
  const status = invoice.status || 'draft';
  const currency = editForm.currency || invoice.currency || 'INR';
  const lineItems = isDraft ? (editForm.lines || []) : (invoice.lines || invoice.lineItems || []);
  const payments = invoice.payments || [];
  const amountDue = invoice.amountDue ?? invoice.total ?? 0;
  const typeLabel = getInvoiceTypeLabel(invoice);

  // Derive payment status (fallback from legacy status values when not set)
  const paymentStatus = invoice.paymentStatus
    || (status === 'paid' ? 'paid'
      : status === 'partial' ? 'partial'
      : status === 'cancelled' ? null
      : status === 'draft' ? 'not_paid'
      : 'not_paid');
  const isFullyPaid = paymentStatus === 'paid' || status === 'paid';
  const isLifecyclePosted = ['posted', 'viewed', 'partial', 'overdue', 'paid'].includes(status);
  const isCancelled = status === 'cancelled';
  const isReversed = Boolean(invoice.reversedByCreditNoteId);
  const isCreditNote = invoice.type === 'credit_note';
  const isActionablePosted = isLifecyclePosted && !isCancelled && !isFullyPaid && !isReversed && !isCreditNote;
  // Compare against end-of-day so an invoice due TODAY is not flagged overdue.
  const dueEndOfDay = invoice.dueDate ? new Date(invoice.dueDate) : null;
  if (dueEndOfDay) dueEndOfDay.setHours(23, 59, 59, 999);
  const isOverdue = Boolean(
    dueEndOfDay
    && dueEndOfDay < new Date()
    && !isFullyPaid
    && !isCancelled
    && !isReversed
    && !isCreditNote
    && status !== 'draft'
  );
  const stepIndex = isFullyPaid ? 2 : isLifecyclePosted ? 1 : 0;

  // Build address lines (multi-line display)
  const addrObj = editForm.contactAddress || invoice.contactAddress || invoice.customer?.address;
  const addressLines = typeof addrObj === 'object' && addrObj
    ? [
        [addrObj.street, addrObj.street2].filter(Boolean).join(', '),
        [addrObj.city, addrObj.state, addrObj.zip].filter(Boolean).join(', '),
        addrObj.country,
      ].filter(Boolean)
    : typeof addrObj === 'string' ? [addrObj] : [];
  const addressStr = addressLines.join(', '); // fallback for any code using addressStr

  // Payment terms display
  const paymentTermDisplay = (() => {
    const termId = isDraft ? (editForm.paymentTermId || invoice.paymentTermId) : invoice.paymentTermId;
    if (termId && paymentTermsList.length) {
      const found = paymentTermsList.find(pt => (pt._id || pt.id) === termId);
      if (found) return found.name;
    }
    if (invoice.paymentTerms) {
      return typeof invoice.paymentTerms === 'object' ? invoice.paymentTerms.name : invoice.paymentTerms;
    }
    return 'Due on Receipt';
  })();

  const paymentTermOptions = paymentTermsList.map(pt => ({
    value: pt._id || pt.id,
    label: pt.name,
  }));

  // Soft GST payment-hold toggle (vendor bills). Manual holds win over the
  // reconciliation auto-hold. Does not block recording a payment — just warns.
  const submitGstHold = async (onHoldFlag, reason) => {
    try {
      setActionLoading('gstHold');
      const res = await invoicingApi.setGstHold(orgSlug, invoiceId, { onHold: onHoldFlag, reason });
      setInvoice(prev => ({ ...prev, gstHold: res.gstHold }));
      setGstHoldModal(null);
      showToast(onHoldFlag ? 'Payment held' : 'Payment hold released', 'success');
    } catch (e) { showToast(e.message || 'Failed to update hold', 'error'); }
    finally { setActionLoading(null); }
  };
  const handleToggleGstHold = () => {
    const held = !!invoice.gstHold?.onHold;
    if (held) {
      submitGstHold(false, '');
    } else {
      setGstHoldModal({ reason: 'GST not yet filed by vendor (not in 2B)' });
    }
  };
  const onHold = !!invoice.gstHold?.onHold;

  // On-demand live GSTIN status check (active/cancelled) via the IRP lookup.
  const checkGstinLive = async () => {
    const g = ((isDraft ? editForm.vendorGstin : invoice.vendorGstin) || '').trim();
    if (!g) return;
    setGstinLiveLoading(true); setGstinLive(null);
    try {
      const r = await invoicingApi.validateGstin(orgSlug, g);
      setGstinLive(r.live || { status: 'unknown', source: 'disabled' });
    } catch {
      setGstinLive({ status: 'unknown', source: 'error' });
    } finally {
      setGstinLiveLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────
  // WORK IN PROGRESS — the render is not written yet.
  //
  // Everything above this line is the verified byte-identical splice of the
  // legacy data + money layer (legacy 703-1971). The render (legacy 2102-3736)
  // and the 17 sub-components (legacy 3737-5189) still have to be rebuilt.
  //
  // This file is NOT routed. `/org/:slug/invoicing/invoices/:invoiceId` still
  // renders the legacy InvoiceDetail, so nothing here is reachable by a user.
  // Do not wire it into PageSwitch until the render exists and money parity has
  // been captured against the legacy page.
  // ───────────────────────────────────────────────────────────────────────
  return null;
}
