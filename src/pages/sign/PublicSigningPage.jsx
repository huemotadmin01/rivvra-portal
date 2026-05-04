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
  ArrowRight, ArrowDown, Download,
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

// ── Signature fonts for "Type" tab in signature modal ──────────────────────
// Handwriting/signature fonts loaded from Google Fonts in index.css. The
// fallback chain ends at `cursive` only as a last resort — the named fonts
// should always render once the page's @font-face rules resolve.
const CURSIVE_FONTS = [
  { name: 'Caveat', css: "'Caveat', cursive", weight: '600' },
  { name: 'Homemade Apple', css: "'Homemade Apple', cursive", weight: '400' },
  { name: 'Allura', css: "'Allura', cursive", weight: '400' },
  { name: 'Alex Brush', css: "'Alex Brush', cursive", weight: '400' },
];

// Generate a typed signature as data URL. Awaits font load before rasterizing
// — otherwise the canvas can render with the system fallback if the webfont
// hasn't finished downloading by the time the user clicks Adopt.
async function generateTypedSignature(text, font, width = 400, height = 150) {
  const fontSpec = `${font.weight || '400'} 48px ${font.css}`;
  try {
    if (document.fonts && document.fonts.load) {
      await document.fonts.load(fontSpec, text);
    }
  } catch {
    /* font load failures fall through to canvas render */
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  // Navy ink — matches Odoo/DocuSign convention; reads as "real ink" on
  // most printed contracts more than slate gray did.
  ctx.fillStyle = '#0f3a8a';
  ctx.font = fontSpec;
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
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('type'); // 'type' | 'draw' | 'upload' — Type first since most users prefer typing.
  const [typedText, setTypedText] = useState(signerName || '');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0]);
  const [isEmpty, setIsEmpty] = useState(true);
  // Upload-tab state — preview shown inline, dataUrl carried straight to
  // onAdopt. We don't compress / resize here; the recipient page expects
  // raw data: URLs (same as what the canvas + typed paths produce).
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab('type');
      setTypedText(signerName || '');
      setSelectedFont(CURSIVE_FONTS[0]);
      setIsEmpty(true);
      setUploadedImageUrl(null);
      setUploadError('');
    }
  }, [isOpen, signerName]);

  const handleClear = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
      setIsEmpty(true);
    }
  };

  const handleFileChange = (e) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setUploadError('Please upload a PNG or JPG image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Image must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImageUrl(reader.result);
    };
    reader.onerror = () => setUploadError('Failed to read the file. Try again.');
    reader.readAsDataURL(file);
  };

  // Tracks whether handleAdopt is mid-flight. The Type tab does an async
  // canvas render (generateTypedSignature) that can take a few hundred ms;
  // a double-tap on mobile would otherwise queue two adoptions and fire
  // onAdopt twice with two different data URLs.
  const [adopting, setAdopting] = useState(false);

  const handleAdopt = async () => {
    if (adopting) return;
    setAdopting(true);
    try {
      let dataUrl = null;
      if (activeTab === 'draw') {
        if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
          dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
        }
      } else if (activeTab === 'type') {
        if (typedText.trim()) {
          const w = type === 'initials' ? 200 : 400;
          const h = type === 'initials' ? 100 : 150;
          dataUrl = await generateTypedSignature(typedText.trim(), selectedFont, w, h);
        }
      } else if (activeTab === 'upload') {
        dataUrl = uploadedImageUrl;
      }
      if (dataUrl) {
        onAdopt(dataUrl);
        onClose();
      }
    } finally {
      setAdopting(false);
    }
  };

  const canAdopt =
    activeTab === 'draw' ? !isEmpty
    : activeTab === 'type' ? typedText.trim().length > 0
    : !!uploadedImageUrl;
  const title = type === 'initials' ? 'Add your initials' : 'Add your signature';

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

        {/* Tabs — Type first since most signers prefer typing their name
            over drawing a signature on a desktop trackpad. */}
        <div className="flex border-b border-gray-200">
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
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-5 p-3">
          {activeTab === 'upload' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
              {uploadedImageUrl ? (
                <div>
                  <div className="border border-gray-200 rounded-lg bg-white p-4 flex items-center justify-center" style={{ minHeight: '180px' }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <img
                      src={uploadedImageUrl}
                      alt="Uploaded signature preview"
                      style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500">PNG or JPG, max 2 MB. Use a transparent-background PNG for best results.</p>
                    <button
                      onClick={() => { setUploadedImageUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors flex flex-col items-center justify-center text-center p-6"
                    style={{ minHeight: '180px' }}
                  >
                    <Download className="w-8 h-8 text-gray-400 mb-2 rotate-180" />
                    <p className="text-sm font-medium text-gray-700">Click to upload an image of your signature</p>
                    <p className="text-xs text-gray-500 mt-1">PNG or JPG &middot; up to 2 MB</p>
                  </button>
                  <p className="text-xs text-gray-500 mt-3">
                    Tip: a clean PNG with a transparent background looks best on the signed document.
                  </p>
                </div>
              )}
              {uploadError && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{uploadError}</p>
              )}
            </div>
          ) : activeTab === 'draw' ? (
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
                  penColor="#0f3a8a"
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
                        style={{ fontFamily: font.css, fontWeight: font.weight || 400, fontSize: '24px', color: '#1e293b' }}
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
            disabled={!canAdopt || adopting}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {adopting && <Loader2 className="w-4 h-4 animate-spin" />}
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

  // Shared mobile-friendly input class: min touch target 44px on mobile.
  // Font size matches the read-only render's sizing (height-driven) so the
  // typing experience visually mirrors the surrounding document text rather
  // than always rendering at tiny text-xs.
  const inputCls = 'absolute bg-white/90 border border-indigo-300 rounded px-2 sm:px-1.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[44px] sm:min-h-0';
  // The wrapping field box passes its actual rendered height through as
  // `style.height` (a number). When we can read it, bottom-align the typed
  // text so it sits at the bottom edge of the box — that's where the
  // printed underline sits in the source document, and matches the final
  // PDF stamp's positioning.
  const styleHeight = typeof style?.height === 'number' ? style.height : parseFloat(style?.height) || 0;
  const dynamicFontSize = styleHeight > 0
    ? Math.min(Math.max(styleHeight * 0.5, 12), 16)
    : 14;
  // Padding-top pushes the input's text content down so it lands near the
  // bottom edge instead of being vertically centered (default browser
  // behaviour). Caps so a very tall box doesn't get an absurd top gap.
  const verticalGap = Math.max(0, styleHeight - dynamicFontSize - 8);
  const padTop = Math.min(verticalGap, 24);
  const sizedStyle = {
    ...style,
    fontSize: dynamicFontSize,
    paddingTop: `${padTop}px`,
    paddingBottom: '2px',
    lineHeight: 1.1,
  };

  if (fieldType === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={sizedStyle}
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
        maxLength={item.maxLength ?? undefined}
        style={sizedStyle}
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
      maxLength={item.maxLength ?? undefined}
      style={sizedStyle}
      className={inputCls}
    />
  );
}

// ── PDF Page with Fields ────────────────────────────────────────────────────
// Shared signature "stamp" — used both for the active signer's filled
// state and the read-only render of previous signers' signatures, so the
// chrome (dashed rose frame + "Signed with Rivvra Sign" + image + hash)
// stays consistent across both views and matches the final PDF output.
// Three places used to hand-render this independently and drift apart.
function SignatureStamp({ src, hash, alt = 'Signature' }) {
  return (
    <div className="flex flex-col items-center w-full h-full">
      <span className="text-[9px] text-green-700 font-medium mt-0.5 leading-none">
        Signed with Rivvra Sign
      </span>
      <div className="flex-1 flex items-center justify-center w-full px-1 min-h-0">
        <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
      </div>
      {hash && (
        <span className="text-[8px] text-gray-500 mb-0.5 font-mono leading-none">
          {String(hash).slice(0, 18)}...
        </span>
      )}
    </div>
  );
}

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
  previousSignatureHashes = {},
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
        // Signature fields arrive as data: URLs; text fields as plain strings.
        const isSignatureDataUrl = val && typeof val === 'string' && val.startsWith('data:');
        const displayDate = item.type === 'date' ? formatDisplayDate(val) : val;

        return (
          <div
            key={`prev-${fieldId}`}
            className="absolute pointer-events-none rounded overflow-hidden"
            style={{
              left,
              top,
              width,
              // Grow text fields downward to a 36px minimum to match the
              // active-signer's wrapping-div height so previous and current
              // values render at the same visual size and land on the
              // underline beneath.
              height: isSignatureDataUrl ? height + 20 : Math.max(height, 36),
              border: isSignatureDataUrl ? '2px dashed #d4a0a0' : undefined,
              backgroundColor: isSignatureDataUrl ? '#ffffff' : undefined,
            }}
          >
            {isSignatureDataUrl ? (
              // Show the previous signer's stamp with the SAME chrome the
              // active signer sees once they sign and that the final PDF
              // shows: dashed rose frame, label, image, truncated hash.
              <SignatureStamp src={val} hash={previousSignatureHashes[fieldId]} />
            ) : (
              // Bottom-align the read-only previous value so it visually
              // sits on the underline beneath the field — matches what the
              // current signer's own values will look like, and matches the
              // final PDF stamp's positioning. Inline-block + bg-white pad
              // is only as wide as the glyphs (plus tiny horizontal
              // padding) so we don't erase surrounding document text.
              <div
                className="w-full h-full flex items-end font-medium pb-0.5"
                style={{ fontSize: Math.min(Math.max(height * 0.5, 12), 16), lineHeight: 1.1 }}
              >
                <span className="bg-white text-gray-800 px-1 truncate max-w-full">
                  {displayDate}
                </span>
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
              data-field-id={fieldId}
              className="absolute cursor-pointer rounded transition-all overflow-hidden"
              style={{
                left, top, width, height: isFilled ? height + 20 : height,
                border: isFilled ? '2px dashed #d4a0a0' : undefined,
                backgroundColor: isFilled ? '#ffffff' : undefined,
              }}
              onClick={() => onOpenSignaturePad(fieldId, item.type)}
            >
              {isFilled ? (
                <SignatureStamp src={fieldValue} hash={hash} alt={item.type} />
              ) : (
                <div className={`flex flex-col items-center justify-center h-full border-2 border-dashed rounded ${
                  showValidation && isRequired && !isFilled
                    ? 'border-red-500 bg-red-50/60 animate-pulse'
                    : isRequired
                      ? 'border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60'
                      : 'border-gray-300 bg-gray-50/50 hover:bg-gray-100/60'
                }`}>
                  <Icon className={`w-4 h-4 ${showValidation && isRequired && !isFilled ? 'text-red-500' : 'text-indigo-500'}`} />
                  <span className={`text-[10px] font-medium ${showValidation && isRequired && !isFilled ? 'text-red-600' : 'text-indigo-600'}`}>
                    {item.label && item.label !== meta.label ? item.label : meta.placeholder}
                  </span>
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
              data-field-id={item._id || item.id}
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

        // Text-type fields: show inline input when active, placeholder when inactive.
        // Same trick as the PDF renderer — grow the field downward to a sane
        // visual minimum so a thin sliver-sized field still produces a
        // readable input (and its content lands on the underline below
        // rather than floating above it). The min height is calibrated so
        // text lands on the printed underline beneath users' typical
        // "box-above-the-line" placement habit.
        const visualHeight = Math.max(height, 36);
        const filledFontSize = Math.min(Math.max(visualHeight * 0.5, 12), 16);
        return (
          <div
            key={item._id || item.id}
            data-field-id={item._id || item.id}
            className={`absolute rounded transition-all ${
              isActive
                ? ''
                : isFilled
                  ? 'border-2 border-green-400 bg-white cursor-pointer'
                  : showValidation && isRequired
                    ? 'border-2 border-dashed border-red-500 bg-red-50/60 cursor-pointer animate-pulse'
                    : isRequired
                      ? 'border-2 border-dashed border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60 cursor-pointer'
                      : 'border-2 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-100/60 cursor-pointer'
            }`}
            style={{ left, top, width, height: visualHeight }}
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
                style={{ left: 0, top: 0, width: '100%', height: visualHeight, position: 'relative' }}
              />
            ) : (
              // items-end + small bottom padding bottom-aligns the typed
              // value to the box's lower edge so it visually sits on the
              // underline beneath, matching the final flattened PDF.
              <div
                className="flex items-end h-full px-1.5 gap-1 pb-0.5 overflow-hidden"
                style={{ fontSize: isFilled ? filledFontSize : undefined, lineHeight: 1.1 }}
              >
                {isFilled ? (
                  <>
                    <span className="text-gray-900 truncate flex-1">
                      {item.type === 'date' ? formatDisplayDate(fieldValue) : fieldValue}
                    </span>
                    <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                  </>
                ) : (
                  <>
                    <Icon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="text-[10px] text-indigo-600 truncate">
                      {item.label && item.label !== meta.label ? item.label : meta.placeholder}
                    </span>
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
  // Tracks whether the request reached the fully-signed state on this
  // signer's submit. Drives the "Download signed copy" CTA on the success
  // screen — without this we'd never show the button (the local `request`
  // state isn't re-fetched post-submit).
  const [allPartiesSigned, setAllPartiesSigned] = useState(false);
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
  // userZoom multiplies the auto-fit scale. Stays separate from scale so
  // resize events don't blow away the user's zoom preference.
  const [userZoom, setUserZoom] = useState(1);
  const [showFieldsList, setShowFieldsList] = useState(false);

  // Envelope state
  const [envelope, setEnvelope] = useState(null); // null = single doc
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [envelopeValues, setEnvelopeValues] = useState({}); // { [docId]: { [fieldId]: value } }

  const containerRef = useRef(null);

  // Signature hash fingerprints for display
  const [signatureHashes, setSignatureHashes] = useState({});

  // Previous signers' values (read-only display)
  const [previousValues, setPreviousValues] = useState({});
  const [previousSignatureHashes, setPreviousSignatureHashes] = useState({});
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
        if (data.previousSignatureHashes) setPreviousSignatureHashes(data.previousSignatureHashes);
        if (data.template?.allSignItems) setAllSignItems(data.template.allSignItems);

        // Pre-fill name and email if available
        const items = data.envelope?.isEnvelope
          ? (data.envelope.documents[data.envelope.currentDocumentIndex || 0]?.signItems || [])
          : (data.template?.signItems || []);
        const initialValues = {};
        items.forEach((item) => {
          const id = item._id || item.id;
          // Template builders can opt a Date/Name field out of auto-fill via
          // `autoFill: false` set in the editor. Other field types ignore
          // this flag (email auto-fill is unconditional today).
          if (item.autoFill === false) return;
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

    // pdfjsLib loads its worker from a CDN on the first getDocument call.
    // If the CDN is unreachable, the underlying promise hangs indefinitely
    // — the user just stares at a spinner with no signal that anything is
    // wrong. Race the load against a 30s timeout so we always surface a
    // visible error instead of an infinite spinner.
    const PDF_LOAD_TIMEOUT_MS = 30000;

    async function loadPdf() {
      const loadingTask = pdfjsLib.getDocument(pdfSrc);
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('PDF load timed out'));
        }, PDF_LOAD_TIMEOUT_MS);
      });
      try {
        const doc = await Promise.race([loadingTask.promise, timeoutPromise]);
        clearTimeout(timeoutId);
        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        // Best-effort cancel of the underlying loading task so it doesn't
        // keep network in-flight after we've given up.
        try { loadingTask.destroy(); } catch { /* ignore */ }
        if (!cancelled) {
          const isTimeout = err?.message === 'PDF load timed out';
          console.error('Failed to load PDF:', err);
          setError(
            isTimeout
              ? 'The document is taking too long to load. Please check your connection and refresh the page.'
              : 'Failed to load the document PDF. Please refresh the page and try again.',
          );
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
        // Target the actual field DOM element via data-field-id and use
        // scrollIntoView, which walks up to the correct scroll ancestor
        // automatically. The previous "compute targetY and call
        // container.scrollTo()" path silently froze when the inner
        // overflow-auto wasn't actually the scroll context for the
        // visible viewport. scrollIntoView is browser-safe and works
        // regardless of which ancestor scrolls.
        const fieldEl = containerRef.current?.querySelector(`[data-field-id="${id}"]`);
        if (fieldEl) {
          fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            if (item.type === 'signature' || item.type === 'initials') {
              handleOpenSignaturePad(id, item.type);
            } else {
              setActiveFieldId(id);
            }
          }, 350);
          return true;
        }
        // Fallback — field DOM not yet rendered (page rendering lazily).
        const pageIndex = item.page || 0;
        const pageEl = containerRef.current?.querySelectorAll('[data-page-index]')?.[pageIndex];
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  // A field is required only if (a) item.required isn't explicitly false
  // AND (b) any item.requiredIf dependency is currently filled. This lets
  // template builders gate fields behind a checkbox ("require sig only if
  // 'I agree' is ticked").
  const isFilledValue = (v) =>
    v !== undefined && v !== '' && v !== false && v !== null;
  const isItemRequired = (item) => {
    if (item.required === false) return false;
    if (!item.requiredIf) return true;
    const dep = signItems.find((it) => (it._id || it.id) === item.requiredIf);
    if (!dep) return true; // dangling reference — treat as always required
    return isFilledValue(values[dep._id || dep.id]);
  };
  const requiredItems = signItems.filter(isItemRequired);
  const filledRequiredCount = requiredItems.filter((item) => {
    const v = values[item._id || item.id];
    return isFilledValue(v);
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

    // Format / length / pattern validation. Type defaults catch malformed
    // emails and phones before they reach the sealed PDF; min/max length
    // and the optional pattern field come from the editor's per-field
    // Validation properties and let template builders enforce things like
    // "PAN: 5 letters + 4 digits + 1 letter" without writing code.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[+]?[0-9 ()\-.]{6,}$/;
    for (const item of signItems) {
      const id = item._id || item.id;
      const v = values[id];
      if (!v || typeof v !== 'string') continue;
      const trimmed = v.trim();
      const fieldName = item.label || (item.type[0].toUpperCase() + item.type.slice(1));

      if (item.type === 'email' && !emailRegex.test(trimmed)) {
        setShowValidation(true);
        showToast(`"${fieldName}" doesn't look like a valid email address.`, 'warning');
        return;
      }
      if (item.type === 'phone' && !phoneRegex.test(trimmed)) {
        setShowValidation(true);
        showToast(`"${fieldName}" doesn't look like a valid phone number.`, 'warning');
        return;
      }
      if (item.minLength != null && trimmed.length < item.minLength) {
        setShowValidation(true);
        showToast(`"${fieldName}" needs at least ${item.minLength} characters.`, 'warning');
        return;
      }
      if (item.maxLength != null && trimmed.length > item.maxLength) {
        setShowValidation(true);
        showToast(`"${fieldName}" can't exceed ${item.maxLength} characters.`, 'warning');
        return;
      }
      if (item.pattern) {
        let re;
        try { re = new RegExp(item.pattern); } catch { re = null; }
        if (re && !re.test(trimmed)) {
          setShowValidation(true);
          showToast(item.patternMessage || `"${fieldName}" doesn't match the required format.`, 'warning');
          return;
        }
      }
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
            if (item.autoFill === false) return;
            if (item.type === 'name' && signer?.name) nextValues[id] = signer.name;
            else if (item.type === 'email' && signer?.email) nextValues[id] = signer.email;
            else if (item.type === 'date') nextValues[id] = todayStr();
          });
          setValues(nextValues);
          setPdfDoc(null);
          setNumPages(0);
        }
      } else {
        // Backend returns { success, completed } where completed=true means
        // ALL signers (including this one) are now done — used to gate the
        // download CTA on the success screen.
        setAllPartiesSigned(!!res?.completed);
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
          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-gray-400" />
            <span>Secured by</span>
            <a href="https://www.rivvra.com" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 font-medium">
              Rivvra Sign
            </a>
          </div>
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

          {/* Download CTA — shown only when the request is fully signed
              (i.e. you were the last/only signer). For mid-flow signers
              we keep the email-fallback message so they don't try to
              download a doc that isn't sealed yet. */}
          {allPartiesSigned ? (
            <>
              <a
                href={`${API_BASE_URL}/api/sign/public/${requestId}/${signerId}/${token}/signed-pdf`}
                download
                className="mt-5 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors"
              >
                <Download size={16} />
                Download signed copy
              </a>
              <p className="mt-3 text-xs text-gray-500 text-center">
                Your signed PDF and the audit certificate were also emailed to you.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-gray-500 text-center">
              You'll receive the signed copy via email once all parties have signed.
            </p>
          )}

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
                scale={scale * userZoom}
                signatureHashes={signatureHashes}
                showValidation={showValidation}
                previousValues={previousValues}
                previousSignatureHashes={previousSignatureHashes}
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

      {/* Fields list popover — opens above the bottom bar when the user
          clicks the progress indicator. Lets them see every field's fill
          state and jump straight to it. */}
      {showFieldsList && (
        <div className="hidden sm:block fixed bottom-16 left-1/2 -translate-x-1/2 z-40 w-80 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">All fields</span>
            <button onClick={() => setShowFieldsList(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="py-1">
            {signItems
              .slice()
              .sort((a, b) => ((a.page || 0) - (b.page || 0)) || ((a.posY || 0) - (b.posY || 0)))
              .map((item) => {
                const id = item._id || item.id;
                const v = values[id];
                const filled = v !== undefined && v !== '' && v !== false && v !== null;
                const meta = FIELD_META[item.type] || FIELD_META.text;
                const ItemIcon = meta.icon;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setShowFieldsList(false);
                      // Reuse existing scroll-to-next logic: temporarily
                      // walk from this item's id by scrolling its page
                      // and activating it.
                      const pageIndex = item.page || 0;
                      const pageEl = containerRef.current?.querySelectorAll('[data-page-index]')?.[pageIndex];
                      if (pageEl) {
                        const pageRect = pageEl.getBoundingClientRect();
                        const containerRect = containerRef.current?.getBoundingClientRect();
                        const fieldYWithinPage = (item.posY || 0) * pageEl.clientHeight;
                        const targetY =
                          (containerRef.current?.scrollTop || 0) +
                          (pageRect.top - (containerRect?.top || 0)) +
                          fieldYWithinPage -
                          (containerRect?.height || window.innerHeight) / 3;
                        containerRef.current?.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
                        setTimeout(() => {
                          if (item.type === 'signature' || item.type === 'initials') {
                            handleOpenSignaturePad(id, item.type);
                          } else {
                            setActiveFieldId(id);
                          }
                        }, 350);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className={`w-1.5 h-3 rounded ${filled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <ItemIcon className="w-3.5 h-3.5 text-gray-500" />
                    <span className="flex-1 text-xs text-gray-700 truncate">
                      {item.label || meta.label}
                      <span className="text-gray-400"> · p{(item.page || 0) + 1}</span>
                    </span>
                    {filled ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <span className="text-[10px] text-gray-400">empty</span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}

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

          {/* Zoom controls — desktop only; mobile pinches the screen instead */}
          <div className="hidden md:flex items-center gap-1 mr-2 text-gray-600">
            <button
              onClick={() => setUserZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              disabled={userZoom <= 0.5}
              className="hover:text-gray-900 disabled:opacity-30 px-1.5 text-base font-semibold"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={() => setUserZoom(1)}
              className="text-xs hover:text-gray-900 tabular-nums w-10 text-center"
              title="Reset zoom"
            >
              {Math.round(userZoom * 100)}%
            </button>
            <button
              onClick={() => setUserZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
              disabled={userZoom >= 2}
              className="hover:text-gray-900 disabled:opacity-30 px-1.5 text-base font-semibold"
              title="Zoom in"
            >
              +
            </button>
          </div>

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
            <button
              onClick={() => setShowFieldsList((v) => !v)}
              className="hidden sm:flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              title="See all fields and jump"
            >
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${allRequiredFilled ? 'bg-green-500' : 'bg-amber-400'}`} />
                <span>
                  {filledTotalCount} of {totalFieldCount} field{totalFieldCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: totalFieldCount > 0 ? `${(filledTotalCount / totalFieldCount) * 100}%` : '0%' }}
                />
              </div>
            </button>
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
