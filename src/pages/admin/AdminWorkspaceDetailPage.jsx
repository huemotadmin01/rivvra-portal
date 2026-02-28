import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import {
  Building2, ArrowLeft, Loader2, Save, Users, Shield,
  Clock, AlertCircle, Globe, Calendar, ChevronRight
} from 'lucide-react';

const ALL_APPS = ['outreach', 'timesheet', 'employee', 'contacts', 'crm', 'ats'];
const PLAN_OPTIONS = ['trial', 'pro', 'enterprise'];
const TRIAL_STATUS_OPTIONS = ['none', 'active', 'grace', 'archived'];

function AdminWorkspaceDetailPage() {
  const { orgId } = useParams();
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
  const [editTrialStatus, setEditTrialStatus] = useState('');

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
      setEditPlan(res.workspace.plan || 'trial');
      setEditSeats(res.workspace.billing?.seatsTotal || 0);
      setEditApps(res.workspace.enabledApps || []);
      setEditTrialStatus(res.workspace.trial?.status || 'none');
    } catch (err) {
      setError(err.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSaveSuccess('');

      await api.updateSuperAdminWorkspace(orgId, {
        plan: editPlan,
        billing: { seatsTotal: editSeats },
        enabledApps: editApps,
        trial: { status: editTrialStatus },
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
                onChange={(e) => setEditSeats(parseInt(e.target.value) || 1)}
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Trial Status */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wider">Trial Status</label>
            <select
              value={editTrialStatus}
              onChange={(e) => setEditTrialStatus(e.target.value)}
              className="input-field text-sm"
            >
              {TRIAL_STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
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

        {/* Trial & Billing Info — Read Only */}
        <div className="space-y-6">
          {/* Trial Info */}
          <div className="bg-dark-900/50 border border-dark-800 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Trial Details
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Status" value={workspace?.trial?.status || 'none'} />
              <InfoRow label="Started" value={formatDate(workspace?.trial?.startedAt)} />
              <InfoRow label="Expires" value={formatDate(workspace?.trial?.expiresAt)} />
              <InfoRow label="Grace Expires" value={formatDate(workspace?.trial?.graceExpiresAt)} />
              <InfoRow label="Hard Delete At" value={formatDate(workspace?.trial?.hardDeleteAt)} />
              <InfoRow label="Converted" value={formatDate(workspace?.trial?.convertedAt)} />
            </div>
          </div>

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
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-dark-400">No members</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default AdminWorkspaceDetailPage;
