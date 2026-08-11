import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../shared/ConfirmDialog';
import { DataTable, EmptyState, Button, Modal, Input, Field, Switch } from '../../ds';

/* v2 config-page kit (Slice 4) — the repeated master-data shape: card
   table + search + create/edit modal + confirmed delete. Parity with the
   legacy pages (list + modal, no inline editing), rendered on ds
   primitives. Server-side delete blocks (400 "Cannot delete: N in use")
   surface through the caller's toast — messages passed to deleteConfirm
   should never promise a soft outcome the server refuses. */

/** Colored dot used across config tables. */
export function ConfigDot({ color = 'var(--brand)' }) {
  return <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0, display: 'inline-block' }} />;
}

/**
 * Generic config list page.
 *
 * fields: [{ key, label, type: 'text'|'toggle'|'colorSwatch'|'number'|'select',
 *            required, placeholder, options (select: [{value,label}];
 *            colorSwatch: [{value, swatch}]), defaultValue }]
 * columns: DataTable columns (render receives the item). Defaults to a Name column.
 * onDelete absent → no delete affordances. rowDelete=false hides the row
 * trash (delete then lives only in the edit modal, like ContactsConfig).
 */
export function ConfigListV2({
  icon,
  title,
  sub,
  noun = 'item',
  items = [],
  loading = false,
  searchable = true,
  searchKeys = ['name'],
  columns,
  fields = [{ key: 'name', label: 'Name', required: true }],
  onCreate,
  onUpdate,
  onDelete,
  rowDelete = true,
  deleteConfirm,
  headerActions,
  emptyText,
  modalTitle,
}) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const blankForm = () => Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === 'toggle' ? false : '')]));

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setForm(Object.fromEntries(fields.map((f) => [f.key, item[f.key] ?? f.defaultValue ?? (f.type === 'toggle' ? false : '')])));
    setFormError('');
    setModalOpen(true);
  };
  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError('');
  };

  const handleSave = async () => {
    for (const f of fields) {
      const v = form[f.key];
      if (f.required && (typeof v === 'string' ? !v.trim() : v == null || v === '')) {
        setFormError(`${f.label} is required`);
        return;
      }
    }
    const values = { ...form };
    for (const f of fields) {
      if (typeof values[f.key] === 'string') values[f.key] = values[f.key].trim();
      if (f.type === 'number' && values[f.key] !== '') values[f.key] = Number(values[f.key]);
    }
    setSaving(true);
    try {
      if (editing) await onUpdate(editing, values);
      else await onCreate(values);
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    setDeleting(true);
    try {
      await onDelete(item);
      setConfirmDelete(null);
      if (editing && editing._id === item._id) {
        setModalOpen(false);
        setEditing(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = (item) => {
    // Always confirmed — the legacy native window.confirm paths and the
    // unconfirmed modal-delete buttons both upgrade to ConfirmDialog.
    setConfirmDelete(item);
  };

  const filtered = searchable && search.trim()
    ? items.filter((it) => searchKeys.some((k) => String(it[k] || '').toLowerCase().includes(search.toLowerCase().trim())))
    : items;

  const cols = [
    ...(columns || [{
      key: 'name', header: 'Name',
      render: (it) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ConfigDot /> <span style={{ color: 'var(--fg)' }}>{it.name}</span>
        </span>
      ),
    }]),
    {
      key: '__actions', header: '', align: 'right', width: 90,
      render: (it) => (
        <span style={{ display: 'inline-flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Edit" onClick={() => openEdit(it)}
            style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--r-1)', color: 'var(--fg-4)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.background = 'transparent'; }}>
            <Pencil size={13} />
          </button>
          {onDelete && rowDelete && (
            <button type="button" title="Delete" aria-label={`Delete ${it.name}`} onClick={() => requestDelete(it)}
              style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--r-1)', color: 'var(--fg-4)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.background = 'transparent'; }}>
              <Trash2 size={13} />
            </button>
          )}
        </span>
      ),
    },
  ];

  const confirmCfg = confirmDelete && (deleteConfirm
    ? deleteConfirm(confirmDelete)
    : { title: `Delete ${noun}?`, message: `Delete "${confirmDelete.name}"? This cannot be undone.` });

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && <span style={{ color: 'var(--fg-4)' }}>{icon}</span>}
          <div>
            <h1 style={{ font: '650 18px/1.2 var(--font)', color: 'var(--fg)', letterSpacing: '-0.012em' }}>{title}</h1>
            {sub && <p style={{ font: '450 12.5px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 3 }}>{sub}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {headerActions}
          {onCreate && <Button size="sm" iconLeft={<Plus size={14} />} onClick={openCreate}>New</Button>}
        </div>
      </div>

      {searchable && items.length > 5 && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 10px', marginBottom: 12,
          borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${noun}s…`}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)', font: "450 13px/1 'Inter', system-ui, sans-serif" }}
          />
        </span>
      )}

      <DataTable
        columns={cols}
        rows={filtered}
        rowKey={(it) => it._id || it.key || it.name}
        loading={loading}
        resizable={false}
        onRowClick={openEdit}
        empty={(
          <EmptyState icon={icon} title={search ? `No ${noun}s match your search` : `No ${noun}s yet`} compact
            actions={!search && onCreate && (
              <Button variant="secondary" size="sm" onClick={openCreate}>Create your first {noun}</Button>
            )}>
            {emptyText}
          </EmptyState>
        )}
      />

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${modalTitle || noun}` : `New ${modalTitle || noun}`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map((f) => (
            <ConfigField
              key={f.key}
              field={f}
              value={form[f.key]}
              onChange={(v) => { setForm((prev) => ({ ...prev, [f.key]: v })); setFormError(''); }}
              onEnter={handleSave}
            />
          ))}
          {formError && <p style={{ font: '450 12px/1.4 var(--font)', color: 'var(--danger)' }}>{formError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </div>
          {editing && onDelete && (
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <Button variant="ghost" size="sm" block style={{ color: 'var(--danger)' }} disabled={saving}
                iconLeft={<Trash2 size={13} />} onClick={() => requestDelete(editing)}>
                Delete this {noun}
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmCfg?.title}
        message={confirmCfg?.message}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
    </div>
  );
}

function ConfigField({ field, value, onChange, onEnter }) {
  if (field.type === 'toggle') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ font: "550 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{field.label}</p>
          {field.hint && <p style={{ font: '450 11.5px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 2 }}>{field.hint}</p>}
        </div>
        <Switch checked={!!value} onChange={(v) => onChange(typeof v === 'boolean' ? v : !value)} aria-label={field.label} />
      </div>
    );
  }
  if (field.type === 'colorSwatch') {
    return (
      <Field label={field.label} required={field.required}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(field.options || []).map((o) => (
            <button
              key={o.value}
              type="button"
              title={o.value}
              aria-label={o.value}
              aria-pressed={value === o.value}
              onClick={() => onChange(o.value)}
              style={{
                width: 26, height: 26, borderRadius: 999, background: o.swatch,
                boxShadow: value === o.value ? '0 0 0 2px var(--bg), 0 0 0 4px var(--brand)' : 'inset 0 0 0 1px var(--line-strong, rgba(255,255,255,.18))',
                transition: 'box-shadow 120ms var(--e-out)',
              }}
            />
          ))}
        </div>
      </Field>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label} required={field.required}>
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            height: 38, padding: '0 12px', width: '100%', appearance: 'none',
            border: 'none', outline: 'none', borderRadius: 'var(--r-2, 12px)',
            background: 'var(--surface-2)', color: 'var(--fg)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
            font: "450 13.5px/1 'Inter', system-ui, sans-serif",
          }}
        >
          {field.placeholder != null && <option value="">{field.placeholder}</option>}
          {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    );
  }
  return (
    <Field label={field.label} required={field.required}>
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        placeholder={field.placeholder}
        autoFocus={field.autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
      />
    </Field>
  );
}
