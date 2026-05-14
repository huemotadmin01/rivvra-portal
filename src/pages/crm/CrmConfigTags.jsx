import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { Tag, Plus, Trash2, Edit3, Loader2, Search, X } from 'lucide-react';

const COLOR_OPTIONS = ['purple', 'blue', 'amber', 'emerald', 'red', 'cyan', 'orange', 'pink'];

const COLOR_MAP = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
};

const RING_MAP = {
  purple: 'ring-purple-500',
  blue: 'ring-blue-500',
  amber: 'ring-amber-500',
  emerald: 'ring-emerald-500',
  red: 'ring-red-500',
  cyan: 'ring-cyan-500',
  orange: 'ring-orange-500',
  pink: 'ring-pink-500',
};

export default function CrmConfigTags() {
  const { orgSlug } = useOrg();
  const { addToast } = useToast();

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState(null); // null = create, object = edit
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('blue');
  const [saving, setSaving] = useState(false);

  // ── Fetch tags ──────────────────────────────────────────────────────────
  const fetchTags = useCallback(async () => {
    try {
      const res = await crmApi.listTags(orgSlug);
      if (res.success) setTags(res.tags || []);
    } catch {
      addToast('Failed to load tags', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, addToast]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // ── Filtered tags ───────────────────────────────────────────────────────
  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Modal helpers ───────────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingTag(null);
    setFormName('');
    setFormColor('blue');
    setModalOpen(true);
  };

  const openEditModal = (tag) => {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color || 'blue');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingTag(null);
    setFormName('');
    setFormColor('blue');
  };

  // ── Escape key to close modal ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && modalOpen && !saving) closeModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [modalOpen]);

  // ── Save (create or update) ─────────────────────────────────────────────
  const handleSave = async () => {
    const name = formName.trim();
    if (!name) return;
    setSaving(true);
    const isEdit = !!editingTag;
    try {
      if (editingTag) {
        await crmApi.updateTag(orgSlug, editingTag._id, { name, color: formColor });
      } else {
        await crmApi.createTag(orgSlug, { name, color: formColor });
      }
      setModalOpen(false);
      setEditingTag(null);
      setSaving(false);
      fetchTags();
      addToast(isEdit ? 'Tag updated' : 'Tag created', 'success');
    } catch (err) {
      setSaving(false);
      addToast(err.message || 'Failed to save tag', 'error');
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (tagToDelete) => {
    const target = tagToDelete || editingTag;
    if (!target) return;
    setSaving(true);
    try {
      await crmApi.deleteTag(orgSlug, target._id);
      if (modalOpen) { setModalOpen(false); setEditingTag(null); }
      setSaving(false);
      fetchTags();
      addToast('Tag deleted', 'success');
    } catch (err) {
      setSaving(false);
      addToast(err.message || 'Failed to delete tag', 'error');
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[300px]">
        <Loader2 size={24} className="animate-spin text-dark-500" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-dark-800 rounded-lg">
            <Tag size={18} className="text-dark-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-dark-100">Tags</h1>
            <p className="text-xs text-dark-400 mt-0.5">
              Manage tags for categorizing opportunities
            </p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors"
        >
          <Plus size={15} />
          New
        </button>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="w-full pl-9 pr-9 py-2 text-sm bg-dark-850 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Table card ─────────────────────────────────────────────────── */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px_80px] px-5 py-3 border-b border-dark-700 text-xs font-medium text-dark-400 uppercase tracking-wider">
          <span>Name</span>
          <span>Color</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Table body */}
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Tag size={28} className="mx-auto text-dark-600 mb-2" />
            <p className="text-sm text-dark-400">
              {search ? 'No tags match your search' : 'No tags yet'}
            </p>
            {!search && (
              <button
                onClick={openCreateModal}
                className="mt-3 text-xs text-rivvra-500 hover:text-rivvra-400 transition-colors"
              >
                Create your first tag
              </button>
            )}
          </div>
        ) : (
          <div>
            {filtered.map((tag) => (
              <div
                key={tag._id}
                className="grid grid-cols-[1fr_140px_80px] items-center px-5 py-3 border-b border-dark-800 hover:bg-dark-800/50 transition-colors"
              >
                <span className="text-sm text-dark-100 font-medium">{tag.name}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${COLOR_MAP[tag.color] || 'bg-blue-500'}`}
                  />
                  <span className="text-xs text-dark-300 capitalize">{tag.color || 'blue'}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditModal(tag)}
                    className="p-1.5 text-dark-500 hover:text-dark-200 hover:bg-dark-700 rounded-md transition-colors"
                    title="Edit"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="p-1.5 text-dark-500 hover:text-red-400 hover:bg-dark-700 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) closeModal();
          }}
        >
          <div className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-dark-100">
                {editingTag ? 'Edit Tag' : 'New Tag'}
              </h2>
              <button
                onClick={closeModal}
                disabled={saving}
                className="p-1 text-dark-500 hover:text-dark-300 rounded transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            {/* Name field */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-dark-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Enter tag name"
                className="w-full px-3 py-2 text-sm bg-dark-900 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && formName.trim()) handleSave();
                }}
              />
            </div>

            {/* Color field */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-dark-300 mb-2">Color</label>
              <div className="flex items-center gap-2.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full ${COLOR_MAP[c]} transition-all ${
                      formColor === c
                        ? `ring-2 ring-offset-2 ring-offset-dark-800 ${RING_MAP[c]}`
                        : 'hover:scale-110'
                    }`}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              {editingTag ? (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-medium text-dark-300 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formName.trim() || saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-rivvra-500 rounded-lg hover:bg-rivvra-600 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {editingTag ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
