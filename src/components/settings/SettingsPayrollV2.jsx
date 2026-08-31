import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Save, Plus, X, Calendar, Star, Trash2, AlertCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import timesheetApi from '../../utils/timesheetApi';
import { getOrgTdsConfig, updateOrgTdsConfig, getPayrollSettings, updatePayrollSettings, getSalaryStructures } from '../../utils/payrollApi';
import { PageSwitch } from '../platform/v2/PageSwitch';
import { Panel, Chip, Button, Input, Select, Callout, EmptyState } from '../ds';

const SalaryStructuresPage = lazy(() => import('../../pages/payroll/SalaryStructuresPage'));
const SalaryStructuresPageV2 = lazy(() => import('../../pages/payroll/SalaryStructuresPageV2'));
const StatutoryConfigPage = lazy(() => import('../../pages/payroll/StatutoryConfigPage'));
const StatutoryConfigPageV2 = lazy(() => import('../../pages/payroll/StatutoryConfigPageV2'));
const PTMasterPage = lazy(() => import('../../pages/payroll/PTMasterPage'));
const PTMasterPageV2 = lazy(() => import('../../pages/payroll/PTMasterPageV2'));
const PayrollSettingsPage = lazy(() => import('../../pages/payroll/PayrollSettingsPage'));
const PayrollSettingsPageV2 = lazy(() => import('../../pages/payroll/PayrollSettingsPageV2'));

// ─────────────────────────────────────────────────────────────────────────────
// The payroll settings hub. Four of its seven tabs were migrated in earlier
// batches and already route through PageSwitch; this batch does the three that
// were still inline — Disbursement, TDS Configuration and Structure Mapping —
// plus the shell.
//
// The PageSwitch calls are kept rather than pointing straight at the V2
// children. This hub only renders when uiV2 is on, so the switch is redundant
// today — but keeping it means exactly ONE place decides which variant a tab
// gets, and the legacy hub and this one cannot drift apart.
//
// Two blocks are byte-identical because they decide money and dates:
//
//   · The whole client-side disbursement calculation — `moveToWorkdayClient`
//     (weekend roll-back), `lastWorkingDayClient`, the on-or-before-15th
//     variant, `calcDisbDateForRule` and the 6-month preview loop. It mirrors
//     the backend, so a drift here would show admins one payday and pay on
//     another.
//   · The TDS percent↔fraction round-trip. Rates are STORED as fractions
//     (0.02) and EDITED as percents (2.0):
//       read  → `String(Math.round(section.rate * 10000) / 100)`
//       write → `(parseFloat(v) / 100) || 0`
//     with a `rateDrafts` map so a half-typed "2." is not reformatted away.
//
// Not triggered: Save Disbursement Settings, Save TDS Configuration, Save
// Structure Mapping.
// ─────────────────────────────────────────────────────────────────────────────

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
    </div>
  );
}

/** Uppercase micro-heading used above a table or card body. */
function Micro({ children, style }) {
  return (
    <p style={{
      font: "500 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, ...style,
    }}>{children}</p>
  );
}

const th = { padding: '10px 18px', font: "500 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const td = { padding: '12px 18px', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif" };

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
  intern: { type: 'last-working-day' },
};

function DisbursementTab() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewEmpType, setPreviewEmpType] = useState('confirmed');

  // Refetch on company switch — settings are company-scoped; stale state
  // here would be saved under the newly-active company.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSettings(null);
    timesheetApi.get('/payroll-settings')
      .then(r => {
        if (cancelled) return;
        const data = r.data || {};
        // Ensure disbursementRules always has defaults so they get saved
        if (!data.disbursementRules) data.disbursementRules = { ...DEFAULT_DISBURSEMENT_RULES };
        setSettings(data);
      })
      .catch(() => { if (!cancelled) showToast('Failed to load disbursement settings', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompany?._id]);

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
    } catch (err) {
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
  if (!settings) return (
    <Panel><EmptyState compact title="Failed to load disbursement settings." /></Panel>
  );

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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Panel title="Disbursement Rules by Employee Type">
          <div style={{ padding: 6, display: 'grid', gap: 10 }}>
            {Object.entries(EMPLOYEE_TYPE_LABELS).map(([empType, label]) => {
              const currentRule = (settings?.disbursementRules || DEFAULT_DISBURSEMENT_RULES)[empType]?.type || 'last-working-day';
              return (
                <div key={empType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', minWidth: 140 }}>{label}</span>
                  <Select
                    value={currentRule}
                    aria-label={`Disbursement rule for ${label}`}
                    onChange={e => updateDisbursementRule(empType, e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {DISBURSEMENT_RULE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Custom Disbursement Dates"
          actions={<Button variant="ghost" size="sm" onClick={addCustomDate} iconLeft={<Plus size={14} />}>Add</Button>}
        >
          <div style={{ padding: 6 }}>
            {settings?.customDisbursementDates?.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {settings.customDisbursementDates.map((d, i) => (
                  <div key={i} style={{ borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)', padding: 10, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Select value={d.month} aria-label={`Custom date ${i + 1} month`}
                        onChange={e => updateCustomDate(i, 'month', e.target.value)} style={{ width: 'auto' }}>
                        {monthNames.slice(1).map((mn, idx) => <option key={idx + 1} value={idx + 1}>{mn}</option>)}
                      </Select>
                      <Input type="number" value={d.year} aria-label={`Custom date ${i + 1} year`}
                        onChange={e => updateCustomDate(i, 'year', e.target.value)}
                        style={{ width: 92, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                      <Button variant="ghost" size="sm" style={{ marginLeft: 'auto', color: 'var(--danger)' }}
                        aria-label={`Remove custom date ${i + 1}`}
                        onClick={() => removeCustomDate(i)} iconLeft={<X size={15} />} />
                    </div>
                    {/* d.date is a YYYY-MM-DD (or ISO) string — slice instead of
                        round-tripping through Date/toISOString, which shifts the
                        day for viewers behind UTC. */}
                    <Input type="date" aria-label={`Custom date ${i + 1}`}
                      value={d.date ? String(d.date).slice(0, 10) : ''}
                      onChange={e => updateCustomDate(i, 'date', e.target.value)} />
                    <Input type="text" placeholder="Note (e.g., Preponed due to Diwali)"
                      aria-label={`Custom date ${i + 1} note`}
                      value={d.note || ''} onChange={e => updateCustomDate(i, 'note', e.target.value)} />
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                No custom dates. Using default day for all months.
              </p>
            )}
          </div>
        </Panel>

        <div>
          <Button onClick={handleSavePayroll} disabled={saving} iconLeft={<Save size={15} />}>
            {saving ? 'Saving...' : 'Save Disbursement Settings'}
          </Button>
        </div>
      </div>

      <Panel icon={<Calendar size={16} />} title="Upcoming Disbursement Dates">
        <div style={{ padding: 6 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {Object.entries(EMPLOYEE_TYPE_LABELS).map(([empType, label]) => {
              const on = previewEmpType === empType;
              return (
                <button
                  key={empType}
                  onClick={() => setPreviewEmpType(empType)}
                  aria-pressed={on}
                  style={{
                    padding: '4px 11px', borderRadius: 99, cursor: 'pointer', border: 0,
                    font: "500 11px/1.4 'Inter', system-ui, sans-serif",
                    background: on ? 'var(--brand-soft)' : 'var(--surface-2)',
                    boxShadow: on ? '0 0 0 1px var(--brand-line)' : '0 0 0 1px var(--line)',
                    color: on ? 'var(--fg)' : 'var(--fg-4)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>
            Rule: {DISBURSEMENT_RULE_OPTIONS.find(o => o.value === activeRule)?.label || activeRule}
            {activeRule === '30-day-cycle' && <span style={{ color: 'var(--warn-ink)', marginLeft: 4 }}>(dates vary by joining date)</span>}
          </p>
          <div style={{ display: 'grid', gap: 4 }}>
            {previewMonths.map((pm, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '9px 12px', borderRadius: 'var(--r-2)',
                background: pm.isCustom ? 'var(--warn-soft)' : 'transparent',
                boxShadow: pm.isCustom ? '0 0 0 1px color-mix(in srgb, var(--warn) 26%, transparent)' : 'none',
              }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{pm.label}</span>
                  {pm.note && <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)', marginLeft: 8 }}>({pm.note})</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{pm.disbDate}</span>
                  {pm.isCustom && <Chip tone="warn">Custom</Chip>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TDS Configuration Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TdsConfigTab() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // String drafts for rate inputs so typing isn't reformatted per keystroke
  const [rateDrafts, setRateDrafts] = useState({});
  const [loadError, setLoadError] = useState(null);

  // Refetch on company switch so stale config can't be saved cross-company
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadConfig();
  }, [orgSlug, currentCompany?._id]);

  const loadConfig = async () => {
    setLoading(true);
    setConfig(null);
    setLoadError(null);
    setRateDrafts({});
    try {
      const res = await getOrgTdsConfig(orgSlug);
      setConfig(res.tdsConfig || { defaultSection: '194C', sections: [] });
    } catch (err) {
      // A null config would white-screen the whole Payroll settings tab on the
      // first `config.defaultSection` dereference — keep a safe shape AND
      // surface a retryable error instead of silently showing an empty config.
      setConfig({ defaultSection: '194C', sections: [] });
      setLoadError(err?.response?.data?.message || err?.message || 'Failed to load TDS configuration');
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
    } catch (err) {
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
    setRateDrafts({});
    setConfig({
      ...config,
      sections: [...config.sections, { code: '', label: '', rate: 0 }],
    });
  };

  const removeSection = (idx) => {
    setRateDrafts({});
    const sections = config.sections.filter((_, i) => i !== idx);
    setConfig({ ...config, sections });
  };

  const setDefault = (code) => {
    setConfig({ ...config, defaultSection: code });
  };

  if (loading) return <TabLoader />;

  if (loadError) return (
    <Panel>
      <EmptyState icon={<AlertCircle size={22} />} tone="danger" compact title={loadError}
        actions={<Button variant="secondary" size="sm" onClick={loadConfig}>Retry</Button>} />
    </Panel>
  );

  // Defensive: never dereference a null config in the render body.
  if (!config) return <TabLoader />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Info banner */}
      <Callout tone="warn" icon={<AlertCircle size={16} />}>
        Configure TDS sections and rates for consultant payroll. The <strong>default section</strong> determines
        the TDS rate applied to all <strong>Internal &amp; External Consultant</strong> employees during payroll processing.
      </Callout>

      {/* Default section display */}
      {config.defaultSection && config.sections.length > 0 && (
        <Panel>
          <div style={{ padding: 6 }}>
            <Micro style={{ marginBottom: 8 }}>Current Default</Micro>
            {(() => {
              const def = config.sections.find(s => s.code === config.defaultSection);
              if (!def) return <p style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>Not set</p>;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ font: "700 16px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{def.code}</span>
                  <span style={{ color: 'var(--fg-4)' }}>—</span>
                  <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{def.label}</span>
                  <Chip tone="brand">{(def.rate * 100).toFixed(1)}% TDS</Chip>
                </div>
              );
            })()}
          </div>
        </Panel>
      )}

      {/* Sections table */}
      <Panel
        flush
        title="TDS Sections"
        actions={<Button variant="ghost" size="sm" onClick={addSection} iconLeft={<Plus size={14} />}>Add Section</Button>}
      >
        {config.sections.length === 0 ? (
          <EmptyState compact title={'No TDS sections configured. Click "Add Section" to get started.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Section Code</th>
                  <th style={{ ...th, textAlign: 'left' }}>Label</th>
                  <th style={{ ...th, textAlign: 'right' }}>Rate (%)</th>
                  <th style={{ ...th, textAlign: 'center' }}>Default</th>
                  <th style={{ ...th, width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {config.sections.map((section, idx) => (
                  <tr key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--line-2)' }}>
                    <td style={td}>
                      <Input
                        type="text"
                        value={section.code}
                        aria-label={`Section ${idx + 1} code`}
                        onChange={(e) => updateSection(idx, 'code', e.target.value)}
                        placeholder="e.g. 194C"
                        style={{ width: 108 }}
                      />
                    </td>
                    <td style={td}>
                      <Input
                        type="text"
                        value={section.label}
                        aria-label={`Section ${idx + 1} label`}
                        onChange={(e) => updateSection(idx, 'label', e.target.value)}
                        placeholder="e.g. Section 194C - Contractor"
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        aria-label={`Section ${idx + 1} rate percent`}
                        value={rateDrafts[idx] ?? (section.rate ? String(Math.round(section.rate * 10000) / 100) : '')}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRateDrafts(prev => ({ ...prev, [idx]: v }));
                          updateSection(idx, 'rate', (parseFloat(v) / 100) || 0);
                        }}
                        onBlur={() => setRateDrafts(prev => {
                          const next = { ...prev };
                          delete next[idx];
                          return next;
                        })}
                        placeholder="2.0"
                        style={{ width: 88, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefault(section.code)}
                        title={config.defaultSection === section.code ? 'Default section' : 'Set as default'}
                        aria-label={config.defaultSection === section.code ? `${section.code} is the default section` : `Set ${section.code} as default`}
                        style={config.defaultSection === section.code ? { color: 'var(--warn-ink)', background: 'var(--warn-soft)' } : undefined}
                        iconLeft={<Star size={15} fill={config.defaultSection === section.code ? 'currentColor' : 'none'} />}
                      />
                    </td>
                    <td style={{ ...td, padding: '12px 10px' }}>
                      <Button variant="ghost" size="sm" onClick={() => removeSection(idx)}
                        aria-label={`Remove section ${idx + 1}`}
                        style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} disabled={saving}
          iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}>
          Save TDS Configuration
        </Button>
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
  { key: 'external_consultant', label: 'External Consultant' },
];

const DEFAULT_TDS_RATES = {
  internal_consultant: 2,
  external_consultant: 2,
  intern: 0,
};

// TDS percent. Runs on blur and again before save — NEVER per keystroke.
// `parseFloat('7.')` is 7, so clamping on every keystroke rewrote the field
// back to "7" and swallowed the decimal point: fractional rates like 7.5 or
// 0.1 could not be typed at all, only reached by 75 clicks of a step="0.1"
// spinner. A blank field normalises to 0, matching the previous behaviour —
// 0% is a legitimate rate here, not a missing value.
const normaliseTdsRate = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

function StructureMappingTab() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [structures, setStructures] = useState([]);
  const [mapping, setMapping] = useState({});
  const [tdsRateByType, setTdsRateByType] = useState({ ...DEFAULT_TDS_RATES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Refetch on company switch so a mapping loaded for one company can't be
  // saved under another.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadData();
  }, [orgSlug, currentCompany?._id]);

  const loadData = async () => {
    setLoading(true);
    setStructures([]);
    setMapping({});
    setTdsRateByType({ ...DEFAULT_TDS_RATES });
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
    } catch (err) {
      showToast('Failed to load structure mapping data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Rates hold the raw input string while focused; coerce every key before
      // send so a mid-edit value can never be persisted as a tax rate.
      const rates = Object.fromEntries(
        Object.entries(tdsRateByType).map(([k, v]) => [k, normaliseTdsRate(v)])
      );
      await updatePayrollSettings(orgSlug, { structureMapping: mapping, tdsRateByType: rates });
      showToast('Structure mapping saved', 'success');
    } catch (err) {
      showToast('Failed to save structure mapping', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TabLoader />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Callout tone="warn" icon={<AlertCircle size={16} />}>
        Map each employment type to a default salary structure. When an employee has a CTC but no salary record,
        the system will auto-create one using the mapped structure (or the org default structure as fallback).
        TDS% is the flat TDS rate applied during payroll processing for consultant/intern types.
      </Callout>

      <Panel flush title="Employment Type → Salary Structure & TDS Rate">
        {structures.length === 0 ? (
          <EmptyState compact title={'No salary structures found. Create structures in the "Salary Structures" tab first.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Employment Type</th>
                  <th style={{ ...th, textAlign: 'left' }}>Salary Structure</th>
                  <th style={{ ...th, textAlign: 'right' }}>TDS %</th>
                </tr>
              </thead>
              <tbody>
                {MAPPING_EMP_TYPES.map(({ key, label }, i) => {
                  const showTds = key !== 'confirmed';
                  return (
                    <tr key={key} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-2)' }}>
                      <td style={{ ...td, padding: '14px 18px' }}>
                        <span style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{label}</span>
                      </td>
                      <td style={{ ...td, padding: '14px 18px' }}>
                        <Select
                          value={mapping[key] || ''}
                          aria-label={`Salary structure for ${label}`}
                          onChange={(e) => setMapping(prev => ({ ...prev, [key]: e.target.value || undefined }))}
                          style={{ maxWidth: 320 }}
                        >
                          <option value="">-- Select Structure --</option>
                          {structures.map(s => (
                            <option key={s._id} value={s._id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                        {!mapping[key] && (
                          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)', margin: '5px 0 0' }}>
                            No structure mapped. Auto-creation will be skipped for this type.
                          </p>
                        )}
                      </td>
                      <td style={{ ...td, padding: '14px 18px', textAlign: 'right' }}>
                        {showTds ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              aria-label={`TDS percent for ${label}`}
                              value={tdsRateByType[key] ?? DEFAULT_TDS_RATES[key] ?? 0}
                              onChange={(e) => setTdsRateByType(prev => ({
                                ...prev,
                                [key]: e.target.value,
                              }))}
                              onBlur={(e) => setTdsRateByType(prev => ({
                                ...prev,
                                [key]: normaliseTdsRate(e.target.value),
                              }))}
                              style={{ width: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                            />
                            <span style={{ font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>%</span>
                          </span>
                        ) : (
                          <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Slab-based</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {structures.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handleSave} disabled={saving}
            iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}>
            Save Structure Mapping
          </Button>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Settings Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function SettingsPayrollV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  // Platform super-admin flag (matches SuperAdminRoute) — user.role is an
  // org-level role and 'super_admin' is not a value it can take.
  const isSuperAdmin = user?.superAdmin === true;

  const initialTab = searchParams.get('tab') || 'disbursement';
  const [activeTab, setActiveTab] = useState(initialTab);

  const visibleTabs = TABS.filter(t => !t.superAdminOnly || isSuperAdmin);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  return (
    <div>
      <h2 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>Payroll</h2>
      <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 20px' }}>
        Disbursement, TDS, salary structures, statutory configuration &amp; compliance
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line-2)', marginBottom: 20, overflowX: 'auto' }}>
        {visibleTabs.map(tab => {
          const on = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              aria-current={on ? 'page' : undefined}
              style={{
                padding: '9px 14px', marginBottom: -1, whiteSpace: 'nowrap', cursor: 'pointer',
                background: 'none', border: 0,
                borderBottom: `2px solid ${on ? 'var(--brand)' : 'transparent'}`,
                font: "500 12.5px/1.3 'Inter', system-ui, sans-serif",
                color: on ? 'var(--fg)' : 'var(--fg-4)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'disbursement' && <DisbursementTab />}
        {activeTab === 'tds' && <TdsConfigTab />}
        {activeTab === 'structures' && <PageSwitch v2={SalaryStructuresPageV2} legacy={SalaryStructuresPage} embedded />}
        {activeTab === 'structure-mapping' && <StructureMappingTab />}
        {activeTab === 'statutory' && <PageSwitch v2={StatutoryConfigPageV2} legacy={StatutoryConfigPage} embedded />}
        {activeTab === 'pt' && <PageSwitch v2={PTMasterPageV2} legacy={PTMasterPage} embedded />}
        {activeTab === 'fy' && isSuperAdmin && <PageSwitch v2={PayrollSettingsPageV2} legacy={PayrollSettingsPage} embedded />}
      </Suspense>
    </div>
  );
}
