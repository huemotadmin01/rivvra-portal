import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import {
  AlertTriangle, Plus, Trash2, Edit3, Loader2, Search, X,
} from 'lucide-react';

export default function CrmConfigLostReasons() {
  const { orgSlug } = useOrg();
  const { addToast } = useToast();

  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReason, setEditingReason] = useState(null); // null = create, object = edit
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchReasons = useCallback(async () => {
    try {
      const res = await crmApi.listLostReasons(orgSlug);
      if (res.success) setReasons(res.reasons || []);
    } catch {
      addToast('Failed to load lost reasons', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, addToast]);

  useEffect(() => { fetchReasons(); }, [fetchReasons]);

  // ── Filtered list ──────────────────────────────────────────────────────
  const filtered = reasons.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  // ── Modal helpers ──────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingReason(null);
    setFormName('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (reason) => {
    setEditingReason(reason);
    setFormName(reason.name);
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingReason(null);
    setFormName('');
    setFormError('');
  };

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !saving) closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen]);

  // ── Save (create or update) ────────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Description is required');
      return;
    }

    setSaving(true);
    const isEdit = !!editingReason;
    try {
      if (editingReason) {
        await crmApi.updateLostReason(orgSlug, editingReason._id, { name: trimmed });
      } else {
        await crmApi.createLostReason(orgSlug, { name: trimmed });
      }
      setModalOpen(false);
      setEditingReason(null);
      setSaving(false);
      fetchReasons();
      addToast(isEdit ? 'Lost reason updated' : 'Lost reason created', 'success');
    } catch (err) {
      setSaving(false);
      addToast(err.message || 'Failed to save', 'error');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editingReason) return;
    setSaving(true);
    try {
      await crmApi.deleteLostReason(orgSlug, editingReason._id);
      setModalOpen(false);
      setEditingReason(null);
      setSaving(false);
      fetchReasons();
      addToast('Lost reason deleted', 'success');
    } catch (err) {
      setSaving(false);
      addToast(err.message || 'Failed to delete', 'error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-dark-400" />
          <div>
            <h1 className="text-lg font-semibold text-dark-100">Lost Reasons</h1>
            <p className="text-xs text-dark-400 mt-0.5">Manage reasons for lost opportunities</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors"
        >
          <Plus size={16} />
          New
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search lost reasons..."
          className="w-full pl-9 pr-9 py-2 text-sm bg-dark-800 border border-dark-700 rounded-lg text-dark-100 placeholder:text-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
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

      {/* Table Card */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-dark-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle size={32} className="text-dark-600 mb-3" />
            <p className="text-sm text-dark-400">
              {search ? 'No lost reasons match your search' : 'No lost reasons yet'}
            </p>
            {!search && (
              <button
                onClick={openCreate}
                className="mt-3 text-xs text-rivvra-500 hover:text-rivvra-400 transition-colors"
              >
                Create your first lost reason
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(reason => (
                <tr
                  key={reason._id}
                  className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors"
                >
                  <td className="px-5 py-3 text-sm text-dark-100">
                    {reason.name}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(reason)}
                        className="p-1.5 text-dark-500 hover:text-dark-300 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(reason)}
                        className="p-1.5 text-dark-500 hover:text-red-400 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget && !saving) closeModal(); }}
        >
          <div className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-dark-100">
                {editingReason ? 'Edit Lost Reason' : 'New Lost Reason'}
              </h2>
              <button
                onClick={closeModal}
                disabled={saving}
                className="text-dark-500 hover:text-dark-300 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1.5">
                  Description <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => { setFormName(e.target.value); setFormError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave(); }}
                  placeholder="e.g. Too expensive, Chose competitor..."
                  className={`w-full px-3 py-2 text-sm bg-dark-900 border rounded-lg text-dark-100 placeholder:text-dark-500 focus:outline-none transition-colors ${
                    formError ? 'border-red-500 focus:border-red-500' : 'border-dark-600 focus:border-rivvra-500'
                  }`}
                  autoFocus
                />
                {formError && (
                  <p className="text-xs text-red-400 mt-1">{formError}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingReason ? 'Save' : 'Create'}
              </button>
            </div>

            {/* Delete button (edit mode only) */}
            {editingReason && (
              <div className="mt-5 pt-4 border-t border-dark-700">
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 w-full justify-center"
                >
                  <Trash2 size={13} />
                  Delete this lost reason
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
