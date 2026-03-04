import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Upload, File, FileText, Image, Trash2, Loader2, Download,
  Star, X, Paperclip,
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

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    try {
      setUploading(true);
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          showToast(`${file.name} exceeds 10 MB limit`, 'error');
          continue;
        }
        await atsApi.uploadAttachment(orgSlug, applicationId, file);
      }
      showToast(files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`);
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
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

  const handleDelete = async (att) => {
    if (!window.confirm(`Delete "${att.fileName}"? This cannot be undone.`)) return;
    try {
      const res = await atsApi.deleteAttachment(orgSlug, att._id);
      if (!res.success) { showToast(res.error || 'Failed to delete attachment', 'error'); return; }
      showToast('Attachment deleted');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    if (!readOnly) handleUpload(e.dataTransfer.files);
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
            onChange={(e) => handleUpload(e.target.files)}
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
            return (
              <div
                key={att._id}
                className="flex items-center gap-3 bg-dark-800/50 border border-dark-700/50 rounded-lg px-3 py-2.5 group"
              >
                <FileIcon size={16} className="text-dark-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white hover:text-rivvra-400 truncate transition-colors"
                    >
                      {att.fileName}
                    </a>
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
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                    title="Download"
                  >
                    <Download size={13} />
                  </a>
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
    </div>
  );
}
