import { useState, useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import { Loader2, Upload, FileText, X } from 'lucide-react';

export default function AssignmentDocs({ orgSlug, employeeId, assignmentIdx }) {
  const { showToast } = useToast();
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const fileRef = useRef(null);

  const fetchDocs = () => {
    if (!orgSlug || !employeeId) return;
    employeeApi.listAssignmentDocs(orgSlug, employeeId, assignmentIdx)
      .then(res => { if (res.success) setDocs(res.documents || []); })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  };

  useEffect(() => { fetchDocs(); }, [orgSlug, employeeId, assignmentIdx]);

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'image/jpg'];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('File too large. Maximum size is 5MB.', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('File type not allowed. Allowed: PDF, DOCX, XLSX, PNG, JPEG.', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      await employeeApi.uploadAssignmentDoc(orgSlug, employeeId, assignmentIdx, file);
      fetchDocs();
    } catch (err) {
      console.error('Upload failed:', err);
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (docId) => {
    try {
      await employeeApi.deleteAssignmentDoc(orgSlug, employeeId, docId);
      setDocs(prev => prev.filter(d => d._id !== docId));
    } catch (err) {
      console.error('Delete failed:', err);
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const handleDownload = async (doc) => {
    try {
      const url = employeeApi.getAssignmentDocUrl(orgSlug, employeeId, doc._id);
      const token = localStorage.getItem('rivvra_token');
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div>
      <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2">Documents</p>
      {loadingDocs ? (
        <div className="flex items-center gap-2 text-dark-500 text-xs py-1">
          <Loader2 size={12} className="animate-spin" /> Loading...
        </div>
      ) : (
        <>
          {docs.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {docs.map(doc => (
                <div key={doc._id} className="flex items-center gap-2 bg-dark-900/50 rounded-lg px-3 py-1.5 group">
                  <FileText size={14} className="text-dark-400 flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="text-xs text-blue-400 hover:underline truncate flex-1 text-left"
                  >
                    {doc.filename}
                  </button>
                  <span className="text-[10px] text-dark-500">{formatSize(doc.size)}</span>
                  <button type="button" onClick={() => handleDelete(doc._id)} className="p-0.5 text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" onChange={handleUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-dark-400 hover:text-white transition-colors"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? 'Uploading...' : '+ Upload Document'}
          </button>
        </>
      )}
    </div>
  );
}
