// ============================================================================
// InvoiceDetail.jsx — Odoo-style invoice detail with inline editing
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import api from '../../utils/api';
import ActivityPanel from '../../components/shared/ActivityPanel';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import {
  ArrowLeft, Send, Trash2, Download, Mail, Copy,
  CreditCard, XCircle, RotateCcw, Loader2, X, FileText,
  AlertTriangle, Check, Info, Upload, Eye, Paperclip,
  User, Calendar, Clock, RefreshCw, BellRing, Edit3,
  Pencil, Plus, Search, Package,
} from 'lucide-react';

// ── Helpers ──

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return '\u20B90.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', {
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
const STATUS_STEPS = ['draft', 'sent', 'paid'];

function getStepIndex(status) {
  if (status === 'paid') return 2;
  if (status === 'sent' || status === 'overdue' || status === 'partial' || status === 'viewed') return 1;
  if (status === 'cancelled') return -1;
  return 0;
}

function getInvoiceTypeLabel(invoice) {
  if (invoice.type === 'credit_note' || invoice.isCreditNote) return 'Credit Note';
  if (invoice.type === 'vendor_bill' || invoice.isVendorBill) return 'Vendor Bill';
  return 'Customer Invoice';
}

const GST_TREATMENTS = [
  'Registered Business - Regular',
  'Registered Business - Composition',
  'Unregistered Business',
  'Consumer',
  'Overseas',
  'SEZ',
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

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

function EditableField({ label, value, displayValue, field, type = 'text', options, editable, onSave, placeholder, children }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setLocalValue(value ?? ''); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (type === 'text' || type === 'textarea') {
        inputRef.current.select?.();
      }
    }
  }, [editing, type]);

  const handleSave = () => {
    setEditing(false);
    if (localValue !== (value ?? '')) {
      onSave(field, localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setLocalValue(value ?? '');
      setEditing(false);
    }
  };

  const inputCls = 'w-full bg-dark-800 border border-rivvra-500 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-rivvra-500';

  // If custom children provided (like contact lookup), render those when editing
  if (children && editable && editing) {
    return (
      <div>
        <span className="text-sm text-dark-400">{label}</span>
        <div className="mt-0.5">{children({ onClose: () => setEditing(false) })}</div>
      </div>
    );
  }

  // Read-only mode
  if (!editable || !editing) {
    return (
      <div
        className={editable ? 'group cursor-pointer rounded px-1 -mx-1 py-0.5 -my-0.5 hover:bg-dark-800 transition-colors' : ''}
        onClick={() => editable && setEditing(true)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-dark-400">{label}</span>
          {editable && (
            <Pencil size={11} className="text-dark-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
        <div className="mt-0.5">
          {displayValue !== undefined ? displayValue : (
            <span className="text-white">{value || <span className="text-dark-500 italic">{placeholder || 'Click to set'}</span>}</span>
          )}
        </div>
      </div>
    );
  }

  // Editing mode
  return (
    <div>
      <span className="text-sm text-dark-400">{label}</span>
      <div className="mt-0.5">
        {type === 'select' ? (
          <select
            ref={inputRef}
            value={localValue}
            onChange={(e) => { setLocalValue(e.target.value); }}
            onBlur={() => { handleSave(); }}
            className={inputCls}
          >
            <option value="">-- Select --</option>
            {(options || []).map((opt) => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const lbl = typeof opt === 'object' ? opt.label : opt;
              return <option key={val} value={val}>{lbl}</option>;
            })}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            rows={3}
            className={inputCls + ' resize-none'}
            placeholder={placeholder}
          />
        ) : (
          <input
            ref={inputRef}
            type={type}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={inputCls}
            placeholder={placeholder}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ContactLookup — searchable contact dropdown
// ============================================================================

function ContactLookup({ orgSlug, currentName, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(true);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    // Close on outside click
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 1) { setResults([]); return; }
    try {
      setLoading(true);
      const res = await api.request(`/api/org/${orgSlug}/contacts?search=${encodeURIComponent(q)}&limit=10`);
      setResults(res?.contacts || res?.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSelect = (contact) => {
    onSelect(contact);
    setShowDropdown(false);
    onClose();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 bg-dark-800 border border-rivvra-500 rounded px-2 py-1">
        <Search size={14} className="text-dark-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search contacts..."
          className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-dark-500"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        {loading && <Loader2 size={14} className="animate-spin text-dark-400" />}
      </div>

      {showDropdown && (query.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
          {results.length === 0 && !loading && (
            <div className="px-3 py-4 text-center text-sm text-dark-500">
              {query.length > 0 ? 'No contacts found' : 'Type to search...'}
            </div>
          )}
          {results.map((c) => {
            const cId = c._id || c.id;
            const cName = c.name || c.displayName || c.firstName + ' ' + (c.lastName || '');
            const cEmail = c.email || '';
            const cType = c.type || c.companyType || '';
            return (
              <button
                key={cId}
                type="button"
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-dark-700 transition-colors border-b border-dark-700/50 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium">{cName}</span>
                  {cType && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-dark-300 uppercase tracking-wider">
                      {cType}
                    </span>
                  )}
                </div>
                {cEmail && <p className="text-xs text-dark-400 mt-0.5">{cEmail}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ProductSearch — searchable product dropdown for line items
// ============================================================================

function ProductSearch({ orgSlug, onSelect, onClose, triggerRef }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const searchTimer = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    inputRef.current?.focus();
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [triggerRef]);

  useEffect(() => {
    doSearch('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const doSearch = useCallback(async (q) => {
    try {
      setLoading(true);
      const params = q ? { search: q } : {};
      const res = await invoicingApi.listProducts(orgSlug, params);
      setResults(res?.products || res?.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(val), 300);
  };

  return createPortal(
    <div ref={containerRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }} className="w-72 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-dark-700">
        <Search size={14} className="text-dark-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search products..."
          className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-dark-500"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
        {loading && <Loader2 size={14} className="animate-spin text-dark-400" />}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {results.length === 0 && !loading && (
          <div className="px-3 py-3 text-center text-xs text-dark-500">No products found</div>
        )}
        {results.map((p) => (
          <button
            key={p._id || p.id}
            type="button"
            onClick={() => { onSelect(p); onClose(); }}
            className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors border-b border-dark-700/50 last:border-0"
          >
            <div className="flex items-center gap-2">
              <Package size={12} className="text-dark-400 shrink-0" />
              <span className="text-sm text-white">{p.name}</span>
            </div>
            {p.defaultPrice != null && (
              <p className="text-xs text-dark-400 mt-0.5 ml-5">{formatCurrency(p.defaultPrice)}</p>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// TaxMultiSelect — dropdown to pick taxes for a line item
// ============================================================================

function TaxMultiSelect({ orgSlug, selectedIds = [], onChange, onClose, triggerRef }) {
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position above if near bottom of screen, otherwise below
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 250) {
        setPos({ top: rect.top - 4, left: rect.left, openUp: true });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left, openUp: false });
      }
    }
  }, [triggerRef]);

  useEffect(() => {
    (async () => {
      try {
        const res = await invoicingApi.listTaxes(orgSlug);
        setTaxes(res?.taxes || res?.data || []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [orgSlug]);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const toggleTax = (taxId) => {
    const current = [...selectedIds];
    const idx = current.indexOf(taxId);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(taxId);
    onChange(current);
  };

  const style = pos.openUp
    ? { position: 'fixed', bottom: window.innerHeight - pos.top, left: pos.left, zIndex: 9999 }
    : { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 };

  return createPortal(
    <div ref={containerRef} style={style} className="w-56 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl">
      <div className="px-3 py-2 border-b border-dark-700 text-xs text-dark-400 font-medium">Select Taxes</div>
      <div className="max-h-40 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-3">
            <Loader2 size={14} className="animate-spin text-dark-500" />
          </div>
        )}
        {!loading && taxes.length === 0 && (
          <div className="px-3 py-3 text-center text-xs text-dark-500">No taxes configured</div>
        )}
        {taxes.map((t) => {
          const tId = t._id || t.id;
          const isSelected = selectedIds.includes(tId);
          return (
            <button
              key={tId}
              type="button"
              onClick={() => toggleTax(tId)}
              className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors flex items-center gap-2 border-b border-dark-700/50 last:border-0"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-rivvra-500 border-rivvra-500' : 'border-dark-500'}`}>
                {isSelected && <Check size={10} className="text-white" />}
              </div>
              <span className="text-sm text-white">{t.name}</span>
              {t.rate != null && <span className="text-xs text-dark-400 ml-auto">{t.rate}%</span>}
            </button>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-dark-700 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-rivvra-500 hover:text-rivvra-400 font-medium"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}


// ============================================================================
// EmployeeSearch — dropdown to search and select a consultant for a line item
// ============================================================================

function EmployeeSearch({ orgSlug, onSelect, onClose, triggerRef }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const searchTimer = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    inputRef.current?.focus();
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [triggerRef]);

  useEffect(() => {
    doSearch('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const doSearch = useCallback(async (q) => {
    try {
      setLoading(true);
      const res = await api.request(`/api/org/${orgSlug}/employee/employees?search=${encodeURIComponent(q)}&limit=10&status=active`);
      setResults(res?.employees || res?.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(val), 300);
  };

  return createPortal(
    <div ref={containerRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }} className="w-72 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-dark-700">
        <Search size={14} className="text-dark-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search employees..."
          className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-dark-500"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
        {loading && <Loader2 size={14} className="animate-spin text-dark-400" />}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {results.length === 0 && !loading && (
          <div className="px-3 py-3 text-center text-xs text-dark-500">No employees found</div>
        )}
        {results.map((emp) => (
          <button
            key={emp._id || emp.id}
            type="button"
            onClick={() => { onSelect({ _id: emp._id || emp.id, fullName: emp.fullName, designation: emp.designation }); onClose(); }}
            className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors border-b border-dark-700/50 last:border-0"
          >
            <div className="flex items-center gap-2">
              <User size={12} className="text-dark-400 shrink-0" />
              <span className="text-sm text-white">{emp.fullName}</span>
            </div>
            {emp.designation && (
              <p className="text-xs text-dark-400 mt-0.5 ml-5">{emp.designation}</p>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function InvoiceDetail() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const { invoiceId } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeTab, setActiveTab] = useState('lines');

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Inline editing state ──
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState(null); // flash "Saved" indicator
  const [paymentTermsList, setPaymentTermsList] = useState([]);
  const [allTaxes, setAllTaxes] = useState([]);

  const isDraft = invoice?.status === 'draft';

  // Sync editForm when invoice changes
  useEffect(() => {
    if (invoice) {
      setEditForm({
        contactId: invoice.contactId,
        contactName: invoice.contactName || invoice.customer?.name || '',
        contactEmail: invoice.contactEmail || invoice.customer?.email || '',
        contactAddress: invoice.contactAddress || invoice.customer?.address || '',
        invoiceDate: invoice.invoiceDate?.split?.('T')?.[0] || '',
        dueDate: invoice.dueDate?.split?.('T')?.[0] || '',
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
          lineCurrency: li.lineCurrency || invoice.currency || 'INR',
          taxIds: (li.taxIds || li.taxes || []).map(t => typeof t === 'object' ? (t._id || t.id) : t),
          taxNames: (li.taxIds || li.taxes || []).map(t => typeof t === 'object' ? t.name : ''),
          discount: li.discount ?? 0,
        })),
        notes: invoice.notes || '',
        internalNotes: invoice.internalNotes || '',
        gstTreatment: invoice.gstTreatment || '',
        placeOfSupply: invoice.placeOfSupply || '',
        customerGstin: invoice.customerGstin || '',
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

    setEditForm(prev => ({ ...prev, ...updates }));
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
      updates.customerGstin = contact.gstin;
    }
    if (contact.address) updates.contactAddress = contact.address;
    if (contact.placeOfSupply) updates.placeOfSupply = contact.placeOfSupply;
    if (contact.defaultPaymentTermId) updates.paymentTermId = contact.defaultPaymentTermId;
    if (contact.defaultCurrency) updates.currency = contact.defaultCurrency;

    setEditForm(prev => ({ ...prev, ...updates }));

    try {
      setSaving(true);
      const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, updates);
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
  }, [orgSlug, invoiceId, showToast]);

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
  }, [orgSlug, invoiceId, showToast]);

  // ── Line item helpers ──
  const updateLine = useCallback((index, field, value) => {
    setEditForm(prev => {
      const newLines = [...prev.lines];
      const updatedLine = { ...newLines[index], [field]: value };
      // When updating taxIds, also update taxNames for display
      if (field === 'taxIds') {
        updatedLine.taxNames = value.map(id => {
          const tax = allTaxes.find(t => (t._id || t.id) === id);
          return tax?.name || '';
        }).filter(Boolean);
      }
      newLines[index] = updatedLine;
      // Trigger debounced save
      setTimeout(() => saveLines(newLines), 0);
      return { ...prev, lines: newLines };
    });
  }, [saveLines, allTaxes]);

  const addLine = useCallback(() => {
    setEditForm(prev => {
      const newLines = [...prev.lines, {
        productId: '',
        productName: '',
        description: '',
        consultantId: '',
        consultantName: '',
        startDate: '',
        endDate: '',
        quantity: 1,
        unitPrice: 0,
        lineCurrency: prev.currency || invoice?.currency || 'INR',
        taxIds: [],
        taxNames: [],
        discount: 0,
      }];
      return { ...prev, lines: newLines };
    });
  }, [invoice]);

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
        description: product.description || newLines[index].description || '',
        unitPrice: product.unitPrice ?? product.price ?? newLines[index].unitPrice,
        taxIds: product.defaultTaxIds || product.taxIds || newLines[index].taxIds || [],
      };
      setTimeout(() => saveLines(newLines), 0);
      return { ...prev, lines: newLines };
    });
  }, [saveLines]);

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

  // ── Fetch invoice ──
  const fetchInvoice = useCallback(async () => {
    if (!orgSlug || !invoiceId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await invoicingApi.getInvoice(orgSlug, invoiceId);
      if (res?.invoice) {
        setInvoice({ ...res.invoice, payments: res.payments || res.invoice.payments || [] });
      } else {
        setError('Invoice not found');
        showToast('Invoice not found', 'error');
      }
    } catch (err) {
      setError(err.message || 'Failed to load invoice');
      showToast('Failed to load invoice', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const handleSend = async () => {
    try {
      setActionLoading('send');
      await invoicingApi.sendInvoice(orgSlug, invoiceId);
      showToast('Invoice sent');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to send invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    try {
      setActionLoading('cancel');
      await invoicingApi.cancelInvoice(orgSlug, invoiceId);
      showToast('Invoice cancelled');
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

  const handleCreateCreditNote = async () => {
    try {
      setActionLoading('credit');
      const res = await invoicingApi.createCreditNote(orgSlug, invoiceId);
      showToast('Credit note created');
      if (res?.invoice?._id) {
        navigate(orgPath(`/invoicing/invoices/${res.invoice._id}`));
      }
    } catch (err) {
      showToast(err.message || 'Failed to create credit note', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoidPayment = async (paymentId) => {
    if (!confirm('Are you sure you want to void this payment?')) return;
    try {
      setActionLoading('voidPayment');
      await invoicingApi.deletePayment(orgSlug, paymentId);
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
      a.download = `${invoice?.number || 'invoice'}.pdf`;
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
      navigate(orgPath('/invoicing/invoices'));
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

  const handleDeleteAttachment = async (docId) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await invoicingApi.deleteAttachment(orgSlug, invoiceId, docId);
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
  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-rivvra-500" />
          <span className="text-sm text-dark-400">Loading invoice...</span>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-8 text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-1">Invoice Not Found</h2>
          <p className="text-sm text-dark-400 mb-4">{error || 'The invoice could not be loaded.'}</p>
          <button
            onClick={() => navigate(orgPath('/invoicing/invoices'))}
            className="px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm rounded-lg transition-colors"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  const status = invoice.status || 'draft';
  const currency = editForm.currency || invoice.currency || 'INR';
  const lineItems = isDraft ? (editForm.lines || []) : (invoice.lines || invoice.lineItems || []);
  const payments = invoice.payments || [];
  const amountDue = invoice.amountDue ?? invoice.total ?? 0;
  const stepIndex = getStepIndex(status);
  const typeLabel = getInvoiceTypeLabel(invoice);

  // Build address string
  const addrObj = editForm.contactAddress || invoice.contactAddress || invoice.customer?.address;
  const addressParts = typeof addrObj === 'object' && addrObj
    ? [addrObj.street, addrObj.street2, addrObj.city, addrObj.state, addrObj.zip, addrObj.country].filter(Boolean)
    : typeof addrObj === 'string' ? [addrObj] : [];
  const addressStr = addressParts.join(', ');

  // Payment terms display
  const paymentTermDisplay = (() => {
    if (isDraft && editForm.paymentTermId) {
      const found = paymentTermsList.find(pt => (pt._id || pt.id) === editForm.paymentTermId);
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

  return (
    <div className="min-h-screen bg-dark-900">
      {/* ══════════════════════════════════════════════════════════════════
         TOP BAR — Actions + Status Stepper
         ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-dark-850 border-b border-dark-700 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Left: Back + Action Buttons */}
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <button
              onClick={() => navigate(orgPath('/invoicing/invoices'))}
              className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>

            {/* Draft actions */}
            {status === 'draft' && (
              <>
                <ActionBtn icon={Check} label="Confirm" onClick={handleSend} loading={actionLoading === 'send'} primary />
                <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                <ActionBtn icon={Trash2} label="Delete" onClick={() => setShowDeleteConfirm(true)} danger />
              </>
            )}

            {/* Sent / Viewed / Partial / Overdue actions */}
            {['sent', 'viewed', 'partial', 'overdue'].includes(status) && (
              <>
                <ActionBtn icon={CreditCard} label="Record Payment" onClick={() => setShowPaymentModal(true)} primary />
                <ActionBtn icon={Send} label="Send" onClick={handleSend} loading={actionLoading === 'send'} />
                <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                <ActionBtn icon={FileText} label="Credit Note" onClick={handleCreateCreditNote} loading={actionLoading === 'credit'} />
                <ActionBtn icon={Mail} label="Email" onClick={() => setShowEmailModal(true)} />
                {status === 'overdue' && (
                  <ActionBtn icon={BellRing} label="Follow-up" onClick={handleSendFollowUp} loading={actionLoading === 'followup'} />
                )}
                <ActionBtn icon={XCircle} label="Cancel" onClick={handleCancel} loading={actionLoading === 'cancel'} danger />
              </>
            )}

            {/* Paid actions */}
            {status === 'paid' && (
              <>
                <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                <ActionBtn icon={FileText} label="Credit Note" onClick={handleCreateCreditNote} loading={actionLoading === 'credit'} />
                <ActionBtn icon={Copy} label="Duplicate" onClick={handleDuplicate} loading={actionLoading === 'duplicate'} />
              </>
            )}

            {/* Reset to Draft */}
            {(status === 'cancelled' || status === 'sent' || status === 'paid' || status === 'partial') && (
              <ActionBtn icon={RotateCcw} label="Reset to Draft" onClick={handleResetToDraft} loading={actionLoading === 'reset'} />
            )}

            {/* Save indicator */}
            {saving && (
              <div className="flex items-center gap-1.5 text-xs text-dark-400 ml-2">
                <Loader2 size={12} className="animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            {savedField && !saving && (
              <div className="flex items-center gap-1 text-xs text-emerald-400 ml-2 animate-pulse">
                <Check size={12} />
                <span>Saved</span>
              </div>
            )}
          </div>

          {/* Right: Status Stepper */}
          <div className="flex items-center gap-1 shrink-0">
            {STATUS_STEPS.map((step, i) => {
              const isActive = i === stepIndex;
              const isPast = i < stepIndex;
              const label = step === 'sent' ? 'Posted' : step.charAt(0).toUpperCase() + step.slice(1);

              let cls = 'px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ';
              if (isActive) {
                cls += 'bg-rivvra-500 text-white';
              } else if (isPast) {
                cls += 'bg-dark-700 text-dark-300';
              } else {
                cls += 'border border-dark-600 text-dark-500';
              }

              return (
                <div key={step} className="flex items-center">
                  {i > 0 && <div className={`w-6 h-px mx-0.5 ${i <= stepIndex ? 'bg-rivvra-500' : 'bg-dark-600'}`} />}
                  <span className={cls}>{label}</span>
                </div>
              );
            })}
            {status === 'cancelled' && (
              <div className="flex items-center">
                <div className="w-6 h-px mx-0.5 bg-dark-600" />
                <span className="px-4 py-1.5 text-xs font-semibold rounded-full bg-red-500/15 text-red-400">
                  Cancelled
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         BODY — 2-column layout (content + sidebar)
         ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">

          {/* ── INVOICE CONTENT (full width) ── */}
          <div className="space-y-6">

            {/* Header card with PAID stamp */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl p-6 relative overflow-hidden">
              {/* PAID stamp overlay */}
              {status === 'paid' && (
                <div className="absolute top-6 right-[-20px] rotate-[30deg] z-10 pointer-events-none">
                  <div className="bg-emerald-500/20 border-2 border-emerald-500/40 px-8 py-1.5 rounded">
                    <span className="text-emerald-500 font-extrabold text-3xl tracking-widest uppercase">
                      PAID
                    </span>
                  </div>
                </div>
              )}

              {/* Type label */}
              <p className="text-sm text-dark-400 mb-1">{typeLabel}</p>

              {/* Invoice number */}
              <h1 className="text-2xl font-bold text-white mb-6">
                {invoice.number || 'Draft Invoice'}
              </h1>

              {/* Form fields — 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {/* Left column */}
                <div className="space-y-4">
                  {/* Customer — with contact lookup */}
                  <EditableField
                    label="Customer"
                    value={editForm.contactName || invoice.contactName || invoice.customer?.name || ''}
                    field="contactId"
                    editable={isDraft}
                    onSave={() => {}}
                    placeholder="Select a customer"
                    displayValue={
                      <div>
                        <span
                          className="text-rivvra-500 font-semibold cursor-pointer hover:underline"
                          onClick={(e) => {
                            const cId = editForm.contactId || invoice.contactId;
                            if (cId) { e.stopPropagation(); navigate(orgPath(`/contacts/${cId}?from=invoice&invoiceId=${invoiceId}`)); }
                          }}
                        >
                          {editForm.contactName || invoice.contactName || invoice.customer?.name || '-'}
                        </span>
                        {addressStr && (
                          <p className="text-sm text-dark-400 mt-0.5">{addressStr}</p>
                        )}
                        {(editForm.contactEmail || invoice.contactEmail) && (
                          <p className="text-sm text-dark-400">{editForm.contactEmail || invoice.contactEmail}</p>
                        )}
                        {(editForm.customerGstin || invoice.customerGstin) && (
                          <p className="text-sm text-dark-400 mt-0.5">GSTIN: {editForm.customerGstin || invoice.customerGstin}</p>
                        )}
                      </div>
                    }
                  >
                    {({ onClose }) => (
                      <ContactLookup
                        orgSlug={orgSlug}
                        currentName={editForm.contactName}
                        onSelect={handleContactSelect}
                        onClose={onClose}
                      />
                    )}
                  </EditableField>

                  {/* Place of Supply */}
                  <EditableField
                    label="Place of Supply"
                    value={isDraft ? editForm.placeOfSupply : (invoice.placeOfSupply || '')}
                    field="placeOfSupply"
                    type="text"
                    editable={isDraft}
                    onSave={saveField}
                    placeholder="e.g. Maharashtra"
                  />

                  {/* GST Treatment */}
                  <EditableField
                    label="GST Treatment"
                    value={isDraft ? editForm.gstTreatment : (invoice.gstTreatment || '')}
                    field="gstTreatment"
                    type="select"
                    options={GST_TREATMENTS}
                    editable={isDraft}
                    onSave={saveField}
                  />

                  {/* Customer GSTIN (read-only display — set via contact) */}
                  {(editForm.customerGstin || invoice.customerGstin) && !isDraft && (
                    <FormField label="Customer GSTIN">
                      <span className="text-white">{invoice.customerGstin}</span>
                    </FormField>
                  )}
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <EditableField
                    label="Invoice Date"
                    value={isDraft ? (editForm.invoiceDate || editForm.date) : (invoice.date?.split?.('T')?.[0] || '')}
                    field="date"
                    type="date"
                    editable={isDraft}
                    onSave={saveField}
                    displayValue={
                      <span className="text-white">{formatDate(isDraft ? (editForm.invoiceDate || editForm.date) : invoice.date)}</span>
                    }
                  />

                  <EditableField
                    label="Payment Terms"
                    value={isDraft ? editForm.paymentTermId : ''}
                    field="paymentTermId"
                    type="select"
                    options={paymentTermOptions}
                    editable={isDraft}
                    onSave={handlePaymentTermChange}
                    displayValue={
                      <span className="text-white">{paymentTermDisplay}</span>
                    }
                  />

                  <EditableField
                    label="Due Date"
                    value={isDraft ? editForm.dueDate : (invoice.dueDate?.split?.('T')?.[0] || '')}
                    field="dueDate"
                    type="date"
                    editable={isDraft}
                    onSave={saveField}
                    displayValue={
                      <span className={status === 'overdue' ? 'text-red-400 font-medium' : 'text-white'}>
                        {formatDate(isDraft ? editForm.dueDate : invoice.dueDate)}
                      </span>
                    }
                  />

                  <EditableField
                    label="Currency"
                    value={isDraft ? editForm.currency : currency}
                    field="currency"
                    type="select"
                    options={CURRENCIES}
                    editable={isDraft}
                    onSave={saveField}
                  />
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl">
              {/* Tab headers */}
              <div className="flex border-b border-dark-700 px-6">
                <button
                  onClick={() => setActiveTab('lines')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === 'lines'
                      ? 'border-rivvra-500 text-white'
                      : 'border-transparent text-dark-400 hover:text-dark-300'
                  }`}
                >
                  Invoice Lines
                </button>
                <button
                  onClick={() => setActiveTab('other')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === 'other'
                      ? 'border-rivvra-500 text-white'
                      : 'border-transparent text-dark-400 hover:text-dark-300'
                  }`}
                >
                  Other Info
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'lines' && (
                <div>
                  {/* Invoice Lines table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full text-sm">
                      <thead>
                        <tr className="bg-dark-800">
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-6 py-3">Product</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Consultant</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Description</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Start Date</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">End Date</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Qty</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Billing Rate</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Currency</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Taxes</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-6 py-3">Amount</th>
                          {isDraft && <th className="w-10 px-2 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {isDraft ? (
                          <>
                            {lineItems.map((li, i) => (
                              <InlineLineRow
                                key={li._id || `line-${i}`}
                                line={li}
                                index={i}
                                currency={currency}
                                orgSlug={orgSlug}
                                onUpdate={updateLine}
                                onRemove={removeLine}
                                onProductSelect={handleProductSelect}
                              />
                            ))}
                            {lineItems.length === 0 && (
                              <tr>
                                <td colSpan={11} className="text-center py-8 text-dark-500">
                                  No invoice lines yet
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={11} className="px-6 py-3">
                                <button
                                  type="button"
                                  onClick={addLine}
                                  className="flex items-center gap-1.5 text-sm text-rivvra-500 hover:text-rivvra-400 transition-colors"
                                >
                                  <Plus size={14} />
                                  Add a line
                                </button>
                              </td>
                            </tr>
                          </>
                        ) : (
                          <>
                            {(invoice.lines || invoice.lineItems || []).map((li, i) => {
                              const lineTotal = li.total ?? li.subtotal ?? ((li.quantity || 0) * (li.unitPrice || 0));
                              return (
                                <tr key={li._id || i} className="border-b border-dark-700/50 hover:bg-dark-800/30">
                                  <td className="px-6 py-3 text-white">
                                    {li.product?.name || li.productName || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-white">
                                    {li.consultantName || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-dark-300 max-w-xs">
                                    {li.description || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-white">
                                    {li.startDate ? formatDate(li.startDate) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-white">
                                    {li.endDate ? formatDate(li.endDate) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right text-white">{li.quantity ?? 0}</td>
                                  <td className="px-4 py-3 text-right text-white">
                                    {formatCurrency(li.unitPrice, currency)}
                                  </td>
                                  <td className="px-4 py-3 text-white text-sm">
                                    {li.lineCurrency || invoice.currency || 'INR'}
                                  </td>
                                  <td className="px-4 py-3 text-dark-400 text-xs">
                                    {(li.taxNames || []).filter(Boolean).join(', ') || (li.taxIds?.length ? `${li.taxIds.length} tax(es)` : '-')}
                                  </td>
                                  <td className="px-6 py-3 text-right text-white font-medium">
                                    {formatCurrency(lineTotal, currency)}
                                  </td>
                                </tr>
                              );
                            })}
                            {(invoice.lines || invoice.lineItems || []).length === 0 && (
                              <tr>
                                <td colSpan={10} className="text-center py-10 text-dark-500">
                                  No invoice lines
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals section */}
                  <div className="border-t border-dark-700 px-6 py-5">
                    <div className="flex justify-end">
                      <div className="w-full max-w-xs space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Untaxed Amount</span>
                          <span className="text-white">
                            {formatCurrency(isDraft ? localTotals.subtotal : invoice.subtotal, currency)}
                          </span>
                        </div>

                        {/* Tax breakdown */}
                        {((isDraft ? localTotals.taxTotal : (invoice.taxTotal || invoice.totalTax || invoice.taxAmount)) > 0) && (
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-400">
                              {invoice.taxBreakdown?.[0]?.name || 'Taxes'}
                            </span>
                            <span className="text-white">
                              {formatCurrency(isDraft ? localTotals.taxTotal : (invoice.taxTotal || invoice.totalTax || invoice.taxAmount || 0), currency)}
                            </span>
                          </div>
                        )}

                        {((isDraft ? localTotals.discountTotal : (invoice.totalDiscount || invoice.discountAmount)) > 0) && (
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-400">Discount</span>
                            <span className="text-amber-400">
                              -{formatCurrency(isDraft ? localTotals.discountTotal : (invoice.totalDiscount || invoice.discountAmount || 0), currency)}
                            </span>
                          </div>
                        )}

                        <div className="border-t border-dark-600 my-1" />

                        <div className="flex justify-between text-base font-bold">
                          <span className="text-white">Total</span>
                          <span className="text-white">
                            {formatCurrency(isDraft ? localTotals.total : invoice.total, currency)}
                          </span>
                        </div>

                        {invoice.amountPaid > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-400">Amount Paid</span>
                            <span className="text-emerald-400">
                              {formatCurrency(invoice.amountPaid, currency)}
                            </span>
                          </div>
                        )}

                        {payments.length > 0 && amountDue > 0 && (
                          <div className="flex justify-between text-base font-bold text-rivvra-400 border-t border-dark-600 pt-2">
                            <span>Amount Due</span>
                            <span>{formatCurrency(amountDue, currency)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment info lines */}
                  {payments.length > 0 && (
                    <div className="border-t border-dark-700 px-6 py-4 space-y-2">
                      {payments.map((pmt, i) => (
                        <div key={pmt._id || i} className="flex items-center gap-2 text-sm text-emerald-400">
                          <Info size={14} className="shrink-0" />
                          <span>
                            Paid on {formatDate(pmt.date || pmt.paymentDate)}
                          </span>
                          <span className="font-medium ml-4">
                            {formatCurrency(pmt.amount, currency)}
                          </span>
                          {pmt._id && (
                            <button
                              onClick={() => handleVoidPayment(pmt._id)}
                              disabled={actionLoading === 'voidPayment'}
                              className="ml-auto text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-0.5 hover:bg-red-500/10 transition-colors"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'other' && (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {/* Left column */}
                    <div className="space-y-4">
                      {invoice.salesperson && (
                        <FormField label="Salesperson">
                          <span className="text-white">
                            {typeof invoice.salesperson === 'object'
                              ? invoice.salesperson.name || invoice.salesperson.email
                              : invoice.salesperson}
                          </span>
                        </FormField>
                      )}

                      {(invoice.creditNoteForId || invoice.parentInvoiceId) && (
                        <FormField label="Source Document">
                          <Link
                            to={orgPath(`/invoicing/invoices/${invoice.creditNoteForId || invoice.parentInvoiceId}`)}
                            className="text-rivvra-500 hover:underline text-sm"
                          >
                            View Original Invoice
                          </Link>
                        </FormField>
                      )}

                      <EditableField
                        label="Notes (Customer-Facing)"
                        value={isDraft ? editForm.notes : (invoice.notes || '')}
                        field="notes"
                        type="textarea"
                        editable={isDraft}
                        onSave={saveField}
                        placeholder="Add customer-facing notes..."
                        displayValue={
                          (isDraft ? editForm.notes : invoice.notes)
                            ? <p className="text-dark-300 text-sm whitespace-pre-wrap">{isDraft ? editForm.notes : invoice.notes}</p>
                            : undefined
                        }
                      />

                      <EditableField
                        label="Internal Notes"
                        value={isDraft ? editForm.internalNotes : (invoice.internalNotes || '')}
                        field="internalNotes"
                        type="textarea"
                        editable={isDraft}
                        onSave={saveField}
                        placeholder="Add internal notes..."
                        displayValue={
                          (isDraft ? editForm.internalNotes : invoice.internalNotes)
                            ? <p className="text-dark-300 text-sm whitespace-pre-wrap">{isDraft ? editForm.internalNotes : invoice.internalNotes}</p>
                            : undefined
                        }
                      />
                    </div>

                    {/* Right column */}
                    <div className="space-y-4">
                      {invoice.createdBy && (
                        <FormField label="Created By">
                          <span className="text-white">
                            {typeof invoice.createdBy === 'object'
                              ? invoice.createdBy.name || invoice.createdBy.email
                              : invoice.createdBy}
                          </span>
                        </FormField>
                      )}

                      {invoice.createdAt && (
                        <FormField label="Created At">
                          <span className="text-white">{formatDate(invoice.createdAt)}</span>
                        </FormField>
                      )}

                      {invoice.isRecurring && (
                        <FormField label="Recurring">
                          <span className="text-white">
                            {invoice.recurringInterval
                              ? `Every ${invoice.recurringInterval} ${invoice.recurringPeriod || 'month'}(s)`
                              : 'Yes'}
                          </span>
                          {invoice.nextRecurringDate && (
                            <p className="text-sm text-dark-400 mt-0.5">
                              Next: {formatDate(invoice.nextRecurringDate)}
                            </p>
                          )}
                        </FormField>
                      )}

                      {invoice.sourceDocument && (
                        <FormField label="Source Document">
                          <span className="text-white">{invoice.sourceDocument}</span>
                        </FormField>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── BOTTOM: Activities + Attachments (full width, 2-col) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chatter / Activity Panel */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <ActivityPanel
                orgSlug={orgSlug}
                entityType="invoice"
                entityId={invoiceId}
              />
            </div>

            {/* Attachments */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700">
                <div className="flex items-center gap-2">
                  <Paperclip size={14} className="text-dark-400" />
                  <h3 className="text-sm font-semibold text-white">Attachments</h3>
                  <span className="text-xs text-dark-500">({attachments.length})</span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Drop zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-rivvra-500 bg-rivvra-500/5'
                      : 'border-dark-600 hover:border-dark-500'
                  }`}
                >
                  {uploadingFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-rivvra-500" />
                      <span className="text-sm text-dark-400">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload size={18} className="text-dark-500" />
                      <p className="text-xs text-dark-400">
                        Click to upload or drag file here
                      </p>
                      <p className="text-xs text-dark-500">Max 10MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>

                {/* Attachment list */}
                {attachmentsLoading && attachments.length === 0 && (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 size={16} className="animate-spin text-dark-500" />
                  </div>
                )}

                {attachments.map((doc) => {
                  const docId = doc._id || doc.id;
                  const filename = doc.filename || doc.name || 'Untitled';
                  const isPreviewable = /\.(pdf|png|jpg|jpeg|gif|webp|svg)$/i.test(filename);
                  const url = invoicingApi.getAttachmentUrl(orgSlug, invoiceId, docId);

                  return (
                    <div
                      key={docId}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-800/50 border border-dark-700/50 group"
                    >
                      <FileText size={16} className="text-dark-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{filename}</p>
                        {doc.size && (
                          <p className="text-xs text-dark-500">{formatFileSize(doc.size)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isPreviewable && (
                          <button
                            onClick={() =>
                              setPreviewDoc({
                                filename,
                                mimeType: doc.mimeType || doc.contentType,
                                url,
                              })
                            }
                            className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        <a
                          href={url}
                          download={filename}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                          title="Download"
                        >
                          <Download size={14} />
                        </a>
                        <button
                          onClick={() => handleDeleteAttachment(docId)}
                          className="p-1 rounded hover:bg-red-500/10 text-dark-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         Modals
         ══════════════════════════════════════════════════════════════════ */}

      {showPaymentModal && (
        <RecordPaymentModal
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          currency={currency}
          amountDue={amountDue}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            fetchInvoice();
          }}
          showToast={showToast}
        />
      )}

      {showEmailModal && (
        <EmailInvoiceModal
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          customerEmail={invoice.contactEmail || invoice.customer?.email || ''}
          invoiceNumber={invoice.number || ''}
          onClose={() => setShowEmailModal(false)}
          onSuccess={() => {
            setShowEmailModal(false);
            showToast('Email sent');
          }}
          showToast={showToast}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Invoice"
          message={`Are you sure you want to delete ${invoice.number || 'this invoice'}? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={actionLoading === 'delete'}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {previewDoc && (
        <DocumentPreviewModal
          filename={previewDoc.filename}
          mimeType={previewDoc.mimeType}
          directUrl={previewDoc.url}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// InlineLineRow — editable line item row for draft invoices
// ============================================================================

function InlineLineRow({ line, index, currency, orgSlug, onUpdate, onRemove, onProductSelect }) {
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showConsultantSearch, setShowConsultantSearch] = useState(false);
  const [showTaxSelect, setShowTaxSelect] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const productTriggerRef = useRef(null);
  const consultantTriggerRef = useRef(null);
  const taxTriggerRef = useRef(null);

  const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * (1 - (Number(line.discount) || 0) / 100);

  const cellInputCls = 'w-full bg-dark-800 border border-rivvra-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500';

  const handleFieldClick = (field) => {
    setEditingField(field);
  };

  const handleFieldBlur = (field, value) => {
    setEditingField(null);
    onUpdate(index, field, value);
  };

  const handleFieldKeyDown = (e, field, value) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditingField(null);
      onUpdate(index, field, value);
    }
    if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  return (
    <tr className="border-b border-dark-700/50 hover:bg-dark-800/30">
      {/* Product */}
      <td className="px-6 py-2.5">
        <div
          ref={productTriggerRef}
          className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 flex items-center gap-1.5 min-h-[28px]"
          onClick={() => setShowProductSearch(true)}
        >
          <span className="text-white text-sm">{line.productName || <span className="text-dark-500 italic">Select product</span>}</span>
          <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
        </div>
        {showProductSearch && (
          <ProductSearch
            orgSlug={orgSlug}
            triggerRef={productTriggerRef}
            onSelect={(p) => onProductSelect(index, p)}
            onClose={() => setShowProductSearch(false)}
          />
        )}
      </td>

      {/* Consultant */}
      <td className="px-4 py-2.5">
        <div
          ref={consultantTriggerRef}
          className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 flex items-center gap-1.5 min-h-[28px]"
          onClick={() => setShowConsultantSearch(true)}
        >
          <span className="text-white text-sm">{line.consultantName || <span className="text-dark-500 italic">Consultant</span>}</span>
          <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
        </div>
        {showConsultantSearch && (
          <EmployeeSearch
            orgSlug={orgSlug}
            triggerRef={consultantTriggerRef}
            onSelect={(emp) => {
              onUpdate(index, 'consultantId', emp._id);
              onUpdate(index, 'consultantName', emp.fullName);
            }}
            onClose={() => setShowConsultantSearch(false)}
          />
        )}
      </td>

      {/* Description */}
      <td className="px-4 py-2.5">
        {editingField === 'description' ? (
          <input
            type="text"
            autoFocus
            defaultValue={line.description}
            onBlur={(e) => handleFieldBlur('description', e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'description', e.target.value)}
            className={cellInputCls}
          />
        ) : (
          <div
            className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 flex items-center gap-1.5 min-h-[28px]"
            onClick={() => handleFieldClick('description')}
          >
            <span className="text-dark-300 text-sm">{line.description || <span className="text-dark-500 italic">Description</span>}</span>
            <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
          </div>
        )}
      </td>

      {/* Start Date */}
      <td className="px-4 py-2.5">
        {editingField === 'startDate' ? (
          <input
            type="date"
            autoFocus
            defaultValue={line.startDate ? line.startDate.slice(0, 10) : ''}
            onBlur={(e) => handleFieldBlur('startDate', e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'startDate', e.target.value)}
            className={cellInputCls + ' w-36'}
          />
        ) : (
          <div
            className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 flex items-center gap-1.5 min-h-[28px]"
            onClick={() => handleFieldClick('startDate')}
          >
            <span className="text-white text-sm">{line.startDate ? formatDate(line.startDate) : <span className="text-dark-500 italic">Start Date</span>}</span>
            <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
          </div>
        )}
      </td>

      {/* End Date */}
      <td className="px-4 py-2.5">
        {editingField === 'endDate' ? (
          <input
            type="date"
            autoFocus
            defaultValue={line.endDate ? line.endDate.slice(0, 10) : ''}
            onBlur={(e) => handleFieldBlur('endDate', e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'endDate', e.target.value)}
            className={cellInputCls + ' w-36'}
          />
        ) : (
          <div
            className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 flex items-center gap-1.5 min-h-[28px]"
            onClick={() => handleFieldClick('endDate')}
          >
            <span className="text-white text-sm">{line.endDate ? formatDate(line.endDate) : <span className="text-dark-500 italic">End Date</span>}</span>
            <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
          </div>
        )}
      </td>

      {/* Qty */}
      <td className="px-4 py-2.5 text-right">
        {editingField === 'quantity' ? (
          <input
            type="number"
            autoFocus
            min="0"
            step="any"
            defaultValue={line.quantity}
            onBlur={(e) => handleFieldBlur('quantity', Number(e.target.value) || 0)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'quantity', Number(e.target.value) || 0)}
            className={cellInputCls + ' text-right w-16'}
          />
        ) : (
          <div
            className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 inline-flex items-center gap-1 min-h-[28px] justify-end w-full"
            onClick={() => handleFieldClick('quantity')}
          >
            <span className="text-white text-sm">{Number(line.quantity) || 1}</span>
            <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
          </div>
        )}
      </td>

      {/* Unit Price */}
      <td className="px-4 py-2.5 text-right">
        {editingField === 'unitPrice' ? (
          <input
            type="number"
            autoFocus
            min="0"
            step="any"
            defaultValue={line.unitPrice}
            onBlur={(e) => handleFieldBlur('unitPrice', Number(e.target.value) || 0)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'unitPrice', Number(e.target.value) || 0)}
            className={cellInputCls + ' text-right w-28'}
          />
        ) : (
          <div
            className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 inline-flex items-center gap-1 min-h-[28px] justify-end"
            onClick={() => handleFieldClick('unitPrice')}
          >
            <span className="text-white text-sm">{formatCurrency(line.unitPrice, currency)}</span>
            <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
          </div>
        )}
      </td>

      {/* Currency (read-only) */}
      <td className="px-4 py-2.5">
        <span className="text-white text-sm">{line.lineCurrency || currency || 'INR'}</span>
      </td>

      {/* Taxes */}
      <td className="px-4 py-2.5">
        <div
          ref={taxTriggerRef}
          className="cursor-pointer group/cell rounded px-1 -mx-1 py-0.5 hover:bg-dark-800 flex items-center gap-1 min-h-[28px]"
          onClick={() => setShowTaxSelect(true)}
        >
          <span className="text-dark-400 text-xs">
            {(line.taxNames || []).filter(Boolean).join(', ') ||
             (line.taxIds?.length ? `${line.taxIds.length} tax(es)` : <span className="text-dark-500 italic">Taxes</span>)}
          </span>
          <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
        </div>
        {showTaxSelect && (
          <TaxMultiSelect
            orgSlug={orgSlug}
            triggerRef={taxTriggerRef}
            selectedIds={line.taxIds || []}
            onChange={(newIds) => onUpdate(index, 'taxIds', newIds)}
            onClose={() => setShowTaxSelect(false)}
          />
        )}
      </td>

      {/* Amount (read-only) */}
      <td className="px-6 py-2.5 text-right text-white font-medium text-sm">
        {formatCurrency(lineTotal, currency)}
      </td>

      {/* Delete */}
      <td className="px-2 py-2.5">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-1 rounded hover:bg-red-500/10 text-dark-500 hover:text-red-400 transition-colors"
          title="Remove line"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

// ============================================================================
// FormField — label:value display row (Odoo-style) for read-only fields
// ============================================================================

function FormField({ label, children }) {
  return (
    <div>
      <span className="text-sm text-dark-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ============================================================================
// ActionBtn — compact action button for the top bar
// ============================================================================

function ActionBtn({ icon: Icon, label, onClick, loading, primary, danger }) {
  let cls =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap ';
  if (primary) {
    cls += 'bg-rivvra-500 hover:bg-rivvra-600 text-white';
  } else if (danger) {
    cls += 'border border-red-500/30 text-red-400 hover:bg-red-500/10';
  } else {
    cls += 'border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500';
  }

  return (
    <button onClick={onClick} disabled={loading} className={cls}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ============================================================================
// RecordPaymentModal
// ============================================================================

function RecordPaymentModal({ orgSlug, invoiceId, currency, amountDue, onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    amount: amountDue || 0,
    method: 'bank_transfer',
    date: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const inputCls =
    'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent text-sm';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    try {
      setSaving(true);
      await invoicingApi.recordPayment(orgSlug, {
        invoiceId,
        amount: Number(form.amount),
        method: form.method,
        date: form.date,
        reference: form.reference,
        notes: form.notes,
      });
      showToast('Payment recorded');
      onSuccess();
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-bold text-white">Record Payment</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Amount ({currency}) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputCls}
              autoFocus
            />
            {amountDue > 0 && (
              <p className="text-xs text-dark-400 mt-1">
                Amount due: {formatCurrency(amountDue, currency)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Payment Method</label>
            <select
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className={inputCls}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="upi">UPI</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Payment Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Reference / Transaction ID</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="e.g. TXN-123456"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes..."
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

// ============================================================================
// EmailInvoiceModal
// ============================================================================

function EmailInvoiceModal({ orgSlug, invoiceId, customerEmail, invoiceNumber, onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    to: customerEmail,
    subject: `Invoice ${invoiceNumber}`,
    message: `Please find attached invoice ${invoiceNumber}. Let us know if you have any questions.`,
  });
  const [sending, setSending] = useState(false);

  const inputCls =
    'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent text-sm';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.to) {
      showToast('Email address is required', 'error');
      return;
    }
    try {
      setSending(true);
      await invoicingApi.emailInvoice(orgSlug, invoiceId, {
        to: form.to,
        subject: form.subject,
        message: form.message,
      });
      onSuccess();
    } catch (err) {
      showToast(err.message || 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-bold text-white">Email Invoice</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              To <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={form.to}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
              placeholder="customer@email.com"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Email
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

// ============================================================================
// ConfirmModal
// ============================================================================

function ConfirmModal({ title, message, confirmLabel, danger, loading, onConfirm, onCancel }) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className={`p-2 rounded-lg ${danger ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
              <AlertTriangle size={20} className={danger ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-sm text-dark-400 mt-1">{message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                danger
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-rivvra-500 hover:bg-rivvra-600 text-white'
              }`}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ============================================================================
// ModalOverlay
// ============================================================================

function ModalOverlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
