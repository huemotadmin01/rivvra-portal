import { useState, useEffect, useCallback, useRef } from 'react';
import { InlineSkeleton } from '../../Skeletons';
import atsApi from '../../../utils/atsApi';
import ConfirmDialog from '../../shared/ConfirmDialog';
import {
  Plus, Edit2, X, Loader2, Trash2, Zap,
} from 'lucide-react';

export default function SkillTypesSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listSkillTypes(orgSlug);
      // Server returns `{ success, skillTypes }`, not `items`.
      if (res.success) setItems(res.skillTypes || res.items || []);
    } catch {
      showToast('Failed to load skill types', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => { setEditingItem(null); setForm({ name: '' }); setShowModal(true); setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50); };
  const openEdit = (item) => { setEditingItem(item); setForm({ name: item.name }); setShowModal(true); setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50); };
  const closeModal = () => { setShowModal(false); setEditingItem(null); setForm({ name: '' }); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      if (editingItem) {
        const res = await atsApi.updateSkillType(orgSlug, editingItem._id, { name: form.name.trim() });
        if (res.success) {
          showToast('Skill type updated');
          closeModal(); fetchItems();
        } else {
          showToast(res.error || 'Failed to update skill type', 'error');
        }
      } else {
        const res = await atsApi.createSkillType(orgSlug, { name: form.name.trim() });
        if (res.success) {
          showToast('Skill type created');
          closeModal(); fetchItems();
        } else {
          showToast(res.error || 'Failed to create skill type', 'error');
        }
      }
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); } finally { setSaving(false); }
  };

  const openDeletePrompt = () => { if (editingItem) setConfirmDelete(editingItem); };
  const performDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteSkillType(orgSlug, confirmDelete._id);
      if (res.success) {
        showToast('Skill type deleted');
        setConfirmDelete(null);
        closeModal();
        fetchItems();
      } else {
        showToast(res.error || 'Failed to delete skill type', 'error');
      }
    } catch (err) { showToast(err.message || 'Failed to delete', 'error'); } finally { setDeleting(false); }
  };

  if (loading) return <InlineSkeleton rows={5} />;

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Skill Types</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <button onClick={openAdd} className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors">
            <Plus size={14} /> Add Skill Type
          </button>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No skill types yet</p>
            <p className="text-dark-500 text-sm">Add categories like IT, Languages, Soft Skills, etc.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Skills</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                        <span className="text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs ${item.usageCount > 0 ? 'text-emerald-300' : 'text-dark-500'}`}>
                        {item.usageCount || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(item)} className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"><Edit2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }} onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}>
          <div ref={modalRef} role="dialog" aria-modal="true" className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">{editingItem ? 'Edit Skill Type' : 'Add Skill Type'}</h3>
              <button onClick={closeModal} aria-label="Close" className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Name <span className="text-red-400">*</span></label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Programming, Soft Skills" className="input-field" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={closeModal} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Close</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editingItem ? 'Save Changes' : 'Create Skill Type'}
                </button>
              </div>
              {editingItem && (
                <div className="pt-3 border-t border-dark-700">
                  <button type="button" onClick={openDeletePrompt} disabled={deleting} className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Skill Type
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete this skill type?"
        message={
          confirmDelete ? (
            <>
              You're about to delete <strong className="text-white">"{confirmDelete.name}"</strong>.
              {' '}
              {confirmDelete.usageCount > 0 ? (
                <>
                  This type categorizes{' '}
                  <strong className="text-amber-300">
                    {confirmDelete.usageCount} skill{confirmDelete.usageCount === 1 ? '' : 's'}
                  </strong>
                  . Those skills will lose their type (and the candidates tagged with them keep the skill, but the category is gone). This cannot be undone.
                </>
              ) : (
                <>No skills currently use this type, so this is safe.</>
              )}
            </>
          ) : null
        }
        confirmLabel="Delete type"
        danger
        busy={deleting}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={performDelete}
      />
    </>
  );
}

/* ── Skills Section (with type dropdown) ─────────────────────────────── */
