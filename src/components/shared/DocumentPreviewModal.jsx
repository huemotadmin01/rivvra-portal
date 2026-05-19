import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Eye, Download, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Shared document preview modal — displays PDFs and images in a large centered popup.
 *
 * Props:
 *  - filename: string
 *  - mimeType: string (e.g. 'application/pdf', 'image/png')
 *  - fetchUrl: string — auth-fetched URL (Bearer token added automatically)
 *  - directUrl: string — publicly-accessible URL (e.g. Cloudinary)
 *  - pdfRenderer: 'iframe' | 'canvas' (default 'iframe'). 'canvas' uses
 *    PDF.js to render pages to a canvas, sidestepping Chrome's
 *    iframe-blob-PDF quirks. Recommended for any caller using fetchUrl
 *    backed by a proxy/blob path.
 *  - onClose: () => void
 *
 * For images: directUrl is used directly (Cloudinary allows <img> cross-origin).
 * For PDFs (iframe mode): fetchUrl is always preferred (proxied through our API)
 * because Cloudinary blocks iframe embedding via X-Frame-Options.
 */
export default function DocumentPreviewModal({ filename, mimeType, fetchUrl, directUrl, pdfRenderer = 'iframe', onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [triedDirect, setTriedDirect] = useState(false);

  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const useCanvas = isPdf && pdfRenderer === 'canvas';

  const fetchAsBlob = useCallback((url, headers = {}) => {
    setLoading(true);
    setError(false);
    let revoke = null;
    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) throw new Error('API error — got JSON instead of file');
        return res.blob();
      })
      .then(blob => {
        if (!blob.size) throw new Error('Empty blob');
        const type = blob.type || mimeType || 'application/octet-stream';
        const file = new File([blob], filename || 'document', { type });
        revoke = URL.createObjectURL(file);
        setBlobUrl(revoke);
      })
      .catch(err => {
        console.error('[DocumentPreview] Fetch failed:', err.message, url);
        setError(true);
      })
      .finally(() => setLoading(false));

    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [filename, mimeType]);

  useEffect(() => {
    let cleanup = null;

    if (useCanvas) {
      // PdfCanvasViewer handles its own loading from fetchUrl/directUrl.
      setLoading(false);
      return undefined;
    }

    if (directUrl && isImage) {
      setBlobUrl(directUrl);
      setLoading(false);
    } else if (fetchUrl) {
      const token = localStorage.getItem('rivvra_token');
      cleanup = fetchAsBlob(fetchUrl, token ? { Authorization: `Bearer ${token}` } : {});
    } else if (directUrl) {
      setBlobUrl(directUrl);
      setLoading(false);
      setTriedDirect(true);
    } else {
      setLoading(false);
      setError(true);
    }

    return () => { if (cleanup) cleanup(); };
  }, [fetchUrl, directUrl, fetchAsBlob, isImage, useCanvas]);

  const handleIframeError = useCallback(() => {
    if (triedDirect && fetchUrl) {
      const token = localStorage.getItem('rivvra_token');
      fetchAsBlob(fetchUrl, token ? { Authorization: `Bearer ${token}` } : {});
      setTriedDirect(false);
    } else {
      setError(true);
    }
  }, [triedDirect, fetchUrl, fetchAsBlob]);

  const handleDownload = () => {
    if (useCanvas) {
      // Canvas mode: open via fetchUrl with auth, or directUrl as a last resort.
      if (fetchUrl) {
        const token = localStorage.getItem('rivvra_token');
        fetch(fetchUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          .then((r) => r.blob())
          .then((b) => {
            const u = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = u; a.download = filename || 'document'; a.click();
            setTimeout(() => URL.revokeObjectURL(u), 5000);
          })
          .catch(() => directUrl && window.open(directUrl, '_blank'));
        return;
      }
      if (directUrl) window.open(directUrl, '_blank');
      return;
    }
    if (!blobUrl) return;
    if (directUrl && blobUrl === directUrl) {
      window.open(directUrl, '_blank');
      return;
    }
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'document';
    a.click();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-5xl mx-4 shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
              {isImage ? <Eye size={14} className="text-blue-400" /> : <FileText size={14} className="text-red-400" />}
            </div>
            <p className="text-sm text-white font-medium truncate">{filename}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(blobUrl || useCanvas) && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
                title="Download"
              >
                <Download size={14} /> Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 bg-dark-900/50 flex items-center justify-center overflow-hidden">
          {useCanvas ? (
            <PdfCanvasViewer fetchUrl={fetchUrl} directUrl={directUrl} onError={() => setError(true)} />
          ) : loading ? (
            <Loader2 size={28} className="animate-spin text-dark-500" />
          ) : error ? (
            <div className="text-center">
              <p className="text-dark-500 text-sm mb-3">Failed to load preview</p>
              {(directUrl || fetchUrl) && (
                <a
                  href={directUrl || fetchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rivvra-400 hover:text-rivvra-300 text-sm underline"
                >
                  Open in new tab
                </a>
              )}
            </div>
          ) : isImage ? (
            <img src={blobUrl} alt={filename} className="max-w-full max-h-full object-contain p-4" />
          ) : isPdf ? (
            <object data={blobUrl} type="application/pdf" className="w-full h-full" aria-label={filename}>
              <iframe
                src={blobUrl}
                className="w-full h-full"
                title={filename}
                onError={handleIframeError}
              />
            </object>
          ) : (
            <p className="text-dark-500 text-sm">Preview not available for this file type</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// PDF.js-based viewer. Used when `pdfRenderer="canvas"` — sidesteps Chrome's
// iframe-blob-PDF rendering quirks by drawing every page to a canvas. Worker
// is bundled via Vite's ?url asset import so we don't need a CDN.
function PdfCanvasViewer({ fetchUrl, directUrl, onError }) {
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const canvasRef = useRef(null);

  // Load PDF.js + the document.
  useEffect(() => {
    let cancelled = false;
    let task = null;
    let timeoutId;
    const LOAD_TIMEOUT_MS = 30000;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

        let data;
        if (fetchUrl) {
          const token = localStorage.getItem('rivvra_token');
          const resp = await fetch(fetchUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          data = await resp.arrayBuffer();
        } else if (directUrl) {
          const resp = await fetch(directUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          data = await resp.arrayBuffer();
        } else {
          throw new Error('No URL provided');
        }
        if (cancelled) return;

        task = pdfjsLib.getDocument({ data });
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('PDF load timed out')), LOAD_TIMEOUT_MS);
        });
        const doc = await Promise.race([task.promise, timeoutPromise]);
        clearTimeout(timeoutId);
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        clearTimeout(timeoutId);
        try { task?.destroy(); } catch {/* ignore */}
        if (!cancelled) {
          const msg = err?.message === 'PDF load timed out'
            ? 'PDF took too long to load — try Download instead.'
            : (err?.message || 'Failed to load PDF');
          setErrMsg(msg);
          onError?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; clearTimeout(timeoutId); try { task?.destroy(); } catch {/* */} };
  }, [fetchUrl, directUrl, onError]);

  // Render the current page to canvas.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const containerWidth = containerRef.current?.clientWidth || 800;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.min((containerWidth - 32) / unscaled.width, 2);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error('[PdfCanvasViewer] render failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  if (loading) {
    return <Loader2 size={28} className="animate-spin text-dark-500" />;
  }
  if (errMsg) {
    return <p className="text-dark-500 text-sm px-6 text-center">{errMsg}</p>;
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-auto flex items-start justify-center py-4">
        <canvas ref={canvasRef} className="shadow-lg bg-white" />
      </div>
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-dark-700/50 bg-dark-900/60">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded text-dark-300 hover:text-white hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-dark-300 tabular-nums">Page {currentPage} of {numPages}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded text-dark-300 hover:text-white hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
