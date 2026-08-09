// ============================================================================
// PolicyReaderModal — read-then-acknowledge reader for a company policy
// ============================================================================
// Renders the policy PDF inline (PDF.js, all pages stacked + scrollable) with a
// read-progress bar. When the policy requires acknowledgment, "I acknowledge"
// stays locked until the reader has scrolled to the end AND ticked the
// "I have read and understood" box — so an acknowledgment means the document was
// actually seen. Non-PDF files fall back to a download stub (scroll gate n/a).
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck, FileText, Download, X, Loader2, CheckCircle2, AlertTriangle, ArrowDown, Check,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/config';
import { downloadFile } from '../../utils/download';

export default function PolicyReaderModal({ policy, orgSlug, onAcknowledge, onClose, showToast }) {
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      {/* Phones get a full-screen sheet (h-dvh tracks iOS Safari's collapsing
          chrome so the acknowledge footer is never hidden); sm+ keeps the
          centered 88vh dialog. */}
      <div className="bg-dark-800 border border-dark-700 rounded-none sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden h-full h-dvh sm:h-[88vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-3.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-rivvra-500/15 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-rivvra-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-medium truncate">{policy.title}</p>
              <span className="text-xs px-2 py-0.5 rounded bg-dark-700 text-dark-300">{policy.category}</span>
              {done ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Acknowledged</span>
              ) : required ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300"><AlertTriangle className="w-3 h-3" /> Action required</span>
              ) : null}
            </div>
            <p className="text-dark-500 text-xs mt-0.5 truncate">{policy.fileName}</p>
          </div>
          {isPdf && !error && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
                disabled={zoom <= 1}
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Zoom out"
              ><ZoomOut className="w-5 h-5" /></button>
              <button
                onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(2)))}
                disabled={zoom >= 3}
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Zoom in"
              ><ZoomIn className="w-5 h-5" /></button>
            </div>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {/* Read-progress bar */}
        <div className="h-1 bg-dark-700 flex-shrink-0">
          <div className="h-full bg-rivvra-500 transition-all duration-150" style={{ width: `${Math.max(4, progress)}%` }} />
        </div>

        {/* Document */}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overflow-x-auto bg-dark-900/60 p-2 sm:p-4">
          {loading && (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-dark-500" /></div>
          )}
          {error && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <FileText className="w-10 h-10 text-dark-600 mb-3" />
              <p className="text-dark-400 text-sm mb-3">Couldn’t load an inline preview.</p>
              <button onClick={handleDownload} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium"><Download className="w-4 h-4" /> Download to read</button>
            </div>
          )}
          {!isPdf && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <FileText className="w-12 h-12 text-sky-400 mb-3" />
              <p className="text-white font-medium mb-1">{policy.fileName}</p>
              <p className="text-dark-400 text-sm mb-4">Inline preview isn’t available for this file type. Download to read it, then acknowledge below.</p>
              <button onClick={handleDownload} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium"><Download className="w-4 h-4" /> Download to read</button>
            </div>
          )}
          <div ref={canvasHostRef} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-dark-700/60 flex-shrink-0">
          {required && !done && (
            <div className="flex items-center gap-2 text-sm mb-3">
              {reachedEnd ? (
                <><Check className="w-4 h-4 text-emerald-400" /><span className="text-emerald-300">You’ve read the full policy</span></>
              ) : (
                <><ArrowDown className="w-4 h-4 text-dark-400" /><span className="text-dark-400">Scroll to the end to acknowledge</span></>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {required && !done ? (
              <label className={`flex items-center gap-2 text-sm ${reachedEnd ? 'text-dark-200 cursor-pointer' : 'text-dark-500 cursor-not-allowed'}`}>
                <input type="checkbox" disabled={!reachedEnd} checked={checked} onChange={(e) => setChecked(e.target.checked)} className="accent-rivvra-500 w-4 h-4" />
                I have read and understood this policy
              </label>
            ) : <span />}
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-700"><Download className="w-4 h-4" /> Download</button>
              {required && !done ? (
                <button onClick={handleAck} disabled={!canAck} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-rivvra-500 hover:bg-rivvra-600 text-white disabled:bg-dark-700 disabled:text-dark-500 disabled:cursor-not-allowed">
                  {acking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  I acknowledge
                </button>
              ) : (
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-700 hover:bg-dark-600 text-white">Close</button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body,
  );
}
