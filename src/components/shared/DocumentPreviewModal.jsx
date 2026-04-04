import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Eye, Download, X, Loader2 } from 'lucide-react';

/**
 * Shared document preview modal — displays PDFs and images in a large centered popup.
 *
 * Props:
 *  - filename: string
 *  - mimeType: string (e.g. 'application/pdf', 'image/png')
 *  - fetchUrl: string — auth-fetched URL (Bearer token added automatically)
 *  - directUrl: string — publicly-accessible URL (e.g. Cloudinary)
 *  - onClose: () => void
 *
 * For images: directUrl is used directly (Cloudinary allows <img> cross-origin).
 * For PDFs: fetchUrl is always preferred (proxied through our API) because
 * Cloudinary blocks iframe embedding via X-Frame-Options. Falls back to directUrl
 * only if fetchUrl is not provided.
 */
export default function DocumentPreviewModal({ filename, mimeType, fetchUrl, directUrl, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [triedDirect, setTriedDirect] = useState(false);

  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  const fetchAsBlob = useCallback((url, headers = {}) => {
    setLoading(true);
    setError(false);
    let revoke = null;
    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) throw new Error('API error');
        return res.blob();
      })
      .then(blob => {
        if (!blob.size) throw new Error('Empty');
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

    if (directUrl && isImage) {
      // Images work fine with direct Cloudinary URLs
      setBlobUrl(directUrl);
      setLoading(false);
    } else if (fetchUrl) {
      // For PDFs (and when fetchUrl is available), always use the proxy
      // because Cloudinary blocks iframe embedding via X-Frame-Options
      const token = localStorage.getItem('rivvra_token');
      cleanup = fetchAsBlob(fetchUrl, token ? { Authorization: `Bearer ${token}` } : {});
    } else if (directUrl) {
      // Fallback: use directUrl if no fetchUrl (images already handled above)
      setBlobUrl(directUrl);
      setLoading(false);
      setTriedDirect(true);
    } else {
      setLoading(false);
      setError(true);
    }

    return () => { if (cleanup) cleanup(); };
  }, [fetchUrl, directUrl, fetchAsBlob, isImage]);

  // Fallback: if direct URL iframe fails, try fetching via proxy
  const handleIframeError = useCallback(() => {
    if (triedDirect && fetchUrl) {
      console.log('[DocumentPreview] Direct URL failed, trying proxy fetch...');
      const token = localStorage.getItem('rivvra_token');
      fetchAsBlob(fetchUrl, token ? { Authorization: `Bearer ${token}` } : {});
      setTriedDirect(false); // prevent infinite loop
    } else {
      setError(true);
    }
  }, [triedDirect, fetchUrl, fetchAsBlob]);

  const handleDownload = () => {
    if (!blobUrl) return;
    // For direct URLs, open in new tab (can't trigger download cross-origin)
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
            {blobUrl && (
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
          {loading ? (
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
            <iframe
              src={blobUrl}
              className="w-full h-full"
              title={filename}
              onError={handleIframeError}
            />
          ) : (
            <p className="text-dark-500 text-sm">Preview not available for this file type</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
