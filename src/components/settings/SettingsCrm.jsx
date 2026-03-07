/**
 * SettingsCrm — CRM app settings section
 * Pipeline defaults, currency configuration, and Sales Teams management.
 * Only visible to users with admin role on the CRM app.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import {
  Save, Loader2, AlertCircle, Briefcase,
  UsersRound, Plus, Pencil, Trash2, X, Users,
} from 'lucide-react';
import api from '../../utils/api';
import crmApi from '../../utils/crmApi';

export default function SettingsCrm() {
  const { user } = useAuth();
  const { currentOrg, isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const { showToast } = useToast();
  const isAdmin = getAppRole('crm') === 'admin' || isOrgAdmin || isOrgOwner;
  const canManage = isOrgAdmin || isOrgOwner;
  const orgSlug = currentOrg?.slug;

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Members (needed for team lead/member assignment)
  const [members, setMembers] = useState([]);

  // Sub-teams
  const [teams, setTeams] = useState([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeader, setNewTeamLeader] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [manageTeamId, setManageTeamId] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(null);
  const [teamActionLoading, setTeamActionLoading] = useState(false);
  const [teamError, setTeamError] = useState('');

  useEffect(() => {
    if (!isAdmin || !orgSlug) { setLoading(false); return; }
    let cancelled = false;
    crmApi.getSettings(orgSlug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.settings) setSettings(res.settings);
        else setSettings(res);
      })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, orgSlug]);

  useEffect(() => {
    if (orgSlug && canManage) {
      loadTeams();
      loadMembers();
    }
  }, [orgSlug]);

  // ─── CRM Settings ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!settings) { showToast('No settings to save', 'error'); return; }
    setSaving(true);
    try {
      await crmApi.updateSettings(orgSlug, settings);
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  // ─── Sales Teams ──────────────────────────────────────────────────────────

  async function loadMembers() {
    try {
      const res = await api.getOrgMembers(orgSlug);
      if (res.success) setMembers((res.members || []).filter(m => m.status === 'active'));
    } catch {}
  }

  async function loadTeams() {
    try { const res = await api.getTeams(); if (res.success) setTeams(res.teams || []); } catch {}
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const res = await api.createTeam(newTeamName.trim(), newTeamLeader || null);
      if (res.success) { setShowCreateTeam(false); setNewTeamName(''); setNewTeamLeader(''); loadTeams(); loadMembers(); }
      else { setTeamError(res.error || 'Failed to create team'); setTimeout(() => setTeamError(''), 3000); }
    } catch (err) { setTeamError(err.message); setTimeout(() => setTeamError(''), 3000); } finally { setCreatingTeam(false); }
  }

  async function handleUpdateTeam(teamId, data) {
    setTeamActionLoading(true);
    try {
      const res = await api.updateTeam(teamId, data);
      if (res.success) { setEditingTeam(null); loadTeams(); loadMembers(); }
      else { setTeamError(res.error); setTimeout(() => setTeamError(''), 3000); }
    } catch (err) { setTeamError(err.message); setTimeout(() => setTeamError(''), 3000); } finally { setTeamActionLoading(false); }
  }

  async function handleDeleteTeam(teamId) {
    setTeamActionLoading(true); setConfirmDeleteTeam(null);
    try {
      const res = await api.deleteTeam(teamId);
      if (res.success) { loadTeams(); loadMembers(); }
      else { setTeamError(res.error); setTimeout(() => setTeamError(''), 3000); }
    } catch (err) { setTeamError(err.message); setTimeout(() => setTeamError(''), 3000); } finally { setTeamActionLoading(false); }
  }

  async function handleAddToTeam(teamId, userId) {
    try {
      const res = await api.addTeamMembers(teamId, [userId]);
      if (res.success) { loadTeams(); loadMembers(); }
      else { setTeamError(res.error); setTimeout(() => setTeamError(''), 3000); }
    } catch (err) { setTeamError(err.message); setTimeout(() => setTeamError(''), 3000); }
  }

  async function handleRemoveFromTeam(teamId, userId) {
    try {
      const res = await api.removeTeamMember(teamId, userId);
      if (res.success) { loadTeams(); loadMembers(); }
      else { setTeamError(res.error); setTimeout(() => setTeamError(''), 3000); }
    } catch (err) { setTeamError(err.message); setTimeout(() => setTeamError(''), 3000); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage CRM settings.</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">Failed to load settings. Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline Settings */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={18} className="text-emerald-400" />
              <h3 className="font-semibold text-white">Pipeline Settings</h3>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Default Currency</label>
                <p className="text-xs text-dark-500 mb-2">Currency used for deal revenue and reporting</p>
                <select
                  value={settings?.defaultCurrency ?? 'INR'}
                  onChange={e => update('defaultCurrency', e.target.value)}
                  className="input-field w-auto">
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="SGD">SGD — Singapore Dollar</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Default Pipeline View</label>
                <p className="text-xs text-dark-500 mb-2">View mode when opening the pipeline page</p>
                <select
                  value={settings?.pipelineMode ?? 'kanban'}
                  onChange={e => update('pipelineMode', e.target.value)}
                  className="input-field w-auto">
                  <option value="kanban">Kanban Board</option>
                  <option value="list">List View</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Saving...' : 'Save CRM Settings'}
        </button>

        {/* ─── Sales Teams ──────────────────────────────────────────────── */}
        {canManage && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><UsersRound className="w-4 h-4 text-dark-400" />Sales Teams</h3>
              <button onClick={() => setShowCreateTeam(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rivvra-500 text-dark-950 rounded-lg text-xs font-semibold hover:bg-rivvra-400">
                <Plus className="w-3 h-3" />Create Team
              </button>
            </div>

            {teamError && (
              <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${teamError.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {teamError}
              </div>
            )}

            {showCreateTeam && (
              <div className="mb-4 p-4 bg-dark-800/50 border border-dark-700 rounded-xl space-y-3">
                <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team name" className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 text-sm focus:outline-none focus:border-rivvra-500" autoFocus />
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Team Lead (optional)</label>
                  <select value={newTeamLeader} onChange={(e) => setNewTeamLeader(e.target.value)} className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500">
                    <option value="">Select a team lead...</option>
                    {members.filter(m => !m.teamId && m.userId?.toString() !== user?.id).map(m => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => { setShowCreateTeam(false); setNewTeamName(''); setNewTeamLeader(''); }} className="px-3 py-1.5 text-xs text-dark-400 hover:text-white">Cancel</button>
                  <button onClick={handleCreateTeam} disabled={creatingTeam || !newTeamName.trim()} className="px-4 py-1.5 bg-rivvra-500 text-dark-950 rounded-lg text-xs font-semibold hover:bg-rivvra-400 disabled:opacity-50 flex items-center gap-1.5">
                    {creatingTeam ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}Create
                  </button>
                </div>
              </div>
            )}

            {teams.length === 0 && !showCreateTeam ? (
              <p className="text-dark-500 text-sm text-center py-4">No teams created yet.</p>
            ) : (
              <div className="space-y-3">
                {teams.map((team) => (
                  <div key={team.id} className="px-4 py-3 bg-dark-800/40 border border-dark-700/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        {editingTeam?.id === team.id ? (
                          <div className="flex items-center gap-2">
                            <input type="text" value={editingTeam.name} onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })} className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-white text-sm focus:outline-none focus:border-rivvra-500" />
                            <button onClick={() => handleUpdateTeam(team.id, { name: editingTeam.name })} disabled={teamActionLoading} className="text-rivvra-400 text-xs">Save</button>
                            <button onClick={() => setEditingTeam(null)} className="text-dark-400 text-xs">Cancel</button>
                          </div>
                        ) : (
                          <h4 className="text-sm font-medium text-white">{team.name}</h4>
                        )}
                        <p className="text-xs text-dark-500 mt-0.5">Lead: <span className="text-dark-300">{team.leaderName || 'Unassigned'}</span> · {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setManageTeamId(manageTeamId === team.id ? null : team.id)} className="px-2.5 py-1 text-xs text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg"><Users className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingTeam({ id: team.id, name: team.name, leaderId: team.leaderId })} className="px-2.5 py-1 text-xs text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setConfirmDeleteTeam(team)} className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    {manageTeamId === team.id && (
                      <div className="mt-3 pt-3 border-t border-dark-700">
                        <p className="text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Members</p>
                        <div className="space-y-1 mb-3">
                          {team.members.map((m) => (
                            <div key={m.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-dark-700/50">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs text-white truncate">{m.name || m.email}</span>
                                {m.id === team.leaderId && <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 py-0.5 rounded">Lead</span>}
                              </div>
                              <button onClick={() => handleRemoveFromTeam(team.id, m.id)} className="text-dark-500 hover:text-red-400 flex-shrink-0"><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const unassigned = members.filter(m => !m.teamId && m.orgRole !== 'owner');
                          if (unassigned.length === 0) return <p className="text-dark-500 text-xs">All members are assigned.</p>;
                          return (
                            <>
                              <p className="text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Add Members</p>
                              <div className="space-y-1">
                                {unassigned.map((m) => (
                                  <div key={m.userId} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-dark-700/50">
                                    <span className="text-xs text-dark-300 truncate">{m.name || m.email}</span>
                                    <button onClick={() => handleAddToTeam(team.id, m.userId)} className="text-rivvra-400 hover:text-rivvra-300 text-xs font-medium">Add</button>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                        <div className="mt-3 pt-2 border-t border-dark-700/50">
                          <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-1 tracking-wider">Team Lead</label>
                          <select value={team.leaderId || ''} onChange={(e) => handleUpdateTeam(team.id, { leaderId: e.target.value || null })} className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-white text-xs focus:outline-none focus:border-rivvra-500">
                            <option value="">No lead assigned</option>
                            {team.members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Team Confirmation Modal */}
      {confirmDeleteTeam && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setConfirmDeleteTeam(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10"><Trash2 className="w-5 h-5 text-red-400" /></div>
              <div><h3 className="text-white font-semibold">Delete Team</h3><p className="text-dark-400 text-sm">{confirmDeleteTeam.name}</p></div>
            </div>
            <p className="text-dark-300 text-sm mb-6">This will remove the team. All members will become unassigned.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmDeleteTeam(null)} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Cancel</button>
              <button onClick={() => handleDeleteTeam(confirmDeleteTeam.id)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
