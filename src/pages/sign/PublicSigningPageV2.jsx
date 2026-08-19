// ============================================================================
// PublicSigningPageV2.jsx — external signing surface, chrome on ds
// ============================================================================
//
// This is the only page in the migration that an unauthenticated stranger
// opens from an email to sign a legal document. Three things about it are
// different from every other page, and each one changed how it was migrated.
//
// ── 1. `PageSwitch` cannot gate this route ─────────────────────────────────
// `/sign/public/:requestId/:signerId/:token` lives OUTSIDE `OrgPlatformLayout`,
// so there is no `OrgProvider` and no `currentOrg.uiV2` to switch on. The
// verify endpoint returns `orgName` but no UI flag.
//
// So the switch is local and OPT-IN, and it defaults to legacy:
//
//     ?ui=v2  → v2 for this browser, remembered in localStorage
//     ?ui=v1  → back to legacy, and forgets
//
// Default is ALWAYS legacy. A counterparty part-way through signing a contract
// must not get a different UI because a flag defaulted the wrong way. Flipping
// this on for real signers is a deliberate act, not a deploy side effect.
//
// ── 2. ds tokens default to DARK; this page must not ───────────────────────
// `:root` in ds-tokens.css is the dark theme; light arrives via
// `[data-theme='light']`, which only the in-app `ThemeToggle` ever sets. An
// external signer has no toggle and no stored preference, so a naive ds port
// would render this page dark for every counterparty — a change to how a legal
// document is presented that nobody asked for.
//
// The page therefore pins `data-theme="light"` on its own root. `[data-theme]`
// is a plain attribute selector, so the light token block applies to this
// subtree regardless of `:root` or a stale localStorage value from an
// authenticated session in the same browser.
//
// ── 3. The document surface is NOT re-themed ───────────────────────────────
// Everything that paints on, or positions against, the PDF is spliced in
// byte-identically and keeps its own palette:
//
//   • `PdfPageWithFields` — including the render-resident field geometry
//     (`left/top/width/height`, `isCompactScale`, `prevVisualHeight`,
//     `prevAnchoredTop`). These decide WHERE a signature lands on the page.
//   • `InlineFieldInput`, `FittedText`, `PrevSignerValue`, `SignatureStamp`.
//   • The signature pipeline: `generateTypedSignature`, `trimCanvasToDataUrl`,
//     `processSignatureImage` (the paper-knockout luminance loop and the
//     1200×600 downscale that fixed the 413 on phone photos), and
//     `generateSignatureHash` (SHA-256, first 12 hex chars).
//   • `penColor="#0f3a8a"` on the draw pad and `#1e293b` on the typed preview
//     — those are ink colours that get rasterised INTO the signature image.
//
// The dashed rose frame around a previous signer's signature, the "Signed with
// Rivvra Sign" label and the truncated hash are audit evidence the next signer
// is meant to inspect. Re-tinting them to brand tokens would change what a
// legal document looks like. Only the app chrome around the document moves:
// the header, banners, guard screens, bottom bar, modals and toast.
//
// ── Dropped ────────────────────────────────────────────────────────────────
// The local `ConfirmDialog` (legacy 532–556) was declared and never called —
// the refuse flow has always used its own inline modal. Removed rather than
// ported.
//
// ── Carried across unchanged, deliberately ─────────────────────────────────
// `SignatureStamp` is passed `compact={isCompactScale}` but does not
// destructure `compact`, so the prop is silently ignored. That matches the
// stated intent ("always renders the full audit chrome", legacy 822) — the
// prop is a leftover, not a live bug. Honouring it OR deleting it would both
// change what a signer sees on a signed document, so it stays exactly as-is.
//
// Not triggered: submit signature, refuse, download signed copy.
// ============================================================================

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
// Bundle the pdfjs worker locally — see SignRequestDetail.jsx for the Safari
// module-worker story this replaces.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import SignatureCanvas from 'react-signature-canvas';
import signApi from '../../utils/signApi';
import { todayStr } from '../../utils/dateUtils';
import { API_BASE_URL } from '../../utils/config';
import {
  PenTool, Type, Calendar, User, Mail, Phone, Building2,
  CheckSquare, AlignLeft, Loader2, Check, CheckCircle2,
  X, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Clock, Shield,
  ArrowRight, ArrowDown, Download,
} from 'lucide-react';
import { Panel, Chip, Button, Input, Textarea, Field, Callout } from '../../components/ds';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ── Shared render tokens for the CHROME only ────────────────────────────────
// Nothing here is used inside a PDF field box; the document surface keeps its
// own palette (see the header note).

const shellStyle = { minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' };
const cardTitle = { font: "600 19px/1.28 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '20px 0 0' };
const cardBody = { font: "450 13.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '12px 0 0' };
const cardMeta = { font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '16px 0 0' };
const microStyle = { font: "500 10px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)' };

/** Centred single-card screen used by every terminal state.
 *  `icon` is a rendered node, not a component — destructuring it as
 *  `icon: Icon` reads to eslint as an unused variable even though the JSX
 *  uses it, and this page ships with zero new lint problems. */
function StatusCard({ tone = 'neutral', icon, title, children, footer }) {
  const tint = {
    neutral: 'var(--surface-3)', brand: 'var(--brand-soft)',
    warn: 'var(--warn-soft)', danger: 'var(--danger-soft)',
  }[tone];
  const ink = {
    neutral: 'var(--fg-3)', brand: 'var(--brand-ink)',
    warn: 'var(--warn-ink)', danger: 'var(--danger)',
  }[tone];
  return (
    <div data-theme="light" style={{ ...shellStyle, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Panel style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ padding: 16, textAlign: 'center' }}>
          <span style={{
            width: 64, height: 64, borderRadius: 99, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tint, color: ink,
          }}>
            {icon}
          </span>
          <h2 style={cardTitle}>{title}</h2>
          {children}
          {footer}
        </div>
      </Panel>
    </div>
  );
}

/** "Secured by Rivvra Sign" strip shared by the terminal screens. */
function SecuredBy({ link = false }) {
  return (
    <div style={{
      marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
    }}>
      <Shield size={13} />
      <span>Secured by</span>
      {link ? (
        <a
          href="https://www.rivvra.com" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--brand-ink)', fontWeight: 550 }}
        >
          Rivvra Sign
        </a>
      ) : <span>Rivvra Sign</span>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Everything below to the end of `PdfPageWithFields` is spliced verbatim
// from the legacy page, except the signature-pad modal RENDER. This is
// the document surface and the signature pipeline; it does not move.
// ════════════════════════════════════════════════════════════════════

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

// Crop a canvas to its inked (non-transparent) bounding box and return a
// PNG data URL. Replaces react-signature-canvas's getTrimmedCanvas(), whose
// trim-canvas dependency fails Vite's CJS interop ("default is not a
// function") — clicking Adopt after drawing silently did nothing.
function trimCanvasToDataUrl(sourceCanvas, padding = 8) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return null;
  const ctx = sourceCanvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // nothing drawn
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(sourceCanvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// Process an uploaded signature image into a clean, transparent PNG.
//
// Two problems with raw uploads (especially JPGs, which are the common case
// for a scanned/photographed signature):
//   1. JPG has no alpha channel, so the white paper background paints an
//      opaque box over whatever sits under the signature field on the doc.
//   2. pdf-lib only embeds PNG/JPG reliably; normalizing to PNG here means
//      the sealed PDF always gets an embeddable image regardless of source.
//
// We knock out near-white pixels (the paper) to transparent with a small
// feather band so stroke edges stay smooth, keep the ink opaque, and
// preserve any alpha the source already had. Output is always image/png.
// Falls back to the original data URL if anything goes wrong (e.g. a
// cross-origin taint — not possible for a local FileReader URL, but cheap
// insurance) so an upload never silently produces nothing.
function processSignatureImage(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          // Downscale BEFORE re-encoding (2026-07-08). The file-size cap on
          // upload (2 MB) bounds the JPG, but re-encoding a full-resolution
          // phone photo (4000×3000px) as lossless PNG balloons it to a
          // 10-30 MB data URL — the submit then 413s on the API's 10 MB JSON
          // limit (prod report: candidate couldn't submit an uploaded photo
          // signature). A signature field renders at a few hundred px, so
          // cap the working canvas; this also makes the pixel loop below
          // ~20× cheaper on phone photos.
          const MAX_W = 1200;
          const MAX_H = 600;
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          const scale = Math.min(1, MAX_W / (srcW || 1), MAX_H / (srcH || 1));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(srcW * scale));
          canvas.height = Math.max(1, Math.round(srcH * scale));
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue; // already transparent — leave it
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (lum >= 250) {
              d[i + 3] = 0; // paper white → fully transparent
            } else if (lum > 220) {
              // Feather the paper→ink transition so edges don't get a halo.
              d[i + 3] = Math.round(d[i + 3] * ((250 - lum) / 30));
            }
          }
          ctx.putImageData(imgData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
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
    // toLocaleDateString on an invalid Date RETURNS the literal string
    // "Invalid Date" — it does not throw — so the catch below never fires for
    // a malformed input and that string got painted onto the document a
    // counterparty is about to sign. Anything that is not a bare YYYY-MM-DD
    // hits this: an ISO datetime ("2026-05-04T12:00:00.000Z"), a dd/mm/yyyy
    // string, or free text. Fall back to the raw value, which is what the
    // catch was already trying to do.
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ── Signature Pad Modal ─────────────────────────────────────────────────────
// Live viewport flag — a plain window.innerWidth read at render time goes
// stale when the phone rotates mid-signature, leaving wrong pad geometry.
function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return isMobile;
}

function SignaturePadModal({ isOpen, onClose, onAdopt, type = 'signature', signerName = '' }) {
  const sigCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const isMobile = useIsMobileViewport();
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
    reader.onload = async () => {
      // Normalize to a clean transparent PNG (knocks out the white paper
      // background and guarantees an embeddable format). Falls back to the
      // raw upload internally if processing fails.
      const cleaned = await processSignatureImage(reader.result);
      setUploadedImageUrl(cleaned);
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
          dataUrl = trimCanvasToDataUrl(sigCanvasRef.current.getCanvas());
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

  return (
    <div
      data-theme="light"
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center', background: 'var(--scrim)',
      }}
      className="sm:items-center sm:p-4"
    >
      {/* flex-col + scrollable content: on landscape phones (~360px tall,
          sm: applies) the fixed-height card clipped the Adopt/Cancel footer
          off-screen with no way to reach it. Header/footer stay pinned; the
          middle scrolls. dvh tracks the visible viewport when the mobile
          keyboard is open. */}
      <div
        className="sm:rounded-xl sm:max-w-lg"
        style={{
          background: 'var(--surface-1)', width: '100%',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          boxShadow: 'var(--sh-4)', overflow: 'hidden',
          maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--line-2)',
        }}>
          <h3 style={{ font: "600 17px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" iconLeft={<X size={20} />} />
        </div>

        {/* Tabs — Type first since most signers prefer typing their name
            over drawing a signature on a desktop trackpad. */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-2)' }}>
          {['type', 'draw', 'upload'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '12px 0', cursor: 'pointer', background: 'none', border: 0,
                font: "550 13px/1.4 'Inter', system-ui, sans-serif",
                color: activeTab === tab ? 'var(--brand-ink)' : 'var(--fg-4)',
                boxShadow: activeTab === tab ? 'inset 0 -2px 0 var(--brand)' : 'none',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content — scrolls between the pinned header and footer */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {activeTab === 'upload' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {uploadedImageUrl ? (
                <div>
                  {/* The preview sits on plain white, NOT a themed surface —
                      it is showing the signer the artwork that will be burned
                      into the PDF, so it must be previewed on paper. */}
                  <div style={{
                    borderRadius: 'var(--r-2, 12px)', background: '#ffffff',
                    boxShadow: 'inset 0 0 0 1px var(--line-2)', padding: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180,
                  }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <img
                      src={uploadedImageUrl}
                      alt="Uploaded signature preview"
                      style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                      PNG or JPG, max 2 MB. Use a transparent-background PNG for best results.
                    </p>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setUploadedImageUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    >
                      Replace
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%', minHeight: 180, cursor: 'pointer', padding: 24,
                      borderRadius: 'var(--r-2, 12px)', border: '2px dashed var(--line-strong)',
                      background: 'var(--surface-2)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    }}
                  >
                    <Download size={32} style={{ color: 'var(--fg-4)', marginBottom: 8, transform: 'rotate(180deg)' }} />
                    <p style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>
                      Click to upload an image of your signature
                    </p>
                    <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
                      PNG or JPG &middot; up to 2 MB
                    </p>
                  </button>
                  <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '12px 0 0' }}>
                    Tip: a clean PNG with a transparent background looks best on the signed document.
                  </p>
                </div>
              )}
              {uploadError && (
                <div style={{ marginTop: 12 }}>
                  <Callout tone="danger">{uploadError}</Callout>
                </div>
              )}
            </div>
          ) : activeTab === 'draw' ? (
            <div>
              {/* Paper white, not a themed surface — the signer is drawing the
                  artwork that lands on the document. */}
              <div style={{
                borderRadius: 'var(--r-2, 12px)', border: '2px dashed var(--line-strong)',
                overflow: 'hidden', background: '#ffffff', position: 'relative',
              }}>
                <SignatureCanvas
                  ref={sigCanvasRef}
                  // 2026-07-15 draw-offset fix: do NOT pass fixed width/height
                  // canvas attributes here. When both attrs are set,
                  // react-signature-canvas skips its internal _resizeCanvas —
                  // but the CSS width:100% still stretched the bitmap, so the
                  // ink landed offset/scaled from the pointer (mobile signers
                  // couldn't reach the right ~43% of the pad; desktop initials
                  // drew 1.56x away from the cursor). With only CSS sizing,
                  // the library measures the rendered element itself and sizes
                  // the bitmap 1:1 (including devicePixelRatio), so strokes
                  // track the pointer exactly. clearOnResize (library default)
                  // wipes the pad if the element size changes mid-draw, which
                  // is the safe behaviour — a resized bitmap would distort the
                  // existing strokes anyway.
                  canvasProps={{
                    className: 'w-full cursor-crosshair touch-none block',
                    style: { width: '100%', height: isMobile ? '250px' : (type === 'initials' ? '150px' : '200px') },
                  }}
                  penColor="#0f3a8a"
                  minWidth={isMobile ? 3 : 2}
                  maxWidth={isMobile ? 6 : 4}
                  onBegin={() => setIsEmpty(false)}
                />
                {isEmpty && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                  }}>
                    <p style={{ font: "450 14px/1.4 'Inter', system-ui, sans-serif", color: '#8a8a8a', margin: 0 }}>
                      {isMobile ? 'Use your finger to sign' : 'Sign here'}
                    </p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                <Button variant="ghost" size="sm" onClick={handleClear}>Clear</Button>
              </div>
            </div>
          ) : (
            <div>
              <Input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={type === 'initials' ? 'Type your initials' : 'Type your full name'}
                // 16px on mobile: anything smaller makes iOS Safari zoom the
                // viewport on focus, which detaches the sticky bars.
                style={{ height: 44, fontSize: 16 }}
                // Autofocus only where a hardware keyboard is likely: on
                // phones it pops the soft keyboard over the font previews
                // and the Adopt button the moment the modal opens (iOS
                // doesn't resize the viewport), forcing the signer to
                // dismiss the keyboard before they can do anything.
                autoFocus={!isMobile}
              />
              <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                <p style={{ ...microStyle, margin: 0 }}>Preview</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {CURSIVE_FONTS.map((font) => (
                    <button
                      key={font.name}
                      onClick={() => setSelectedFont(font)}
                      style={{
                        padding: 12, borderRadius: 'var(--r-2, 12px)', textAlign: 'center', cursor: 'pointer',
                        // White regardless of theme — this previews ink on paper.
                        background: '#ffffff',
                        border: 'none',
                        boxShadow: selectedFont.name === font.name
                          ? '0 0 0 2px var(--brand)'
                          : 'inset 0 0 0 1px var(--line-2)',
                      }}
                    >
                      <span
                        style={{ fontFamily: font.css, fontWeight: font.weight || 400, fontSize: '24px', color: '#1e293b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
          padding: '16px 20px', borderTop: '1px solid var(--line-2)', background: 'var(--surface-2)',
        }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleAdopt}
            disabled={!canAdopt || adopting}
            iconLeft={adopting ? <Loader2 size={16} className="animate-spin" /> : undefined}
          >
            Adopt {type === 'initials' ? 'Initials' : 'Signature'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Field Input ──────────────────────────────────────────────────────
// Renders INSIDE a PDF field box — document surface, not chrome.
function InlineFieldInput({ item, value, onChange, onFocus, onBlur, style, compact = false }) {
  const fieldType = item.type;
  // 2026-07-15: focus the input as soon as it mounts (the component only
  // mounts when its field becomes active) so a single tap opens the mobile
  // keyboard instead of requiring a second tap on the just-rendered input.
  // preventScroll keeps the browser from yanking the viewport — the caller
  // already scrolled the field into position (Next Field / fields list).
  const inputRef = useRef(null);
  useEffect(() => {
    if (fieldType === 'checkbox') return;
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fieldType === 'checkbox') {
    return (
      <button
        onClick={() => onChange(!value)}
        style={style}
        className="absolute flex items-center justify-center cursor-pointer"
      >
        {/* Slim template checkboxes shrink the button to their true size —
            measured 9x9px on a phone, far below the ~44px tap minimum, so
            real thumbs miss it. The negative-inset overlay expands the HIT
            AREA to ~44px without changing the visible checkbox or its
            document position. */}
        <span aria-hidden className="absolute -inset-4" />
        <div className={`relative w-6 h-6 sm:w-5 sm:h-5 rounded border-2 flex items-center justify-center transition-colors ${
          value ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-400 hover:border-indigo-400'
        }`}>
          {value && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white" />}
        </div>
      </button>
    );
  }

  // 2026-05-23 mobile fix v8: signer complained the active input box was
  // still oversized — covered the words on the lines above and below
  // because the chrome stretched higher than the field's natural
  // height. Two fixes here:
  //   - bg-white/75 instead of bg-white: enough opacity for the typed
  //     glyphs to read clearly, but neighboring document text shows
  //     through faintly so the signer keeps spatial context.
  //   - Drop the focus ring entirely on compact; the 1px indigo border
  //     was already adequate visual affordance for "this is the input".
  //     The focus ring was the main thing protruding above/below the
  //     line of body text.
  // appearance-none + box-border + leading-tight stay — they reset
  // iOS Safari's default -webkit-appearance padding.
  const inputCls = compact
    ? 'absolute appearance-none box-border leading-tight bg-white/75 border border-indigo-400 rounded-sm px-1 text-gray-900 focus:outline-none'
    : 'absolute bg-white/90 border border-indigo-300 rounded px-2 sm:px-1.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[44px] sm:min-h-0';
  // The wrapping field box passes its actual rendered height through as
  // `style.height` (a number). When we can read it, bottom-align the typed
  // text so it sits at the bottom edge of the box — that's where the
  // printed underline sits in the source document, and matches the final
  // PDF stamp's positioning.
  const styleHeight = typeof style?.height === 'number' ? style.height : parseFloat(style?.height) || 0;
  // iOS Safari auto-zooms the whole page (and never zooms back) when a
  // focused input's font-size is under 16px — the signer loses the sticky
  // header/action bar and has to pinch out after every field. On mobile
  // widths, floor the input font at 16px; the box may crop tall glyphs
  // slightly but the page stays at 1x. (maximum-scale=1 would also work
  // but breaks accessibility zoom.)
  const iosZoomSafeFloor = typeof window !== 'undefined' && window.innerWidth < 768 ? 16 : 12;
  const dynamicFontSize = styleHeight > 0
    ? Math.min(Math.max(styleHeight * 0.5, iosZoomSafeFloor), 16)
    : Math.max(14, iosZoomSafeFloor);
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
        ref={inputRef}
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
        ref={inputRef}
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
      ref={inputRef}
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
// The field-overlay geometry lives inside this render (left/top/width/height,
// isCompactScale, prevVisualHeight, prevAnchoredTop). It decides WHERE a
// signature lands on a legal document, so the whole block is verbatim.
// Shared signature "stamp" — used both for the active signer's filled
// state and the read-only render of previous signers' signatures, so the
// chrome (dashed rose frame + "Signed with Rivvra Sign" + image + hash)
// stays consistent across both views and matches the final PDF output.
// Three places used to hand-render this independently and drift apart.
// 2026-05-26 FittedText — shrink-to-fit the typed value into a narrow
// field. Without this, a filled date like "26 May 2026" rendered inside
// a 60px-wide PDF field showed as "26 Ma…" with no way for the signer
// to read what they typed. We can't just remove `truncate` because the
// value would bleed sideways into the next field; we can't widen the
// field because the position is template-defined. Solution: measure
// scrollWidth after render, and reduce fontSize in 0.5px steps until
// the text fits or we hit the minFontSize floor. Below the floor we
// fall back to the original truncate so the value doesn't render at
// unreadable sizes.
function FittedText({ children, maxFontSize = 14, minFontSize = 5, className = '', style = {}, containerRef = null }) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  // 2026-05-27 v3: still gets "9000 per da" truncated in very narrow
  // fields because at 6px the floor was just short of fitting. Two
  // changes:
  //   - Floor dropped to 5px (renders as 10-15 device px on Retina,
  //     legible).
  //   - When we hit the floor and STILL overflow, apply a horizontal
  //     squeeze (scaleX 0.95 -> 0.80) so we can compress letter spacing
  //     a bit without rendering text below 5px. Visually equivalent to
  //     a "condensed" font weight; far better than truncation.
  const [scaleX, setScaleX] = useState(1);
  // Re-measure when the measured container resizes (rotation, zoom
  // buttons): the effect deps alone left a previously-fitted value
  // hard-clipped after landscape→portrait because font clamps kept
  // maxFontSize identical.
  const [remeasureTick, setRemeasureTick] = useState(0);
  useLayoutEffect(() => {
    const measureEl = containerRef?.current || ref.current?.parentElement;
    if (!measureEl || typeof ResizeObserver === 'undefined') return;
    let lastW = measureEl.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = measureEl.clientWidth;
      if (w !== lastW) { lastW = w; setRemeasureTick((t) => t + 1); }
    });
    ro.observe(measureEl);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Prefer the explicit containerRef when given (parent of FittedText
    // is sometimes an inline-block whose clientWidth equals content
    // width, which would defeat the measurement). Fall back to the
    // direct parent.
    const measureEl = containerRef?.current || el.parentElement;
    if (!measureEl) return;
    const parentW = measureEl.clientWidth;
    if (parentW <= 0) {
      setFontSize(maxFontSize);
      setScaleX(1);
      return;
    }
    // Phase 1: shrink fontSize from max to min.
    let size = maxFontSize;
    el.style.fontSize = `${size}px`;
    el.style.transform = '';
    let safety = 50;
    while (size > minFontSize && el.scrollWidth > parentW && safety-- > 0) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
    // Phase 2: if we hit the floor and it still overflows, apply a
    // horizontal squeeze. Clamp at 0.80 — below that text looks
    // visibly distorted.
    let sx = 1;
    if (el.scrollWidth > parentW) {
      sx = Math.max(0.80, parentW / el.scrollWidth);
    }
    setFontSize(size);
    setScaleX(sx);
  }, [children, maxFontSize, minFontSize, remeasureTick]);
  return (
    <span
      ref={ref}
      className={`whitespace-nowrap ${className}`}
      style={{
        ...style,
        fontSize,
        display: 'inline-block',
        transform: scaleX !== 1 ? `scaleX(${scaleX})` : undefined,
        transformOrigin: 'left center',
      }}
    >
      {children}
    </span>
  );
}

// PrevSignerValue — read-only render of a previous signer's filled
// text/date value. The wrapping div with `w-full` is the measurement
// container we pass to FittedText; the inner inline-block <span> holds
// the bg-white background so it only covers the actual glyph area.
// This combination fixes the "bg-white was erasing the line above"
// regression — the white background now only covers the typed text,
// not the entire field width.
function PrevSignerValue({ isCompactScale, height, displayDate }) {
  const containerRef = useRef(null);
  const containerH = isCompactScale ? Math.max(height, 18) : Math.max(height, 36);
  const maxFontSize = Math.min(Math.max(containerH * 0.55, isCompactScale ? 12 : 14), 20);
  return (
    <div
      className="w-full h-full flex items-end font-medium pb-0.5 overflow-hidden"
      style={{ lineHeight: 1.1 }}
    >
      <div ref={containerRef} className="w-full overflow-hidden">
        <span className="bg-white text-gray-800 px-1 inline-block max-w-full align-bottom">
          <FittedText
            maxFontSize={maxFontSize}
            minFontSize={isCompactScale ? 6 : 10}
            containerRef={containerRef}
          >
            {displayDate}
          </FittedText>
        </span>
      </div>
    </div>
  );
}

// 2026-05-23 SignatureStamp — always renders the full audit chrome
// (dashed-frame label + image + hash) regardless of scale. The compact
// variant tried in v4 stripped the label and hash to avoid the green
// stripe look on small mobile boxes, but that hid the legal evidence
// the second signer needs to see — they couldn't tell whose signature
// it was or verify the tamper-evidence hash. We restored the full
// chrome (v8) and tightened the surrounding container instead. The
// `compact` prop is still accepted for backwards compatibility but is
// no longer used to gate the label/hash; the stamp scales to fit the
// container it's given.
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
  highlightedFieldId = null,
}) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 });
  const [rendered, setRendered] = useState(false);

  // Render the PDF page onto a canvas
  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!pdfDoc) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        // 2026-05-23 mobile fix v6: render at devicePixelRatio so the
        // canvas is sharp on Retina / HiDPI displays. Before this, the
        // PDF was rasterised at 1x and then upscaled by the browser to
        // the device's 2x/3x pixel density, producing the blurry text
        // Priyanshu reported on iPhone. Cap at 2x so a 3x device doesn't
        // explode memory (each doubling = 4x pixel count). pageDims
        // stays in CSS pixels so the absolute-positioned field overlay
        // and click targets keep their coordinates.
        const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
        const viewport = page.getViewport({ scale });
        const hiResViewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = hiResViewport.width;
        canvas.height = hiResViewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setPageDims({ width: viewport.width, height: viewport.height });
        const ctx = canvas.getContext('2d');
        // A scale change (e.g. fit-to-width kicking in right after the PDF
        // loads) can re-run this effect while the previous render is still
        // painting — pdf.js throws "Cannot use the same canvas during
        // multiple render() operations" and leaves the canvas corrupted.
        // Cancel the in-flight task before starting a new one.
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        }
        const task = page.render({ canvasContext: ctx, viewport: hiResViewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page', pageNum, err);
        }
      }
    }
    setRendered(false);
    render();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
      }
    };
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
        // 2026-05-23 mobile fix (matches the active-signer block below):
        // skip the 36px floor on compact scales so read-only and active
        // fields stack consistently and don't overlap on phones.
        // 2026-05-23 mobile fix v4: tightened the gate. The render scale
        // can drop below 1 on a narrow desktop window (sidebar + small
        // browser), and we don't want that to flip a desktop user into
        // the mobile field chrome. Require both: a compact render scale
        // *and* a mobile-sized viewport. Tailwind `md` breakpoint is
        // 768px which matches our other responsive cutoffs.
        // 2026-07-16: ALSO treat coarse-pointer (touch) devices as compact
        // regardless of width — landscape phones/tablets (768-1024px) with
        // wide/landscape PDFs hit scale<1 with desktop chrome, whose 36px
        // floors overlap close-stacked fields. Desktop windows keep a fine
        // pointer, so the v4 concern (narrow desktop windows flipping into
        // mobile chrome) stays covered.
        const isCompactScale = scale < 1 && typeof window !== 'undefined'
          && (window.innerWidth < 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
        // 2026-07-16 WYSIWYG anchoring (mirrors the active-signer block):
        // the readability floor on slim text fields must grow UPWARD so the
        // box bottom — and the bottom-aligned value — stays on the underline
        // the template author drew. Growing downward pushed the first
        // signer's values below the underlines when the second signer
        // viewed them. Signature containers keep their own sizing;
        // multiline keeps the author's top edge (text flows down from top).
        const prevVisualHeight = isSignatureDataUrl
          ? Math.max(height + (isCompactScale ? 8 : 20), isCompactScale ? 40 : 0)
          : (isCompactScale ? Math.max(height, 18) : Math.max(height, 36));
        const prevAnchoredTop = item.type === 'multiline'
          ? top
          : top - Math.max(0, prevVisualHeight - height);

        return (
          <div
            key={`prev-${fieldId}`}
            className="absolute pointer-events-none rounded overflow-hidden"
            style={{
              left,
              top: prevAnchoredTop,
              width,
              // 2026-05-27 H5: mirror active-signer's 40px floor on
              // compact so the previous signer's signature image stays
              // visible (the second signer needs to inspect it as
              // legal evidence).
              height: prevVisualHeight,
              // 2026-05-23 mobile fix v8: restored the dashed rose
              // frame + white bg on the previous-signer signature
              // container even on compact scales. The frame, label,
              // and hash together are the audit evidence the second
              // signer needs to see — stripping them on mobile hid
              // legally meaningful info. Tighter container heights
              // (above) keep the chrome from looking out of place
              // even at compact scale.
              border: isSignatureDataUrl ? '2px dashed #d4a0a0' : undefined,
              backgroundColor: isSignatureDataUrl ? '#ffffff' : undefined,
            }}
          >
            {isSignatureDataUrl ? (
              // Show the previous signer's stamp with the SAME chrome the
              // active signer sees once they sign and that the final PDF
              // shows: dashed rose frame, label, image, truncated hash.
              <SignatureStamp
                src={val}
                hash={previousSignatureHashes[fieldId]}
                compact={isCompactScale}
              />
            ) : (
              // Bottom-align the read-only previous value so it visually
              // sits on the underline beneath the field — matches what the
              // current signer's own values will look like, and matches the
              // final PDF stamp's positioning. Inline-block + bg-white pad
              // is only as wide as the glyphs (plus tiny horizontal
              // padding) so we don't erase surrounding document text.
              <PrevSignerValue
                isCompactScale={isCompactScale}
                height={height}
                displayDate={displayDate}
              />
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
        const isHighlighted = highlightedFieldId === (item._id || item.id);
        const meta = FIELD_META[item.type] || FIELD_META.text;
        const Icon = meta.icon;
        // 2026-05-23 Sign mobile fix: on small auto-fit scales (scale<1,
        // typically mobile portrait fit-to-width), the 36/44px hard
        // minimums below were pushing close-stacked fields into each
        // other — three fields drawn at adjacent PDF coordinates would
        // visually merge because each one's box had been inflated to a
        // value larger than the PDF gap between them. On compact scales
        // we now use the natural scaled height so adjacent fields stay
        // visually separated; on desktop (scale >= 1) the touch-target
        // floor still applies so tappable areas remain comfortable.
        // 2026-05-23 mobile fix v4: tightened the gate. The render scale
        // can drop below 1 on a narrow desktop window (sidebar + small
        // browser), and we don't want that to flip a desktop user into
        // the mobile field chrome. Require both: a compact render scale
        // *and* a mobile-sized viewport. Tailwind `md` breakpoint is
        // 768px which matches our other responsive cutoffs.
        // 2026-07-16: ALSO treat coarse-pointer (touch) devices as compact
        // regardless of width — landscape phones/tablets (768-1024px) with
        // wide/landscape PDFs hit scale<1 with desktop chrome, whose 36px
        // floors overlap close-stacked fields. Desktop windows keep a fine
        // pointer, so the v4 concern (narrow desktop windows flipping into
        // mobile chrome) stays covered.
        const isCompactScale = scale < 1 && typeof window !== 'undefined'
          && (window.innerWidth < 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
        const Callout = isHighlighted ? (
          <div
            className="absolute left-0 -top-7 px-2 py-1 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded shadow-md whitespace-nowrap pointer-events-none animate-bounce z-10"
          >
            ↓ Fill this field
          </div>
        ) : null;
        const highlightRing = isHighlighted ? 'ring-4 ring-yellow-400 ring-offset-2 animate-pulse' : '';

        // Position & size from item (fractions 0–1 of page dimensions)
        const left = (item.posX ?? item.x ?? 0) * pageDims.width;
        const top = (item.posY ?? item.y ?? 0) * pageDims.height;
        const width = (item.width ?? 0.2) * pageDims.width;
        const height = (item.height ?? 0.05) * pageDims.height;

        // For signature/initials: show image if filled, else clickable placeholder
        if (isSignatureType) {
          const fieldId = item._id || item.id;
          const hash = isFilled ? (signatureHashes?.[fieldId] || '') : '';
          // Enforce a 44px minimum touch target on the unfilled placeholder —
          // iOS Safari drops taps on sub-44px boxes overlaying PDF content,
          // which left mobile signers tapping fields with no response. Filled
          // state keeps the template-defined height so the flattened PDF
          // signature lands where the template author placed it.
          // 2026-05-23 mobile floor tuned: dropping the floor entirely made
          // adjacent fields stop overlapping but also let signature
          // placeholders shrink below readability on a phone. Halve the
          // desktop floor on compact scales — 22px is enough to show the
          // pen icon + label without inflating the box past close-stacked
          // PDF gaps.
          const unfilledHeight = isCompactScale ? Math.max(height, 22) : Math.max(height, 44);
          // WYSIWYG anchor (2026-07-16, matches the sealer): authors align
          // the signature box's BOTTOM just above the printed line, so any
          // floor/stamp growth must extend UPWARD — growing downward draped
          // the stamp frame + hash over the line and the fields below it.
          const sigVisualHeight = isFilled
            ? Math.max(height + (isCompactScale ? 8 : 20), isCompactScale ? 40 : 0)
            : unfilledHeight;
          const sigAnchoredTop = top - Math.max(0, sigVisualHeight - height);
          return (
            <div
              key={fieldId}
              data-field-id={fieldId}
              className={`absolute cursor-pointer rounded transition-all overflow-visible ${highlightRing}`}
              style={{
                left, top: sigAnchoredTop, width,
                // 2026-05-27 H5: previous version (+8 on compact) was
                // tight enough that on small signature fields the
                // SignatureStamp layout (label + image + hash, vertical)
                // crushed the IMAGE to 5-8px while the 9px label + 8px
                // hash consumed everything else. Signer's actual
                // signature drawing rendered as a faint smudge or
                // appeared missing. Floor the container at 40px on
                // compact so the image always has ≥20px to render in
                // (label + hash combined are ~20px).
                height: sigVisualHeight,
                border: isFilled ? '2px dashed #d4a0a0' : undefined,
                backgroundColor: isFilled ? '#ffffff' : undefined,
                scrollMarginTop: 120,
                scrollMarginBottom: 100,
              }}
              onClick={() => onOpenSignaturePad(fieldId, item.type)}
            >
              {Callout}
              {isFilled ? (
                <SignatureStamp
                  src={fieldValue}
                  hash={hash}
                  alt={item.type}
                  compact={isCompactScale}
                />
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
              className={`absolute rounded transition-all flex items-center justify-center ${highlightRing}`}
              style={{ left, top, width, height, scrollMarginTop: 120, scrollMarginBottom: 100 }}
            >
              {Callout}
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
        // 2026-05-23 mobile floor tuned: dropping the floor entirely turned
        // filled text fields into thin opaque bars across the document
        // (border-2 + bg-white was wider than the content inside). The
        // compact-scale floor is now 18px — enough to contain a 14px
        // glyph without inflating past close-stacked PDF gaps. Filled
        // styling is also softened on compact scales (see className below)
        // so the box doesn't read as a horizontal bar erasing document
        // text underneath.
        const visualHeight = isCompactScale ? Math.max(height, 18) : Math.max(height, 36);
        // 2026-07-16 WYSIWYG anchoring: template authors align the BOTTOM of
        // the field box to the printed underline, so when the touch-target
        // floor inflates a slim box the extra height must grow UPWARD —
        // growing downward pushed the typed value below the underline (and
        // the sealed PDF even further, since its floor is in points). Keep
        // the box's bottom edge exactly where the author drew it. Multiline
        // is top-anchored (text flows down from the top edge), so it keeps
        // the author's top edge instead.
        const inflation = Math.max(0, visualHeight - height);
        const anchoredTop = item.type === 'multiline' ? top : top - inflation;
        // Floor on the filled font size: 12 on compact (matches the 18px
        // visualHeight floor) and 14 on desktop (matches the 36px floor).
        // Keeps glyph cleanly inside the box on both paths.
        const filledFontSize = Math.min(Math.max(visualHeight * 0.55, isCompactScale ? 12 : 14), 20);
        // 2026-05-23 mobile chrome v3: on compact scales a *filled*
        // text field used to render with a coloured box + border, which
        // at 12-18px tall reads as a horizontal highlight stripe across
        // the document — ugly and looked like the field "erased" the
        // surrounding paragraph. Real signed paper documents don't show
        // a box around the typed value; the value just sits on the
        // printed underline that the template author put there.
        //
        // So on compact + filled we drop the box chrome entirely (no
        // background, no border) and let the value text sit inline with
        // the document. Unfilled fields keep a 1px dashed border so the
        // signer can still see where to tap. Desktop styling is
        // unchanged.
        const filledClass = isCompactScale
          ? 'cursor-pointer'
          : 'border-2 border-green-400 bg-white cursor-pointer';
        const errorClass = isCompactScale
          ? 'border border-dashed border-red-500 bg-red-50/30 cursor-pointer animate-pulse'
          : 'border-2 border-dashed border-red-500 bg-red-50/60 cursor-pointer animate-pulse';
        const requiredClass = isCompactScale
          ? 'border border-dashed border-indigo-400 bg-indigo-50/20 hover:bg-indigo-100/30 cursor-pointer'
          : 'border-2 border-dashed border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60 cursor-pointer';
        const optionalClass = isCompactScale
          ? 'border border-dashed border-gray-300 bg-gray-50/20 hover:bg-gray-100/30 cursor-pointer'
          : 'border-2 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-100/60 cursor-pointer';

        return (
          <div
            key={item._id || item.id}
            data-field-id={item._id || item.id}
            className={`absolute rounded transition-all ${highlightRing} ${
              isActive
                ? ''
                : isFilled
                  ? filledClass
                  : showValidation && isRequired
                    ? errorClass
                    : isRequired
                      ? requiredClass
                      : optionalClass
            }`}
            style={{ left, top: anchoredTop, width, height: visualHeight, scrollMarginTop: 120, scrollMarginBottom: 100 }}
            onClick={() => {
              if (!isActive) setActiveFieldId(item._id || item.id);
            }}
          >
            {Callout}
            {isActive ? (
              <InlineFieldInput
                item={item}
                value={fieldValue || ''}
                onChange={(val) => onFieldChange(item._id || item.id, val)}
                onFocus={() => {}}
                onBlur={() => {
                  // Delay to allow click events to fire first. Clear
                  // conditionally: by the time the timeout fires the user may
                  // have already activated ANOTHER field (tap field B while
                  // field A's input is focused) — unconditionally nulling
                  // activeFieldId would immediately close the field they just
                  // opened. Only deactivate if this field is still the one
                  // that's active.
                  const thisFieldId = item._id || item.id;
                  setTimeout(() => {
                    setActiveFieldId((curr) => (curr === thisFieldId ? null : curr));
                  }, 150);
                }}
                style={{ left: 0, top: 0, width: '100%', height: visualHeight, position: 'relative' }}
                compact={isCompactScale}
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
                    {/* 2026-05-26 G1: FittedText shrinks the font size
                        instead of clipping the value with `truncate`.
                        Signer can now see the whole "26 May 2026"
                        instead of just "26 Ma…". title= remains as a
                        fallback for desktop hover.
                        2026-07-15: multiline fields skip FittedText — its
                        whitespace-nowrap squeezed a whole paragraph onto
                        one line. They wrap (pre-wrap) from the TOP of the
                        box like the textarea they were typed in, clamped
                        to the lines that fit the box height. */}
                    {item.type === 'multiline' ? (
                      <span
                        className="flex-1 min-w-0 overflow-hidden text-gray-900 self-start"
                        title={String(fieldValue ?? '')}
                        style={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: Math.max(1, Math.floor(visualHeight / (filledFontSize * 1.1))),
                        }}
                      >
                        {fieldValue}
                      </span>
                    ) : (
                      <span
                        className="flex-1 min-w-0 overflow-hidden text-gray-900"
                        title={item.type === 'date' ? formatDisplayDate(fieldValue) : String(fieldValue ?? '')}
                      >
                        <FittedText
                          maxFontSize={filledFontSize}
                          minFontSize={isCompactScale ? 6 : 10}
                        >
                          {item.type === 'date' ? formatDisplayDate(fieldValue) : fieldValue}
                        </FittedText>
                      </span>
                    )}
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
export default function PublicSigningPageV2() {
  const { requestId, signerId, token } = useParams();

  // State
  const [status, setStatus] = useState('loading'); // loading | signing | success | refused | error | waiting
  const [error, setError] = useState('');
  // 2026-05-23: signerState captured from the verify endpoint so the
  // error screen can branch on the actual terminal reason (completed /
  // refused / cancelled / expired) instead of one alarming red triangle
  // for all of them. Null until verify returns a signerState in the body.
  const [terminalState, setTerminalState] = useState(null);
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
  // Actual first-page width (in PDF points) of the loaded document, used by
  // the fit-to-width scale calc. Defaults to US Letter (612pt) until the PDF
  // loads — A4 (595pt) and custom page sizes would otherwise mis-fit.
  const [basePageWidth, setBasePageWidth] = useState(612);
  const [values, setValues] = useState({}); // { [signItemId]: value }
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [showRefuseConfirm, setShowRefuseConfirm] = useState(false);
  // 2026-05-23 Sign health-check P0 #6: capture the recipient's refusal
  // reason. The backend has accepted req.body.reason all along, but the
  // UI never gathered it — so every refusal was persisted with a null
  // reason, weakening the company's dispute defence.
  const [refuseReason, setRefuseReason] = useState('');
  const [sigPadModal, setSigPadModal] = useState({ open: false, fieldId: null, type: 'signature' });
  const [sigDataUrls, setSigDataUrls] = useState({ signature: null, initials: null });
  const [scale, setScale] = useState(1.5);
  // userZoom multiplies the auto-fit scale. Stays separate from scale so
  // resize events don't blow away the user's zoom preference.
  const [userZoom, setUserZoom] = useState(1);
  const [showFieldsList, setShowFieldsList] = useState(false);
  // Transient attention highlight: when Next Field / validation scrolls the
  // user to a pending field, glow that field for a few seconds so they can
  // see *which* one needs attention. Cleared by a timer or by interacting
  // with the field.
  const [highlightedFieldId, setHighlightedFieldId] = useState(null);
  const highlightTimerRef = useRef(null);
  const highlightField = useCallback((fieldId) => {
    if (!fieldId) return;
    setHighlightedFieldId(fieldId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedFieldId(null);
      highlightTimerRef.current = null;
    }, 4000);
  }, []);

  // Envelope state
  const [envelope, setEnvelope] = useState(null); // null = single doc
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [envelopeValues, setEnvelopeValues] = useState({}); // { [docId]: { [fieldId]: value } }

  const containerRef = useRef(null);

  // Signature hash fingerprints for display, keyed per field.
  const [signatureHashes, setSignatureHashes] = useState({});
  // 2026-05-23 Sign health-check P0 #8: parallel map keyed by signature
  // *type* ('signature' / 'initials'). handleReuseExisting used to copy
  // "the first hash in signatureHashes" which silently picked the wrong
  // type when the signer had both a signature and initials — corrupting
  // the audit trail on the sealed PDF. The per-type map lets reuse copy
  // the correct fingerprint.
  const [sigHashByType, setSigHashByType] = useState({});

  // 2026-05-23 Sign health-check P0 #7: authoritative server timestamp
  // returned by /sign/submit so the success screen renders the same
  // instant that's sealed into the PDF, not the signer's local "today".
  const [serverSignedAt, setServerSignedAt] = useState(null);

  // Previous signers' values (read-only display)
  const [previousValues, setPreviousValues] = useState({});
  const [previousSignatureHashes, setPreviousSignatureHashes] = useState({});
  const [allSignItems, setAllSignItems] = useState([]);

  // Click to Start / Next field navigation
  const [hasStarted, setHasStarted] = useState(false);

  // Download CTA state — guards against the race between the success page
  // rendering and the backend finishing the signed-PDF generation/upload.
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

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
          // Capture the terminal signer state so the error screen can
          // branch on it (already-signed vs refused vs cancelled vs
          // expired). Null when the backend didn't send a state — that
          // path keeps falling through to the generic error template.
          if (data.signerState) setTerminalState(data.signerState);
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
        // Restore an unsent draft (survives pull-to-refresh / mobile tab
        // discard — see the draft-persistence effect below). Draft values
        // win over the auto-fill defaults; a corrupt/absent draft is a
        // silent no-op.
        try {
          const draft = JSON.parse(sessionStorage.getItem(`rivvra-sign-draft-${requestId}-${signerId}`) || 'null');
          if (draft && typeof draft === 'object') {
            if (draft.values && typeof draft.values === 'object') Object.assign(initialValues, draft.values);
            if (draft.sigDataUrls && typeof draft.sigDataUrls === 'object') setSigDataUrls((prev) => ({ ...prev, ...draft.sigDataUrls }));
            if (draft.signatureHashes && typeof draft.signatureHashes === 'object') setSignatureHashes(draft.signatureHashes);
            if (draft.sigHashByType && typeof draft.sigHashByType === 'object') setSigHashByType(draft.sigHashByType);
          }
        } catch { /* ignore bad drafts */ }
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

  // ── Pull-to-refresh guard ────────────────────────────────────────────
  // The page column scrolls the BODY, so overscroll-behavior must live on
  // the root element (a class on our own div does nothing): without it, an
  // over-scroll flick at the top triggers Chrome-on-Android's
  // pull-to-refresh and reloads away the signer's progress.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    return () => { root.style.overscrollBehaviorY = prev; };
  }, []);

  // ── Draft persistence ────────────────────────────────────────────────
  // 60% of signers are on mobile, where the page scrolls the body: a
  // Chrome-on-Android pull-to-refresh flick, or Safari discarding the tab
  // while the signer switches apps, silently wiped every filled field and
  // drawn signature. Mirror progress into sessionStorage (per request +
  // signer, cleared on submit/refuse). Skip oversized payloads so a photo
  // signature can't blow the storage quota.
  useEffect(() => {
    if (status !== 'signing') return;
    try {
      const draft = JSON.stringify({ values, sigDataUrls, signatureHashes, sigHashByType });
      if (draft.length < 4_000_000) {
        sessionStorage.setItem(`rivvra-sign-draft-${requestId}-${signerId}`, draft);
      }
    } catch { /* quota exceeded — draft is best-effort */ }
  }, [status, values, sigDataUrls, signatureHashes, sigHashByType, requestId, signerId]);

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
          // Measure the real first-page width so fit-to-width scales
          // correctly for non-US-Letter documents (same approach as the
          // template editor). Best-effort — the 612pt default stands if
          // this fails.
          try {
            const firstPage = await doc.getPage(1);
            const vw = firstPage.getViewport({ scale: 1 }).width;
            if (!cancelled && vw > 0) setBasePageWidth(vw);
          } catch { /* keep 612 fallback */ }
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
      // Fit the ACTUAL page width (measured from the loaded PDF's first
      // page, US Letter fallback until then) with padding.
      const availableWidth = containerWidth - 32; // 16px padding each side
      const newScale = Math.max(0.5, Math.min(2, availableWidth / basePageWidth));
      setScale(newScale);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [status, basePageWidth]);

  // ── Field value change ───────────────────────────────────────────────
  const handleFieldChange = useCallback((fieldId, value) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (showValidation) setShowValidation(false); // clear validation on any field change
    // Treat any field interaction as "started" so the sticky CTA banner gets
    // out of the way even if the signer scrolled past it without clicking.
    setHasStarted(true);
    // Once they're typing in the highlighted field, drop the attention ring.
    setHighlightedFieldId((curr) => (curr === fieldId ? null : curr));
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
      // 2026-05-23 Sign health-check P0 #8: copy the hash that matches
      // *this signature type*. The old code grabbed "first hash in
      // signatureHashes" which could easily be the wrong type when the
      // signer had both signature + initials drawn.
      const existingHash = sigHashByType[type] || '';
      if (existingHash) setSignatureHashes(prev => ({ ...prev, [fieldId]: existingHash }));
    }
    setSigReusePrompt({ open: false, fieldId: null, type: 'signature' });
  }, [sigReusePrompt, sigDataUrls, handleFieldChange, sigHashByType]);

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
    // Remember the hash per signature type so handleReuseExisting can
    // copy the correct fingerprint on the next field of the same type.
    setSigHashByType((prev) => ({ ...prev, [type]: hash }));
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
          highlightField(id);
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
          highlightField(id);
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
  }, [template?.signItems, values, handleOpenSignaturePad, highlightField]);

  // Download the signed PDF, retrying briefly while the backend finishes
  // sealing+uploading. Race: the success page renders the moment the
  // signer's submit returns, but the signed PDF is generated and uploaded
  // to Cloudinary asynchronously. A click within the first ~5s used to
  // hit "Signed PDF not available yet". We retry with backoff and only
  // surface an error if it's still not ready after ~25s.
  const handleDownloadSigned = useCallback(async () => {
    if (downloading) return;
    setDownloadError(null);
    setDownloading(true);
    const url = `${API_BASE_URL}/api/sign/public/${requestId}/${signerId}/${token}/signed-pdf`;
    const delays = [0, 1500, 2500, 4000, 6000, 8000]; // ~22s total
    try {
      for (let i = 0; i < delays.length; i++) {
        if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
        const res = await fetch(url, { credentials: 'omit' });
        if (res.ok) {
          const blob = await res.blob();
          const cd = res.headers.get('content-disposition') || '';
          const m = /filename="?([^";]+)"?/i.exec(cd);
          const filename = m?.[1] || 'document_signed.pdf';
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
          setDownloading(false);
          return;
        }
        // Only keep retrying for the "not ready yet" case. Other errors
        // (403/500/etc.) bail out immediately.
        if (res.status !== 404) {
          setDownloadError('Could not download the signed copy. Please try again.');
          setDownloading(false);
          return;
        }
      }
      setDownloadError('Still preparing your signed copy. Please try again in a moment.');
    } catch {
      setDownloadError('Could not download the signed copy. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [downloading, requestId, signerId, token]);

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
    if (isFilledValue(v)) return true;
    // An optional checkbox the signer explicitly toggled off (value ===
    // false, not undefined) is a decision, not a gap — count it as done so
    // the progress counter can actually reach N of N. Required checkboxes
    // still count as unfilled (allRequiredFilled / the dot are unchanged).
    return item.type === 'checkbox' && v === false && !isItemRequired(item);
  }).length;
  const allRequiredFilled = filledRequiredCount === requiredItems.length;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting) return;
    // If not all required filled, show validation and scroll to first missing.
    // Name the first missing required field + page so the candidate knows
    // where to look — generic "complete all required fields" left mobile
    // users stuck with no way to find the off-screen field.
    if (!allRequiredFilled) {
      setShowValidation(true);
      const firstMissing = requiredItems
        .filter((item) => !isFilledValue(values[item._id || item.id]))
        .sort((a, b) => ((a.page || 0) - (b.page || 0)) || ((a.posY || 0) - (b.posY || 0)))[0];
      scrollToNextField(null);
      if (firstMissing) {
        const meta = FIELD_META[firstMissing.type] || FIELD_META.text;
        const label = firstMissing.label || meta.label;
        showToast(`Missing: "${label}" on page ${(firstMissing.page || 0) + 1}`, 'warning');
      } else {
        showToast('Please complete all required fields before submitting', 'warning');
      }
      return;
    }

    // Format / length / pattern validation. Type defaults catch malformed
    // emails and phones before they reach the sealed PDF; min/max length
    // and the optional pattern field come from the editor's per-field
    // Validation properties and let template builders enforce things like
    // "PAN: 5 letters + 4 digits + 1 letter" without writing code.
    //
    // 2026-05-23 Sign health-check P0 #9: the old loop bailed on any
    // non-string value (`!v || typeof v !== 'string'`), which let an
    // auto-filled email (signer.email was poured into a required email
    // field at load time) skip the format check entirely if it had been
    // edited to blank. Now we run the validators when a required field
    // has any value at all — including string fields that came from
    // autofill — and coerce to string defensively before regex tests.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[+]?[0-9 ()\-.]{6,}$/;
    for (const item of signItems) {
      const id = item._id || item.id;
      const v = values[id];
      // Skip only when the field is unfilled. Required-field presence
      // was already enforced by the allRequiredFilled gate above.
      if (v == null || v === '' || v === false) continue;
      // Non-string values (signature data URLs, checkbox booleans) have
      // no format validators that apply; the per-type checks below all
      // operate on strings.
      if (typeof v !== 'string') continue;
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
          // Per-field state from the PREVIOUS document must not leak into
          // the next one: signatureHashes is keyed by the old doc's field
          // ids, and a lingering showValidation would paint the fresh doc's
          // required fields red before the signer has touched anything.
          // (sigDataUrls / sigHashByType intentionally survive — they power
          // signature reuse across documents.)
          setSignatureHashes({});
          setShowValidation(false);
          setActiveFieldId(null);
          setPdfDoc(null);
          setNumPages(0);
        }
      } else {
        // Backend returns { success, completed, signedAt } where
        // completed=true means ALL signers (including this one) are now
        // done — used to gate the download CTA on the success screen.
        // signedAt is the server's authoritative timestamp; we render
        // that on the success screen so it matches the sealed PDF.
        setAllPartiesSigned(!!res?.completed);
        if (res?.signedAt) setServerSignedAt(res.signedAt);
        try { sessionStorage.removeItem(`rivvra-sign-draft-${requestId}-${signerId}`); } catch { /* ignore */ }
        setStatus('success');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Server-side validation caught fields the client check missed (e.g.
      // requiredIf resolved differently server-side): light up the red
      // validation styling and walk the signer to the first missing field,
      // same as the client-side pre-submit path.
      if (Array.isArray(err.missingFields) && err.missingFields.length > 0) {
        setShowValidation(true);
        scrollToNextField(null);
      }
      showToast(err.message || 'Failed to submit signature. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Refuse ──────────────────────────────────────────────────────────
  const handleRefuse = async () => {
    const reason = refuseReason.trim();
    if (!reason) return; // Submit button is disabled in this case; defensive.
    setRefusing(true);
    try {
      await signApi.refuseSignature(requestId, signerId, token, reason);
      try { sessionStorage.removeItem(`rivvra-sign-draft-${requestId}-${signerId}`); } catch { /* ignore */ }
      setStatus('refused');
    } catch (err) {
      if (err.name === 'AbortError') return;
      showToast(err.message || 'Failed to refuse signature. Please try again.', 'error');
    } finally {
      setRefusing(false);
      setShowRefuseConfirm(false);
    }
  };


  // ── Loading state ───────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div data-theme="light" style={{ ...shellStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={40} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
          <p style={{ ...cardBody, marginTop: 16 }}>Verifying your signing link...</p>
        </div>
      </div>
    );
  }

  // ── Waiting state (sequential signing — not your turn yet) ──────────
  if (status === 'waiting') {
    return (
      <StatusCard tone="warn" icon={<Clock size={32} />} title="Not Your Turn Yet" footer={<SecuredBy />}>
        <p style={cardBody}>
          This document requires signatures in a specific order. Other signers need to complete their signatures before you.
        </p>
        <p style={cardMeta}>You&apos;ll receive an email when it&apos;s your turn to sign.</p>
      </StatusCard>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  if (status === 'error') {
    // 2026-05-23 terminal-state polish: a signer who clicks the email
    // link a second time used to see a red error triangle + "Unable to
    // Open Document" even though they had just *successfully* signed
    // — looked like a system failure. Branch the icon, headline, and
    // copy on the backend-reported signerState so a completed signing
    // reads as a success, a refusal/cancellation reads as informational,
    // and only genuine errors (invalid token, etc.) keep the red look.
    const variants = {
      completed: {
        tone: 'brand',
        Icon: CheckCircle2,
        title: "You've already signed this document",
        body: 'Your signature was successfully captured. There is nothing more to do here.',
        isError: false,
      },
      refused: {
        tone: 'warn',
        Icon: XCircle,
        title: 'You declined to sign this document',
        body: 'Your refusal was recorded and the sender has been notified.',
        isError: false,
      },
      cancelled: {
        tone: 'neutral',
        Icon: X,
        title: 'This signing request was cancelled',
        body: 'The sender cancelled this request, so it can no longer be signed.',
        isError: false,
      },
      expired: {
        tone: 'warn',
        Icon: Clock,
        title: 'This signing link has expired',
        body: 'The sender set an expiry date that has now passed. Contact the sender for a new link if you still need to sign.',
        isError: false,
      },
      // Fallback for null state and any unknown future state — keep the
      // alarming look only for actual error conditions (invalid token,
      // malformed URL, transport failure).
      _generic: {
        tone: 'danger',
        Icon: AlertTriangle,
        title: 'Unable to Open Document',
        body: error,
        isError: true,
      },
    };
    const variant = variants[terminalState] || variants._generic;
    return (
      <StatusCard tone={variant.tone} icon={<variant.Icon size={32} />} title={variant.title} footer={<SecuredBy link />}>
        <p style={cardBody}>{variant.body}</p>
        {/* Sender-contact line is only useful for the generic / error
            path. For known terminal states the body already explains
            what happened so this would just add visual noise. */}
        {variant.isError && (
          <p style={cardMeta}>If you believe this is an error, please contact the sender.</p>
        )}
      </StatusCard>
    );
  }

  // ── Success state ───────────────────────────────────────────────────
  if (status === 'success') {
    // Prefer the server's signedAt — it matches the sealed PDF stamp.
    // formatDisplayDate expects a YYYY-MM-DD string; coerce.
    const signedDate = serverSignedAt
      ? formatDisplayDate(new Date(serverSignedAt).toISOString().slice(0, 10))
      : formatDisplayDate(todayStr());

    return (
      <StatusCard tone="brand" icon={<Check size={32} />} title="Document Signed Successfully!" footer={<SecuredBy />}>
        <p style={cardBody}>
          Thank you for signing <span style={{ fontWeight: 550, color: 'var(--fg)' }}>{request?.reference || 'this document'}</span>.
        </p>

        {/* Signing summary */}
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 'var(--r-2, 12px)',
          background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
          display: 'grid', gap: 10, textAlign: 'left',
        }}>
          <div style={summaryRow}>
            <span style={{ color: 'var(--fg-4)' }}>Signed by</span>
            <span style={{ fontWeight: 550, color: 'var(--fg)' }}>{signer?.name}</span>
          </div>
          <div style={summaryRow}>
            <span style={{ color: 'var(--fg-4)' }}>Date</span>
            <span style={{ fontWeight: 550, color: 'var(--fg)' }}>{signedDate}</span>
          </div>
          <div style={summaryRow}>
            <span style={{ color: 'var(--fg-4)' }}>Document</span>
            <span style={{ fontWeight: 550, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 16 }}>
              {request?.reference || 'Document'}
            </span>
          </div>
          {/* 2026-07-15: removed the dead "X of Y signed" row — the verify
              endpoint never returns request.signers, so signerCount was
              always 0 and the row never rendered (and would have shown a
              wrong count if it ever had data). */}
          {signatureHashes && Object.values(signatureHashes)[0] && (
            <div style={summaryRow}>
              <span style={{ color: 'var(--fg-4)' }}>Signature ID</span>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, color: 'var(--fg-2)' }}>
                {Object.values(signatureHashes)[0]}...
              </span>
            </div>
          )}
        </div>

        {/* Download CTA — shown only when the request is fully signed
            (i.e. you were the last/only signer). For mid-flow signers
            we keep the email-fallback message so they don't try to
            download a doc that isn't sealed yet. */}
        {allPartiesSigned ? (
          <>
            <div style={{ marginTop: 20 }}>
              <Button
                type="button"
                block
                onClick={handleDownloadSigned}
                disabled={downloading}
                iconLeft={downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              >
                {downloading ? 'Preparing signed copy…' : 'Download signed copy'}
              </Button>
            </div>
            {downloadError && (
              <p style={{ ...cardMeta, color: 'var(--danger)', marginTop: 8 }}>{downloadError}</p>
            )}
            <p style={{ ...cardMeta, marginTop: 12 }}>
              Your signed PDF and the audit certificate were also emailed to you.
            </p>
          </>
        ) : (
          <p style={{ ...cardBody, marginTop: 16 }}>
            You&apos;ll receive the signed copy via email once all parties have signed.
          </p>
        )}
      </StatusCard>
    );
  }

  // ── Refused state ───────────────────────────────────────────────────
  if (status === 'refused') {
    return (
      <StatusCard tone="warn" icon={<AlertTriangle size={32} />} title="You have refused to sign this document">
        <p style={cardBody}>The sender has been notified.</p>
      </StatusCard>
    );
  }

  // ── Signing state ───────────────────────────────────────────────────
  return (
    <div data-theme="light" style={shellStyle}>
      {/* Google Fonts for cursive signature typing — must match
          CURSIVE_FONTS above (Caveat 600 is the only non-400 weight we
          render). index.css loads these too; this link just warms them up
          early so the signature modal previews don't flash the fallback. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Homemade+Apple&family=Allura&family=Alex+Brush&display=swap"
        rel="stylesheet"
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--surface-1)', borderBottom: '1px solid var(--line-2)', boxShadow: 'var(--sh-1)',
      }}>
        {/* Envelope document stepper */}
        {envelope && (
          <div style={{ background: 'var(--brand-soft)', borderBottom: '1px solid var(--brand-line)', padding: '8px 16px' }}>
            <div style={{ maxWidth: 1152, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
              {envelope.documents.map((doc, idx) => (
                <Chip
                  key={doc.id}
                  tone={idx === currentDocIndex ? 'brand' : 'neutral'}
                  style={{
                    whiteSpace: 'nowrap', flexShrink: 0,
                    ...(idx === currentDocIndex
                      ? { background: 'var(--brand)', color: 'var(--brand-on)' }
                      : idx < currentDocIndex
                      ? { background: 'var(--brand-soft)', color: 'var(--brand-ink)' }
                      : null),
                  }}
                >
                  {idx < currentDocIndex ? <Check size={12} /> : <span>{idx + 1}</span>}
                  <span className="hidden sm:inline">{doc.templateName}</span>
                </Chip>
              ))}
              <span style={{ ...cardMeta, margin: '0 0 0 8px', whiteSpace: 'nowrap' }}>
                Document {currentDocIndex + 1} of {envelope.totalDocuments}
              </span>
            </div>
          </div>
        )}
        <div style={{
          maxWidth: 1152, margin: '0 auto', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          {/* Left: document name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <FileText size={20} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
            <span style={{
              font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {envelope ? envelope.documents[currentDocIndex]?.templateName : (request?.reference || 'Document')}
            </span>
          </div>

          {/* Center: org name */}
          {orgName && (
            <div className="hidden sm:block" style={{
              font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
              textAlign: 'center', flexShrink: 0,
            }}>
              {orgName}
            </div>
          )}

          {/* Right: signer info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right', minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{
                font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={signer?.name}>{signer?.name}</p>
              <p style={{
                font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={signer?.email}>{signer?.email}</p>
            </div>
            <span style={{
              width: 32, height: 32, borderRadius: 99, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--brand-soft)', color: 'var(--brand-ink)',
            }}>
              <User size={16} />
            </span>
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
          <div style={{
            padding: '6px 16px', textAlign: 'center',
            font: "550 11.5px/1.5 'Inter', system-ui, sans-serif",
            background: isUrgent ? 'var(--danger-soft)' : 'var(--warn-soft)',
            color: isUrgent ? 'var(--danger)' : 'var(--warn-ink)',
          }}>
            <Clock size={13} style={{ display: 'inline-block', marginRight: 4, verticalAlign: '-2px' }} />
            {diffDays === 1 ? 'Expires tomorrow' : `Expires in ${diffDays} days`}
            {' '}({formatDisplayDate(request.validity.split('T')[0])})
          </div>
        );
      })()}

      {/* ── Click to Start Banner ────────────────────────────────────────
          Non-sticky on mobile so it scrolls out of the way and never sits on
          top of the first signature field on short viewports. Desktop keeps
          the sticky pinned banner. 2026-05-27 H4: slim padding — the old
          ~56px strip ate ~10% of an iPhone viewport before the signer had
          read anything. */}
      {!hasStarted && pdfDoc && (
        <div
          className="sm:sticky sm:top-[57px]"
          style={{
            position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'center',
            padding: '6px 0', background: 'var(--brand)', boxShadow: 'var(--sh-2)',
          }}
        >
          <button
            onClick={handleClickToStart}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '4px 16px', borderRadius: 99, border: 0,
              background: 'var(--surface-1)', color: 'var(--brand-ink)',
              font: "600 12px/1.5 'Inter', system-ui, sans-serif", boxShadow: 'var(--sh-2)',
            }}
          >
            <ArrowDown size={14} />
            CLICK TO START
          </button>
        </div>
      )}

      {/* ── PDF Viewer ──────────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', padding: '24px 16px' }} onClick={(e) => {
        // Click on background (or the PDF page itself) deselects the active
        // field. Clicks that originate inside a field box bubble up here too
        // — those carry a [data-field-id] ancestor, so skip them or we'd
        // instantly close the field the user just tapped open.
        if (e.target instanceof Element && e.target.closest('[data-field-id]')) return;
        setActiveFieldId(null);
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }} data-pdf-container>
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
                highlightedFieldId={highlightedFieldId}
              />
            ))
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
              <span style={{ ...cardBody, margin: '0 0 0 12px' }}>Loading document...</span>
            </div>
          )}
        </div>
      </div>

      {/* Fields list popover — opens above the bottom bar when the user
          clicks the progress indicator. Lets them see every field's fill
          state and jump straight to it. */}
      {showFieldsList && (
        <div
          className="sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-80"
          style={{
            position: 'fixed', bottom: 64, left: 8, right: 8, zIndex: 40,
            maxHeight: 288, overflowY: 'auto',
            background: 'var(--surface-1)', borderRadius: 'var(--r-3, 14px)',
            boxShadow: '0 0 0 1px var(--line-2), var(--sh-4)',
          }}
        >
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid var(--line-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={microStyle}>All fields</span>
            <Button variant="ghost" size="sm" onClick={() => setShowFieldsList(false)} aria-label="Close" iconLeft={<X size={16} />} />
          </div>
          <div style={{ padding: '4px 0' }}>
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
                      // The page column scrolls the BODY, not containerRef
                      // (min-h-screen column never overflows), so
                      // containerRef.scrollTo() was a silent no-op — the
                      // popover jump did nothing. Use scrollIntoView on the
                      // field element like scrollToNextField does, falling
                      // back to the page element for unrendered pages.
                      const fieldEl = containerRef.current?.querySelector(`[data-field-id="${id}"]`);
                      const pageEl = containerRef.current?.querySelectorAll('[data-page-index]')?.[item.page || 0];
                      const target = fieldEl || pageEl;
                      if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        highlightField(id);
                        setTimeout(() => {
                          if (item.type === 'signature' || item.type === 'initials') {
                            handleOpenSignaturePad(id, item.type);
                          } else {
                            setActiveFieldId(id);
                          }
                        }, 350);
                      }
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 16px', textAlign: 'left', cursor: 'pointer',
                      background: 'none', border: 0,
                    }}
                  >
                    <span style={{ width: 6, height: 12, borderRadius: 3, background: filled ? 'var(--brand)' : 'var(--line-strong)' }} />
                    <ItemIcon size={14} style={{ color: 'var(--fg-4)' }} />
                    <span style={{
                      flex: 1, font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.label || meta.label}
                      <span style={{ color: 'var(--fg-4)' }}> · p{(item.page || 0) + 1}</span>
                    </span>
                    {filled
                      ? <Check size={14} style={{ color: 'var(--brand-ink)' }} />
                      : <span style={{ font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>empty</span>}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Bottom Bar ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 30,
        background: 'var(--surface-1)', borderTop: '1px solid var(--line-2)',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.06)',
      }}>
        {/* gap-2/px-2 below sm: the full-width labels + gap-4 overflow a
            320-390px viewport (envelope mode's "Sign & Next Document" made
            even 375px overflow), pushing Sign & Submit off-screen. */}
        <div
          className="sm:px-4 sm:gap-4"
          style={{
            maxWidth: 1152, margin: '0 auto', padding: '12px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}
        >
          {/* Left: Refuse */}
          <Button
            variant="ghost"
            onClick={() => setShowRefuseConfirm(true)}
            disabled={refusing}
            style={{ color: 'var(--danger)', flexShrink: 0 }}
            iconLeft={refusing ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            <span className="hidden sm:inline">{refusing ? 'Refusing...' : 'Refuse to Sign'}</span>
            <span className="sm:hidden">{refusing ? '' : 'Refuse'}</span>
          </Button>

          {/* Zoom controls — pinch-zooming detaches the sticky bars from the
              visual viewport, so mobile needs in-app zoom buttons too. */}
          <div className="sm:mr-2" style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--fg-3)' }}>
            <Button
              variant="ghost" size="sm" title="Zoom out" aria-label="Zoom out"
              onClick={() => setUserZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              disabled={userZoom <= 0.5}
            >
              −
            </Button>
            <Button
              variant="ghost" size="sm" title="Reset zoom"
              onClick={() => setUserZoom(1)}
              style={{ fontVariantNumeric: 'tabular-nums', minWidth: 48 }}
            >
              {Math.round(userZoom * 100)}%
            </Button>
            <Button
              variant="ghost" size="sm" title="Zoom in" aria-label="Zoom in"
              onClick={() => setUserZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
              disabled={userZoom >= 2}
            >
              +
            </Button>
          </div>

          {/* Center: Progress + Next Field */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!allRequiredFilled && (
              <Button
                variant="secondary" size="sm"
                onClick={() => scrollToNextField(activeFieldId)}
                iconLeft={<ArrowRight size={14} />}
                style={{ borderRadius: 99 }}
              >
                {/* A bare arrow was the only label on phones — the primary
                    mobile control deserves a word. */}
                <span className="hidden sm:inline">Next Field</span>
                <span className="sm:hidden">Next</span>
              </Button>
            )}
            <button
              onClick={() => setShowFieldsList((v) => !v)}
              title="See all fields and jump"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                background: 'none', border: 0, padding: 0,
                font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: allRequiredFilled ? 'var(--brand)' : 'var(--warn-ink)' }} />
                <span className="hidden sm:inline">
                  {filledTotalCount} of {totalFieldCount} field{totalFieldCount !== 1 ? 's' : ''}
                </span>
                <span className="sm:hidden" style={{ fontSize: 12 }}>
                  {filledTotalCount}/{totalFieldCount}
                </span>
              </span>
              <span className="hidden sm:block" style={{ width: 80, height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <span style={{
                  display: 'block', height: '100%', borderRadius: 99, background: 'var(--brand)',
                  transition: 'width 300ms var(--e-out)',
                  width: totalFieldCount > 0 ? `${(filledTotalCount / totalFieldCount) * 100}%` : '0%',
                }} />
              </span>
            </button>
          </div>

          {/* Right: Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ flexShrink: 0 }}
            iconLeft={submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          >
            {submitting ? 'Submitting...'
              : envelope && currentDocIndex < envelope.totalDocuments - 1 ? (
                <>
                  <span className="hidden sm:inline">Sign &amp; Next Document</span>
                  <span className="sm:hidden">Sign &amp; Next</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Sign &amp; Submit</span>
                  <span className="sm:hidden">Sign</span>
                </>
              )}
          </Button>
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

      {/* ── Refuse Modal — captures the required reason ──────────────────
          Deliberately NOT ds `ConfirmDialog`: refusal requires a typed
          reason of at least 3 characters, and the confirm button stays
          disabled until it is present. That is a form, not a confirmation. */}
      {showRefuseConfirm && (
        <div data-theme="light" style={{
          position: 'fixed', inset: 0, zIndex: 70, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--scrim)',
        }}>
          <div style={{
            background: 'var(--surface-1)', borderRadius: 'var(--r-3, 14px)',
            boxShadow: 'var(--sh-4)', width: '100%', maxWidth: 448, padding: 24,
          }}>
            <h3 style={{ font: "600 17px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 8px' }}>
              Refuse to Sign
            </h3>
            <p style={{ ...cardBody, margin: '0 0 16px' }}>
              The sender will be notified of your decision along with the reason
              you provide below. This action cannot be undone.
            </p>
            <Field label="Reason for refusal" required htmlFor="refuse-reason">
              <Textarea
                id="refuse-reason"
                value={refuseReason}
                onChange={(e) => setRefuseReason(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="e.g. I don't agree to clause 4.2 / the rate is incorrect / wrong candidate"
                style={{ resize: 'none', fontSize: 16 }}
                autoFocus
                disabled={refusing}
              />
            </Field>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...cardMeta, margin: 0 }}>{refuseReason.length}/500</span>
              <span style={{ ...cardMeta, margin: 0 }}>Required for legal record</span>
            </div>
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                variant="secondary" type="button" disabled={refusing}
                onClick={() => { setShowRefuseConfirm(false); setRefuseReason(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="danger" type="button"
                onClick={handleRefuse}
                disabled={refusing || refuseReason.trim().length < 3}
              >
                {refusing ? 'Refusing…' : 'Refuse to Sign'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signature Reuse Prompt ──────────────────────────────────── */}
      {sigReusePrompt.open && (
        <div data-theme="light" style={{
          position: 'fixed', inset: 0, zIndex: 60, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)',
        }}>
          <div style={{
            background: 'var(--surface-1)', borderRadius: 'var(--r-3, 14px)',
            boxShadow: 'var(--sh-4)', width: '100%', maxWidth: 384, margin: 16, padding: 24,
          }}>
            <h3 style={{ font: "600 15px/1.36 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 8px' }}>
              {sigReusePrompt.type === 'initials' ? 'Reuse Initials?' : 'Reuse Signature?'}
            </h3>
            <p style={{ ...cardBody, margin: '0 0 20px' }}>
              You already have a {sigReusePrompt.type === 'initials' ? 'initials' : 'signature'} on file. Would you like to reuse it or draw a new one?
            </p>
            {sigDataUrls[sigReusePrompt.type] && (
              // Paper white — this is the artwork that lands on the document.
              <div style={{
                marginBottom: 16, padding: 12, background: '#ffffff',
                borderRadius: 'var(--r-2, 12px)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img
                  src={sigDataUrls[sigReusePrompt.type]}
                  alt="Existing"
                  style={{ maxHeight: 64, objectFit: 'contain' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Button block onClick={handleReuseExisting}>Use Existing</Button>
              <Button block variant="secondary" onClick={handleDrawNew}>Draw New</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ────────────────────────────────────────── */}
      {toast && (
        <div data-theme="light" style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
          padding: '12px 20px', borderRadius: 'var(--r-2, 12px)', boxShadow: 'var(--sh-3)',
          display: 'flex', alignItems: 'center', gap: 8,
          font: "550 13px/1.4 'Inter', system-ui, sans-serif",
          background:
            toast.type === 'warning' ? 'var(--warn-soft)'
            : toast.type === 'error' ? 'var(--danger-soft)'
            : toast.type === 'success' ? 'var(--brand-soft)'
            : 'var(--surface-1)',
          color:
            toast.type === 'warning' ? 'var(--warn-ink)'
            : toast.type === 'error' ? 'var(--danger)'
            : toast.type === 'success' ? 'var(--brand-ink)'
            : 'var(--fg-2)',
        }}>
          {toast.type === 'warning' && <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
          {toast.type === 'success' && <Check size={16} style={{ flexShrink: 0 }} />}
          {toast.message}
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            style={{ marginLeft: 8, cursor: 'pointer', background: 'none', border: 0, padding: 0, color: 'currentColor', opacity: 0.6 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Compliance Footer ─────────────────────────────────────────── */}
      {/* --fg-3, not --fg-4: this footer sits on the page's --bg, not on a
          --surface-1 card. Same token, different backdrop — check the
          surface, not just the token. */}
      <div style={{ marginTop: 24, padding: '16px 0', borderTop: '1px solid var(--line-2)', textAlign: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
        }}>
          <Shield size={13} />
          <span>Compliant with eIDAS (EU), ESIGN Act (US) &amp; UETA</span>
        </div>
      </div>
    </div>
  );
}

const summaryRow = {
  display: 'flex', justifyContent: 'space-between', gap: 12,
  font: "450 13px/1.5 'Inter', system-ui, sans-serif",
};
