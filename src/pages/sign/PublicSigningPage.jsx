import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import SignatureCanvas from 'react-signature-canvas';
import signApi from '../../utils/signApi';
import { todayStr } from '../../utils/dateUtils';
import { API_BASE_URL } from '../../utils/config';
import {
  PenTool, Type, Calendar, User, Mail, Phone, Building2,
  CheckSquare, AlignLeft, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Clock, Shield,
  ArrowRight, ArrowDown,
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ── Field type metadata ─────────────────────────────────────────────────────
const FIELD_META = {
  signature:  { icon: PenTool,   label: 'Signature',   placeholder: 'Click to sign' },
  initials:   { icon: PenTool,   label: 'Initials',    placeholder: 'Click to initial' },
  text:       { icon: Type,      label: 'Text',        placeholder: 'Enter text' },
  name:       { icon: User,      label: 'Name',        placeholder: 'Enter name' },
  email:      { icon: Mail,      label: 'Email',       placeholder: 'Enter email' },
  phone:      { icon: Phone,     label: 'Phone',       placeholder: 'Enter phone' },
  company:    { icon: Building2, label: 'Company',     placeholder: 'Enter company' },
  date:       { icon: Calendar,  label: 'Date',        placeholder: 'Select date' },
  checkbox:   { icon: CheckSquare, label: 'Checkbox',  placeholder: '' },
  multiline:  { icon: AlignLeft, label: 'Text',        placeholder: 'Enter text' },
};

// ── Cursive fonts for "Type" tab in signature modal ─────────────────────────
const CURSIVE_FONTS = [
  { name: 'Dancing Script', css: "'Dancing Script', cursive" },
  { name: 'Great Vibes', css: "'Great Vibes', cursive" },
  { name: 'Sacramento', css: "'Sacramento', cursive" },
  { name: 'Pacifico', css: "'Pacifico', cursive" },
];

// Generate a typed signature as data URL
function generateTypedSignature(text, fontFamily, width = 400, height = 150) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#1e293b';
  ctx.font = `48px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  return canvas.toDataURL('image/png');
}

// Generate a short hash fingerprint from a data URL for signature identification
async function generateSignatureHash(dataUrl) {
  if (!dataUrl) return '';
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(dataUrl);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12);
  } catch {
    return '';
  }
}

// Format date as "04 April 2026" in user's local timezone
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ── Signature Pad Modal ─────────────────────────────────────────────────────
function SignaturePadModal({ isOpen, onClose, onAdopt, type = 'signature', signerName = '' }) {
  const sigCanvasRef = useRef(null);
  const [activeTab, setActiveTab] = useState('draw'); // 'draw' | 'type'
  const [typedText, setTypedText] = useState(signerName || '');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0]);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('draw');
      setTypedText(signerName || '');
      setSelectedFont(CURSIVE_FONTS[0]);
      setIsEmpty(true);
    }
  }, [isOpen, signerName]);

  const handleClear = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
      setIsEmpty(true);
    }
  };

  const handleAdopt = () => {
    let dataUrl = null;
    if (activeTab === 'draw') {
      if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
        dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
      }
    } else {
      if (typedText.trim()) {
        const w = type === 'initials' ? 200 : 400;
        const h = type === 'initials' ? 100 : 150;
        dataUrl = generateTypedSignature(typedText.trim(), selectedFont.css, w, h);
      }
    }
    if (dataUrl) {
      onAdopt(dataUrl);
      onClose();
    }
  };

  const canAdopt = activeTab === 'draw' ? !isEmpty : typedText.trim().length > 0;
  const title = type === 'initials' ? 'Draw your initials' : 'Draw your signature';

  if (!isOpen) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg overflow-hidden max-h-[90vh] sm:max-h-none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('draw')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'draw'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Draw
          </button>
          <button
            onClick={() => setActiveTab('type')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'type'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Type
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-5 p-3">
          {activeTab === 'draw' ? (
            <div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50 relative">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  canvasProps={{
                    width: isMobile ? 600 : (type === 'initials' ? 300 : 460),
                    height: isMobile ? 300 : (type === 'initials' ? 150 : 200),
                    className: 'w-full cursor-crosshair touch-none',
                    style: { width: '100%', height: isMobile ? '250px' : (type === 'initials' ? '150px' : '200px') },
                  }}
                  penColor="#1e293b"
                  minWidth={isMobile ? 3 : 2}
                  maxWidth={isMobile ? 6 : 4}
                  onBegin={() => setIsEmpty(false)}
                />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-gray-400 text-sm sm:text-sm text-base">
                      {isMobile ? 'Use your finger to sign' : 'Sign here'}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={handleClear}
                className="mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={type === 'initials' ? 'Type your initials' : 'Type your full name'}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                autoFocus
              />
              <div className="mt-4 space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Preview</p>
                <div className="grid grid-cols-2 gap-2">
                  {CURSIVE_FONTS.map((font) => (
                    <button
                      key={font.name}
                      onClick={() => setSelectedFont(font)}
                      className={`p-3 border rounded-lg text-center transition-all ${
                        selectedFont.name === font.name
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span
                        style={{ fontFamily: font.css, fontSize: '20px', color: '#1e293b' }}
                        className="block truncate"
                      >
                        {typedText || (type === 'initials' ? 'AB' : 'John Doe')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdopt}
            disabled={!canAdopt}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Adopt {type === 'initials' ? 'Initials' : 'Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel, confirmColor = 'red' }) {
  if (!isOpen) return null;
  const colorClasses = confirmColor === 'red'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-indigo-600 hover:bg-indigo-700 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${colorClasses}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Field Input ──────────────────────────────────────────────────────
function InlineFieldInput({ item, value, onChange, onFocus, onBlur, style }) {
  const fieldType = item.type;

  if (fieldType === 'checkbox') {
    return (
      <button
        onClick={() => onChange(!value)}
        style={style}
        className="absolute flex items-center justify-center cursor-pointer"
      >
        <div className={`w-6 h-6 sm:w-5 sm:h-5 rounded border-2 flex items-center justify-center transition-colors ${
          value ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-400 hover:border-indigo-400'
        }`}>
          {value && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white" />}
        </div>
      </button>
    );
  }

  // Shared mobile-friendly input class: min touch target 44px on mobile
  const inputCls = 'absolute bg-white/90 border border-indigo-300 rounded px-2 py-1 text-sm sm:text-xs sm:px-1.5 sm:py-0.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[44px] sm:min-h-0';

  if (fieldType === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={style}
        className={inputCls}
      />
    );
  }

  if (fieldType === 'multiline') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={FIELD_META[fieldType]?.placeholder || 'Enter text'}
        style={style}
        className={`${inputCls} resize-none`}
      />
    );
  }

  // Text-type fields: text, name, email, phone, company
  const inputType = fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'tel' : 'text';

  return (
    <input
      type={inputType}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={FIELD_META[fieldType]?.placeholder || 'Enter text'}
      style={style}
      className={inputCls}
    />
  );
}

// ── PDF Page with Fields ────────────────────────────────────────────────────
function PdfPageWithFields({
  pageNum,
  pdfDoc,
  signItems,
  values,
  onFieldChange,
  onOpenSignaturePad,
  activeFieldId,
  setActiveFieldId,
  scale,
  signatureHashes,
  showValidation,
  previousValues = {},
  allSignItems = [],
}) {
  const canvasRef = useRef(null);
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 });
  const [rendered, setRendered] = useState(false);

  // Render the PDF page onto a canvas
  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!pdfDoc) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageDims({ width: viewport.width, height: viewport.height });
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled) console.error('Error rendering PDF page', pageNum, err);
      }
    }
    setRendered(false);
    render();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  // Filter sign items for this page
  // signItems use 0-indexed page, but pageNum is 1-indexed (for PDF.js)
  const pageItems = signItems.filter((item) => item.page === pageNum - 1);

  // Previous signers' fields for this page (read-only)
  const currentSignerFieldIds = new Set(signItems.map(i => i._id || i.id));
  const prevPageItems = allSignItems.filter(
    (item) => item.page === pageNum - 1 && !currentSignerFieldIds.has(item._id || item.id) && previousValues[item._id || item.id]
  );

  return (
    <div className="relative mx-auto shadow-lg bg-white" data-page-index={pageNum - 1} style={{ width: pageDims.width || 'auto', height: pageDims.height || 'auto' }}>
      <canvas ref={canvasRef} className="block" />

      {/* Read-only previous signers' filled fields */}
      {rendered && prevPageItems.map((item) => {
        const fieldId = item._id || item.id;
        const val = previousValues[fieldId];
        if (!val) return null;
        const left = (item.posX ?? item.x ?? 0) * pageDims.width;
        const top = (item.posY ?? item.y ?? 0) * pageDims.height;
        const width = (item.width ?? 0.22) * pageDims.width;
        const height = (item.height ?? 0.03) * pageDims.height;
        const isSignature = val === '__signed__';
        const displayDate = item.type === 'date' ? formatDisplayDate(val) : val;

        return (
          <div
            key={`prev-${fieldId}`}
            className="absolute pointer-events-none"
            style={{ left, top, width, height }}
          >
            {isSignature ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-50/50 border border-gray-200 rounded">
                <span className="text-[10px] text-gray-400 italic">Signed</span>
              </div>
            ) : (
              <div className="w-full h-full flex items-center text-gray-800 text-xs px-1 truncate" style={{ fontSize: Math.min(Math.max(height * 0.5, 10), 16) }}>
                {displayDate}
              </div>
            )}
          </div>
        );
      })}

      {rendered && pageItems.map((item) => {
        const fieldValue = values[item._id || item.id];
        const isFilled = fieldValue !== undefined && fieldValue !== '' && fieldValue !== false && fieldValue !== null;
        const isActive = activeFieldId === (item._id || item.id);
        const isSignatureType = item.type === 'signature' || item.type === 'initials';
        const isRequired = item.required !== false; // Default to required
        const meta = FIELD_META[item.type] || FIELD_META.text;
        const Icon = meta.icon;

        // Position & size from item (fractions 0–1 of page dimensions)
        const left = (item.posX ?? item.x ?? 0) * pageDims.width;
        const top = (item.posY ?? item.y ?? 0) * pageDims.height;
        const width = (item.width ?? 0.2) * pageDims.width;
        const height = (item.height ?? 0.05) * pageDims.height;

        // For signature/initials: show image if filled, else clickable placeholder
        if (isSignatureType) {
          const fieldId = item._id || item.id;
          const hash = isFilled ? (signatureHashes?.[fieldId] || '') : '';
          return (
            <div
              key={fieldId}
              className="absolute cursor-pointer rounded transition-all overflow-hidden"
              style={{
                left, top, width, height: isFilled ? height + 20 : height,
                border: isFilled ? '2px dashed #d4a0a0' : undefined,
                backgroundColor: isFilled ? 'rgba(255, 230, 230, 0.5)' : undefined,
              }}
              onClick={() => onOpenSignaturePad(fieldId, item.type)}
            >
              {isFilled ? (
                <div className="flex flex-col items-center h-full">
                  <span className="text-[9px] text-green-700 font-medium mt-0.5">Signed with Rivvra Sign</span>
                  <div className="flex-1 flex items-center justify-center w-full px-1">
                    <img src={fieldValue} alt={item.type} className="max-w-full max-h-full object-contain" />
                  </div>
                  {hash && <span className="text-[8px] text-gray-500 mb-0.5 font-mono">{hash}...</span>}
                </div>
              ) : (
                <div className={`flex flex-col items-center justify-center h-full border-2 border-dashed rounded ${
                  showValidation && isRequired && !isFilled
                    ? 'border-red-500 bg-red-50/60 animate-pulse'
                    : isRequired
                      ? 'border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60'
                      : 'border-gray-300 bg-gray-50/50 hover:bg-gray-100/60'
                }`}>
                  <Icon className={`w-4 h-4 ${showValidation && isRequired && !isFilled ? 'text-red-500' : 'text-indigo-500'}`} />
                  <span className={`text-[10px] font-medium ${showValidation && isRequired && !isFilled ? 'text-red-600' : 'text-indigo-600'}`}>{meta.placeholder}</span>
                </div>
              )}
            </div>
          );
        }

        // For checkbox
        if (item.type === 'checkbox') {
          return (
            <div
              key={item._id || item.id}
              className={`absolute rounded transition-all flex items-center justify-center ${
                isFilled ? '' : isRequired ? '' : ''
              }`}
              style={{ left, top, width, height }}
            >
              <InlineFieldInput
                item={item}
                value={fieldValue || false}
                onChange={(val) => onFieldChange(item._id || item.id, val)}
                style={{ left: 0, top: 0, width, height, position: 'relative' }}
              />
              {isFilled && (
                <div className="absolute -top-1 -right-1">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
              )}
            </div>
          );
        }

        // Text-type fields: show inline input when active, placeholder when inactive
        return (
          <div
            key={item._id || item.id}
            className={`absolute rounded transition-all ${
              isActive
                ? ''
                : isFilled
                  ? 'border-2 border-green-400 bg-green-50/30 cursor-pointer'
                  : showValidation && isRequired
                    ? 'border-2 border-dashed border-red-500 bg-red-50/60 cursor-pointer animate-pulse'
                    : isRequired
                      ? 'border-2 border-dashed border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60 cursor-pointer'
                      : 'border-2 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-100/60 cursor-pointer'
            }`}
            style={{ left, top, width, height }}
            onClick={() => {
              if (!isActive) setActiveFieldId(item._id || item.id);
            }}
          >
            {isActive ? (
              <InlineFieldInput
                item={item}
                value={fieldValue || ''}
                onChange={(val) => onFieldChange(item._id || item.id, val)}
                onFocus={() => {}}
                onBlur={() => {
                  // Delay to allow click events to fire first
                  setTimeout(() => setActiveFieldId(null), 150);
                }}
                style={{ left: 0, top: 0, width: '100%', height: '100%', position: 'relative' }}
              />
            ) : (
              <div className="flex items-center h-full px-1.5 gap-1 overflow-hidden">
                {isFilled ? (
                  <>
                    <span className="text-xs text-gray-900 truncate flex-1">
                      {item.type === 'date' ? formatDisplayDate(fieldValue) : fieldValue}
                    </span>
                    <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                  </>
                ) : (
                  <>
                    <Icon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="text-[10px] text-indigo-600 truncate">{meta.placeholder}</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Public Signing Page ────────────────────────────────────────────────
export default function PublicSigningPage() {
  const { requestId, signerId, token } = useParams();

  // State
  const [status, setStatus] = useState('loading'); // loading | signing | success | refused | error | waiting
  const [error, setError] = useState('');
  const [request, setRequest] = useState(null);
  const [signer, setSigner] = useState(null);
  const [template, setTemplate] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [values, setValues] = useState({}); // { [signItemId]: value }
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [showRefuseConfirm, setShowRefuseConfirm] = useState(false);
  const [sigPadModal, setSigPadModal] = useState({ open: false, fieldId: null, type: 'signature' });
  const [sigDataUrls, setSigDataUrls] = useState({ signature: null, initials: null });
  const [scale, setScale] = useState(1.5);

  // Envelope state
  const [envelope, setEnvelope] = useState(null); // null = single doc
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [envelopeValues, setEnvelopeValues] = useState({}); // { [docId]: { [fieldId]: value } }

  const containerRef = useRef(null);

  // Signature hash fingerprints for display
  const [signatureHashes, setSignatureHashes] = useState({});

  // Previous signers' values (read-only display)
  const [previousValues, setPreviousValues] = useState({});
  const [allSignItems, setAllSignItems] = useState([]);

  // Click to Start / Next field navigation
  const [hasStarted, setHasStarted] = useState(false);

  // Validation: highlight missing required fields on submit attempt
  const [showValidation, setShowValidation] = useState(false);

  // Toast notification
  const [toast, setToast] = useState(null); // { message, type }
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Verify signing link on mount ────────────────────────────────────
  useEffect(() => {
    async function verify() {
      try {
        // Use raw fetch to detect signerState: 'waiting' from 403 responses
        const res = await fetch(`${API_BASE_URL}/api/sign/verify/${requestId}/${signerId}/${token}`);
        const data = await res.json();

        if (!res.ok) {
          // Sequential signing: signer must wait for their turn
          if (data.signerState === 'waiting') {
            setStatus('waiting');
            return;
          }
          throw new Error(data.error || 'This signing link is invalid or has expired.');
        }

        setRequest(data.request);
        setSigner(data.signer);
        setOrgName(data.orgName || '');

        // Handle envelope vs single doc
        if (data.envelope?.isEnvelope) {
          setEnvelope(data.envelope);
          setCurrentDocIndex(data.envelope.currentDocumentIndex || 0);
          // Build template from the current document
          const currentDoc = data.envelope.documents[data.envelope.currentDocumentIndex || 0];
          if (currentDoc) {
            setTemplate({
              pdfUrl: currentDoc.pdfUrl,
              pdfProxyUrl: `/api/sign/pdf-proxy/${requestId}/${signerId}/${token}?documentId=${currentDoc.id}`,
              numPages: currentDoc.numPages || 1,
              signItems: currentDoc.signItems || [],
            });
          }
        } else {
          setTemplate(data.template);
        }

        // Store previous signers' values and all sign items for read-only display
        if (data.previousValues) setPreviousValues(data.previousValues);
        if (data.template?.allSignItems) setAllSignItems(data.template.allSignItems);

        // Pre-fill name and email if available
        const items = data.envelope?.isEnvelope
          ? (data.envelope.documents[data.envelope.currentDocumentIndex || 0]?.signItems || [])
          : (data.template?.signItems || []);
        const initialValues = {};
        items.forEach((item) => {
          const id = item._id || item.id;
          if (item.type === 'name' && data.signer?.name) {
            initialValues[id] = data.signer.name;
          } else if (item.type === 'email' && data.signer?.email) {
            initialValues[id] = data.signer.email;
          } else if (item.type === 'date') {
            initialValues[id] = todayStr();
          }
        });
        setValues(initialValues);
        setStatus('signing');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'This signing link is invalid or has expired.');
        setStatus('error');
      }
    }
    verify();
  }, [requestId, signerId, token]);

  // ── Load PDF document ────────────────────────────────────────────────
  useEffect(() => {
    const pdfSrc = template?.pdfProxyUrl
      ? `${API_BASE_URL}${template.pdfProxyUrl}`
      : template?.pdfUrl;
    if (status !== 'signing' || !pdfSrc) return;
    let cancelled = false;

    async function loadPdf() {
      try {
        const doc = await pdfjsLib.getDocument(pdfSrc).promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load PDF:', err);
          setError('Failed to load the document PDF. Please try again later.');
          setStatus('error');
        }
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [status, template?.pdfUrl, template?.pdfProxyUrl]);

  // ── Responsive scale ─────────────────────────────────────────────────
  useEffect(() => {
    function updateScale() {
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      // Target: PDF page at ~612pt (US Letter). Fit with padding.
      const availableWidth = containerWidth - 32; // 16px padding each side
      const baseWidth = 612; // Standard US Letter PDF width in points
      const newScale = Math.max(0.5, Math.min(2, availableWidth / baseWidth));
      setScale(newScale);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [status]);

  // ── Field value change ───────────────────────────────────────────────
  const handleFieldChange = useCallback((fieldId, value) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (showValidation) setShowValidation(false); // clear validation on any field change
  }, [showValidation]);

  // ── Signature reuse prompt ───────────────────────────────────────────
  const [sigReusePrompt, setSigReusePrompt] = useState({ open: false, fieldId: null, type: 'signature' });

  const handleOpenSignaturePad = useCallback((fieldId, type) => {
    const existing = sigDataUrls[type];
    if (existing) {
      // Show reuse prompt instead of silently applying
      setSigReusePrompt({ open: true, fieldId, type });
    } else {
      setSigPadModal({ open: true, fieldId, type });
    }
  }, [sigDataUrls]);

  const handleReuseExisting = useCallback(() => {
    const { fieldId, type } = sigReusePrompt;
    const existing = sigDataUrls[type];
    if (existing && fieldId) {
      handleFieldChange(fieldId, existing);
      // Copy hash too
      const existingHash = Object.values(signatureHashes)[0] || '';
      if (existingHash) setSignatureHashes(prev => ({ ...prev, [fieldId]: existingHash }));
    }
    setSigReusePrompt({ open: false, fieldId: null, type: 'signature' });
  }, [sigReusePrompt, sigDataUrls, handleFieldChange, signatureHashes]);

  const handleDrawNew = useCallback(() => {
    const { fieldId, type } = sigReusePrompt;
    setSigReusePrompt({ open: false, fieldId: null, type: 'signature' });
    setSigPadModal({ open: true, fieldId, type });
  }, [sigReusePrompt]);

  // ── Adopt signature from modal ───────────────────────────────────────
  const handleAdoptSignature = useCallback(async (dataUrl) => {
    const { fieldId, type } = sigPadModal;
    // Store the data URL for reuse
    setSigDataUrls((prev) => ({ ...prev, [type]: dataUrl }));
    // Fill this field
    handleFieldChange(fieldId, dataUrl);

    // Compute hash fingerprint for the signature
    const hash = await generateSignatureHash(dataUrl);
    const hashUpdates = { [fieldId]: hash };

    // Also fill any other fields of the same type that don't have a value yet
    if (template?.signItems) {
      template.signItems.forEach((item) => {
        const id = item._id || item.id;
        if (item.type === type && id !== fieldId && !values[id]) {
          handleFieldChange(id, dataUrl);
          hashUpdates[id] = hash;
        }
      });
    }

    setSignatureHashes((prev) => ({ ...prev, ...hashUpdates }));
  }, [sigPadModal, handleFieldChange, template?.signItems, values]);

  // ── Navigate to next unfilled field ──────────────────────────────────
  const scrollToNextField = useCallback((fromFieldId = null) => {
    const items = template?.signItems || [];
    // Sort by page then posY to get document order
    const sorted = [...items].sort((a, b) => {
      if ((a.page || 0) !== (b.page || 0)) return (a.page || 0) - (b.page || 0);
      return (a.posY || 0) - (b.posY || 0);
    });

    // Find unfilled fields
    let startIdx = 0;
    if (fromFieldId) {
      const currentIdx = sorted.findIndex(i => (i._id || i.id) === fromFieldId);
      if (currentIdx >= 0) startIdx = currentIdx + 1;
    }

    // Search from startIdx, then wrap around
    for (let offset = 0; offset < sorted.length; offset++) {
      const idx = (startIdx + offset) % sorted.length;
      const item = sorted[idx];
      const id = item._id || item.id;
      const v = values[id];
      const isEmpty = v === undefined || v === '' || v === false || v === null;
      if (isEmpty) {
        // Scroll to this field's page
        const pageIndex = item.page || 0;
        const pageEl = containerRef.current?.querySelectorAll('[data-page-index]')?.[pageIndex];
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // For signature fields, open the pad; for others, activate the field
          setTimeout(() => {
            if (item.type === 'signature' || item.type === 'initials') {
              handleOpenSignaturePad(id, item.type);
            } else {
              setActiveFieldId(id);
            }
          }, 400);
        }
        return true;
      }
    }
    return false; // all filled
  }, [template?.signItems, values, handleOpenSignaturePad]);

  const handleClickToStart = useCallback(() => {
    setHasStarted(true);
    scrollToNextField(null);
  }, [scrollToNextField]);

  // ── Progress calculation ─────────────────────────────────────────────
  const signItems = template?.signItems || [];
  const requiredItems = signItems.filter((item) => item.required !== false);
  const filledRequiredCount = requiredItems.filter((item) => {
    const v = values[item._id || item.id];
    return v !== undefined && v !== '' && v !== false && v !== null;
  }).length;
  const totalFieldCount = signItems.length;
  const filledTotalCount = signItems.filter((item) => {
    const v = values[item._id || item.id];
    return v !== undefined && v !== '' && v !== false && v !== null;
  }).length;
  const allRequiredFilled = filledRequiredCount === requiredItems.length;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting) return;
    // If not all required filled, show validation and scroll to first missing
    if (!allRequiredFilled) {
      setShowValidation(true);
      scrollToNextField(null); // scroll to first unfilled
      showToast('Please complete all required fields before submitting', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const currentDoc = envelope?.documents?.[currentDocIndex];
      const submitData = {
        values,
        signatureDataUrl: sigDataUrls.signature || null,
        initialsDataUrl: sigDataUrls.initials || null,
        signatureHashes: signatureHashes || {},
        ...(currentDoc && { documentId: currentDoc.id }),
      };

      const res = await signApi.submitSignature(requestId, signerId, token, submitData);

      // Envelope: more documents to sign
      if (envelope && res.documentsRemaining > 0) {
        const nextIdx = currentDocIndex + 1;
        const nextDoc = envelope.documents[nextIdx];
        if (nextDoc) {
          setCurrentDocIndex(nextIdx);
          setTemplate({
            pdfUrl: nextDoc.pdfUrl,
            pdfProxyUrl: `/api/sign/pdf-proxy/${requestId}/${signerId}/${token}?documentId=${nextDoc.id}`,
            numPages: nextDoc.numPages || 1,
            signItems: nextDoc.signItems || [],
          });
          // Reset values for next doc but keep signature images
          const nextValues = {};
          (nextDoc.signItems || []).forEach(item => {
            const id = item._id || item.id;
            if (item.type === 'name' && signer?.name) nextValues[id] = signer.name;
            else if (item.type === 'email' && signer?.email) nextValues[id] = signer.email;
            else if (item.type === 'date') nextValues[id] = todayStr();
          });
          setValues(nextValues);
          setPdfDoc(null);
          setNumPages(0);
        }
      } else {
        setStatus('success');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      alert(err.message || 'Failed to submit signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Refuse ──────────────────────────────────────────────────────────
  const handleRefuse = async () => {
    setRefusing(true);
    try {
      await signApi.refuseSignature(requestId, signerId, token);
      setStatus('refused');
    } catch (err) {
      if (err.name === 'AbortError') return;
      alert(err.message || 'Failed to refuse signature. Please try again.');
    } finally {
      setRefusing(false);
      setShowRefuseConfirm(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 text-sm">Verifying your signing link...</p>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  // ── Waiting state (sequential signing — not your turn yet) ──────────
  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-900">Not Your Turn Yet</h2>
          <p className="mt-3 text-sm text-gray-600">
            This document requires signatures in a specific order. Other signers need to complete their signatures before you.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            You'll receive an email when it's your turn to sign.
          </p>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">Powered by Rivvra Sign</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-900">Unable to Open Document</h2>
          <p className="mt-3 text-sm text-gray-600">{error}</p>
          <p className="mt-4 text-xs text-gray-400">
            If you believe this is an error, please contact the sender.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ───────────────────────────────────────────────────
  if (status === 'success') {
    const signerCount = request?.signers?.length || 0;
    const completedCount = request?.signers?.filter(s => s.state === 'completed').length || 0;
    const signedDate = formatDisplayDate(todayStr());

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-gray-900">Document Signed Successfully!</h2>
            <p className="mt-3 text-sm text-gray-600">
              Thank you for signing <span className="font-medium">{request?.reference || 'this document'}</span>.
            </p>
          </div>

          {/* Signing summary */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Signed by</span>
              <span className="font-medium text-gray-900">{signer?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-gray-900">{signedDate}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Document</span>
              <span className="font-medium text-gray-900 truncate ml-4">{request?.reference || 'Document'}</span>
            </div>
            {signerCount > 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Signers</span>
                <span className="font-medium text-gray-900">{completedCount + 1} of {signerCount} signed</span>
              </div>
            )}
            {signatureHashes && Object.values(signatureHashes)[0] && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Signature ID</span>
                <span className="font-mono text-xs text-gray-700">{Object.values(signatureHashes)[0]}...</span>
              </div>
            )}
          </div>

          <p className="mt-4 text-sm text-gray-500 text-center">
            You will receive a copy via email once all parties have signed.
          </p>

          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-center gap-1.5">
            <Shield size={12} className="text-gray-400" />
            <span className="text-[11px] text-gray-400">Secured by Rivvra Sign</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Refused state ───────────────────────────────────────────────────
  if (status === 'refused') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-900">You have refused to sign this document</h2>
          <p className="mt-3 text-sm text-gray-600">The sender has been notified.</p>
        </div>
      </div>
    );
  }

  // ── Signing state ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Google Fonts for cursive signature typing */}
      <link
        href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Sacramento&family=Pacifico&display=swap"
        rel="stylesheet"
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        {/* Envelope document stepper */}
        {envelope && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2">
            <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto">
              {envelope.documents.map((doc, idx) => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                    idx === currentDocIndex
                      ? 'bg-indigo-600 text-white'
                      : idx < currentDocIndex
                      ? 'bg-indigo-200 text-indigo-700'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {idx < currentDocIndex ? <Check className="w-3 h-3" /> : <span>{idx + 1}</span>}
                  <span className="hidden sm:inline">{doc.templateName}</span>
                </div>
              ))}
              <span className="text-xs text-gray-500 ml-2">
                Document {currentDocIndex + 1} of {envelope.totalDocuments}
              </span>
            </div>
          </div>
        )}
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: document name */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="w-5 h-5 text-indigo-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900 truncate">
              {envelope ? envelope.documents[currentDocIndex]?.templateName : (request?.reference || 'Document')}
            </span>
          </div>

          {/* Center: org name */}
          {orgName && (
            <div className="hidden sm:block text-sm text-gray-500 font-medium text-center flex-shrink-0">
              {orgName}
            </div>
          )}

          {/* Right: signer info */}
          <div className="flex items-center gap-2 text-right min-w-0 flex-1 justify-end">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{signer?.name}</p>
              <p className="text-xs text-gray-500 truncate">{signer?.email}</p>
            </div>
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
        </div>
      </header>

      {/* ── Expiry Countdown ──────────────────────────────────────────── */}
      {request?.validity && (() => {
        const now = new Date();
        const expiry = new Date(request.validity);
        const diffMs = expiry - now;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return null;
        const isUrgent = diffDays <= 3;
        return (
          <div className={`px-4 py-1.5 text-center text-xs font-medium ${
            isUrgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <Clock className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            {diffDays === 1 ? 'Expires tomorrow' : `Expires in ${diffDays} days`}
            {' '}({formatDisplayDate(request.validity.split('T')[0])})
          </div>
        );
      })()}

      {/* ── Click to Start Banner ──────────────────────────────────────── */}
      {!hasStarted && pdfDoc && (
        <div className="sticky top-[57px] z-20 flex justify-center py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-md">
          <button
            onClick={handleClickToStart}
            className="flex items-center gap-2 px-6 py-2.5 bg-white text-indigo-700 font-semibold text-sm rounded-full shadow-lg hover:shadow-xl hover:bg-indigo-50 transition-all"
          >
            <ArrowDown className="w-4 h-4" />
            CLICK TO START
          </button>
        </div>
      )}

      {/* ── PDF Viewer ──────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 overflow-auto py-6 px-4" onClick={(e) => {
        // Click on background to deselect active field
        if (e.target === e.currentTarget || e.target.closest('[data-pdf-container]')) {
          // Only deselect if clicking on the background, not on a field
        }
      }}>
        <div className="flex flex-col items-center gap-4" data-pdf-container>
          {pdfDoc ? (
            Array.from({ length: numPages }, (_, i) => (
              <PdfPageWithFields
                key={i + 1}
                pageNum={i + 1}
                pdfDoc={pdfDoc}
                signItems={signItems}
                values={values}
                onFieldChange={handleFieldChange}
                onOpenSignaturePad={handleOpenSignaturePad}
                activeFieldId={activeFieldId}
                setActiveFieldId={setActiveFieldId}
                scale={scale}
                signatureHashes={signatureHashes}
                showValidation={showValidation}
                previousValues={previousValues}
                allSignItems={allSignItems}
              />
            ))
          ) : (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <span className="ml-3 text-gray-500 text-sm">Loading document...</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Bar ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: Refuse */}
          <button
            onClick={() => setShowRefuseConfirm(true)}
            disabled={refusing}
            className="text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {refusing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Refusing...
              </span>
            ) : (
              'Refuse to Sign'
            )}
          </button>

          {/* Center: Progress + Next Field */}
          <div className="flex items-center gap-3">
            {!allRequiredFilled && (
              <button
                onClick={() => scrollToNextField(activeFieldId)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Next Field</span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>
                  {filledTotalCount} of {totalFieldCount} field{totalFieldCount !== 1 ? 's' : ''} completed
                </span>
              </div>
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: totalFieldCount > 0 ? `${(filledTotalCount / totalFieldCount) * 100}%` : '0%' }}
                />
              </div>
            </div>
            <div className="sm:hidden text-xs text-gray-500">
              {filledTotalCount}/{totalFieldCount}
            </div>
          </div>

          {/* Right: Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : envelope && currentDocIndex < envelope.totalDocuments - 1 ? (
              <>
                <Check className="w-4 h-4" />
                Sign & Next Document
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Sign & Submit
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Signature Pad Modal ─────────────────────────────────────────── */}
      <SignaturePadModal
        isOpen={sigPadModal.open}
        onClose={() => setSigPadModal({ open: false, fieldId: null, type: 'signature' })}
        onAdopt={handleAdoptSignature}
        type={sigPadModal.type}
        signerName={signer?.name || ''}
      />

      {/* ── Refuse Confirm Dialog ───────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={showRefuseConfirm}
        onClose={() => setShowRefuseConfirm(false)}
        onConfirm={handleRefuse}
        title="Refuse to Sign"
        message="Are you sure you want to refuse signing this document? The sender will be notified of your decision."
        confirmLabel={refusing ? 'Refusing...' : 'Yes, Refuse'}
        confirmColor="red"
      />

      {/* ── Signature Reuse Prompt ──────────────────────────────────── */}
      {sigReusePrompt.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {sigReusePrompt.type === 'initials' ? 'Reuse Initials?' : 'Reuse Signature?'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              You already have a {sigReusePrompt.type === 'initials' ? 'initials' : 'signature'} on file. Would you like to reuse it or draw a new one?
            </p>
            {sigDataUrls[sigReusePrompt.type] && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                <img
                  src={sigDataUrls[sigReusePrompt.type]}
                  alt="Existing"
                  className="max-h-16 object-contain"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleReuseExisting}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Use Existing
              </button>
              <button
                onClick={handleDrawNew}
                className="flex-1 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 transition-colors"
              >
                Draw New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
          toast.type === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
          toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          'bg-white text-gray-800 border border-gray-200'
        }`}>
          {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.type === 'success' && <Check className="w-4 h-4 shrink-0" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 text-current opacity-50 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Compliance Footer ─────────────────────────────────────────── */}
      <div className="mt-6 py-4 border-t border-gray-200 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
          <Shield size={12} className="text-gray-400" />
          <span>Compliant with eIDAS (EU), ESIGN Act (US) &amp; UETA</span>
        </div>
      </div>
    </div>
  );
}
