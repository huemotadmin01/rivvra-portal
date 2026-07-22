import { useState, useEffect, useCallback, useRef } from 'react';
import atsApi from '../../../utils/atsApi';
import { useCompany } from '../../../context/CompanyContext';
import {
  Plus, Edit2, X, Loader2, Trash2, FileCheck,
} from 'lucide-react';

/**
 * RequiredDocumentsSection — admin picklist for ATS required-document
 * names with a per-row "Required" flag.
 *
 * Mirrors the generic ConfigSection but adds a Required toggle so
 * admins can track optional documents (visible in the per-application
 * checklist with an "Optional" badge) without those entries blocking
 * the Documents Collection forward-move gate. The gate filter and
 * the candidate-facing email both ignore rows where required === false.
 */
const ENTITY_PATH = 'required-documents';

export default function RequiredDocumentsSection({ orgSlug, showToast }) {
  const { currentCompany } = useCompany();
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '', required: true });

  const fetchItems = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listConfig(orgSlug, ENTITY_PATH);
      if (res.success) setItems(res.items || []);
    } catch {
      showToast('Failed to load required documents', 'error');
    } finally {
      setLoading(false);
    }
    // currentCompany?._id: refetch on company switch (header reads active
    // company from localStorage at request time). See AtsJobPositions.jsx.
  }, [orgSlug, currentCompany?._id, showToast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ name: '', required: true });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input[name="name"]')?.focus(), 50);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({ name: item.name, required: item.required !== false });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input[name="name"]')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setForm({ name: '', required: true });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const payload = { name, required: !!form.required };
    try {
      setSaving(true);
      const res = editingItem
        ? await atsApi.updateConfig(orgSlug, ENTITY_PATH, editingItem._id, payload)
        : await atsApi.createConfig(orgSlug, ENTITY_PATH, payload);
      if (res.success) {
        showToast(editingItem ? 'Required document updated' : 'Required document created');
        closeModal();
        fetchItems();
      } else {
        showToast(res.error || 'Failed to save document', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save document', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Delete "${editingItem.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteConfig(orgSlug, ENTITY_PATH, editingItem._id);
      if (res.success) {
        showToast('Required document deleted');
        closeModal();
        fetchItems();
      } else {
        showToast(res.error || 'Failed to delete', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
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
            <FileCheck size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Required Documents</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Document
          </button>
        </div>

        <p className="text-xs text-dark-400 mb-4 -mt-2">
          Items flagged <span className="text-white font-medium">Required</span> block forward stage moves out of Documents Collection
          until marked received on the application. Optional items appear in the checklist for tracking but don't gate the move.
        </p>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileCheck className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No documents configured</p>
            <p className="text-dark-500 text-sm">
              Add the documents you typically collect from candidates at the Documents Collection stage.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium w-32">Type</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const required = item.required !== false;
                  return (
                    <tr key={item._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${required ? 'bg-rivvra-500' : 'bg-dark-500'}`} />
                          <span className="text-white">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${
                          required
                            ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-300'
                            : 'bg-dark-700 border-dark-600 text-dark-300'
                        }`}>
                          {required ? 'Required' : 'Optional'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(item)}
                          className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                          title="Edit document"
                        >
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                {editingItem ? 'Edit Document' : 'Add Document'}
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
                  name="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. PAN Card"
                  className="input-field"
                />
              </div>

              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                form.required
                  ? 'bg-rivvra-500/5 border-rivvra-500/30'
                  : 'bg-dark-900/40 border-dark-700 hover:border-dark-600'
              }`}>
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(e) => setForm({ ...form, required: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-dark-600 bg-dark-900 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">Required for forward stage move</div>
                  <p className="text-xs text-dark-400 mt-0.5">
                    When checked, this document must be marked received before the application can move past Documents Collection.
                    Uncheck to track the document without gating the move.
                  </p>
                </div>
              </label>

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
                  {editingItem ? 'Save Changes' : 'Create Document'}
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
                    Delete Document
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
