/**
 * SettingsTimesheet — ESS app settings section
 * Odoo-inspired configuration: time recording, reminders, approval, overtime.
 * Only visible to users with admin role on the timesheet app.
 */
import { useState, useEffect } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { Save, Plus, Loader2, AlertCircle, Clock, Bell, CheckCircle2, Timer, CalendarOff, Trash2, Send } from 'lucide-react';
import timesheetApi from '../../utils/timesheetApi';
import { getTimesheetAppSettings, updateTimesheetAppSettings, getLeavePolicy, updateLeavePolicy } from '../../utils/timesheetApi';
import {
  Panel, Chip, Button, Input, Select, Switch, SettingRow, EmptyState, PageSpinner,
} from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Two buttons on this page EMAIL EMPLOYEES. `handleSendReminders` POSTs
// /reminders/send to everyone with a non-approved timesheet, and
// `handleSendAttReminders` does the same for attendance. Both are on the
// never-trigger list and were not clicked during verification — only their
// enabled/disabled state and their "last sent" copy were read.
//
// Everything from `const { timesheetUser }` down to `toggleEmpType` is spliced
// in verbatim (145 lines), including both send handlers and all five leave-type
// mutators. This is a leave-accrual surface: `accrualByEmployeeType` is what
// each employee's yearly quota is drawn from, so its mutator, its
// `?? lt.accrualPerYear ?? 0` fallback chain, and the eligibility toggle are
// carried across untouched.
//
// Also verbatim: the two reminder-day clamps,
// `Math.min(10, Math.max(1, Number(e.target.value) || 5))`, which keep the
// send window inside 1..10 days before month end.
//
// The local `ToggleSwitch` is gone (ds `Switch`) — fifth of six copies removed;
// only `components/ToggleSwitch.jsx` remains.
// ─────────────────────────────────────────────────────────────────────────────

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Eligibility options. Note the labels differ between the two lists in legacy
 *  ("Internal (Non-Billable)" vs "Non-Billable") — kept as-is. */
const EMP_TYPE_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'intern', label: 'Intern' },
  { value: 'internal_consultant_nonbillable', label: 'Internal (Non-Billable)' },
];
const EMP_TYPE_QUOTA_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'intern', label: 'Intern' },
  { value: 'internal_consultant_nonbillable', label: 'Non-Billable' },
];

/** Label + hint above a control — the shape this tab repeats. */
function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 3 }}>
        {label}
      </label>
      {hint && <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>{hint}</p>}
      {children}
    </div>
  );
}

/** Small label above a compact control, used inside a leave-type card. */
function MicroField({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Switch with its caption to the right, as the leave-type flags read. */
function FlagToggle({ label, checked, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Switch label={label} checked={checked} onChange={onChange} />
      <span style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{label}</span>
    </span>
  );
}

/** Multi-select pill for employee-type eligibility. */
function TypePill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '5px 11px', borderRadius: 'var(--r-1)', cursor: 'pointer', border: 0,
        font: "500 11px/1.3 'Inter', system-ui, sans-serif",
        background: active ? 'var(--brand-soft)' : 'var(--surface-2)',
        boxShadow: active ? '0 0 0 1px var(--brand-line)' : '0 0 0 1px var(--line)',
        color: active ? 'var(--fg)' : 'var(--fg-4)',
      }}
    >
      {children}
    </button>
  );
}

export default function SettingsTimesheetV2() {
  const { timesheetUser, loading: profileLoading } = useTimesheetContext();
  const tsRole = timesheetUser?.role || 'contractor';
  const isTimesheetAdmin = tsRole === 'admin';

  // App settings (Odoo-inspired)
  const [appSettings, setAppSettings] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [appSaving, setAppSaving] = useState(false);

  // Leave policy settings
  const [leavePolicy, setLeavePolicy] = useState(null);
  const [leaveSaving, setLeaveSaving] = useState(false);

  // Reminder state
  const [reminderStatus, setReminderStatus] = useState(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [attReminderStatus, setAttReminderStatus] = useState(null);
  const [sendingAttReminders, setSendingAttReminders] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTimesheetAdmin) { setAppLoading(false); setLoading(false); return; }
    Promise.all([
      getTimesheetAppSettings().then(setAppSettings).catch(() => {}),
      getLeavePolicy().then(data => setLeavePolicy(data.policy || data)).catch(() => {}),
    ]).finally(() => { setLoading(false); setAppLoading(false); });
  }, [isTimesheetAdmin]);

  // Reminder-day fields hold whatever was typed (including '') while focused so
  // the field can be cleared and retyped; normalise here rather than clamping
  // per-keystroke, which snaps the value out from under the cursor.
  const reminderDayOrDefault = (v) => Math.min(10, Math.max(1, Number(v) || 5));

  const handleSaveAppSettings = async () => {
    setAppSaving(true);
    try {
      await updateTimesheetAppSettings({
        ...appSettings,
        reminderDay: reminderDayOrDefault(appSettings?.reminderDay),
        attendanceReminderDay: reminderDayOrDefault(appSettings?.attendanceReminderDay),
      });
    } catch (err) {} finally { setAppSaving(false); }
  };

  // Fetch reminder status when reminders are enabled
  useEffect(() => {
    if (appSettings?.timesheetReminders) {
      timesheetApi.get('/reminders/status').then(r => setReminderStatus(r.data)).catch(() => {});
    }
    if (appSettings?.attendanceReminders) {
      timesheetApi.get('/attendance-reminders/status').then(r => setAttReminderStatus(r.data)).catch(() => {});
    }
  }, [appSettings?.timesheetReminders, appSettings?.attendanceReminders]);

  const handleSendReminders = async () => {
    setSendingReminders(true);
    try {
      const res = await timesheetApi.post('/reminders/send');
      const { sent, total } = res.data;
      alert(`Sent ${sent} reminder(s) to employees with non-approved timesheets (${total} total employees)`);
      // Refresh status
      timesheetApi.get('/reminders/status').then(r => setReminderStatus(r.data)).catch(() => {});
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send reminders');
    } finally {
      setSendingReminders(false);
    }
  };

  const handleSendAttReminders = async () => {
    setSendingAttReminders(true);
    try {
      const res = await timesheetApi.post('/attendance-reminders/send');
      const { sent, total } = res.data;
      alert(`Sent ${sent} attendance reminder(s) (${total} total attendance employees)`);
      timesheetApi.get('/attendance-reminders/status').then(r => setAttReminderStatus(r.data)).catch(() => {});
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send attendance reminders');
    } finally {
      setSendingAttReminders(false);
    }
  };

  const handleSaveLeavePolicy = async () => {
    setLeaveSaving(true);
    try {
      await updateLeavePolicy(leavePolicy);
    } catch (err) {} finally { setLeaveSaving(false); }
  };

  const addLeaveType = () => {
    setLeavePolicy(prev => ({
      ...prev,
      leaveTypes: [
        ...(prev.leaveTypes || []),
        {
          code: '', name: '', accrualPerYear: 0, accrualFrequency: 'monthly',
          carryForward: false, carryForwardCap: 0, encashable: false, expiresAtYearEnd: false,
          halfDayAllowed: true,
          eligibleEmployeeTypes: ['confirmed'],
          accrualByEmployeeType: {},
        },
      ],
    }));
  };

  const removeLeaveType = (index) => {
    setLeavePolicy(prev => ({
      ...prev,
      leaveTypes: prev.leaveTypes.filter((_, i) => i !== index),
    }));
  };

  const updateLeaveType = (index, field, value) => {
    setLeavePolicy(prev => ({
      ...prev,
      leaveTypes: prev.leaveTypes.map((lt, i) =>
        i === index ? { ...lt, [field]: value } : lt
      ),
    }));
  };

  const updateLeaveTypeQuota = (index, empType, value) => {
    setLeavePolicy(prev => ({
      ...prev,
      leaveTypes: prev.leaveTypes.map((lt, i) => {
        if (i !== index) return lt;
        return {
          ...lt,
          accrualByEmployeeType: {
            ...(lt.accrualByEmployeeType || {}),
            [empType]: Number(value) || 0,
          },
        };
      }),
    }));
  };

  const toggleEmpType = (index, empType) => {
    setLeavePolicy(prev => ({
      ...prev,
      leaveTypes: prev.leaveTypes.map((lt, i) => {
        if (i !== index) return lt;
        const types = lt.eligibleEmployeeTypes || [];
        return {
          ...lt,
          eligibleEmployeeTypes: types.includes(empType)
            ? types.filter(t => t !== empType)
            : [...types, empType],
        };
      }),
    }));
  };

  if (profileLoading || loading || appLoading) return <PageSpinner label="Loading ESS settings…" />;

  if (!isTimesheetAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need ESS admin access to manage these settings." />
      </Panel>
    );
  }

  const updateApp = (key, value) => setAppSettings(prev => ({ ...prev, [key]: value }));

  const indent = { paddingLeft: 14, borderLeft: '2px solid var(--line-2)', display: 'grid', gap: 14 };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* APP SETTINGS (Odoo-inspired)                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {appSettings && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>

            {/* Time Recording */}
            <Panel icon={<Clock size={16} />} title="Time Recording">
              <div style={{ padding: 6, display: 'grid', gap: 14 }}>
                <Field id="ts-hours-day" label="Working Hours per Day" hint="Standard working hours used for day calculations">
                  <Input id="ts-hours-day" type="number" min="1" max="12"
                    value={appSettings.workingHoursPerDay ?? 8}
                    onChange={e => updateApp('workingHoursPerDay', Number(e.target.value))}
                    style={{ width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                </Field>
                <Field id="ts-days-week" label="Working Days per Week" hint="Used to calculate monthly working days">
                  <Select id="ts-days-week"
                    value={appSettings.workingDaysPerWeek ?? 5}
                    onChange={e => updateApp('workingDaysPerWeek', Number(e.target.value))}
                    style={{ width: 'auto' }}>
                    <option value={5}>5 days</option>
                    <option value={6}>6 days</option>
                    <option value={7}>7 days</option>
                  </Select>
                </Field>
                <Field id="ts-unit" label="Unit of Time" hint="How time is recorded in timesheets">
                  <Select id="ts-unit"
                    value={appSettings.unitOfTime ?? 'days'}
                    onChange={e => updateApp('unitOfTime', e.target.value)}
                    style={{ width: 'auto' }}>
                    <option value="days">Days</option>
                    <option value="hours">Hours</option>
                  </Select>
                </Field>
              </div>
            </Panel>

            {/* Reminders & Automation */}
            <Panel icon={<Bell size={16} />} title="Reminders & Automation">
              <div style={{ padding: 6, display: 'grid', gap: 14 }}>
                <SettingRow
                  label="Timesheet Reminder Emails"
                  description="Send daily email reminders to fill timesheet until submitted"
                  control={<Switch label="Timesheet Reminder Emails"
                    checked={appSettings.timesheetReminders ?? false}
                    onChange={v => updateApp('timesheetReminders', v)} />}
                />
                {appSettings.timesheetReminders && (
                  <div style={indent}>
                    <Field id="ts-reminder-day" label="Days Before Month End" hint="Reminder emails will be sent this many days before the last day of each month">
                      <Input id="ts-reminder-day" type="number" min="1" max="10"
                        value={appSettings.reminderDay ?? 5}
                        onChange={e => updateApp('reminderDay', e.target.value)}
                        onBlur={e => updateApp('reminderDay', reminderDayOrDefault(e.target.value))}
                        style={{ width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                    </Field>
                    <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
                      <SettingRow
                        label="Send Now"
                        description={reminderStatus?.sent
                          ? `Last sent: ${new Date(reminderStatus.log?.sentAt).toLocaleDateString('en-IN')} (${reminderStatus.log?.employeesReminded} employees)`
                          : 'No reminders sent this month yet'}
                        control={(
                          <Button variant="secondary" size="sm" onClick={handleSendReminders} disabled={sendingReminders}
                            iconLeft={sendingReminders ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}>
                            Send Reminders
                          </Button>
                        )}
                      />
                    </div>
                  </div>
                )}

                <SettingRow
                  label="Attendance Reminder Emails"
                  description="Send daily email reminders to fill attendance until submitted"
                  control={<Switch label="Attendance Reminder Emails"
                    checked={appSettings.attendanceReminders ?? false}
                    onChange={v => updateApp('attendanceReminders', v)} />}
                />
                {appSettings.attendanceReminders && (
                  <div style={indent}>
                    <Field id="ts-att-reminder-day" label="Days Before Month End" hint="Attendance reminder emails will be sent this many days before the last day of each month">
                      <Input id="ts-att-reminder-day" type="number" min="1" max="10"
                        value={appSettings.attendanceReminderDay ?? 5}
                        onChange={e => updateApp('attendanceReminderDay', e.target.value)}
                        onBlur={e => updateApp('attendanceReminderDay', reminderDayOrDefault(e.target.value))}
                        style={{ width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                    </Field>
                    <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
                      <SettingRow
                        label="Send Now"
                        description={attReminderStatus?.sent
                          ? `Last sent: ${new Date(attReminderStatus.log?.sentAt).toLocaleDateString('en-IN')} (${attReminderStatus.log?.employeesReminded} employees)`
                          : 'No attendance reminders sent this month yet'}
                        control={(
                          <Button variant="secondary" size="sm" onClick={handleSendAttReminders} disabled={sendingAttReminders}
                            iconLeft={sendingAttReminders ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}>
                            Send Reminders
                          </Button>
                        )}
                      />
                    </div>
                  </div>
                )}

                <SettingRow
                  label="Auto-Submit on Month End"
                  description="Automatically submit draft entries at end of month"
                  control={<Switch label="Auto-Submit on Month End"
                    checked={appSettings.autoSubmitOnMonthEnd ?? false}
                    onChange={v => updateApp('autoSubmitOnMonthEnd', v)} />}
                />
              </div>
            </Panel>

            {/* Approval Workflow */}
            <Panel icon={<CheckCircle2 size={16} />} title="Approval Workflow">
              <div style={{ padding: 6, display: 'grid', gap: 14 }}>
                <SettingRow
                  label="Require Approval"
                  description="Entries must be approved by manager or admin"
                  control={<Switch label="Require Approval"
                    checked={appSettings.requireApproval ?? true}
                    onChange={v => updateApp('requireApproval', v)} />}
                />
                {appSettings.requireApproval && (
                  <SettingRow
                    label="Auto-Approve Managers"
                    description="Manager entries are automatically approved"
                    control={<Switch label="Auto-Approve Managers"
                      checked={appSettings.autoApproveManagers ?? false}
                      onChange={v => updateApp('autoApproveManagers', v)} />}
                  />
                )}
              </div>
            </Panel>

            {/* Overtime */}
            <Panel icon={<Timer size={16} />} title="Overtime">
              <div style={{ padding: 6, display: 'grid', gap: 14 }}>
                <SettingRow
                  label="Allow Overtime"
                  description="Allow entries exceeding standard working hours"
                  control={<Switch label="Allow Overtime"
                    checked={appSettings.allowOvertime ?? false}
                    onChange={v => updateApp('allowOvertime', v)} />}
                />
                {appSettings.allowOvertime && (
                  <div style={indent}>
                    <Field id="ts-ot-mult" label="Overtime Multiplier" hint="Pay multiplier for overtime hours (e.g., 1.5x)">
                      <Input id="ts-ot-mult" type="number" min="1" max="3" step="0.1"
                        value={appSettings.overtimeMultiplier ?? 1.5}
                        onChange={e => updateApp('overtimeMultiplier', Number(e.target.value))}
                        style={{ width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                    </Field>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div>
            <Button onClick={handleSaveAppSettings} disabled={appSaving} iconLeft={<Save size={15} />}>
              {appSaving ? 'Saving...' : 'Save App Settings'}
            </Button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* LEAVE POLICY SETTINGS                                           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {leavePolicy && (
        <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 24, display: 'grid', gap: 14 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>
              <CalendarOff size={18} style={{ color: 'var(--brand-ink)' }} />
              Leave Policy
            </h2>
            <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
              Configure leave types, accrual rules, and eligibility
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
            {/* General Settings */}
            <Panel title="General Settings">
              <div style={{ padding: 6, display: 'grid', gap: 14 }}>
                <Field id="lp-fy-start" label="Financial Year Start Month" hint="Month when the financial year begins">
                  <Select id="lp-fy-start"
                    value={leavePolicy.financialYear?.startMonth ?? 4}
                    onChange={e => setLeavePolicy(prev => ({ ...prev, financialYear: { ...prev.financialYear, startMonth: Number(e.target.value) } }))}
                    style={{ width: 'auto' }}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={m}>{monthNames[m]}</option>
                    ))}
                  </Select>
                </Field>
                <SettingRow
                  label="Half-Day Leave"
                  description="Allow employees to take half-day leaves"
                  control={<Switch label="Half-Day Leave"
                    checked={leavePolicy.halfDayAllowed ?? true}
                    onChange={v => setLeavePolicy(prev => ({ ...prev, halfDayAllowed: v }))} />}
                />
                <SettingRow
                  label="Sandwich Rule"
                  description="Count weekends/holidays between leave days as leave"
                  control={<Switch label="Sandwich Rule"
                    checked={leavePolicy.sandwichRule?.enabled ?? false}
                    onChange={v => setLeavePolicy(prev => ({ ...prev, sandwichRule: { ...prev.sandwichRule, enabled: v } }))} />}
                />
                <SettingRow
                  label="Pro-Rata on Joining"
                  description="Prorate leave accrual for mid-period joins"
                  control={<Switch label="Pro-Rata on Joining"
                    checked={leavePolicy.proRataOnJoining ?? true}
                    onChange={v => setLeavePolicy(prev => ({ ...prev, proRataOnJoining: v }))} />}
                />
                <SettingRow
                  label="Encashment on Exit"
                  description="Encash unused leave balance on separation"
                  control={<Switch label="Encashment on Exit"
                    checked={leavePolicy.encashmentOnExit ?? false}
                    onChange={v => setLeavePolicy(prev => ({ ...prev, encashmentOnExit: v }))} />}
                />
              </div>
            </Panel>

            {/* Leave Types Summary */}
            <Panel
              title="Leave Types"
              actions={<Button variant="ghost" size="sm" onClick={addLeaveType} iconLeft={<Plus size={14} />}>Add Type</Button>}
            >
              <div style={{ padding: 6, display: 'grid', gap: 8 }}>
                {(leavePolicy.leaveTypes || []).map((lt, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-1)',
                  }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ font: "600 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                        {lt.name || lt.code || 'New Type'}
                      </span>
                      <span style={{ font: "400 12px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
                        {lt.accrualPerYear}/yr
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{lt.accrualFrequency}</span>
                      {lt.carryForward && <Chip tone="brand">CF</Chip>}
                      {lt.expiresAtYearEnd && <Chip tone="danger">Expires</Chip>}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Leave Types Detail */}
          {(leavePolicy.leaveTypes || []).length > 0 && (
            <div style={{ display: 'grid', gap: 14 }}>
              {leavePolicy.leaveTypes.map((lt, i) => (
                <Panel
                  key={i}
                  title={lt.name || `Leave Type ${i + 1}`}
                  actions={(
                    <Button variant="ghost" size="sm" onClick={() => removeLeaveType(i)}
                      aria-label={`Remove ${lt.name || `Leave Type ${i + 1}`}`}
                      iconLeft={<Trash2 size={15} />} />
                  )}
                >
                  <div style={{ padding: 6, display: 'grid', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                      <MicroField id={`lt-code-${i}`} label="Code">
                        <Input id={`lt-code-${i}`} type="text" value={lt.code || ''}
                          onChange={e => updateLeaveType(i, 'code', e.target.value)} placeholder="e.g., sick_leave" />
                      </MicroField>
                      <MicroField id={`lt-name-${i}`} label="Name">
                        <Input id={`lt-name-${i}`} type="text" value={lt.name || ''}
                          onChange={e => updateLeaveType(i, 'name', e.target.value)} placeholder="e.g., Sick Leave" />
                      </MicroField>
                      <MicroField id={`lt-accrual-${i}`} label="Accrual / Year">
                        <Input id={`lt-accrual-${i}`} type="number" min="0" value={lt.accrualPerYear ?? 0}
                          onChange={e => updateLeaveType(i, 'accrualPerYear', Number(e.target.value))}
                          style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                      </MicroField>
                      <MicroField id={`lt-freq-${i}`} label="Accrual Frequency">
                        <Select id={`lt-freq-${i}`} value={lt.accrualFrequency || 'monthly'}
                          onChange={e => updateLeaveType(i, 'accrualFrequency', e.target.value)}>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annual">Annual</option>
                          <option value="manual">Manual</option>
                          <option value="none">None</option>
                        </Select>
                      </MicroField>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                      <FlagToggle label="Carry Forward" checked={lt.carryForward ?? false} onChange={v => updateLeaveType(i, 'carryForward', v)} />
                      <FlagToggle label="Expires at FY End" checked={lt.expiresAtYearEnd ?? false} onChange={v => updateLeaveType(i, 'expiresAtYearEnd', v)} />
                      <FlagToggle label="Encashable" checked={lt.encashable ?? false} onChange={v => updateLeaveType(i, 'encashable', v)} />
                      <FlagToggle label="Half-Day" checked={lt.halfDayAllowed ?? true} onChange={v => updateLeaveType(i, 'halfDayAllowed', v)} />
                    </div>

                    {lt.carryForward && (
                      <MicroField id={`lt-cfcap-${i}`} label="Carry Forward Cap (0 = no cap)">
                        <Input id={`lt-cfcap-${i}`} type="number" min="0" value={lt.carryForwardCap ?? 0}
                          onChange={e => updateLeaveType(i, 'carryForwardCap', Number(e.target.value))}
                          style={{ width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                      </MicroField>
                    )}

                    <div>
                      <span style={{ display: 'block', font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 8 }}>
                        Eligible Employee Types
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {EMP_TYPE_OPTIONS.map(opt => (
                          <TypePill
                            key={opt.value}
                            active={(lt.eligibleEmployeeTypes || []).includes(opt.value)}
                            onClick={() => toggleEmpType(i, opt.value)}
                          >
                            {opt.label}
                          </TypePill>
                        ))}
                      </div>
                    </div>

                    {/* Per-employee-type quota */}
                    {(lt.eligibleEmployeeTypes || []).length > 0 && (
                      <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
                        <span style={{ display: 'block', font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 10 }}>
                          Leave Quota by Employee Type
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                          {EMP_TYPE_QUOTA_OPTIONS.filter(opt => (lt.eligibleEmployeeTypes || []).includes(opt.value)).map(opt => (
                            <div key={opt.value} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: 'var(--surface-2)', borderRadius: 'var(--r-1)', padding: '6px 10px',
                            }}>
                              <span style={{ flex: 1, minWidth: 0, font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{opt.label}</span>
                              <Input
                                type="number"
                                min="0"
                                aria-label={`${lt.name || `Leave Type ${i + 1}`} quota for ${opt.label}`}
                                value={lt.accrualByEmployeeType?.[opt.value] ?? lt.accrualPerYear ?? 0}
                                onChange={e => updateLeaveTypeQuota(i, opt.value, e.target.value)}
                                style={{ width: 62, height: 30, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                              />
                              <span style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>/yr</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Panel>
              ))}
            </div>
          )}

          <div>
            <Button onClick={handleSaveLeavePolicy} disabled={leaveSaving} iconLeft={<Save size={15} />}>
              {leaveSaving ? 'Saving...' : 'Save Leave Policy'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
