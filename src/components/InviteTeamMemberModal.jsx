import { useState } from 'react';
import { X, Mail, UserPlus, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { APP_REGISTRY } from '../config/apps';
import api from '../utils/api';

// Apps that can be toggled during invite (active apps with roles, excluding settings)
const INVITABLE_APPS = Object.values(APP_REGISTRY).filter(
  (app) => app.status === 'active' && app.roles && app.id !== 'settings'
);

function InviteTeamMemberModal({ isOpen, onClose, onInviteSent, licenses, orgSlug }) {
  const [email, setEmail] = useState('');
  const [orgRole, setOrgRole] = useState('member');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Per-app access state: { outreach: { enabled: true, role: 'member' }, timesheet: { enabled: false, role: 'contractor' } }
  const [appAccess, setAppAccess] = useState(() => {
    const initial = {};
    INVITABLE_APPS.forEach((app) => {
      initial[app.id] = {
        enabled: app.id === 'outreach', // Outreach on by default
        role: app.roles[app.roles.length - 1]?.value || 'member', // Default to lowest role
      };
    });
    return initial;
  });

  if (!isOpen) return null;

  const toggleApp = (appId) => {
    setAppAccess((prev) => ({
      ...prev,
      [appId]: { ...prev[appId], enabled: !prev[appId].enabled },
    }));
  };

  const setAppRole = (appId, role) => {
    setAppAccess((prev) => ({
      ...prev,
      [appId]: { ...prev[appId], role },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Email is required');
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setSending(true);
    try {
      // Build appAccess payload — only include enabled apps
      const accessPayload = {};
      Object.entries(appAccess).forEach(([appId, config]) => {
        accessPayload[appId] = {
          enabled: config.enabled,
          role: config.enabled ? config.role : null,
        };
      });

      let res;
      if (orgSlug) {
        // Use org membership invite API
        res = await api.inviteOrgMember(orgSlug, {
          email: trimmed,
          orgRole,
          appAccess: accessPayload,
        });
      } else {
        // Fallback to legacy team invite (standalone users)
        res = await api.inviteTeamMember(trimmed, orgRole);
      }

      if (res.success) {
        setSuccess(res.message || `Invite sent to ${trimmed}`);
        setEmail('');
        setOrgRole('member');
        // Reset app access
        const reset = {};
        INVITABLE_APPS.forEach((app) => {
          reset[app.id] = {
            enabled: app.id === 'outreach',
            role: app.roles[app.roles.length - 1]?.value || 'member',
          };
        });
        setAppAccess(reset);
        if (onInviteSent) onInviteSent();
        // Auto-close modal after 1.5 seconds
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        setError(res.error || 'Failed to send invite');
      }
    } catch (err) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setOrgRole('member');
    setError('');
    setSuccess('');
    // Reset app access
    const reset = {};
    INVITABLE_APPS.forEach((app) => {
      reset[app.id] = {
        enabled: app.id === 'outreach',
        role: app.roles[app.roles.length - 1]?.value || 'member',
      };
    });
    setAppAccess(reset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-rivvra-500/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-rivvra-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Invite Team Member</h2>
              <p className="text-dark-400 text-sm">Send an invite to join your organization</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* License info banner */}
          {licenses && (
            <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
              licenses.remaining <= 0
                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                : 'bg-rivvra-500/5 border border-rivvra-500/20 text-dark-300'
            }`}>
              {licenses.remaining <= 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>All {licenses.total} licenses are in use. Remove a member or upgrade to invite more.</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 flex-shrink-0 text-rivvra-400" />
                  <span>{licenses.remaining} license{licenses.remaining !== 1 ? 's' : ''} remaining</span>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="colleague@company.com"
                className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 text-sm"
                autoFocus
                disabled={sending}
              />
            </div>
          </div>

          {/* Org Role */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Organization Role</label>
            <div className="flex gap-2">
              {[
                { value: 'member', label: 'Member' },
                { value: 'admin', label: 'Admin' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrgRole(opt.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    orgRole === opt.value
                      ? 'bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-400'
                      : 'bg-dark-800 border border-dark-600 text-dark-400 hover:text-white hover:border-dark-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* App Access */}
          {orgSlug && INVITABLE_APPS.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">App Access</label>
              <div className="space-y-2">
                {INVITABLE_APPS.map((app) => {
                  const AppIcon = app.icon;
                  const access = appAccess[app.id];
                  return (
                    <div
                      key={app.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                        access?.enabled
                          ? 'bg-dark-800/80 border-dark-600'
                          : 'bg-dark-800/40 border-dark-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Toggle checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleApp(app.id)}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                            access?.enabled
                              ? 'bg-rivvra-500 border-rivvra-500'
                              : 'border-dark-500 hover:border-dark-400'
                          }`}
                        >
                          {access?.enabled && (
                            <svg className="w-3 h-3 text-dark-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <AppIcon className={`w-4 h-4 ${access?.enabled ? 'text-white' : 'text-dark-500'}`} />
                        <span className={`text-sm font-medium ${access?.enabled ? 'text-white' : 'text-dark-500'}`}>
                          {app.name}
                        </span>
                      </div>

                      {/* Role selector — only when enabled */}
                      {access?.enabled && app.roles && (
                        <select
                          value={access.role}
                          onChange={(e) => setAppRole(app.id, e.target.value)}
                          className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-dark-300 focus:outline-none focus:border-rivvra-500"
                        >
                          {app.roles.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 text-sm text-dark-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !email.trim() || (licenses && licenses.remaining <= 0)}
              className="px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Send Invite
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InviteTeamMemberModal;
