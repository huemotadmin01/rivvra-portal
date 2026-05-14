/**
 * SettingsEmployee — Employee app settings section (Odoo-inspired)
 * Employee defaults, profile management, and attendance config.
 * Only visible to users with admin role on the employee app.
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { Save, Loader2, AlertCircle, Users, UserCog, CalendarClock, Shield } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';
import api from '../../utils/api';

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors ${
        checked ? 'bg-rivvra-500' : 'bg-dark-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform shadow-sm ${
        checked ? 'translate-x-[18px]' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function SettingsEmployee() {
  const { currentOrg, isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const { showToast } = useToast();
  // Use app-level role check for consistency with the rest of Employee app
  const isAdmin = getAppRole('employee') === 'admin' || isOrgAdmin || isOrgOwner;

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!isAdmin || !currentOrg?.slug) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([
      employeeApi.getAppSettings(currentOrg.slug),
      api.getOrgMembers(currentOrg.slug),
    ]).then(([settingsRes, membersRes]) => {
      if (cancelled) return;
      if (settingsRes.success && settingsRes.settings) setSettings(settingsRes.settings);
      else if (settingsRes && !settingsRes.success) setSettings(settingsRes);
      else setSettings(settingsRes);
      if (membersRes.success) setMembers(membersRes.members?.filter(m => m.status === 'active') || []);
    })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, currentOrg?.slug]);

  const handleSave = async () => {
    if (!settings) { showToast('No settings to save', 'error'); return; }
    setSaving(true);
    try {
      await employeeApi.updateAppSettings(currentOrg.slug, settings);
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage Employee settings.</p>
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

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Employee Defaults */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-orange-400" />
            <h3 className="font-semibold text-white">Employee Defaults</h3>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Employee ID Prefix</label>
              <p className="text-xs text-dark-500 mb-2">Prefix for auto-generated IDs (e.g., EMP-001)</p>
              <input type="text" maxLength={10}
                value={settings?.employeeIdPrefix ?? 'EMP'}
                onChange={e => update('employeeIdPrefix', e.target.value)}
                className="input-field w-32"
                placeholder="EMP" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Employment Type</label>
              <p className="text-xs text-dark-500 mb-2">Type pre-selected when creating new employees</p>
              <select
                value={settings?.defaultEmploymentType ?? 'confirmed'}
                onChange={e => update('defaultEmploymentType', e.target.value)}
                className="input-field w-auto">
                <option value="confirmed">Confirmed</option>
                <option value="internal_consultant">Internal Consultant</option>
                <option value="external_consultant">External Consultant</option>
                <option value="intern">Intern</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Billable by Default</p>
                <p className="text-xs text-dark-500">New employees are marked billable by default</p>
              </div>
              <ToggleSwitch
                checked={settings?.billableByDefault ?? true}
                onChange={v => update('billableByDefault', v)}
              />
            </div>
            {/* Audit H7 — `requireManager` toggle was orphaned: the UI wrote
                the flag to org settings but nothing on the client or server
                enforced it. Removed to prevent misleading admins into
                thinking they'd hardened a workflow they hadn't. */}
          </div>
        </div>

        {/* Plan Roles */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-green-400" />
            <h3 className="font-semibold text-white">Plan Roles</h3>
          </div>
          <p className="text-xs text-dark-500 mb-5">Default assignees for onboarding/offboarding plan tasks. Per-task overrides in templates take priority.</p>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default HR Officer</label>
              <p className="text-xs text-dark-500 mb-2">Handles HR-type tasks (document collection, orientation, etc.)</p>
              <select
                value={settings?.defaultHrUserId ?? ''}
                onChange={e => {
                  const m = members.find(m => m.userId === e.target.value);
                  update('defaultHrUserId', e.target.value || null);
                  update('defaultHrUserName', m?.name || null);
                }}
                className="input-field w-full">
                <option value="">Not set (falls back to launcher)</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default IT Admin</label>
              <p className="text-xs text-dark-500 mb-2">Handles IT-type tasks (email setup, workspace access, etc.)</p>
              <select
                value={settings?.defaultItUserId ?? ''}
                onChange={e => {
                  const m = members.find(m => m.userId === e.target.value);
                  update('defaultItUserId', e.target.value || null);
                  update('defaultItUserName', m?.name || null);
                }}
                className="input-field w-full">
                <option value="">Not set (falls back to launcher)</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Profile & Updates */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCog size={18} className="text-blue-400" />
            <h3 className="font-semibold text-white">Profile & Updates</h3>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Employee Self-Service</p>
                <p className="text-xs text-dark-500">Allow employees to update their own profile information</p>
              </div>
              <ToggleSwitch
                checked={settings?.employeeSelfService ?? false}
                onChange={v => update('employeeSelfService', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Profile Update Reminders</p>
                <p className="text-xs text-dark-500">Send periodic email reminders to update personal info</p>
              </div>
              <ToggleSwitch
                checked={settings?.profileUpdateReminders ?? false}
                onChange={v => update('profileUpdateReminders', v)}
              />
            </div>
            {settings?.profileUpdateReminders && (
              <div className="pl-4 border-l-2 border-dark-700">
                <label className="block text-sm font-medium text-dark-300 mb-1">Reminder Frequency</label>
                <p className="text-xs text-dark-500 mb-2">How often to send update reminders</p>
                <select
                  value={settings?.reminderFrequency ?? 'quarterly'}
                  onChange={e => update('reminderFrequency', e.target.value)}
                  className="input-field w-auto">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Timesheet Mode Config */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={18} className="text-purple-400" />
            <h3 className="font-semibold text-white">Timesheet Mode</h3>
          </div>
          <p className="text-xs text-dark-500 mb-4">Configure whether each employee type fills Timesheets (project-based hours) or marks Attendance.</p>
          <div className="border border-dark-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-dark-800/50">
                  <th className="text-left text-dark-400 font-medium px-3 py-2">Employment Type</th>
                  <th className="text-left text-dark-400 font-medium px-3 py-2">Billable</th>
                  <th className="text-left text-dark-400 font-medium px-3 py-2">Mode</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const defaultConfig = [
                    { employmentType: 'confirmed', billable: true, mode: 'attendance' },
                    { employmentType: 'confirmed', billable: false, mode: 'attendance' },
                    { employmentType: 'internal_consultant', billable: true, mode: 'timesheet' },
                    { employmentType: 'internal_consultant', billable: false, mode: 'attendance' },
                    { employmentType: 'external_consultant', billable: true, mode: 'timesheet' },
                    { employmentType: 'intern', billable: true, mode: 'attendance' },
                    { employmentType: 'intern', billable: false, mode: 'attendance' },
                  ];
                  const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultant', external_consultant: 'External Consultant', intern: 'Intern' };
                  const config = settings?.timesheetModeConfig || defaultConfig;
                  // Ensure all rows exist
                  const rows = defaultConfig.map(d => {
                    const match = config.find(r => r.employmentType === d.employmentType && r.billable === d.billable);
                    return match || d;
                  });
                  return rows.map((row, i) => (
                    <tr key={`${row.employmentType}-${row.billable}`} className={i % 2 === 0 ? '' : 'bg-dark-800/20'}>
                      <td className="px-3 py-2 text-dark-300">{typeLabels[row.employmentType] || row.employmentType}</td>
                      <td className="px-3 py-2 text-dark-400">{row.billable ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={row.mode}
                          onChange={e => {
                            const updated = rows.map((r, j) => j === i ? { ...r, mode: e.target.value } : r);
                            update('timesheetModeConfig', updated);
                          }}
                          className="input-field text-sm py-1 px-2 w-auto"
                        >
                          <option value="attendance">Attendance</option>
                          <option value="timesheet">Timesheet</option>
                        </select>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
        <Save size={16} /> {saving ? 'Saving...' : 'Save Employee Settings'}
      </button>
    </div>
  );
}
