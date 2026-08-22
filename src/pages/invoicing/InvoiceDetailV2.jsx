// ============================================================================
// InvoiceDetailV2.jsx — Odoo-style invoice detail with inline editing, on ds
// ============================================================================
//
// The largest page in the portal (5,189 legacy lines) and the one that decides
// what a customer is billed. Nothing about the arithmetic moves: this file is
// assembled from byte-identical slices of the legacy page plus a rewritten
// render, and every slice is diffed back against the original.
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
//   • `InlineLineRow`'s own `lineTotal`.
//
// The money that lives *inside* the render could not be spliced with the logic,
// so each expression was copied to its own cell and is asserted by string count
// against the legacy file. The four `lineTotal` variants are NOT interchangeable
// — they differ in fallback chain and in whether the discount term applies:
//
//   EMPBI          li.subtotal ?? li.amount ?? (qty * price * (1 - disc/100))
//   vendor bill    li.subtotal              ?? (qty * price * (1 - disc/100))
//   customer inv   li.subtotal              ?? (qty * price * (1 - disc/100))
//   draft fallback li.total ?? li.subtotal  ?? (qty * price)          ← no disc
//
// The legacy file's own lint problems come across with the code that causes
// them, including two React Compiler diagnostics (`Cannot access refs during
// render` in `useDebounce`, and a synchronous `setState` inside an effect).
// Both are pre-existing and neither is silenced.
//
// Deliberate render-layer changes from legacy:
//   • `ConfirmModal` and `ModalOverlay` are gone — ds `ConfirmDialog` and
//     `Modal` replace them, so the whole page gets focus trapping and the
//     Enter-does-not-confirm-a-destructive-dialog rule for free.
//   • `ActionBtn` labels no longer hide below the `sm` breakpoint. An
//     unlabelled icon row on a page with a Delete and a Cancel is worse.
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
  User, BellRing, Pencil, Plus, Search, Package, ShieldCheck,
  Sparkles, CheckCircle2,
} from 'lucide-react';
import {
  Panel, Chip, Button, Input, Select, Textarea, Field,
  Modal, ConfirmDialog, Callout, PageSpinner, StageBar, Tabs,
} from '../../components/ds';

// ── Shared render tokens ─────────────────────────────────────────────────
// The whole page is label-over-value pairs and portalled typeaheads, so the
// two shapes are defined once here rather than per component.

const fieldLabelStyle = { font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const valueStyle = { color: 'var(--fg)', font: "450 13px/1.5 'Inter', system-ui, sans-serif" };
const mutedStyle = { color: 'var(--fg-4)', font: "400 12px/1.5 'Inter', system-ui, sans-serif" };
const microStyle = { font: "500 10px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)' };

const popoverShell = {
  borderRadius: 10, background: 'var(--surface-2)',
  boxShadow: '0 0 0 1px var(--line-2), 0 18px 44px rgba(0,0,0,.38)',
  overflow: 'hidden',
};
const popoverSearchRow = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 10px', borderBottom: '1px solid var(--line-2)',
};
const popoverInput = {
  flex: 1, background: 'transparent', border: 0, outline: 'none',
  color: 'var(--fg)', font: "450 13px/1.4 'Inter', system-ui, sans-serif",
};
const popoverRow = {
  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
  background: 'none', border: 0, padding: '8px 12px',
  borderBottom: '1px solid var(--line-2)',
};
const popoverNote = {
  padding: '12px', margin: 0, textAlign: 'center',
  font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
};
// Cells in the editable draft grid: transparent until hovered, ring on focus.
const cellShellStyle = {
  display: 'flex', alignItems: 'center', gap: 6, minHeight: 28,
  cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px',
};
const cellInputStyle = {
  height: 30, width: '100%', padding: '0 8px',
  borderRadius: 8, border: 'none', outline: 'none',
  background: 'var(--surface-2)', color: 'var(--fg)',
  boxShadow: '0 0 0 1px var(--brand-line)',
  font: "450 13px/1 'Inter', system-ui, sans-serif",
};
const thStyle = {
  textAlign: 'left', whiteSpace: 'nowrap',
  font: "500 10px/1.4 'Inter', system-ui, sans-serif",
  letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)',
  padding: '10px 16px', background: 'var(--surface-2)',
};
const thRight = { ...thStyle, textAlign: 'right' };
const tdStyle = { padding: '10px 16px', color: 'var(--fg)', font: "450 13px/1.5 'Inter', system-ui, sans-serif", verticalAlign: 'top' };
const tdMuted = { ...tdStyle, color: 'var(--fg-3)' };
const tdRight = { ...tdStyle, textAlign: 'right' };
const trStyle = { borderBottom: '1px solid var(--line-2)' };
const dash = <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>—</span>;
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

  // If custom children provided (like contact lookup), render those when editing
  if (children && editable && editing) {
    return (
      <div>
        <span style={fieldLabelStyle}>{label}</span>
        <div style={{ marginTop: 2 }}>{children({ onClose: () => setEditing(false) })}</div>
      </div>
    );
  }

  // Read-only mode
  if (!editable || !editing) {
    return (
      <div
        className={editable ? 'ds-editable' : undefined}
        style={editable ? { cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px' } : undefined}
        onClick={() => editable && setEditing(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={fieldLabelStyle}>{label}</span>
          {editable && <Pencil size={11} style={{ color: 'var(--fg-4)', opacity: 0.55 }} />}
        </div>
        <div style={{ marginTop: 2 }}>
          {displayValue !== undefined ? displayValue : (
            <span style={{ color: 'var(--fg)' }}>
              {value || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>{placeholder || 'Click to set'}</span>}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Editing mode
  return (
    <div>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={{ marginTop: 2 }}>
        {type === 'select' ? (
          <Select
            ref={inputRef}
            value={localValue}
            onChange={(e) => { setLocalValue(e.target.value); }}
            onBlur={() => { handleSave(); }}
          >
            <option value="">-- Select --</option>
            {(options || []).filter(opt => opt != null).map((opt, i) => {
              // typeof null === 'object' is the classic JS gotcha that crashes
              // this map with "Cannot read properties of null (reading 'value')"
              // when an upstream API returns a sparse list — null-check first.
              const isObj = typeof opt === 'object';
              const val = isObj ? (opt.value ?? '') : opt;
              const lbl = isObj ? (opt.label ?? String(val)) : opt;
              return <option key={val || `opt-${i}`} value={val}>{lbl}</option>;
            })}
          </Select>
        ) : type === 'textarea' ? (
          <Textarea
            ref={inputRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            rows={3}
            style={{ resize: 'none' }}
            placeholder={placeholder}
          />
        ) : (
          <Input
            ref={inputRef}
            type={type}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
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
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px', borderRadius: 8,
        background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--brand-line)',
      }}>
        <Search size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search contacts..."
          style={popoverInput}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4)' }} />}
      </div>

      {showDropdown && (query.length > 0) && (
        <div style={{
          ...popoverShell,
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          maxHeight: 240, overflowY: 'auto', zIndex: 50,
        }}>
          {results.length === 0 && !loading && (
            <div style={popoverNote}>
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
                style={{ ...popoverRow, padding: '9px 12px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: "500 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{cName}</span>
                  {cType && <Chip tone="neutral" uppercase>{cType}</Chip>}
                </div>
                {cEmail && <p style={{ ...mutedStyle, margin: '2px 0 0' }}>{cEmail}</p>}
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

function ProductSearch({ orgSlug, currency, onSelect, onClose, triggerRef }) {
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
    <div
      ref={containerRef}
      style={{ ...popoverShell, position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 288 }}
    >
      <div style={popoverSearchRow}>
        <Search size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search products..."
          style={popoverInput}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
        {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4)' }} />}
      </div>
      <div style={{ maxHeight: 192, overflowY: 'auto' }}>
        {results.length === 0 && !loading && (
          <div style={popoverNote}>No products found</div>
        )}
        {results.map((p) => (
          <button
            key={p._id || p.id}
            type="button"
            onClick={() => { onSelect(p); onClose(); }}
            style={popoverRow}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{p.name}</span>
            </div>
            {p.defaultPrice != null && (
              <p style={{ ...mutedStyle, margin: '2px 0 0 20px' }}>{formatCurrency(p.defaultPrice, currency)}</p>
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
    <div ref={containerRef} style={{ ...style, ...popoverShell, width: 224 }}>
      <div style={{ ...microStyle, padding: '8px 12px', borderBottom: '1px solid var(--line-2)' }}>Select Taxes</div>
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
          </div>
        )}
        {!loading && taxes.length === 0 && (
          <div style={popoverNote}>No taxes configured</div>
        )}
        {taxes.map((t) => {
          const tId = t._id || t.id;
          const isSelected = selectedIds.includes(tId);
          return (
            <button
              key={tId}
              type="button"
              onClick={() => toggleTax(tId)}
              style={{ ...popoverRow, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: isSelected ? 'var(--brand)' : 'transparent',
                color: isSelected ? 'var(--brand-on)' : 'transparent',
                boxShadow: isSelected ? 'none' : 'inset 0 0 0 1px var(--line-strong)',
              }}>
                {isSelected && <Check size={10} />}
              </span>
              <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{t.name}</span>
              {t.rate != null && <span style={{ ...mutedStyle, marginLeft: 'auto' }}>{t.rate}%</span>}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '7px 10px', borderTop: '1px solid var(--line-2)', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" type="button" onClick={onClose}>Done</Button>
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
      let url = `/api/org/${orgSlug}/employee/employees?search=${encodeURIComponent(q)}&limit=20`;
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
    <div
      ref={containerRef}
      style={{ position: 'fixed', ...getPosition(), zIndex: 9999, width: 288, ...popoverShell }}
    >
      <div style={popoverSearchRow}>
        <Search size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search employees..."
          style={popoverInput}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
        {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4)' }} />}
      </div>
      <div style={{ maxHeight: 192, overflowY: 'auto' }}>
        {results.length === 0 && !loading && (
          <div style={popoverNote}>No employees found</div>
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
            style={popoverRow}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <User size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{emp.fullName}</span>
              {emp.status && emp.status !== 'active' && (
                <Chip tone="danger" style={{ textTransform: 'capitalize' }}>{emp.status}</Chip>
              )}
              {emp._assignmentStatus && (
                <Chip tone={emp._assignmentStatus === 'active' ? 'brand' : 'neutral'}>
                  {emp._assignmentStatus === 'active' ? 'Active' : 'Ended'}
                </Chip>
              )}
            </div>
            {emp.designation && (
              <p style={{ ...mutedStyle, margin: '2px 0 0 20px' }}>{emp.designation}</p>
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

  // ── Loading state ──
  if (loading) return <PageSpinner label="Loading invoice…" />;

  // ── Error state ──
  if (error || !invoice) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Panel style={{ maxWidth: 380 }}>
          <div style={{ padding: 12, textAlign: 'center' }}>
            <AlertTriangle size={36} style={{ color: 'var(--danger)' }} />
            <h2 style={{ font: "600 17px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '12px 0 4px' }}>
              Invoice Not Found
            </h2>
            <p style={{ ...mutedStyle, margin: '0 0 16px' }}>{error || 'The invoice could not be loaded.'}</p>
            <Button onClick={() => navigate(orgPath(listUrlForDoc(invoice)))}>Back to List</Button>
          </div>
        </Panel>
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

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* GST payment-hold strip (vendor bills, posted). Soft warning. */}
      {isVendorBill && !isDraft && status !== 'cancelled' && (
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--line-2)',
          background: onHold ? 'var(--danger-soft)' : 'var(--surface-1)',
        }}>
          <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
            {onHold ? (
              <>
                <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)' }}>Payment on hold</span>
                <span style={{ font: "400 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {invoice.gstHold?.reason}{invoice.gstHold?.source === 'reconciliation' ? ' · auto from 2B' : ''}
                </span>
                <Button variant="ghost" size="sm" onClick={handleToggleGstHold} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--danger)' }}>
                  Release hold
                </Button>
              </>
            ) : (
              <>
                <span style={mutedStyle}>No GST payment hold on this bill.</span>
                <Button variant="secondary" size="sm" onClick={handleToggleGstHold} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  Hold payment
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         TOP BAR — Actions + Status Stepper
         ══════════════════════════════════════════════════════════════════ */}
      <div style={{ borderBottom: '1px solid var(--line-2)', background: 'var(--surface-1)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {/* Left: Back + Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back to list"
              onClick={() => navigate(orgPath(listUrlForDoc(invoice)))}
              style={{ flexShrink: 0 }}
              iconLeft={<ArrowLeft size={18} />}
            />

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
                      style={{ display: 'none' }}
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

            {/* Posted credit note — limited actions (no Record Payment / Credit Note) */}
            {isCreditNote && isLifecyclePosted && !isCancelled && (
              <>
                {!isFullyPaid && (
                  <ActionBtn icon={CheckCircle2} label="Mark as Applied" onClick={handleMarkApplied} loading={actionLoading === 'markApplied'} primary />
                )}
                {!isVendorBill && (
                  <ActionBtn icon={Send} label="Send Email" onClick={() => setShowEmailModal(true)} />
                )}
                {!isVendorBill && (
                  <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                )}
                <ActionBtn icon={XCircle} label="Cancel" onClick={() => setShowCancelConfirm(true)} danger />
                {(invoice.amountPaid || 0) === 0 && (
                  <ActionBtn icon={RotateCcw} label="Reset to Draft" onClick={handleResetToDraft} loading={actionLoading === 'reset'} />
                )}
              </>
            )}

            {/* Reversed source invoice — read-only; only Print/PDF */}
            {isReversed && !isCreditNote && !isCancelled && (
              <>
                {!isVendorBill && (
                  <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                )}
              </>
            )}

            {/* E-Invoice button — Indian companies only, customer invoices only.
                `isIndia` is belt-and-suspenders on top of the companyGstin check
                (guards against a GSTIN mis-entered on a non-India company). */}
            {isIndia && invoice?.companyGstin && invoice?.type === 'customer_invoice' && !isDraft && (
              invoice.eInvoiceStatus === 'generated' ? (
                <Chip tone="brand" dot={false}>
                  <ShieldCheck size={13} /> E-Invoice Generated
                </Chip>
              ) : (
                <ActionBtn
                  icon={ShieldCheck}
                  label={eInvoiceStep === 'submitting' ? 'Submitting to IRP...' : eInvoiceStep === 'validating' ? 'Validating...' : 'Generate E-Invoice'}
                  onClick={handleGenerateEInvoice}
                  loading={eInvoiceStep === 'validating' || eInvoiceStep === 'submitting'}
                />
              )
            )}

            {/* Paid actions — no Reset to Draft (has payments). Excludes
                credit notes: their CN-specific block above already provides
                Print/PDF, and Credit Note / Duplicate don't apply. */}
            {isFullyPaid && !isCancelled && !isCreditNote && (
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

            {/* Archive / Unarchive — gated on financially-closed states only:
                draft, cancelled, or fully paid. Hidden otherwise so users
                can't accidentally hide outstanding receivables / payables.
                Backend rejects with 400 as defense-in-depth. */}
            {(() => {
              const isClosed = ['draft', 'cancelled'].includes(invoice.status) || invoice.paymentStatus === 'paid';
              if (invoice.archived) {
                return (
                  <ActionBtn
                    icon={ArchiveRestore}
                    label="Unarchive"
                    onClick={async () => {
                      try {
                        await invoicingApi.unarchiveInvoice(orgSlug, invoiceId);
                        setInvoice((prev) => ({ ...prev, archived: false }));
                        showToast('Unarchived');
                      } catch (err) {
                        showToast(err?.message || 'Failed to unarchive', 'error');
                      }
                    }}
                  />
                );
              }
              if (!isClosed) return null;
              return (
                <ActionBtn
                  icon={Archive}
                  label="Archive"
                  onClick={async () => {
                    try {
                      await invoicingApi.archiveInvoice(orgSlug, invoiceId);
                      setInvoice((prev) => ({ ...prev, archived: true }));
                      showToast('Archived');
                    } catch (err) {
                      showToast(err?.message || 'Failed to archive', 'error');
                    }
                  }}
                />
              );
            })()}

            {/* Save indicator */}
            {saving && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, ...mutedStyle }}>
                <Loader2 size={12} className="animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            {savedField && !saving && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, ...mutedStyle, color: 'var(--brand-ink)' }}>
                <Check size={12} />
                <span>Saved</span>
              </div>
            )}
          </div>

          {/* Right: Status Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <StageBar
              interactive={false}
              value={STATUS_STEPS[stepIndex]}
              tone={isCancelled ? 'lost' : 'default'}
              stages={STATUS_STEPS.map((step) => ({
                id: step,
                // Credit notes get "Applied" instead of "Paid" — they're offsets,
                // not receivables; no cash actually changes hands.
                label: step === 'paid' && isCreditNote
                  ? 'Applied'
                  : step.charAt(0).toUpperCase() + step.slice(1),
              }))}
            />
            {isCancelled && <Chip tone="danger">Cancelled</Chip>}
            {isReversed && !isCancelled && <Chip tone="purple">Reversed</Chip>}

            {/* Payment-status chip: Partial (and Overdue sub-chip) */}
            {!isCancelled && paymentStatus === 'partial' && <Chip tone="warn">Partial</Chip>}
            {!isCancelled && isOverdue && <Chip tone="danger">Overdue</Chip>}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         BODY
         ══════════════════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'grid', gap: 24 }}>

          {/* Header card with PAID stamp */}
          <Panel style={{ position: 'relative', overflow: 'hidden' }}>
            {/* PAID / APPLIED stamp overlay */}
            {isFullyPaid && (
              <div style={{ position: 'absolute', top: 24, right: -20, transform: 'rotate(30deg)', zIndex: 10, pointerEvents: 'none' }}>
                <div style={{
                  padding: '6px 32px', borderRadius: 4,
                  border: `2px solid ${isCreditNote ? 'var(--acc-purple)' : 'var(--brand-line)'}`,
                  background: isCreditNote ? 'var(--acc-purple-soft)' : 'var(--brand-soft)',
                }}>
                  <span style={{
                    font: "800 30px/1 'Inter', system-ui, sans-serif", letterSpacing: '.12em',
                    color: isCreditNote ? 'var(--acc-purple)' : 'var(--brand-ink)',
                  }}>
                    {isCreditNote ? 'APPLIED' : 'PAID'}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 16, padding: 4 }}>
              {/* AI-filled verify banner — shown on bills created via PDF extraction */}
              {isVendorBill && showAiBanner && (
                <Callout tone="warn" icon={<Sparkles size={16} />}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...microStyle, color: 'inherit', fontWeight: 600, margin: 0 }}>AI-filled — please verify</p>
                      <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", margin: '2px 0 0' }}>
                        Fields below were extracted from the PDF you uploaded. Double-check vendor,
                        amounts, GSTIN and Place of Supply before confirming the bill.
                      </p>
                    </div>
                    <Button
                      variant="ghost" size="sm" aria-label="Dismiss"
                      style={{ flexShrink: 0, color: 'inherit' }}
                      iconLeft={<X size={14} />}
                      onClick={() => {
                        setShowAiBanner(false);
                        const next = new URLSearchParams(searchParams);
                        next.delete('ai');
                        setSearchParams(next, { replace: true });
                      }}
                    />
                  </div>
                </Callout>
              )}

              <div>
                {/* Type label */}
                <p style={{ ...mutedStyle, margin: '0 0 4px' }}>{typeLabel}</p>

                {/* Invoice number */}
                <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', font: "700 22px/1.25 'Inter', system-ui, sans-serif", letterSpacing: '-0.02em', margin: 0 }}>
                  {invoice.number
                    ? <span style={{ color: 'var(--fg)' }}>{invoice.number}</span>
                    : <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>{previewNumber || 'Draft Invoice'}</span>
                  }
                  {invoice.archived && <Chip tone="neutral" uppercase>Archived</Chip>}
                </h1>
              </div>

              {/* E-Invoice IRN block — shown after IRN is generated */}
              {invoice.eInvoiceStatus === 'generated' && invoice.irn && (
                <Callout tone={invoice.eInvoiceMock ? 'warn' : 'brand'} icon={<ShieldCheck size={16} />}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 2 }}>
                      <p style={{ ...microStyle, color: 'inherit', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        E-Invoice Registered
                        {invoice.eInvoiceMock && <Chip tone="warn" uppercase>Mock · not live</Chip>}
                      </p>
                      <p style={{ font: "400 11.5px/1.5 ui-monospace, SFMono-Regular, monospace", color: 'var(--fg-3)', margin: 0, wordBreak: 'break-all' }}>
                        IRN: {invoice.irn}
                      </p>
                      {invoice.ackNo && (
                        <p style={{ ...mutedStyle, margin: 0 }}>Ack No: {invoice.ackNo} &nbsp;·&nbsp; {invoice.ackDt || ''}</p>
                      )}
                    </div>
                    <Button
                      variant="secondary" size="sm" type="button"
                      onClick={handleCancelEInvoice}
                      disabled={actionLoading === 'cancelEInvoice'}
                      title="Cancel IRN at IRP (within 24h)"
                      style={{ flexShrink: 0, color: 'var(--danger)' }}
                    >
                      {actionLoading === 'cancelEInvoice' ? 'Cancelling…' : 'Cancel E-Invoice'}
                    </Button>
                  </div>
                </Callout>
              )}

              {/* E-Invoice cancelled banner */}
              {invoice.eInvoiceStatus === 'cancelled' && invoice.irn && (
                <Callout tone="neutral" icon={<XCircle size={16} style={{ color: 'var(--danger)' }} />}>
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <p style={{ ...microStyle, color: 'var(--danger)', fontWeight: 600, margin: 0 }}>E-Invoice Cancelled</p>
                    <p style={{ font: "400 11.5px/1.5 ui-monospace, SFMono-Regular, monospace", color: 'var(--fg-3)', margin: 0, wordBreak: 'break-all' }}>
                      IRN: {invoice.irn}
                    </p>
                    {invoice.irnCancelReason && <p style={{ ...mutedStyle, margin: 0 }}>Reason: {invoice.irnCancelReason}</p>}
                  </div>
                </Callout>
              )}

              {/* E-Invoice step indicator — shown while generating */}
              {eInvoiceStep && eInvoiceStep !== 'done' && (
                <div style={{ padding: 12, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)', display: 'grid', gap: 8 }}>
                  {[
                    { key: 'validating', label: 'Validating invoice' },
                    { key: 'submitting', label: 'Submitting to IRP (Govt portal)' },
                  ].map(({ key, label }) => {
                    const isDone = eInvoiceStep === 'done' || (key === 'validating' && eInvoiceStep === 'submitting');
                    const isActive = eInvoiceStep === key;
                    const isErr = eInvoiceStep === 'error';
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, font: "400 12px/1.4 'Inter', system-ui, sans-serif" }}>
                        {isDone ? (
                          <Check size={13} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
                        ) : isActive && !isErr ? (
                          <Loader2 size={13} className="animate-spin" style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
                        ) : isErr && isActive ? (
                          <XCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                        ) : (
                          <span style={{ width: 12, height: 12, borderRadius: 99, flexShrink: 0, boxShadow: 'inset 0 0 0 1px var(--line-strong)' }} />
                        )}
                        <span style={{ color: isDone ? 'var(--brand-ink)' : isActive ? 'var(--fg)' : 'var(--fg-4)' }}>{label}</span>
                      </div>
                    );
                  })}
                  {eInvoiceStep === 'error' && eInvoiceError && (
                    <p style={{ ...mutedStyle, color: 'var(--danger)', margin: '2px 0 0 20px' }}>{eInvoiceError}</p>
                  )}
                </div>
              )}

              {/* Form fields — 2-column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', columnGap: 32, rowGap: 16 }}>
                {/* Left column */}
                <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
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
                          style={{ color: 'var(--brand-ink)', font: "600 13px/1.5 'Inter', system-ui, sans-serif", cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                          onClick={(e) => {
                            const cId = editForm.contactId || invoice.contactId;
                            if (cId) { e.stopPropagation(); navigate(orgPath(`/contacts/${cId}?from=invoice&invoiceId=${invoiceId}`)); }
                          }}
                        >
                          {editForm.contactName || invoice.contactName || invoice.customer?.name || '-'}
                        </span>
                        {addressLines.length > 0 && (
                          <div style={{ ...mutedStyle, marginTop: 2 }}>
                            {addressLines.map((line, i) => <div key={i}>{line}</div>)}
                          </div>
                        )}
                        {(editForm.contactEmail || invoice.contactEmail) && (
                          <p style={{ ...mutedStyle, margin: 0 }}>{editForm.contactEmail || invoice.contactEmail}</p>
                        )}
                        {(editForm.customerGstin || invoice.customerGstin) && (
                          <p style={{ ...mutedStyle, margin: '2px 0 0' }}>GSTIN: {editForm.customerGstin || invoice.customerGstin}</p>
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

                      {/* Vendor GSTIN — the supplier's GSTIN, used for GSTR-2B
                          reconciliation. Auto-filled from the vendor contact /
                          AI extraction; editable on drafts. Vendor bills only. */}
                      {isVendorBill && (
                        <div>
                          <EditableField
                            label="Vendor GSTIN"
                            value={isDraft ? editForm.vendorGstin : (invoice.vendorGstin || '')}
                            field="vendorGstin"
                            type="text"
                            editable={isDraft}
                            onSave={saveField}
                            placeholder="e.g. 27AABCU9603R1ZM"
                          />
                          {(() => {
                            const g = (isDraft ? editForm.vendorGstin : invoice.vendorGstin) || '';
                            if (!g.trim()) return null;
                            const v = validateGstin(g);
                            return (
                              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', font: "400 11.5px/1.5 'Inter', system-ui, sans-serif" }}>
                                {v.ok
                                  ? <span style={{ color: 'var(--brand-ink)' }}>✓ Valid format</span>
                                  : <span style={{ color: 'var(--danger)' }}>✗ {v.reason}</span>}
                                {v.ok && (
                                  <Button variant="ghost" size="sm" type="button" onClick={checkGstinLive} disabled={gstinLiveLoading}>
                                    {gstinLiveLoading ? 'Checking…' : 'Verify at GSTN'}
                                  </Button>
                                )}
                                {gstinLive && (
                                  gstinLive.status === 'active' ? <span style={{ color: 'var(--brand-ink)' }}>● Active at GSTN</span>
                                  : gstinLive.status === 'cancelled' ? <span style={{ color: 'var(--danger)' }}>● Cancelled at GSTN</span>
                                  : gstinLive.status === 'suspended' ? <span style={{ color: 'var(--warn-ink)' }}>● Suspended at GSTN</span>
                                  : gstinLive.status === 'not_found' ? <span style={{ color: 'var(--danger)' }}>● Not found at GSTN</span>
                                  : gstinLive.source === 'disabled' ? <span style={{ color: 'var(--fg-4)' }}>Live check not enabled</span>
                                  : gstinLive.source === 'error' ? <span style={{ color: 'var(--warn-ink)' }}>Live check failed — retry</span>
                                  : <span style={{ color: 'var(--fg-4)' }}>No registration data (sandbox)</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}

                  {/* US/CA: show a read-only country hint so users know they're in non-IN mode */}
                  {!isIndia && (
                    <div>
                      <span style={fieldLabelStyle}>Region</span>
                      <div style={{ ...valueStyle, marginTop: 2 }}>
                        {countryCode === 'US' ? 'United States' : 'Canada'} —
                        <span style={{ color: 'var(--fg-4)' }}> GST fields hidden (use {countryCode === 'US' ? 'state sales tax' : 'GST/HST'} taxes on line items)</span>
                      </div>
                    </div>
                  )}

                  {/* Customer GSTIN — shown in address block above, no duplicate needed */}
                </div>

                {/* Right column */}
                <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                  <EditableField
                    label="Invoice Date"
                    value={isDraft ? (editForm.invoiceDate || editForm.date) : (invoice.date?.split?.('T')?.[0] || '')}
                    field="date"
                    type="date"
                    editable={isDraft}
                    onSave={saveField}
                    displayValue={
                      <span style={valueStyle}>{formatDate(isDraft ? (editForm.invoiceDate || editForm.date) : invoice.date, countryCode)}</span>
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
                    displayValue={<span style={valueStyle}>{paymentTermDisplay}</span>}
                  />

                  <EditableField
                    label="Due Date"
                    value={isDraft ? editForm.dueDate : (invoice.dueDate?.split?.('T')?.[0] || '')}
                    field="dueDate"
                    type="date"
                    editable={isDraft}
                    onSave={saveField}
                    displayValue={
                      <span style={{ ...valueStyle, ...(isOverdue ? { color: 'var(--danger)', fontWeight: 550 } : null) }}>
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
                          label: `${t.sectionCode} @ ${t.rateIndividual}% — ${t.description || ''}`.trim(),
                        })),
                      ]}
                      editable={isDraft}
                      displayValue={
                        <span style={valueStyle}>
                          {invoice.tdsSection
                            ? `${invoice.tdsSection} @ ${invoice.tdsRate ?? 0}%`
                            : <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>No TDS</span>}
                        </span>
                      }
                      onSave={async (_field, value) => {
                        const cfg = tdsConfigs.find(t => t._id === value);
                        // TDS config docs use sectionCode/rateIndividual (see
                        // TdsConfig.jsx + API invoicingTds.js) — not section/rate.
                        const updates = {
                          tdsConfigId: value || null,
                          tdsSection: cfg?.sectionCode || null,
                          tdsRate: cfg ? Number(cfg.rateIndividual) || 0 : 0,
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
                    options={currency && !CURRENCIES.includes(currency) ? [currency, ...CURRENCIES] : CURRENCIES}
                    editable={isDraft}
                    onSave={saveField}
                  />

                  {/* Journal — editable on DRAFT so users can fix a wrong-journal pick
                      (e.g. when Mongo natural order picked the wrong default). */}
                  <EditableField
                    label="Journal"
                    value={isDraft ? (editForm.journalId || '') : ''}
                    displayValue={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={valueStyle}>{invoice.journalName || invoice.journalCode || '-'}</span>
                        {invoice.journalCode
                          && invoice.journalName
                          && invoice.journalCode.trim().toUpperCase() !== invoice.journalName.trim().toUpperCase() && (
                          <Chip tone="neutral">{invoice.journalCode}</Chip>
                        )}
                      </div>
                    }
                    field="journalId"
                    type="select"
                    options={journals.map(j => ({
                      value: j._id,
                      label: j.code && j.name && j.code.trim().toUpperCase() !== j.name.trim().toUpperCase()
                        ? `${j.name} (${j.code})`
                        : (j.name || j.code || ''),
                    }))}
                    editable={isDraft && journals.length > 0}
                    onSave={saveField}
                  />
                </div>
              </div>
            </div>
          </Panel>

          {/* ── Tabs ── */}
          <Panel flush>
            <div style={{ padding: '0 16px' }}>
              <Tabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                  { key: 'lines', label: 'Invoice Lines' },
                  { key: 'other', label: 'Other Info' },
                ]}
              />
            </div>

            {/* Tab content */}
            {activeTab === 'lines' && (
              <div>
                {/* Invoice Lines table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: (isEmployeeBill || isVendorBill) && !isDraft ? 900 : 1100, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, paddingLeft: 24 }}>Product</th>
                        {/* EMPBI (read-only) uses Date / Category / Description /
                            Merchant / Payment / Amount / Receipt — drop the
                            staff-aug Consultant + Start/End/Qty/Rate columns
                            that are irrelevant for reimbursement vouchers. */}
                        {isEmployeeBill && !isDraft ? (
                          <>
                            <th style={thStyle}>Date</th>
                            <th style={{ ...thStyle, minWidth: 140 }}>Category</th>
                            <th style={thStyle}>Description</th>
                            <th style={thStyle}>Merchant</th>
                            <th style={thStyle}>Payment</th>
                            <th style={{ ...thRight, paddingRight: 24 }}>Amount</th>
                            <th style={{ ...thStyle, textAlign: 'center', width: 64 }}>Receipt</th>
                          </>
                        ) : isVendorBill && !isDraft ? (
                          <>
                            {/* Vendor Bill (BILL journal) read-only — purchase
                                invoice column set.  Drops Start/End (rarely
                                used), Currency (always = bill currency),
                                and Expense Category (was generic "Other"
                                for almost everyone).  Surfaces HSN/SAC
                                for GST compliance + reads tax NAMES from
                                line.taxNames instead of the count. */}
                            <th style={thStyle}>HSN/SAC</th>
                            <th style={thStyle}>Description</th>
                            <th style={{ ...thRight, width: 80 }}>Qty</th>
                            <th style={thStyle}>Unit</th>
                            <th style={thRight}>Rate</th>
                            <th style={thStyle}>Tax</th>
                            <th style={{ ...thRight, paddingRight: 24 }}>Amount</th>
                          </>
                        ) : !isDraft ? (
                          <>
                            {/* Customer Invoice / Credit Note read-only —
                                staff-aug consultant invoicing keeps Consultant
                                + Start/End/Qty/Rate (those are essential for
                                the bill-this-period workflow).  Adds HSN/SAC
                                for GSTR-1 compliance and drops the redundant
                                per-line Currency column (always = invoice
                                currency on these invoices).  Tax cell reads
                                line.taxNames so the canonical "IGST 18%"
                                shows instead of "1 tax(es)". */}
                            <th style={thStyle}>HSN/SAC</th>
                            <th style={thStyle}>Consultant</th>
                            <th style={thStyle}>Description</th>
                            <th style={thStyle}>Start Date</th>
                            <th style={thStyle}>End Date</th>
                            <th style={{ ...thRight, width: 80 }}>Qty</th>
                            <th style={thStyle}>Unit</th>
                            <th style={thRight}>Billing Rate</th>
                            <th style={thStyle}>Tax</th>
                            <th style={{ ...thRight, paddingRight: 24 }}>Amount</th>
                          </>
                        ) : (
                          <>
                            {!isVendorBill && <th style={thStyle}>Consultant</th>}
                            {isVendorBill && <th style={{ ...thStyle, minWidth: 180 }}>Expense Category</th>}
                            <th style={thStyle}>Description</th>
                            <th style={thStyle}>Start Date</th>
                            <th style={thStyle}>End Date</th>
                            <th style={{ ...thRight, width: 80 }}>Qty</th>
                            <th style={thRight}>Billing Rate</th>
                            <th style={thStyle}>Currency</th>
                            <th style={thStyle}>Taxes</th>
                            <th style={{ ...thRight, paddingRight: 24 }}>Amount</th>
                            {isDraft && <th style={{ ...thStyle, width: 40, padding: '10px 8px' }} />}
                          </>
                        )}
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
                              <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', padding: '32px 0', color: 'var(--fg-4)' }}>
                                No invoice lines yet
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td colSpan={11} style={{ padding: '12px 24px' }}>
                              <Button variant="ghost" size="sm" type="button" onClick={addLine} iconLeft={<Plus size={14} />}>
                                Add a line
                              </Button>
                            </td>
                          </tr>
                        </>
                      ) : isEmployeeBill ? (
                        <>
                          {/* Employee Bill (EMPBI) — reimbursement voucher
                              view.  Each line maps 1:1 to a source expense
                              line and surfaces date / merchant / payment
                              mode / receipt — the fields a finance reviewer
                              actually cares about when checking a claim. */}
                          {(invoice.lines || invoice.lineItems || []).map((li, i) => {
                            const lineTotal = li.subtotal ?? li.amount ?? ((li.quantity || 0) * (li.unitPrice || 0) * (1 - (Number(li.discount) || 0) / 100));
                            const hasFx = li.originalCurrency && li.originalAmount != null && li.originalCurrency !== (invoice.currency || 'INR');
                            const paymentLabel = li.paymentMode
                              ? li.paymentMode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                              : null;
                            // Receipt is served from a Bearer-auth route — a bare
                            // <a href> 401s (no headers on a plain link click), so
                            // go through the auth-fetch preview/download helpers.
                            const receiptUrl = li.receiptId
                              ? invoicingApi.getAttachmentUrl(orgSlug, invoiceId, li.receiptId)
                              : null;
                            const receiptFilename = li.receiptFilename || 'receipt';
                            const receiptPreviewable = /\.(pdf|png|jpg|jpeg|gif|webp|svg)$/i.test(receiptFilename);
                            return (
                              <tr key={li._id || i} style={trStyle}>
                                <td style={{ ...tdStyle, paddingLeft: 24 }}>{li.product?.name || li.productName || dash}</td>
                                <td style={tdStyle}>
                                  {li.expenseDate
                                    ? formatDate(li.expenseDate, countryCode)
                                    : invoice.date
                                      ? formatDate(invoice.date, countryCode)
                                      : dash}
                                </td>
                                <td style={tdStyle}>{li.expenseCategoryName || li.expenseCategory || dash}</td>
                                <td style={{ ...tdMuted, maxWidth: 320 }}>{li.description || dash}</td>
                                <td style={tdStyle}>{li.merchant || dash}</td>
                                <td style={tdStyle}>{paymentLabel || dash}</td>
                                <td style={{ ...tdRight, paddingRight: 24 }}>
                                  <div style={{ fontWeight: 550 }}>{formatCurrency(lineTotal, currency)}</div>
                                  {hasFx && (
                                    <div
                                      style={{ font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}
                                      title={`Original receipt: ${li.originalCurrency} ${li.originalAmount} converted at FX rate ${li.conversionRate}`}
                                    >
                                      {li.originalCurrency} {Number(li.originalAmount).toLocaleString()} @ {Number(li.conversionRate).toFixed(2)}
                                    </div>
                                  )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                  {receiptUrl ? (
                                    <Button
                                      variant="ghost" size="sm" type="button"
                                      title={li.receiptFilename || 'View receipt'}
                                      aria-label={li.receiptFilename || 'View receipt'}
                                      iconLeft={<Paperclip size={14} />}
                                      onClick={() => receiptPreviewable
                                        ? setPreviewDoc({ filename: receiptFilename, mimeType: li.receiptMimeType, url: receiptUrl })
                                        : handleDownloadAttachment(li.receiptId, receiptFilename)}
                                    />
                                  ) : dash}
                                </td>
                              </tr>
                            );
                          })}
                          {(invoice.lines || invoice.lineItems || []).length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '40px 0', color: 'var(--fg-4)' }}>
                                No reimbursement lines
                              </td>
                            </tr>
                          )}
                        </>
                      ) : isVendorBill ? (
                        <>
                          {/* Vendor Bill (BILL journal) — purchase invoice
                              view.  Drops Start/End/Currency/Expense
                              Category that the staff-aug consultant layout
                              assumed; surfaces HSN/SAC for compliance and
                              renders tax NAMES from the line.taxNames
                              array stamped by computeLineTotals (or the
                              Phase-D backfill on legacy bills). */}
                          {(invoice.lines || invoice.lineItems || []).map((li, i) => {
                            const lineTotal = li.subtotal ?? ((li.quantity || 0) * (li.unitPrice || 0) * (1 - (Number(li.discount) || 0) / 100));
                            const taxLabel = (Array.isArray(li.taxNames) && li.taxNames.filter(Boolean).length > 0)
                              ? li.taxNames.filter(Boolean).join(' + ')
                              : (li.taxIds?.length ? `${li.taxIds.length} tax(es)` : '');
                            return (
                              <tr key={li._id || i} style={trStyle}>
                                <td style={{ ...tdStyle, paddingLeft: 24 }}>{li.product?.name || li.productName || dash}</td>
                                <td style={{ ...tdMuted, font: "400 11.5px/1.5 ui-monospace, SFMono-Regular, monospace" }}>{li.hsnSacCode || dash}</td>
                                <td style={{ ...tdMuted, maxWidth: 420 }}>{li.description || dash}</td>
                                <td style={tdRight}>{li.quantity ?? 0}</td>
                                <td style={{ ...tdMuted, fontSize: 12 }}>{li.unit || dash}</td>
                                <td style={tdRight}>{formatCurrency(li.unitPrice, currency)}</td>
                                <td style={{ ...tdMuted, fontSize: 12 }}>{taxLabel || dash}</td>
                                <td style={{ ...tdRight, paddingRight: 24, fontWeight: 550 }}>{formatCurrency(lineTotal, currency)}</td>
                              </tr>
                            );
                          })}
                          {(invoice.lines || invoice.lineItems || []).length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '40px 0', color: 'var(--fg-4)' }}>
                                No bill lines
                              </td>
                            </tr>
                          )}
                        </>
                      ) : !isDraft ? (
                        <>
                          {/* Customer Invoice / Credit Note read-only.  Same
                              column shape as the staff-aug consultant
                              invoicing layout that already works, with two
                              differences from the legacy block: HSN/SAC
                              shown after Product (compliance), Currency
                              column dropped (always = invoice currency).
                              Tax cell renders names from line.taxNames
                              (post-cleanup migration always populated). */}
                          {(invoice.lines || invoice.lineItems || []).map((li, i) => {
                            const lineTotal = li.subtotal ?? ((li.quantity || 0) * (li.unitPrice || 0) * (1 - (Number(li.discount) || 0) / 100));
                            const taxLabel = (Array.isArray(li.taxNames) && li.taxNames.filter(Boolean).length > 0)
                              ? li.taxNames.filter(Boolean).join(' + ')
                              : (li.taxIds?.length ? `${li.taxIds.length} tax(es)` : '');
                            return (
                              <tr key={li._id || i} style={trStyle}>
                                <td style={{ ...tdStyle, paddingLeft: 24 }}>{li.product?.name || li.productName || dash}</td>
                                <td style={{ ...tdMuted, font: "400 11.5px/1.5 ui-monospace, SFMono-Regular, monospace" }}>{li.hsnSacCode || dash}</td>
                                <td style={tdStyle}>{li.consultantName || dash}</td>
                                <td style={{ ...tdMuted, maxWidth: 320 }}>{li.description || dash}</td>
                                <td style={tdStyle}>{li.startDate ? formatDate(li.startDate, countryCode) : dash}</td>
                                <td style={tdStyle}>{li.endDate ? formatDate(li.endDate, countryCode) : dash}</td>
                                <td style={tdRight}>{li.quantity ?? 0}</td>
                                <td style={{ ...tdMuted, fontSize: 12 }}>{li.unit || dash}</td>
                                <td style={tdRight}>{formatCurrency(li.unitPrice, currency)}</td>
                                <td style={{ ...tdMuted, fontSize: 12 }}>{taxLabel || dash}</td>
                                <td style={{ ...tdRight, paddingRight: 24, fontWeight: 550 }}>{formatCurrency(lineTotal, currency)}</td>
                              </tr>
                            );
                          })}
                          {(invoice.lines || invoice.lineItems || []).length === 0 && (
                            <tr>
                              <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', padding: '40px 0', color: 'var(--fg-4)' }}>
                                No invoice lines
                              </td>
                            </tr>
                          )}
                        </>
                      ) : (
                        <>
                          {(invoice.lines || invoice.lineItems || []).map((li, i) => {
                            const lineTotal = li.total ?? li.subtotal ?? ((li.quantity || 0) * (li.unitPrice || 0));
                            return (
                              <tr key={li._id || i} style={trStyle}>
                                <td style={{ ...tdStyle, paddingLeft: 24 }}>{li.product?.name || li.productName || dash}</td>
                                <td style={{ ...tdStyle, ...(isVendorBill ? { minWidth: 180 } : null) }}>
                                  {isVendorBill
                                    ? (li.expenseCategory || dash)
                                    : (li.consultantName || dash)}
                                </td>
                                <td style={{ ...tdMuted, maxWidth: 320 }}>{li.description || dash}</td>
                                <td style={tdStyle}>{li.startDate ? formatDate(li.startDate, countryCode) : dash}</td>
                                <td style={tdStyle}>{li.endDate ? formatDate(li.endDate, countryCode) : dash}</td>
                                <td style={tdRight}>{li.quantity ?? 0}</td>
                                <td style={tdRight}>{formatCurrency(li.unitPrice, currency)}</td>
                                <td style={tdStyle}>{li.lineCurrency || invoice.currency || 'INR'}</td>
                                <td style={{ ...tdMuted, fontSize: 12 }}>
                                  {(li.taxNames || []).filter(Boolean).join(', ') || (li.taxIds?.length ? `${li.taxIds.length} tax(es)` : '-')}
                                </td>
                                <td style={{ ...tdRight, paddingRight: 24, fontWeight: 550 }}>{formatCurrency(lineTotal, currency)}</td>
                              </tr>
                            );
                          })}
                          {(invoice.lines || invoice.lineItems || []).length === 0 && (
                            <tr>
                              <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', padding: '40px 0', color: 'var(--fg-4)' }}>
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
                <div style={{ borderTop: '1px solid var(--line-2)', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', maxWidth: 320, display: 'grid', gap: 8 }}>
                      <div style={totalsRow}>
                        <span style={{ color: 'var(--fg-4)' }}>Taxable Value</span>
                        <span style={{ color: 'var(--fg)' }}>
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
                            <div key={t.name} style={totalsRow}>
                              <span style={{ color: 'var(--fg-4)' }}>{t.name}</span>
                              <span style={{ color: 'var(--fg)' }}>{formatCurrency(t.amount, currency)}</span>
                            </div>
                          ));
                        }
                        if (taxTotalFallback > 0) {
                          return (
                            <div style={totalsRow}>
                              <span style={{ color: 'var(--fg-4)' }}>Taxes</span>
                              <span style={{ color: 'var(--fg)' }}>{formatCurrency(taxTotalFallback, currency)}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {((isDraft ? localTotals.discountTotal : (invoice.totalDiscount || invoice.discountAmount)) > 0) && (
                        <div style={totalsRow}>
                          <span style={{ color: 'var(--fg-4)' }}>Discount</span>
                          <span style={{ color: 'var(--warn-ink)' }}>
                            -{formatCurrency(isDraft ? localTotals.discountTotal : (invoice.totalDiscount || invoice.discountAmount || 0), currency)}
                          </span>
                        </div>
                      )}

                      <div style={{ borderTop: '1px solid var(--line-2)', margin: '2px 0' }} />

                      <div style={totalsRowStrong}>
                        <span style={{ color: 'var(--fg)' }}>Total</span>
                        <span style={{ color: 'var(--fg)' }}>
                          {formatCurrency(isDraft ? localTotals.total : invoice.total, currency)}
                        </span>
                      </div>

                      {/* Vendor Bill: TDS deduction + Net Payable */}
                      {isVendorBill && (Number(invoice.tdsRate) > 0 || Number(invoice.tdsAmount) > 0) && (
                        <>
                          <div style={totalsRow}>
                            <span style={{ color: 'var(--fg-4)' }}>
                              TDS {invoice.tdsSection ? `(${invoice.tdsSection} @ ${invoice.tdsRate}%)` : ''}
                            </span>
                            <span style={{ color: 'var(--warn-ink)' }}>
                              -{formatCurrency(invoice.tdsAmount || 0, currency)}
                            </span>
                          </div>
                          <div style={{ ...totalsRowStrong, borderTop: '1px solid var(--line-2)', paddingTop: 4 }}>
                            <span style={{ color: 'var(--fg)' }}>Net Payable</span>
                            <span style={{ color: 'var(--fg)' }}>
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
                        <div style={totalsRow}>
                          <span style={{ color: 'var(--fg-4)' }}>Amount Paid</span>
                          <span style={{ color: 'var(--brand-ink)' }}>
                            {formatCurrency(invoice.amountPaid, currency)}
                          </span>
                        </div>
                      )}

                      {payments.length > 0 && amountDue > 0 && (
                        <div style={{ ...totalsRowStrong, color: 'var(--brand-ink)', borderTop: '1px solid var(--line-2)', paddingTop: 8 }}>
                          <span>Amount Due</span>
                          <span>{formatCurrency(amountDue, currency)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment info lines */}
                {payments.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--line-2)', padding: '16px 24px', display: 'grid', gap: 8 }}>
                    {payments.map((pmt, i) => (
                      <div key={pmt._id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)' }}>
                        <Info size={14} style={{ flexShrink: 0 }} />
                        <span>Paid on {formatDate(pmt.date || pmt.paymentDate, countryCode)}</span>
                        <span style={{ fontWeight: 550, marginLeft: 16 }}>{formatCurrency(pmt.amount, currency)}</span>
                        {pmt._id && (
                          <Button
                            variant="secondary" size="sm"
                            style={{ marginLeft: 'auto', color: 'var(--danger)' }}
                            onClick={() => setVoidPaymentId(pmt._id)}
                            disabled={actionLoading === 'voidPayment'}
                          >
                            Void
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'other' && (
              <div style={{ padding: 24, display: 'grid', gap: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', columnGap: 32, rowGap: 16 }}>
                  {/* Left column */}
                  <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                    {(invoice.salespersonName || invoice.salesperson) && (
                      <FormField label="Salesperson">
                        <span style={valueStyle}>
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
                          style={{ color: 'var(--brand-ink)', font: "450 13px/1.5 'Inter', system-ui, sans-serif" }}
                        >
                          View Original Invoice
                        </Link>
                      </FormField>
                    )}

                    {invoice.reversedByCreditNoteId && (
                      <FormField label="Reversed By">
                        <Link
                          to={orgPath(`/invoicing/invoices/${invoice.reversedByCreditNoteId}`)}
                          style={{ color: 'var(--acc-purple)', font: "450 13px/1.5 'Inter', system-ui, sans-serif" }}
                        >
                          View Credit Note
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
                          ? <p style={{ ...mutedStyle, color: 'var(--fg-3)', whiteSpace: 'pre-wrap', margin: 0 }}>{isDraft ? editForm.notes : invoice.notes}</p>
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
                          ? <p style={{ ...mutedStyle, color: 'var(--fg-3)', whiteSpace: 'pre-wrap', margin: 0 }}>{isDraft ? editForm.internalNotes : invoice.internalNotes}</p>
                          : undefined
                      }
                    />
                  </div>

                  {/* Right column */}
                  <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
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
                        <span style={valueStyle}>
                          {invoice.recurringInterval
                            ? `Every ${invoice.recurringInterval} ${invoice.recurringPeriod || 'month'}(s)`
                            : 'Yes'}
                        </span>
                        {invoice.nextRecurringDate && (
                          <p style={{ ...mutedStyle, margin: '2px 0 0' }}>
                            Next: {formatDate(invoice.nextRecurringDate, countryCode)}
                          </p>
                        )}
                      </FormField>
                    )}

                    {invoice.sourceDocument && (
                      <FormField label="Source Document">
                        <span style={valueStyle}>{invoice.sourceDocument}</span>
                      </FormField>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* ── BOTTOM: Activities + Attachments ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
            {/* Chatter / Activity Panel */}
            <Panel flush style={{ overflow: 'hidden' }}>
              <ActivityPanel
                orgSlug={orgSlug}
                entityType="invoice"
                entityId={invoiceId}
              />
            </Panel>

            {/* Attachments */}
            <Panel
              flush
              icon={<Paperclip size={14} />}
              title="Attachments"
              actions={<span style={mutedStyle}>({attachments.length})</span>}
            >
              <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                {/* Drop zone */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  style={{
                    padding: 16, textAlign: 'center', cursor: 'pointer',
                    borderRadius: 'var(--r-2, 12px)',
                    border: `2px dashed ${dragOver ? 'var(--brand-line)' : 'var(--line-2)'}`,
                    background: dragOver ? 'var(--brand-soft)' : 'transparent',
                  }}
                >
                  {uploadingFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
                      <span style={mutedStyle}>Uploading...</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <Upload size={18} style={{ color: 'var(--fg-4)' }} />
                      <p style={{ ...mutedStyle, margin: 0 }}>Click to upload or drag file here</p>
                      <p style={{ ...mutedStyle, margin: 0 }}>Max 10MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileInputChange}
                  />
                </div>

                {/* Attachment list */}
                {attachmentsLoading && attachments.length === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
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
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                        borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
                        boxShadow: 'inset 0 0 0 1px var(--line-2)',
                      }}
                    >
                      <FileText size={16} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...valueStyle, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</p>
                        {doc.size && <p style={{ ...mutedStyle, margin: 0 }}>{formatFileSize(doc.size)}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        {isPreviewable && (
                          <Button
                            variant="ghost" size="sm" title="Preview" aria-label={`Preview ${filename}`}
                            iconLeft={<Eye size={14} />}
                            onClick={() => setPreviewDoc({ filename, mimeType: doc.mimeType || doc.contentType, url })}
                          />
                        )}
                        <Button
                          variant="ghost" size="sm" title="Download" aria-label={`Download ${filename}`}
                          iconLeft={<Download size={14} />}
                          onClick={() => handleDownloadAttachment(docId, filename)}
                        />
                        <Button
                          variant="ghost" size="sm" title="Delete" aria-label={`Delete ${filename}`}
                          style={{ color: 'var(--danger)' }}
                          iconLeft={<Trash2 size={14} />}
                          onClick={() => setDeleteAttachId(docId)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         Modals
         ══════════════════════════════════════════════════════════════════ */}

      {showPaymentModal && (
        invoice.journalCode === 'EMPBI' ? (
          <EmployeeBillRecordPaymentModal
            orgSlug={orgSlug}
            invoiceId={invoiceId}
            invoiceNumber={invoice.number || ''}
            currency={currency}
            amountDue={amountDue}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => {
              setShowPaymentModal(false);
              fetchInvoice();
            }}
            showToast={showToast}
          />
        ) : (
          <RecordPaymentModal
            orgSlug={orgSlug}
            invoiceId={invoiceId}
            invoiceNumber={invoice.number || ''}
            currency={currency}
            total={invoice.total || 0}
            subtotal={invoice.subtotal || 0}
            amountDue={amountDue}
            invoiceType={invoice.type}
            isVendorBill={isVendorBill}
            isIndia={isIndia}
            gstHold={invoice.gstHold}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => {
              setShowPaymentModal(false);
              fetchInvoice();
            }}
            showToast={showToast}
          />
        )
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

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Invoice"
        message={`Are you sure you want to delete ${invoice.number || 'this invoice'}? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={actionLoading === 'delete'}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!deleteAttachId}
        title="Delete Attachment"
        message="Are you sure you want to delete this attachment?"
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDeleteAttachment(deleteAttachId)}
        onCancel={() => setDeleteAttachId(null)}
      />

      <ConfirmDialog
        open={!!voidPaymentId}
        title="Void Payment"
        message="Are you sure you want to void this payment? The invoice balance will be restored."
        confirmLabel="Void Payment"
        danger
        busy={actionLoading === 'voidPayment'}
        onConfirm={() => handleVoidPayment(voidPaymentId)}
        onCancel={() => setVoidPaymentId(null)}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel ${invoice.number || 'this invoice'}? This action cannot be undone.`}
        confirmLabel="Cancel Invoice"
        danger
        busy={actionLoading === 'cancel'}
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <ConfirmDialog
        open={showDuplicateBillConfirm}
        title="Duplicate Vendor Bill?"
        message="A bill with this invoice number already exists for this vendor. Continue anyway?"
        confirmLabel="Continue"
        busy={actionLoading === 'send'}
        onConfirm={confirmDuplicateBill}
        onCancel={() => setShowDuplicateBillConfirm(false)}
      />

      {cancelEInvoiceModal && (
        <CancelEInvoiceModal
          reason={cancelEInvoiceModal.reason}
          remarks={cancelEInvoiceModal.remarks}
          loading={actionLoading === 'cancelEInvoice'}
          onChange={(patch) =>
            setCancelEInvoiceModal((m) => (m ? { ...m, ...patch } : m))
          }
          onConfirm={submitCancelEInvoice}
          onCancel={() => setCancelEInvoiceModal(null)}
        />
      )}

      {gstHoldModal && (
        <GstHoldModal
          reason={gstHoldModal.reason}
          loading={actionLoading === 'gstHold'}
          onChange={(patch) => setGstHoldModal((m) => (m ? { ...m, ...patch } : m))}
          onConfirm={() => submitGstHold(true, gstHoldModal.reason || '')}
          onCancel={() => setGstHoldModal(null)}
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

      {reExtractVendor && (
        <VendorChoiceModal
          extracted={reExtractVendor.extracted}
          orgSlug={orgSlug}
          onCancel={() => setReExtractVendor(null)}
          createLabel="Create vendor & link"
          blankLabel="Leave blank"
          onDone={async (contactId) => {
            setReExtractVendor(null);
            if (!contactId) return;
            try {
              await linkVendorContact(contactId);
              showToast('Vendor linked to bill');
            } catch (err) {
              showToast(err.message || 'Failed to link vendor', 'error');
            }
          }}
        />
      )}
    </div>
  );
}

const totalsRow = {
  display: 'flex', justifyContent: 'space-between', gap: 12,
  font: "450 13px/1.5 'Inter', system-ui, sans-serif",
};
const totalsRowStrong = {
  display: 'flex', justifyContent: 'space-between', gap: 12,
  font: "700 15px/1.5 'Inter', system-ui, sans-serif",
};

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
    <tr style={trStyle}>
      {/* Product */}
      <td style={{ padding: '10px 24px' }}>
        {productLocked ? (
          <div style={{ ...cellShellStyle, cursor: 'default' }}>
            <span style={valueStyle}>{line.productName || '-'}</span>
          </div>
        ) : (
          <>
            <div
              ref={productTriggerRef}
              className="ds-editable"
              style={cellShellStyle}
              onClick={() => setShowProductSearch(true)}
            >
              <span style={valueStyle}>
                {line.productName || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>Select product</span>}
              </span>
              <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
            </div>
            {showProductSearch && (
              <ProductSearch
                orgSlug={orgSlug}
                currency={currency}
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
        <td style={{ padding: '10px 16px', minWidth: 180 }}>
          <Select
            value={line.expenseCategory || ''}
            onChange={(e) => onUpdate(index, 'expenseCategory', e.target.value)}
            style={{ height: 30, font: "450 13px/1 'Inter', system-ui, sans-serif" }}
          >
            <option value="">Select category</option>
            {(expenseCategories || []).map((c) => (
              <option key={c._id} value={c.name}>{c.name}</option>
            ))}
          </Select>
        </td>
      ) : (
        <td style={{ padding: '10px 16px' }}>
          <div
            ref={consultantTriggerRef}
            className="ds-editable"
            style={cellShellStyle}
            onClick={() => setShowConsultantSearch(true)}
          >
            <span style={valueStyle}>
              {line.consultantName || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>Consultant</span>}
            </span>
            <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
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
      <td style={{ padding: '10px 16px' }}>
        {editingField === 'description' ? (
          <input
            type="text"
            autoFocus
            defaultValue={line.description}
            onBlur={(e) => handleFieldBlur('description', e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'description', e.target.value)}
            style={cellInputStyle}
          />
        ) : (
          <div className="ds-editable" style={cellShellStyle} onClick={() => handleFieldClick('description')}>
            <span style={{ ...valueStyle, color: 'var(--fg-3)' }}>
              {line.description || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>Description</span>}
            </span>
            <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
          </div>
        )}
      </td>

      {/* Start Date */}
      <td style={{ padding: '10px 16px' }}>
        {editingField === 'startDate' ? (
          <input
            type="date"
            autoFocus
            defaultValue={line.startDate ? line.startDate.slice(0, 10) : ''}
            onBlur={(e) => handleFieldBlur('startDate', e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'startDate', e.target.value)}
            style={{ ...cellInputStyle, width: 144 }}
          />
        ) : (
          <div className="ds-editable" style={cellShellStyle} onClick={() => handleFieldClick('startDate')}>
            <span style={valueStyle}>
              {line.startDate ? formatDate(line.startDate, countryCode) : <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>Start Date</span>}
            </span>
            <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
          </div>
        )}
      </td>

      {/* End Date */}
      <td style={{ padding: '10px 16px' }}>
        {editingField === 'endDate' ? (
          <input
            type="date"
            autoFocus
            defaultValue={line.endDate ? line.endDate.slice(0, 10) : ''}
            onBlur={(e) => handleFieldBlur('endDate', e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'endDate', e.target.value)}
            style={{ ...cellInputStyle, width: 144 }}
          />
        ) : (
          <div className="ds-editable" style={cellShellStyle} onClick={() => handleFieldClick('endDate')}>
            <span style={valueStyle}>
              {line.endDate ? formatDate(line.endDate, countryCode) : <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>End Date</span>}
            </span>
            <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
          </div>
        )}
      </td>

      {/* Qty */}
      <td style={{ padding: '10px 16px', textAlign: 'right', width: 112 }}>
        {editingField === 'quantity' ? (
          <input
            type="number"
            autoFocus
            min="0"
            step="any"
            defaultValue={line.quantity}
            onBlur={(e) => handleFieldBlur('quantity', Number(e.target.value) || 0)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'quantity', Number(e.target.value) || 0)}
            style={{ ...cellInputStyle, textAlign: 'right' }}
          />
        ) : (
          <div
            className="ds-editable"
            style={{ ...cellShellStyle, justifyContent: 'flex-end' }}
            onClick={() => handleFieldClick('quantity')}
          >
            <span style={valueStyle}>{Number(line.quantity) || 1}</span>
            <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
          </div>
        )}
      </td>

      {/* Unit Price */}
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
        {editingField === 'unitPrice' ? (
          <input
            type="number"
            autoFocus
            min="0"
            step="any"
            defaultValue={line.unitPrice}
            onBlur={(e) => handleFieldBlur('unitPrice', Number(e.target.value) || 0)}
            onKeyDown={(e) => handleFieldKeyDown(e, 'unitPrice', Number(e.target.value) || 0)}
            style={{ ...cellInputStyle, textAlign: 'right', width: 112 }}
          />
        ) : (
          <div
            className="ds-editable"
            style={{ ...cellShellStyle, justifyContent: 'flex-end' }}
            onClick={() => handleFieldClick('unitPrice')}
          >
            <span style={valueStyle}>{formatCurrency(line.unitPrice, currency)}</span>
            <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
          </div>
        )}
      </td>

      {/* Currency (read-only) */}
      <td style={{ padding: '10px 16px' }}>
        <span style={valueStyle}>{line.lineCurrency || currency || 'INR'}</span>
      </td>

      {/* Taxes */}
      <td style={{ padding: '10px 16px' }}>
        <div ref={taxTriggerRef} className="ds-editable" style={cellShellStyle} onClick={() => setShowTaxSelect(true)}>
          <span style={{ ...mutedStyle, color: 'var(--fg-3)' }}>
            {(line.taxNames || []).filter(Boolean).join(', ') ||
             (line.taxIds?.length ? `${line.taxIds.length} tax(es)` : <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>Taxes</span>)}
          </span>
          <Pencil size={10} style={{ color: 'var(--fg-4)', flexShrink: 0, opacity: 0.55 }} />
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
      <td style={{ padding: '10px 24px', textAlign: 'right', color: 'var(--fg)', fontWeight: 550, font: "550 13px/1.5 'Inter', system-ui, sans-serif" }}>
        {formatCurrency(lineTotal, currency)}
      </td>

      {/* Delete */}
      <td style={{ padding: '10px 8px' }}>
        <Button
          variant="ghost" size="sm" type="button"
          title="Remove line" aria-label="Remove line"
          style={{ color: 'var(--danger)' }}
          iconLeft={<Trash2 size={14} />}
          onClick={() => onRemove(index)}
        />
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
      <span style={fieldLabelStyle}>{label}</span>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}

// ============================================================================
// ActionBtn — compact action button for the top bar
// ============================================================================

function ActionBtn({ icon: Icon, label, onClick, loading, primary, danger }) {
  return (
    <Button
      size="sm"
      variant={primary ? 'primary' : danger ? 'danger' : 'secondary'}
      onClick={onClick}
      disabled={loading}
      iconLeft={loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      style={{ whiteSpace: 'nowrap' }}
    >
      {label}
    </Button>
  );
}

// ============================================================================
// RecordPaymentModal
// ============================================================================

function RecordPaymentModal({ orgSlug, invoiceId, invoiceNumber, currency, total, subtotal, amountDue, invoiceType, isVendorBill, isIndia, gstHold, onClose, onSuccess, showToast }) {
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

  const selectedTds = tdsConfigs.find(t => t._id === tdsConfigId);
  const tdsRate = selectedTds ? (Number(selectedTds.rateIndividual) || 0) : 0;

  const isCustomerInvoice = invoiceType === 'customer_invoice';
  // TDS applies to both directions in India:
  //  - Customer invoice: customer deducts TDS before paying us
  //  - Vendor bill: we deduct TDS before paying the vendor (we are the deductor)
  const tdsApplicable = isIndia && (isCustomerInvoice || isVendorBill);
  const showTdsWarning = tdsApplicable && !tdsEnabled && Number(total) >= 30000;

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
    // Block overpayment — payment (+ TDS) must not exceed the amount due.
    const settling = (Number(form.amount) || 0) + (tdsEnabled ? tdsAmount : 0);
    if (settling > (Number(amountDue) || 0) + 0.005) {
      showToast(`Total exceeds amount due (${formatCurrency(amountDue, currency)}). Reduce the amount.`, 'error');
      return;
    }

    try {
      setSaving(true);

      // NOTE: two sequential calls — the durable fix is a single server-side
      // "payment + TDS" endpoint. Until then, roll back the TDS payment
      // client-side if the net-payment call fails after it.
      let tdsPaymentId = null;
      if (tdsEnabled && selectedTds) {
        const tdsRes = await invoicingApi.recordPayment(orgSlug, {
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
        tdsPaymentId = tdsRes?.payment?._id || null;
      }

      try {
        await invoicingApi.recordPayment(orgSlug, {
          invoiceId,
          amount: Number(form.amount),
          method: form.method,
          journal: selectedJournal?.name || '',
          date: form.date,
          reference: form.memo || invoiceNumber || '',
          notes: '',
        });
      } catch (netErr) {
        if (tdsPaymentId) {
          try {
            await invoicingApi.deletePayment(orgSlug, tdsPaymentId);
            // Rollback succeeded — nothing landed; keep the modal open to retry.
            showToast(`Payment failed — the TDS entry was rolled back. ${netErr.message || ''}`.trim(), 'error');
          } catch {
            // Orphan TDS payment left behind — surface it and refresh the page
            // state so the user can void it manually from the payments list.
            showToast(
              `Payment failed AFTER the TDS entry of ${formatCurrency(tdsAmount, currency)} was recorded, and it could not be rolled back. Void the TDS payment on this ${isVendorBill ? 'bill' : 'invoice'} manually, then retry.`,
              'error'
            );
            onSuccess();
          }
          return;
        }
        throw netErr;
      }

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
    <Modal
      open
      size="md"
      onClose={saving ? undefined : onClose}
      icon={<CreditCard size={18} />}
      title="Record Payment"
      sub={`${invoiceNumber} • Due ${formatCurrency(amountDue, currency)}`}
      footer={loading ? null : (
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" type="button" onClick={onClose}>Discard</Button>
          <Button
            type="submit"
            form="rpm-form"
            disabled={saving || journals.length === 0}
            iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          >
            {tdsEnabled ? 'Record Payment + TDS' : 'Record Payment'}
          </Button>
        </>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
        </div>
      ) : (
        <form id="rpm-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
          {/* GST payment-hold warning — soft; payment is still allowed. */}
          {gstHold?.onHold && (
            <Callout tone="danger" icon={<AlertTriangle size={16} />}>
              This bill is on <strong>GST payment hold</strong>{gstHold.reason ? ` — ${gstHold.reason}` : ''}. You can still record the payment, but its ITC may be at risk.
            </Callout>
          )}
          {/* TDS Warning Banner */}
          {showTdsWarning && (
            <Callout tone="warn" icon={<AlertTriangle size={16} />}>
              <div style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif" }}>
                <p style={{ margin: 0, fontWeight: 550 }}>TDS may apply on this {isVendorBill ? 'bill' : 'invoice'}</p>
                <p style={{ margin: '2px 0 0' }}>
                  {isVendorBill
                    ? 'Bill total ≥ ₹30,000. If TDS is deductible under section 194C/194J, toggle "TDS Deducted" below — you are the deductor.'
                    : 'Invoice total ≥ ₹30,000. If the customer deducted TDS under section 194C/194J, toggle "TDS Deducted" below.'}
                </p>
              </div>
            </Callout>
          )}

          {/* No journals warning */}
          {journals.length === 0 && (
            <Callout tone="danger" icon={<AlertTriangle size={16} />}>
              <div style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif" }}>
                <p style={{ margin: 0, fontWeight: 550 }}>No bank or cash journal found</p>
                <p style={{ margin: '2px 0 0' }}>Add one under Invoicing → Configuration → Journals before recording a payment.</p>
              </div>
            </Callout>
          )}

          {/* Journal */}
          <Field label="Journal" htmlFor="rpm-journal">
            <Select
              id="rpm-journal"
              value={form.journalId}
              onChange={(e) => setForm(f => ({ ...f, journalId: e.target.value }))}
              disabled={journals.length === 0}
            >
              <option value="">Select journal…</option>
              {journals.map(j => (
                <option key={j._id} value={j._id}>{j.name} ({j.type === 'bank' ? 'Bank' : 'Cash'})</option>
              ))}
            </Select>
          </Field>

          {/* Payment Method */}
          <Field label="Payment Method" htmlFor="rpm-method">
            <Select id="rpm-method" value={form.method} onChange={(e) => setForm(f => ({ ...f, method: e.target.value }))}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="manual">Manual</option>
              <option value="other">Other</option>
            </Select>
          </Field>

          {/* Payment Date */}
          <Field label="Payment Date" htmlFor="rpm-date">
            <Input id="rpm-date" type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
          </Field>

          {/* TDS Toggle */}
          {tdsApplicable && (
            <div style={{ borderRadius: 'var(--r-2, 12px)', boxShadow: 'inset 0 0 0 1px var(--line-2)', overflow: 'hidden' }}>
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 12px', background: 'var(--surface-2)', cursor: 'pointer',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={tdsEnabled}
                    onChange={(e) => setTdsEnabled(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  />
                  <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                    {isVendorBill ? 'TDS deducted on this payment' : 'Customer deducted TDS'}
                  </span>
                </span>
                {tdsEnabled && tdsAmount > 0 && (
                  <span style={{ font: "550 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)' }}>
                    −{formatCurrency(tdsAmount, currency)}
                  </span>
                )}
              </label>

              {tdsEnabled && (
                <div style={{ padding: 12, display: 'grid', gap: 12, borderTop: '1px solid var(--line-2)' }}>
                  {tdsConfigs.length === 0 ? (
                    <p style={{ ...mutedStyle, color: 'var(--warn-ink)', margin: 0 }}>
                      No TDS sections configured. Go to Invoicing → Configuration → TDS and click "Seed Defaults", then try again.
                    </p>
                  ) : (
                    <>
                      <Field label="TDS Section" htmlFor="rpm-tds-section">
                        <Select id="rpm-tds-section" value={tdsConfigId} onChange={(e) => setTdsConfigId(e.target.value)}>
                          <option value="">Select section…</option>
                          {tdsConfigs.map(t => (
                            <option key={t._id} value={t._id}>
                              {t.sectionCode} — {t.description} ({t.rateIndividual}%)
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                        <Field label="TDS Base (untaxed)" htmlFor="rpm-tds-base">
                          <Input
                            id="rpm-tds-base"
                            type="number"
                            step="any"
                            min="0"
                            value={tdsBase}
                            onChange={(e) => setTdsBase(e.target.value)}
                          />
                        </Field>
                        <Field label={`TDS Amount (${tdsRate}%)`} htmlFor="rpm-tds-amount">
                          <Input
                            id="rpm-tds-amount"
                            type="number"
                            step="any"
                            value={tdsAmount}
                            onChange={(e) => setTdsAmount(Number(e.target.value) || 0)}
                          />
                        </Field>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <Field label={isVendorBill ? 'Amount Paid' : 'Amount Received'} htmlFor="rpm-amount">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                id="rpm-amount"
                type="number"
                step="any"
                min="0"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                style={{ flex: 1 }}
              />
              <span style={{ ...mutedStyle, width: 48, textAlign: 'right' }}>{currency}</span>
            </div>
          </Field>

          {/* Memo */}
          <Field label="Reference / Memo" htmlFor="rpm-memo">
            <Input
              id="rpm-memo"
              type="text"
              value={form.memo}
              onChange={(e) => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder={`e.g. UTR, cheque no., ${invoiceNumber}`}
            />
          </Field>

          {/* Summary */}
          <div style={{ borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)', padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ ...totalsRow, color: 'var(--fg-3)' }}>
              <span>{isVendorBill ? 'Bill Due' : 'Invoice Due'}</span>
              <span>{formatCurrency(amountDue, currency)}</span>
            </div>
            {tdsEnabled && (
              <div style={{ ...totalsRow, color: 'var(--fg-3)' }}>
                <span>{isVendorBill ? 'TDS Deducted' : 'TDS Credit'}</span>
                <span>−{formatCurrency(tdsAmount, currency)}</span>
              </div>
            )}
            <div style={{ ...totalsRow, color: 'var(--fg-3)' }}>
              <span>{isVendorBill ? 'Payment Made' : 'Payment Received'}</span>
              <span>−{formatCurrency(Number(form.amount) || 0, currency)}</span>
            </div>
            <div style={{
              ...totalsRow, fontWeight: 600, paddingTop: 6, borderTop: '1px solid var(--line-2)',
              color: remaining > 0 ? 'var(--warn-ink)' : 'var(--brand-ink)',
            }}>
              <span>Remaining</span>
              <span>{formatCurrency(remaining, currency)}</span>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ============================================================================
// EmployeeBillRecordPaymentModal
//   Specialized payment modal for EMPBI bills auto-created from approved
//   expense claims. No TDS pieces, surfaces employee bank details, supports
//   cheque-specific fields, and lets the accountant attach a payment proof.
// ============================================================================

function EmployeeBillRecordPaymentModal({
  orgSlug, invoiceId, invoiceNumber, currency, amountDue, onClose, onSuccess, showToast,
}) {
  const [journals, setJournals] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proofFile, setProofFile] = useState(null);

  const [form, setForm] = useState({
    journalId: '',
    amount: amountDue || 0,
    method: 'bank_transfer',
    date: new Date().toISOString().slice(0, 10),
    reference: '',
    memo: '',
    chequeNumber: '',
    chequeDate: new Date().toISOString().slice(0, 10),
    bankName: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const [jRes, empRes] = await Promise.all([
          invoicingApi.listJournals(orgSlug, { active: 'true' }).catch(() => ({ journals: [] })),
          invoicingApi.getEmployeeSnapshot(orgSlug, invoiceId).catch(() => ({ employee: null })),
        ]);
        const payableJournals = (jRes?.journals || []).filter((j) => j.type === 'bank' || j.type === 'cash');
        setJournals(payableJournals);
        setEmployee(empRes?.employee || null);
        if (payableJournals.length > 0) {
          const defaultJournal = payableJournals.find((j) => j.type === 'bank') || payableJournals[0];
          setForm((f) => ({ ...f, journalId: defaultJournal._id }));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orgSlug, invoiceId]);

  const selectedJournal = journals.find((j) => j._id === form.journalId);
  const remaining = Math.max(0, Math.round(((Number(amountDue) || 0) - (Number(form.amount) || 0)) * 100) / 100);
  const isCheque = form.method === 'cheque';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.journalId) return showToast('Select a journal', 'error');
    if (!form.amount || Number(form.amount) <= 0) return showToast('Enter a valid payment amount', 'error');
    if (Number(form.amount) > (Number(amountDue) || 0) + 0.005) {
      return showToast(`Amount exceeds amount due (${formatCurrency(amountDue, currency)}).`, 'error');
    }
    if (isCheque && !form.chequeNumber.trim()) return showToast('Cheque number is required', 'error');

    try {
      setSaving(true);
      const paymentRes = await invoicingApi.recordPayment(orgSlug, {
        invoiceId,
        amount: Number(form.amount),
        method: form.method,
        journal: selectedJournal?.name || '',
        date: form.date,
        reference: form.reference || invoiceNumber || '',
        notes: form.memo || '',
        chequeNumber: isCheque ? form.chequeNumber.trim() : null,
        chequeDate: isCheque ? form.chequeDate : null,
        bankName: isCheque ? form.bankName.trim() : null,
      });

      if (proofFile) {
        try {
          const paymentNumber = paymentRes?.payment?.number || '';
          const label = paymentNumber ? `Payment proof — ${paymentNumber}` : 'Payment proof';
          await invoicingApi.uploadAttachment(orgSlug, invoiceId, proofFile, label);
        } catch (uploadErr) {
          showToast(`Payment recorded, but proof upload failed: ${uploadErr.message}`, 'error');
          onSuccess();
          return;
        }
      }

      showToast('Payment recorded');
      onSuccess();
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      onClose={saving ? undefined : onClose}
      icon={<CreditCard size={18} />}
      title="Pay Employee"
      sub={`${invoiceNumber} • Due ${formatCurrency(amountDue, currency)}`}
      footer={loading ? null : (
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" type="button" onClick={onClose}>Discard</Button>
          <Button
            type="submit"
            form="ebrpm-form"
            disabled={saving || journals.length === 0}
            iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          >
            Record Payment
          </Button>
        </>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
        </div>
      ) : (
        <form id="ebrpm-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
          {/* Employee bank details preview */}
          {employee ? (
            <div style={{ borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)', padding: 12, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "550 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
                <User size={14} style={{ color: 'var(--brand-ink)' }} />
                <span>{employee.fullName || '—'}</span>
                {employee.designation && <span style={{ color: 'var(--fg-4)' }}>· {employee.designation}</span>}
              </div>
              {employee.bankName || employee.accountNumberMasked ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', columnGap: 12, rowGap: 4, paddingTop: 4, font: "400 11.5px/1.5 'Inter', system-ui, sans-serif" }}>
                  {employee.bankName && (
                    <div><span style={{ color: 'var(--fg-4)' }}>Bank:</span> <span style={{ color: 'var(--fg-2)' }}>{employee.bankName}</span></div>
                  )}
                  {employee.accountNumberMasked && (
                    <div><span style={{ color: 'var(--fg-4)' }}>A/c:</span> <span style={{ color: 'var(--fg-2)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{employee.accountNumberMasked}</span></div>
                  )}
                  {employee.ifsc && (
                    <div><span style={{ color: 'var(--fg-4)' }}>IFSC:</span> <span style={{ color: 'var(--fg-2)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{employee.ifsc}</span></div>
                  )}
                  {employee.accountHolderName && (
                    <div><span style={{ color: 'var(--fg-4)' }}>Holder:</span> <span style={{ color: 'var(--fg-2)' }}>{employee.accountHolderName}</span></div>
                  )}
                </div>
              ) : (
                <p style={{ ...mutedStyle, fontStyle: 'italic', margin: 0 }}>No bank details on file. Update the employee profile to show them here.</p>
              )}
            </div>
          ) : null}

          {journals.length === 0 && (
            <Callout tone="danger" icon={<AlertTriangle size={16} />}>
              <div style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif" }}>
                <p style={{ margin: 0, fontWeight: 550 }}>No bank or cash journal found</p>
                <p style={{ margin: '2px 0 0' }}>Add one under Invoicing → Configuration → Journals before recording a payment.</p>
              </div>
            </Callout>
          )}

          <Field label="Journal" htmlFor="ebrpm-journal">
            <Select
              id="ebrpm-journal"
              value={form.journalId}
              onChange={(e) => setForm((f) => ({ ...f, journalId: e.target.value }))}
              disabled={journals.length === 0}
            >
              <option value="">Select journal…</option>
              {journals.map((j) => (
                <option key={j._id} value={j._id}>{j.name} ({j.type === 'bank' ? 'Bank' : 'Cash'})</option>
              ))}
            </Select>
          </Field>

          <Field label="Payment Method" htmlFor="ebrpm-method">
            <Select id="ebrpm-method" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
          </Field>

          {isCheque && (
            <div style={{ borderRadius: 'var(--r-2, 12px)', boxShadow: 'inset 0 0 0 1px var(--line-2)', background: 'var(--surface-2)', padding: 12, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <Field label="Cheque Number" htmlFor="ebrpm-cheque-no">
                  <Input
                    id="ebrpm-cheque-no"
                    type="text"
                    value={form.chequeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                    placeholder="e.g. 123456"
                  />
                </Field>
                <Field label="Cheque Date" htmlFor="ebrpm-cheque-date">
                  <Input
                    id="ebrpm-cheque-date"
                    type="date"
                    value={form.chequeDate}
                    onChange={(e) => setForm((f) => ({ ...f, chequeDate: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Drawee Bank" htmlFor="ebrpm-bank">
                <Input
                  id="ebrpm-bank"
                  type="text"
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="e.g. HDFC Bank"
                />
              </Field>
            </div>
          )}

          <Field label="Payment Date" htmlFor="ebrpm-date">
            <Input id="ebrpm-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>

          <Field label="Amount Paid" htmlFor="ebrpm-amount">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                id="ebrpm-amount"
                type="number"
                step="any"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                style={{ flex: 1 }}
              />
              <span style={{ ...mutedStyle, width: 48, textAlign: 'right' }}>{currency}</span>
            </div>
          </Field>

          <Field label="Reference" htmlFor="ebrpm-ref">
            <Input
              id="ebrpm-ref"
              type="text"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="UTR / transaction id / cheque no."
            />
          </Field>

          <Field label="Internal Memo" htmlFor="ebrpm-memo">
            <Input
              id="ebrpm-memo"
              type="text"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="Optional notes"
            />
          </Field>

          <Field label="Payment Proof (optional)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ flex: 1, cursor: 'pointer' }}>
                <input
                  type="file"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                  accept="image/*,.pdf"
                />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                  borderRadius: 'var(--r-2, 12px)', border: '1px dashed var(--line-strong)',
                  ...mutedStyle,
                }}>
                  <Upload size={14} />
                  {proofFile ? (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proofFile.name}</span>
                  ) : (
                    <span>Choose receipt / screenshot</span>
                  )}
                </div>
              </label>
              {proofFile && (
                <Button
                  variant="ghost" size="sm" type="button"
                  title="Remove file" aria-label="Remove file"
                  style={{ color: 'var(--danger)' }}
                  iconLeft={<X size={16} />}
                  onClick={() => setProofFile(null)}
                />
              )}
            </div>
          </Field>

          <div style={{ borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)', padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ ...totalsRow, color: 'var(--fg-3)' }}>
              <span>Bill Due</span>
              <span>{formatCurrency(amountDue, currency)}</span>
            </div>
            <div style={{ ...totalsRow, color: 'var(--fg-3)' }}>
              <span>Payment</span>
              <span>−{formatCurrency(Number(form.amount) || 0, currency)}</span>
            </div>
            <div style={{
              ...totalsRow, fontWeight: 600, paddingTop: 6, borderTop: '1px solid var(--line-2)',
              color: remaining > 0 ? 'var(--warn-ink)' : 'var(--brand-ink)',
            }}>
              <span>Remaining</span>
              <span>{formatCurrency(remaining, currency)}</span>
            </div>
          </div>
        </form>
      )}
    </Modal>
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
    <Modal
      open
      size="md"
      onClose={sending ? undefined : onClose}
      icon={<Mail size={18} />}
      title="Email Invoice"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="eim-form"
            disabled={sending}
            iconLeft={sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          >
            Send Email
          </Button>
        </>
      }
    >
      <form id="eim-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
        <Field label="To" required htmlFor="eim-to">
          <Input
            id="eim-to"
            type="email"
            value={form.to}
            onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
            placeholder="customer@email.com"
            autoFocus
          />
        </Field>

        <Field label="Subject" htmlFor="eim-subject">
          <Input
            id="eim-subject"
            type="text"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
        </Field>

        <Field label="Message" htmlFor="eim-message">
          <Textarea
            id="eim-message"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            rows={4}
          />
        </Field>
      </form>
    </Modal>
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

  const handleReverse = async (createNew = false) => {
    try {
      setSaving(true);
      const res = await invoicingApi.createCreditNote(orgSlug, invoiceId, {
        reason: form.reason,
        reversalDate: form.reversalDate,
        createNewInvoice: createNew,
      });
      const targetId = createNew ? res?.newInvoice?._id : res?.creditNote?._id;
      onSuccess(targetId);
    } catch (err) {
      showToast(err.message || 'Failed to create credit note', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={saving ? undefined : onClose}
      icon={<FileText size={18} />}
      title="Credit Note"
      footer={
        <>
          <Button variant="danger" onClick={() => handleReverse(false)} disabled={saving}
            iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            Reverse
          </Button>
          <Button variant="secondary" onClick={() => handleReverse(true)} disabled={saving}>
            Reverse and Create Invoice
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Discard</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Reason" htmlFor="cnm-reason">
          <Input
            id="cnm-reason"
            type="text"
            value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Reason displayed on Credit Note"
            autoFocus
          />
        </Field>
        <div>
          <span style={fieldLabelStyle}>Journal</span>
          <div style={{ ...valueStyle, marginTop: 2 }}>{journalName || 'Default'}</div>
        </div>
        <Field label="Reversal date" htmlFor="cnm-date">
          <Input
            id="cnm-date"
            type="date"
            value={form.reversalDate}
            onChange={e => setForm(f => ({ ...f, reversalDate: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ============================================================================
// CancelEInvoiceModal — IRP-required reason + remarks form
// ============================================================================

const E_INVOICE_CANCEL_REASONS = [
  'Duplicate',
  'Data Entry Mistake',
  'Order Cancelled',
  'Other',
];

function CancelEInvoiceModal({ reason, remarks, loading, onChange, onConfirm, onCancel }) {
  return (
    <Modal
      open
      size="sm"
      tone="danger"
      onClose={loading ? undefined : onCancel}
      icon={<AlertTriangle size={18} />}
      title="Cancel E-Invoice?"
      sub="The IRN will be cancelled at the IRP. This is only allowed within 24 hours of generation and cannot be undone."
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" type="button" onClick={onCancel} disabled={loading}>Keep E-Invoice</Button>
          <Button
            variant="danger" type="button" onClick={onConfirm} disabled={loading}
            iconLeft={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            Cancel E-Invoice
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <Field label="Reason" required htmlFor="ceim-reason">
          <Select id="ceim-reason" value={reason} onChange={(e) => onChange({ reason: e.target.value })}>
            {E_INVOICE_CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>

        <Field label="Remarks" hint="Optional, max 100 characters." htmlFor="ceim-remarks">
          <Textarea
            id="ceim-remarks"
            value={remarks}
            onChange={(e) => onChange({ remarks: e.target.value.slice(0, 100) })}
            maxLength={100}
            rows={3}
            placeholder="Optional context for audit trail"
            style={{ resize: 'none' }}
          />
          <p style={{ ...mutedStyle, textAlign: 'right', margin: '4px 0 0' }}>
            {(remarks || '').length}/100
          </p>
        </Field>
      </div>
    </Modal>
  );
}

// ============================================================================
// GstHoldModal — reason form for putting a vendor-bill payment on GST hold
// (same shell as CancelEInvoiceModal; replaces the old window.prompt)
// ============================================================================

function GstHoldModal({ reason, loading, onChange, onConfirm, onCancel }) {
  return (
    <Modal
      open
      size="sm"
      tone="warn"
      onClose={loading ? undefined : onCancel}
      icon={<AlertTriangle size={18} />}
      title="Hold Payment?"
      sub="A soft warning is shown when recording a payment on this bill. You can release the hold at any time."
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" type="button" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            type="button" onClick={onConfirm} disabled={loading || !(reason || '').trim()}
            iconLeft={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            Hold Payment
          </Button>
        </>
      }
    >
      <Field label="Reason" required htmlFor="ghm-reason">
        <Textarea
          id="ghm-reason"
          value={reason}
          onChange={(e) => onChange({ reason: e.target.value })}
          rows={3}
          placeholder="Why is this payment being held?"
          style={{ resize: 'none' }}
          autoFocus
        />
      </Field>
    </Modal>
  );
}
