/**
 * SettingsTeam — Unified Users & App Access Management
 *
 * Uses org membership API (/api/org/:slug/members) for all user management.
 * Shows per-user per-app access controls (Odoo-style).
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import {
  Users, UserPlus, UserX, Mail, Loader2, Check,
  ChevronDown, Clock, UsersRound, Plus, Pencil,
  Trash2, X, ArrowLeftRight, Shield, ShieldCheck,
  Crown,
} from 'lucide-react';
import api from '../../utils/api';
import { APP_REGISTRY } from '../../config/apps';
import InviteTeamMemberModal from '../InviteTeamMemberModal';

// Active apps that have roles (exclude coming_soon and settings)
const MANAGEABLE_APPS = Object.values(APP_REGISTRY).filter(
  app => app.id !== 'settings' && app.status === 'active' && app.roles
);

// App badge color schemes
const appBadgeColors = {
  enabled: {
    outreach: 'bg-rivvra-500/10 text-rivvra-400 border-rivvra-500/20',
    timesheet: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    employee: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    crm: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    ats: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  disabled: 'bg-dark-700/30 text-dark-500 border-dark-600/50',
};

export default function SettingsTeam() {
  const { user, impersonateUser } = useAuth();
  const { orgPath } = usePlatform();
  const { currentOrg, isOrgAdmin, isOrgOwner, refetchOrg } = useOrg();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;
  const canManage = isOrgAdmin || isOrgOwner;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  // Expanded member detail panel
  const [expandedMember, setExpandedMember] = useState(null); // userId
  const [editData, setEditData] = useState(null); // { orgRole, appAccess }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Confirm action modals
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Sub-teams (kept from legacy — still useful)
  const [teams, setTeams] = useState([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeader, setNewTeamLeader] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [manageTeamId, setManageTeamId] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(null);
  const [teamActionLoading, setTeamActionLoading] = useState(false);

  // Rate limits
  const [editingRateLimits, setEditingRateLimits] = useState(null);
  const [rateLimitValues, setRateLimitValues] = useState({ dailySendLimit: 50, hourlySendLimit: 6 });
  const [savingRateLimits, setSavingRateLimits] = useState(false);
  const [memberRateLimits, setMemberRateLimits] = useState({});

  useEffect(() => {
    if (orgSlug) {
      loadMembers();
      loadMemberRateLimits();
      if (canManage) loadTeams();
    }
  }, [orgSlug]);

  async function loadMembers() {
    try {
      setLoading(true);
      const res = await api.getOrgMembers(orgSlug);
      if (res.success) {
        setMembers(res.members || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }

  async function loadMemberRateLimits() {
    try {
      const res = await api.getMemberRateLimits();
      if (res.success) {
        const map = {};
        res.members.forEach(m => { map[m.id] = { dailySendLimit: m.dailySendLimit, hourlySendLimit: m.hourlySendLimit }; });
        setMemberRateLimits(map);
      }
    } catch {}
  }

  async function handleSaveRateLimits(memberId) {
    setSavingRateLimits(true);
    try {
      const res = await api.updateMemberRateLimits(memberId, rateLimitValues);
      if (res.success) {
        setMemberRateLimits(prev => ({ ...prev, [memberId]: res.settings }));
        setEditingRateLimits(null);
        if (res.enrollmentsReset > 0) {
          setError(`✅ Limits updated — ${res.enrollmentsReset} pending emails will start sending now`);
          setTimeout(() => setError(''), 5000);
        }
      } else { setError(res.error || 'Failed to update rate limits'); setTimeout(() => setError(''), 3000); }
    } catch (err) { setError(err.message || 'Failed to update rate limits'); setTimeout(() => setError(''), 3000); } finally { setSavingRateLimits(false); }
  }

  async function loadTeams() {
    try { const res = await api.getTeams(); if (res.success) setTeams(res.teams || []); } catch {}
  }

  // ─── Member Detail Panel ─────────────────────────────────────────────────

  function openMemberDetail(member) {
    if (expandedMember === member.userId?.toString()) {
      setExpandedMember(null);
      setEditData(null);
      return;
    }
    setExpandedMember(member.userId?.toString());
    setSaveError('');
    setEditData({
      orgRole: member.orgRole,
      appAccess: { ...member.appAccess },
    });
  }

  function updateAppAccess(appId, field, value) {
    setEditData(prev => ({
      ...prev,
      appAccess: {
        ...prev.appAccess,
        [appId]: {
          ...prev.appAccess[appId],
          [field]: value,
          // When disabling, clear role
          ...(field === 'enabled' && !value ? { role: null } : {}),
          // When enabling without role, set default
          ...(field === 'enabled' && value && !prev.appAccess[appId]?.role
            ? { role: APP_REGISTRY[appId]?.roles?.[APP_REGISTRY[appId].roles.length - 1]?.value || 'member' }
            : {}),
        },
      },
    }));
  }

  async function handleSaveMember(member) {
    if (!editData) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.updateOrgMember(orgSlug, member.userId, {
        orgRole: editData.orgRole,
        appAccess: editData.appAccess,
      });
      if (res.success) {
        // Update local state
        setMembers(prev => prev.map(m =>
          m.userId?.toString() === member.userId?.toString()
            ? { ...m, orgRole: editData.orgRole, appAccess: editData.appAccess }
            : m
        ));
        setExpandedMember(null);
        setEditData(null);
        setSaveError('');
        refetchOrg(); // Refresh org context in case current user's access changed
      } else {
        setSaveError(res.error || 'Failed to update member');
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to update member');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(member) {
    setActionLoading(member.userId?.toString());
    setConfirmAction(null);
    try {
      const res = await api.removeOrgMember(orgSlug, member.userId);
      if (res.success) {
        setMembers(prev => prev.filter(m => m.userId?.toString() !== member.userId?.toString()));
      }
    } catch (err) {
      setError(err.message || 'Failed to remove member');
      setTimeout(() => setError(''), 3000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleImpersonate(memberId) {
    const result = await impersonateUser(memberId);
    if (result.success) navigate(orgPath('/home'));
    else { setError(result.error); setTimeout(() => setError(''), 3000); }
  }

  // ─── Sub-teams (legacy) ──────────────────────────────────────────────────

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const res = await api.createTeam(newTeamName.trim(), newTeamLeader || null);
      if (res.success) { setShowCreateTeam(false); setNewTeamName(''); setNewTeamLeader(''); loadTeams(); loadMembers(); }
      else { setError(res.error || 'Failed to create team'); setTimeout(() => setError(''), 3000); }
    } catch (err) { setError(err.message); setTimeout(() => setError(''), 3000); } finally { setCreatingTeam(false); }
  }

  async function handleUpdateTeam(teamId, data) {
    setTeamActionLoading(true);
    try {
      const res = await api.updateTeam(teamId, data);
      if (res.success) { setEditingTeam(null); loadTeams(); loadMembers(); }
      else { setError(res.error); setTimeout(() => setError(''), 3000); }
    } catch (err) { setError(err.message); setTimeout(() => setError(''), 3000); } finally { setTeamActionLoading(false); }
  }

  async function handleDeleteTeam(teamId) {
    setTeamActionLoading(true); setConfirmDeleteTeam(null);
    try {
      const res = await api.deleteTeam(teamId);
      if (res.success) { loadTeams(); loadMembers(); }
      else { setError(res.error); setTimeout(() => setError(''), 3000); }
    } catch (err) { setError(err.message); setTimeout(() => setError(''), 3000); } finally { setTeamActionLoading(false); }
  }

  async function handleAddToTeam(teamId, userId) {
    try {
      const res = await api.addTeamMembers(teamId, [userId]);
      if (res.success) { loadTeams(); loadMembers(); }
      else { setError(res.error); setTimeout(() => setError(''), 3000); }
    } catch (err) { setError(err.message); setTimeout(() => setError(''), 3000); }
  }

  async function handleRemoveFromTeam(teamId, userId) {
    try {
      const res = await api.removeTeamMember(teamId, userId);
      if (res.success) { loadTeams(); loadMembers(); }
      else { setError(res.error); setTimeout(() => setError(''), 3000); }
    } catch (err) { setError(err.message); setTimeout(() => setError(''), 3000); }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" /></div>;
  }

  const activeMembers = members.filter(m => m.status === 'active');
  const invitedMembers = members.filter(m => m.status === 'invited');

  return (
    <>
      <div className="space-y-6">
        {/* ─── Members Card ─────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Users & Access</h2>
              <p className="text-dark-400 text-sm mt-1">
                {currentOrg?.name && <span className="text-dark-300">{currentOrg.name}</span>}
                {currentOrg?.name && ' · '}{activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}
                {currentOrg?.billing && (
                  <span className="ml-2 text-dark-500">
                    · <span className={currentOrg.billing.seatsUsed >= currentOrg.billing.seatsTotal ? 'text-red-400' : 'text-rivvra-400'}>
                      {currentOrg.billing.seatsUsed}/{currentOrg.billing.seatsTotal}
                    </span> seats used
                  </span>
                )}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors bg-rivvra-500 text-dark-950 hover:bg-rivvra-400"
              >
                <UserPlus className="w-4 h-4" /> Invite Member
              </button>
            )}
          </div>

          {error && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${error.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {error}
            </div>
          )}

          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-2 text-[10px] uppercase text-dark-500 font-semibold tracking-wider border-b border-dark-700/50 mb-2">
            <div className="flex-1 min-w-0">User</div>
            <div className="w-32 text-center">Apps</div>
            <div className="w-24 text-center">Org Role</div>
            {canManage && <div className="w-8" />}
          </div>

          {/* Active Members */}
          <div className="space-y-1">
            {activeMembers.map((member) => {
              const isCurrentUser = member.userId?.toString() === user?.id;
              const isMemberOwner = member.orgRole === 'owner';
              const isExpanded = expandedMember === member.userId?.toString();
              const limits = memberRateLimits[member.userId?.toString()];
              const isEditingLimits = editingRateLimits === member.userId?.toString();

              return (
                <div key={member._id} className={`rounded-xl transition-colors ${isCurrentUser ? 'bg-rivvra-500/5 border border-rivvra-500/20' : 'bg-dark-800/40 border border-dark-700/50'}`}>
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-4 px-4 py-3 ${canManage ? 'cursor-pointer hover:bg-dark-800/60' : ''}`}
                    onClick={() => canManage && openMemberDetail(member)}
                  >
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {member.picture ? (
                        <img src={member.picture} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-dark-600 to-dark-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-dark-300">{member.name?.charAt(0)?.toUpperCase() || '?'}</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{member.name || 'Unnamed'}</span>
                          {isCurrentUser && <span className="text-[10px] text-rivvra-400 bg-rivvra-500/10 px-1.5 py-0.5 rounded font-medium">You</span>}
                        </div>
                        <p className="text-xs text-dark-400 truncate">
                          {member.email}
                          {member.teamName && <span className="ml-1.5 text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] font-medium">{member.teamName}</span>}
                        </p>
                      </div>
                    </div>

                    {/* App access badges */}
                    <div className="w-32 flex items-center justify-center gap-1.5 flex-shrink-0">
                      {MANAGEABLE_APPS.map(app => {
                        const access = member.appAccess?.[app.id];
                        const isEnabled = access?.enabled === true;
                        const colorClass = isEnabled
                          ? (appBadgeColors.enabled[app.id] || appBadgeColors.enabled.outreach)
                          : appBadgeColors.disabled;
                        return (
                          <span
                            key={app.id}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}
                            title={`${app.name}: ${isEnabled ? access.role : 'No access'}`}
                          >
                            <app.icon className="w-3 h-3" />
                            {isEnabled ? '✓' : '—'}
                          </span>
                        );
                      })}
                    </div>

                    {/* Org role badge */}
                    <div className="w-24 flex justify-center flex-shrink-0">
                      <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                        member.orgRole === 'owner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : member.orgRole === 'admin' ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20'
                        : 'bg-dark-700/50 text-dark-300 border border-dark-600'
                      }`}>
                        {member.orgRole === 'owner' && <Crown className="w-3 h-3" />}
                        {member.orgRole === 'admin' && <ShieldCheck className="w-3 h-3" />}
                        {member.orgRole === 'owner' ? 'Owner' : member.orgRole === 'admin' ? 'Admin' : 'Member'}
                      </span>
                    </div>

                    {/* Actions */}
                    {canManage && (
                      <div className="w-8 flex justify-center flex-shrink-0">
                        <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    )}
                  </div>

                  {/* Rate limit badge row */}
                  {limits && member.appAccess?.outreach?.enabled && (
                    <div className="px-4 pb-2 flex items-center gap-2">
                      {canManage ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); isEditingLimits ? setEditingRateLimits(null) : (() => { setEditingRateLimits(member.userId?.toString()); setRateLimitValues({ dailySendLimit: limits.dailySendLimit, hourlySendLimit: limits.hourlySendLimit }); })(); }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors flex-shrink-0 ${
                            isEditingLimits ? 'bg-rivvra-500/20 text-rivvra-400 border border-rivvra-500/30' : 'bg-dark-700/30 text-dark-400 border border-dark-600/50 hover:bg-dark-700/60'
                          }`}
                        >
                          <Mail className="w-3 h-3" />{limits.hourlySendLimit}/hr · {limits.dailySendLimit}/day
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-dark-700/30 text-dark-400 border border-dark-600/50 flex-shrink-0">
                          <Mail className="w-3 h-3" />{limits.hourlySendLimit}/hr · {limits.dailySendLimit}/day
                        </span>
                      )}
                    </div>
                  )}

                  {/* Rate limit editor */}
                  {isEditingLimits && (
                    <div className="px-4 pb-3 pt-1 border-t border-dark-700/50">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-dark-400 whitespace-nowrap">Hourly:</label>
                          <input type="number" min="1" max="50" value={rateLimitValues.hourlySendLimit}
                            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRateLimitValues(p => ({ ...p, hourlySendLimit: Math.min(50, Math.max(1, v)) })); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white text-center focus:outline-none focus:border-rivvra-500" />
                          <span className="text-[11px] text-dark-500">/hr</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-dark-400 whitespace-nowrap">Daily:</label>
                          <input type="number" min="1" max="200" value={rateLimitValues.dailySendLimit}
                            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRateLimitValues(p => ({ ...p, dailySendLimit: Math.min(200, Math.max(1, v)) })); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white text-center focus:outline-none focus:border-rivvra-500" />
                          <span className="text-[11px] text-dark-500">/day</span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          <button onClick={(e) => { e.stopPropagation(); setEditingRateLimits(null); }} className="px-3 py-1 text-[11px] text-dark-400 hover:text-white">Cancel</button>
                          <button onClick={(e) => { e.stopPropagation(); handleSaveRateLimits(member.userId?.toString()); }} disabled={savingRateLimits} className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-50">
                            {savingRateLimits ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── Expanded Detail Panel ──────────────────────────────── */}
                  {isExpanded && editData && canManage && (
                    <div className="px-4 pb-4 pt-2 border-t border-dark-700/50 space-y-4" onClick={(e) => e.stopPropagation()}>

                      {/* Organization Role */}
                      <div>
                        <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Organization Role</label>
                        <div className="flex gap-2">
                          {[
                            { value: 'owner', label: 'Owner', icon: Crown, disabled: !isOrgOwner },
                            { value: 'admin', label: 'Admin', icon: ShieldCheck },
                            { value: 'member', label: 'Member', icon: Shield },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setEditData(prev => ({ ...prev, orgRole: opt.value }))}
                              disabled={opt.disabled || (isMemberOwner && opt.value !== 'owner' && isCurrentUser)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                                editData.orgRole === opt.value
                                  ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
                                  : 'bg-dark-800 border-dark-600 text-dark-400 hover:text-white hover:border-dark-500'
                              } ${opt.disabled || (isMemberOwner && opt.value !== 'owner' && isCurrentUser) ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <opt.icon className="w-3.5 h-3.5" />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* App Access */}
                      <div>
                        <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">App Access</label>
                        <div className="space-y-2">
                          {MANAGEABLE_APPS.map(app => {
                            const access = editData.appAccess?.[app.id] || { enabled: false, role: null };
                            const roles = app.roles || [];
                            return (
                              <div key={app.id} className="flex items-center gap-3 px-3 py-2.5 bg-dark-800/50 rounded-lg border border-dark-700/50">
                                {/* App icon + name */}
                                <app.icon className="w-4 h-4 text-dark-400 flex-shrink-0" />
                                <span className="text-sm text-white font-medium w-24">{app.name}</span>

                                {/* Toggle */}
                                <button
                                  onClick={() => updateAppAccess(app.id, 'enabled', !access.enabled)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                                    access.enabled ? 'bg-rivvra-500' : 'bg-dark-600'
                                  }`}
                                >
                                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                    access.enabled ? 'translate-x-6' : 'translate-x-1'
                                  }`} />
                                </button>

                                {/* Role selector */}
                                {access.enabled && roles.length > 0 ? (
                                  <select
                                    value={access.role || roles[roles.length - 1].value}
                                    onChange={(e) => updateAppAccess(app.id, 'role', e.target.value)}
                                    className="px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-rivvra-500 min-w-[100px]"
                                  >
                                    {roles.map(r => (
                                      <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs text-dark-500 min-w-[100px]">—</span>
                                )}
                              </div>
                            );
                          })}

                          {/* Coming soon apps (display only) */}
                          {Object.values(APP_REGISTRY).filter(a => a.status === 'coming_soon').map(app => (
                            <div key={app.id} className="flex items-center gap-3 px-3 py-2.5 bg-dark-800/20 rounded-lg border border-dark-700/30 opacity-50">
                              <app.icon className="w-4 h-4 text-dark-500 flex-shrink-0" />
                              <span className="text-sm text-dark-400 font-medium w-24">{app.name}</span>
                              <span className="text-xs text-dark-500">Coming Soon</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          {!isCurrentUser && (
                            <>
                              <button
                                onClick={() => handleImpersonate(member.userId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                Login As
                              </button>
                              {!isMemberOwner && (
                                <button
                                  onClick={() => setConfirmAction({ type: 'remove', member })}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  Remove
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {saveError && (
                            <span className="text-xs text-red-400 mr-2">{saveError}</span>
                          )}
                          <button
                            onClick={() => { setExpandedMember(null); setEditData(null); setSaveError(''); }}
                            className="px-4 py-2 text-xs text-dark-400 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveMember(member)}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-50 transition-colors"
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Pending Invites ─────────────────────────────────────────── */}
        {canManage && invitedMembers.length > 0 && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-dark-400" />Pending Invites</h3>
            <div className="space-y-2">
              {invitedMembers.map((invite) => (
                <div key={invite._id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-dark-800/40 border border-dark-700/50">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0"><Mail className="w-4 h-4 text-amber-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{invite.email}</p>
                    <p className="text-xs text-dark-500">
                      Invited as {invite.orgRole || 'member'}
                      {invite.appAccess && (
                        <span className="ml-1">
                          · {Object.entries(invite.appAccess).filter(([, a]) => a.enabled).map(([id]) => APP_REGISTRY[id]?.name).filter(Boolean).join(', ') || 'No apps'}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* App access badges */}
                  <div className="flex items-center gap-1">
                    {MANAGEABLE_APPS.map(app => {
                      const isEnabled = invite.appAccess?.[app.id]?.enabled;
                      return (
                        <span
                          key={app.id}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            isEnabled ? (appBadgeColors.enabled[app.id] || appBadgeColors.enabled.outreach) : appBadgeColors.disabled
                          }`}
                        >
                          <app.icon className="w-3 h-3" />
                          {isEnabled ? '✓' : '—'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Sub-Teams ──────────────────────────────────────────────── */}
        {canManage && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><UsersRound className="w-4 h-4 text-dark-400" />Teams</h3>
              <button onClick={() => setShowCreateTeam(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rivvra-500 text-dark-950 rounded-lg text-xs font-semibold hover:bg-rivvra-400">
                <Plus className="w-3 h-3" />Create Team
              </button>
            </div>

            {showCreateTeam && (
              <div className="mb-4 p-4 bg-dark-800/50 border border-dark-700 rounded-xl space-y-3">
                <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team name" className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 text-sm focus:outline-none focus:border-rivvra-500" autoFocus />
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Team Lead (optional)</label>
                  <select value={newTeamLeader} onChange={(e) => setNewTeamLeader(e.target.value)} className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500">
                    <option value="">Select a team lead...</option>
                    {activeMembers.filter(m => !m.teamId && m.userId?.toString() !== user?.id).map(m => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
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
                          const unassigned = activeMembers.filter(m => !m.teamId && m.orgRole !== 'owner');
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

      {/* ─── Modals ───────────────────────────────────────────────────── */}

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

      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10"><UserX className="w-5 h-5 text-red-400" /></div>
              <div><h3 className="text-white font-semibold">Remove Member</h3><p className="text-dark-400 text-sm">{confirmAction.member.name || confirmAction.member.email}</p></div>
            </div>
            <p className="text-dark-300 text-sm mb-6">This will remove this user from your organization. They will lose access to all apps and data.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Cancel</button>
              <button onClick={() => handleRemoveMember(confirmAction.member)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400">Remove</button>
            </div>
          </div>
        </div>
      )}

      <InviteTeamMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInviteSent={() => loadMembers()}
        orgSlug={orgSlug}
      />
    </>
  );
}
