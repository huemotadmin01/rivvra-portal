import { useState } from 'react';
import { X, Mail, UserPlus, Loader2, CheckCircle, AlertTriangle, Chrome, KeyRound } from 'lucide-react';
import { APP_REGISTRY } from '../../config/apps';
import employeeApi from '../../utils/employeeApi';

const INVITABLE_APPS = Object.values(APP_REGISTRY).filter(
  (app) => app.status === 'active' && app.roles && app.id !== 'settings'
);

export default function InviteEmployeeModal({ isOpen, onClose, onInviteSent, employee, orgSlug }) {
  const [orgRole, setOrgRole] = useState('member');
  const [authMethod, setAuthMethod] = useState('google');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [appAccess, setAppAccess] = useState(() => {
    const initial = {};
    INVITABLE_APPS.forEach((app) => {
      initial[app.id] = {
        enabled: app.id === 'employee' || app.id === 'timesheet',
        role: app.roles[app.roles.length - 1]?.value || 'member',
      };
    });
    return initial;
  });

  if (!isOpen || !employee) return null;

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
    setSending(true);

    try {
      const accessPayload = {};
      Object.entries(appAccess).forEach(([appId, config]) => {
        accessPayload[appId] = {
          enabled: config.enabled,
          role: config.enabled ? config.role : null,
        };
      });

      const res = await employeeApi.inviteToWorkspace(orgSlug, employee._id, {
        orgRole,
        authMethod,
        appAccess: accessPayload,
      });

      if (res.success) {
        setSuccess(res.message || `Invite sent to ${employee.email}`);
        if (onInviteSent) onInviteSent();
        setTimeout(() => handleClose(), 1500);
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
    setError('');
    setSuccess('');
    setOrgRole('member');
    setAuthMethod('google');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
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
              <h2 className="text-lg font-bold text-white">Invite to Workspace</h2>
              <p className="text-dark-400 text-sm">Send workspace invite to {employee.fullName}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Employee Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="email"
                value={employee.email}
                readOnly
                className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-dark-400 text-sm cursor-not-allowed"
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

          {/* Authentication Method */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Authentication Method</label>
            <p className="text-xs text-dark-500 mb-2">Select which sign-in method this user will use.</p>
            <div className="flex gap-2">
              {[
                { value: 'google', label: 'Google', icon: Chrome },
                { value: 'password', label: 'Password', icon: KeyRound },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAuthMethod(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    authMethod === opt.value
                      ? 'bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-400'
                      : 'bg-dark-800 border border-dark-600 text-dark-400 hover:text-white hover:border-dark-500'
                  }`}
                >
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* App Access */}
          {INVITABLE_APPS.length > 0 && (
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

                      {/* Role selector — hidden for derived-role apps */}
                      {access?.enabled && app.roles && !app.derivedRoles && (
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
              disabled={sending}
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
