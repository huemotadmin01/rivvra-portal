import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import {
  Building2, ArrowLeft, Loader2, Save, Users, Shield,
  AlertCircle, Globe, Calendar, ChevronRight,
  Database, RotateCcw, Trash2, Download, LogIn
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';

const ALL_APPS = ['outreach', 'timesheet', 'employee', 'contacts', 'crm', 'ats'];
const PLAN_OPTIONS = ['free', 'core', 'all_apps', 'pro', 'enterprise'];

// Seat count holds the raw input string while the field is focused so it can
// be cleared and retyped; `parseInt(x) || 1` per keystroke snapped it back to 1
// the instant it went blank. Normalised on blur and again in handleSave — this
// writes billing.seatsTotal, so a raw string must never reach the payload.
const seatsOrOne = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

function AdminWorkspaceDetailPage() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="p-6">
        <Link to="/admin/workspaces" className="flex items-center gap-2 text-dark-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Workspaces
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/admin/workspaces" className="flex items-center gap-2 text-dark-400 hover:text-white text-sm mb-4 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Workspaces
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-dark-800 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-dark-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{workspace?.name}</h1>
            <p className="text-dark-400 text-sm">{workspace?.slug} · {workspace?.domain || 'No domain'}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
          {saveSuccess}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Org Info — Editable */}
        <div className="bg-dark-900/50 border border-dark-800 rounded-xl p-5 space-y-5">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" /> Organization Settings
          </h2>

          <div className="grid grid-cols-2 gap-4">
            {/* Plan */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wider">Plan</label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="input-field text-sm"
              >
                {PLAN_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Seats */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wider">Total Seats</label>
              <input
                type="number"
                min={1}
                value={editSeats}
                onChange={(e) => setEditSeats(e.target.value)}
                onBlur={(e) => setEditSeats(seatsOrOne(e.target.value))}
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Enabled Apps */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2 uppercase tracking-wider">Enabled Apps</label>
            <div className="flex flex-wrap gap-2">
              {ALL_APPS.map(appId => (
                <button
                  key={appId}
                  onClick={() => toggleApp(appId)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    editApps.includes(appId)
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-dark-800/50 text-dark-500 border border-dark-700 hover:text-dark-300'
                  }`}
                >
                  {appId.charAt(0).toUpperCase() + appId.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Redesign rollout flag */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2 uppercase tracking-wider">Redesign (UI v2)</label>
            <button
              onClick={() => setEditUiV2(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                editUiV2
                  ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20'
                  : 'bg-dark-800/50 text-dark-500 border border-dark-700 hover:text-dark-300'
              }`}
            >
              {editUiV2 ? 'v2 shell ON' : 'v2 shell OFF'}
            </button>
            <p className="text-xs text-dark-500 mt-1.5">
              Renders the redesigned app shell for every member of this workspace. Rollback is instant — flip off and members get the legacy UI on their next org fetch.
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-dark-950 font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>

        {/* Billing & Owner Info — Read Only */}
        <div className="space-y-6">
          {/* Owner Info */}
          <div className="bg-dark-900/50 border border-dark-800 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" /> Owner
            </h2>
            {owner ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Name" value={owner.name || '—'} />
                <InfoRow label="Email" value={owner.email || '—'} />
                <InfoRow label="Joined" value={formatDate(owner.createdAt)} />
                <InfoRow label="Last Login" value={formatDate(owner.lastLogin)} />
              </div>
            ) : (
              <p className="text-dark-400 text-sm">No owner found</p>
            )}
          </div>

          {/* Stats */}
          <div className="bg-dark-900/50 border border-dark-800 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" /> Stats
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Total Members" value={stats?.totalMembers || 0} />
              <StatBox label="Active" value={stats?.activeMembers || 0} />
              <StatBox label="Pending" value={stats?.pendingInvites || 0} />
            </div>
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-800">
          <h2 className="text-base font-semibold text-white">Members ({members.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-800">
                <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Member</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Org Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">App Access</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Joined</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-dark-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-dark-400">No members</td>
                </tr>
              ) : (
                members.map((m, idx) => (
                  <tr key={m.id || idx} className="border-b border-dark-800/50">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-white">{m.name || '—'}</p>
                      <p className="text-xs text-dark-500">{m.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={m.orgRole} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(m.appAccess || {})
                          .filter(([, v]) => v.enabled)
                          .map(([appId, v]) => (
                            <span key={appId} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-dark-300">
                              {appId}:{v.role || 'member'}
                            </span>
                          ))}
                        {Object.keys(m.appAccess || {}).filter(k => m.appAccess[k]?.enabled).length === 0 && (
                          <span className="text-xs text-dark-500">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        m.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {m.status || 'active'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-dark-400">
                        {formatDate(m.joinedAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {m.id ? (
                        <button
                          onClick={async () => {
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
                          }}
                          disabled={impersonatingId === m.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                          title="Log in as this user (super-admin)"
                        >
                          {impersonatingId === m.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <LogIn className="w-3.5 h-3.5" />}
                          Login As
                        </button>
                      ) : (
                        <span className="text-xs text-dark-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backups Section */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-400" /> Backups
          </h2>
          <button
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-dark-950 font-semibold text-xs transition-colors disabled:opacity-50"
          >
            {creatingBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Create Backup
          </button>
        </div>

        {backupError && (
          <div className="px-5 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {backupError}
          </div>
        )}

        {backupsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
          </div>
        ) : backups.length === 0 ? (
          <div className="px-5 py-12 text-center text-dark-400 text-sm">
            No backups yet. Create one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-800">
                  <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Size</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Collections</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">Documents</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-dark-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => {
                  const dateStr = new Date(b.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  });
                  const sizeStr = b.sizeBytes >= 1048576
                    ? `${(b.sizeBytes / 1048576).toFixed(1)} MB`
                    : `${Math.round(b.sizeBytes / 1024)} KB`;
                  return (
                    <tr key={b._id || b.id} className="border-b border-dark-800/50">
                      <td className="px-5 py-3 text-sm text-white">{dateStr}</td>
                      <td className="px-5 py-3 text-sm text-dark-300">{sizeStr}</td>
                      <td className="px-5 py-3 text-sm text-dark-300">{b.collectionCount ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-dark-300">{b.documentCount ?? '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestoreBackup(b._id || b.id, dateStr)}
                            disabled={restoringId === (b._id || b.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                          >
                            {restoringId === (b._id || b.id)
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RotateCcw className="w-3 h-3" />}
                            Restore
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b._id || b.id)}
                            disabled={deletingId === (b._id || b.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {deletingId === (b._id || b.id)
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2 className="w-3 h-3" />}
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <span className="text-xs text-dark-500">{label}</span>
      <p className="text-dark-300 font-medium">{value || '—'}</p>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="text-center py-2">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-dark-400 mt-1">{label}</p>
    </div>
  );
}

function RoleBadge({ role }) {
  const colors = {
    owner: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    admin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    member: 'bg-dark-700/50 text-dark-300 border-dark-600',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors[role] || colors.member}`}>
      {(role || 'member').toUpperCase()}
    </span>
  );
}

function formatDate(dateStr) {
  return formatDateUTC(dateStr) || '—';
}

export default AdminWorkspaceDetailPage;
