/**
 * SettingsEmployee — Employee app settings section (Odoo-inspired)
 * Employee defaults, profile management, and attendance config.
 * Only visible to users with admin role on the employee app.
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { Save, Loader2, AlertCircle, Users, UserCog, CalendarClock } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';

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

  useEffect(() => {
    if (!isAdmin || !currentOrg?.slug) { setLoading(false); return; }
    let cancelled = false;
    employeeApi.getAppSettings(currentOrg.slug)
      .then((res) => {
        if (cancelled) return;
        // Extract settings data from wrapped response
        if (res.success && res.settings) setSettings(res.settings);
        else if (res && !res.success) setSettings(res); // legacy fallback
        else setSettings(res);
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Require Manager Assignment</p>
                <p className="text-xs text-dark-500">Manager field is required when creating employees</p>
              </div>
              <ToggleSwitch
                checked={settings?.requireManager ?? false}
                onChange={v => update('requireManager', v)}
              />
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

        {/* Attendance (Coming Soon) */}
        <div className="card p-5 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={18} className="text-purple-400" />
            <h3 className="font-semibold text-white">Attendance</h3>
            <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Track Attendance</p>
                <p className="text-xs text-dark-500">Enable check-in/check-out based attendance tracking</p>
              </div>
              <ToggleSwitch checked={false} onChange={() => {}} disabled />
            </div>
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
