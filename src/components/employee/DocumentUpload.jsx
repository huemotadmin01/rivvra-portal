import { useState, useEffect, useRef } from 'react';
import employeeApi from '../../utils/employeeApi';
import { Upload, FileText, X, Loader2 } from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/jpg',
];

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Reusable document upload component for employee documents.
 *
 * @param {string}  orgSlug         - Org slug for API calls
 * @param {string}  [employeeId]    - Employee ID (admin mode). If null, uses self-service /my-documents endpoints.
 * @param {string}  category        - 'bank_proof' | 'education_certificate' | 'id_document' | 'other'
 * @param {number}  [educationIndex] - Education array index (required for education_certificate)
 * @param {boolean} required        - Show required indicator
 * @param {string}  label           - Display label
 * @param {boolean} [hasError]      - External error state (red border)
 * @param {Function} onDocumentsChange - Called with current doc list whenever it changes
 */
export default function DocumentUpload({
  orgSlug, employeeId = null, category, educationIndex = null,
  required = false, label = 'Upload Document', hasError = false,
  onDocumentsChange,
}) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const isSelfService = !employeeId;

  // Fetch existing documents on mount
  const fetchDocs = async () => {
    if (!orgSlug) return;
    try {
      const res = isSelfService
        ? await employeeApi.listMyDocs(orgSlug, category, educationIndex)
        : await employeeApi.listEmployeeDocs(orgSlug, employeeId, category, educationIndex);
      const fetchedDocs = res.success ? (res.documents || []) : [];
      setDocs(fetchedDocs);
      onDocumentsChange?.(fetchedDocs);
    } catch (_) {
      // Silently fail — empty list is safe default
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, [orgSlug, employeeId, category, educationIndex]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Client-side validation
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum 5MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('File type not allowed. Use PDF, DOCX, XLSX, PNG, or JPEG.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const res = isSelfService
        ? await employeeApi.uploadMyDoc(orgSlug, file, category, null, educationIndex)
        : await employeeApi.uploadEmployeeDoc(orgSlug, employeeId, file, category, null, educationIndex);
      if (res.success && res.document) {
        const newDocs = [res.document, ...docs];
        setDocs(newDocs);
        onDocumentsChange?.(newDocs);
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (docId) => {
    try {
      const res = isSelfService
        ? await employeeApi.deleteMyDoc(orgSlug, docId)
        : await employeeApi.deleteEmployeeDoc(orgSlug, employeeId, docId);
      if (res.success) {
        const newDocs = docs.filter(d => d._id !== docId);
        setDocs(newDocs);
        onDocumentsChange?.(newDocs);
      }
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const borderColor = hasError && docs.length === 0
    ? 'border-red-500/40 bg-red-500/5'
    : 'border-dark-700';

  return (
    <div>
      {/* Label */}
      <p className="text-xs font-medium text-dark-300 mb-2">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </p>

      {/* Uploaded docs list */}
      {docs.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {docs.map(doc => (
            <div key={doc._id} className="flex items-center gap-2 bg-dark-900/50 rounded-lg px-3 py-2 group">
              <FileText size={14} className="text-dark-400 flex-shrink-0" />
              <span className="text-xs text-dark-200 truncate flex-1">{doc.filename}</span>
              <span className="text-[10px] text-dark-500">{formatSize(doc.size)}</span>
              <button
                type="button"
                onClick={() => handleDelete(doc._id)}
                className="opacity-0 group-hover:opacity-100 text-dark-500 hover:text-red-400 transition-all"
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {loading ? (
        <div className="flex items-center gap-2 text-dark-500 text-xs py-2">
          <Loader2 size={12} className="animate-spin" /> Loading documents...
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed ${borderColor} cursor-pointer hover:border-dark-500 hover:bg-dark-800/30 transition-colors`}>
          {uploading ? (
            <>
              <Loader2 size={14} className="animate-spin text-dark-400" />
              <span className="text-xs text-dark-400">Uploading...</span>
            </>
          ) : (
            <>
              <Upload size={14} className="text-dark-500" />
              <span className="text-xs text-dark-400">
                {docs.length === 0 ? 'Click to upload' : 'Upload another file'}
              </span>
              <span className="text-[10px] text-dark-600">(PDF, PNG, JPEG — max 5MB)</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}

      {/* Error message */}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
