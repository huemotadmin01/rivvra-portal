import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  Loader2, Plus, Upload, FileText, LayoutTemplate,
  X, Copy, Trash2, Edit2, Tag, Search,
  CloudUpload, File,
} from 'lucide-react';

/* ── Upload Template Modal ────────────────────────────────────────────── */
function UploadTemplateModal({ show, onClose, onSaved, orgSlug }) {
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (show && orgSlug) {
      setName('');
      setFile(null);
      setSelectedTags([]);
      setLoadingTags(true);
      signApi.listTags(orgSlug)
        .then((res) => {
          setAvailableTags(res.tags || res.items || []);
        })
        .catch(() => {
          setAvailableTags([]);
        })
        .finally(() => setLoadingTags(false));
      setTimeout(() => modalRef.current?.querySelector('input[type="text"]')?.focus(), 50);
    }
  }, [show, orgSlug]);

  const handleFileSelect = (selectedFile) => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      if (!name.trim()) {
        const fileName = selectedFile.name.replace(/\.pdf$/i, '');
        setName(fileName);
      }
    } else if (selectedFile) {
      showToast('Only PDF files are accepted', 'error');
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      showToast('Please select a PDF file', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('Please enter a template name', 'error');
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('name', name.trim());
      formData.append('tags', JSON.stringify(selectedTags));

      const res = await signApi.createTemplate(orgSlug, formData);
      if (res.success !== false) {
        showToast('Template uploaded successfully');
        onSaved();
        onClose();
      } else {
        showToast(res.message || 'Failed to upload template', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to upload template', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg my-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="upload-modal-title" className="text-lg font-semibold text-white">
            Upload Template
          </h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drag-and-drop zone */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              PDF File <span className="text-red-400">*</span>
            </label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : file
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-dark-600 hover:border-dark-500 bg-dark-900/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <File size={32} className="text-emerald-400" />
                  <p className="text-white font-medium text-sm">{file.name}</p>
                  <p className="text-dark-400 text-xs">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors mt-1"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <CloudUpload size={32} className="text-dark-500" />
                  <p className="text-dark-300 text-sm font-medium">
                    Drop your PDF here or click to browse
                  </p>
                  <p className="text-dark-500 text-xs">Only PDF files accepted</p>
                </div>
              )}
            </div>
          </div>

          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Template Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NDA Agreement"
              className="input-field"
            />
          </div>

          {/* Tags Multi-select */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Tags
            </label>
            {loadingTags ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={14} className="animate-spin text-dark-400" />
                <span className="text-dark-500 text-xs">Loading tags...</span>
              </div>
            ) : availableTags.length === 0 ? (
              <p className="text-dark-500 text-xs py-2">
                No tags available. Create tags in the Sign Configuration.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      type="button"
                      onClick={() => toggleTag(tag._id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                          : 'bg-dark-900 border-dark-700 text-dark-400 hover:border-dark-600 hover:text-dark-300'
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !file}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Upload Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main SignTemplates Component ──────────────────────────────────────── */
export default function SignTemplates() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const orgSlug = currentOrg?.slug;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [search, setSearch] = useState('');
  const [duplicating, setDuplicating] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const debounceRef = useRef(null);

  const fetchTemplates = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await signApi.listTemplates(orgSlug);
      if (res.success !== false) {
        setTemplates(res.templates || []);
      } else {
        showToast('Failed to load templates', 'error');
      }
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDuplicate = async (templateId) => {
    try {
      setDuplicating(templateId);
      const res = await signApi.duplicateTemplate(orgSlug, templateId);
      if (res.success !== false) {
        showToast('Template duplicated');
        fetchTemplates();
      } else {
        showToast(res.message || 'Failed to duplicate', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to duplicate template', 'error');
    } finally {
      setDuplicating(null);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      setDeleting(templateId);
      const res = await signApi.deleteTemplate(orgSlug, templateId);
      if (res.success !== false) {
        showToast('Template deleted');
        fetchTemplates();
      } else {
        showToast(res.message || 'Failed to delete', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete template', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // Filter templates by search
  const filtered = templates.filter((t) =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-dark-400 text-sm mt-1">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'} total
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn-primary flex items-center gap-2 self-start"
        >
          <Upload size={16} />
          Upload Template
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-full pl-10"
          aria-label="Search templates"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <LayoutTemplate className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {search ? 'No templates match your search' : 'No templates yet'}
          </h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {search
              ? 'Try adjusting your search term.'
              : 'Upload your first PDF template to start creating signature requests.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3 text-dark-400 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Pages</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Fields</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Tags</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Requests</th>
                  <th className="text-right px-4 py-3 text-dark-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tpl) => {
                  const fieldsCount = tpl.signItems?.length || 0;
                  const signedCount = tpl.signedCount || 0;
                  const totalReqs = tpl.requestCount || 0;
                  const tags = tpl.tags || [];

                  return (
                    <tr
                      key={tpl._id}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(orgPath(`/sign/templates/${tpl._id}/edit`))}
                          className="flex items-center gap-3 text-left group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                            <FileText size={14} className="text-indigo-400" />
                          </div>
                          <span className="text-white font-medium truncate max-w-[200px] group-hover:text-indigo-400 transition-colors">
                            {tpl.name || 'Untitled'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-dark-300 hidden sm:table-cell">
                        {tpl.numPages || tpl.pageCount || tpl.pages || '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        {fieldsCount}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.length === 0 ? (
                            <span className="text-dark-500 text-xs">\u2014</span>
                          ) : (
                            tags.slice(0, 3).map((tag, i) => (
                              <span
                                key={tag._id || i}
                                className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400"
                              >
                                {tag.name || tag}
                              </span>
                            ))
                          )}
                          {tags.length > 3 && (
                            <span className="text-dark-500 text-xs">+{tags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-dark-300 hidden xl:table-cell">
                        <span className="text-emerald-400">{signedCount}</span>
                        <span className="text-dark-500">/{totalReqs}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(orgPath(`/sign/templates/${tpl._id}/edit`))}
                            className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                            title="Edit template"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDuplicate(tpl._id)}
                            disabled={duplicating === tpl._id}
                            className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700 disabled:opacity-30"
                            title="Duplicate template"
                          >
                            {duplicating === tpl._id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(tpl._id)}
                            disabled={deleting === tpl._id}
                            className="text-dark-400 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-dark-700 disabled:opacity-30"
                            title="Delete template"
                          >
                            {deleting === tpl._id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <UploadTemplateModal
        show={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSaved={fetchTemplates}
        orgSlug={orgSlug}
      />
    </div>
  );
}
