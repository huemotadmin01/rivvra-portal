import { useState, useEffect, useCallback, useRef } from 'react';
import atsApi from '../../../utils/atsApi';
import { useCompany } from '../../../context/CompanyContext';
import {
  Plus, Edit2, X, Loader2, Trash2,
  Layers, GripVertical, Check, Paperclip,
} from 'lucide-react';

const EMPTY_FORM = { name: '', sequence: 0, foldInKanban: false, isHiredStage: false, requiredAttachments: [] };

export default function StagesSection({ orgSlug, showToast }) {
  const { currentCompany } = useCompany();
  const modalRef = useRef(null);
  const [stages, setStages] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingStage, setEditingStage] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Drag-reorder state (rows are draggable via the grip column).
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [reordering, setReordering] = useState(false);

  // Label lookup so the table + modal can render kind names from the ids
  // stored on stage.requiredAttachments[]. Archived kinds still resolve here
  // (separate active list drives the picker) so existing assignments show.
  const kindLabel = useCallback(
    (id) => kinds.find((k) => k._id === id)?.label || 'Unknown',
    [kinds],
  );

  const fetchStages = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const [stagesRes, kindsRes] = await Promise.all([
        atsApi.listStages(orgSlug),
        atsApi.listAttachmentKinds(orgSlug, true),
      ]);
      if (stagesRes.success) {
        setStages((stagesRes.stages || []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
      }
      if (kindsRes.success) setKinds(kindsRes.kinds || []);
    } catch {
      showToast('Failed to load stages', 'error');
    } finally {
      setLoading(false);
    }
    // currentCompany?._id: refetch on company switch (header reads active
    // company from localStorage at request time). See AtsJobPositions.jsx.
  }, [orgSlug, currentCompany?._id, showToast]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  const openAdd = () => {
    setEditingStage(null);
    const nextSeq = stages.length > 0 ? Math.max(...stages.map((s) => s.sequence ?? 0)) + 1 : 1;
    setForm({ ...EMPTY_FORM, sequence: nextSeq });
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
      // ids arrive JSON-serialized as strings; keep them as strings to match
      // the kinds list _id for checkbox state + render.
      requiredAttachments: Array.isArray(stage.requiredAttachments)
        ? stage.requiredAttachments.map(String)
        : [],
    });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingStage(null);
    setForm(EMPTY_FORM);
  };

  const toggleRequiredKind = (kindId) => {
    setForm((prev) => {
      const has = prev.requiredAttachments.includes(kindId);
      return {
        ...prev,
        requiredAttachments: has
          ? prev.requiredAttachments.filter((id) => id !== kindId)
          : [...prev.requiredAttachments, kindId],
      };
    });
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
        requiredAttachments: form.requiredAttachments,
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
      } else {
        showToast(res.error || 'Failed to delete stage', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete stage', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Drag-reorder ─────────────────────────────────────────────────────
  // Optimistic: re-sequence locally (1..n), PUT /stages/reorder, roll back
  // the previous order if the server rejects it.
  const handleDrop = async (targetIndex) => {
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (fromIndex == null || fromIndex === targetIndex || reordering) return;
    const prev = stages;
    const next = [...stages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    const resequenced = next.map((s, i) => ({ ...s, sequence: i + 1 }));
    setStages(resequenced);
    setReordering(true);
    try {
      const res = await atsApi.reorderStages(
        orgSlug,
        resequenced.map((s) => ({ _id: s._id, sequence: s.sequence })),
      );
      if (res.success) {
        if (Array.isArray(res.stages)) {
          setStages([...res.stages].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
        }
        showToast('Stages reordered');
      } else {
        setStages(prev);
        showToast(res.error || 'Failed to reorder stages', 'error');
      }
    } catch (err) {
      setStages(prev);
      showToast(err.message || 'Failed to reorder stages', 'error');
    } finally {
      setReordering(false);
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
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium hidden md:table-cell">Required Uploads</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Fold in Kanban</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Hired Stage</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage, index) => (
                  <tr
                    key={stage._id}
                    draggable={!reordering}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                    onDragLeave={() => setDragOverIndex((cur) => (cur === index ? null : cur))}
                    onDrop={(e) => { e.preventDefault(); handleDrop(index); }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors ${
                      dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'bg-rivvra-500/5' : ''
                    } ${dragIndex === index ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing" title="Drag to reorder">
                        {reordering && dragIndex === null
                          ? <Loader2 size={14} className="animate-spin text-dark-600" />
                          : <GripVertical size={14} className="text-dark-600" />}
                        <span className="text-dark-400 text-xs font-mono">{stage.sequence ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white">{stage.name}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {Array.isArray(stage.requiredAttachments) && stage.requiredAttachments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {stage.requiredAttachments.map((id) => (
                            <span
                              key={String(id)}
                              className="inline-flex items-center gap-1 text-xs bg-rivvra-500/10 text-rivvra-300 border border-rivvra-500/20 px-2 py-0.5 rounded-full"
                            >
                              <Paperclip size={11} />
                              {kindLabel(String(id))}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-dark-600">-</span>
                      )}
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
                {editingStage && (
                  <p className="text-dark-500 text-xs mt-1">
                    Renaming updates existing applications' stage labels.
                  </p>
                )}
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

              {/* Required attachments — per-stage upload gate */}
              <div className="pt-1">
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Required Uploads
                </label>
                <p className="text-xs text-dark-500 mb-2">
                  An application can't move <span className="text-dark-300">into</span> this stage until a file of each selected
                  kind is attached. Manage the list under the <span className="text-dark-300">Attachment Kinds</span> tab.
                </p>
                {kinds.filter((k) => !k.archived).length === 0 ? (
                  <p className="text-xs text-dark-500 italic">
                    No attachment kinds yet — create one in the Attachment Kinds tab first.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {kinds.filter((k) => !k.archived).map((k) => (
                      <label key={k._id} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={form.requiredAttachments.includes(k._id)}
                          onChange={() => toggleRequiredKind(k._id)}
                          className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-white group-hover:text-rivvra-400 transition-colors truncate">{k.label}</p>
                          {(k.mime || k.maxSizeMb) && (
                            <p className="text-xs text-dark-500">
                              {k.mime || 'Any type'}{k.maxSizeMb ? ` · max ${k.maxSizeMb} MB` : ''}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
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
