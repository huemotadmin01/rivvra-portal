import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Save, Plus, X, Calendar } from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/payroll-settings')
      .then(r => setSettings(r.data))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/payroll-settings', {
        salaryDisbursementDay: settings.salaryDisbursementDay,
        salaryDisbursementMode: settings.salaryDisbursementMode,
        customDisbursementDates: settings.customDisbursementDates,
        payslipVisibilityDay: settings.payslipVisibilityDay
      });
      toast.success('Payroll settings updated');
    } catch (err) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
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

  if (loading) return <LoadingSpinner />;

  // Generate 12-month preview
  const previewMonths = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    let m = now.getMonth() + 1 + i;
    let y = now.getFullYear();
    while (m > 12) { m -= 12; y++; }

    // Disbursement for prev month is in this month
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Payroll Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Default Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Salary Disbursement Day
                </label>
                <p className="text-xs text-gray-400 mb-2">Day of the next month when salary is paid</p>
                <input
                  type="number" min="1" max="28"
                  value={settings?.salaryDisbursementDay || 7}
                  onChange={e => setSettings({...settings, salaryDisbursementDay: Number(e.target.value)})}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payslip Visibility Day
                </label>
                <p className="text-xs text-gray-400 mb-2">Day of month when contractors can see current month earnings</p>
                <input
                  type="number" min="1" max="28"
                  value={settings?.payslipVisibilityDay || 1}
                  onChange={e => setSettings({...settings, payslipVisibilityDay: Number(e.target.value)})}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
          </div>

          {/* Custom Dates */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Custom Disbursement Dates</h3>
              <button onClick={addCustomDate} className="text-accent text-sm font-medium hover:underline flex items-center gap-1">
                <Plus size={14} /> Add
              </button>
            </div>
            {settings?.customDisbursementDates?.length > 0 ? (
              <div className="space-y-3">
                {settings.customDisbursementDates.map((d, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <select value={d.month} onChange={e => updateCustomDate(i, 'month', e.target.value)}
                        className="px-2 py-1 border rounded text-sm bg-white">
                        {monthNames.slice(1).map((m, idx) => <option key={idx + 1} value={idx + 1}>{m}</option>)}
                      </select>
                      <input type="number" value={d.year} onChange={e => updateCustomDate(i, 'year', e.target.value)}
                        className="w-20 px-2 py-1 border rounded text-sm" />
                      <button onClick={() => removeCustomDate(i)} className="ml-auto text-red-400 hover:text-red-600"><X size={16} /></button>
                    </div>
                    <input type="date" value={d.date ? new Date(d.date).toISOString().split('T')[0] : ''} onChange={e => updateCustomDate(i, 'date', e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm" />
                    <input type="text" placeholder="Note (e.g., Preponed due to Diwali)" value={d.note || ''} onChange={e => updateCustomDate(i, 'note', e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No custom dates. Using default day for all months.</p>
            )}
          </div>

          <button onClick={handleSave} disabled={saving}
            className="bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2 disabled:opacity-50">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* 12-Month Preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-accent" />
            <h3 className="font-semibold text-gray-900">Upcoming Disbursement Dates</h3>
          </div>
          <div className="space-y-2">
            {previewMonths.map((pm, i) => (
              <div key={i} className={`flex items-center justify-between py-2 px-3 rounded-lg ${pm.isCustom ? 'bg-yellow-50' : ''}`}>
                <div>
                  <span className="text-sm font-medium text-gray-900">{pm.label}</span>
                  {pm.note && <span className="text-xs text-yellow-600 ml-2">({pm.note})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{pm.disbDate}</span>
                  {pm.isCustom && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Custom</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
