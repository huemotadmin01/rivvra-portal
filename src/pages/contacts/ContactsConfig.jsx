import { useState, useEffect, useCallback, useRef } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { Plus, Edit2, X, Loader2, Tag, Trash2 } from 'lucide-react';

const EMPTY_FORM = { name: '' };

export default function ContactsConfig() {
  const { currentOrg, getAppRole } = useOrg();
  const { showToast } = useToast();
  const modalRef = useRef(null);

  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null); // null = add, object = edit
  const [form, setForm] = useState(EMPTY_FORM);

  // ── Fetch tags ──────────────────────────────────────────────────────
  const fetchTags = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await contactsApi.listTags(orgSlug);
      if (res.success) {
        setTags(res.tags || []);
      }
    } catch (err) {
      showToast('Failed to load tags', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // ── Open modal ─────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingTag(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const openEdit = (tag) => {
    setEditingTag(tag);
    setForm({ name: tag.name });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTag(null);
    setForm(EMPTY_FORM);
  };

  // ── Save (create or update) ─────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      setSaving(true);
      if (editingTag) {
        const res = await contactsApi.updateTag(orgSlug, editingTag._id, {
          name: form.name.trim(),
        });
        if (res.success) {
          showToast('Tag updated');
          closeModal();
          fetchTags();
        } else {
          showToast(res.error || 'Failed to update tag', 'error');
        }
      } else {
        const res = await contactsApi.createTag(orgSlug, {
          name: form.name.trim(),
        });
        if (res.success) {
          showToast('Tag created');
          closeModal();
          fetchTags();
        } else {
          showToast(res.error || 'Failed to create tag', 'error');
        }
      }
    } catch (err) {
      showToast(err.message || 'Failed to save tag', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editingTag) return;
    if (!window.confirm(`Delete tag "${editingTag.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await contactsApi.deleteTag(orgSlug, editingTag._id);
      if (res.success) {
        showToast('Tag deleted');
        closeModal();
        fetchTags();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete tag', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  // ── Non-admin guard ─────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <Tag size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Admin access required</p>
          <p className="text-sm text-dark-500 mt-1">Only admins can manage contact tags.</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts Configuration</h1>
          <p className="text-dark-400 text-sm mt-1">Manage tags for organizing contacts</p>
        </div>
      </div>

      {/* Tags Section */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Tags</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {tags.length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Tag
          </button>
        </div>

        {/* Tags list */}
        {tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No tags yet</p>
            <p className="text-dark-500 text-sm">
              Create tags to categorize and organize your contacts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Tag Name</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rivvra-500 flex-shrink-0" />
                        <span className="text-white">{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(tag)}
                        className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                        title="Edit tag"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal (Add / Edit Tag) ──────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tag-modal-title"
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h3 id="tag-modal-title" className="text-lg font-semibold text-white">
                {editingTag ? 'Edit Tag' : 'Add Tag'}
              </h3>
              <button
                onClick={closeModal}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Tag Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. VIP, Partner, Lead"
                  className="input-field"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editingTag ? 'Save Changes' : 'Create Tag'}
                </button>
              </div>

              {/* Delete (edit mode only) */}
              {editingTag && (
                <div className="pt-3 border-t border-dark-700">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Delete Tag
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
