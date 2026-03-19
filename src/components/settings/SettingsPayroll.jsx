/**
 * SettingsPayroll — Unified Payroll settings page
 * Consolidates TDS Config, Salary Structures, Statutory Config, PT Master, and FY Rates
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getOrgTdsConfig, updateOrgTdsConfig, getPayrollSettings, updatePayrollSettings, getSalaryStructures } from '../../utils/payrollApi';
import timesheetApi from '../../utils/timesheetApi';
import { Save, Plus, Trash2, Loader2, Star, AlertCircle, X, Calendar } from 'lucide-react';

const SalaryStructuresPage = lazy(() => import('../../pages/payroll/SalaryStructuresPage'));
const StatutoryConfigPage = lazy(() => import('../../pages/payroll/StatutoryConfigPage'));
const PTMasterPage = lazy(() => import('../../pages/payroll/PTMasterPage'));
const PayrollSettingsPage = lazy(() => import('../../pages/payroll/PayrollSettingsPage'));

const TABS = [
  { id: 'disbursement', label: 'Disbursement' },
  { id: 'tds', label: 'TDS Configuration' },
  { id: 'structures', label: 'Salary Structures' },
  { id: 'structure-mapping', label: 'Structure Mapping' },
  { id: 'statutory', label: 'Statutory Config' },
  { id: 'pt', label: 'PT Master' },
  { id: 'fy', label: 'FY Rates', superAdminOnly: true },
];

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-dark-400" size={24} />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Disbursement Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

function DisbursementTab() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewEmpType, setPreviewEmpType] = useState('confirmed');

  useEffect(() => {
    timesheetApi.get('/payroll-settings')
      .then(r => setSettings(r.data))
      .catch(() => showToast('Failed to load disbursement settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

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
      showToast('Payroll settings saved', 'success');
    } catch {
      showToast('Failed to save payroll settings', 'error');
    } finally { setSaving(false); }
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

  if (loading) return <TabLoader />;
  if (!settings) return <div className="text-dark-400 text-sm p-6">Failed to load disbursement settings.</div>;

  // Client-side disbursement date calculation (mirrors backend logic)
  const moveToWorkdayClient = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() - 2);
    if (day === 6) d.setDate(d.getDate() - 1);
    return d;
  };

  const lastWorkingDayClient = (month, year) => {
    const lastDay = new Date(year, month, 0);
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
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
            <Save size={16} /> {saving ? 'Saving...' : 'Save Disbursement Settings'}
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
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TDS Configuration Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TdsConfigTab() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [orgSlug]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await getOrgTdsConfig(orgSlug);
      setConfig(res.tdsConfig || { defaultSection: '194C', sections: [] });
    } catch {
      showToast('Failed to load TDS config', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.sections.length) return showToast('Add at least one TDS section', 'error');
    const hasDefault = config.sections.some(s => s.code === config.defaultSection);
    if (!hasDefault) return showToast('Default section must be one of the configured sections', 'error');

    setSaving(true);
    try {
      await updateOrgTdsConfig(orgSlug, config);
      showToast('TDS configuration saved', 'success');
    } catch {
      showToast('Failed to save TDS config', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateSection = (idx, field, value) => {
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], [field]: value };
    setConfig({ ...config, sections });
  };

  const addSection = () => {
    setConfig({
      ...config,
      sections: [...config.sections, { code: '', label: '', rate: 0 }],
    });
  };

  const removeSection = (idx) => {
    const sections = config.sections.filter((_, i) => i !== idx);
    setConfig({ ...config, sections });
  };

  const setDefault = (code) => {
    setConfig({ ...config, defaultSection: code });
  };

  if (loading) return <TabLoader />;

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="text-sm text-dark-300">
          <p>Configure TDS sections and rates for consultant payroll. The <strong className="text-white">default section</strong> determines the TDS rate applied to all <strong className="text-white">Internal Consultant</strong> employees during payroll processing.</p>
        </div>
      </div>

      {/* Default section display */}
      {config.defaultSection && config.sections.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">Current Default</div>
          {(() => {
            const def = config.sections.find(s => s.code === config.defaultSection);
            if (!def) return <p className="text-dark-400">Not set</p>;
            return (
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-lg">{def.code}</span>
                <span className="text-dark-300">—</span>
                <span className="text-dark-300">{def.label}</span>
                <span className="px-2.5 py-0.5 bg-rivvra-500/10 text-rivvra-400 text-sm font-semibold rounded-full">
                  {(def.rate * 100).toFixed(1)}% TDS
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Sections table */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">TDS Sections</h3>
          <button onClick={addSection} className="flex items-center gap-1.5 text-xs font-medium text-rivvra-400 hover:text-rivvra-300">
            <Plus size={14} /> Add Section
          </button>
        </div>

        {config.sections.length === 0 ? (
          <div className="p-8 text-center text-dark-400 text-sm">
            No TDS sections configured. Click "Add Section" to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Section Code</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Label</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Rate (%)</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Default</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {config.sections.map((section, idx) => (
                <tr key={idx} className="hover:bg-dark-750/30">
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      value={section.code}
                      onChange={(e) => updateSection(idx, 'code', e.target.value)}
                      placeholder="e.g. 194C"
                      className="w-24 px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      value={section.label}
                      onChange={(e) => updateSection(idx, 'label', e.target.value)}
                      placeholder="e.g. Section 194C - Contractor"
                      className="w-full px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number"
                      step="0.1"
                      value={section.rate ? (section.rate * 100).toFixed(1) : ''}
                      onChange={(e) => updateSection(idx, 'rate', parseFloat(e.target.value) / 100 || 0)}
                      placeholder="2.0"
                      className="w-20 px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white text-right focus:border-rivvra-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => setDefault(section.code)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        config.defaultSection === section.code
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-dark-500 hover:text-dark-300'
                      }`}
                      title={config.defaultSection === section.code ? 'Default section' : 'Set as default'}
                    >
                      <Star size={16} fill={config.defaultSection === section.code ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => removeSection(idx)} className="p-1.5 text-dark-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save TDS Configuration
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Structure Mapping Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAPPING_EMP_TYPES = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'intern', label: 'Intern' },
  { key: 'internal_consultant', label: 'Internal Consultant' },
];

const DEFAULT_TDS_RATES = {
  internal_consultant: 2,
  external_consultant: 2,
  intern: 0,
};

function StructureMappingTab() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [structures, setStructures] = useState([]);
  const [mapping, setMapping] = useState({});
  const [tdsRateByType, setTdsRateByType] = useState({ ...DEFAULT_TDS_RATES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [orgSlug]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, structuresRes] = await Promise.all([
        getPayrollSettings(orgSlug),
        getSalaryStructures(orgSlug),
      ]);
      setMapping(settingsRes.settings?.structureMapping || {});
      setTdsRateByType({
        ...DEFAULT_TDS_RATES,
        ...(settingsRes.settings?.tdsRateByType || {}),
      });
      setStructures(structuresRes.structures || []);
    } catch {
      showToast('Failed to load structure mapping data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePayrollSettings(orgSlug, { structureMapping: mapping, tdsRateByType });
      showToast('Structure mapping saved', 'success');
    } catch {
      showToast('Failed to save structure mapping', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TabLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="text-sm text-dark-300">
          <p>Map each employment type to a default salary structure. When an employee has a CTC but no salary record, the system will auto-create one using the mapped structure (or the org default structure as fallback). TDS% is the flat TDS rate applied during payroll processing for consultant/intern types.</p>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-700">
          <h3 className="text-sm font-semibold text-white">Employment Type → Salary Structure & TDS Rate</h3>
        </div>

        {structures.length === 0 ? (
          <div className="p-8 text-center text-dark-400 text-sm">
            No salary structures found. Create structures in the "Salary Structures" tab first.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Employment Type</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Salary Structure</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">TDS %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {MAPPING_EMP_TYPES.map(({ key, label }) => {
                const currentStructure = structures.find(s => s._id === mapping[key]);
                const defaultStructure = structures.find(s => s.isDefault);
                const showTds = key !== 'confirmed';
                return (
                  <tr key={key} className="hover:bg-dark-750/30">
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-white">{label}</span>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={mapping[key] || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, [key]: e.target.value || undefined }))}
                        className="w-full max-w-xs px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                      >
                        <option value="">
                          {defaultStructure ? `Use org default (${defaultStructure.name})` : '-- Not mapped --'}
                        </option>
                        {structures.map(s => (
                          <option key={s._id} value={s._id}>
                            {s.name}{s.isDefault ? ' (Default)' : ''}
                          </option>
                        ))}
                      </select>
                      {!mapping[key] && !defaultStructure && (
                        <p className="text-xs text-amber-400 mt-1">No default structure set. Auto-creation will be skipped.</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {showTds ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={tdsRateByType[key] ?? DEFAULT_TDS_RATES[key] ?? 0}
                            onChange={(e) => setTdsRateByType(prev => ({
                              ...prev,
                              [key]: parseFloat(e.target.value) || 0,
                            }))}
                            className="w-16 px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white text-right focus:border-rivvra-500 focus:outline-none"
                          />
                          <span className="text-sm text-dark-400">%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-dark-500">Slab-based</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* External Consultant row (not in structure mapping, but needs TDS rate) */}
              <tr className="hover:bg-dark-750/30">
                <td className="px-5 py-4">
                  <span className="text-sm font-medium text-white">External Consultant</span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-xs text-dark-500">Managed via Timesheet payroll</span>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={tdsRateByType.external_consultant ?? DEFAULT_TDS_RATES.external_consultant ?? 2}
                      onChange={(e) => setTdsRateByType(prev => ({
                        ...prev,
                        external_consultant: parseFloat(e.target.value) || 0,
                      }))}
                      className="w-16 px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white text-right focus:border-rivvra-500 focus:outline-none"
                    />
                    <span className="text-sm text-dark-400">%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {structures.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Structure Mapping
          </button>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Settings Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function SettingsPayroll() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const initialTab = searchParams.get('tab') || 'disbursement';
  const [activeTab, setActiveTab] = useState(initialTab);

  const visibleTabs = TABS.filter(t => !t.superAdminOnly || isSuperAdmin);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Payroll</h2>
      <p className="text-dark-400 text-sm mb-6">Disbursement, TDS, salary structures, statutory configuration & compliance</p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-700 mb-6 overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-rivvra-500 text-white'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'disbursement' && <DisbursementTab />}
        {activeTab === 'tds' && <TdsConfigTab />}
        {activeTab === 'structures' && <SalaryStructuresPage embedded />}
        {activeTab === 'structure-mapping' && <StructureMappingTab />}
        {activeTab === 'statutory' && <StatutoryConfigPage embedded />}
        {activeTab === 'pt' && <PTMasterPage embedded />}
        {activeTab === 'fy' && isSuperAdmin && <PayrollSettingsPage embedded />}
      </Suspense>
    </div>
  );
}
