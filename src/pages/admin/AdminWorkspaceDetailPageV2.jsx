// ============================================================================
// AdminWorkspaceDetailPageV2.jsx — platform super-admin workspace record, on ds
// ============================================================================
//
// Route: /admin/workspaces/:orgId, inside <SuperAdminRoute><AdminLayout />.
//
// This is the most destructive page in the product. From here a Rivvra
// super-admin can overwrite an entire customer organization's data from a
// backup, delete backups, change a workspace's plan and seat count, and log in
// as any member of any org. None of that behaviour moves — every handler is
// spliced in byte-identically and only the chrome is new.
//
// ── The confirmations deliberately stay as window.confirm ───────────────────
// Restore is guarded by TWO sequential `window.confirm` calls, delete by one,
// and impersonation by one. It is tempting to make these ds `ConfirmDialog`s.
// I did not, on purpose:
//
//   • A native confirm is a real modal. It blocks the event loop, cannot be
//     click-through dismissed, cannot be defeated by a mis-scoped Escape
//     handler, and cannot double-fire from a re-render.
//   • The second restore confirm exists purely as FRICTION — "Are you
//     absolutely sure? This action cannot be undone." Reimplementing a
//     two-stage dialog is new code on the one path in this app that can
//     destroy a customer's data, in exchange for nicer typography on a
//     super-admin-only screen. That is a bad trade.
//
// So the guards are carried across untouched. This is the one place in the
// migration where the legacy control is the safer control.
//
// ── Structural note (same as AdminPayrollSettingsPage) ──────────────────────
// `PageSwitch` CANNOT gate this route: `/admin/*` lives outside `OrgProvider`
// and `useOrg()` throws there, so the switch would crash rather than fall back.
// The v2 page ships directly and the legacy file is kept unreferenced, which
// makes reverting a one-line change. Defensible only because the whole area is
// behind `SuperAdminRoute`.
//
// `AdminLayout` is a hard-dark legacy shell and nothing under `/admin/*` writes
// `data-theme`, so ds tokens would resolve from `:root` and happen to agree.
// The page pins `data-theme="dark"` rather than rely on that — a client-side
// hop from the org app in light theme carries the attribute over.
//
// ── Carried across unchanged, and each one matters ──────────────────────────
//   • `handleSave`'s payload shape: `billing: { seatsTotal: editSeats }` is
//     NESTED. Flattening it would write a `seatsTotal` the API ignores and
//     silently drop a seat-count change.
//   • `editUiV2` — this flag is the redesign rollout switch itself. It is what
//     `PageSwitch` reads on every other page in this migration.
//   • `loadWorkspace`'s initialisers, including `res.workspace.uiV2 === true`
//     (strict, so a missing field reads false rather than undefined).
//   • Both backup tables' id fallback `b._id || b.id`, used for the row key,
//     the in-flight spinner match, and the request path.
//
// Not triggered: save, create backup, restore backup, delete backup, Login As.
// ============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import {
  Building2, ArrowLeft, Loader2, Save, Users, Shield,
  AlertCircle, Database, RotateCcw, Trash2, Download, LogIn,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import {
  Panel, Button, Chip, Callout, DataTable, EmptyState,
  Field, Input, Select, Switch, SettingRow, Stat, Spinner,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const labelStyle = { display: 'block', font: "550 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 6 };

const ALL_APPS = ['outreach', 'timesheet', 'employee', 'contacts', 'crm', 'ats'];
const PLAN_OPTIONS = ['free', 'core', 'all_apps', 'pro', 'enterprise'];

// Lifted verbatim out of legacy's backup row loop. `dateStr` is not only
// displayed — it is interpolated into the restore confirmation the admin reads
// before overwriting an org, so the table cell and the warning must be the
// same string. Sharing one helper keeps that true by construction.
const backupDateStr = (b) => new Date(b.createdAt).toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});
const backupSizeStr = (b) => (b.sizeBytes >= 1048576
  ? `${(b.sizeBytes / 1048576).toFixed(1)} MB`
  : `${Math.round(b.sizeBytes / 1024)} KB`);

const ROLE_TONE = { owner: 'purple', admin: 'warn', member: 'neutral' };

// ── Main Page ──────────────────────────────────────────────────────────────
// Seat count holds the raw input string while the field is focused so it can
// be cleared and retyped; `parseInt(x) || 1` per keystroke snapped it back to 1
// the instant it went blank. Normalised on blur and again in handleSave — this
// writes billing.seatsTotal, so a raw string must never reach the payload.
const seatsOrOne = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

function AdminWorkspaceDetailPageV2() {
  const { orgId } = useParams();
  const { superImpersonate } = useAuth();
  const [impersonatingId, setImpersonatingId] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [owner, setOwner] = useState(null);
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Editable fields
  const [editPlan, setEditPlan] = useState('');
  const [editSeats, setEditSeats] = useState(0);
  const [editApps, setEditApps] = useState([]);
  const [editUiV2, setEditUiV2] = useState(false);

  // Backup state
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [backupError, setBackupError] = useState('');

  useEffect(() => {
    loadWorkspace();
  }, [orgId]);

  const loadWorkspace = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getSuperAdminWorkspace(orgId);
      setWorkspace(res.workspace);
      setOwner(res.owner);
      setMembers(res.members || []);
      setStats(res.stats);

      // Set editable fields
      setEditPlan(res.workspace.plan || 'free');
      setEditSeats(res.workspace.billing?.seatsTotal || 0);
      setEditApps(res.workspace.enabledApps || []);
      setEditUiV2(res.workspace.uiV2 === true);
    } catch (err) {
      setError(err.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  };

  // Load backups for this org
  const loadBackups = async () => {
    try {
      setBackupsLoading(true);
      setBackupError('');
      const res = await api.request(`/api/superadmin/backups/${orgId}`);
      setBackups(res.backups || []);
    } catch (err) {
      setBackupError(err.message || 'Failed to load backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) loadBackups();
  }, [orgId]);

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      setBackupError('');
      await api.request(`/api/superadmin/backups/${orgId}/create`, { method: 'POST' });
      await loadBackups();
    } catch (err) {
      setBackupError(err.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (backupId, backupDate) => {
    const first = window.confirm(`Restore backup from ${backupDate}? This will overwrite all current data for this organization.`);
    if (!first) return;
    const second = window.confirm('Are you absolutely sure? This action cannot be undone. All current data will be replaced with the backup data.');
    if (!second) return;

    try {
      setRestoringId(backupId);
      setBackupError('');
      await api.request(`/api/superadmin/backups/${backupId}/restore`, { method: 'POST' });
      await loadWorkspace();
      await loadBackups();
    } catch (err) {
      setBackupError(err.message || 'Failed to restore backup');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteBackup = async (backupId) => {
    if (!window.confirm('Delete this backup? This cannot be undone.')) return;
    try {
      setDeletingId(backupId);
      setBackupError('');
      await api.request(`/api/superadmin/backups/${backupId}`, { method: 'DELETE' });
      await loadBackups();
    } catch (err) {
      setBackupError(err.message || 'Failed to delete backup');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSaveSuccess('');

      await api.updateSuperAdminWorkspace(orgId, {
        plan: editPlan,
        billing: { seatsTotal: seatsOrOne(editSeats) },
        enabledApps: editApps,
        uiV2: editUiV2,
      });

      setSaveSuccess('Workspace updated successfully');
      await loadWorkspace();
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update workspace');
    } finally {
      setSaving(false);
    }
  };

  const toggleApp = (appId) => {
    setEditApps(prev =>
      prev.includes(appId) ? prev.filter(a => a !== appId) : [...prev, appId]
    );
  };

  // Lifted out of the members-table JSX into a named handler. The confirm
  // copy, the impersonate call and the hard-nav target are unchanged; only the
  // nesting is. Asserted by string count rather than byte-diff, since the
  // indentation necessarily differs.
  const handleImpersonate = async (m) => {
    if (!window.confirm(`Log in as ${m.name || m.email} in "${workspace?.name || 'this workspace'}"?\n\nThis is a Rivvra super-admin action and is recorded in the audit log.`)) return;
    setImpersonatingId(m.id);
    const res = await superImpersonate(orgId, m.id);
    if (res.success) {
      const slug = res.org?.slug || res.user?.defaultOrgSlug;
      // Hard nav to the org landing route (/home exists; bare
      // /org/:slug does not). Mirrors the org-level Login As.
      window.location.assign(slug ? `/org/${slug}/home` : '/');
    } else {
      setImpersonatingId(null);
      alert(res.error || 'Failed to log in as this user');
    }
  };

  if (loading) {
    return (
      <div data-theme="dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div data-theme="dark" style={{ padding: 24, display: 'grid', gap: 16 }}>
        <div>
          <BackToWorkspaces />
        </div>
        <Callout tone="danger" icon={<AlertCircle size={16} />}>{error}</Callout>
      </div>
    );
  }

  const memberColumns = [
    {
      key: 'member',
      header: 'Member',
      width: 240,
      render: (m) => (
        <span style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550 }}>{m.name || '—'}</span>
          <span style={{ ...microStyle, display: 'block' }}>{m.email}</span>
        </span>
      ),
    },
    {
      key: 'orgRole',
      header: 'Org Role',
      width: 110,
      render: (m) => (
        <Chip tone={ROLE_TONE[m.orgRole] || ROLE_TONE.member} uppercase>
          {(m.orgRole || 'member').toUpperCase()}
        </Chip>
      ),
    },
    {
      key: 'appAccess',
      header: 'App Access',
      wrap: true,
      render: (m) => {
        const on = Object.entries(m.appAccess || {}).filter(([, v]) => v.enabled);
        if (on.length === 0) return <span style={microStyle}>None</span>;
        return (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {on.map(([appId, v]) => (
              <Chip key={appId}>{appId}:{v.role || 'member'}</Chip>
            ))}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: (m) => (
        <Chip tone={m.status === 'active' ? 'brand' : 'warn'}>{m.status || 'active'}</Chip>
      ),
    },
    {
      key: 'joinedAt',
      header: 'Joined',
      width: 130,
      muted: true,
      render: (m) => formatDate(m.joinedAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 120,
      render: (m) => (m.id ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleImpersonate(m)}
          disabled={impersonatingId === m.id}
          title="Log in as this user (super-admin)"
          iconLeft={impersonatingId === m.id
            ? <Loader2 size={14} className="animate-spin" />
            : <LogIn size={14} />}
        >
          Login As
        </Button>
      ) : <span style={microStyle}>—</span>),
    },
  ];

  const backupColumns = [
    { key: 'date', header: 'Date', width: 190, render: (b) => backupDateStr(b) },
    { key: 'size', header: 'Size', width: 100, muted: true, render: (b) => backupSizeStr(b) },
    { key: 'collectionCount', header: 'Collections', width: 120, muted: true, render: (b) => b.collectionCount ?? '—' },
    { key: 'documentCount', header: 'Documents', width: 120, muted: true, render: (b) => b.documentCount ?? '—' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 190,
      render: (b) => {
        const id = b._id || b.id;
        return (
          <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRestoreBackup(id, backupDateStr(b))}
              disabled={restoringId === id}
              iconLeft={restoringId === id
                ? <Loader2 size={12} className="animate-spin" />
                : <RotateCcw size={12} />}
            >
              Restore
            </Button>
            {/* `danger`, not `secondary`: this is the only visual signal that
                the two buttons do very different things. */}
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDeleteBackup(id)}
              disabled={deletingId === id}
              iconLeft={deletingId === id
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />}
            >
              Delete
            </Button>
          </span>
        );
      },
    },
  ];

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute, so without this the page inherits
  // whatever a previous org-app visit left on <html>.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', display: 'grid', gap: 18 }}>
      {/* Back + Header */}
      <div>
        <div style={{ marginBottom: 10 }}>
          <BackToWorkspaces />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 46, height: 46, borderRadius: 'var(--r-3, 14px)', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface-2)', color: 'var(--fg-3)',
          }}>
            <Building2 size={22} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ font: "700 22px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
              {workspace?.name}
            </h1>
            <p style={{ ...microStyle, marginTop: 3 }}>
              {workspace?.slug} · {workspace?.domain || 'No domain'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && <Callout tone="danger" icon={<AlertCircle size={16} />}>{error}</Callout>}
      {saveSuccess && <Callout tone="brand">{saveSuccess}</Callout>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18, alignItems: 'start' }}>
        {/* Org Info — editable */}
        <Panel title="Organization Settings" icon={<Building2 size={16} />}>
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Field label="Plan" htmlFor="ws-plan">
                <Select id="ws-plan" value={editPlan} onChange={(e) => setEditPlan(e.target.value)}>
                  {PLAN_OPTIONS.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </Select>
              </Field>
              {/* min={1} is legacy's. The `|| 1` coercion that used to sit in
                  onChange now runs on blur via seatsOrOne — see the note there
                  for why it cannot run per keystroke. */}
              <Field label="Total Seats" htmlFor="ws-seats">
                <Input
                  id="ws-seats"
                  type="number"
                  min={1}
                  value={editSeats}
                  onChange={(e) => setEditSeats(e.target.value)}
                  onBlur={(e) => setEditSeats(seatsOrOne(e.target.value))}
                />
              </Field>
            </div>

            <div>
              <span style={labelStyle}>Enabled Apps</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_APPS.map(appId => (
                  <Button
                    key={appId}
                    size="sm"
                    variant={editApps.includes(appId) ? 'secondary' : 'ghost'}
                    aria-pressed={editApps.includes(appId)}
                    onClick={() => toggleApp(appId)}
                  >
                    {appId.charAt(0).toUpperCase() + appId.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Redesign rollout flag — the switch every PageSwitch in this
                migration reads. */}
            <SettingRow
              label="Redesign (UI v2)"
              description="Renders the redesigned app shell for every member of this workspace. Rollback is instant — flip off and members get the legacy UI on their next org fetch."
              control={(
                <Switch
                  checked={editUiV2}
                  onChange={(next) => setEditUiV2(next)}
                  label="Redesign (UI v2) shell"
                />
              )}
            />

            <div>
              <Button onClick={handleSave} disabled={saving} iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                Save Changes
              </Button>
            </div>
          </div>
        </Panel>

        {/* Owner + Stats — read only */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <Panel title="Owner" icon={<Shield size={16} />}>
            {owner ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <InfoRow label="Name" value={owner.name || '—'} />
                <InfoRow label="Email" value={owner.email || '—'} />
                <InfoRow label="Joined" value={formatDate(owner.createdAt)} />
                <InfoRow label="Last Login" value={formatDate(owner.lastLogin)} />
              </div>
            ) : (
              <p style={microStyle}>No owner found</p>
            )}
          </Panel>

          <Panel title="Stats" icon={<Users size={16} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
              <Stat label="Total Members" value={stats?.totalMembers || 0} />
              <Stat label="Active" value={stats?.activeMembers || 0} />
              <Stat label="Pending" value={stats?.pendingInvites || 0} />
            </div>
          </Panel>
        </div>
      </div>

      {/* Members */}
      <Panel title="Members" icon={<Users size={16} />} actions={<Chip>{members.length}</Chip>} flush>
        <DataTable
          columns={memberColumns}
          rows={members}
          rowKey={(m, i) => m.id || i}
          empty={<EmptyState icon={<Users size={24} />} title="No members" compact>Nobody has joined this workspace yet.</EmptyState>}
        />
      </Panel>

      {/* Backups */}
      <Panel
        title="Backups"
        icon={<Database size={16} />}
        actions={(
          <Button
            size="sm"
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            iconLeft={creatingBackup ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          >
            Create Backup
          </Button>
        )}
        flush
      >
        {backupError && (
          <div style={{ padding: '12px 16px' }}>
            <Callout tone="danger" icon={<AlertCircle size={16} />}>{backupError}</Callout>
          </div>
        )}
        <DataTable
          columns={backupColumns}
          rows={backups}
          rowKey={(b) => b._id || b.id}
          loading={backupsLoading}
          loadingRows={3}
          empty={(
            <EmptyState icon={<Database size={24} />} title="No backups yet" compact>
              Create one to get started.
            </EmptyState>
          )}
        />
      </Panel>
    </div>
  );
}

/** Legacy used a react-router <Link>, i.e. a SOFT nav. `Button as="a" href`
 *  alone is a full page load, which in an SPA means booting the whole app to
 *  go one route up. Keeping the href preserves middle-click and open-in-new-tab
 *  while the click handler does the soft nav — which is exactly what <Link>
 *  does internally. */
function BackToWorkspaces() {
  const navigate = useNavigate();
  return (
    <Button
      as="a"
      href="/admin/workspaces"
      variant="ghost"
      size="sm"
      iconLeft={<ArrowLeft size={16} />}
      onClick={(e) => { e.preventDefault(); navigate('/admin/workspaces'); }}
    >
      Back to Workspaces
    </Button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <span style={microStyle}>{label}</span>
      <p style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '2px 0 0' }}>
        {value || '—'}
      </p>
    </div>
  );
}

function formatDate(dateStr) {
  return formatDateUTC(dateStr) || '—';
}

export default AdminWorkspaceDetailPageV2;
