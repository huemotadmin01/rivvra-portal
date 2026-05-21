import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InlineSkeleton } from '../../Skeletons';
import atsApi from '../../../utils/atsApi';
import ConfirmDialog from '../../shared/ConfirmDialog';
import {
  Plus, Edit2, X, Loader2, Trash2,
  Layers, Tag, Search,
} from 'lucide-react';

export default function ConfigSection({ entity, entityLabel, icon: TabIcon = Tag, orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Backend routes are kebab-case (`/ats/config/refuse-reasons`,
  // `/ats/config/employment-types`) but the tab key carried over from the
  // tab strip is snake_case (`refuse_reasons`, `employment_types`).
  // Translate at the network boundary so the UI keeps a single key.
  const apiEntity = entity.replace(/_/g, '-');

  const fetchItems = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listConfig(orgSlug, apiEntity);
      if (res.success) {
        setItems(res.items || res[entity] || []);
      }
    } catch {
      showToast(`Failed to load ${entityLabel.toLowerCase()}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, apiEntity, entity, entityLabel, showToast]);

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
        const res = await atsApi.updateConfig(orgSlug, apiEntity, editingItem._id, { name: form.name.trim() });
        if (res.success) {
          showToast(`${entityLabel.slice(0, -1)} updated`);
          closeModal();
          fetchItems();
        } else {
          showToast(res.error || `Failed to update ${entityLabel.toLowerCase()}`, 'error');
        }
      } else {
        const res = await atsApi.createConfig(orgSlug, apiEntity, { name: form.name.trim() });
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

  // Two-step destructive delete: open ConfirmDialog (surfacing the usage
  // count) instead of window.confirm. Skipped silently for entities
  // without a usage hook — the dialog still warns generically.
  const openDeletePrompt = () => {
    if (!editingItem) return;
    setConfirmDelete(editingItem);
  };
  const performDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      const res = await atsApi.deleteConfig(orgSlug, apiEntity, confirmDelete._id);
      if (res.success) {
        showToast(`${entityLabel.slice(0, -1)} deleted`);
        setConfirmDelete(null);
        closeModal();
        fetchItems();
      } else {
        showToast(res.error || `Failed to delete`, 'error');
      }
    } catch (err) {
      showToast(err.message || `Failed to delete`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Client-side search filter. Picklists are read-once-per-tab and small,
  // so filtering locally keeps typing snappy.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => (it.name || '').toLowerCase().includes(q));
  }, [items, search]);

  // Server may or may not hydrate usageCount per entity. Show the column
  // only when at least one row has it (avoids an empty 0 column on
  // entities that don't have a usage hook configured).
  const hasUsage = items.some((it) => typeof it.usageCount === 'number');

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
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TabIcon size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">{entityLabel}</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {search.trim() ? `${visibleItems.length} of ${items.length}` : items.length}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            {items.length > 5 && (
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${entityLabel.toLowerCase()}…`}
                  className="input-field text-sm py-1.5 pl-8 pr-2 w-full"
                />
              </div>
            )}
            <button
              onClick={openAdd}
              className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors"
            >
              <Plus size={14} />
              Add {entityLabel.slice(0, -1)}
            </button>
          </div>
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
                  {hasUsage && (
                    <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Used by</th>
                  )}
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 && search.trim() ? (
                  <tr>
                    <td colSpan={hasUsage ? 3 : 2} className="px-4 py-8 text-center text-sm text-dark-500">
                      No {entityLabel.toLowerCase()} match "{search}"
                    </td>
                  </tr>
                ) : visibleItems.map((item) => (
                  <tr key={item._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rivvra-500 flex-shrink-0" />
                        <span className="text-white">{item.name}</span>
                      </div>
                    </td>
                    {hasUsage && (
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs ${item.usageCount > 0 ? 'text-emerald-300' : 'text-dark-500'}`}>
                          {item.usageCount || 0}
                        </span>
                      </td>
                    )}
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
                    onClick={openDeletePrompt}
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

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete this ${entityLabel.slice(0, -1).toLowerCase()}?`}
        message={
          confirmDelete ? (
            <>
              You're about to delete <strong className="text-white">"{confirmDelete.name}"</strong>.
              {' '}
              {typeof confirmDelete.usageCount === 'number' && confirmDelete.usageCount > 0 ? (
                <>
                  It's currently tagged on{' '}
                  <strong className="text-amber-300">
                    {confirmDelete.usageCount} application{confirmDelete.usageCount === 1 ? '' : 's'}
                  </strong>
                  . Deleting it doesn't change those records but the tag will disappear from them. This cannot be undone.
                </>
              ) : typeof confirmDelete.usageCount === 'number' ? (
                <>It's not currently used by any application, so this is safe.</>
              ) : (
                <>This action cannot be undone.</>
              )}
            </>
          ) : null
        }
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={performDelete}
      />
    </>
  );
}

/* ── Stages Section (custom — sequence, fold, isHired) ────────────────── */
