import { useState, useEffect, useCallback, useRef } from 'react';
import atsApi from '../../../utils/atsApi';
import {
  Plus, Edit2, X, Loader2, Paperclip, Check, Archive, RotateCcw,
} from 'lucide-react';

/* ── ATS Attachment Kinds ─────────────────────────────────────────────────
 * Org-wide taxonomy of file "kinds" a stage can require (Stages tab →
 * Required Uploads). A kind's slug is immutable once created (stages
 * reference it; uploads tag by slug); only label / accepted type / max size
 * / archived are editable. The MIME control is a small preset list because
 * the upload modal special-cases image/* and application/pdf for its file
 * picker accept attribute.
 */
const MIME_PRESETS = [
  { value: '', label: 'Any file type' },
  { value: 'image/*', label: 'Images (PNG, JPG…) — e.g. a meeting screenshot' },
  { value: 'application/pdf', label: 'PDF only' },
];

export default function AttachmentKindsSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ label: '', mime: 'image/*', maxSizeMb: 10 });

  const fetchKinds = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await atsApi.listAttachmentKinds(orgSlug, true);
      if (res.success) setKinds(res.kinds || []);
    } catch {
      showToast('Failed to load attachment kinds', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { fetchKinds(); }, [fetchKinds]);

  const openAdd = () => {
    setEditing(null);
    setForm({ label: '', mime: 'image/*', maxSizeMb: 10 });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const openEdit = (kind) => {
    setEditing(kind);
    setForm({
      label: kind.label || '',
      mime: kind.mime || '',
      maxSizeMb: kind.maxSizeMb ?? '',
    });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    const payload = {
      label: form.label.trim(),
      mime: form.mime || null,
      // Server/upload pipeline hard-caps at 10 MB — clamp so the stored
      // limit never promises more than uploads actually accept.
      maxSizeMb: form.maxSizeMb === '' || form.maxSizeMb == null ? null : Math.min(10, Number(form.maxSizeMb)),
    };
    try {
      setSaving(true);
      const res = editing
        ? await atsApi.updateAttachmentKind(orgSlug, editing._id, payload)
        : await atsApi.createAttachmentKind(orgSlug, payload);
      if (res.success) {
        showToast(editing ? 'Attachment kind updated' : 'Attachment kind created');
        closeModal();
        fetchKinds();
      } else {
        showToast(res.error || 'Failed to save', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save attachment kind', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (kind) => {
    if (togglingId) return; // one toggle in flight at a time
    setTogglingId(kind._id);
    try {
      const res = await atsApi.updateAttachmentKind(orgSlug, kind._id, { archived: !kind.archived });
      if (res.success) {
        showToast(kind.archived ? 'Restored' : 'Archived');
        fetchKinds();
      } else {
        showToast(res.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setTogglingId(null);
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Paperclip size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Attachment Kinds</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {kinds.filter((k) => !k.archived).length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-rivvra-500 text-dark-950 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Kind
          </button>
        </div>
        <p className="text-xs text-dark-500 mb-5">
          Named file types you can require on a stage. Assign them per stage under the <span className="text-dark-300">Stages</span> tab → Required Uploads.
        </p>

        {kinds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Paperclip className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No attachment kinds yet</p>
            <p className="text-dark-500 text-sm">
              Create one (e.g. “Screening Call Screenshot”) to gate a stage on it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Label</th>
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Accepted Type</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Max Size</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((kind) => (
                  <tr key={kind._id} className={`border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors ${kind.archived ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="text-white">{kind.label}</span>
                      {kind.archived && <span className="ml-2 text-xs text-dark-500">(archived)</span>}
                      <div className="text-xs text-dark-500 font-mono mt-0.5">{kind.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-dark-300 hidden sm:table-cell">{kind.mime || 'Any type'}</td>
                    <td className="px-4 py-3 text-center text-dark-300 hidden sm:table-cell">
                      {kind.maxSizeMb ? `${kind.maxSizeMb} MB` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(kind)}
                          className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => toggleArchive(kind)}
                          disabled={!!togglingId}
                          className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={kind.archived ? 'Restore' : 'Archive'}
                        >
                          {togglingId === kind._id
                            ? <Loader2 size={14} className="animate-spin" />
                            : kind.archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
          <div ref={modalRef} role="dialog" aria-modal="true" className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editing ? 'Edit Attachment Kind' : 'Add Attachment Kind'}
              </h3>
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Label <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Screening Call Screenshot"
                  className="input-field"
                />
                {editing && (
                  <p className="text-dark-500 text-xs mt-1">
                    Slug <span className="font-mono text-dark-400">{editing.slug}</span> is fixed — it's referenced by existing stages and uploads.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Accepted Type</label>
                <select
                  value={form.mime}
                  onChange={(e) => setForm({ ...form, mime: e.target.value })}
                  className="input-field"
                >
                  {MIME_PRESETS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Max Size (MB)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={form.maxSizeMb}
                  onChange={(e) => setForm({ ...form, maxSizeMb: e.target.value })}
                  placeholder="No limit"
                  className="input-field"
                />
                <p className="text-dark-500 text-xs mt-1">Hard cap is 10 MB per file. Leave blank for no kind-specific limit.</p>
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
                  {editing ? 'Save Changes' : 'Create Kind'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
