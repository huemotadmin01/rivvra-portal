import { useState, useEffect } from 'react';
import announcementsApi from '../../utils/announcementsApi';
import {
  Megaphone, Plus, Pencil, Trash2, X, Loader2, ArrowRight, Eye, Power,
} from 'lucide-react';

const AUDIENCE_OPTIONS = [
  { value: 'app-not-started', label: "App users who haven't started", hint: 'Users with app access but no activity yet — auto-stops as they adopt' },
  { value: 'app-users', label: 'All users of the app', hint: 'Everyone whose membership has the target app enabled' },
  { value: 'all-members', label: 'Everyone in the workspace', hint: 'All members, regardless of app access' },
];

const KNOWN_APPS = ['todo', 'outreach', 'crm', 'ats', 'sign', 'payroll', 'ess', 'employee', 'invoicing', 'expenses', 'incentive', 'documents', 'timesheet', 'knowledge-base'];

function statusOf(a) {
  if (!a.active) return { label: 'Inactive', cls: 'bg-dark-700 text-dark-400' };
  if (a.activeUntil && new Date(a.activeUntil) < new Date()) return { label: 'Expired', cls: 'bg-amber-500/10 text-amber-400' };
  return { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-400' };
}

const EMPTY_FORM = {
  title: '', body: '', ctaLabel: '', ctaLink: '',
  audience: 'all-members', targetApp: '', orgSlugsText: '', activeUntil: '', active: true,
};

function toForm(a) {
  return {
    title: a.title || '', body: a.body || '',
    ctaLabel: a.ctaLabel || '', ctaLink: a.ctaLink || '',
    audience: a.audience || 'all-members', targetApp: a.targetApp || '',
    orgSlugsText: (a.orgSlugs || []).join(', '),
    activeUntil: a.activeUntil ? new Date(a.activeUntil).toISOString().split('T')[0] : '',
    active: a.active !== false,
  };
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    ctaLabel: form.ctaLabel.trim(),
    ctaLink: form.ctaLink.trim(),
    audience: form.audience,
    targetApp: form.targetApp.trim(),
    orgSlugs: form.orgSlugsText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    activeUntil: form.activeUntil || null,
    active: form.active,
  };
}

// Pixel-faithful copy of AnnouncementBanner so admins see exactly what ships.
function BannerPreview({ form }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-500 mb-2">
        <Eye size={12} /> Live preview
      </p>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-teal-500/10 border border-teal-500/20 rounded-lg text-sm">
        <Megaphone className="w-4 h-4 text-teal-400 shrink-0" />
        <span className="flex-1 min-w-0 text-dark-200">
          <span className="font-semibold text-white">{form.title || 'Announcement title'}</span>
          {form.body ? <span className="text-dark-300"> — {form.body}</span> : null}
        </span>
        {form.ctaLabel && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 text-dark-950 font-medium shrink-0">
            {form.ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        )}
        <X className="w-4 h-4 text-dark-400 shrink-0" />
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [dismissCounts, setDismissCounts] = useState({});
  const [editing, setEditing] = useState(null); // null | 'new' | announcement doc
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const res = await announcementsApi.adminList();
      if (res.success) {
        setItems(res.announcements || []);
        setDismissCounts(res.dismissCounts || {});
      }
    } catch (err) {
      console.error('Announcements load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setError('');
    setEditing('new');
  }

  function openEdit(a) {
    setForm(toForm(a));
    setError('');
    setEditing(a);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(form);
      const res = editing === 'new'
        ? await announcementsApi.adminCreate(payload)
        : await announcementsApi.adminUpdate(editing._id, payload);
      if (res.success) {
        setEditing(null);
        load();
      }
    } catch (err) {
      setError(err.message || 'Failed to save announcement');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(a) {
    try {
      await announcementsApi.adminUpdate(a._id, { ...toPayload(toForm(a)), active: !a.active });
      load();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  }

  async function handleDelete(id) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(prev => (prev === id ? null : prev)), 4000);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await announcementsApi.adminDelete(id);
      setItems(prev => prev.filter(a => a._id !== id));
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  const needsApp = form.audience !== 'all-members';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Megaphone size={20} className="text-teal-400" />
            Announcements
          </h1>
          <p className="text-sm text-dark-400 mt-1">
            Feature-launch banners shown once per user across all their devices. Changes are live immediately — no deploy.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Announcement
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-dark-900 rounded-xl border border-dark-800 px-6 py-12 text-center">
          <Megaphone className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-sm text-dark-300">No announcements yet</p>
          <p className="text-xs text-dark-500 mt-1">Create one to show a launch banner across workspaces.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(a => {
            const status = statusOf(a);
            return (
              <div key={a._id} className="bg-dark-900 rounded-xl border border-dark-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${status.cls}`}>{status.label}</span>
                      <span className="text-sm font-semibold text-white">{a.title}</span>
                      {a.targetApp && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">{a.targetApp}</span>
                      )}
                    </div>
                    {a.body && <p className="text-xs text-dark-400 mt-1">{a.body}</p>}
                    <p className="text-[11px] text-dark-500 mt-1.5">
                      {AUDIENCE_OPTIONS.find(o => o.value === a.audience)?.label || a.audience}
                      {' · '}
                      {a.orgSlugs?.length ? `Workspaces: ${a.orgSlugs.join(', ')}` : 'All workspaces'}
                      {a.activeUntil ? ` · until ${new Date(a.activeUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                      {' · '}
                      {dismissCounts[a.key] || 0} dismissed
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActive(a)}
                      className={`p-1.5 rounded transition-colors ${a.active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-dark-500 hover:bg-dark-700'}`}
                      title={a.active ? 'Deactivate' : 'Activate'}
                    >
                      <Power size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(a)}
                      className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(a._id)}
                      className={`p-1.5 rounded transition-colors ${
                        confirmDeleteId === a._id
                          ? 'text-white bg-red-600 hover:bg-red-700 px-2 text-xs font-medium'
                          : 'text-dark-400 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      title="Delete"
                    >
                      {confirmDeleteId === a._id ? 'Confirm?' : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setEditing(null)}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }}
        >
          <div
            className="bg-dark-900 rounded-xl border border-dark-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <h2 className="text-lg font-semibold text-white">
                {editing === 'new' ? 'New Announcement' : 'Edit Announcement'}
              </h2>
              <button onClick={() => setEditing(null)} className="p-1 text-dark-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-dark-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  maxLength={120}
                  required
                  placeholder="e.g. To-Do is now live"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-dark-400 mb-1">Body</label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  maxLength={300}
                  rows={2}
                  placeholder="One line on what's new and why it matters"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Button label</label>
                  <input
                    type="text"
                    value={form.ctaLabel}
                    onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))}
                    maxLength={40}
                    placeholder="e.g. Open To-Do"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Button link (in-app path)</label>
                  <input
                    type="text"
                    value={form.ctaLink}
                    onChange={e => setForm(f => ({ ...f, ctaLink: e.target.value }))}
                    maxLength={200}
                    placeholder="/todo/dashboard"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Audience</label>
                  <select
                    value={form.audience}
                    onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
                  >
                    {AUDIENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-dark-500 mt-1">
                    {AUDIENCE_OPTIONS.find(o => o.value === form.audience)?.hint}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-dark-400 mb-1">
                    Target app {needsApp ? '*' : '(optional)'}
                  </label>
                  <input
                    type="text"
                    value={form.targetApp}
                    onChange={e => setForm(f => ({ ...f, targetApp: e.target.value }))}
                    list="known-apps"
                    required={needsApp}
                    placeholder="e.g. todo"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
                  />
                  <datalist id="known-apps">
                    {KNOWN_APPS.map(a => <option key={a} value={a} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Workspaces (blank = all)</label>
                  <input
                    type="text"
                    value={form.orgSlugsText}
                    onChange={e => setForm(f => ({ ...f, orgSlugsText: e.target.value }))}
                    placeholder="e.g. huemot-technology, billing-test"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
                  />
                  <p className="text-[10px] text-dark-500 mt-1">Comma-separated workspace slugs</p>
                </div>
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Show until (optional)</label>
                  <input
                    type="date"
                    value={form.activeUntil}
                    onChange={e => setForm(f => ({ ...f, activeUntil: e.target.value }))}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
                  />
                  <p className="text-[10px] text-dark-500 mt-1">Auto-retires after this date</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded border-dark-600 text-teal-500 focus:ring-teal-500 bg-dark-800"
                />
                <span className="text-sm text-dark-300">Active (visible to targeted users)</span>
              </label>

              <BannerPreview form={form} />

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.title.trim()}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : editing === 'new' ? 'Create Announcement' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
