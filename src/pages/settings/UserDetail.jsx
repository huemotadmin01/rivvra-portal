/**
 * UserDetail — Dedicated user detail & management page
 *
 * Route: /org/:slug/settings/users/:userId
 * Replaces the expandable accordion panel from SettingsTeam.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Users, UserX, Mail, Loader2, Check, Shield, ShieldCheck,
  Crown, Link2, Unlink, Search, RotateCcw, KeyRound, Lock,
  ArrowLeftRight, Building2, Pencil, X, ChevronLeft,
} from 'lucide-react';
import api from '../../utils/api';
import employeeApi from '../../utils/employeeApi';
import { APP_REGISTRY } from '../../config/apps';
import ReassignDataModal from '../../components/settings/ReassignDataModal';

// Active apps with roles (exclude settings + coming_soon)
const MANAGEABLE_APPS = Object.values(APP_REGISTRY).filter(
  app => app.id !== 'settings' && app.status === 'active' && app.roles
);

// ─── Helper components ─────────────────────────────────────────────────────

function Badge({ children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${className}`}>{children}</span>;
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-dark-800/50 last:border-0">
      <span className="text-xs text-dark-400">{label}</span>
      <span className="text-sm text-dark-200">{value ?? '—'}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {Icon && <Icon className="w-4 h-4 text-dark-400" />}
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user, impersonateUser } = useAuth();
  const { orgPath } = usePlatform();
  const { currentOrg, isOrgAdmin, isOrgOwner, refetchOrg } = useOrg();
  const { showToast } = useToast();
  const { companies: allCompanies } = useCompany();
  const orgSlug = currentOrg?.slug;
  const canManage = isOrgAdmin || isOrgOwner;

  // Data
  const [member, setMember] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Employee linking
  const [employees, setEmployees] = useState([]);
  const [linkingEmployee, setLinkingEmployee] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);

  // Rate limits
  const [rateLimitValues, setRateLimitValues] = useState({ dailySendLimit: 50, hourlySendLimit: 6 });
  const [memberRateLimits, setMemberRateLimits] = useState(null);
  const [editingRateLimits, setEditingRateLimits] = useState(false);
  const [savingRateLimits, setSavingRateLimits] = useState(false);

  // Actions
  const [sendingLink, setSendingLink] = useState(false);
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  const [removingMember, setRemovingMember] = useState(null);

  usePageTitle(member?.name);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgSlug || !userId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [membersRes, rateLimitsRes] = await Promise.all([
          api.getOrgMembers(orgSlug),
          api.getMemberRateLimits().catch(() => null),
        ]);

        if (cancelled) return;

        if (membersRes.success) {
          const found = (membersRes.members || []).find(
            m => m.userId?.toString() === userId || m._id?.toString() === userId
          );
          if (found) {
            setMember(found);
            setAllMembers(membersRes.members || []);
          } else {
            setNotFound(true);
          }
        } else {
          setNotFound(true);
        }

        if (rateLimitsRes?.success) {
          const map = {};
          rateLimitsRes.members?.forEach(m => {
            map[m.id] = { dailySendLimit: m.dailySendLimit, hourlySendLimit: m.hourlySendLimit };
          });
          const limits = map[userId];
          if (limits) {
            setMemberRateLimits(limits);
            setRateLimitValues(limits);
          }
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Load employees for linking.
    // Do NOT filter by status here: we want resigned/terminated employees to
    // still be linkable (e.g. re-linking a portal user to a separated record
    // for historical access, or fixing a stale link).
    if (canManage) {
      employeeApi.list(orgSlug, { limit: 500 })
        .then(res => { if (!cancelled && res.success) setEmployees(res.employees || []); })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [orgSlug, userId]);

  // ─── Derived ────────────────────────────────────────────────────────────

  const isCurrentUser = member?.userId?.toString() === user?.id;
  const isMemberOwner = member?.orgRole === 'owner';

  // ─── Edit Mode ──────────────────────────────────────────────────────────

  function enterEditMode() {
    if (!member) return;
    setEditData({
      orgRole: member.orgRole,
      appAccess: { ...member.appAccess },
      authMethods: member.authMethods?.length ? [...member.authMethods] : ['google'],
      email: member.email || '',
      editingEmail: false,
      allowedCompanyIds: member.allowedCompanyIds ? [...member.allowedCompanyIds.map(id => id?.toString ? id.toString() : id)] : [],
    });
    setIsEditing(true);
    setSaveError('');
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditData(null);
    setSaveError('');
  }

  function updateAppAccess(appId, field, value) {
    setEditData(prev => ({
      ...prev,
      appAccess: {
        ...prev.appAccess,
        [appId]: {
          ...prev.appAccess[appId],
          [field]: value,
          ...(field === 'enabled' && !value ? { role: null } : {}),
          ...(field === 'enabled' && value && !prev.appAccess[appId]?.role
            ? { role: APP_REGISTRY[appId]?.roles?.[APP_REGISTRY[appId].roles.length - 1]?.value || 'member' }
            : {}),
        },
      },
    }));
  }

  // ─── Save ───────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!editData || !member) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        orgRole: editData.orgRole,
        appAccess: editData.appAccess,
      };
      if (editData.allowedCompanyIds?.length) {
        payload.allowedCompanyIds = editData.allowedCompanyIds;
      }
      if (editData.authMethods && JSON.stringify(editData.authMethods.sort()) !== JSON.stringify((member.authMethods || []).sort())) {
        payload.authMethods = editData.authMethods;
      }
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
        setMember(prev => ({
          ...prev,
          orgRole: editData.orgRole,
          appAccess: editData.appAccess,
          allowedCompanyIds: editData.allowedCompanyIds || prev.allowedCompanyIds,
          authMethods: editData.authMethods || prev.authMethods,
          email: payload.email || prev.email,
        }));
        setIsEditing(false);
        setEditData(null);
        setSaveError('');
        refetchOrg();
        showToast('Changes saved', 'success');
      } else {
        setSaveError(res.error || 'Failed to update member');
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to update member');
    } finally {
      setSaving(false);
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────────

  async function handleSendWorkspaceLink() {
    if (sendingLink) return;
    setSendingLink(true);
    try {
      const res = await api.sendWorkspaceLink(orgSlug, member.userId);
      showToast(res.success ? (res.message || 'Invitation sent') : (res.error || 'Failed'), res.success ? 'success' : 'error');
    } catch (err) {
      showToast(err.message || 'Failed to send', 'error');
    } finally {
      setSendingLink(false);
    }
  }

  async function handleSendPasswordReset() {
    if (sendingPasswordReset) return;
    setSendingPasswordReset(true);
    try {
      const res = await api.sendPasswordReset(orgSlug, member.userId);
      showToast(res.success ? (res.message || 'Password reset link sent') : (res.error || 'Failed'), res.success ? 'success' : 'error');
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setSendingPasswordReset(false);
    }
  }

  async function handleImpersonate() {
    const result = await impersonateUser(member.userId);
    if (result.success) navigate(orgPath('/home'));
    else showToast(result.error || 'Failed to impersonate', 'error');
  }

  // ─── Employee Linking ───────────────────────────────────────────────────

  async function handleLinkEmployee(employeeId) {
    if (!employeeId || linkingEmployee) return;
    setLinkingEmployee(true);
    try {
      const res = await api.linkMemberEmployee(orgSlug, member.userId, employeeId);
      if (res.success) {
        setMember(prev => ({ ...prev, linkedEmployee: res.linkedEmployee }));
        setEmpDropdownOpen(false);
        setEmpSearchQuery('');
      } else {
        showToast(res.error || 'Failed to link employee', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to link employee', 'error');
    } finally {
      setLinkingEmployee(false);
    }
  }

  async function handleUnlinkEmployee() {
    if (linkingEmployee) return;
    setLinkingEmployee(true);
    try {
      const res = await api.unlinkMemberEmployee(orgSlug, member.userId);
      if (res.success) {
        setMember(prev => ({ ...prev, linkedEmployee: null }));
      } else {
        showToast(res.error || 'Failed to unlink', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to unlink', 'error');
    } finally {
      setLinkingEmployee(false);
    }
  }

  // ─── Rate Limits ────────────────────────────────────────────────────────

  async function handleSaveRateLimits() {
    setSavingRateLimits(true);
    try {
      const res = await api.updateMemberRateLimits(member.userId, rateLimitValues);
      if (res.success) {
        setMemberRateLimits(res.settings);
        setEditingRateLimits(false);
        if (res.enrollmentsReset > 0) {
          showToast(`Limits updated — ${res.enrollmentsReset} pending emails will start sending now`, 'success');
        } else {
          showToast('Rate limits saved', 'success');
        }
      } else {
        showToast(res.error || 'Failed to update rate limits', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to update rate limits', 'error');
    } finally {
      setSavingRateLimits(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  if (notFound || !member) {
    return (
      <div className="text-center py-20">
        <Users className="w-10 h-10 text-dark-600 mx-auto mb-3" />
        <p className="text-dark-400">User not found</p>
        <Link to={orgPath('/settings/users')} className="text-rivvra-400 text-sm hover:underline mt-2 inline-block">Back to Users</Link>
      </div>
    );
  }

  const authMethod = (isEditing ? editData?.authMethods?.[0] : member.authMethods?.[0]) || 'google';
  const orgAllowedMethods = currentOrg?.authSettings?.allowedMethods || ['google'];

  return (
    <div className="space-y-6">

      {/* ─── Hero Card ──────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Back arrow */}
            <Link to={orgPath('/settings/users')} className="p-2 rounded-lg hover:bg-dark-700 transition-colors -ml-2">
              <ChevronLeft className="w-5 h-5 text-dark-400" />
            </Link>

            {/* Avatar */}
            {member.picture ? (
              <img src={member.picture} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-dark-600 to-dark-700 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-dark-300">{member.name?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
            )}

            {/* Name + email + badges */}
            <div>
              <div className="flex items-center gap-2">
                {editData?._editingName ? (
                  <input
                    autoFocus
                    type="text"
                    defaultValue={member.name || ''}
                    className="text-xl font-bold text-white bg-dark-800 border border-dark-600 rounded-lg px-2 py-0.5 focus:outline-none focus:border-rivvra-500"
                    onBlur={async (e) => {
                      const newName = e.target.value.trim();
                      if (newName && newName !== member.name) {
                        try {
                          const res = await api.request(`/api/org/${orgSlug}/members/${userId}`, { method: 'PUT', body: JSON.stringify({ name: newName }) });
                          if (res.success) { setMember(prev => ({ ...prev, name: newName })); showToast('Name updated', 'success'); }
                        } catch (err) { showToast(err.message || 'Failed to update name', 'error'); }
                      }
                      setEditData(prev => ({ ...prev, _editingName: false }));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditData(prev => ({ ...prev, _editingName: false })); }}
                  />
                ) : (
                  <h2 className="text-xl font-bold text-white">{member.name || 'Unnamed'}</h2>
                )}
                {!editData?._editingName && (
                  <button onClick={() => setEditData(prev => ({ ...prev, _editingName: true }))} className="p-1 text-dark-500 hover:text-white transition-colors" title="Edit name">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="text-sm text-dark-400 mt-0.5">{member.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={
                  member.orgRole === 'owner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : member.orgRole === 'admin' ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20'
                  : 'bg-dark-700/50 text-dark-300 border border-dark-600'
                }>
                  {member.orgRole === 'owner' && <Crown className="w-3 h-3" />}
                  {member.orgRole === 'admin' && <ShieldCheck className="w-3 h-3" />}
                  {member.orgRole === 'owner' ? 'Owner' : member.orgRole === 'admin' ? 'Admin' : 'Member'}
                </Badge>
                {isCurrentUser && (
                  <Badge className="bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20">You</Badge>
                )}
                {member.teamName && (
                  <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20">{member.teamName}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {canManage && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing ? (
                <>
                  {saveError && <span className="text-xs text-red-400 mr-2">{saveError}</span>}
                  <button onClick={cancelEdit} className="px-4 py-2 text-xs text-dark-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  onClick={enterEditMode}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Content Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Organization Role */}
        <SectionCard title="Organization Role" icon={Shield}>
          {isEditing && editData ? (
            <div className="flex flex-wrap gap-2">
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
          ) : (
            <InfoRow
              label="Current Role"
              value={
                <Badge className={
                  member.orgRole === 'owner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : member.orgRole === 'admin' ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20'
                  : 'bg-dark-700/50 text-dark-300 border border-dark-600'
                }>
                  {member.orgRole === 'owner' && <Crown className="w-3 h-3" />}
                  {member.orgRole === 'admin' && <ShieldCheck className="w-3 h-3" />}
                  {member.orgRole === 'owner' ? 'Owner' : member.orgRole === 'admin' ? 'Admin' : 'Member'}
                </Badge>
              }
            />
          )}
        </SectionCard>

        {/* Authentication */}
        <SectionCard title="Authentication" icon={Lock}>
          {isEditing && editData ? (
            <div className="space-y-2">
              {orgAllowedMethods.includes('google') && (
                <button
                  onClick={() => setEditData(prev => ({ ...prev, authMethods: ['google'] }))}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                    authMethod === 'google'
                      ? 'bg-rivvra-500/10 border-rivvra-500/30'
                      : 'bg-dark-800/50 border-dark-700/50 hover:border-dark-600'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${authMethod === 'google' ? 'border-rivvra-500' : 'border-dark-500'}`}>
                    {authMethod === 'google' && <div className="w-2 h-2 rounded-full bg-rivvra-500" />}
                  </div>
                  <svg className="w-4 h-4 text-dark-400 flex-shrink-0" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/></svg>
                  <span className={`text-sm font-medium flex-1 text-left ${authMethod === 'google' ? 'text-white' : 'text-dark-400'}`}>Google Sign-In</span>
                  {(member.authMethods || []).includes('google') && (
                    <span className="text-[10px] text-rivvra-400 bg-rivvra-500/10 px-1.5 py-0.5 rounded">Current</span>
                  )}
                </button>
              )}
              {orgAllowedMethods.includes('password') && (
                <button
                  onClick={() => setEditData(prev => ({ ...prev, authMethods: ['password'] }))}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                    authMethod === 'password'
                      ? 'bg-rivvra-500/10 border-rivvra-500/30'
                      : 'bg-dark-800/50 border-dark-700/50 hover:border-dark-600'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${authMethod === 'password' ? 'border-rivvra-500' : 'border-dark-500'}`}>
                    {authMethod === 'password' && <div className="w-2 h-2 rounded-full bg-rivvra-500" />}
                  </div>
                  <Lock className="w-4 h-4 text-dark-400 flex-shrink-0" />
                  <span className={`text-sm font-medium flex-1 text-left ${authMethod === 'password' ? 'text-white' : 'text-dark-400'}`}>Password</span>
                  {(member.authMethods || []).includes('password') && (
                    <span className="text-[10px] text-rivvra-400 bg-rivvra-500/10 px-1.5 py-0.5 rounded">Current</span>
                  )}
                </button>
              )}
            </div>
          ) : (
            <>
              <InfoRow
                label="Method"
                value={
                  <div className="flex items-center gap-2">
                    {authMethod === 'google' ? (
                      <>
                        <svg className="w-4 h-4 text-dark-400" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/></svg>
                        <span>Google Sign-In</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-dark-400" />
                        <span>Password</span>
                      </>
                    )}
                  </div>
                }
              />
            </>
          )}
        </SectionCard>

        {/* Member Email */}
        {isEditing && editData && (
          <SectionCard title="Member Email" icon={Mail}>
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
          </SectionCard>
        )}

        {/* App Access (full width) */}
        <div className="lg:col-span-2">
          <SectionCard title="App Access" icon={Users}>
            {isEditing && editData ? (
              <div className="space-y-2">
                {MANAGEABLE_APPS.map(app => {
                  const access = editData.appAccess?.[app.id] || { enabled: false, role: null };
                  return (
                    <div key={app.id} className="flex items-center justify-between px-3 py-2.5 bg-dark-800/50 rounded-lg border border-dark-700/50">
                      <div className="flex items-center gap-3">
                        <app.icon className="w-4 h-4 text-dark-400 flex-shrink-0" />
                        <span className="text-sm text-white font-medium">{app.name}</span>
                      </div>
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
                    </div>
                  );
                })}
                {Object.values(APP_REGISTRY).filter(a => a.status === 'coming_soon').map(app => (
                  <div key={app.id} className="flex items-center gap-3 px-3 py-2.5 bg-dark-800/20 rounded-lg border border-dark-700/30 opacity-50">
                    <app.icon className="w-4 h-4 text-dark-500 flex-shrink-0" />
                    <span className="text-sm text-dark-400 font-medium">{app.name}</span>
                    <span className="text-xs text-dark-500 ml-auto">Coming Soon</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {MANAGEABLE_APPS.map(app => {
                  const access = member.appAccess?.[app.id];
                  const isEnabled = access?.enabled === true;
                  return (
                    <div key={app.id} className="flex items-center justify-between px-3 py-2.5 bg-dark-800/50 rounded-lg border border-dark-700/50">
                      <div className="flex items-center gap-3">
                        <app.icon className="w-4 h-4 text-dark-400 flex-shrink-0" />
                        <span className="text-sm text-white font-medium">{app.name}</span>
                      </div>
                      <div className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                        isEnabled ? 'bg-rivvra-500' : 'bg-dark-600'
                      }`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Related Employee */}
        <SectionCard title="Related Employee" icon={Link2}>
          {member.linkedEmployee ? (
            <div>
              <div className="flex items-center gap-3 px-3 py-2.5 bg-dark-800/50 rounded-lg border border-dark-700/50">
                <Link2 className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm text-white truncate cursor-pointer hover:text-rivvra-400 hover:underline"
                    onClick={() => navigate(orgPath(`/employee/${member.linkedEmployee._id}`))}
                  >
                    {member.linkedEmployee.fullName}
                  </p>
                  <p className="text-xs text-dark-400 truncate">
                    {member.linkedEmployee.designation || member.linkedEmployee.email || member.linkedEmployee.employeeId}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={handleUnlinkEmployee}
                    disabled={linkingEmployee}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    {linkingEmployee ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                    Unlink
                  </button>
                )}
              </div>
              <p className="text-[10px] text-dark-500 mt-1">This user is linked to an employee record for timesheet access.</p>
            </div>
          ) : canManage ? (
            <div>
              <div className="relative">
                <div className="relative flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-dark-500" />
                    <input
                      type="text"
                      placeholder="Search employees..."
                      value={empDropdownOpen ? empSearchQuery : ''}
                      onChange={(e) => { setEmpSearchQuery(e.target.value); setEmpDropdownOpen(true); }}
                      onFocus={() => { setEmpDropdownOpen(true); setEmpSearchQuery(''); }}
                      onBlur={() => setTimeout(() => setEmpDropdownOpen(false), 200)}
                      disabled={linkingEmployee}
                      className="w-full pl-8 pr-2 py-2 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                    />
                  </div>
                  {linkingEmployee && <Loader2 className="w-4 h-4 animate-spin text-dark-400 flex-shrink-0" />}
                </div>
                {empDropdownOpen && (() => {
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
                          onClick={() => handleLinkEmployee(emp._id)}
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
              <p className="text-[10px] text-dark-500 mt-1">Link to an employee record for timesheet & HR features.</p>
            </div>
          ) : (
            <p className="text-sm text-dark-500">Not linked</p>
          )}
        </SectionCard>

        {/* Companies (only if multi-company) */}
        {allCompanies && allCompanies.length > 1 && (
          <SectionCard title="Companies" icon={Building2}>
            {isEditing && editData ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-dark-400 mb-1.5">Allowed Companies</label>
                  <div className="flex flex-wrap gap-1.5">
                    {allCompanies.map(company => {
                      const compId = company._id?.toString ? company._id.toString() : company._id;
                      const isAllowed = editData.allowedCompanyIds?.includes(compId);
                      return (
                        <button
                          key={company._id}
                          onClick={() => {
                            const current = editData.allowedCompanyIds || [];
                            let newIds;
                            if (isAllowed) {
                              if (current.length <= 1) return;
                              newIds = current.filter(id => id !== compId);
                            } else {
                              newIds = [...current, compId];
                            }
                            setEditData(prev => ({ ...prev, allowedCompanyIds: newIds }));
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
            ) : (
              <>
                <InfoRow
                  label="Allowed"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {allCompanies.filter(c => {
                        const memberAllowed = (member.allowedCompanyIds || []).map(id => id?.toString ? id.toString() : id);
                        return memberAllowed.includes(c._id?.toString ? c._id.toString() : c._id);
                      }).map(c => (
                        <Badge key={c._id} className="bg-dark-700/50 text-dark-300 border border-dark-600 text-[10px]">{c.name}</Badge>
                      ))}
                    </div>
                  }
                />
                <InfoRow
                  label="Default"
                  value={(() => {
                    const currentId = member.currentCompanyId?.toString ? member.currentCompanyId.toString() : member.currentCompanyId;
                    const company = allCompanies.find(c => (c._id?.toString ? c._id.toString() : c._id) === currentId);
                    return company?.name || 'Not set';
                  })()}
                />
              </>
            )}
          </SectionCard>
        )}

        {/* Rate Limits */}
        {member.appAccess?.outreach?.enabled && memberRateLimits && (
          <SectionCard title="Rate Limits" icon={Mail}>
            {editingRateLimits ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-dark-400">Hourly:</label>
                    <input type="number" min="1" max="50" value={rateLimitValues.hourlySendLimit}
                      onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRateLimitValues(p => ({ ...p, hourlySendLimit: Math.min(50, Math.max(1, v)) })); }}
                      className="w-16 px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white text-center focus:outline-none focus:border-rivvra-500" />
                    <span className="text-xs text-dark-500">/hr</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-dark-400">Daily:</label>
                    <input type="number" min="1" max="200" value={rateLimitValues.dailySendLimit}
                      onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRateLimitValues(p => ({ ...p, dailySendLimit: Math.min(200, Math.max(1, v)) })); }}
                      className="w-16 px-2 py-1 bg-dark-800 border border-dark-600 rounded-lg text-xs text-white text-center focus:outline-none focus:border-rivvra-500" />
                    <span className="text-xs text-dark-500">/day</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingRateLimits(false)} className="px-3 py-1 text-xs text-dark-400 hover:text-white">Cancel</button>
                  <button onClick={handleSaveRateLimits} disabled={savingRateLimits} className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-50">
                    {savingRateLimits ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <InfoRow label="Hourly" value={`${memberRateLimits.hourlySendLimit}/hr`} />
                  <InfoRow label="Daily" value={`${memberRateLimits.dailySendLimit}/day`} />
                </div>
                {canManage && (
                  <button
                    onClick={() => { setEditingRateLimits(true); setRateLimitValues(memberRateLimits); }}
                    className="p-2 text-dark-500 hover:text-rivvra-400 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </SectionCard>
        )}

        {/* Actions */}
        {canManage && !isCurrentUser && (
          <div className="lg:col-span-2">
            <SectionCard title="Actions">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSendWorkspaceLink}
                  disabled={sendingLink}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors border border-blue-500/20"
                >
                  {sendingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Send Login Link
                </button>

                {orgAllowedMethods.includes('password') && (
                  <button
                    onClick={handleSendPasswordReset}
                    disabled={sendingPasswordReset}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors border border-purple-500/20"
                  >
                    {sendingPasswordReset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                    {member.hasPassword ? 'Reset Password' : 'Set Password'}
                  </button>
                )}

                <button
                  onClick={handleImpersonate}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors border border-amber-500/20"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Login As
                </button>

                {!isMemberOwner && (
                  <button
                    onClick={() => setRemovingMember(member)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Remove Member
                  </button>
                )}
              </div>
            </SectionCard>
          </div>
        )}
      </div>

      {/* ─── Modals ─────────────────────────────────────────────────── */}
      {removingMember && (
        <ReassignDataModal
          member={removingMember}
          members={allMembers.filter(m => m.userId?.toString() !== member.userId?.toString() && m.status !== 'invited')}
          orgSlug={orgSlug}
          onClose={() => setRemovingMember(null)}
          onRemoved={() => navigate(orgPath('/settings/users'))}
        />
      )}
    </div>
  );
}
