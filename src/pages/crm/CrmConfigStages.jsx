import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import {
  Settings, Plus, Trash2, Edit3, Loader2, Search, X, Check, RotateCcw,
} from 'lucide-react';

export default function CrmConfigStages() {
  const { orgSlug } = useOrg();
  const { addToast } = useToast();

  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState(null); // null = create, object = edit
  const [formName, setFormName] = useState('');
  const [formIsWon, setFormIsWon] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // ── Fetch stages ───────────────────────────────────────────────────────
  const fetchStages = useCallback(async () => {
    try {
      const res = await crmApi.listStages(orgSlug);
      if (res.success) setStages(res.stages || []);
    } catch {
      addToast('Failed to load stages', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, addToast]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  // ── Filtered stages ────────────────────────────────────────────────────
  const filtered = stages.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  // ── Modal helpers ──────────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingStage(null);
    setFormName('');
    setFormIsWon(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (stage) => {
    setEditingStage(stage);
    setFormName(stage.name);
    setFormIsWon(!!stage.isWonStage);
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving || deleting) return;
    setModalOpen(false);
    setEditingStage(null);
    setFormName('');
    setFormIsWon(false);
    setFormError('');
  };

  // Close on Escape key
  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [modalOpen]);

  // ── Save (create or update) ────────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Stage name is required');
      return;
    }
    setFormError('');
    setSaving(true);
    const isEdit = !!editingStage;

    try {
      if (editingStage) {
        await crmApi.updateStage(orgSlug, editingStage._id, {
          name: trimmed,
          isWonStage: formIsWon,
        });
      } else {
        await crmApi.createStage(orgSlug, { name: trimmed });
      }
      // Close modal and refresh — do this before toast to ensure modal closes
      setModalOpen(false);
      setEditingStage(null);
      setSaving(false);
      fetchStages();
      addToast(isEdit ? 'Stage updated' : 'Stage created', 'success');
    } catch (err) {
      setSaving(false);
      addToast(err.message || 'Failed to save stage', 'error');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editingStage) return;
    setDeleting(true);
    try {
      await crmApi.deleteStage(orgSlug, editingStage._id);
      setModalOpen(false);
      setEditingStage(null);
      setDeleting(false);
      fetchStages();
      addToast('Stage deleted', 'success');
    } catch (err) {
      setDeleting(false);
      addToast(err.message || 'Cannot delete stage', 'error');
    }
  };

  // ── Reset to defaults ─────────────────────────────────────────────────
  const handleResetDefaults = async () => {
    if (!confirm('This will replace all stages with the defaults (Initial Contact → Converted to Job). Existing opportunities will be moved to Initial Contact. Continue?')) return;
    setResetting(true);
    try {
      const res = await crmApi.resetStagesToDefaults(orgSlug);
      if (res.success) {
        setStages(res.stages || []);
        addToast('Stages reset to defaults', 'success');
      }
    } catch (err) {
      addToast(err.message || 'Failed to reset stages', 'error');
    } finally {
      setResetting(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[300px]">
        <Loader2 size={28} className="animate-spin text-dark-500" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-dark-800 rounded-lg">
            <Settings size={20} className="text-dark-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-dark-100">Stages</h1>
            <p className="text-sm text-dark-400">
              Manage pipeline stages for your CRM deals
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            disabled={resetting}
            className="flex items-center gap-2 px-3 py-2 text-sm text-dark-400 hover:text-dark-200 bg-dark-800 border border-dark-700 rounded-lg hover:bg-dark-700 disabled:opacity-50 transition-colors"
          >
            {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Reset to Defaults
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-white text-sm font-medium rounded-lg hover:bg-rivvra-600 transition-colors"
          >
            <Plus size={16} />
            New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stages..."
          className="w-full pl-9 pr-9 py-2.5 bg-dark-850 border border-dark-700 rounded-lg text-sm text-dark-100 placeholder:text-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
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

      {/* Table card */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[48px_1fr_140px_100px] px-4 py-3 border-b border-dark-700 bg-dark-800/50">
          <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">
            #
          </span>
          <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">
            Stage Name
          </span>
          <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">
            Is Won Stage?
          </span>
          <span className="text-xs font-medium text-dark-400 uppercase tracking-wider text-right">
            Actions
          </span>
        </div>

        {/* Table body */}
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-dark-500">
              {stages.length === 0
                ? 'No stages yet. Create your first pipeline stage.'
                : 'No stages match your search.'}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((stage, index) => (
              <div
                key={stage._id}
                className="grid grid-cols-[48px_1fr_140px_100px] items-center px-4 py-3 border-b border-dark-800 hover:bg-dark-800/50 transition-colors"
              >
                <span className="text-sm text-dark-400 font-mono">
                  {stage.sequence ?? index + 1}
                </span>
                <span className="text-sm text-dark-100 font-medium">
                  {stage.name}
                </span>
                <div>
                  {stage.isWonStage && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-400">
                      <Check size={10} />
                      Won
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditModal(stage)}
                    className="p-1.5 rounded-md text-dark-400 hover:text-dark-200 hover:bg-dark-700 transition-colors"
                    title="Edit stage"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingStage(stage);
                      setFormName(stage.name);
                      setFormIsWon(!!stage.isWonStage);
                      setFormError('');
                      setModalOpen(true);
                    }}
                    className="p-1.5 rounded-md text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors"
                    title="Delete stage"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-dark-100">
                {editingStage ? 'Edit Stage' : 'New Stage'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 rounded-md text-dark-400 hover:text-dark-200 hover:bg-dark-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Name field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (formError) setFormError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
                placeholder="e.g. Proposal, Negotiation..."
                className={`w-full px-3 py-2.5 bg-dark-900 border rounded-lg text-sm text-dark-100 placeholder:text-dark-500 focus:outline-none transition-colors ${
                  formError
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-dark-600 focus:border-rivvra-500'
                }`}
                autoFocus
              />
              {formError && (
                <p className="mt-1 text-xs text-red-400">{formError}</p>
              )}
            </div>

            {/* Is Won Stage toggle */}
            {editingStage && (
              <div className="mb-6">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-dark-300">
                    Is Won Stage
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formIsWon}
                    onClick={() => setFormIsWon(!formIsWon)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formIsWon ? 'bg-rivvra-500' : 'bg-dark-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        formIsWon ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
                <p className="mt-1 text-xs text-dark-500">
                  Mark this stage as the winning/closed-won stage
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-white text-sm font-medium rounded-lg hover:bg-rivvra-600 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                {editingStage ? 'Save Changes' : 'Create Stage'}
              </button>
              <button
                onClick={closeModal}
                disabled={saving || deleting}
                className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Delete button (only in edit mode) */}
            {editingStage && (
              <div className="mt-6 pt-4 border-t border-dark-700">
                <button
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Delete Stage
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
