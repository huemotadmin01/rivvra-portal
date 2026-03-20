/**
 * SettingsTimesheet — ESS app settings section
 * Odoo-inspired configuration: time recording, reminders, approval, overtime.
 * Only visible to users with admin role on the timesheet app.
 */
import { useState, useEffect } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { Save, Plus, X, Loader2, AlertCircle, Clock, Bell, CheckCircle2, Timer, CalendarOff, Trash2, Send, CalendarClock } from 'lucide-react';
import timesheetApi from '../../utils/timesheetApi';
import { getTimesheetAppSettings, updateTimesheetAppSettings, getLeavePolicy, updateLeavePolicy } from '../../utils/timesheetApi';
import employeeApi from '../../utils/employeeApi';
import { useOrg } from '../../context/OrgContext';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

const DEFAULT_TIMESHEET_MODE_CONFIG = [
  { employmentType: 'confirmed', billable: true, mode: 'attendance' },
  { employmentType: 'confirmed', billable: false, mode: 'attendance' },
  { employmentType: 'internal_consultant', billable: true, mode: 'timesheet' },
  { employmentType: 'internal_consultant', billable: false, mode: 'attendance' },
  { employmentType: 'external_consultant', billable: true, mode: 'timesheet' },
  { employmentType: 'intern', billable: true, mode: 'attendance' },
  { employmentType: 'intern', billable: false, mode: 'attendance' },
];

const TIMESHEET_MODE_TYPE_LABELS = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal Consultant',
  external_consultant: 'External Consultant',
  intern: 'Intern',
};

export default function SettingsTimesheet() {
  const { timesheetUser, loading: profileLoading } = useTimesheetContext();
  const { currentOrg } = useOrg();
  const tsRole = timesheetUser?.role || 'contractor';
  const isTimesheetAdmin = tsRole === 'admin';

  // App settings (Odoo-inspired)
  const [appSettings, setAppSettings] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [appSaving, setAppSaving] = useState(false);

  // Leave policy settings
  const [leavePolicy, setLeavePolicy] = useState(null);
  const [leaveSaving, setLeaveSaving] = useState(false);

  // Timesheet mode config (from employee app settings)
  const [timesheetModeConfig, setTimesheetModeConfig] = useState(DEFAULT_TIMESHEET_MODE_CONFIG);
  const [modeSaving, setModeSaving] = useState(false);

  // Reminder state
  const [reminderStatus, setReminderStatus] = useState(null);
  const [sendingReminders, setSendingReminders] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTimesheetAdmin) { setAppLoading(false); setLoading(false); return; }
    Promise.all([
      getTimesheetAppSettings().then(setAppSettings).catch(() => {}),
      getLeavePolicy().then(data => setLeavePolicy(data.policy || data)).catch(() => {}),
      currentOrg?.slug ? employeeApi.getAppSettings(currentOrg.slug).then(res => {
        if (res.success && res.settings?.timesheetModeConfig) {
          // Merge with defaults to ensure all rows exist
          const saved = res.settings.timesheetModeConfig;
          const merged = DEFAULT_TIMESHEET_MODE_CONFIG.map(d => {
            const match = saved.find(r => r.employmentType === d.employmentType && r.billable === d.billable);
            return match || d;
          });
          setTimesheetModeConfig(merged);
        }
      }).catch(() => {}) : Promise.resolve(),
    ]).finally(() => { setLoading(false); setAppLoading(false); });
  }, [isTimesheetAdmin, currentOrg?.slug]);

  const handleSaveTimesheetMode = async () => {
    if (!currentOrg?.slug) return;
    setModeSaving(true);
    try {
      await employeeApi.updateAppSettings(currentOrg.slug, { timesheetModeConfig });
    } catch {} finally { setModeSaving(false); }
  };

  const handleSaveAppSettings = async () => {
    setAppSaving(true);
    try {
      await updateTimesheetAppSettings(appSettings);
    } catch {} finally { setAppSaving(false); }
  };

  // Fetch reminder status when reminders are enabled
  useEffect(() => {
    if (appSettings?.timesheetReminders) {
      timesheetApi.get('/reminders/status').then(r => setReminderStatus(r.data)).catch(() => {});
    }
  }, [appSettings?.timesheetReminders]);

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

  const handleSaveLeavePolicy = async () => {
    setLeaveSaving(true);
    try {
      await updateLeavePolicy(leavePolicy);
    } catch {} finally { setLeaveSaving(false); }
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

  if (profileLoading || loading || appLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>;
  }

  if (!isTimesheetAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need ESS admin access to manage these settings.</p>
        </div>
      </div>
    );
  }

  const updateApp = (key, value) => setAppSettings(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-8">
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TIMESHEET MODE CONFIG                                            */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
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
                {timesheetModeConfig.map((row, i) => (
                  <tr key={`${row.employmentType}-${row.billable}`} className={i % 2 === 0 ? '' : 'bg-dark-800/20'}>
                    <td className="px-3 py-2.5 text-dark-300">{TIMESHEET_MODE_TYPE_LABELS[row.employmentType] || row.employmentType}</td>
                    <td className="px-3 py-2.5 text-dark-400">{row.billable ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={row.mode}
                        onChange={e => {
                          setTimesheetModeConfig(prev => prev.map((r, j) => j === i ? { ...r, mode: e.target.value } : r));
                        }}
                        className="input-field text-sm py-1 px-2 w-auto"
                      >
                        <option value="attendance">Attendance</option>
                        <option value="timesheet">Timesheet</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleSaveTimesheetMode} disabled={modeSaving}
            className="btn-primary px-5 py-2 flex items-center gap-2 disabled:opacity-50 mt-4 text-sm">
            <Save size={14} /> {modeSaving ? 'Saving...' : 'Save Timesheet Mode'}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* APP SETTINGS (Odoo-inspired)                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {appSettings && (
        <div>
          <div className="border-t border-dark-700 pt-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Time Recording */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={18} className="text-blue-400" />
                  <h3 className="font-semibold text-white">Time Recording</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">Working Hours per Day</label>
                    <p className="text-xs text-dark-500 mb-2">Standard working hours used for day calculations</p>
                    <input type="number" min="1" max="12"
                      value={appSettings.workingHoursPerDay ?? 8}
                      onChange={e => updateApp('workingHoursPerDay', Number(e.target.value))}
                      className="input-field w-24" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">Working Days per Week</label>
                    <p className="text-xs text-dark-500 mb-2">Used to calculate monthly working days</p>
                    <select
                      value={appSettings.workingDaysPerWeek ?? 5}
                      onChange={e => updateApp('workingDaysPerWeek', Number(e.target.value))}
                      className="input-field w-24">
                      <option value={5}>5 days</option>
                      <option value={6}>6 days</option>
                      <option value={7}>7 days</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">Unit of Time</label>
                    <p className="text-xs text-dark-500 mb-2">How time is recorded in timesheets</p>
                    <select
                      value={appSettings.unitOfTime ?? 'days'}
                      onChange={e => updateApp('unitOfTime', e.target.value)}
                      className="input-field w-32">
                      <option value="days">Days</option>
                      <option value="hours">Hours</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Reminders & Automation */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Bell size={18} className="text-amber-400" />
                  <h3 className="font-semibold text-white">Reminders & Automation</h3>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">ESS Reminder Emails</p>
                      <p className="text-xs text-dark-500">Send email reminder to fill incomplete entries</p>
                    </div>
                    <ToggleSwitch
                      checked={appSettings.timesheetReminders ?? false}
                      onChange={v => updateApp('timesheetReminders', v)}
                    />
                  </div>
                  {appSettings.timesheetReminders && (
                    <div className="pl-4 border-l-2 border-dark-700 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-1">Days Before Month End</label>
                        <p className="text-xs text-dark-500 mb-2">Reminder emails will be sent this many days before the last day of each month</p>
                        <input type="number" min="1" max="10"
                          value={appSettings.reminderDay ?? 5}
                          onChange={e => updateApp('reminderDay', Math.min(10, Math.max(1, Number(e.target.value) || 5)))}
                          className="input-field w-24" />
                      </div>
                      <div className="pt-3 border-t border-dark-700">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-dark-300">Send Now</p>
                            <p className="text-xs text-dark-500">
                              {reminderStatus?.sent
                                ? `Last sent: ${new Date(reminderStatus.log?.sentAt).toLocaleDateString('en-IN')} (${reminderStatus.log?.employeesReminded} employees)`
                                : 'No reminders sent this month yet'}
                            </p>
                          </div>
                          <button
                            onClick={handleSendReminders}
                            disabled={sendingReminders}
                            className="btn-secondary text-sm flex items-center gap-2"
                          >
                            {sendingReminders ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Send Reminders
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Auto-Submit on Month End</p>
                      <p className="text-xs text-dark-500">Automatically submit draft entries at end of month</p>
                    </div>
                    <ToggleSwitch
                      checked={appSettings.autoSubmitOnMonthEnd ?? false}
                      onChange={v => updateApp('autoSubmitOnMonthEnd', v)}
                    />
                  </div>
                </div>
              </div>

              {/* Approval Workflow */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 size={18} className="text-green-400" />
                  <h3 className="font-semibold text-white">Approval Workflow</h3>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Require Approval</p>
                      <p className="text-xs text-dark-500">Entries must be approved by manager or admin</p>
                    </div>
                    <ToggleSwitch
                      checked={appSettings.requireApproval ?? true}
                      onChange={v => updateApp('requireApproval', v)}
                    />
                  </div>
                  {appSettings.requireApproval && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-dark-300">Auto-Approve Managers</p>
                        <p className="text-xs text-dark-500">Manager entries are automatically approved</p>
                      </div>
                      <ToggleSwitch
                        checked={appSettings.autoApproveManagers ?? false}
                        onChange={v => updateApp('autoApproveManagers', v)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Overtime */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Timer size={18} className="text-purple-400" />
                  <h3 className="font-semibold text-white">Overtime</h3>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Allow Overtime</p>
                      <p className="text-xs text-dark-500">Allow entries exceeding standard working hours</p>
                    </div>
                    <ToggleSwitch
                      checked={appSettings.allowOvertime ?? false}
                      onChange={v => updateApp('allowOvertime', v)}
                    />
                  </div>
                  {appSettings.allowOvertime && (
                    <div className="pl-4 border-l-2 border-dark-700">
                      <label className="block text-sm font-medium text-dark-300 mb-1">Overtime Multiplier</label>
                      <p className="text-xs text-dark-500 mb-2">Pay multiplier for overtime hours (e.g., 1.5x)</p>
                      <input type="number" min="1" max="3" step="0.1"
                        value={appSettings.overtimeMultiplier ?? 1.5}
                        onChange={e => updateApp('overtimeMultiplier', Number(e.target.value))}
                        className="input-field w-24" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={handleSaveAppSettings} disabled={appSaving}
              className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              <Save size={16} /> {appSaving ? 'Saving...' : 'Save App Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* LEAVE POLICY SETTINGS                                           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {leavePolicy && (
        <div>
          <div className="border-t border-dark-700 pt-8">
            <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <CalendarOff size={20} className="text-rivvra-400" />
              Leave Policy
            </h2>
            <p className="text-sm text-dark-400 mb-6">Configure leave types, accrual rules, and eligibility</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* General Settings */}
              <div className="card p-5">
                <h3 className="font-semibold text-white mb-4">General Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">Financial Year Start Month</label>
                    <p className="text-xs text-dark-500 mb-2">Month when the financial year begins</p>
                    <select
                      value={leavePolicy.financialYear?.startMonth ?? 4}
                      onChange={e => setLeavePolicy(prev => ({ ...prev, financialYear: { ...prev.financialYear, startMonth: Number(e.target.value) } }))}
                      className="input-field w-40">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <option key={m} value={m}>{monthNames[m]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Half-Day Leave</p>
                      <p className="text-xs text-dark-500">Allow employees to take half-day leaves</p>
                    </div>
                    <ToggleSwitch
                      checked={leavePolicy.halfDayAllowed ?? true}
                      onChange={v => setLeavePolicy(prev => ({ ...prev, halfDayAllowed: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Sandwich Rule</p>
                      <p className="text-xs text-dark-500">Count weekends/holidays between leave days as leave</p>
                    </div>
                    <ToggleSwitch
                      checked={leavePolicy.sandwichRule?.enabled ?? false}
                      onChange={v => setLeavePolicy(prev => ({ ...prev, sandwichRule: { ...prev.sandwichRule, enabled: v } }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Pro-Rata on Joining</p>
                      <p className="text-xs text-dark-500">Prorate leave accrual for mid-period joins</p>
                    </div>
                    <ToggleSwitch
                      checked={leavePolicy.proRataOnJoining ?? true}
                      onChange={v => setLeavePolicy(prev => ({ ...prev, proRataOnJoining: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Encashment on Exit</p>
                      <p className="text-xs text-dark-500">Encash unused leave balance on separation</p>
                    </div>
                    <ToggleSwitch
                      checked={leavePolicy.encashmentOnExit ?? false}
                      onChange={v => setLeavePolicy(prev => ({ ...prev, encashmentOnExit: v }))}
                    />
                  </div>
                </div>
              </div>

              {/* Leave Types Summary */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Leave Types</h3>
                  <button onClick={addLeaveType} className="text-rivvra-400 text-sm font-medium hover:text-rivvra-300 flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Add Type
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  {(leavePolicy.leaveTypes || []).map((lt, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-dark-800/50 rounded-lg">
                      <div>
                        <span className="text-white font-medium">{lt.name || lt.code || 'New Type'}</span>
                        <span className="text-dark-500 ml-2">{lt.accrualPerYear}/yr</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-dark-500">{lt.accrualFrequency}</span>
                        {lt.carryForward && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">CF</span>}
                        {lt.expiresAtYearEnd && <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">Expires</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Leave Types Detail */}
            {(leavePolicy.leaveTypes || []).length > 0 && (
              <div className="space-y-4 mb-6">
                {leavePolicy.leaveTypes.map((lt, i) => (
                  <div key={i} className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-white">{lt.name || `Leave Type ${i + 1}`}</h4>
                      <button onClick={() => removeLeaveType(i)} className="text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <label className="block text-xs text-dark-500 mb-1">Code</label>
                        <input type="text" value={lt.code || ''} onChange={e => updateLeaveType(i, 'code', e.target.value)}
                          className="input-field w-full text-sm" placeholder="e.g., sick_leave" />
                      </div>
                      <div>
                        <label className="block text-xs text-dark-500 mb-1">Name</label>
                        <input type="text" value={lt.name || ''} onChange={e => updateLeaveType(i, 'name', e.target.value)}
                          className="input-field w-full text-sm" placeholder="e.g., Sick Leave" />
                      </div>
                      <div>
                        <label className="block text-xs text-dark-500 mb-1">Accrual / Year</label>
                        <input type="number" min="0" value={lt.accrualPerYear ?? 0} onChange={e => updateLeaveType(i, 'accrualPerYear', Number(e.target.value))}
                          className="input-field w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-dark-500 mb-1">Accrual Frequency</label>
                        <select value={lt.accrualFrequency || 'monthly'} onChange={e => updateLeaveType(i, 'accrualFrequency', e.target.value)}
                          className="input-field w-full text-sm">
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annual">Annual</option>
                          <option value="manual">Manual</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={lt.carryForward ?? false} onChange={v => updateLeaveType(i, 'carryForward', v)} />
                        <span className="text-xs text-dark-400">Carry Forward</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={lt.expiresAtYearEnd ?? false} onChange={v => updateLeaveType(i, 'expiresAtYearEnd', v)} />
                        <span className="text-xs text-dark-400">Expires at FY End</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={lt.encashable ?? false} onChange={v => updateLeaveType(i, 'encashable', v)} />
                        <span className="text-xs text-dark-400">Encashable</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={lt.halfDayAllowed ?? true} onChange={v => updateLeaveType(i, 'halfDayAllowed', v)} />
                        <span className="text-xs text-dark-400">Half-Day</span>
                      </div>
                    </div>
                    {lt.carryForward && (
                      <div className="mb-4">
                        <label className="block text-xs text-dark-500 mb-1">Carry Forward Cap (0 = no cap)</label>
                        <input type="number" min="0" value={lt.carryForwardCap ?? 0} onChange={e => updateLeaveType(i, 'carryForwardCap', Number(e.target.value))}
                          className="input-field w-24 text-sm" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-dark-500 mb-2">Eligible Employee Types</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 'confirmed', label: 'Confirmed' },
                          { value: 'intern', label: 'Intern' },
                          { value: 'internal_consultant_nonbillable', label: 'Internal (Non-Billable)' },
                        ].map(opt => (
                          <button key={opt.value} type="button" onClick={() => toggleEmpType(i, opt.value)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                              (lt.eligibleEmployeeTypes || []).includes(opt.value)
                                ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
                                : 'bg-dark-800 border-dark-700 text-dark-500 hover:text-dark-300'
                            }`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Per-employee-type quota */}
                    {(lt.eligibleEmployeeTypes || []).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-dark-700/50">
                        <label className="block text-xs text-dark-500 mb-3">Leave Quota by Employee Type</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { value: 'confirmed', label: 'Confirmed' },
                            { value: 'intern', label: 'Intern' },
                            { value: 'internal_consultant_nonbillable', label: 'Non-Billable' },
                          ].filter(opt => (lt.eligibleEmployeeTypes || []).includes(opt.value)).map(opt => (
                            <div key={opt.value} className="flex items-center gap-2 bg-dark-800/50 rounded-lg px-3 py-2">
                              <span className="text-xs text-dark-400 flex-1">{opt.label}</span>
                              <input
                                type="number"
                                min="0"
                                value={lt.accrualByEmployeeType?.[opt.value] ?? lt.accrualPerYear ?? 0}
                                onChange={e => updateLeaveTypeQuota(i, opt.value, e.target.value)}
                                className="input-field w-16 text-xs text-center"
                              />
                              <span className="text-[10px] text-dark-500">/yr</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleSaveLeavePolicy} disabled={leaveSaving}
              className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
              <Save size={16} /> {leaveSaving ? 'Saving...' : 'Save Leave Policy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
