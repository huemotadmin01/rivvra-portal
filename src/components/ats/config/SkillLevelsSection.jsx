import { useState, useEffect, useCallback, useRef } from 'react';
import { InlineSkeleton } from '../../Skeletons';
import atsApi from '../../../utils/atsApi';
import {
  Plus, Edit2, X, Loader2, Trash2,
  Layers, GripVertical, Check, Zap, Award, BarChart3, Mail, Eye,
  ToggleLeft, ToggleRight, RotateCcw, Save,
} from 'lucide-react';

export default function SkillLevelsSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '', sequence: 0 });

  const fetchItems = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listSkillLevels(orgSlug);
      // Server returns `{ success, skillLevels }`, not `items`.
      if (res.success) setItems(((res.skillLevels || res.items || [])).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
    } catch {
      showToast('Failed to load skill levels', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => {
    const nextSeq = items.length > 0 ? Math.max(...items.map((i) => i.sequence ?? 0)) + 1 : 1;
    setEditingItem(null); setForm({ name: '', sequence: nextSeq }); setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };
  const openEdit = (item) => { setEditingItem(item); setForm({ name: item.name, sequence: item.sequence ?? 0 }); setShowModal(true); setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50); };
  const closeModal = () => { setShowModal(false); setEditingItem(null); setForm({ name: '', sequence: 0 }); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), sequence: Number(form.sequence) || 0 };
      if (editingItem) {
        const res = await atsApi.updateSkillLevel(orgSlug, editingItem._id, payload);
        if (res.success) {
          showToast('Skill level updated');
          closeModal(); fetchItems();
        } else {
          showToast(res.error || 'Failed to update skill level', 'error');
        }
      } else {
        const res = await atsApi.createSkillLevel(orgSlug, payload);
        if (res.success) {
          showToast('Skill level created');
          closeModal(); fetchItems();
        } else {
          showToast(res.error || 'Failed to create skill level', 'error');
        }
      }
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Delete skill level "${editingItem.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteSkillLevel(orgSlug, editingItem._id);
      if (res.success) {
        showToast('Skill level deleted'); closeModal(); fetchItems();
      } else {
        showToast(res.error || 'Failed to delete skill level', 'error');
      }
    } catch (err) { showToast(err.message || 'Failed to delete', 'error'); } finally { setDeleting(false); }
  };

  if (loading) return <InlineSkeleton rows={5} />;

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Skill Levels</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <button onClick={openAdd} className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors">
            <Plus size={14} /> Add Skill Level
          </button>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No skill levels yet</p>
            <p className="text-dark-500 text-sm">Add levels like Beginner, Intermediate, Advanced, Expert.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium w-16">#</th>
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <GripVertical size={14} className="text-dark-600" />
                        <span className="text-dark-400 text-xs font-mono">{item.sequence ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        <span className="text-white">{item.name}</span>
                      </div>
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
              <h3 className="text-lg font-semibold text-white">{editingItem ? 'Edit Skill Level' : 'Add Skill Level'}</h3>
              <button onClick={closeModal} aria-label="Close" className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Name <span className="text-red-400">*</span></label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Beginner, Expert" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Sequence</label>
                <input type="number" value={form.sequence} onChange={(e) => setForm({ ...form, sequence: e.target.value })} className="input-field" min="0" />
                <p className="text-dark-500 text-xs mt-1">Higher sequence = higher proficiency level.</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={closeModal} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Close</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editingItem ? 'Save Changes' : 'Create Skill Level'}
                </button>
              </div>
              {editingItem && (
                <div className="pt-3 border-t border-dark-700">
                  <button type="button" onClick={handleDelete} disabled={deleting} className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Skill Level
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

/* ── Email Templates Section ──────────────────────────────────────────── */

const TEMPLATE_LABELS = {
  ats_stage_new: 'Application Received',
  ats_stage_qualification: 'Initial Qualification',
  ats_stage_l1_interview: 'L1 Interview',
  ats_stage_l2_interview: 'L2 Interview',
  ats_stage_documents: 'Documents Collection',
  ats_stage_hired: 'Hired / Welcome',
  ats_refused: 'Application Refused',
  ats_job_approval_request: 'Job Approval Request',
  ats_job_approved: 'Job Approved',
};

const STAGE_TEMPLATE_KEYS = [
  'ats_stage_new', 'ats_stage_qualification', 'ats_stage_l1_interview',
  'ats_stage_l2_interview', 'ats_stage_documents', 'ats_stage_hired',
];
const EVENT_TEMPLATE_KEYS = ['ats_refused', 'ats_job_approval_request', 'ats_job_approved'];

