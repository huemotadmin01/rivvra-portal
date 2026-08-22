/**
 * SettingsTeam — Unified Users & App Access Management
 *
 * Uses org membership API (/api/org/:slug/members) for all user management.
 * Shows per-user per-app access controls (Odoo-style).
 *
 * Renders two team-management sections:
 *  • Sales Teams      — shared by Outreach + CRM
 *  • Recruitment Teams — used by ATS
 * Both are managed by the same TeamSection component, differing only in props.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';

import {
  Users, UserPlus, Mail, Loader2, Check,
  ChevronRight, Clock, X, Crown, ShieldCheck,
  Search, Trash2, Pencil, RotateCcw,
  UsersRound, Plus, Target,
} from 'lucide-react';
import api from '../../utils/api';
import { APP_REGISTRY } from '../../config/apps';
import InviteTeamMemberModal from '../InviteTeamMemberModal';
import ComboSelect from '../ComboSelect';
import { Panel, Chip, Button, Input, Avatar, Callout, EmptyState, PageSpinner, ConfirmDialog } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Every mutation on this page was left alone during verification: Invite
// Member, Resend invite (which EMAILS the invitee), Update & Resend (which
// emails a DIFFERENT address), Cancel invite, Save rate limits, and — in both
// TeamSections — Create / Rename / Delete team and Add / Remove member.
//
// Two verbatim slices: the page's state + handlers (127 lines) and
// TeamSection's (129). The derived sets come with them, and they are the part
// worth naming:
//
//   · `eligible` — active, not an owner, and not already in a team OF THIS
//     TYPE. Its source of truth is `team.memberIds`, deliberately not the
//     denormalised `member.teamId`, so a user can be in a sales team and still
//     be offered for a recruitment team. The comment saying so is carried too.
//   · The team-lead pool is NO_LEAD_OPTION + current members + eligible, which
//     is why a lead can be picked from outside the team (the backend adds them).
//   · The rate-limit clamps, `Math.min(50, Math.max(1, v))` hourly and
//     `Math.min(200, Math.max(1, v))` daily — the same limits Outreach enforces
//     per mailbox.
// ─────────────────────────────────────────────────────────────────────────────

// Sentinel option representing "no team lead" in the searchable picker.
// We use a literal "" _id so ComboSelect's onChange surfaces '' when picked.
const NO_LEAD_OPTION = { _id: '', name: 'No lead assigned' };


// Active apps (exclude coming_soon and settings).
// 2026-05-14: dropped `app.roles` filter — per-app roles aren't a thing anymore.
const MANAGEABLE_APPS = Object.values(APP_REGISTRY).filter(
  app => app.id !== 'settings' && app.status === 'active'
);

// App dot colours for access indicators — same hues as legacy, as tokens.
const appDotColors = {
  outreach: 'var(--brand)',
  timesheet: 'var(--acc-blue)',
  employee: 'var(--acc-orange)',
  contacts: 'var(--acc-cyan)',
  crm: 'var(--acc-emerald)',
  ats: 'var(--acc-purple)',
  sign: 'var(--acc-indigo)',
};

/** Per-app access dot. Off is a muted track, on is the app's hue. */
function AppDot({ on, colour, title }) {
  return (
    <span
      title={title}
      style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: on ? (colour || 'var(--brand)') : 'var(--line-2)' }}
    />
  );
}

/** Org-role pill. Owner and admin carry a glyph, member does not. */
function RoleChip({ role }) {
  if (role === 'owner') return <Chip tone="warn"><Crown size={11} /> Owner</Chip>;
  if (role === 'admin') return <Chip tone="brand"><ShieldCheck size={11} /> Admin</Chip>;
  return <Chip tone="neutral">Member</Chip>;
}

/** Uppercase micro-heading used inside the team management panel. */
function Micro({ children, style }) {
  return (
    <p style={{
      font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, ...style,
    }}>{children}</p>
  );
}

/**
 * Status banner. Legacy encodes success by prefixing the string with a tick,
 * so the tone is derived the same way rather than by a separate flag.
 */
function StatusBanner({ message }) {
  if (!message) return null;
  return <Callout tone={message.startsWith('✅') ? 'brand' : 'danger'} style={{ marginBottom: 14 }}>{message}</Callout>;
}

export default function SettingsTeamV2() {
  const { user } = useAuth();
  const { orgPath } = usePlatform();
  const { currentOrg, isOrgAdmin, isOrgOwner } = useOrg();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;
  const canManage = isOrgAdmin || isOrgOwner;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Resend invite
  const [resendingInvite, setResendingInvite] = useState(null);
  const [cancellingInvite, setCancellingInvite] = useState(null);
  const [editingInviteEmail, setEditingInviteEmail] = useState(null);
  const [inviteEmailDraft, setInviteEmailDraft] = useState('');

  // Rate limits (kept for inline badge display)
  const [editingRateLimits, setEditingRateLimits] = useState(null);
  const [rateLimitValues, setRateLimitValues] = useState({ dailySendLimit: 50, hourlySendLimit: 6 });
  const [savingRateLimits, setSavingRateLimits] = useState(false);
  const [memberRateLimits, setMemberRateLimits] = useState({});

  useEffect(() => {
    if (orgSlug) {
      loadMembers();
      loadMemberRateLimits();
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
    } catch (err) {}
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

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner label="Loading members…" />;

  const activeMembers = members.filter(m => m.status === 'active');
  const invitedMembers = members.filter(m => m.status === 'invited');

  // Search filter
  const filteredActive = activeMembers.filter(m => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const colHead = { font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em' };

  return (
    <>
      <div style={{ display: 'grid', gap: 14 }}>
        {/* ─── Members Card ─────────────────────────────────────────────── */}
        <Panel>
          <div style={{ padding: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>Users &amp; Access</h2>
                <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
                  {currentOrg?.name && <span style={{ color: 'var(--fg-2)' }}>{currentOrg.name}</span>}
                  {currentOrg?.name && ' · '}{activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}
                  {currentOrg?.billing && (
                    <span style={{ marginLeft: 6, color: 'var(--fg-4)' }}>
                      · <span style={{ color: currentOrg.billing.seatsUsed >= currentOrg.billing.seatsTotal ? 'var(--danger)' : 'var(--brand-ink)' }}>
                        {currentOrg.billing.seatsUsed}/{currentOrg.billing.seatsTotal}
                      </span> seats used
                    </span>
                  )}
                </p>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setInviteOpen(true)} iconLeft={<UserPlus size={15} />}>Invite Member</Button>
              )}
            </div>

            <StatusBanner message={error} />

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
              <Input
                type="text"
                placeholder="Search by name or email..."
                aria-label="Search members"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 32 }}
              />
            </div>

            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 14px', borderBottom: '1px solid var(--line-2)', marginBottom: 8 }}>
              <div style={{ ...colHead, flex: 1, minWidth: 0 }}>User</div>
              <div style={{ ...colHead, textAlign: 'center' }}>Apps</div>
              <div style={{ ...colHead, width: 112, textAlign: 'center' }}>Org Role</div>
              <div style={{ width: 32 }} />
            </div>

            {/* Active Members */}
            <div style={{ display: 'grid', gap: 4 }}>
              {filteredActive.length === 0 && searchQuery.trim() && (
                <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textAlign: 'center', padding: '22px 0', margin: 0 }}>
                  No members match "{searchQuery}"
                </p>
              )}
              {filteredActive.map((member) => {
                const isCurrentUser = member.userId?.toString() === user?.id;
                const limits = memberRateLimits[member.userId?.toString()];
                const isEditingLimits = editingRateLimits === member.userId?.toString();

                return (
                  <div key={member._id} style={{
                    borderRadius: 'var(--r-2)',
                    background: isCurrentUser ? 'var(--brand-soft)' : 'var(--surface-2)',
                    boxShadow: `0 0 0 1px ${isCurrentUser ? 'var(--brand-line)' : 'var(--line)'}`,
                  }}>
                    {/* Main row */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', cursor: 'pointer' }}
                      onClick={() => navigate(orgPath(`/settings/users/${member.userId}`))}
                    >
                      {/* Avatar + name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                        {member.picture ? (
                          <img src={member.picture} alt="" referrerPolicy="no-referrer"
                            style={{ width: 36, height: 36, borderRadius: 'var(--r-2)', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <Avatar name={member.name || '?'} size={36} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {member.name || 'Unnamed'}
                            </span>
                            {isCurrentUser && <Chip tone="brand">You</Chip>}
                          </div>
                          <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</span>
                            {member.teamName && <Chip tone="warn">{member.teamName}</Chip>}
                            {member.recruitmentTeamName && <Chip tone="purple">{member.recruitmentTeamName}</Chip>}
                            {member.joinedAt && (
                              <span style={{ font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                                Joined {new Date(member.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* App access dots */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {MANAGEABLE_APPS.map(app => {
                          const access = member.appAccess?.[app.id];
                          const isEnabled = access?.enabled === true;
                          return (
                            <AppDot
                              key={app.id}
                              on={isEnabled}
                              colour={appDotColors[app.id]}
                              title={`${app.name}: ${isEnabled ? (access.role || 'Enabled') : 'No access'}`}
                            />
                          );
                        })}
                        <span style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {Object.values(member.appAccess || {}).filter(a => a?.enabled).length}/{MANAGEABLE_APPS.length}
                        </span>
                      </div>

                      {/* Org role badge */}
                      <div style={{ width: 112, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                        <RoleChip role={member.orgRole} />
                      </div>

                      {/* Actions */}
                      <div style={{ width: 32, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                        <ChevronRight size={15} style={{ color: 'var(--fg-4)' }} />
                      </div>
                    </div>

                    {/* Rate limit badge row */}
                    {limits && member.appAccess?.outreach?.enabled && (
                      <div style={{ padding: '0 14px 8px' }}>
                        {canManage ? (
                          <Button
                            variant="secondary" size="sm"
                            onClick={(e) => { e.stopPropagation(); isEditingLimits ? setEditingRateLimits(null) : (() => { setEditingRateLimits(member.userId?.toString()); setRateLimitValues({ dailySendLimit: limits.dailySendLimit, hourlySendLimit: limits.hourlySendLimit }); })(); }}
                            style={isEditingLimits ? { background: 'var(--brand-soft)', boxShadow: '0 0 0 1px var(--brand-line)' } : undefined}
                            iconLeft={<Mail size={12} />}
                          >
                            {limits.hourlySendLimit}/hr · {limits.dailySendLimit}/day
                          </Button>
                        ) : (
                          <Chip tone="neutral"><Mail size={11} /> {limits.hourlySendLimit}/hr · {limits.dailySendLimit}/day</Chip>
                        )}
                      </div>
                    )}

                    {/* Rate limit editor */}
                    {isEditingLimits && (
                      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--line-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label htmlFor={`rl-hr-${member._id}`} style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>Hourly:</label>
                            <Input id={`rl-hr-${member._id}`} type="number" min="1" max="50" value={rateLimitValues.hourlySendLimit}
                              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRateLimitValues(p => ({ ...p, hourlySendLimit: Math.min(50, Math.max(1, v)) })); }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: 68, height: 30, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                            <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>/hr</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label htmlFor={`rl-day-${member._id}`} style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>Daily:</label>
                            <Input id={`rl-day-${member._id}`} type="number" min="1" max="200" value={rateLimitValues.dailySendLimit}
                              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRateLimitValues(p => ({ ...p, dailySendLimit: Math.min(200, Math.max(1, v)) })); }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: 68, height: 30, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                            <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>/day</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingRateLimits(null); }}>Cancel</Button>
                            <Button size="sm" disabled={savingRateLimits}
                              onClick={(e) => { e.stopPropagation(); handleSaveRateLimits(member.userId?.toString()); }}
                              iconLeft={savingRateLimits ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}>
                              Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Detail panel removed — now at /settings/users/:userId */}
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* ─── Pending Invites ─────────────────────────────────────────── */}
        {canManage && invitedMembers.length > 0 && (
          <Panel icon={<Clock size={16} />} title="Pending Invites">
            <div style={{ padding: 6, display: 'grid', gap: 8 }}>
              {invitedMembers.map((invite) => {
                const isEditingEmail = editingInviteEmail === invite._id;
                const emailChanged = isEditingEmail && inviteEmailDraft.trim().toLowerCase() !== invite.email;
                return (
                  <div key={invite._id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    padding: '10px 14px', borderRadius: 'var(--r-2)',
                    background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
                  }}>
                    <span style={{ width: 38, height: 38, borderRadius: 'var(--r-2)', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--warn-soft)', color: 'var(--warn-ink)' }}>
                      <Mail size={15} />
                    </span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      {isEditingEmail ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Input
                            type="email"
                            value={inviteEmailDraft}
                            onChange={(e) => setInviteEmailDraft(e.target.value)}
                            placeholder="new@email.com"
                            aria-label="New invite email"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Escape') { setEditingInviteEmail(null); setInviteEmailDraft(''); } }}
                            style={{ flex: 1, minWidth: 0, height: 32 }}
                          />
                          <Button variant="ghost" size="sm" aria-label="Cancel email edit"
                            onClick={() => { setEditingInviteEmail(null); setInviteEmailDraft(''); }} iconLeft={<X size={13} />} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <p style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.email}</p>
                          <Button variant="ghost" size="sm" title="Edit email" aria-label={`Edit email for ${invite.email}`}
                            onClick={() => { setEditingInviteEmail(invite._id); setInviteEmailDraft(invite.email); }} iconLeft={<Pencil size={12} />} />
                        </div>
                      )}
                      <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '2px 0 0' }}>
                        Invited as {invite.orgRole || 'member'}
                        {invite.authMethods?.[0] && (
                          <span style={{ marginLeft: 4 }}>· {invite.authMethods[0] === 'google' ? 'Google' : 'Password'} auth</span>
                        )}
                        {invite.appAccess && (
                          <span style={{ marginLeft: 4 }}>
                            · {Object.entries(invite.appAccess).filter(([, a]) => a.enabled).map(([id]) => APP_REGISTRY[id]?.name).filter(Boolean).join(', ') || 'No apps'}
                          </span>
                        )}
                      </p>
                    </div>
                    {/* App access dots */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {MANAGEABLE_APPS.map(app => {
                        const isEnabled = invite.appAccess?.[app.id]?.enabled;
                        return (
                          <AppDot key={app.id} on={isEnabled} colour={appDotColors[app.id]}
                            title={`${app.name}: ${isEnabled ? 'Enabled' : 'No access'}`} />
                        );
                      })}
                    </div>
                    {/* Resend invite (with email change support) */}
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => handleResendInvite(invite.email, emailChanged ? inviteEmailDraft.trim().toLowerCase() : null)}
                      disabled={resendingInvite === invite.email}
                      style={emailChanged ? { background: 'var(--brand-soft)', boxShadow: '0 0 0 1px var(--brand-line)' } : undefined}
                      iconLeft={resendingInvite === invite.email ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    >
                      {emailChanged ? 'Update & Resend' : 'Resend'}
                    </Button>
                    {/* Cancel invite */}
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => handleCancelInvite(invite.email)}
                      disabled={cancellingInvite === invite.email}
                      style={{ color: 'var(--danger)' }}
                      iconLeft={cancellingInvite === invite.email ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    >
                      Delete
                    </Button>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* ─── Sales Teams ─────────────────────────────────────────────── */}
        {canManage && (
          <TeamSection
            type="sales"
            label="Sales Teams"
            description="Shared across Outreach & CRM apps. Team leads get dashboard access in both."
            icon={UsersRound}
            accent="var(--acc-amber)"
            badgeTone="warn"
            leadHint="Team leads get access to Team Dashboard & Team Contacts in both Outreach and CRM."
            members={members}
            onMembersChanged={loadMembers}
          />
        )}

        {/* ─── Recruitment Teams ──────────────────────────────────────── */}
        {canManage && (
          <TeamSection
            type="recruitment"
            label="Recruitment Teams"
            description="Used by ATS. Team leads see their recruiters' candidates and dashboard metrics."
            icon={Target}
            accent="var(--acc-purple)"
            badgeTone="purple"
            leadHint="Team leads see their team's candidates in ATS and the recruitment dashboard."
            members={members}
            onMembersChanged={loadMembers}
          />
        )}

      </div>

      {/* ─── Modals ───────────────────────────────────────────────────── */}

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

// ============================================================================
// TeamSection — reusable team-management UI for sales & recruitment teams.
// ============================================================================
//
// Props:
//   type            'sales' | 'recruitment'
//   label           e.g. "Sales Teams"
//   description     One-line subtitle under the heading
//   icon            lucide-react component for the section header
//   accent          CSS colour token for the icon tile and leader name
//   badgeTone       ds Chip tone for the "Lead" pill
//   leadHint        explanation shown under the team-lead selector
//   members         full org member list (active + invited)
//   onMembersChanged callback to refresh parent members after a team change
//
// (Legacy passed four Tailwind class strings — iconBg / iconColor / badgeBg /
// badgeColor — where `accent` + `badgeTone` now do the same job.)
//
// "Unassigned for this type" is derived from team.memberIds rather than
// member.teamId — works correctly for both new recruitment teams and existing
// sales teams without relying on the legacy denormalized field.
function TeamSection({
  type,
  label,
  description,
  icon: Icon,
  accent,
  badgeTone,
  leadHint,
  members,
  onMembersChanged,
}) {
  const { showToast } = useToast();

  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLeader, setNewLeader] = useState('');
  const [creating, setCreating] = useState(false);
  const [manageTeamId, setManageTeamId] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function loadTeams() {
    setTeamsLoading(true);
    try {
      const res = await api.getTeams();
      if (res.success) {
        const filtered = (res.teams || []).filter(t => (t.type || 'sales') === type);
        setTeams(filtered);
      }
    } catch (err) {} finally { setTeamsLoading(false); }
  }

  function flashError(msg) {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  }

  async function handleCreateTeam() {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.createTeam(newName.trim(), newLeader || null, type);
      if (res.success) {
        setShowCreate(false);
        setNewName('');
        setNewLeader('');
        loadTeams();
        onMembersChanged?.();
        showToast(`${label.replace(/s$/, '')} created successfully`);
      } else {
        flashError(res.error || 'Failed to create team');
      }
    } catch (err) {
      flashError(err.message);
    } finally { setCreating(false); }
  }

  async function handleUpdateTeam(teamId, data) {
    setActionLoading(true);
    setError('');
    try {
      const res = await api.updateTeam(teamId, data);
      if (res.success) {
        setEditingTeam(null);
        loadTeams();
        onMembersChanged?.();
        showToast('Team updated');
      } else {
        flashError(res.error || 'Failed to update team');
      }
    } catch (err) {
      flashError(err.message);
    } finally { setActionLoading(false); }
  }

  async function handleDeleteTeam(teamId) {
    setActionLoading(true);
    setConfirmDeleteTeam(null);
    setError('');
    try {
      const res = await api.deleteTeam(teamId);
      if (res.success) {
        loadTeams();
        onMembersChanged?.();
        showToast('Team deleted');
      } else {
        flashError(res.error || 'Failed to delete team');
      }
    } catch (err) {
      flashError(err.message);
    } finally { setActionLoading(false); }
  }

  async function handleAddToTeam(teamId, userId) {
    setError('');
    try {
      const res = await api.addTeamMembers(teamId, [userId]);
      if (res.success) {
        loadTeams();
        onMembersChanged?.();
      } else {
        flashError(res.error || 'Failed to add member');
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  async function handleRemoveFromTeam(teamId, userId) {
    setError('');
    try {
      const res = await api.removeTeamMember(teamId, userId);
      if (res.success) {
        loadTeams();
        onMembersChanged?.();
      } else {
        flashError(res.error || 'Failed to remove member');
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  // Build "users already in some team of this type" set so we can compute
  // who's eligible to add. Source of truth: team.memberIds (from portal_users).
  const memberIdsInTypeTeams = new Set();
  teams.forEach(t => (t.memberIds || []).forEach(id => memberIdsInTypeTeams.add(id)));
  const eligible = members.filter(m =>
    m.status === 'active' && m.orgRole !== 'owner' && !memberIdsInTypeTeams.has(m.userId)
  );

  const tile = (size) => ({
    width: size, height: size, borderRadius: 'var(--r-2)', flexShrink: 0,
    display: 'grid', placeItems: 'center',
    background: `color-mix(in srgb, ${accent} 14%, transparent)`,
    color: accent,
  });

  return (
    <>
      <Panel>
        <div style={{ padding: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={tile(36)}><Icon size={17} /></span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>{label}</h2>
                <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>{description}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)} iconLeft={<Plus size={15} />}>Create Team</Button>
          </div>

          <StatusBanner message={error} />

          {/* Create Team Form */}
          {showCreate && (
            <div style={{ marginBottom: 18, padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--r-3)', boxShadow: '0 0 0 1px var(--line)' }}>
              <h3 style={{ font: "600 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 12px' }}>New Team</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label htmlFor={`team-name-${type}`} style={{ display: 'block', font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>Team Name</label>
                  <Input
                    id={`team-name-${type}`}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={type === 'recruitment' ? 'e.g. Recruitment Team — East' : 'e.g. Sales Team - East'}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ display: 'block', font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>Team Lead (optional)</label>
                  <ComboSelect
                    value={newLeader}
                    displayValue={(eligible.find(m => m.userId === newLeader)?.name) || (eligible.find(m => m.userId === newLeader)?.email) || ''}
                    options={eligible.map(m => ({ _id: m.userId, name: m.name || m.email }))}
                    onChange={(id) => setNewLeader(id || '')}
                    placeholder="Search a team lead..."
                    disableCreate
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', paddingTop: 2 }}>
                  <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setNewName(''); setNewLeader(''); }}>Cancel</Button>
                  <Button size="sm" onClick={handleCreateTeam} disabled={creating || !newName.trim()}
                    iconLeft={creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}>
                    Create Team
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Teams List */}
          {teamsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 0' }}>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
            </div>
          ) : teams.length === 0 && !showCreate ? (
            <EmptyState icon={<Icon size={22} />} compact title="No teams created yet">
              Create a team to assign members and designate team leads
            </EmptyState>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {teams.map((team) => {
                const isManaging = manageTeamId === team.id;
                const isEditing = editingTeam?.id === team.id;

                return (
                  <div key={team.id} style={{
                    borderRadius: 'var(--r-3)',
                    background: isManaging ? 'var(--surface-2)' : 'transparent',
                    boxShadow: `0 0 0 1px ${isManaging ? 'var(--line-2)' : 'var(--line)'}`,
                  }}>
                    {/* Team Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                      <span style={tile(40)}><Users size={18} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Input
                              type="text"
                              value={editingTeam.name}
                              onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                              aria-label="Team name"
                              autoFocus
                              style={{ width: 220, height: 32 }}
                            />
                            <Button variant="secondary" size="sm"
                              onClick={() => handleUpdateTeam(team.id, { name: editingTeam.name })}
                              disabled={actionLoading || !editingTeam.name.trim()}>
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingTeam(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <h4 style={{ font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{team.name}</h4>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                          <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                            Lead: <span style={{ color: team.leaderName ? accent : 'var(--fg-4)' }}>{team.leaderName || 'Unassigned'}</span>
                          </span>
                          <span style={{ color: 'var(--fg-4)' }}>·</span>
                          <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                            {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <Button variant="ghost" size="sm" title="Manage members"
                          aria-label={`Manage members of ${team.name}`}
                          onClick={() => setManageTeamId(isManaging ? null : team.id)}
                          style={isManaging ? { background: 'var(--brand-soft)' } : undefined}
                          iconLeft={<Users size={15} />} />
                        <Button variant="ghost" size="sm" title="Rename team"
                          aria-label={`Rename ${team.name}`}
                          onClick={() => setEditingTeam({ id: team.id, name: team.name, leaderId: team.leaderId })}
                          iconLeft={<Pencil size={15} />} />
                        <Button variant="ghost" size="sm" title="Delete team"
                          aria-label={`Delete ${team.name}`}
                          onClick={() => setConfirmDeleteTeam(team)}
                          style={{ color: 'var(--danger)' }}
                          iconLeft={<Trash2 size={15} />} />
                      </div>
                    </div>

                    {/* Expanded Management Panel */}
                    {isManaging && (
                      <div style={{ padding: '0 18px 18px' }}>
                        <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
                          {/* Current Members */}
                          <div style={{ marginBottom: 16 }}>
                            <Micro style={{ marginBottom: 10 }}>Current Members</Micro>
                            {team.members.length === 0 ? (
                              <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '8px 0' }}>No members in this team yet.</p>
                            ) : (
                              <div style={{ display: 'grid', gap: 4 }}>
                                {team.members.map((m) => (
                                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 10px', borderRadius: 'var(--r-2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                      {m.picture ? (
                                        <img src={m.picture} alt="" referrerPolicy="no-referrer"
                                          style={{ width: 28, height: 28, borderRadius: 'var(--r-1)', objectFit: 'cover', flexShrink: 0 }} />
                                      ) : (
                                        <Avatar name={m.name || m.email || '?'} size={28} />
                                      )}
                                      <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m.name || m.email}
                                      </span>
                                      {m.id === team.leaderId && <Chip tone={badgeTone}>Lead</Chip>}
                                    </div>
                                    <Button variant="ghost" size="sm" title="Remove from team"
                                      aria-label={`Remove ${m.name || m.email} from ${team.name}`}
                                      onClick={() => handleRemoveFromTeam(team.id, m.id)}
                                      iconLeft={<X size={13} />} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Add Members — searchable picker; remounts on member-count change
                              so the input visibly clears after each successful add. */}
                          <div style={{ marginBottom: 16 }}>
                            <Micro style={{ marginBottom: 10 }}>Add Members</Micro>
                            {eligible.length > 0 ? (
                              <ComboSelect
                                key={`add-${team.id}-${(team.memberIds || []).length}`}
                                value=""
                                displayValue=""
                                options={eligible.map((m) => ({ _id: m.userId, name: m.name || m.email }))}
                                onChange={(id) => { if (id) handleAddToTeam(team.id, id); }}
                                placeholder="Search and add a member..."
                                disableCreate
                              />
                            ) : (
                              <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>All members are assigned to teams.</p>
                            )}
                          </div>

                          {/* Team Lead Selector — pickable pool is current team members
                              PLUS anyone eligible for this team type. Backend auto-adds
                              the picked user to memberIds if not already in the team. */}
                          <div style={{ paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
                            <Micro style={{ marginBottom: 8 }}>Team Lead</Micro>
                            <ComboSelect
                              value={team.leaderId || ''}
                              displayValue={team.leaderName || ''}
                              options={[
                                NO_LEAD_OPTION,
                                ...team.members.map((m) => ({ _id: m.id, name: m.name || m.email })),
                                ...eligible.map((m) => ({ _id: m.userId, name: m.name || m.email })),
                              ]}
                              onChange={(id) => handleUpdateTeam(team.id, { leaderId: id || null })}
                              placeholder="Search a team lead..."
                              disableCreate
                            />
                            <p style={{ font: "400 10px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '6px 0 0' }}>{leadHint}</p>
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
      </Panel>

      {/* Delete Team Confirmation */}
      <ConfirmDialog
        open={!!confirmDeleteTeam}
        danger
        busy={actionLoading}
        title="Delete Team"
        message={
          <>
            <span style={{ display: 'block', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 10 }}>
              {confirmDeleteTeam?.name}
            </span>
            This will remove the team and unassign all members. If the team lead has no other teams, their lead role will be revoked.
          </>
        }
        confirmLabel="Delete Team"
        onCancel={() => setConfirmDeleteTeam(null)}
        onConfirm={() => handleDeleteTeam(confirmDeleteTeam.id)}
      />
    </>
  );
}
