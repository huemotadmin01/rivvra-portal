import { useState, useEffect, useCallback, useRef } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Plus, Edit2, X, Loader2, Trash2,
  Layers, Tag, Globe, ThumbsDown, GraduationCap, Briefcase,
  GripVertical, Check, Zap, Award, BarChart3, Mail, Eye,
  ToggleLeft, ToggleRight, RotateCcw, Save,
} from 'lucide-react';

/* ── Tab definitions ──────────────────────────────────────────────────── */
const TABS = [
  { key: 'stages',          label: 'Stages',           icon: Layers },
  { key: 'tags',            label: 'Tags',             icon: Tag },
  { key: 'sources',         label: 'Sources',          icon: Globe },
  { key: 'refuse_reasons',  label: 'Refuse Reasons',   icon: ThumbsDown },
  { key: 'degrees',         label: 'Degrees',          icon: GraduationCap },
  { key: 'employment_types', label: 'Employment Types', icon: Briefcase },
  { key: 'skill_types',     label: 'Skill Types',      icon: Zap },
  { key: 'skills',          label: 'Skills',           icon: Award },
  { key: 'skill_levels',    label: 'Skill Levels',     icon: BarChart3 },
  { key: 'email_templates', label: 'Email Templates',  icon: Mail },
];

/* ── Reusable ConfigSection (Tags, Sources, Refuse Reasons, Degrees, Employment Types) */
function ConfigSection({ entity, entityLabel, orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '' });

  const fetchItems = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listConfig(orgSlug, entity);
      if (res.success) {
        setItems(res.items || res[entity] || []);
      }
    } catch {
      showToast(`Failed to load ${entityLabel.toLowerCase()}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, entity, entityLabel, showToast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ name: '' });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({ name: item.name });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setForm({ name: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      if (editingItem) {
        const res = await atsApi.updateConfig(orgSlug, entity, editingItem._id, { name: form.name.trim() });
        if (res.success) {
          showToast(`${entityLabel.slice(0, -1)} updated`);
          closeModal();
          fetchItems();
        } else {
          showToast(res.error || `Failed to update ${entityLabel.toLowerCase()}`, 'error');
        }
      } else {
        const res = await atsApi.createConfig(orgSlug, entity, { name: form.name.trim() });
        if (res.success) {
          showToast(`${entityLabel.slice(0, -1)} created`);
          closeModal();
          fetchItems();
        } else {
          showToast(res.error || `Failed to create ${entityLabel.toLowerCase()}`, 'error');
        }
      }
    } catch (err) {
      showToast(err.message || `Failed to save ${entityLabel.toLowerCase()}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Delete "${editingItem.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteConfig(orgSlug, entity, editingItem._id);
      if (res.success) {
        showToast(`${entityLabel.slice(0, -1)} deleted`);
        closeModal();
        fetchItems();
      }
    } catch (err) {
      showToast(err.message || `Failed to delete`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  const TabIcon = TABS.find((t) => t.key === entity)?.icon || Tag;

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TabIcon size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">{entityLabel}</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add {entityLabel.slice(0, -1)}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TabIcon className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No {entityLabel.toLowerCase()} yet</p>
            <p className="text-dark-500 text-sm">
              Add {entityLabel.toLowerCase()} to organize your recruitment pipeline.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rivvra-500 flex-shrink-0" />
                        <span className="text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                        title={`Edit ${entityLabel.slice(0, -1).toLowerCase()}`}
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

      {/* Modal */}
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
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editingItem ? `Edit ${entityLabel.slice(0, -1)}` : `Add ${entityLabel.slice(0, -1)}`}
              </h3>
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`e.g. ${entityLabel.slice(0, -1)} name`}
                  className="input-field"
                />
              </div>

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
                  {editingItem ? 'Save Changes' : `Create ${entityLabel.slice(0, -1)}`}
                </button>
              </div>

              {editingItem && (
                <div className="pt-3 border-t border-dark-700">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete {entityLabel.slice(0, -1)}
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

/* ── Stages Section (custom — sequence, fold, isHired) ────────────────── */
function StagesSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingStage, setEditingStage] = useState(null);
  const [form, setForm] = useState({ name: '', sequence: 0, foldInKanban: false, isHiredStage: false });

  const fetchStages = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listStages(orgSlug);
      if (res.success) {
        setStages((res.stages || []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
      }
    } catch {
      showToast('Failed to load stages', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  const openAdd = () => {
    setEditingStage(null);
    const nextSeq = stages.length > 0 ? Math.max(...stages.map((s) => s.sequence ?? 0)) + 1 : 1;
    setForm({ name: '', sequence: nextSeq, foldInKanban: false, isHiredStage: false });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const openEdit = (stage) => {
    setEditingStage(stage);
    setForm({
      name: stage.name,
      sequence: stage.sequence ?? 0,
      foldInKanban: stage.foldInKanban || false,
      isHiredStage: stage.isHiredStage || false,
    });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingStage(null);
    setForm({ name: '', sequence: 0, foldInKanban: false, isHiredStage: false });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        sequence: Number(form.sequence) || 0,
        foldInKanban: form.foldInKanban,
        isHiredStage: form.isHiredStage,
      };
      if (editingStage) {
        const res = await atsApi.updateStage(orgSlug, editingStage._id, payload);
        if (res.success) {
          showToast('Stage updated');
          closeModal();
          fetchStages();
        } else {
          showToast(res.error || 'Failed to update stage', 'error');
        }
      } else {
        const res = await atsApi.createStage(orgSlug, payload);
        if (res.success) {
          showToast('Stage created');
          closeModal();
          fetchStages();
        } else {
          showToast(res.error || 'Failed to create stage', 'error');
        }
      }
    } catch (err) {
      showToast(err.message || 'Failed to save stage', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingStage) return;
    if (!window.confirm(`Delete stage "${editingStage.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteStage(orgSlug, editingStage._id);
      if (res.success) {
        showToast('Stage deleted');
        closeModal();
        fetchStages();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete stage', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Stages</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {stages.length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Stage
          </button>
        </div>

        {stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No stages yet</p>
            <p className="text-dark-500 text-sm">
              Create stages to define your recruitment pipeline.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium w-16">#</th>
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Fold in Kanban</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Hired Stage</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <GripVertical size={14} className="text-dark-600" />
                        <span className="text-dark-400 text-xs font-mono">{stage.sequence ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white">{stage.name}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {stage.foldInKanban ? (
                        <Check size={14} className="text-rivvra-400 mx-auto" />
                      ) : (
                        <span className="text-dark-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {stage.isHiredStage ? (
                        <Check size={14} className="text-rivvra-400 mx-auto" />
                      ) : (
                        <span className="text-dark-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(stage)}
                        className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                        title="Edit stage"
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

      {/* Stage Modal */}
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
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editingStage ? 'Edit Stage' : 'Add Stage'}
              </h3>
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Stage Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Screening, Interview, Offer"
                  className="input-field"
                />
              </div>

              {/* Sequence */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Sequence
                </label>
                <input
                  type="number"
                  value={form.sequence}
                  onChange={(e) => setForm({ ...form, sequence: e.target.value })}
                  placeholder="0"
                  className="input-field"
                  min="0"
                />
                <p className="text-dark-500 text-xs mt-1">Determines the order in which stages appear.</p>
              </div>

              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.foldInKanban}
                    onChange={(e) => setForm({ ...form, foldInKanban: e.target.checked })}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
                  />
                  <div>
                    <p className="text-sm text-white group-hover:text-rivvra-400 transition-colors">Fold in Kanban</p>
                    <p className="text-xs text-dark-500">Collapse this stage by default in the kanban view.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.isHiredStage}
                    onChange={(e) => setForm({ ...form, isHiredStage: e.target.checked })}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
                  />
                  <div>
                    <p className="text-sm text-white group-hover:text-rivvra-400 transition-colors">Hired Stage</p>
                    <p className="text-xs text-dark-500">Mark candidates in this stage as hired.</p>
                  </div>
                </label>
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
                  {editingStage ? 'Save Changes' : 'Create Stage'}
                </button>
              </div>

              {editingStage && (
                <div className="pt-3 border-t border-dark-700">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete Stage
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

/* ── Skill Types Section ──────────────────────────────────────────────── */
function SkillTypesSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '' });

  const fetchItems = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listSkillTypes(orgSlug);
      if (res.success) setItems(res.items || []);
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

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Delete skill type "${editingItem.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteSkillType(orgSlug, editingItem._id);
      if (res.success) {
        showToast('Skill type deleted'); closeModal(); fetchItems();
      } else {
        showToast(res.error || 'Failed to delete skill type', 'error');
      }
    } catch (err) { showToast(err.message || 'Failed to delete', 'error'); } finally { setDeleting(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-dark-400" /></div>;

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
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
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
                  <button type="button" onClick={handleDelete} disabled={deleting} className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Skill Type
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

/* ── Skills Section (with type dropdown) ─────────────────────────────── */
function SkillsSection({ orgSlug, showToast }) {
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-dark-400" /></div>;

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
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
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
function SkillLevelsSection({ orgSlug, showToast }) {
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
      if (res.success) setItems((res.items || []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-dark-400" /></div>;

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
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
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

function EmailTemplatesSection({ orgSlug, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', htmlBody: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [togglingStage, setTogglingStage] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.listEmailTemplates(orgSlug);
      if (res.success) {
        setTemplates(res.templates || []);
        setStages(res.stages || []);
      }
    } catch (err) {
      showToast('Failed to load email templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const getTemplate = (key) => templates.find(t => t.key === key);

  const handleEdit = (key) => {
    const t = getTemplate(key);
    setEditForm({
      subject: t?.subject || '',
      htmlBody: t?.htmlBody || '',
      name: t?.name || TEMPLATE_LABELS[key] || key,
    });
    setEditingKey(key);
    setPreviewHtml(null);
  };

  const handleSave = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      const res = await atsApi.updateEmailTemplate(orgSlug, editingKey, editForm);
      if (res.success) {
        showToast('Email template saved', 'success');
        setEditingKey(null);
        loadData();
      }
    } catch (err) {
      showToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (key) => {
    try {
      const res = await atsApi.deleteEmailTemplate(orgSlug, key);
      if (res.success) {
        showToast('Reverted to system default', 'success');
        loadData();
      }
    } catch {
      showToast('No custom override to revert', 'error');
    }
  };

  const handlePreview = async (key) => {
    setPreviewLoading(true);
    try {
      const res = await atsApi.previewEmailTemplate(orgSlug, key);
      if (res.success) {
        setPreviewHtml(res.html);
      }
    } catch {
      showToast('Preview failed', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleToggleStageEmail = async (stageId, currentEnabled) => {
    setTogglingStage(stageId);
    try {
      const res = await atsApi.toggleStageEmail(orgSlug, stageId, !currentEnabled);
      if (res.success) {
        setStages(prev => prev.map(s => s._id === stageId ? { ...s, emailEnabled: !currentEnabled } : s));
        showToast(`Stage email ${!currentEnabled ? 'enabled' : 'disabled'}`, 'success');
      }
    } catch {
      showToast('Failed to toggle stage email', 'error');
    } finally {
      setTogglingStage(null);
    }
  };

  const placeholderChips = ['candidateName', 'jobTitle', 'orgName', 'stageName', 'portalUrl', 'refuseReason', 'approverName', 'recruiterName', 'department'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-rivvra-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stage-based email templates */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Mail size={18} className="text-rivvra-400" />
          Stage Email Notifications
        </h3>
        <p className="text-dark-400 text-sm mb-4">
          Emails automatically sent to candidates when their application moves to a stage.
        </p>

        <div className="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Stage</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Email Enabled</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Template</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Subject</th>
                <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => {
                const tpl = stage.emailTemplateKey ? getTemplate(stage.emailTemplateKey) : null;
                return (
                  <tr key={stage._id} className="border-b border-dark-700/50 hover:bg-dark-750/30">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white">{stage.name}</span>
                      <span className="text-xs text-dark-500 ml-2">seq {stage.sequence}</span>
                    </td>
                    <td className="px-4 py-3">
                      {stage.emailTemplateKey ? (
                        <button
                          onClick={() => handleToggleStageEmail(stage._id, stage.emailEnabled)}
                          disabled={togglingStage === stage._id}
                          className="flex items-center gap-1.5"
                        >
                          {togglingStage === stage._id ? (
                            <Loader2 size={18} className="animate-spin text-dark-400" />
                          ) : stage.emailEnabled ? (
                            <ToggleRight size={22} className="text-rivvra-500" />
                          ) : (
                            <ToggleLeft size={22} className="text-dark-500" />
                          )}
                          <span className={`text-xs ${stage.emailEnabled ? 'text-rivvra-400' : 'text-dark-500'}`}>
                            {stage.emailEnabled ? 'On' : 'Off'}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-dark-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tpl ? (
                        <span className="text-sm text-dark-300">{TEMPLATE_LABELS[stage.emailTemplateKey] || tpl.name}</span>
                      ) : (
                        <span className="text-xs text-dark-600 italic">No template</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tpl ? (
                        <span className="text-xs text-dark-400 truncate block max-w-[250px]">{tpl.subject}</span>
                      ) : (
                        <span className="text-xs text-dark-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {stage.emailTemplateKey && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handlePreview(stage.emailTemplateKey)}
                            className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => handleEdit(stage.emailTemplateKey)}
                            className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          {tpl?.isCustom && (
                            <button
                              onClick={() => handleRevert(stage.emailTemplateKey)}
                              className="p-1.5 text-dark-400 hover:text-amber-400 rounded transition-colors"
                              title="Revert to default"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event-based email templates */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Event Email Templates</h3>
        <p className="text-dark-400 text-sm mb-4">
          Emails triggered by specific events (refusal, job approval).
        </p>

        <div className="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Event</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Subject</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Recipient</th>
                <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_TEMPLATE_KEYS.map(key => {
                const tpl = getTemplate(key);
                const recipientMap = {
                  ats_refused: 'Candidate',
                  ats_job_approval_request: 'Approver',
                  ats_job_approved: 'Recruiter',
                };
                return (
                  <tr key={key} className="border-b border-dark-700/50 hover:bg-dark-750/30">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white">{TEMPLATE_LABELS[key]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dark-400 truncate block max-w-[300px]">{tpl?.subject || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dark-300 bg-dark-700 px-2 py-0.5 rounded">{recipientMap[key]}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handlePreview(key)} className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors" title="Preview">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleEdit(key)} className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        {tpl?.isCustom && (
                          <button onClick={() => handleRevert(key)} className="p-1.5 text-dark-400 hover:text-amber-400 rounded transition-colors" title="Revert to default">
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h3 className="text-lg font-semibold text-white">Edit Email Template</h3>
                <p className="text-sm text-dark-400 mt-0.5">{TEMPLATE_LABELS[editingKey] || editingKey}</p>
              </div>
              <button onClick={() => setEditingKey(null)} className="text-dark-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Placeholder chips */}
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Available Placeholders</label>
                <div className="flex flex-wrap gap-1.5">
                  {placeholderChips.map(p => (
                    <button
                      key={p}
                      onClick={() => navigator.clipboard.writeText(`{{${p}}}`).then(() => showToast(`Copied {{${p}}}`, 'success'))}
                      className="text-xs bg-dark-700 text-rivvra-400 px-2 py-1 rounded hover:bg-dark-600 transition-colors cursor-pointer font-mono"
                    >
                      {`{{${p}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:border-rivvra-500 focus:outline-none"
                  placeholder="Email subject with {{placeholders}}"
                />
              </div>

              {/* HTML Body */}
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">HTML Body</label>
                <textarea
                  value={editForm.htmlBody}
                  onChange={e => setEditForm(f => ({ ...f, htmlBody: e.target.value }))}
                  rows={14}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm font-mono focus:border-rivvra-500 focus:outline-none resize-y"
                  placeholder="<div>Email HTML body with {{placeholders}}</div>"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-dark-700">
              <button
                onClick={() => handlePreview(editingKey)}
                disabled={previewLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-dark-700 text-dark-200 rounded-lg hover:bg-dark-600 transition-colors"
              >
                {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Preview
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingKey(null)}
                  className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-500 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-dark-800 border-b border-dark-700">
              <h3 className="text-sm font-semibold text-white">Email Preview</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-dark-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[80vh]">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[600px] border-0"
                title="Email Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main AtsConfig Component ─────────────────────────────────────────── */
export default function AtsConfig() {
  const { currentOrg, getAppRole } = useOrg();
  const { showToast } = useToast();

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const [activeTab, setActiveTab] = useState('stages');

  // Non-admin guard
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <Layers size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Admin access required</p>
          <p className="text-sm text-dark-500 mt-1">Only admins can manage ATS configuration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ATS Configuration</h1>
          <p className="text-dark-400 text-sm mt-1">Manage stages, tags, sources, and other recruitment settings</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-dark-700">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-rivvra-500 text-rivvra-400'
                    : 'border-transparent text-dark-400 hover:text-dark-200 hover:border-dark-600'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'stages' && (
        <StagesSection orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'tags' && (
        <ConfigSection entity="tags" entityLabel="Tags" orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'sources' && (
        <ConfigSection entity="sources" entityLabel="Sources" orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'refuse_reasons' && (
        <ConfigSection entity="refuse_reasons" entityLabel="Refuse Reasons" orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'degrees' && (
        <ConfigSection entity="degrees" entityLabel="Degrees" orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'employment_types' && (
        <ConfigSection entity="employment_types" entityLabel="Employment Types" orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'skill_types' && (
        <SkillTypesSection orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'skills' && (
        <SkillsSection orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'skill_levels' && (
        <SkillLevelsSection orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'email_templates' && (
        <EmailTemplatesSection orgSlug={orgSlug} showToast={showToast} />
      )}
    </div>
  );
}
