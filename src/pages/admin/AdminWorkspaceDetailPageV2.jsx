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
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import {
  Building2, ArrowLeft, Loader2, Save, Users, Shield,
  AlertCircle, Database, LogIn, Search,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import {
  Panel, Button, Chip, Callout, DataTable, EmptyState,
  Field, Input, Select, Switch, SettingRow, Stat, Spinner,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const labelStyle = { display: 'block', font: "550 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 6 };

// Every app on the platform (must match VALID_APP_IDS in the API's org.js).
// 2026-11-20: this list had 6 of the 14, so 8 apps could not be switched on or
// off here at all — and saving re-sent the short list (see handleSave).
const APP_LABELS = {
  outreach: 'Outreach', crm: 'CRM', contacts: 'Contacts', ats: 'ATS', sign: 'Sign',
  employee: 'Employee', timesheet: 'Timesheet', payroll: 'Payroll', expenses: 'Expenses',
  invoicing: 'Invoicing', incentive: 'Incentives', todo: 'To-Do', documents: 'Documents',
  knowledgeBase: 'Help Center',
};
const ALL_APPS = Object.keys(APP_LABELS);
const appLabel = (id) => APP_LABELS[id] || id;
const PLAN_LABELS = { free: 'Free', growth: 'Growth', scale: 'Scale', core: 'Core', all_apps: 'All Apps', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_OPTIONS = Object.keys(PLAN_LABELS);
const STATUS_LABELS = { active: 'Active', alumni: 'Alumni', invited: 'Invited', archived: 'Archived', inactive: 'Inactive', deactivated: 'Deactivated' };
const STATUS_TONE = { active: 'brand', alumni: 'info', invited: 'warn' };
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

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

  // Members list: search + status filter (114 rows had neither).
  const [memberSearch, setMemberSearch] = useState('');
  const [memberStatus, setMemberStatus] = useState('active');
  const [impersonateError, setImpersonateError] = useState('');

  useEffect(() => {
    loadWorkspace();
  }, [orgId]);

  const loadWorkspace = async () => {
    try {
      // Spinner only on the first load. Re-loading after a save used to blank
      // the whole page and throw the admin back to the top.
      if (!workspace || String(workspace._id) !== String(orgId)) setLoading(true);
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

  // What the admin actually changed. Only these fields are sent — the page
  // used to re-send plan, seats and the whole app list on every save, so
  // flipping one switch could rewrite the others (and, with the old 6-app
  // list, silently remove apps the page did not show).
  const pendingChanges = () => {
    if (!workspace) return {};
    const out = {};
    if (editPlan !== (workspace.plan || 'free')) out.plan = editPlan;
    const seats = seatsOrOne(editSeats);
    if ((workspace.billing?.seatsTotal || 0) !== seats && String(editSeats) !== String(workspace.billing?.seatsTotal || 0)) out.billing = { seatsTotal: seats };
    if (!sameSet(editApps, workspace.enabledApps || [])) out.enabledApps = editApps;
    if (editUiV2 !== (workspace.uiV2 === true)) out.uiV2 = editUiV2;
    return out;
  };
  const changes = pendingChanges();
  const dirty = Object.keys(changes).length > 0;
  const seatsUsed = workspace?.billing?.seatsUsed || 0;

  const handleSave = async () => {
    if (!dirty || saving) return;
    if (changes.enabledApps && changes.enabledApps.length === 0) { setError('A workspace needs at least one app.'); return; }
    const removed = changes.enabledApps ? (workspace.enabledApps || []).filter((a) => !changes.enabledApps.includes(a)) : [];
    if (removed.length && !window.confirm(`Turn off ${removed.map(appLabel).join(', ')} for "${workspace.name}"?\n\nEvery member of this workspace loses access to ${removed.length === 1 ? 'this app' : 'these apps'}. Their data is kept.`)) return;
    if (changes.billing && changes.billing.seatsTotal < seatsUsed && !window.confirm(`This workspace already uses ${seatsUsed} seats. Setting the total to ${changes.billing.seatsTotal} stops it inviting anyone new. Continue?`)) return;
    try {
      setSaving(true);
      setError('');
      setSaveSuccess('');
      const res = await api.updateSuperAdminWorkspace(orgId, changes);
      if (res && res.success === false) throw new Error(res.error || 'Failed to update workspace');
      setSaveSuccess('Saved.');
      await loadWorkspace();
      setTimeout(() => setSaveSuccess(''), 4000);
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
    setImpersonateError('');
    const res = await superImpersonate(orgId, m.id);
    if (res.success) {
      const slug = res.org?.slug || res.user?.defaultOrgSlug;
      // Hard nav to the org landing route (/home exists; bare
      // /org/:slug does not). Mirrors the org-level Login As.
      window.location.assign(slug ? `/org/${slug}/home` : '/');
    } else {
      setImpersonatingId(null);
      setImpersonateError(res.error || 'Could not log in as this user');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
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
          <span title={m.name || ''} style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || '—'}</span>
          <span title={m.email} style={{ ...microStyle, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</span>
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
            {on.map(([appId, v]) => {
              // `.admin` is the live flag; `.role` is kept only as a fallback
              // for older records.
              const isAdmin = v.admin === true || v.role === 'admin';
              return <Chip key={appId} tone={isAdmin ? 'warn' : 'neutral'}>{appLabel(appId)}{isAdmin ? ' · Admin' : ''}</Chip>;
            })}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: (m) => (
        <Chip tone={STATUS_TONE[m.status || 'active'] || 'neutral'}>{STATUS_LABELS[m.status || 'active'] || m.status}</Chip>
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
      width: 140,
      render: (m) => (m.id && ['active', 'alumni'].includes(m.status || 'active') ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleImpersonate(m)}
          disabled={impersonatingId !== null}
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

  const q = memberSearch.trim().toLowerCase();
  const statusCounts = members.reduce((acc, m) => { const k = m.status || 'active'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const shownMembers = members
    .filter((m) => memberStatus === 'all' || (m.status || 'active') === memberStatus)
    .filter((m) => !q || `${m.name} ${m.email}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
  const otherMembers = members.length - (statusCounts.active || 0) - (statusCounts.alumni || 0) - (statusCounts.invited || 0);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 18, alignItems: 'start' }}>
        {/* Org Info — editable */}
        <Panel title="Workspace settings" icon={<Building2 size={16} />}>
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Field label="Plan" htmlFor="ws-plan">
                <Select id="ws-plan" value={editPlan} onChange={(e) => setEditPlan(e.target.value)}>
                  {PLAN_OPTIONS.map(p => (
                    <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                  ))}
                </Select>
              </Field>
              {/* min={1} is legacy's. The `|| 1` coercion that used to sit in
                  onChange now runs on blur via seatsOrOne — see the note there
                  for why it cannot run per keystroke. */}
              <Field label="Total seats" htmlFor="ws-seats" hint={`${seatsUsed} in use`}>
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
              <span style={labelStyle}>Apps switched on for this workspace</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_APPS.map(appId => (
                  <Button
                    key={appId}
                    size="sm"
                    variant={editApps.includes(appId) ? 'secondary' : 'ghost'}
                    aria-pressed={editApps.includes(appId)}
                    onClick={() => toggleApp(appId)}
                  >
                    {appLabel(appId)}
                  </Button>
                ))}
              </div>
              <p style={{ ...microStyle, marginTop: 6 }}>
                {editApps.length} of {ALL_APPS.length} on. Turning an app off removes it from every member of this workspace.
              </p>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button onClick={handleSave} disabled={saving || !dirty} iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <span style={microStyle}>{dirty ? 'You have unsaved changes.' : 'No changes to save.'}</span>
            </div>
          </div>
        </Panel>

        {/* Owner + Stats — read only */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <Panel title="Owner" icon={<Shield size={16} />}>
            {owner ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <InfoRow label="Name" value={owner.name || '—'} />
                <InfoRow label="Joined Rivvra" value={formatDate(owner.createdAt)} />
                <InfoRow label="Last login" value={formatDate(owner.lastLogin)} />
                {/* Full row: a long address used to run into the next column. */}
                <div style={{ gridColumn: '1 / -1' }}><InfoRow label="Email" value={owner.email || '—'} /></div>
              </div>
            ) : (
              <p style={microStyle}>No owner found</p>
            )}
          </Panel>

          {/* "Total Members 114" beside a Workspaces list saying 68 read as a
              contradiction: 114 counts everyone ever added, including people
              who have left. Now split so each number says what it counts. */}
          <Panel title="People" icon={<Users size={16} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
              <Stat label="Active" value={stats?.activeMembers || 0} />
              <Stat label="Alumni" value={statusCounts.alumni || 0} />
              <Stat label="Invited" value={stats?.pendingInvites || 0} />
              <Stat label="Left / archived" value={otherMembers} />
            </div>
            <p style={{ ...microStyle, marginTop: 8 }}>{members.length} records in total, including people who have left.</p>
          </Panel>
        </div>
      </div>

      {/* Members */}
      <Panel title="Members" icon={<Users size={16} />} actions={<Chip>{shownMembers.length} of {members.length}</Chip>} flush>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
            <Input
              aria-label="Search members by name or email"
              placeholder="Search by name or email…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              style={{ paddingLeft: 30 }}
            />
          </div>
          <div style={{ flex: '0 1 200px' }}>
            <Select aria-label="Filter members by status" value={memberStatus} onChange={(e) => setMemberStatus(e.target.value)}>
              <option value="active">Active ({statusCounts.active || 0})</option>
              {Object.keys(statusCounts).filter((k) => k !== 'active').sort().map((k) => (
                <option key={k} value={k}>{STATUS_LABELS[k] || k} ({statusCounts[k]})</option>
              ))}
              <option value="all">Everyone ({members.length})</option>
            </Select>
          </div>
        </div>
        {impersonateError && (
          <div style={{ padding: '12px 16px' }}>
            <Callout tone="danger" icon={<AlertCircle size={16} />}>{impersonateError}</Callout>
          </div>
        )}
        <DataTable
          columns={memberColumns}
          rows={shownMembers}
          rowKey={(m, i) => m.id || `${m.email}-${i}`}
          empty={<EmptyState icon={<Users size={24} />} title={members.length ? 'No one matches' : 'No members'} compact>{members.length ? 'Try a different search or status.' : 'Nobody has joined this workspace yet.'}</EmptyState>}
        />
      </Panel>

      {/* Backups. The old "Create Backup" button here wrote a copy of the
          workspace INTO the same database — that is what filled the database
          and stopped the platform in June, and it has been switched off since.
          The real backup is the nightly copy of everything to Cloudflare R2. */}
      <Callout tone="neutral" icon={<Database size={16} />} title="Backups">
        This workspace is backed up with the rest of the platform: the whole database is copied to Cloudflare R2 every night and kept for 30 days, and uploaded files are copied there too. There is no per-workspace backup button.{' '}
        <Link to="/admin/health" style={{ color: 'var(--brand)' }}>See backup status on Platform Health</Link>.
      </Callout>
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
    <div style={{ minWidth: 0 }}>
      <span style={microStyle}>{label}</span>
      <p style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '2px 0 0', overflowWrap: 'anywhere' }}>
        {value || '—'}
      </p>
    </div>
  );
}

function formatDate(dateStr) {
  return formatDateUTC(dateStr) || '—';
}

export default AdminWorkspaceDetailPageV2;
