import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import assetApi from '../../utils/assetApi';
import { Plus, Pencil, Trash2, Loader2, X, Check, Package } from 'lucide-react';

export default function AssetTypeConfig() {
  const { orgSlug } = usePlatform();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [orgSlug]);

  async function load() {
    try {
      const res = await assetApi.listTypes(orgSlug);
      setTypes(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await assetApi.updateType(orgSlug, editId, form);
      } else {
        await assetApi.createType(orgSlug, form);
      }
      setForm({ name: '', description: '' });
      setShowAdd(false);
      setEditId(null);
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this asset type?')) return;
    try {
      await assetApi.deleteType(orgSlug, id);
      await load();
    } catch (e) { console.error(e); }
  }

  function startEdit(t) {
    setEditId(t._id);
    setForm({ name: t.name, description: t.description || '' });
    setShowAdd(true);
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[300px]">
      <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Asset Types</h1>
          <p className="text-sm text-dark-400 mt-1">Configure the types of assets your organization tracks</p>
        </div>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: '', description: '' }); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors">
            <Plus size={16} /> Add Type
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">{editId ? 'Edit Asset Type' : 'New Asset Type'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Laptop, Headphone, Bag"
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editId ? 'Update' : 'Add'}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); setForm({ name: '', description: '' }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 text-sm font-medium transition-colors">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {types.length === 0 ? (
          <div className="text-center py-12 text-dark-500">
            <Package size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No asset types configured yet</p>
            <p className="text-xs mt-1">Add types like Laptop, Headphone, Bag to get started</p>
          </div>
        ) : types.map(t => (
          <div key={t._id} className="flex items-center justify-between bg-dark-800/60 border border-dark-700/50 rounded-xl px-4 py-3 hover:border-dark-600 transition-colors">
            <div>
              <p className="text-sm font-medium text-white">{t.name}</p>
              {t.description && <p className="text-xs text-dark-400 mt-0.5">{t.description}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-dark-400 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
