import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import assetApi from '../../utils/assetApi';
import { Plus, Pencil, Trash2, Loader2, X, Check, Package } from 'lucide-react';
import { PageHeader, Panel, Button, Input, EmptyState, PageSpinner } from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Asset types are the vocabulary every asset record is filed under, so `handleDelete`
// removes a category other records may point at. It is carried across verbatim,
// including the native `confirm()` gate, and was not triggered.
// Everything from `const { orgSlug }` to `startEdit` is spliced in byte-identically.
// ─────────────────────────────────────────────────────────────────────────────

export default function AssetTypeConfigV2() {
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

  if (loading) return <PageSpinner label="Loading asset types…" />;

  const resetForm = () => { setShowAdd(false); setEditId(null); setForm({ name: '', description: '' }); };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="Asset Types"
        sub="Configure the types of assets your organization tracks"
        actions={!showAdd && (
          <Button size="sm" iconLeft={<Plus size={15} />}
            onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: '', description: '' }); }}>
            Add Type
          </Button>
        )}
      />

      {showAdd && (
        <Panel title={editId ? 'Edit Asset Type' : 'New Asset Type'} style={{ marginBottom: 14 }}>
          <div style={{ padding: 6, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label htmlFor="at-name" style={{ display: 'block', font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 5 }}>Name *</label>
                <Input id="at-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Laptop, Headphone, Bag" />
              </div>
              <div>
                <label htmlFor="at-desc" style={{ display: 'block', font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 5 }}>Description</label>
                <Input id="at-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}
                iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}>
                {editId ? 'Update' : 'Add'}
              </Button>
              <Button variant="secondary" size="sm" onClick={resetForm} iconLeft={<X size={14} />}>Cancel</Button>
            </div>
          </div>
        </Panel>
      )}

      {types.length === 0 ? (
        <Panel>
          <EmptyState icon={<Package size={22} />} title="No asset types configured yet">
            Add types like Laptop, Headphone, Bag to get started
          </EmptyState>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {types.map(t => (
            <Panel key={t._id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 4 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{t.name}</p>
                  {t.description && (
                    <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>{t.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <Button variant="ghost" size="sm" aria-label={`Edit ${t.name}`}
                    onClick={() => startEdit(t)} iconLeft={<Pencil size={14} />} />
                  <Button variant="ghost" size="sm" aria-label={`Delete ${t.name}`} style={{ color: 'var(--danger)' }}
                    onClick={() => handleDelete(t._id)} iconLeft={<Trash2 size={14} />} />
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
