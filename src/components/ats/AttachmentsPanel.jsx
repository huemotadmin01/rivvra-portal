import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import DocumentPreviewModal from '../shared/DocumentPreviewModal';
import ConfirmDialog from '../shared/ConfirmDialog';
import {
  Upload, File, FileText, Image, Trash2, Loader2, Download,
  Star, Eye, Paperclip,
} from 'lucide-react';

const MIME_ICONS = {
  'application/pdf': FileText,
  'image/': Image,
};

function getFileIcon(mimeType) {
  if (!mimeType) return File;
  for (const [prefix, Icon] of Object.entries(MIME_ICONS)) {
    if (mimeType.startsWith(prefix)) return Icon;
  }
  return File;
}

function isPreviewable(mimeType) {
  return mimeType?.startsWith('image/') || mimeType === 'application/pdf';
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  if (!d) return '—';
  // Browser locale (undefined) — platform convention; hardcoding 'en-US'
  // clashed with the viewer-locale dates elsewhere in ATS.
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * AttachmentsPanel — drag-and-drop file upload + list for an application.
 * Props:
 *  - orgSlug: string
 *  - applicationId: string
 *  - readOnly: boolean (optional)
 */
export default function AttachmentsPanel({ orgSlug, applicationId, readOnly = false }) {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  // 2026-05-17 health-check D.2: styled confirm for attachment delete.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!orgSlug || !applicationId) return;
    try {
      setLoading(true);
      const res = await atsApi.listAttachments(orgSlug, applicationId);
      if (res.success) setAttachments(res.attachments || []);
    } catch {
      showToast('Failed to load attachments', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, applicationId, showToast]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let uploaded = 0;
    // Per-file try/catch — one failed upload used to abort the whole loop,
    // silently dropping every remaining file with no per-file feedback.
    const failures = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        showToast(`${file.name} exceeds 10 MB limit`, 'error');
        continue;
      }
      try {
        await atsApi.uploadAttachment(orgSlug, applicationId, file);
        uploaded += 1;
      } catch (err) {
        failures.push(file.name);
      }
    }
    if (failures.length > 0) {
      showToast(`Failed to upload: ${failures.join(', ')}`, 'error');
    }
    // Only toast success for files that actually uploaded — when every
    // file was skipped by the size guard this used to say "File uploaded".
    if (uploaded > 0) {
      showToast(uploaded === 1 ? 'File uploaded' : `${uploaded} files uploaded`);
      fetchAttachments();
    }
    setUploading(false);
  };

  const handleToggleResume = async (att) => {
    try {
      await atsApi.toggleResume(orgSlug, att._id);
      showToast(att.isResume ? 'Unmarked as resume' : 'Marked as resume');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    }
  };

  const handleDelete = (att) => {
    setConfirmDelete(att);
  };
  const performDelete = async (att) => {
    setConfirmBusy(true);
    try {
      const res = await atsApi.deleteAttachment(orgSlug, att._id);
      if (!res.success) { showToast(res.error || 'Failed to delete attachment', 'error'); return; }
      showToast('Attachment deleted');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    if (!readOnly) handleUpload(e.dataTransfer.files);
  };

  // Download through the authenticated /download proxy instead of linking the
  // raw Cloudinary URL. The proxy returns the correct Content-Type, and saving
  // the blob with an explicit `download={fileName}` forces the real extension.
  // Linking att.url directly handed the browser an extension-less octet-stream
  // for migrated résumés (filename "app-<id>-att-<id>") — Word docs then opened
  // as markup/HTML because the OS couldn't tell they were .docx.
  const handleDownload = async (att) => {
    try {
      const token = localStorage.getItem('rivvra_token');
      const res = await fetch(atsApi.getAttachmentDownloadUrl(orgSlug, att._id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      showToast(err.message || 'Download failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-dark-400" />
        <span className="text-dark-400 text-sm">Loading attachments...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip size={14} className="text-dark-400" />
          <span className="text-sm font-medium text-dark-300">Attachments</span>
          <span className="text-xs bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded-full">
            {attachments.length}
          </span>
        </div>
      </div>

      {/* Dropzone */}
      {!readOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-rivvra-500 bg-rivvra-500/5'
              : 'border-dark-600 hover:border-dark-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-rivvra-400" />
              <span className="text-dark-300 text-sm">Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-dark-500 mx-auto mb-2" />
              <p className="text-dark-300 text-sm">
                Drag & drop files here, or <span className="text-rivvra-400">click to browse</span>
              </p>
              <p className="text-dark-500 text-xs mt-1">Max 10 MB per file</p>
            </>
          )}
        </div>
      )}

      {/* File list */}
      {attachments.length === 0 ? (
        <p className="text-dark-500 text-xs py-2">No files uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att) => {
            const FileIcon = getFileIcon(att.mimeType);
            const canPreview = isPreviewable(att.mimeType);
            return (
              <div
                key={att._id}
                className="flex items-center gap-3 bg-dark-800/50 border border-dark-700/50 rounded-lg px-3 py-2.5 group"
              >
                <FileIcon size={16} className="text-dark-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => canPreview ? setPreviewDoc(att) : handleDownload(att)}
                      className="text-sm text-white hover:text-rivvra-400 truncate transition-colors text-left"
                    >
                      {att.fileName}
                    </button>
                    {att.isResume && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                        Resume
                      </span>
                    )}
                  </div>
                  <p className="text-dark-500 text-xs">
                    {formatSize(att.size)} · {formatDate(att.createdAt)}
                    {att.uploaderName && ` · ${att.uploaderName}`}
                  </p>
                </div>
                {/* group-focus-within keeps the actions reachable by keyboard —
                    hover-only opacity hid them from Tab navigation. */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
                  {canPreview && (
                    <button
                      onClick={() => setPreviewDoc(att)}
                      className="p-1 rounded text-dark-400 hover:text-rivvra-400 hover:bg-dark-700 transition-colors"
                      title="Preview"
                    >
                      <Eye size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDownload(att)}
                    className="p-1 rounded text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                    title="Download"
                  >
                    <Download size={13} />
                  </button>
                  {!readOnly && (
                    <>
                      <button
                        onClick={() => handleToggleResume(att)}
                        className={`p-1 rounded transition-colors ${
                          att.isResume
                            ? 'text-amber-400 hover:text-amber-300'
                            : 'text-dark-400 hover:text-amber-400'
                        } hover:bg-dark-700`}
                        title={att.isResume ? 'Unmark as resume' : 'Mark as resume'}
                      >
                        <Star size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(att)}
                        className="p-1 rounded text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          filename={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          directUrl={previewDoc.url}
          fetchUrl={atsApi.getAttachmentDownloadUrl(orgSlug, previewDoc._id)}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete attachment?"
        message={confirmDelete ? `Delete "${confirmDelete.fileName}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        busy={confirmBusy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await performDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
