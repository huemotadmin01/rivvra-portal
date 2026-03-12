/**
 * SettingsTimesheet — Timesheet app settings section
 * Payroll settings + Odoo-inspired configuration: time recording, reminders, approval, overtime.
 * Only visible to users with admin role on the timesheet app.
 */
import { useState, useEffect } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { Save, Plus, X, Calendar, Loader2, AlertCircle, Clock, Bell, CheckCircle2, Timer, CalendarOff, Trash2 } from 'lucide-react';
import timesheetApi from '../../utils/timesheetApi';
import { getTimesheetAppSettings, updateTimesheetAppSettings, getLeavePolicy, updateLeavePolicy } from '../../utils/timesheetApi';

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

export default function SettingsTimesheet() {
  const { timesheetUser, loading: profileLoading } = useTimesheetContext();
  const tsRole = timesheetUser?.role || 'contractor';
  const isTimesheetAdmin = tsRole === 'admin';

  // Payroll settings (existing)
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // App settings (new Odoo-inspired)
  const [appSettings, setAppSettings] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [appSaving, setAppSaving] = useState(false);

  // Leave policy settings
  const [leavePolicy, setLeavePolicy] = useState(null);
  const [leaveSaving, setLeaveSaving] = useState(false);

  useEffect(() => {
    if (!isTimesheetAdmin) { setLoading(false); setAppLoading(false); return; }
    Promise.all([
      timesheetApi.get('/payroll-settings').then(r => setSettings(r.data)).catch(() => {}),
      getTimesheetAppSettings().then(setAppSettings).catch(() => {}),
      getLeavePolicy().then(data => setLeavePolicy(data.policy || data)).catch(() => {}),
    ]).finally(() => { setLoading(false); setAppLoading(false); });
  }, [isTimesheetAdmin]);

  const handleSavePayroll = async () => {
    setSaving(true);
    try {
      await timesheetApi.put('/payroll-settings', {
        salaryDisbursementDay: settings.salaryDisbursementDay,
        salaryDisbursementMode: settings.salaryDisbursementMode,
        customDisbursementDates: settings.customDisbursementDates,
        payslipVisibilityDay: settings.payslipVisibilityDay,
        disbursementRules: settings.disbursementRules,
      });
    } catch {} finally { setSaving(false); }
  };

  const DISBURSEMENT_RULE_OPTIONS = [
    { value: 'last-working-day', label: 'Last working day of salary month' },
    { value: 'next-month-15', label: 'On/before 15th of next month' },
    { value: '30-day-cycle', label: '30-day cycle from joining date' },
    { value: 'fixed-date', label: 'Fixed day of next month' },
  ];

  const EMPLOYEE_TYPE_LABELS = {
    confirmed: 'Confirmed',
    internal_consultant: 'Internal Consultant',
    external_consultant: 'External Consultant',
    intern: 'Intern',
  };

  const DEFAULT_DISBURSEMENT_RULES = {
    confirmed: { type: 'last-working-day' },
    internal_consultant: { type: 'last-working-day' },
    external_consultant: { type: 'next-month-15' },
    intern: { type: '30-day-cycle' },
  };

  const updateDisbursementRule = (empType, ruleType) => {
    setSettings(prev => ({
      ...prev,
      disbursementRules: {
        ...(prev.disbursementRules || DEFAULT_DISBURSEMENT_RULES),
        [empType]: { type: ruleType },
      },
    }));
  };

  const handleSaveAppSettings = async () => {
    setAppSaving(true);
    try {
      await updateTimesheetAppSettings(appSettings);
    } catch {} finally { setAppSaving(false); }
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

  const addCustomDate = () => {
    const now = new Date();
    setSettings(prev => ({
      ...prev,
      customDisbursementDates: [
        ...(prev.customDisbursementDates || []),
        { month: now.getMonth() + 1, year: now.getFullYear(), date: '', note: '' }
      ]
    }));
  };

  const removeCustomDate = (index) => {
    setSettings(prev => ({
      ...prev,
      customDisbursementDates: prev.customDisbursementDates.filter((_, i) => i !== index)
    }));
  };

  const updateCustomDate = (index, field, value) => {
    setSettings(prev => ({
      ...prev,
      customDisbursementDates: prev.customDisbursementDates.map((d, i) =>
        i === index ? { ...d, [field]: field === 'month' || field === 'year' ? Number(value) : value } : d
      )
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

  // Client-side disbursement date calculation (mirrors backend logic)
  const moveToWorkdayClient = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() - 2); // Sunday → Friday
    if (day === 6) d.setDate(d.getDate() - 1); // Saturday → Friday
    return d;
  };

  const lastWorkingDayClient = (month, year) => {
    const lastDay = new Date(year, month, 0); // last day of month
    return moveToWorkdayClient(lastDay);
  };

  const lastWorkingDayOnOrBefore15Client = (month, year) => {
    return moveToWorkdayClient(new Date(year, month - 1, 15));
  };

  const calcDisbDateForRule = (ruleType, salaryMonth, salaryYear) => {
    const custom = settings?.customDisbursementDates?.find(d => d.month === salaryMonth && d.year === salaryYear);
    if (custom?.date) {
      return { date: moveToWorkdayClient(new Date(custom.date)), isCustom: true, note: custom.note };
    }
    let disbDate;
    switch (ruleType) {
      case 'last-working-day':
        disbDate = lastWorkingDayClient(salaryMonth, salaryYear);
        break;
      case 'next-month-15': {
        let nm = salaryMonth + 1, ny = salaryYear;
        if (nm > 12) { nm = 1; ny++; }
        disbDate = lastWorkingDayOnOrBefore15Client(nm, ny);
        break;
      }
      case '30-day-cycle': {
        // For preview, approximate as ~1st of next month (actual depends on joining date)
        let nm = salaryMonth + 1, ny = salaryYear;
        if (nm > 12) { nm = 1; ny++; }
        disbDate = moveToWorkdayClient(new Date(ny, nm - 1, 1));
        break;
      }
      case 'fixed-date': {
        const day = settings?.salaryDisbursementDay || 7;
        let nm = salaryMonth + 1, ny = salaryYear;
        if (nm > 12) { nm = 1; ny++; }
        const maxDay = new Date(ny, nm, 0).getDate();
        disbDate = moveToWorkdayClient(new Date(ny, nm - 1, Math.min(day, maxDay)));
        break;
      }
      default:
        disbDate = lastWorkingDayClient(salaryMonth, salaryYear);
    }
    return { date: disbDate, isCustom: false, note: null };
  };

  // Generate 6-month preview for selected employee type
  const [previewEmpType, setPreviewEmpType] = useState('confirmed');
  const now = new Date();
  const previewMonths = [];
  const rules = settings?.disbursementRules || DEFAULT_DISBURSEMENT_RULES;
  const activeRule = rules[previewEmpType]?.type || 'last-working-day';
  for (let i = 0; i < 6; i++) {
    let salaryMonth = now.getMonth() + 1 + i;
    let salaryYear = now.getFullYear();
    while (salaryMonth > 12) { salaryMonth -= 12; salaryYear++; }
    const result = calcDisbDateForRule(activeRule, salaryMonth, salaryYear);
    previewMonths.push({
      label: `${monthNames[salaryMonth]} ${salaryYear}`,
      disbDate: result.date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      isCustom: result.isCustom,
      note: result.note,
    });
  }

  const updateApp = (key, value) => setAppSettings(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-8">
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* PAYROLL SETTINGS (existing)                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Payroll</h2>
        <p className="text-sm text-dark-400 mb-4">Salary disbursement schedule and custom dates</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-4">Default Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Salary Disbursement Day</label>
                  <p className="text-xs text-dark-500 mb-2">Day of the next month when salary is paid</p>
                  <input type="number" min="1" max="28"
                    value={settings?.salaryDisbursementDay || 7}
                    onChange={e => setSettings({...settings, salaryDisbursementDay: Number(e.target.value)})}
                    className="input-field w-24" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Payslip Visibility Day</label>
                  <p className="text-xs text-dark-500 mb-2">Day of month when contractors can see current month earnings</p>
                  <input type="number" min="1" max="28"
                    value={settings?.payslipVisibilityDay || 1}
                    onChange={e => setSettings({...settings, payslipVisibilityDay: Number(e.target.value)})}
                    className="input-field w-24" />
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-white mb-4">Disbursement Rules by Employee Type</h3>
              <div className="space-y-3">
                {Object.entries(EMPLOYEE_TYPE_LABELS).map(([empType, label]) => {
                  const currentRule = (settings?.disbursementRules || DEFAULT_DISBURSEMENT_RULES)[empType]?.type || 'last-working-day';
                  return (
                    <div key={empType} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-dark-300 min-w-[140px]">{label}</span>
                      <select
                        value={currentRule}
                        onChange={e => updateDisbursementRule(empType, e.target.value)}
                        className="input-field text-sm flex-1"
                      >
                        {DISBURSEMENT_RULE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Custom Disbursement Dates</h3>
                <button onClick={addCustomDate} className="text-rivvra-400 text-sm font-medium hover:text-rivvra-300 flex items-center gap-1 transition-colors">
                  <Plus size={14} /> Add
                </button>
              </div>
              {settings?.customDisbursementDates?.length > 0 ? (
                <div className="space-y-3">
                  {settings.customDisbursementDates.map((d, i) => (
                    <div key={i} className="border border-dark-700 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <select value={d.month} onChange={e => updateCustomDate(i, 'month', e.target.value)} className="input-field w-auto text-sm">
                          {monthNames.slice(1).map((mn, idx) => <option key={idx + 1} value={idx + 1}>{mn}</option>)}
                        </select>
                        <input type="number" value={d.year} onChange={e => updateCustomDate(i, 'year', e.target.value)} className="input-field w-20 text-sm" />
                        <button onClick={() => removeCustomDate(i)} className="ml-auto text-red-400 hover:text-red-300 transition-colors"><X size={16} /></button>
                      </div>
                      <input type="date" value={d.date ? new Date(d.date).toISOString().split('T')[0] : ''} onChange={e => updateCustomDate(i, 'date', e.target.value)} className="input-field w-full text-sm" />
                      <input type="text" placeholder="Note (e.g., Preponed due to Diwali)" value={d.note || ''} onChange={e => updateCustomDate(i, 'note', e.target.value)} className="input-field w-full text-sm" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-dark-500">No custom dates. Using default day for all months.</p>
              )}
            </div>

            <button onClick={handleSavePayroll} disabled={saving}
              className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
              <Save size={16} /> {saving ? 'Saving...' : 'Save Payroll Settings'}
            </button>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-rivvra-400" />
              <h3 className="font-semibold text-white">Upcoming Disbursement Dates</h3>
            </div>
            <div className="flex gap-1 mb-4 flex-wrap">
              {Object.entries(EMPLOYEE_TYPE_LABELS).map(([empType, label]) => (
                <button
                  key={empType}
                  onClick={() => setPreviewEmpType(empType)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    previewEmpType === empType
                      ? 'bg-rivvra-500/20 text-rivvra-400 border border-rivvra-500/30'
                      : 'bg-dark-800 text-dark-400 border border-dark-700 hover:text-dark-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-dark-500 mb-3">
              Rule: {DISBURSEMENT_RULE_OPTIONS.find(o => o.value === activeRule)?.label || activeRule}
              {activeRule === '30-day-cycle' && <span className="text-amber-400 ml-1">(dates vary by joining date)</span>}
            </p>
            <div className="space-y-1">
              {previewMonths.map((pm, i) => (
                <div key={i} className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
                  pm.isCustom ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-dark-800/50'
                }`}>
                  <div>
                    <span className="text-sm font-medium text-white">{pm.label}</span>
                    {pm.note && <span className="text-xs text-amber-400 ml-2">({pm.note})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-dark-300">{pm.disbDate}</span>
                    {pm.isCustom && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-medium">Custom</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                      <p className="text-sm font-medium text-dark-300">Timesheet Reminder Emails</p>
                      <p className="text-xs text-dark-500">Send email reminder to fill incomplete timesheets</p>
                    </div>
                    <ToggleSwitch
                      checked={appSettings.timesheetReminders ?? false}
                      onChange={v => updateApp('timesheetReminders', v)}
                    />
                  </div>
                  {appSettings.timesheetReminders && (
                    <div className="pl-4 border-l-2 border-dark-700">
                      <label className="block text-sm font-medium text-dark-300 mb-1">Reminder Day</label>
                      <p className="text-xs text-dark-500 mb-2">Day of month to send the reminder</p>
                      <input type="number" min="1" max="28"
                        value={appSettings.reminderDay ?? 25}
                        onChange={e => updateApp('reminderDay', Number(e.target.value))}
                        className="input-field w-24" />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-300">Auto-Submit on Month End</p>
                      <p className="text-xs text-dark-500">Automatically submit draft timesheets at end of month</p>
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
                      <p className="text-xs text-dark-500">Timesheets must be approved by manager or admin</p>
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
                        <p className="text-xs text-dark-500">Manager timesheets are automatically approved</p>
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
