/**
 * SettingsEmployee — Employee app settings section (Odoo-inspired)
 * Employee defaults, profile management, and attendance config.
 * Only visible to users with admin role on the employee app.
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { Save, AlertCircle, Users, UserCog, CalendarClock, Shield } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';
import api from '../../utils/api';
import { Panel, Button, Input, Select, Switch, SettingRow, EmptyState, PageSpinner } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// Two things here are carried across byte-identically rather than retyped.
//
//   1. `timesheetModeConfig` (in the render, not above `return (`) — it decides
//      whether each employment-type × billable pair fills a TIMESHEET or marks
//      ATTENDANCE, which is what payroll later reads day counts from. Its
//      `defaultConfig` list, the row-reconciliation that guarantees every pair
//      exists even when the stored config is partial, and the per-row update
//      are all verbatim.
//   2. The `??` defaults. `billableByDefault ?? true` is NOT `|| false`: a
//      stored `false` must stay false, and a missing key must read as true.
//      Same for the two `?? false` toggles and `?? 'quarterly'`.
//
// The Plan Roles selects each write TWO keys — the id and the denormalised
// name, looked up from `members`. Both writes are preserved; dropping the name
// would leave plan tasks showing a blank assignee.
//
// The local `ToggleSwitch` is gone (ds `Switch`); three copies now remain in
// SettingsTimesheet, SettingsAts and components/ToggleSwitch.jsx.
// ─────────────────────────────────────────────────────────────────────────────

/** Label + hint above a control — the shape this tab repeats. */
function FieldBlock({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 3 }}>
        {label}
      </label>
      <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>{hint}</p>
      {children}
    </div>
  );
}

export default function SettingsEmployeeV2() {
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

  if (loading) return <PageSpinner label="Loading employee settings…" />;

  if (!isAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need admin access to manage Employee settings." />
      </Panel>
    );
  }

  if (fetchError) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="danger" compact
          title="Failed to load settings.">
          Please try refreshing the page.
        </EmptyState>
      </Panel>
    );
  }

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const th = { padding: '8px 12px', textAlign: 'left', font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
  const td = { padding: '7px 12px', font: "400 12px/1.3 'Inter', system-ui, sans-serif" };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>

        {/* Employee Defaults */}
        <Panel icon={<Users size={16} />} title="Employee Defaults">
          <div style={{ padding: 6, display: 'grid', gap: 14 }}>
            <FieldBlock
              id="emp-id-prefix"
              label="Employee ID Prefix"
              hint="Prefix for auto-generated IDs (e.g., EMP-001)"
            >
              <Input
                id="emp-id-prefix"
                type="text"
                maxLength={10}
                value={settings?.employeeIdPrefix ?? 'EMP'}
                onChange={e => update('employeeIdPrefix', e.target.value)}
                placeholder="EMP"
                style={{ width: 140 }}
              />
            </FieldBlock>

            <FieldBlock
              id="emp-default-type"
              label="Default Employment Type"
              hint="Type pre-selected when creating new employees"
            >
              <Select
                id="emp-default-type"
                value={settings?.defaultEmploymentType ?? 'confirmed'}
                onChange={e => update('defaultEmploymentType', e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="confirmed">Confirmed</option>
                <option value="internal_consultant">Internal Consultant</option>
                <option value="external_consultant">External Consultant</option>
                <option value="intern">Intern</option>
              </Select>
            </FieldBlock>

            <SettingRow
              label="Billable by Default"
              description="New employees are marked billable by default"
              control={(
                <Switch
                  label="Billable by Default"
                  checked={settings?.billableByDefault ?? true}
                  onChange={v => update('billableByDefault', v)}
                />
              )}
            />
            {/* Audit H7 — `requireManager` toggle was orphaned: the UI wrote
                the flag to org settings but nothing on the client or server
                enforced it. Removed to prevent misleading admins into
                thinking they'd hardened a workflow they hadn't. */}
          </div>
        </Panel>

        {/* Plan Roles */}
        <Panel icon={<Shield size={16} />} title="Plan Roles">
          <div style={{ padding: 6, display: 'grid', gap: 14 }}>
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
              Default assignees for onboarding/offboarding plan tasks. Per-task overrides in templates take priority.
            </p>

            <FieldBlock
              id="emp-default-hr"
              label="Default HR Officer"
              hint="Handles HR-type tasks (document collection, orientation, etc.)"
            >
              <Select
                id="emp-default-hr"
                value={settings?.defaultHrUserId ?? ''}
                onChange={e => {
                  const m = members.find(m => m.userId === e.target.value);
                  update('defaultHrUserId', e.target.value || null);
                  update('defaultHrUserName', m?.name || null);
                }}
              >
                <option value="">Not set (falls back to launcher)</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                ))}
              </Select>
            </FieldBlock>

            <FieldBlock
              id="emp-default-it"
              label="Default IT Admin"
              hint="Handles IT-type tasks (email setup, workspace access, etc.)"
            >
              <Select
                id="emp-default-it"
                value={settings?.defaultItUserId ?? ''}
                onChange={e => {
                  const m = members.find(m => m.userId === e.target.value);
                  update('defaultItUserId', e.target.value || null);
                  update('defaultItUserName', m?.name || null);
                }}
              >
                <option value="">Not set (falls back to launcher)</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                ))}
              </Select>
            </FieldBlock>
          </div>
        </Panel>

        {/* Profile & Updates */}
        <Panel icon={<UserCog size={16} />} title="Profile & Updates">
          <div style={{ padding: 6, display: 'grid', gap: 4 }}>
            <SettingRow
              label="Employee Self-Service"
              description="Allow employees to update their own profile information"
              control={(
                <Switch
                  label="Employee Self-Service"
                  checked={settings?.employeeSelfService ?? false}
                  onChange={v => update('employeeSelfService', v)}
                />
              )}
            />
            <SettingRow
              label="Profile Update Reminders"
              description="Send periodic email reminders to update personal info"
              control={(
                <Switch
                  label="Profile Update Reminders"
                  checked={settings?.profileUpdateReminders ?? false}
                  onChange={v => update('profileUpdateReminders', v)}
                />
              )}
            />
            {settings?.profileUpdateReminders && (
              <div style={{ paddingLeft: 14, borderLeft: '2px solid var(--line-2)', marginTop: 8 }}>
                <FieldBlock
                  id="emp-reminder-freq"
                  label="Reminder Frequency"
                  hint="How often to send update reminders"
                >
                  <Select
                    id="emp-reminder-freq"
                    value={settings?.reminderFrequency ?? 'quarterly'}
                    onChange={e => update('reminderFrequency', e.target.value)}
                    style={{ width: 'auto' }}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </FieldBlock>
              </div>
            )}
          </div>
        </Panel>

        {/* Timesheet Mode Config */}
        <Panel icon={<CalendarClock size={16} />} title="Timesheet Mode">
          <div style={{ padding: 6, display: 'grid', gap: 12 }}>
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
              Configure whether each employee type fills Timesheets (project-based hours) or marks Attendance.
            </p>
            <div style={{ borderRadius: 'var(--r-2)', overflow: 'hidden', boxShadow: '0 0 0 1px var(--line)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={th}>Employment Type</th>
                      <th style={th}>Billable</th>
                      <th style={th}>Mode</th>
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
                        <tr key={`${row.employmentType}-${row.billable}`} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                          <td style={{ ...td, color: 'var(--fg-2)' }}>{typeLabels[row.employmentType] || row.employmentType}</td>
                          <td style={{ ...td, color: 'var(--fg-4)' }}>{row.billable ? 'Yes' : 'No'}</td>
                          <td style={{ ...td, padding: '5px 12px' }}>
                            <Select
                              value={row.mode}
                              aria-label={`Mode for ${typeLabels[row.employmentType] || row.employmentType}, billable ${row.billable ? 'yes' : 'no'}`}
                              onChange={e => {
                                const updated = rows.map((r, j) => j === i ? { ...r, mode: e.target.value } : r);
                                update('timesheetModeConfig', updated);
                              }}
                              style={{ width: 'auto', height: 30 }}
                            >
                              <option value="attendance">Attendance</option>
                              <option value="timesheet">Timesheet</option>
                            </Select>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div>
        <Button onClick={handleSave} disabled={saving} iconLeft={<Save size={15} />}>
          {saving ? 'Saving...' : 'Save Employee Settings'}
        </Button>
      </div>
    </div>
  );
}
