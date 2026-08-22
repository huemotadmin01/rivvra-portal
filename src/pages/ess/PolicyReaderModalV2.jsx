// ============================================================================
// PolicyReaderModalV2 — read-then-acknowledge reader for a company policy,
// on ds (phase 6a)
// ============================================================================
// Copied from PolicyReaderModal.jsx. The acknowledgment gate is a compliance
// control, so it is reproduced exactly: "I acknowledge" stays locked until the
// reader has scrolled past 92% AND ticked the box; a document that fits
// without scrolling counts as fully read; non-PDF files skip the scroll gate
// and fall back to a download stub. The PDF.js render loop — the cached
// ArrayBuffer across zoom levels, the buffer copy pdf.js neuters, the
// devicePixelRatio cap — is byte-for-byte the original.
//
// The scroll container's structure is deliberately unchanged: `scrollRef` is
// still the element that scrolls, because the gate is computed from its
// scrollTop. That is why this is NOT built on ds `Modal` — Modal owns its own
// body scroll container, which the gate cannot reach. A full-height reader
// sheet is its own archetype; ds primitives (`Button`, `Chip`, `Spinner`) and
// semantic tokens carry everything else.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck, FileText, Download, X, CheckCircle2, AlertTriangle, ArrowDown, Check,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/config';
import { downloadFile } from '../../utils/download';
import { Button, Chip, Spinner } from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

const iconBtn = (disabled) => ({
  width: 32, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0,
  border: 'none', background: 'transparent', borderRadius: 'var(--r-1)',
  color: 'var(--fg-4)', cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.4 : 1,
});

export default function PolicyReaderModalV2({ policy, orgSlug, onAcknowledge, onClose, showToast }) {
  const fetchUrl = `${API_BASE_URL}/api/org/${orgSlug}/policies/${policy._id}/download`;
  const isPdf = policy.mimeType === 'application/pdf';
  const required = !!policy.acknowledgmentRequired && !policy.acknowledged;

  const scrollRef = useRef(null);
  const canvasHostRef = useRef(null);
  // Raw PDF bytes cached across zoom re-renders so zooming never refetches.
  const pdfDataRef = useRef(null);
  const [loading, setLoading] = useState(isPdf);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [progress, setProgress] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(!isPdf); // non-PDF: no scroll gate
  const [checked, setChecked] = useState(false);
  const [acking, setAcking] = useState(false);
  const [done, setDone] = useState(!!policy.acknowledged);

  // Render the PDF (all pages, stacked) into the scroll container.
  useEffect(() => {
    if (!isPdf) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        let data = pdfDataRef.current;
        if (!data) {
          const token = localStorage.getItem('rivvra_token');
          const resp = await fetch(fetchUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          data = await resp.arrayBuffer();
          pdfDataRef.current = data;
        }
        if (cancelled) return;
        // pdf.js takes ownership of (and neuters) the buffer — hand it a copy.
        const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) return;
        const host = canvasHostRef.current;
        if (!host) return;
        host.innerHTML = '';
        const width = ((host.clientWidth || 700) - 8) * zoom;
        // Render at devicePixelRatio so text stays crisp on phones, where the
        // CSS width is small but the physical pixel density is 3x.
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const unscaled = page.getViewport({ scale: 1 });
          const scale = Math.min(width / unscaled.width, 3);
          // Cap the physical render scale so a long policy at high zoom on a
          // 3x phone doesn't allocate hundreds of MB of canvas memory.
          const viewport = page.getViewport({ scale: Math.min(scale * dpr, 4) });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const cssWidth = Math.round(unscaled.width * scale);
          canvas.style.cssText = `display:block;margin:0 auto 12px;width:${cssWidth}px;${zoom > 1 ? '' : 'max-width:100%;'}background:#fff;border-radius:4px`;
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
        if (cancelled) return;
        setLoading(false);
        // If the whole doc fits without scrolling, there's nothing to scroll —
        // treat it as fully read so a 1-pager isn't un-acknowledgeable.
        requestAnimationFrame(() => {
          const c = scrollRef.current;
          if (c && c.scrollHeight <= c.clientHeight + 8) { setReachedEnd(true); setProgress(100); }
        });
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [fetchUrl, isPdf, zoom]);

  const onScroll = useCallback(() => {
    const c = scrollRef.current;
    if (!c) return;
    const denom = c.scrollHeight - c.clientHeight || 1;
    const pct = Math.min(100, Math.round((c.scrollTop / denom) * 100));
    setProgress(pct);
    if (pct > 92) setReachedEnd(true);
  }, []);

  const handleDownload = async () => {
    try { await downloadFile(`${`/api/org/${orgSlug}/policies/${policy._id}/download`}?download=1`, policy.fileName || 'policy'); }
    catch { showToast?.('Download failed', 'error'); }
  };

  const canAck = required && reachedEnd && checked && !acking;
  const handleAck = async () => {
    if (!canAck) return;
    setAcking(true);
    try {
      await onAcknowledge(policy);
      setDone(true);
    } catch (err) {
      showToast?.(err.message || 'Failed to acknowledge', 'error');
    } finally {
      setAcking(false);
    }
  };

  const stub = (copy) => (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '0 24px',
    }}>
      <FileText size={38} style={{ color: 'var(--fg-4)', marginBottom: 12 }} />
      {copy}
      <Button iconLeft={<Download size={15} />} onClick={handleDownload} style={{ marginTop: 16 }}>
        Download to read
      </Button>
    </div>
  );

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, #04070c 66%, transparent)', backdropFilter: 'blur(3px)',
      }}
    >
      {/* Phones get a full-screen sheet (dvh tracks iOS Safari's collapsing
          chrome so the acknowledge footer is never hidden); wider viewports
          keep the centred 88vh dialog. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 820, height: '100dvh', maxHeight: '100dvh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--surface-1)',
          boxShadow: '0 0 0 1px var(--line-2), var(--sh-4)',
        }}
        className="ds-policy-sheet"
      >
        <style>{`
          @media (min-width: 640px) {
            .ds-policy-sheet { height: 88vh !important; max-height: 88vh !important; border-radius: var(--r-4); }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', flexShrink: 0 }}>
          <span style={{
            width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-2)', background: 'var(--brand-soft)',
          }}>
            <ShieldCheck size={18} style={{ color: 'var(--brand)' }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{
                font: `600 14.5px/1.35 ${FONT}`, color: 'var(--fg)', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {policy.title}
              </p>
              <Chip tone="neutral">{policy.category}</Chip>
              {done ? (
                <Chip tone="brand"><CheckCircle2 size={11} /> Acknowledged</Chip>
              ) : required ? (
                <Chip tone="warn"><AlertTriangle size={11} /> Action required</Chip>
              ) : null}
            </div>
            <p style={{
              font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-4)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {policy.fileName}
            </p>
          </div>
          {isPdf && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
                disabled={zoom <= 1}
                style={iconBtn(zoom <= 1)}
                aria-label="Zoom out"
              ><ZoomOut size={18} /></button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(2)))}
                disabled={zoom >= 3}
                style={iconBtn(zoom >= 3)}
                aria-label="Zoom in"
              ><ZoomIn size={18} /></button>
            </div>
          )}
          <button type="button" onClick={onClose} style={iconBtn(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Read-progress bar */}
        <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${Math.max(4, progress)}%`,
            background: 'var(--brand)', transition: 'width 150ms var(--e-out, ease)',
          }} />
        </div>

        {/* Document — this element IS the scroll gate; do not wrap it. */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'auto',
            background: 'var(--surface-2)', padding: 'clamp(8px, 1.5vw, 16px)',
          }}
        >
          {loading && (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><Spinner size={26} /></div>
          )}
          {error && stub(
            <p style={{ font: `450 13px/1.55 ${FONT}`, color: 'var(--fg-3)' }}>
              Couldn’t load an inline preview.
            </p>
          )}
          {!isPdf && !error && stub(
            <>
              <p style={{ font: `550 14px/1.4 ${FONT}`, color: 'var(--fg)', marginBottom: 4 }}>{policy.fileName}</p>
              <p style={{ font: `450 13px/1.55 ${FONT}`, color: 'var(--fg-3)', maxWidth: '46ch' }}>
                Inline preview isn’t available for this file type. Download to read it, then acknowledge below.
              </p>
            </>
          )}
          <div ref={canvasHostRef} />
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', flexShrink: 0, borderTop: '1px solid var(--line)' }}>
          {required && !done && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, font: `450 12.5px/1.4 ${FONT}` }}>
              {reachedEnd ? (
                <>
                  <Check size={15} style={{ color: 'var(--brand)' }} />
                  <span style={{ color: 'var(--brand)' }}>You’ve read the full policy</span>
                </>
              ) : (
                <>
                  <ArrowDown size={15} style={{ color: 'var(--fg-4)' }} />
                  <span style={{ color: 'var(--fg-3)' }}>Scroll to the end to acknowledge</span>
                </>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {required && !done ? (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, font: `450 13px/1.4 ${FONT}`,
                color: reachedEnd ? 'var(--fg-2)' : 'var(--fg-4)',
                cursor: reachedEnd ? 'pointer' : 'not-allowed',
              }}>
                <input
                  type="checkbox"
                  disabled={!reachedEnd}
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--brand)' }}
                />
                I have read and understood this policy
              </label>
            ) : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <Button variant="ghost" iconLeft={<Download size={15} />} onClick={handleDownload}>
                Download
              </Button>
              {required && !done ? (
                <Button
                  onClick={handleAck}
                  disabled={!canAck}
                  iconLeft={acking ? <Spinner size={15} /> : <CheckCircle2 size={15} />}
                >
                  I acknowledge
                </Button>
              ) : (
                <Button variant="secondary" onClick={onClose}>Close</Button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body,
  );
}
