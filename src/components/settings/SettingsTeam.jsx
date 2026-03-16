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
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import {
  Users, UserPlus, UserX, Mail, Loader2, Check,
  ChevronDown, Clock, X, ArrowLeftRight, Shield, ShieldCheck,
  Crown, Link2, Unlink, Search, RotateCcw, Trash2, Building2,
  Lock, KeyRound, Pencil, UsersRound, Plus,
} from 'lucide-react';
import api from '../../utils/api';
import employeeApi from '../../utils/employeeApi';
import { APP_REGISTRY } from '../../config/apps';
import InviteTeamMemberModal from '../InviteTeamMemberModal';
import ReassignDataModal from './ReassignDataModal';

// Active apps that have roles (exclude coming_soon and settings)
const MANAGEABLE_APPS = Object.values(APP_REGISTRY).filter(
  app => app.id !== 'settings' && app.status === 'active' && app.roles
);

// App dot colors for access indicators
const appDotColors = {
  outreach: 'bg-rivvra-400',
  timesheet: 'bg-blue-400',
  employee: 'bg-orange-400',
  contacts: 'bg-cyan-400',
  crm: 'bg-emerald-400',
  ats: 'bg-purple-400',
  sign: 'bg-indigo-400',
};

export default function SettingsTeam() {
  const { user, impersonateUser } = useAuth();
  const { orgPath } = usePlatform();
  const { currentOrg, isOrgAdmin, isOrgOwner, refetchOrg } = useOrg();
  const { showToast } = useToast();
  const { companies: allCompanies } = useCompany();
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

  // Member removal modal
  const [removingMember, setRemovingMember] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Resend invite
  const [resendingInvite, setResendingInvite] = useState(null); // email being resent
  const [cancellingInvite, setCancellingInvite] = useState(null); // email being cancelled
  const [editingInviteEmail, setEditingInviteEmail] = useState(null); // invite _id being edited
  const [inviteEmailDraft, setInviteEmailDraft] = useState(''); // draft email value

  // Send workspace link
  const [sendingLink, setSendingLink] = useState(null); // userId being sent

  // Send password reset link
  const [sendingPasswordReset, setSendingPasswordReset] = useState(null); // userId

  // Related Employee linking
  const [employees, setEmployees] = useState([]);
  const [linkingEmployee, setLinkingEmployee] = useState(null); // userId being linked
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [empDropdownOpen, setEmpDropdownOpen] = useState(null); // userId of open dropdown

  // Rate limits
  const [editingRateLimits, setEditingRateLimits] = useState(null);
  const [rateLimitValues, setRateLimitValues] = useState({ dailySendLimit: 50, hourlySendLimit: 6 });
  const [savingRateLimits, setSavingRateLimits] = useState(false);
  const [memberRateLimits, setMemberRateLimits] = useState({});

  // Sales Teams
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
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
    if (orgSlug) {
      loadMembers();
      loadMemberRateLimits();
      if (canManage) {
        loadTeams();
        // Load employees for Related Employee linking
        employeeApi.list(orgSlug, { status: 'active' })
          .then(res => { if (res.success) setEmployees(res.employees || []); })
          .catch(() => {});
      }
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
      authMethods: member.authMethods?.length ? [...member.authMethods] : ['google'],
      email: member.email || '',
      editingEmail: false,
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
      const payload = {
        orgRole: editData.orgRole,
        appAccess: editData.appAccess,
      };
      // Include allowedCompanyIds if it was modified
      if (editData.allowedCompanyIds) {
        payload.allowedCompanyIds = editData.allowedCompanyIds;
      }
      // Include authMethods if changed
      if (editData.authMethods && JSON.stringify(editData.authMethods.sort()) !== JSON.stringify((member.authMethods || []).sort())) {
        payload.authMethods = editData.authMethods;
      }
      // Include email if changed
      if (editData.email && editData.email.trim().toLowerCase() !== (member.email || '').trim().toLowerCase()) {
        const trimmedEmail = editData.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          setSaveError('Please enter a valid email address');
          setSaving(false);
          return;
        }
        payload.email = trimmedEmail;
      }
      const res = await api.updateOrgMember(orgSlug, member.userId, payload);
      if (res.success) {
        // Update local state
        setMembers(prev => prev.map(m =>
          m.userId?.toString() === member.userId?.toString()
            ? {
                ...m,
                orgRole: editData.orgRole,
                appAccess: editData.appAccess,
                allowedCompanyIds: editData.allowedCompanyIds || m.allowedCompanyIds,
                authMethods: editData.authMethods || m.authMethods,
                email: payload.email || m.email,
              }
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

  // Member removal is now handled by ReassignDataModal

  async function handleImpersonate(memberId) {
    const result = await impersonateUser(memberId);
    if (result.success) navigate(orgPath('/home'));
    else { setError(result.error); setTimeout(() => setError(''), 3000); }
  }

  // ─── Resend Invitation ──────────────────────────────────────────────────

  async function handleResendInvite(originalEmail, newEmail = null) {
    if (resendingInvite) return;
    setResendingInvite(originalEmail);
    try {
      const res = await api.resendOrgInvite(orgSlug, originalEmail, newEmail);
      if (res.success) {
        // Update local state if email was changed
        if (res.newEmail && res.newEmail !== originalEmail) {
          setMembers(prev => prev.map(m =>
            m.status === 'invited' && m.email === originalEmail
              ? { ...m, email: res.newEmail }
              : m
          ));
        }
        setEditingInviteEmail(null);
        setInviteEmailDraft('');
        setError(`✅ Invitation resent to ${res.newEmail || originalEmail}`);
        setTimeout(() => setError(''), 3000);
      } else {
        setError(res.error || 'Failed to resend invitation');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to resend invitation');
      setTimeout(() => setError(''), 3000);
    } finally {
      setResendingInvite(null);
    }
  }

  async function handleCancelInvite(email) {
    if (cancellingInvite) return;
    setCancellingInvite(email);
    try {
      const res = await api.cancelOrgInvite(orgSlug, email);
      if (res.success) {
        setMembers(prev => prev.filter(m => !(m.status === 'invited' && m.email === email)));
        setError('✅ Invitation cancelled');
        setTimeout(() => setError(''), 3000);
      } else {
        setError(res.error || 'Failed to cancel invitation');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to cancel invitation');
      setTimeout(() => setError(''), 3000);
    } finally {
      setCancellingInvite(null);
    }
  }

  async function handleSendWorkspaceLink(userId) {
    if (sendingLink) return;
    setSendingLink(userId);
    try {
      const res = await api.sendWorkspaceLink(orgSlug, userId);
      if (res.success) {
        showToast(res.message || 'Invitation sent successfully', 'success');
      } else {
        showToast(res.error || 'Failed to send invitation', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send invitation', 'error');
    } finally {
      setSendingLink(null);
    }
  }

  async function handleSendPasswordReset(userId) {
    if (sendingPasswordReset) return;
    setSendingPasswordReset(userId);
    try {
      const res = await api.sendPasswordReset(orgSlug, userId);
      if (res.success) {
        showToast(res.message || 'Password reset link sent', 'success');
      } else {
        showToast(res.error || 'Failed to send password reset', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send password reset', 'error');
    } finally {
      setSendingPasswordReset(null);
    }
  }

  // ─── Employee Linking ───────────────────────────────────────────────────

  async function handleLinkEmployee(userId, employeeId) {
    if (!employeeId || linkingEmployee) return;
    setLinkingEmployee(userId);
    try {
      const res = await api.linkMemberEmployee(orgSlug, userId, employeeId);
      if (res.success) {
        // Update local member state with linked employee
        setMembers(prev => prev.map(m =>
          m.userId?.toString() === userId
            ? { ...m, linkedEmployee: res.linkedEmployee }
            : m
        ));
      } else {
        setError(res.error || 'Failed to link employee');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to link employee');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLinkingEmployee(null);
    }
  }

  async function handleUnlinkEmployee(userId) {
    if (linkingEmployee) return;
    setLinkingEmployee(userId);
    try {
      const res = await api.unlinkMemberEmployee(orgSlug, userId);
      if (res.success) {
        setMembers(prev => prev.map(m =>
          m.userId?.toString() === userId
            ? { ...m, linkedEmployee: null }
            : m
        ));
      } else {
        setError(res.error || 'Failed to unlink employee');
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to unlink employee');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLinkingEmployee(null);
    }
  }

  // ─── Sales Teams ──────────────────────────────────────────────────────────

  async function loadTeams() {
    setTeamsLoading(true);
    try {
      const res = await api.getTeams();
      if (res.success) setTeams(res.teams || []);
    } catch {} finally { setTeamsLoading(false); }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    setTeamError('');
    try {
      const res = await api.createTeam(newTeamName.trim(), newTeamLeader || null);
      if (res.success) {
        setShowCreateTeam(false);
        setNewTeamName('');
        setNewTeamLeader('');
        loadTeams();
        loadMembers();
        showToast('Team created successfully');
      } else {
        setTeamError(res.error || 'Failed to create team');
        setTimeout(() => setTeamError(''), 4000);
      }
    } catch (err) {
      setTeamError(err.message);
      setTimeout(() => setTeamError(''), 4000);
    } finally { setCreatingTeam(false); }
  }

  async function handleUpdateTeam(teamId, data) {
    setTeamActionLoading(true);
    setTeamError('');
    try {
      const res = await api.updateTeam(teamId, data);
      if (res.success) {
        setEditingTeam(null);
        loadTeams();
        loadMembers();
        showToast('Team updated');
      } else {
        setTeamError(res.error || 'Failed to update team');
        setTimeout(() => setTeamError(''), 4000);
      }
    } catch (err) {
      setTeamError(err.message);
      setTimeout(() => setTeamError(''), 4000);
    } finally { setTeamActionLoading(false); }
  }

  async function handleDeleteTeam(teamId) {
    setTeamActionLoading(true);
    setConfirmDeleteTeam(null);
    setTeamError('');
    try {
      const res = await api.deleteTeam(teamId);
      if (res.success) {
        loadTeams();
        loadMembers();
        showToast('Team deleted');
      } else {
        setTeamError(res.error || 'Failed to delete team');
        setTimeout(() => setTeamError(''), 4000);
      }
    } catch (err) {
      setTeamError(err.message);
      setTimeout(() => setTeamError(''), 4000);
    } finally { setTeamActionLoading(false); }
  }

  async function handleAddToTeam(teamId, userId) {
    setTeamError('');
    try {
      const res = await api.addTeamMembers(teamId, [userId]);
      if (res.success) {
        loadTeams();
        loadMembers();
      } else {
        setTeamError(res.error || 'Failed to add member');
        setTimeout(() => setTeamError(''), 4000);
      }
    } catch (err) {
      setTeamError(err.message);
      setTimeout(() => setTeamError(''), 4000);
    }
  }

  async function handleRemoveFromTeam(teamId, userId) {
    setTeamError('');
    try {
      const res = await api.removeTeamMember(teamId, userId);
      if (res.success) {
        loadTeams();
        loadMembers();
      } else {
        setTeamError(res.error || 'Failed to remove member');
        setTimeout(() => setTeamError(''), 4000);
      }
    } catch (err) {
      setTeamError(err.message);
      setTimeout(() => setTeamError(''), 4000);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" /></div>;
  }

  const activeMembers = members.filter(m => m.status === 'active');
  const invitedMembers = members.filter(m => m.status === 'invited');

  // Search filter
  const filteredActive = activeMembers.filter(m => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

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

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-2 text-[10px] uppercase text-dark-500 font-semibold tracking-wider border-b border-dark-700/50 mb-2">
            <div className="flex-1 min-w-0">User</div>
            <div className="text-center">Apps</div>
            <div className="w-28 text-center">Org Role</div>
            {canManage && <div className="w-8" />}
          </div>

          {/* Active Members */}
          <div className="space-y-1">
            {filteredActive.length === 0 && searchQuery.trim() && (
              <p className="text-dark-500 text-sm text-center py-6">No members match "{searchQuery}"</p>
            )}
            {filteredActive.map((member) => {
              const isCurrentUser = member.userId?.toString() === user?.id;
              const isMemberOwner = member.orgRole === 'owner';
              const isExpanded = expandedMember === member.userId?.toString();
              const limits = memberRateLimits[member.userId?.toString()];
              const isEditingLimits = editingRateLimits === member.userId?.toString();

              return (
                <div key={member._id} className={`rounded-xl transition-colors ${isCurrentUser ? 'bg-rivvra-500/5 border border-rivvra-500/20' : 'bg-dark-800/40 border border-dark-700/50'}`}>
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-4 px-4 py-3.5 ${canManage ? 'cursor-pointer hover:bg-dark-800/60' : ''}`}
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

                    {/* App access dots */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {MANAGEABLE_APPS.map(app => {
                        const access = member.appAccess?.[app.id];
                        const isEnabled = access?.enabled === true;
                        return (
                          <span
                            key={app.id}
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isEnabled ? (appDotColors[app.id] || 'bg-rivvra-400') : 'bg-dark-600'
                            }`}
                            title={`${app.name}: ${isEnabled ? (access.role || 'Enabled') : 'No access'}`}
                          />
                        );
                      })}
                      <span className="text-[10px] text-dark-500 ml-0.5">
                        {Object.values(member.appAccess || {}).filter(a => a?.enabled).length}/{MANAGEABLE_APPS.length}
                      </span>
                    </div>

                    {/* Org role badge */}
                    <div className="w-28 flex justify-center flex-shrink-0">
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

                      {/* Member Email */}
                      <div>
                        <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Member Email</label>
                        {editData.editingEmail ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="email"
                              value={editData.email}
                              onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                              placeholder="user@example.com"
                            />
                            <button
                              onClick={() => setEditData(prev => ({ ...prev, editingEmail: false }))}
                              className="px-2 py-2 text-dark-400 hover:text-white transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-dark-200">{editData.email || member.email}</span>
                            <button
                              onClick={() => setEditData(prev => ({ ...prev, editingEmail: true, email: prev.email || member.email }))}
                              className="p-1 text-dark-500 hover:text-rivvra-400 transition-colors"
                              title="Edit email"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            {editData.email && editData.email.trim().toLowerCase() !== (member.email || '').trim().toLowerCase() && (
                              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Changed</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Authentication Method (single selection) */}
                      <div>
                        <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Authentication Method</label>
                        <div className="space-y-2">
                          {/* Google radio */}
                          {(currentOrg?.authSettings?.allowedMethods || ['google']).includes('google') && (
                            <button
                              onClick={() => setEditData(prev => ({ ...prev, authMethods: ['google'] }))}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                                (editData.authMethods?.[0] || 'google') === 'google'
                                  ? 'bg-rivvra-500/10 border-rivvra-500/30'
                                  : 'bg-dark-800/50 border-dark-700/50 hover:border-dark-600'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                (editData.authMethods?.[0] || 'google') === 'google' ? 'border-rivvra-500' : 'border-dark-500'
                              }`}>
                                {(editData.authMethods?.[0] || 'google') === 'google' && <div className="w-2 h-2 rounded-full bg-rivvra-500" />}
                              </div>
                              <svg className="w-4 h-4 text-dark-400 flex-shrink-0" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/></svg>
                              <span className={`text-sm font-medium flex-1 text-left ${(editData.authMethods?.[0] || 'google') === 'google' ? 'text-white' : 'text-dark-400'}`}>Google Sign-In</span>
                              {(member.authMethods || []).includes('google') && (
                                <span className="text-[10px] text-rivvra-400 bg-rivvra-500/10 px-1.5 py-0.5 rounded">Current</span>
                              )}
                            </button>
                          )}
                          {/* Password radio */}
                          {(currentOrg?.authSettings?.allowedMethods || ['google']).includes('password') && (
                            <button
                              onClick={() => setEditData(prev => ({ ...prev, authMethods: ['password'] }))}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                                (editData.authMethods?.[0] || 'google') === 'password'
                                  ? 'bg-rivvra-500/10 border-rivvra-500/30'
                                  : 'bg-dark-800/50 border-dark-700/50 hover:border-dark-600'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                (editData.authMethods?.[0] || 'google') === 'password' ? 'border-rivvra-500' : 'border-dark-500'
                              }`}>
                                {(editData.authMethods?.[0] || 'google') === 'password' && <div className="w-2 h-2 rounded-full bg-rivvra-500" />}
                              </div>
                              <Lock className="w-4 h-4 text-dark-400 flex-shrink-0" />
                              <span className={`text-sm font-medium flex-1 text-left ${(editData.authMethods?.[0] || 'google') === 'password' ? 'text-white' : 'text-dark-400'}`}>Password</span>
                              {(member.authMethods || []).includes('password') && (
                                <span className="text-[10px] text-rivvra-400 bg-rivvra-500/10 px-1.5 py-0.5 rounded">Current</span>
                              )}
                            </button>
                          )}
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

                                {/* Role selector — hidden for derived-role apps */}
                                {access.enabled && roles.length > 0 && !app.derivedRoles ? (
                                  <select
                                    value={access.role || roles[roles.length - 1].value}
                                    onChange={(e) => updateAppAccess(app.id, 'role', e.target.value)}
                                    className="px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-rivvra-500 min-w-[100px]"
                                  >
                                    {roles.map(r => (
                                      <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                  </select>
                                ) : !access.enabled ? (
                                  <span className="text-xs text-dark-500 min-w-[100px]">—</span>
                                ) : null}
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

                      {/* Related Employee */}
                      <div>
                        <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Related Employee</label>
                        {member.linkedEmployee ? (
                          <div className="flex items-center gap-3 px-3 py-2.5 bg-dark-800/50 rounded-lg border border-dark-700/50">
                            <Link2 className="w-4 h-4 text-orange-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate cursor-pointer hover:text-rivvra-400 hover:underline" onClick={() => navigate(orgPath(`/employee/${member.linkedEmployee._id}`))}>{member.linkedEmployee.fullName}</p>
                              <p className="text-xs text-dark-400 truncate">
                                {member.linkedEmployee.designation || member.linkedEmployee.email || member.linkedEmployee.employeeId}
                              </p>
                            </div>
                            <button
                              onClick={() => handleUnlinkEmployee(member.userId?.toString())}
                              disabled={linkingEmployee === member.userId?.toString()}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            >
                              {linkingEmployee === member.userId?.toString() ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                              Unlink
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="relative flex items-center gap-2">
                              <div className="flex-1 relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-dark-500" />
                                <input
                                  type="text"
                                  placeholder="Search employees..."
                                  value={empDropdownOpen === member.userId?.toString() ? empSearchQuery : ''}
                                  onChange={(e) => { setEmpSearchQuery(e.target.value); setEmpDropdownOpen(member.userId?.toString()); }}
                                  onFocus={() => { setEmpDropdownOpen(member.userId?.toString()); setEmpSearchQuery(''); }}
                                  onBlur={() => setTimeout(() => setEmpDropdownOpen(null), 200)}
                                  disabled={linkingEmployee === member.userId?.toString()}
                                  className="w-full pl-8 pr-2 py-2 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                                />
                              </div>
                              {linkingEmployee === member.userId?.toString() && <Loader2 className="w-4 h-4 animate-spin text-dark-400 flex-shrink-0" />}
                            </div>
                            {empDropdownOpen === member.userId?.toString() && (() => {
                              const q = empSearchQuery.toLowerCase();
                              const filtered = employees.filter(emp =>
                                !q || emp.fullName?.toLowerCase().includes(q) || emp.email?.toLowerCase().includes(q) || emp.employeeId?.toLowerCase().includes(q) || emp.designation?.toLowerCase().includes(q)
                              );
                              return (
                                <div className="absolute z-50 top-full mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                  {filtered.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-dark-500">No employees found</p>
                                  ) : filtered.map(emp => (
                                    <button
                                      key={emp._id}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => { handleLinkEmployee(member.userId?.toString(), emp._id); setEmpDropdownOpen(null); setEmpSearchQuery(''); }}
                                      className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors"
                                    >
                                      <p className="text-xs text-white">{emp.fullName}</p>
                                      <p className="text-[10px] text-dark-400">{emp.designation || ''} {emp.employeeId ? `· ${emp.employeeId}` : ''}</p>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        <p className="text-[10px] text-dark-500 mt-1">
                          {member.linkedEmployee ? 'This user is linked to an employee record for timesheet access.' : 'Link to an employee record for timesheet & HR features.'}
                        </p>
                      </div>

                      {/* Multi Companies */}
                      {allCompanies && allCompanies.length > 1 && (
                        <div>
                          <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Multi Companies</label>
                          <div className="px-3 py-3 bg-dark-800/50 rounded-lg border border-dark-700/50 space-y-3">
                            {/* Allowed Companies */}
                            <div>
                              <label className="block text-[10px] text-dark-400 mb-1.5">Allowed Companies</label>
                              <div className="flex flex-wrap gap-1.5">
                                {allCompanies.map(company => {
                                  const memberAllowed = member.allowedCompanyIds?.map(id => id?.toString ? id.toString() : id) || [];
                                  const isAllowed = memberAllowed.includes(company._id?.toString ? company._id.toString() : company._id);
                                  return (
                                    <button
                                      key={company._id}
                                      onClick={() => {
                                        const currentIds = (member.allowedCompanyIds || []).map(id => id?.toString ? id.toString() : id);
                                        const compId = company._id?.toString ? company._id.toString() : company._id;
                                        let newIds;
                                        if (isAllowed) {
                                          // Don't allow removing if it's the only one
                                          if (currentIds.length <= 1) return;
                                          newIds = currentIds.filter(id => id !== compId);
                                        } else {
                                          newIds = [...currentIds, compId];
                                        }
                                        // Update member's allowedCompanyIds locally (saved on "Save Changes")
                                        setEditData(prev => ({ ...prev, allowedCompanyIds: newIds }));
                                        // Also update member object for immediate UI
                                        member.allowedCompanyIds = newIds;
                                      }}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                        isAllowed
                                          ? 'bg-rivvra-500/15 text-rivvra-400 border border-rivvra-500/30'
                                          : 'bg-dark-700/50 text-dark-500 border border-dark-600 hover:border-dark-500'
                                      }`}
                                    >
                                      <Building2 className="w-3 h-3" />
                                      <span className="truncate max-w-[180px]">{company.name}</span>
                                      {isAllowed && <X className="w-3 h-3 ml-0.5 opacity-60" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Default Company */}
                            <div>
                              <label className="block text-[10px] text-dark-400 mb-1">Default Company</label>
                              <span className="text-xs text-white">
                                {(() => {
                                  const currentId = member.currentCompanyId?.toString ? member.currentCompanyId.toString() : member.currentCompanyId;
                                  const company = allCompanies.find(c => (c._id?.toString ? c._id.toString() : c._id) === currentId);
                                  return company?.name || 'Not set';
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          {!isCurrentUser && (
                            <>
                              <button
                                onClick={() => handleSendWorkspaceLink(member.userId?.toString())}
                                disabled={sendingLink === member.userId?.toString()}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                              >
                                {sendingLink === member.userId?.toString() ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                Send Login Link
                              </button>
                              {/* Send Password Reset — only if org allows password auth */}
                              {(currentOrg?.authSettings?.allowedMethods || []).includes('password') && (
                                <button
                                  onClick={() => handleSendPasswordReset(member.userId?.toString())}
                                  disabled={sendingPasswordReset === member.userId?.toString()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                                >
                                  {sendingPasswordReset === member.userId?.toString() ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                                  {member.hasPassword ? 'Reset Password' : 'Set Password'}
                                </button>
                              )}
                              <button
                                onClick={() => handleImpersonate(member.userId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                Login As
                              </button>
                              {!isMemberOwner && (
                                <button
                                  onClick={() => setRemovingMember(member)}
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
              {invitedMembers.map((invite) => {
                const isEditingEmail = editingInviteEmail === invite._id;
                const emailChanged = isEditingEmail && inviteEmailDraft.trim().toLowerCase() !== invite.email;
                return (
                <div key={invite._id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-dark-800/40 border border-dark-700/50">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0"><Mail className="w-4 h-4 text-amber-400" /></div>
                  <div className="flex-1 min-w-0">
                    {isEditingEmail ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={inviteEmailDraft}
                          onChange={(e) => setInviteEmailDraft(e.target.value)}
                          className="flex-1 px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                          placeholder="new@email.com"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Escape') { setEditingInviteEmail(null); setInviteEmailDraft(''); } }}
                        />
                        <button
                          onClick={() => { setEditingInviteEmail(null); setInviteEmailDraft(''); }}
                          className="p-1 text-dark-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-white truncate">{invite.email}</p>
                        <button
                          onClick={() => { setEditingInviteEmail(invite._id); setInviteEmailDraft(invite.email); }}
                          className="p-0.5 text-dark-500 hover:text-rivvra-400 transition-colors flex-shrink-0"
                          title="Edit email"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-dark-500">
                      Invited as {invite.orgRole || 'member'}
                      {invite.authMethods?.[0] && (
                        <span className="ml-1">· {invite.authMethods[0] === 'google' ? 'Google' : 'Password'} auth</span>
                      )}
                      {invite.appAccess && (
                        <span className="ml-1">
                          · {Object.entries(invite.appAccess).filter(([, a]) => a.enabled).map(([id]) => APP_REGISTRY[id]?.name).filter(Boolean).join(', ') || 'No apps'}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* App access dots */}
                  <div className="flex items-center gap-1.5">
                    {MANAGEABLE_APPS.map(app => {
                      const isEnabled = invite.appAccess?.[app.id]?.enabled;
                      return (
                        <span
                          key={app.id}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isEnabled ? (appDotColors[app.id] || 'bg-rivvra-400') : 'bg-dark-600'
                          }`}
                          title={`${app.name}: ${isEnabled ? 'Enabled' : 'No access'}`}
                        />
                      );
                    })}
                  </div>
                  {/* Resend invite (with email change support) */}
                  <button
                    onClick={() => handleResendInvite(invite.email, emailChanged ? inviteEmailDraft.trim().toLowerCase() : null)}
                    disabled={resendingInvite === invite.email}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors flex-shrink-0 ${
                      emailChanged
                        ? 'text-rivvra-400 bg-rivvra-500/10 hover:bg-rivvra-500/20 font-medium'
                        : 'text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    {resendingInvite === invite.email ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    {emailChanged ? 'Update & Resend' : 'Resend'}
                  </button>
                  {/* Cancel invite */}
                  <button
                    onClick={() => handleCancelInvite(invite.email)}
                    disabled={cancellingInvite === invite.email}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                  >
                    {cancellingInvite === invite.email ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Delete
                  </button>
                </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ─── Sales Teams ─────────────────────────────────────────────── */}
      {canManage && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <UsersRound className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Sales Teams</h2>
                <p className="text-dark-400 text-xs mt-0.5">Shared across Outreach & CRM apps. Team leads get dashboard access in both.</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateTeam(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
            >
              <Plus className="w-4 h-4" />Create Team
            </button>
          </div>

          {teamError && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${teamError.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {teamError}
            </div>
          )}

          {/* Create Team Form */}
          {showCreateTeam && (
            <div className="mb-5 p-5 bg-dark-800/60 border border-dark-700 rounded-2xl">
              <h3 className="text-sm font-semibold text-white mb-3">New Team</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1.5">Team Name</label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. Sales Team - East"
                    className="w-full px-3.5 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-dark-500 text-sm focus:outline-none focus:border-rivvra-500 transition-colors"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1.5">Team Lead (optional)</label>
                  <select
                    value={newTeamLeader}
                    onChange={(e) => setNewTeamLeader(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white text-sm focus:outline-none focus:border-rivvra-500 transition-colors"
                  >
                    <option value="">Select a team lead...</option>
                    {members.filter(m => m.status === 'active' && !m.teamId && m.orgRole !== 'owner').map(m => (
                      <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 justify-end pt-1">
                  <button
                    onClick={() => { setShowCreateTeam(false); setNewTeamName(''); setNewTeamLeader(''); }}
                    className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateTeam}
                    disabled={creatingTeam || !newTeamName.trim()}
                    className="px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 flex items-center gap-2 transition-colors"
                  >
                    {creatingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Team
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Teams List */}
          {teamsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-dark-400 animate-spin" />
            </div>
          ) : teams.length === 0 && !showCreateTeam ? (
            <div className="text-center py-10">
              <UsersRound className="w-10 h-10 text-dark-600 mx-auto mb-3" />
              <p className="text-dark-400 text-sm">No teams created yet</p>
              <p className="text-dark-500 text-xs mt-1">Create a team to assign members and designate team leads</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => {
                const isManaging = manageTeamId === team.id;
                const isEditing = editingTeam?.id === team.id;
                const unassigned = members.filter(m => m.status === 'active' && !m.teamId && m.orgRole !== 'owner');

                return (
                  <div
                    key={team.id}
                    className={`rounded-2xl border transition-all ${isManaging ? 'bg-dark-800/60 border-dark-600' : 'bg-dark-800/30 border-dark-700/50 hover:border-dark-600'}`}
                  >
                    {/* Team Header */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingTeam.name}
                              onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                              className="px-2.5 py-1 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleUpdateTeam(team.id, { name: editingTeam.name })}
                              disabled={teamActionLoading || !editingTeam.name.trim()}
                              className="px-3 py-1 text-xs font-medium text-rivvra-400 hover:text-rivvra-300 bg-rivvra-500/10 rounded-lg"
                            >
                              Save
                            </button>
                            <button onClick={() => setEditingTeam(null)} className="text-dark-400 text-xs hover:text-white">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <h4 className="text-sm font-semibold text-white">{team.name}</h4>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-dark-400">
                            Lead: <span className={team.leaderName ? 'text-amber-400' : 'text-dark-500'}>{team.leaderName || 'Unassigned'}</span>
                          </span>
                          <span className="text-dark-600">·</span>
                          <span className="text-xs text-dark-500">{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setManageTeamId(isManaging ? null : team.id)}
                          className={`p-2 rounded-lg text-xs transition-colors ${isManaging ? 'bg-rivvra-500/10 text-rivvra-400' : 'text-dark-400 hover:text-white hover:bg-dark-700'}`}
                          title="Manage members"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingTeam({ id: team.id, name: team.name, leaderId: team.leaderId })}
                          className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                          title="Rename team"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteTeam(team)}
                          className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete team"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Management Panel */}
                    {isManaging && (
                      <div className="px-5 pb-5 pt-1">
                        <div className="border-t border-dark-700/50 pt-4">
                          {/* Current Members */}
                          <div className="mb-4">
                            <p className="text-[10px] uppercase text-dark-500 font-semibold mb-2.5 tracking-wider">Current Members</p>
                            {team.members.length === 0 ? (
                              <p className="text-dark-500 text-xs py-2">No members in this team yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {team.members.map((m) => (
                                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-dark-700/40 transition-colors group">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {m.picture ? (
                                        <img src={m.picture} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-7 h-7 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                                          <span className="text-[10px] font-bold text-dark-400">{(m.name || m.email || '?').charAt(0).toUpperCase()}</span>
                                        </div>
                                      )}
                                      <span className="text-sm text-white truncate">{m.name || m.email}</span>
                                      {m.id === team.leaderId && (
                                        <span className="text-[9px] font-semibold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md flex-shrink-0">Lead</span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleRemoveFromTeam(team.id, m.id)}
                                      className="text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                      title="Remove from team"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Add Members */}
                          {unassigned.length > 0 && (
                            <div className="mb-4">
                              <p className="text-[10px] uppercase text-dark-500 font-semibold mb-2.5 tracking-wider">Add Members</p>
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {unassigned.map((m) => (
                                  <div key={m.userId} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-dark-700/40 transition-colors">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {m.picture ? (
                                        <img src={m.picture} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-7 h-7 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                                          <span className="text-[10px] font-bold text-dark-400">{(m.name || m.email || '?').charAt(0).toUpperCase()}</span>
                                        </div>
                                      )}
                                      <span className="text-sm text-dark-300 truncate">{m.name || m.email}</span>
                                    </div>
                                    <button
                                      onClick={() => handleAddToTeam(team.id, m.userId)}
                                      className="text-rivvra-400 hover:text-rivvra-300 text-xs font-semibold flex-shrink-0"
                                    >
                                      Add
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {unassigned.length === 0 && (
                            <p className="text-dark-500 text-xs mb-4">All members are assigned to teams.</p>
                          )}

                          {/* Team Lead Selector */}
                          <div className="pt-3 border-t border-dark-700/50">
                            <label className="block text-[10px] uppercase text-dark-500 font-semibold mb-2 tracking-wider">Team Lead</label>
                            <select
                              value={team.leaderId || ''}
                              onChange={(e) => handleUpdateTeam(team.id, { leaderId: e.target.value || null })}
                              className="w-full px-3.5 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white text-sm focus:outline-none focus:border-rivvra-500 transition-colors"
                            >
                              <option value="">No lead assigned</option>
                              {team.members.map((m) => (
                                <option key={m.id} value={m.id}>{m.name || m.email}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-dark-500 mt-1.5">Team leads get access to Team Dashboard & Team Contacts in both Outreach and CRM.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Modals ───────────────────────────────────────────────────── */}

      {/* Delete Team Confirmation */}
      {confirmDeleteTeam && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setConfirmDeleteTeam(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Delete Team</h3>
                <p className="text-dark-400 text-sm">{confirmDeleteTeam.name}</p>
              </div>
            </div>
            <p className="text-dark-300 text-sm mb-6">This will remove the team and unassign all members. If the team lead has no other teams, their lead role will be revoked.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmDeleteTeam(null)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTeam(confirmDeleteTeam.id)}
                disabled={teamActionLoading}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400 disabled:opacity-50 transition-colors"
              >
                Delete Team
              </button>
            </div>
          </div>
        </div>
      )}

      {removingMember && (
        <ReassignDataModal
          member={removingMember}
          members={members.filter(m => m.status === 'active' && m.userId?.toString() !== removingMember.userId?.toString())}
          orgSlug={orgSlug}
          onClose={() => setRemovingMember(null)}
          onRemoved={(userId) => {
            setMembers(prev => prev.filter(m => m.userId?.toString() !== userId?.toString()));
            setRemovingMember(null);
            refetchOrg();
          }}
        />
      )}

      <InviteTeamMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInviteSent={() => loadMembers()}
        orgSlug={orgSlug}
        orgAllowedAuthMethods={currentOrg?.authSettings?.allowedMethods || ['google']}
      />
    </>
  );
}
