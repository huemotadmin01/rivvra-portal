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
import {
  Users, UserPlus, UserX, Mail, Loader2, Check,
  ChevronDown, Clock, X, ArrowLeftRight, Shield, ShieldCheck,
  Crown, Link2, Unlink, Search, RotateCcw, Trash2,
} from 'lucide-react';
import api from '../../utils/api';
import employeeApi from '../../utils/employeeApi';
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
  const { showToast } = useToast();
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

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Resend invite
  const [resendingInvite, setResendingInvite] = useState(null); // email being resent
  const [cancellingInvite, setCancellingInvite] = useState(null); // email being cancelled

  // Send workspace link
  const [sendingLink, setSendingLink] = useState(null); // userId being sent

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

  useEffect(() => {
    if (orgSlug) {
      loadMembers();
      loadMemberRateLimits();
      if (canManage) {
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

  // ─── Resend Invitation ──────────────────────────────────────────────────

  async function handleResendInvite(email) {
    if (resendingInvite) return;
    setResendingInvite(email);
    try {
      const res = await api.resendOrgInvite(orgSlug, email);
      if (res.success) {
        setError('✅ Invitation resent successfully');
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
            <div className="w-32 text-center">Apps</div>
            <div className="w-24 text-center">Org Role</div>
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
                                Resend Invitation
                              </button>
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
                  {/* Resend invite */}
                  <button
                    onClick={() => handleResendInvite(invite.email)}
                    disabled={resendingInvite === invite.email}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors flex-shrink-0"
                  >
                    {resendingInvite === invite.email ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    Resend
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
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ─── Modals ───────────────────────────────────────────────────── */}

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
