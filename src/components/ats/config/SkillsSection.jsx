import { useState, useEffect, useCallback, useRef } from 'react';
import { InlineSkeleton } from '../../Skeletons';
import atsApi from '../../../utils/atsApi';
import {
  Plus, Edit2, X, Loader2, Trash2,
  Layers, GripVertical, Check, Zap, Award, BarChart3, Mail, Eye,
  ToggleLeft, ToggleRight, RotateCcw, Save,
} from 'lucide-react';

export default function SkillsSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [skillTypes, setSkillTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '', skillTypeId: '' });
  const [filterType, setFilterType] = useState('');

  const fetchData = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const [skillsRes, typesRes] = await Promise.all([
        atsApi.listSkills(orgSlug, filterType ? { skillTypeId: filterType } : {}),
        atsApi.listSkillTypes(orgSlug),
      ]);
      if (skillsRes.success) setItems(skillsRes.items || []);
      if (typesRes.success) setSkillTypes(typesRes.items || []);
    } catch {
      showToast('Failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, filterType, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setEditingItem(null); setForm({ name: '', skillTypeId: skillTypes[0]?._id || '' }); setShowModal(true); setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50); };
  const openEdit = (item) => { setEditingItem(item); setForm({ name: item.name, skillTypeId: item.skillTypeId || '' }); setShowModal(true); setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50); };
  const closeModal = () => { setShowModal(false); setEditingItem(null); setForm({ name: '', skillTypeId: '' }); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.skillTypeId) return;
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), skillTypeId: form.skillTypeId };
      if (editingItem) {
        const res = await atsApi.updateSkill(orgSlug, editingItem._id, payload);
        if (res.success) {
          showToast('Skill updated');
          closeModal(); fetchData();
        } else {
          showToast(res.error || 'Failed to update skill', 'error');
        }
      } else {
        const res = await atsApi.createSkill(orgSlug, payload);
        if (res.success) {
          showToast('Skill created');
          closeModal(); fetchData();
        } else {
          showToast(res.error || 'Failed to create skill', 'error');
        }
      }
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Delete skill "${editingItem.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteSkill(orgSlug, editingItem._id);
      if (res.success) {
        showToast('Skill deleted'); closeModal(); fetchData();
      } else {
        showToast(res.error || 'Failed to delete skill', 'error');
      }
    } catch (err) { showToast(err.message || 'Failed to delete', 'error'); } finally { setDeleting(false); }
  };

  const typeMap = Object.fromEntries(skillTypes.map((t) => [t._id, t.name]));

  if (loading) return <InlineSkeleton rows={5} />;

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Skills</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); }}
              className="input-field text-sm py-1.5 px-2"
            >
              <option value="">All Types</option>
              {skillTypes.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
            <button onClick={openAdd} className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors">
              <Plus size={14} /> Add Skill
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Award className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No skills yet</p>
            <p className="text-dark-500 text-sm">Add skills like JavaScript, Python, Communication, etc.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Type</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <span className="text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-dark-700 text-dark-300 px-2 py-0.5 rounded-full">
                        {item.skillTypeName || typeMap[item.skillTypeId] || '—'}
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
              <h3 className="text-lg font-semibold text-white">{editingItem ? 'Edit Skill' : 'Add Skill'}</h3>
              <button onClick={closeModal} aria-label="Close" className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Skill Type <span className="text-red-400">*</span></label>
                <select required value={form.skillTypeId} onChange={(e) => setForm({ ...form, skillTypeId: e.target.value })} className="input-field">
                  <option value="">Select type...</option>
                  {skillTypes.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Skill Name <span className="text-red-400">*</span></label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. JavaScript, Python" className="input-field" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={closeModal} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Close</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editingItem ? 'Save Changes' : 'Create Skill'}
                </button>
              </div>
              {editingItem && (
                <div className="pt-3 border-t border-dark-700">
                  <button type="button" onClick={handleDelete} disabled={deleting} className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Skill
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Skill Levels Section ────────────────────────────────────────────── */
