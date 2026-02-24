/**
 * SettingsTimesheet — Timesheet app settings section
 * Payroll settings + Odoo-inspired configuration: time recording, reminders, approval, overtime.
 * Only visible to users with admin role on the timesheet app.
 */
import { useState, useEffect } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { Save, Plus, X, Calendar, Loader2, AlertCircle, Clock, Bell, CheckCircle2, Timer } from 'lucide-react';
import timesheetApi from '../../utils/timesheetApi';
import { getTimesheetAppSettings, updateTimesheetAppSettings } from '../../utils/timesheetApi';

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

  useEffect(() => {
    if (!isTimesheetAdmin) { setLoading(false); setAppLoading(false); return; }
    Promise.all([
      timesheetApi.get('/payroll-settings').then(r => setSettings(r.data)).catch(() => {}),
      getTimesheetAppSettings().then(setAppSettings).catch(() => {}),
    ]).finally(() => { setLoading(false); setAppLoading(false); });
  }, [isTimesheetAdmin]);

  const handleSavePayroll = async () => {
    setSaving(true);
    try {
      await timesheetApi.put('/payroll-settings', {
        salaryDisbursementDay: settings.salaryDisbursementDay,
        salaryDisbursementMode: settings.salaryDisbursementMode,
        customDisbursementDates: settings.customDisbursementDates,
        payslipVisibilityDay: settings.payslipVisibilityDay
      });
    } catch {} finally { setSaving(false); }
  };

  const handleSaveAppSettings = async () => {
    setAppSaving(true);
    try {
      await updateTimesheetAppSettings(appSettings);
    } catch {} finally { setAppSaving(false); }
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

  // Generate 12-month preview
  const previewMonths = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    let m = now.getMonth() + 1 + i;
    let y = now.getFullYear();
    while (m > 12) { m -= 12; y++; }
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) { prevM = 12; prevY--; }
    const custom = settings?.customDisbursementDates?.find(d => d.month === prevM && d.year === prevY);
    let disbDay = custom ? new Date(custom.date).getDate() : settings?.salaryDisbursementDay || 7;
    let disbDate = new Date(y, m - 1, disbDay);
    const dayOfWeek = disbDate.getDay();
    if (dayOfWeek === 0) disbDate.setDate(disbDate.getDate() - 2);
    if (dayOfWeek === 6) disbDate.setDate(disbDate.getDate() - 1);
    previewMonths.push({
      label: `${monthNames[prevM]} ${prevY}`,
      disbDate: disbDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
      isCustom: !!custom,
      note: custom?.note
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
    </div>
  );
}
