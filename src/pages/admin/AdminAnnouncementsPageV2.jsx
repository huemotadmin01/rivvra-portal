// ============================================================================
// AdminAnnouncementsPageV2.jsx — platform launch banners, on ds
// ============================================================================
//
// Route: /admin/announcements, inside <SuperAdminRoute><AdminLayout />.
//
// Everything created here is broadcast to real users in every workspace, and
// the page says so itself: "Changes are live immediately — no deploy." So
// create, update, activate/deactivate and delete are all publishing actions.
// Every one of them is spliced in byte-identically; only the chrome is new.
//
// ── The banner mirror is spliced VERBATIM, Tailwind and all ────────────────
// This is the important decision on this page, and it goes the other way from
// the rest of the migration.
//
// `BannerPreview` exists for exactly one reason, stated in legacy's own
// comment: it is a "pixel-faithful copy of AnnouncementBanner so admins see
// exactly what ships". And `components/platform/AnnouncementBanner` is
// imported by BOTH `PlatformLayout` AND `PlatformLayoutV2` — the same
// unmigrated teal Tailwind component renders inside the redesigned shell.
//
// So re-theming this preview to ds tokens would not modernise anything. It
// would make the preview stop matching the banner it is a preview OF, and an
// admin composing a launch banner would sign off on something that is not what
// users receive. The mirror is the feature. It stays.
//
// The slice is drawn tightly around the teal box ALONE — legacy 58-71 — because
// that is the only part that has to match. The "Live preview" caption wrapping
// it is ordinary chrome and moved to ds tokens, which also fixed its contrast
// (legacy's `text-dark-500` measured 3.92:1 on this surface).
//
// ⚠️ Consequence worth recording: when `AnnouncementBanner` is eventually
//    migrated, `BannerPreview` MUST move in the same commit. They are one
//    thing in two files, and nothing but this comment enforces that.
//
// ── Carried across unchanged ────────────────────────────────────────────────
//   • `handleDelete`'s two-click confirm: first click arms `confirmDeleteId`
//     and the button reads "Confirm?", a second click within 4s deletes, and
//     the `prev === id ? null : prev` guard means a timeout for an OLD row
//     cannot disarm a NEWER one. That timing is the only thing between a
//     mis-click and a deleted broadcast.
//   • `handleToggleActive` re-sending the FULL payload
//     (`{ ...toPayload(toForm(a)), active: !a.active }`). Flipping active is a
//     whole-record write, so any field `toForm`/`toPayload` failed to
//     round-trip would be silently blanked by a toggle.
//   • `toForm`'s `new Date(a.activeUntil).toISOString().split('T')[0]` — the
//     UTC slice that feeds the date input, and `toPayload`'s
//     `activeUntil: form.activeUntil || null` which turns a cleared field into
//     an explicit null rather than ''.
//   • `orgSlugs` parsing: split on comma, trim, LOWERCASE, drop empties. The
//     lowercase step is what makes a pasted "Huemot-Technology" match a slug.
//   • `needsApp` driving `required` on Target app. Native validation — as the
//     careers pass showed, adding or removing `required` silently changes what
//     submitting does.
//   • `statusOf`, spliced with its Tailwind `cls` strings intact. Its three
//     branches (inactive / expired-by-date / active) are the classification;
//     ds tones are looked up separately by label (STATUS_TONE) so the logic did
//     not have to be retyped.
//
// ── Structural note (as phases 30, 34, 35) ──────────────────────────────────
// `PageSwitch` cannot gate `/admin/*` — it is outside `OrgProvider` and
// `useOrg()` throws there. Ships directly; legacy kept unreferenced so the
// revert is one line. Pins `data-theme="dark"` to match the AdminLayout shell.
//
// Not triggered: create, update, activate/deactivate, delete.
// ============================================================================

import { useState, useEffect } from 'react';
import announcementsApi from '../../utils/announcementsApi';
import {
  Megaphone, Plus, Pencil, Trash2, X, Loader2, ArrowRight, Eye, Power,
} from 'lucide-react';
import {
  Panel, Button, Chip, Callout, Modal, EmptyState, Spinner,
  Field, Input, Textarea, Select, Switch,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

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

// ds tone per `statusOf` label. Kept OUT of statusOf so that function — whose
// three branches are the actual status contract — could be spliced verbatim
// with its legacy `cls` strings untouched.
const STATUS_TONE = { Inactive: 'neutral', Expired: 'warn', Active: 'brand' };

/**
 * The teal box below is the pixel-faithful mirror of `AnnouncementBanner`, and
 * is spliced verbatim — Tailwind classes and all. See the header note.
 *
 * The "Live preview" caption is NOT part of that mirror; it is chrome around
 * it, so it uses ds tokens. Legacy rendered it at `text-dark-500`, which
 * measured 3.92:1 on this surface — below the 4.5 an 11px label needs.
 */
function BannerPreview({ form }) {
  return (
    <div>
      <p style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        font: "600 11px/1.4 'Inter', system-ui, sans-serif",
        letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)',
      }}>
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

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminAnnouncementsPageV2() {
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

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute, so without this the page inherits
  // whatever a previous org-app visit left on <html>.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1024, margin: '0 auto', display: 'grid', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, font: "700 20px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
            <Megaphone size={20} style={{ color: 'var(--acc-teal)' }} />
            Announcements
          </h1>
          <p style={{ ...microStyle, marginTop: 5, fontSize: 12.5 }}>
            Feature-launch banners shown once per user across all their devices. Changes are live immediately — no deploy.
          </p>
        </div>
        <Button onClick={openCreate} iconLeft={<Plus size={16} />}>New Announcement</Button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
          <Spinner size={26} />
        </div>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState icon={<Megaphone size={26} />} title="No announcements yet">
            Create one to show a launch banner across workspaces.
          </EmptyState>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(a => {
            const status = statusOf(a);
            const armed = confirmDeleteId === a._id;
            return (
              <Panel key={a._id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Chip tone={STATUS_TONE[status.label] || 'neutral'} uppercase>{status.label}</Chip>
                      <span style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{a.title}</span>
                      {a.targetApp && <Chip tone="info">{a.targetApp}</Chip>}
                    </div>
                    {a.body && <p style={{ ...microStyle, color: 'var(--fg-3)', marginTop: 5 }}>{a.body}</p>}
                    <p style={{ ...microStyle, marginTop: 6 }}>
                      {AUDIENCE_OPTIONS.find(o => o.value === a.audience)?.label || a.audience}
                      {' · '}
                      {a.orgSlugs?.length ? `Workspaces: ${a.orgSlugs.join(', ')}` : 'All workspaces'}
                      {a.activeUntil ? ` · until ${new Date(a.activeUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                      {' · '}
                      {dismissCounts[a.key] || 0} dismissed
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(a)}
                      title={a.active ? 'Deactivate' : 'Activate'}
                      aria-label={a.active ? `Deactivate ${a.title}` : `Activate ${a.title}`}
                      style={{ color: a.active ? 'var(--brand-ink)' : 'var(--fg-4)' }}
                      iconLeft={<Power size={14} />}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(a)}
                      title="Edit"
                      aria-label={`Edit ${a.title}`}
                      iconLeft={<Pencil size={14} />}
                    />
                    {/* Two-click delete. The armed state is a real label, not a
                        colour change, so what the second click does is legible
                        rather than inferred. */}
                    <Button
                      variant={armed ? 'danger' : 'ghost'}
                      size="sm"
                      onClick={() => handleDelete(a._id)}
                      title="Delete"
                      aria-label={armed ? `Confirm delete ${a.title}` : `Delete ${a.title}`}
                      style={armed ? undefined : { color: 'var(--fg-4)' }}
                      iconLeft={armed ? undefined : <Trash2 size={14} />}
                    >
                      {armed ? 'Confirm?' : undefined}
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Create / Edit */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        icon={<Megaphone size={16} />}
        title={editing === 'new' ? 'New Announcement' : 'Edit Announcement'}
      >
        {/* The form owns its own submit so `required` + Enter behave exactly as
            legacy: native validation gates the submit, and Enter in any field
            triggers it. */}
        <form onSubmit={handleSave} id="announcement-form" style={{ display: 'grid', gap: 14 }}>
          <Field label="Title" htmlFor="an-title" required>
            <Input
              id="an-title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              maxLength={120}
              required
              placeholder="e.g. To-Do is now live"
              autoFocus
            />
          </Field>

          <Field label="Body" htmlFor="an-body">
            <Textarea
              id="an-body"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              maxLength={300}
              rows={2}
              placeholder="One line on what's new and why it matters"
              style={{ resize: 'none' }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Button label" htmlFor="an-cta-label">
              <Input
                id="an-cta-label"
                value={form.ctaLabel}
                onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))}
                maxLength={40}
                placeholder="e.g. Open To-Do"
              />
            </Field>
            <Field label="Button link (in-app path)" htmlFor="an-cta-link">
              <Input
                id="an-cta-link"
                value={form.ctaLink}
                onChange={e => setForm(f => ({ ...f, ctaLink: e.target.value }))}
                maxLength={200}
                placeholder="/todo/dashboard"
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field
              label="Audience"
              htmlFor="an-audience"
              hint={AUDIENCE_OPTIONS.find(o => o.value === form.audience)?.hint}
            >
              <Select
                id="an-audience"
                value={form.audience}
                onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
              >
                {AUDIENCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Target app ${needsApp ? '' : '(optional)'}`.trim()}
              htmlFor="an-target-app"
              required={needsApp}
            >
              {/* `list` + <datalist> is legacy's: a free-text field with
                  suggestions, NOT a select — an app id not yet in KNOWN_APPS
                  must still be typeable. */}
              <Input
                id="an-target-app"
                value={form.targetApp}
                onChange={e => setForm(f => ({ ...f, targetApp: e.target.value }))}
                list="known-apps"
                required={needsApp}
                placeholder="e.g. todo"
              />
              <datalist id="known-apps">
                {KNOWN_APPS.map(a => <option key={a} value={a} />)}
              </datalist>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Workspaces (blank = all)" htmlFor="an-orgs" hint="Comma-separated workspace slugs">
              <Input
                id="an-orgs"
                value={form.orgSlugsText}
                onChange={e => setForm(f => ({ ...f, orgSlugsText: e.target.value }))}
                placeholder="e.g. huemot-technology, billing-test"
              />
            </Field>
            <Field label="Show until (optional)" htmlFor="an-until" hint="Auto-retires after this date">
              <Input
                id="an-until"
                type="date"
                value={form.activeUntil}
                onChange={e => setForm(f => ({ ...f, activeUntil: e.target.value }))}
              />
            </Field>
          </div>

          {/* Legacy wrapped the checkbox and its text in a <label>, so clicking
              the text toggled it. A ds Switch is a <button>, which a <label>
              does not drive — so the row itself carries the click, and the
              visible text is aria-hidden to avoid being announced twice
              alongside the Switch's own accessible name. */}
          <div
            onClick={() => setForm(f => ({ ...f, active: !f.active }))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: 'fit-content' }}
          >
            <Switch
              checked={form.active}
              onChange={next => setForm(f => ({ ...f, active: next }))}
              label="Active (visible to targeted users)"
            />
            <span aria-hidden style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
              Active (visible to targeted users)
            </span>
          </div>

          <BannerPreview form={form} />

          {error && <Callout tone="danger">{error}</Callout>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Saving...' : editing === 'new' ? 'Create Announcement' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AdminAnnouncementsPageV2;
