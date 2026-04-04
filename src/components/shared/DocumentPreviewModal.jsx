import { useState, useEffect } from 'react';
import { FileText, Eye, Download, X, Loader2 } from 'lucide-react';

/**
 * Shared document preview modal — displays PDFs and images in a large centered popup.
 *
 * Supports two modes:
 *  1. **Auth-fetched** (default): Fetches file via Bearer token from `fetchUrl`.
 *  2. **Direct URL**: Uses `directUrl` for publicly-accessible files (e.g. Cloudinary).
 *
 * @param {{ filename: string, mimeType?: string, fetchUrl?: string, directUrl?: string, onClose: () => void }} props
 */
export default function DocumentPreviewModal({ filename, mimeType, fetchUrl, directUrl, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  useEffect(() => {
    let revoke = null;

    if (directUrl) {
      // Direct URL mode — no fetch needed for images, but for PDF we still use it directly
      setBlobUrl(directUrl);
      setLoading(false);
    } else if (fetchUrl) {
      // Auth-fetched mode
      const token = localStorage.getItem('rivvra_token');
      fetch(fetchUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed');
          return res.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          revoke = url;
          setBlobUrl(url);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setError(true);
    }

    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [fetchUrl, directUrl]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'document';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
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
            <p className="text-dark-500 text-sm">Failed to load preview</p>
          ) : isImage ? (
            <img src={blobUrl} alt={filename} className="max-w-full max-h-full object-contain p-4" />
          ) : isPdf ? (
            <iframe src={blobUrl} className="w-full h-full" title={filename} />
          ) : (
            <p className="text-dark-500 text-sm">Preview not available for this file type</p>
          )}
        </div>
      </div>
    </div>
  );
}
