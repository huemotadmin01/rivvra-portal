import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import SignatureCanvas from 'react-signature-canvas';
import signApi from '../../utils/signApi';
import { API_BASE_URL } from '../../utils/config';
import {
  PenTool, Type, Calendar, User, Mail, Phone, Building2,
  CheckSquare, AlignLeft, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Clock
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
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
        <div className="p-5">
          {activeTab === 'draw' ? (
            <div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50 relative">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  canvasProps={{
                    width: type === 'initials' ? 300 : 460,
                    height: type === 'initials' ? 120 : 180,
                    className: 'w-full cursor-crosshair',
                    style: { width: '100%', height: type === 'initials' ? '120px' : '180px' },
                  }}
                  penColor="#1e293b"
                  minWidth={1.5}
                  maxWidth={3}
                  onBegin={() => setIsEmpty(false)}
                />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-gray-400 text-sm">Sign here</p>
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
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          value ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-400 hover:border-indigo-400'
        }`}>
          {value && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
      </button>
    );
  }

  if (fieldType === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={style}
        className="absolute bg-white/90 border border-indigo-300 rounded px-1.5 py-0.5 text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
        className="absolute bg-white/90 border border-indigo-300 rounded px-1.5 py-0.5 text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
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
      className="absolute bg-white/90 border border-indigo-300 rounded px-1.5 py-0.5 text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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

  return (
    <div className="relative mx-auto shadow-lg bg-white" style={{ width: pageDims.width || 'auto', height: pageDims.height || 'auto' }}>
      <canvas ref={canvasRef} className="block" />

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
          return (
            <div
              key={item._id || item.id}
              className={`absolute cursor-pointer rounded transition-all flex items-center justify-center overflow-hidden ${
                isFilled
                  ? 'border-2 border-green-400 bg-green-50/30'
                  : isRequired
                    ? 'border-2 border-dashed border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60'
                    : 'border-2 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-100/60'
              }`}
              style={{ left, top, width, height }}
              onClick={() => onOpenSignaturePad(item._id || item.id, item.type)}
            >
              {isFilled ? (
                <>
                  <img src={fieldValue} alt={item.type} className="max-w-full max-h-full object-contain" />
                  <div className="absolute top-0.5 right-0.5">
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-0.5">
                  <Icon className="w-4 h-4 text-indigo-500" />
                  <span className="text-[10px] text-indigo-600 font-medium">{meta.placeholder}</span>
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
                    <span className="text-xs text-gray-900 truncate flex-1">{fieldValue}</span>
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

  const containerRef = useRef(null);

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
        setTemplate(data.template);
        setOrgName(data.orgName || '');

        // Pre-fill name and email if available
        const initialValues = {};
        if (data.template?.signItems) {
          data.template.signItems.forEach((item) => {
            const id = item._id || item.id;
            if (item.type === 'name' && data.signer?.name) {
              initialValues[id] = data.signer.name;
            } else if (item.type === 'email' && data.signer?.email) {
              initialValues[id] = data.signer.email;
            } else if (item.type === 'date') {
              initialValues[id] = new Date().toISOString().split('T')[0];
            }
          });
        }
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
  }, []);

  // ── Open signature pad ───────────────────────────────────────────────
  const handleOpenSignaturePad = useCallback((fieldId, type) => {
    // If we already have a signature/initials data URL of this type, apply it directly
    const existing = sigDataUrls[type];
    if (existing) {
      handleFieldChange(fieldId, existing);
    } else {
      setSigPadModal({ open: true, fieldId, type });
    }
  }, [sigDataUrls, handleFieldChange]);

  // ── Adopt signature from modal ───────────────────────────────────────
  const handleAdoptSignature = useCallback((dataUrl) => {
    const { fieldId, type } = sigPadModal;
    // Store the data URL for reuse
    setSigDataUrls((prev) => ({ ...prev, [type]: dataUrl }));
    // Fill this field
    handleFieldChange(fieldId, dataUrl);
    // Also fill any other fields of the same type that don't have a value yet
    if (template?.signItems) {
      template.signItems.forEach((item) => {
        const id = item._id || item.id;
        if (item.type === type && id !== fieldId && !values[id]) {
          handleFieldChange(id, dataUrl);
        }
      });
    }
  }, [sigPadModal, handleFieldChange, template?.signItems, values]);

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
    if (!allRequiredFilled || submitting) return;
    setSubmitting(true);
    try {
      await signApi.submitSignature(requestId, signerId, token, {
        values,
        signatureDataUrl: sigDataUrls.signature || null,
        initialsDataUrl: sigDataUrls.initials || null,
      });
      setStatus('success');
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-900">Document Signed Successfully!</h2>
          <p className="mt-3 text-sm text-gray-600">
            Thank you for signing <span className="font-medium">{request?.reference || 'this document'}</span>.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            You will receive a copy via email once all parties have signed.
          </p>
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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: document name */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="w-5 h-5 text-indigo-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900 truncate">
              {request?.reference || 'Document'}
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

          {/* Center: Progress */}
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>
                {filledTotalCount} of {totalFieldCount} field{totalFieldCount !== 1 ? 's' : ''} completed
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: totalFieldCount > 0 ? `${(filledTotalCount / totalFieldCount) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Mobile progress */}
          <div className="sm:hidden text-xs text-gray-500">
            {filledTotalCount}/{totalFieldCount}
          </div>

          {/* Right: Submit */}
          <button
            onClick={handleSubmit}
            disabled={!allRequiredFilled || submitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
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
    </div>
  );
}
