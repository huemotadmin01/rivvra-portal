// ============================================================================
// InvoiceDetail.jsx — Odoo-style invoice detail with inline editing
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
import ActivityPanel from '../../components/shared/ActivityPanel';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import RecordMeta from '../../components/shared/RecordMeta';
import {
  ArrowLeft, Send, Trash2, Download, Mail, Copy,
  CreditCard, XCircle, RotateCcw, Loader2, X, FileText,
  AlertTriangle, Check, Info, Upload, Eye, Paperclip,
  User, Calendar, Clock, RefreshCw, BellRing, Edit3,
  Pencil, Plus, Search, Package, ShieldCheck, Sparkles,
} from 'lucide-react';

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

  const updatePos = useCallback(() => {
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownH = 250;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < dropdownH ? rect.top - dropdownH : rect.bottom + 4;
      setPos({ top, left: rect.left });
    }
  }, [triggerRef]);

  useEffect(() => {
    inputRef.current?.focus();
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    return () => window.removeEventListener('scroll', updatePos, true);
  }, [updatePos]);

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

function EmployeeSearch({ orgSlug, customerContactId, onSelect, onClose, triggerRef }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const searchTimer = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Position dropdown relative to trigger and reposition on scroll
  const updatePos = useCallback(() => {
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownH = 250;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < dropdownH ? rect.top - dropdownH : rect.bottom + 4;
      setPos({ top, left: rect.left });
    }
  }, [triggerRef]);

  useEffect(() => {
    inputRef.current?.focus();
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    return () => window.removeEventListener('scroll', updatePos, true);
  }, [updatePos]);

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
      let url = `/api/org/${orgSlug}/employee/employees?search=${encodeURIComponent(q)}&limit=20&status=active`;
      if (customerContactId) url += `&customerContactId=${customerContactId}`;
      const res = await api.request(url);
      const emps = res?.employees || res?.data || [];
      // Enrich with assignment status for the selected customer
      if (customerContactId) {
        emps.forEach(emp => {
          const assignment = (emp.assignments || []).find(a =>
            String(a.clientId) === String(customerContactId)
          );
          emp._assignmentStatus = assignment?.status || 'unknown';
        });
      }
      setResults(emps);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, customerContactId]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(val), 300);
  };

  // Use a more reliable portal positioning approach
  const getPosition = () => {
    if (!triggerRef?.current) return { top: 100, left: 100 };
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < 260 ? Math.max(10, rect.top - 260) : rect.bottom + 2;
    return { top, left: Math.min(rect.left, window.innerWidth - 300) };
  };

  return createPortal(
    <div ref={containerRef} style={{ position: 'fixed', ...getPosition(), zIndex: 9999 }} className="w-72 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl">
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
            onClick={() => {
              // Find the matching assignment for this customer
              const assignment = customerContactId
                ? (emp.assignments || []).find(a => String(a.clientId) === String(customerContactId))
                : null;
              onSelect({
                _id: emp._id || emp.id,
                fullName: emp.fullName,
                designation: emp.designation,
                clientBillingRate: assignment?.clientBillingRate || assignment?.billingRate || null,
                assignmentStatus: assignment?.status || null,
              });
              onClose();
            }}
            className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors border-b border-dark-700/50 last:border-0"
          >
            <div className="flex items-center gap-2">
              <User size={12} className="text-dark-400 shrink-0" />
              <span className="text-sm text-white">{emp.fullName}</span>
              {emp._assignmentStatus && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  emp._assignmentStatus === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-dark-700 text-dark-400'
                }`}>
                  {emp._assignmentStatus === 'active' ? 'Active' : 'Ended'}
                </span>
              )}
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
  const [searchParams, setSearchParams] = useSearchParams();
  // Yellow "AI-filled, verify" banner is opt-in via ?ai=1 on the URL
  // (set by VendorBillList after a PDF extraction). Dismissed on first edit.
  const [showAiBanner, setShowAiBanner] = useState(searchParams.get('ai') === '1');

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeTab, setActiveTab] = useState('lines');

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

  // ── Inline editing state ──
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState(null); // flash "Saved" indicator
  const [paymentTermsList, setPaymentTermsList] = useState([]);
  const [allTaxes, setAllTaxes] = useState([]);
  const [previewNumber, setPreviewNumber] = useState(null);
  const [customerDefaultProduct, setCustomerDefaultProduct] = useState(null); // { _id, name }
  const [consultantRates, setConsultantRates] = useState({}); // { consultantId: clientBillingRate }
  const [expenseCategories, setExpenseCategories] = useState([]); // vendor bill line categorization
  const [tdsConfigs, setTdsConfigs] = useState([]); // vendor bill TDS sections

  const isDraft = invoice?.status === 'draft';
  // Real Vendor Bills run on the BILL journal. Employee Bills (EMPBI) and
  // customer invoices share the same detail page but must not see these fields.
  const isVendorBill = invoice?.journalCode === 'BILL';

  // Vendor bills share the /invoicing/invoices/:id route with customer
  // invoices; override the parent crumb so it doesn't read "Customer Invoices".
  const { setDetailLabel, clearDetailLabel } = useBreadcrumbContext();
  useEffect(() => {
    if (!invoice?._id) return;
    const parent = '/invoicing/invoices';
    if (isVendorBill) {
      setDetailLabel(parent, 'Vendor Bills');
      return () => clearDetailLabel(parent);
    }
  }, [isVendorBill, invoice?._id, setDetailLabel, clearDetailLabel]);

  const countryCode = (() => {
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
            setCustomerDefaultProduct({ _id: product._id, name: product.name, internalRef: product.internalRef || '', hsnSacCode: product.hsnSacCode || '', unit: product.unit || '' });
            return;
          }
        }
        setCustomerDefaultProduct(null);
      } catch { setCustomerDefaultProduct(null); }
    })();
  }, [orgSlug, invoice?.contactId]);

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
      updates.customerGstin = contact.gstin;
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
          setCustomerDefaultProduct({ _id: product._id, name: product.name, internalRef: product.internalRef || '', hsnSacCode: product.hsnSacCode || '', unit: product.unit || '' });
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
        // Update lines with product
        const currentLines = editForm.lines || invoice?.lines || [];
        savePayload.lines = currentLines.map(line => ({
          ...line,
          productId: updates.defaultProductId,
          productName: updates.defaultProductName || '',
          internalRef: updates.defaultProductRef || '',
          hsnSacCode: updates.defaultProductHsn || '',
          unit: updates.defaultProductUnit || '',
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
  }, [orgSlug, invoiceId, showToast]);

  // ── Line item helpers ──

  const addLine = useCallback(() => {
    setEditForm(prev => {
      const newLines = [...prev.lines, {
        productId: customerDefaultProduct?._id || '',
        productName: customerDefaultProduct?.name || '',
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
        taxIds: [],
        taxNames: [],
        discount: 0,
      }];
      return { ...prev, lines: newLines };
    });
  }, [invoice, customerDefaultProduct]);

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
      if (Array.isArray(line.taxes) && line.taxes.length > 0 && typeof line.taxes[0] === 'object') {
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

      const lineTaxAmount = line.taxAmount != null
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
  const handleSend = async (opts = {}) => {
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
        if (window.confirm('A bill with this invoice number already exists for this vendor. Continue anyway?')) {
          return handleSend({ confirmDuplicate: true });
        }
      } else {
        showToast(err.message || 'Failed to confirm invoice', 'error');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
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
  const handleCancelEInvoice = async () => {
    const reason = window.prompt(
      'Cancel E-Invoice?\n\nChoose a reason:\n1 = Duplicate\n2 = Data Entry Mistake\n3 = Order Cancelled\n4 = Other\n\nEnter 1/2/3/4:',
      '2'
    );
    if (!reason) return;
    const reasonMap = { 1: 'Duplicate', 2: 'Data Entry Mistake', 3: 'Order Cancelled', 4: 'Other' };
    const cancelReason = reasonMap[reason.trim()] || 'Data Entry Mistake';
    const cancelRemarks = window.prompt('Optional remarks (max 100 chars):', '') || '';
    try {
      setActionLoading('cancelEInvoice');
      const res = await invoicingApi.cancelEInvoice(orgSlug, invoiceId, { cancelReason, cancelRemarks });
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
      const newLines = (extracted?.lines || []).map((l) => {
        const taxId = resolveTaxId(l.taxRate);
        return {
          description: l.description || '',
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          hsnSacCode: l.hsnSac || undefined,
          taxIds: taxId ? [taxId] : [],
          expenseCategory: l.expenseCategory || undefined,
          lineCurrency: extracted?.vendor?.gstin ? 'INR' : undefined,
        };
      });

      const updates = {
        date: extracted?.invoice?.date || undefined,
        dueDate: extracted?.invoice?.dueDate || extracted?.invoice?.date || undefined,
        currency: extracted?.vendor?.gstin ? 'INR' : undefined,
        vendorInvoiceNumber: extracted?.invoice?.number || undefined,
        placeOfSupply: extracted?.invoice?.placeOfSupply || undefined,
        gstTreatment: extracted?.invoice?.gstTreatment || undefined,
        customerGstin: extracted?.vendor?.gstin || undefined,
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

      showToast('Bill updated from PDF — please verify');
    } catch (err) {
      showToast(err.message || 'AI extraction failed', 'error');
    } finally {
      setAiExtracting(false);
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
            onClick={() => navigate(orgPath(listUrlForDoc(invoice)))}
            className="px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm rounded-lg transition-colors"
          >
            Back to List
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
  const isActionablePosted = isLifecyclePosted && !isCancelled && !isFullyPaid;
  const isOverdue = Boolean(
    invoice.dueDate
    && new Date(invoice.dueDate) < new Date()
    && !isFullyPaid
    && !isCancelled
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
              onClick={() => navigate(orgPath(listUrlForDoc(invoice)))}
              className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>

            {/* Draft actions */}
            {status === 'draft' && (
              <>
                <ActionBtn icon={Check} label="Confirm" onClick={handleSend} loading={actionLoading === 'send'} primary />
                {!isVendorBill && (
                  <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                )}
                {isVendorBill && (
                  <>
                    <input
                      ref={aiFileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAiReExtract(f); e.target.value = ''; }}
                    />
                    <ActionBtn
                      icon={Sparkles}
                      label={aiExtracting ? 'Reading PDF…' : 'Extract from PDF'}
                      onClick={() => aiFileInputRef.current?.click()}
                      loading={aiExtracting}
                    />
                  </>
                )}
                <ActionBtn icon={Trash2} label="Delete" onClick={() => setShowDeleteConfirm(true)} danger />
              </>
            )}

            {/* Posted + unpaid/partial/overdue actions */}
            {isActionablePosted && (
              <>
                <ActionBtn icon={CreditCard} label="Record Payment" onClick={() => setShowPaymentModal(true)} primary />
                {!isVendorBill && (
                  <ActionBtn icon={Send} label="Send Email" onClick={() => setShowEmailModal(true)} />
                )}
                {!isVendorBill && (
                  <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                )}
                <ActionBtn icon={FileText} label="Credit Note" onClick={handleCreateCreditNote} />
                {isOverdue && (
                  <ActionBtn icon={BellRing} label="Follow-up" onClick={handleSendFollowUp} loading={actionLoading === 'followup'} />
                )}
                <ActionBtn icon={XCircle} label="Cancel" onClick={() => setShowCancelConfirm(true)} danger />
                {(invoice.amountPaid || 0) === 0 && (
                  <ActionBtn icon={RotateCcw} label="Reset to Draft" onClick={handleResetToDraft} loading={actionLoading === 'reset'} />
                )}
              </>
            )}

            {/* E-Invoice button — Indian companies only, customer invoices only */}
            {invoice?.companyGstin && invoice?.type === 'customer_invoice' && !isDraft && (
              invoice.eInvoiceStatus === 'generated' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-800/50">
                  <ShieldCheck size={13} />
                  E-Invoice Generated
                </span>
              ) : (
                <ActionBtn
                  icon={ShieldCheck}
                  label={eInvoiceStep === 'submitting' ? 'Submitting to IRP...' : eInvoiceStep === 'validating' ? 'Validating...' : 'Generate E-Invoice'}
                  onClick={handleGenerateEInvoice}
                  loading={eInvoiceStep === 'validating' || eInvoiceStep === 'submitting'}
                />
              )
            )}

            {/* Paid actions — no Reset to Draft (has payments) */}
            {isFullyPaid && !isCancelled && (
              <>
                {!isVendorBill && (
                  <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                )}
                <ActionBtn icon={FileText} label="Credit Note" onClick={handleCreateCreditNote} />
                <ActionBtn icon={Copy} label="Duplicate" onClick={handleDuplicate} loading={actionLoading === 'duplicate'} />
              </>
            )}

            {/* Cancelled actions */}
            {status === 'cancelled' && (
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
              const label = step.charAt(0).toUpperCase() + step.slice(1);

              let cls = 'px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ';
              if (isActive) {
                // Distinct colors per active state
                if (step === 'draft') cls += 'bg-amber-600 text-white';
                else if (step === 'posted') cls += 'bg-blue-600 text-white';
                else if (step === 'paid') cls += 'bg-emerald-600 text-white';
                else cls += 'bg-rivvra-500 text-white';
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
            {isCancelled && (
              <div className="flex items-center">
                <div className="w-6 h-px mx-0.5 bg-dark-600" />
                <span className="px-4 py-1.5 text-xs font-semibold rounded-full bg-red-500/15 text-red-400">
                  Cancelled
                </span>
              </div>
            )}

            {/* Payment-status chip: Partial (and Overdue sub-chip) */}
            {!isCancelled && paymentStatus === 'partial' && (
              <span className="ml-2 px-3 py-1.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Partial
              </span>
            )}
            {!isCancelled && isOverdue && (
              <span className="ml-2 px-3 py-1.5 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                Overdue
              </span>
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
              {isFullyPaid && (
                <div className="absolute top-6 right-[-20px] rotate-[30deg] z-10 pointer-events-none">
                  <div className="bg-emerald-500/20 border-2 border-emerald-500/40 px-8 py-1.5 rounded">
                    <span className="text-emerald-500 font-extrabold text-3xl tracking-widest uppercase">
                      PAID
                    </span>
                  </div>
                </div>
              )}

              {/* AI-filled verify banner — shown on bills created via PDF extraction */}
              {isVendorBill && showAiBanner && (
                <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-800/40 flex items-start gap-3">
                  <Sparkles size={16} className="shrink-0 mt-0.5 text-amber-400" />
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-semibold text-amber-400 tracking-wide uppercase">AI-filled — please verify</p>
                    <p className="text-dark-300 mt-0.5">
                      Fields below were extracted from the PDF you uploaded. Double-check vendor,
                      amounts, GSTIN and Place of Supply before confirming the bill.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAiBanner(false);
                      const next = new URLSearchParams(searchParams);
                      next.delete('ai');
                      setSearchParams(next, { replace: true });
                    }}
                    className="shrink-0 p-1 rounded-lg text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Type label */}
              <p className="text-sm text-dark-400 mb-1">{typeLabel}</p>

              {/* Invoice number */}
              <h1 className="text-2xl font-bold mb-4">
                {invoice.number
                  ? <span className="text-white">{invoice.number}</span>
                  : <span className="text-dark-500 italic">{previewNumber || 'Draft Invoice'}</span>
                }
              </h1>

              {/* E-Invoice IRN block — shown after IRN is generated */}
              {invoice.eInvoiceStatus === 'generated' && invoice.irn && (
                <div className={`mb-6 p-3 rounded-lg flex flex-col sm:flex-row sm:items-start gap-2 border ${
                  invoice.eInvoiceMock
                    ? 'bg-amber-900/20 border-amber-800/40'
                    : 'bg-emerald-900/20 border-emerald-800/40'
                }`}>
                  <ShieldCheck size={16} className={`shrink-0 mt-0.5 ${invoice.eInvoiceMock ? 'text-amber-400' : 'text-emerald-400'}`} />
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-2 ${invoice.eInvoiceMock ? 'text-amber-400' : 'text-emerald-400'}`}>
                      E-Invoice Registered
                      {invoice.eInvoiceMock && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                          MOCK · NOT LIVE
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-dark-300 font-mono break-all">IRN: {invoice.irn}</p>
                    {invoice.ackNo && (
                      <p className="text-xs text-dark-400">Ack No: {invoice.ackNo} &nbsp;·&nbsp; {invoice.ackDt || ''}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelEInvoice}
                    disabled={actionLoading === 'cancelEInvoice'}
                    className="shrink-0 text-[11px] px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
                    title="Cancel IRN at IRP (within 24h)"
                  >
                    {actionLoading === 'cancelEInvoice' ? 'Cancelling…' : 'Cancel E-Invoice'}
                  </button>
                </div>
              )}

              {/* E-Invoice cancelled banner */}
              {invoice.eInvoiceStatus === 'cancelled' && invoice.irn && (
                <div className="mb-6 p-3 rounded-lg flex items-start gap-2 border bg-dark-800/60 border-dark-700">
                  <XCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-400">E-Invoice Cancelled</p>
                    <p className="text-xs text-dark-400 font-mono break-all">IRN: {invoice.irn}</p>
                    {invoice.irnCancelReason && (
                      <p className="text-xs text-dark-500">Reason: {invoice.irnCancelReason}</p>
                    )}
                  </div>
                </div>
              )}

              {/* E-Invoice step indicator — shown while generating */}
              {eInvoiceStep && eInvoiceStep !== 'done' && (
                <div className="mb-6 p-3 rounded-lg bg-dark-800 border border-dark-700 space-y-2">
                  {[
                    { key: 'validating', label: 'Validating invoice' },
                    { key: 'submitting', label: 'Submitting to IRP (Govt portal)' },
                  ].map(({ key, label }) => {
                    const isDone = eInvoiceStep === 'done' || (key === 'validating' && eInvoiceStep === 'submitting');
                    const isActive = eInvoiceStep === key;
                    const isErr = eInvoiceStep === 'error';
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        {isDone ? (
                          <Check size={13} className="text-emerald-400 shrink-0" />
                        ) : isActive && !isErr ? (
                          <Loader2 size={13} className="animate-spin text-rivvra-400 shrink-0" />
                        ) : isErr && isActive ? (
                          <XCircle size={13} className="text-red-400 shrink-0" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border border-dark-600 shrink-0" />
                        )}
                        <span className={isDone ? 'text-emerald-400' : isActive ? 'text-white' : 'text-dark-500'}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                  {eInvoiceStep === 'error' && eInvoiceError && (
                    <p className="text-xs text-red-400 mt-1 pl-5">{eInvoiceError}</p>
                  )}
                </div>
              )}

              {/* Form fields — 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {/* Left column */}
                <div className="space-y-4">
                  {/* Vendor/Customer — with contact lookup */}
                  <EditableField
                    label={isVendorBill ? 'Vendor' : 'Customer'}
                    value={editForm.contactName || invoice.contactName || invoice.customer?.name || ''}
                    field="contactId"
                    editable={isDraft}
                    onSave={() => {}}
                    placeholder={isVendorBill ? 'Select a vendor' : 'Select a customer'}
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
                        {addressLines.length > 0 && (
                          <div className="text-sm text-dark-400 mt-0.5">
                            {addressLines.map((line, i) => <div key={i}>{line}</div>)}
                          </div>
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

                  {/* India-only GST fields */}
                  {isIndia && (
                    <>
                      <EditableField
                        label="Place of Supply"
                        value={isDraft ? editForm.placeOfSupply : (invoice.placeOfSupply || '')}
                        field="placeOfSupply"
                        type="text"
                        editable={isDraft}
                        onSave={saveField}
                        placeholder="e.g. Maharashtra"
                      />

                      <EditableField
                        label="GST Treatment"
                        value={isDraft ? editForm.gstTreatment : (invoice.gstTreatment || '')}
                        field="gstTreatment"
                        type="select"
                        options={GST_TREATMENTS}
                        editable={isDraft}
                        onSave={saveField}
                      />
                    </>
                  )}

                  {/* US/CA: show a read-only country hint so users know they're in non-IN mode */}
                  {!isIndia && (
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Region</label>
                      <div className="text-sm text-white">
                        {countryCode === 'US' ? 'United States' : 'Canada'} —
                        <span className="text-dark-400"> GST fields hidden (use {countryCode === 'US' ? 'state sales tax' : 'GST/HST'} taxes on line items)</span>
                      </div>
                    </div>
                  )}

                  {/* Customer GSTIN — shown in address block above, no duplicate needed */}
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
                      <span className="text-white">{formatDate(isDraft ? (editForm.invoiceDate || editForm.date) : invoice.date, countryCode)}</span>
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
                      <span className={isOverdue ? 'text-red-400 font-medium' : 'text-white'}>
                        {formatDate(isDraft ? editForm.dueDate : invoice.dueDate, countryCode)}
                      </span>
                    }
                  />

                  {/* Vendor Bill: vendor's own invoice number (distinct from internal BILL/…) */}
                  {isVendorBill && (
                    <EditableField
                      label="Vendor Invoice #"
                      value={isDraft ? (editForm.vendorInvoiceNumber || '') : (invoice.vendorInvoiceNumber || '')}
                      field="vendorInvoiceNumber"
                      type="text"
                      editable={isDraft}
                      onSave={saveField}
                      placeholder="As printed on the vendor's bill"
                    />
                  )}

                  {/* Vendor Bill: TDS section dropdown (India) */}
                  {isVendorBill && isIndia && (
                    <EditableField
                      label="TDS Section"
                      value={isDraft ? (editForm.tdsConfigId || '') : (invoice.tdsConfigId || '')}
                      field="tdsConfigId"
                      type="select"
                      options={[
                        { value: '', label: 'No TDS' },
                        ...tdsConfigs.map(t => ({
                          value: t._id,
                          label: `${t.section} @ ${t.rate}% — ${t.description || ''}`.trim(),
                        })),
                      ]}
                      editable={isDraft}
                      displayValue={
                        <span className="text-white">
                          {invoice.tdsSection
                            ? `${invoice.tdsSection} @ ${invoice.tdsRate ?? 0}%`
                            : <span className="text-dark-500 italic">No TDS</span>}
                        </span>
                      }
                      onSave={async (_field, value) => {
                        const cfg = tdsConfigs.find(t => t._id === value);
                        const updates = {
                          tdsConfigId: value || null,
                          tdsSection: cfg?.section || null,
                          tdsRate: cfg ? Number(cfg.rate) || 0 : 0,
                        };
                        setEditForm(prev => ({ ...prev, ...updates }));
                        try {
                          setSaving(true);
                          const res = await invoicingApi.updateInvoice(orgSlug, invoiceId, updates);
                          if (res?.invoice) {
                            setInvoice(prev => ({ ...prev, ...res.invoice, payments: prev?.payments || [] }));
                          }
                          setSavedField('tdsConfigId');
                          setTimeout(() => setSavedField(null), 1500);
                        } catch (err) {
                          showToast(err.message || 'Failed to save', 'error');
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                  )}

                  <EditableField
                    label="Currency"
                    value={isDraft ? editForm.currency : currency}
                    field="currency"
                    type="select"
                    options={CURRENCIES}
                    editable={isDraft}
                    onSave={saveField}
                  />

                  {/* Journal (read-only) */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-dark-400 text-sm">Journal</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">
                        {invoice.journalName || invoice.journalCode || '-'}
                      </span>
                      {invoice.journalCode
                        && invoice.journalName
                        && invoice.journalCode.trim().toUpperCase() !== invoice.journalName.trim().toUpperCase() && (
                        <span className="text-xs bg-dark-700 text-dark-300 px-1.5 py-0.5 rounded">
                          {invoice.journalCode}
                        </span>
                      )}
                    </div>
                  </div>
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
                          {!isVendorBill && (
                            <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Consultant</th>
                          )}
                          {isVendorBill && (
                            <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3 min-w-[180px]">Expense Category</th>
                          )}
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Description</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Start Date</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">End Date</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3 w-20">Qty</th>
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
                                countryCode={countryCode}
                                orgSlug={orgSlug}
                                customerContactId={editForm.contactId || invoice?.contactId || ''}
                                onUpdate={updateLine}
                                onRemove={removeLine}
                                onProductSelect={handleProductSelect}
                                onConsultantSelect={handleConsultantSelect}
                                productLocked={!!(invoice?.contactId && li.productId && invoice?.contactId === editForm.contactId)}
                                isVendorBill={isVendorBill}
                                expenseCategories={expenseCategories}
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
                                    {li.product?.name || li.productName || <span className="text-dark-600 italic">—</span>}
                                  </td>
                                  <td className={`px-4 py-3 text-white ${isVendorBill ? 'min-w-[180px]' : ''}`}>
                                    {isVendorBill
                                      ? (li.expenseCategory || <span className="text-dark-600 italic">—</span>)
                                      : (li.consultantName || <span className="text-dark-600 italic">—</span>)}
                                  </td>
                                  <td className="px-4 py-3 text-dark-300 max-w-xs">
                                    {li.description || <span className="text-dark-600 italic">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-white">
                                    {li.startDate ? formatDate(li.startDate, countryCode) : <span className="text-dark-600 italic">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-white">
                                    {li.endDate ? formatDate(li.endDate, countryCode) : <span className="text-dark-600 italic">—</span>}
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
                          <span className="text-dark-400">Taxable Value</span>
                          <span className="text-white">
                            {formatCurrency(isDraft ? localTotals.subtotal : invoice.subtotal, currency)}
                          </span>
                        </div>

                        {/* Per-tax-type breakdown (CGST / SGST / IGST / TDS / CESS) */}
                        {(() => {
                          const sourceLines = isDraft ? (editForm.lines || []) : (invoice.lines || invoice.lineItems || []);
                          const breakdown = buildTaxBreakdown(sourceLines);
                          const taxTotalFallback = isDraft
                            ? localTotals.taxTotal
                            : (invoice.taxTotal || invoice.totalTax || invoice.taxAmount || 0);

                          if (breakdown.length > 0) {
                            return breakdown.map((t) => (
                              <div key={t.name} className="flex justify-between text-sm">
                                <span className="text-dark-400">{t.name}</span>
                                <span className="text-white">{formatCurrency(t.amount, currency)}</span>
                              </div>
                            ));
                          }
                          if (taxTotalFallback > 0) {
                            return (
                              <div className="flex justify-between text-sm">
                                <span className="text-dark-400">Taxes</span>
                                <span className="text-white">{formatCurrency(taxTotalFallback, currency)}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}

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

                        {/* Vendor Bill: TDS deduction + Net Payable */}
                        {isVendorBill && (Number(invoice.tdsRate) > 0 || Number(invoice.tdsAmount) > 0) && (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-dark-400">
                                TDS {invoice.tdsSection ? `(${invoice.tdsSection} @ ${invoice.tdsRate}%)` : ''}
                              </span>
                              <span className="text-amber-400">
                                -{formatCurrency(invoice.tdsAmount || 0, currency)}
                              </span>
                            </div>
                            <div className="flex justify-between text-base font-bold border-t border-dark-600 pt-1">
                              <span className="text-white">Net Payable</span>
                              <span className="text-white">
                                {formatCurrency(
                                  invoice.netPayable != null
                                    ? invoice.netPayable
                                    : ((isDraft ? localTotals.total : invoice.total) - (invoice.tdsAmount || 0)),
                                  currency,
                                )}
                              </span>
                            </div>
                          </>
                        )}

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
                            Paid on {formatDate(pmt.date || pmt.paymentDate, countryCode)}
                          </span>
                          <span className="font-medium ml-4">
                            {formatCurrency(pmt.amount, currency)}
                          </span>
                          {pmt._id && (
                            <button
                              onClick={() => setVoidPaymentId(pmt._id)}
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
                      {(invoice.salespersonName || invoice.salesperson) && (
                        <FormField label="Salesperson">
                          <span className="text-white">
                            {invoice.salespersonName
                              || (typeof invoice.salesperson === 'object'
                                ? invoice.salesperson.name || invoice.salesperson.email
                                : invoice.salesperson)}
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
                      <RecordMeta
                        createdAt={invoice.createdAt}
                        createdByName={
                          invoice.createdByName
                          || (typeof invoice.createdBy === 'object'
                            ? invoice.createdBy?.name || invoice.createdBy?.email
                            : invoice.createdBy) || null
                        }
                        updatedAt={invoice.updatedAt}
                        updatedByName={invoice.updatedByName}
                      />

                      {invoice.isRecurring && (
                        <FormField label="Recurring">
                          <span className="text-white">
                            {invoice.recurringInterval
                              ? `Every ${invoice.recurringInterval} ${invoice.recurringPeriod || 'month'}(s)`
                              : 'Yes'}
                          </span>
                          {invoice.nextRecurringDate && (
                            <p className="text-sm text-dark-400 mt-0.5">
                              Next: {formatDate(invoice.nextRecurringDate, countryCode)}
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
                        <button
                          onClick={() => handleDownloadAttachment(docId, filename)}
                          className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                          title="Download"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteAttachId(docId)}
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
          invoiceNumber={invoice.number || ''}
          currency={currency}
          total={invoice.total || 0}
          subtotal={invoice.subtotal || 0}
          amountDue={amountDue}
          invoiceType={invoice.type}
          isIndia={isIndia}
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

      {showCreditNoteModal && (
        <CreditNoteModal
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          invoiceNumber={invoice.number || ''}
          journalName={invoice.journalName || ''}
          onClose={() => setShowCreditNoteModal(false)}
          onSuccess={(newId) => {
            setShowCreditNoteModal(false);
            showToast('Credit note created');
            if (newId) navigate(orgPath(`/invoicing/invoices/${newId}`));
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

      {deleteAttachId && (
        <ConfirmModal
          title="Delete Attachment"
          message="Are you sure you want to delete this attachment?"
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteAttachment(deleteAttachId)}
          onCancel={() => setDeleteAttachId(null)}
        />
      )}

      {voidPaymentId && (
        <ConfirmModal
          title="Void Payment"
          message="Are you sure you want to void this payment? The invoice balance will be restored."
          confirmLabel="Void Payment"
          danger
          loading={actionLoading === 'voidPayment'}
          onConfirm={() => handleVoidPayment(voidPaymentId)}
          onCancel={() => setVoidPaymentId(null)}
        />
      )}

      {showCancelConfirm && (
        <ConfirmModal
          title="Cancel Invoice"
          message={`Are you sure you want to cancel ${invoice.number || 'this invoice'}? This action cannot be undone.`}
          confirmLabel="Cancel Invoice"
          danger
          loading={actionLoading === 'cancel'}
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {previewDoc && (
        <DocumentPreviewModal
          filename={previewDoc.filename}
          mimeType={previewDoc.mimeType}
          fetchUrl={previewDoc.url}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// InlineLineRow — editable line item row for draft invoices
// ============================================================================

function InlineLineRow({ line, index, currency, countryCode = 'IN', orgSlug, customerContactId, onUpdate, onRemove, onProductSelect, onConsultantSelect, productLocked, isVendorBill = false, expenseCategories = [] }) {
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
        {productLocked ? (
          <div className="flex items-center gap-1.5 min-h-[28px] px-1 -mx-1 py-0.5">
            <span className="text-white text-sm">{line.productName || '-'}</span>
          </div>
        ) : (
          <>
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
          </>
        )}
      </td>

      {/* Consultant (customer invoices) OR Expense Category (vendor bills) */}
      {isVendorBill ? (
        <td className="px-4 py-2.5 min-w-[180px]">
          <select
            value={line.expenseCategory || ''}
            onChange={(e) => onUpdate(index, 'expenseCategory', e.target.value)}
            className="w-full bg-transparent hover:bg-dark-800 border border-transparent hover:border-dark-600 focus:border-rivvra-500 rounded px-1 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 min-h-[28px]"
          >
            <option value="" className="bg-dark-800">Select category</option>
            {(expenseCategories || []).map((c) => (
              <option key={c._id} value={c.name} className="bg-dark-800">{c.name}</option>
            ))}
          </select>
        </td>
      ) : (
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
              customerContactId={customerContactId}
              triggerRef={consultantTriggerRef}
              onSelect={(emp) => {
                onConsultantSelect(index, emp);
              }}
              onClose={() => setShowConsultantSearch(false)}
            />
          )}
        </td>
      )}

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
            <span className="text-white text-sm">{line.startDate ? formatDate(line.startDate, countryCode) : <span className="text-dark-500 italic">Start Date</span>}</span>
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
            <span className="text-white text-sm">{line.endDate ? formatDate(line.endDate, countryCode) : <span className="text-dark-500 italic">End Date</span>}</span>
            <Pencil size={10} className="text-dark-600 opacity-0 group-hover/cell:opacity-100 shrink-0" />
          </div>
        )}
      </td>

      {/* Qty */}
      <td className="px-4 py-2.5 text-right w-28">
        {editingField === 'quantity' ? (
          <input
            type="number"
            autoFocus
            min="0"
            step="any"
            defaultValue={line.quantity}
            onBlur={(e) => handleFieldBlur('quantity', Number(e.target.value) || 0)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'quantity', Number(e.target.value) || 0)}
            className={cellInputCls + ' text-right w-full'}
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

function RecordPaymentModal({ orgSlug, invoiceId, invoiceNumber, currency, total, subtotal, amountDue, invoiceType, isIndia, onClose, onSuccess, showToast }) {
  const [journals, setJournals] = useState([]);
  const [tdsConfigs, setTdsConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    journalId: '',
    amount: amountDue || 0,
    method: 'bank_transfer',
    date: new Date().toISOString().slice(0, 10),
    memo: '',
  });
  const [tdsEnabled, setTdsEnabled] = useState(false);
  const [tdsConfigId, setTdsConfigId] = useState('');
  const [tdsBase, setTdsBase] = useState(subtotal || 0);
  const [tdsAmount, setTdsAmount] = useState(0);

  const inputCls = 'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent text-sm';
  const labelCls = 'block text-xs font-medium text-dark-400 mb-1';

  const selectedTds = tdsConfigs.find(t => t._id === tdsConfigId);
  const tdsRate = selectedTds ? (Number(selectedTds.rateIndividual) || 0) : 0;

  const isCustomerInvoice = invoiceType === 'customer_invoice';
  const showTdsWarning = isIndia && isCustomerInvoice && !tdsEnabled && Number(total) >= 30000;

  // Fetch journals + tds configs in parallel
  useEffect(() => {
    (async () => {
      try {
        const [jRes, tRes] = await Promise.all([
          invoicingApi.listJournals(orgSlug, { active: 'true' }).catch(() => ({ journals: [] })),
          invoicingApi.listTdsConfig(orgSlug, { active: 'true' }).catch(() => ({ rows: [] })),
        ]);
        const payableJournals = (jRes?.journals || []).filter(j => j.type === 'bank' || j.type === 'cash');
        setJournals(payableJournals);
        setTdsConfigs(tRes?.rows || []);
        if (payableJournals.length > 0) {
          const defaultJournal = payableJournals.find(j => j.type === 'bank') || payableJournals[0];
          setForm(f => ({ ...f, journalId: defaultJournal._id }));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orgSlug]);

  // Recompute TDS amount when tax or base changes
  useEffect(() => {
    if (!tdsEnabled || !selectedTds) {
      setTdsAmount(0);
      return;
    }
    const computed = Math.round((Number(tdsBase) || 0) * tdsRate) / 100;
    setTdsAmount(Math.round(computed * 100) / 100);
  }, [tdsEnabled, tdsConfigId, tdsBase, tdsRate, selectedTds]);

  // Auto-populate net amount = total - tds
  useEffect(() => {
    if (!tdsEnabled) {
      setForm(f => ({ ...f, amount: amountDue || 0 }));
    } else {
      const net = Math.max(0, Math.round(((Number(amountDue) || 0) - tdsAmount) * 100) / 100);
      setForm(f => ({ ...f, amount: net }));
    }
  }, [tdsEnabled, tdsAmount, amountDue]);

  const selectedJournal = journals.find(j => j._id === form.journalId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.journalId) {
      showToast('Select a journal', 'error');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('Enter a valid payment amount', 'error');
      return;
    }
    if (tdsEnabled) {
      if (!tdsConfigId) {
        showToast('Select a TDS section', 'error');
        return;
      }
      if (!tdsAmount || tdsAmount <= 0) {
        showToast('TDS amount must be positive', 'error');
        return;
      }
    }

    try {
      setSaving(true);

      if (tdsEnabled && selectedTds) {
        await invoicingApi.recordPayment(orgSlug, {
          invoiceId,
          amount: tdsAmount,
          method: 'tds',
          journal: 'TDS Deducted',
          date: form.date,
          reference: `TDS ${selectedTds.sectionCode} on ${invoiceNumber}`,
          notes: `${selectedTds.sectionCode} @ ${tdsRate}% on base ${tdsBase}`,
          isTds: true,
          tds: {
            configId: selectedTds._id,
            sectionCode: selectedTds.sectionCode,
            rate: tdsRate,
            baseAmount: Number(tdsBase) || 0,
            deductedAt: form.date,
          },
        });
      }

      await invoicingApi.recordPayment(orgSlug, {
        invoiceId,
        amount: Number(form.amount),
        method: form.method,
        journal: selectedJournal?.name || '',
        date: form.date,
        reference: form.memo || invoiceNumber || '',
        notes: '',
      });

      showToast(tdsEnabled ? 'Payment + TDS recorded' : 'Payment recorded');
      onSuccess();
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalSettled = (Number(form.amount) || 0) + (tdsEnabled ? tdsAmount : 0);
  const remaining = Math.max(0, Math.round(((Number(amountDue) || 0) - totalSettled) * 100) / 100);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 sticky top-0 bg-dark-850 z-10">
          <div>
            <h2 className="text-lg font-bold text-white">Record Payment</h2>
            <p className="text-xs text-dark-400 mt-0.5">
              {invoiceNumber} • Due {formatCurrency(amountDue, currency)}
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-rivvra-500" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* TDS Warning Banner */}
            {showTdsWarning && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-200">
                  <p className="font-medium">TDS may apply on this invoice</p>
                  <p className="text-amber-300/80 mt-0.5">Invoice total ≥ ₹30,000. If the customer deducted TDS under section 194C/194J, toggle "TDS Deducted" below.</p>
                </div>
              </div>
            )}

            {/* No journals warning */}
            {journals.length === 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-red-200">
                  <p className="font-medium">No bank or cash journal found</p>
                  <p className="text-red-300/80 mt-0.5">Add one under Invoicing → Configuration → Journals before recording a payment.</p>
                </div>
              </div>
            )}

            {/* Journal */}
            <div>
              <label className={labelCls}>Journal</label>
              <select
                value={form.journalId}
                onChange={(e) => setForm(f => ({ ...f, journalId: e.target.value }))}
                className={inputCls}
                disabled={journals.length === 0}
              >
                <option value="">Select journal…</option>
                {journals.map(j => (
                  <option key={j._id} value={j._id}>{j.name} ({j.type === 'bank' ? 'Bank' : 'Cash'})</option>
                ))}
              </select>
            </div>

            {/* Payment Method */}
            <div>
              <label className={labelCls}>Payment Method</label>
              <select
                value={form.method}
                onChange={(e) => setForm(f => ({ ...f, method: e.target.value }))}
                className={inputCls}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="manual">Manual</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Payment Date */}
            <div>
              <label className={labelCls}>Payment Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputCls}
              />
            </div>

            {/* TDS Toggle */}
            {isIndia && isCustomerInvoice && (
              <div className="border border-dark-700 rounded-lg overflow-hidden">
                <label className="flex items-center justify-between gap-3 px-3 py-2.5 bg-dark-800/50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={tdsEnabled}
                      onChange={(e) => setTdsEnabled(e.target.checked)}
                      className="w-4 h-4 accent-rivvra-500"
                    />
                    <span className="text-sm font-medium text-white">Customer deducted TDS</span>
                  </div>
                  {tdsEnabled && tdsAmount > 0 && (
                    <span className="text-xs text-rivvra-400 font-medium">
                      −{formatCurrency(tdsAmount, currency)}
                    </span>
                  )}
                </label>

                {tdsEnabled && (
                  <div className="p-3 space-y-3 border-t border-dark-700">
                    {tdsConfigs.length === 0 ? (
                      <p className="text-xs text-amber-300">
                        No TDS sections configured. Go to Invoicing → Configuration → TDS and click "Seed Defaults", then try again.
                      </p>
                    ) : (
                      <>
                        <div>
                          <label className={labelCls}>TDS Section</label>
                          <select
                            value={tdsConfigId}
                            onChange={(e) => setTdsConfigId(e.target.value)}
                            className={inputCls}
                          >
                            <option value="">Select section…</option>
                            {tdsConfigs.map(t => (
                              <option key={t._id} value={t._id}>
                                {t.sectionCode} — {t.description} ({t.rateIndividual}%)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>TDS Base (untaxed)</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={tdsBase}
                              onChange={(e) => setTdsBase(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>TDS Amount ({tdsRate}%)</label>
                            <input
                              type="number"
                              step="any"
                              value={tdsAmount}
                              onChange={(e) => setTdsAmount(Number(e.target.value) || 0)}
                              className={inputCls}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Amount */}
            <div>
              <label className={labelCls}>Amount Received</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                  className={inputCls + ' flex-1'}
                />
                <span className="text-dark-400 text-sm w-12 text-right">{currency}</span>
              </div>
            </div>

            {/* Memo */}
            <div>
              <label className={labelCls}>Reference / Memo</label>
              <input
                type="text"
                value={form.memo}
                onChange={(e) => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder={`e.g. UTR, cheque no., ${invoiceNumber}`}
                className={inputCls}
              />
            </div>

            {/* Summary */}
            <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-dark-300">
                <span>Invoice Due</span>
                <span>{formatCurrency(amountDue, currency)}</span>
              </div>
              {tdsEnabled && (
                <div className="flex justify-between text-dark-300">
                  <span>TDS Credit</span>
                  <span>−{formatCurrency(tdsAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-dark-300">
                <span>Payment Received</span>
                <span>−{formatCurrency(Number(form.amount) || 0, currency)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1.5 border-t border-dark-700">
                <span className={remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}>Remaining</span>
                <span className={remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                  {formatCurrency(remaining, currency)}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-dark-700">
              <button
                type="submit"
                disabled={saving || journals.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {tdsEnabled ? 'Record Payment + TDS' : 'Record Payment'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white text-sm transition-colors"
              >
                Discard
              </button>
            </div>
          </form>
        )}
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
// CreditNoteModal — Odoo-style: Reason, Journal, Reversal Date, Reverse options
// ============================================================================

function CreditNoteModal({ orgSlug, invoiceId, invoiceNumber, journalName, onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    reason: '',
    reversalDate: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const inputCls = 'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent text-sm';
  const labelCls = 'text-sm text-dark-400 py-2.5';

  const handleReverse = async (createNew = false) => {
    try {
      setSaving(true);
      const res = await invoicingApi.createCreditNote(orgSlug, invoiceId, {
        reason: form.reason,
        reversalDate: form.reversalDate,
        createNewInvoice: createNew,
      });
      onSuccess(res?.invoice?._id);
    } catch (err) {
      showToast(err.message || 'Failed to create credit note', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-bold text-white">Credit Note</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 items-center gap-y-2">
            <span className={labelCls}>Reason</span>
            <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason displayed on Credit Note" className={inputCls} autoFocus />
            <span className={labelCls}>Journal</span>
            <span className="text-white text-sm py-2.5">{journalName || 'Default'}</span>
            <span className={labelCls}>Reversal date</span>
            <input type="date" value={form.reversalDate} onChange={e => setForm(f => ({ ...f, reversalDate: e.target.value }))} className={inputCls} />
          </div>

          <div className="flex gap-3 pt-4 mt-2 border-t border-dark-700">
            <button onClick={() => handleReverse(false)} disabled={saving} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Reverse
            </button>
            <button onClick={() => handleReverse(true)} disabled={saving} className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white text-sm transition-colors disabled:opacity-50">
              Reverse and Create Invoice
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white text-sm transition-colors">
              Discard
            </button>
          </div>
        </div>
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
