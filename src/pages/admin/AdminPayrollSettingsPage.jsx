import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, ChevronDown, ChevronRight, Save, RefreshCw, Copy,
  Calculator, Shield, MapPin, Briefcase, FileText, AlertCircle,
  CheckCircle, Plus, Trash2, Play, ClipboardCheck
} from 'lucide-react';
import {
  getFYConfigs, getFYConfig, updateFYConfig, copyFYConfig, seedFYConfig,
  getPlatformSetting, updatePlatformSetting,
  getPlatformPTMaster, updatePlatformPTState, seedPlatformPTMaster, copyPlatformPTMaster,
  runPlatformMigration, verifyPlatformMigration,
} from '../../utils/payrollApi';

// ── Collapsible Section Component ──────────────────────────────────────────
function Section({ title, icon: Icon, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-dark-800/30 transition-colors"
      >
        <Icon className="w-5 h-5 text-amber-400" />
        <span className="text-base font-semibold text-white flex-1 text-left">{title}</span>
        {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{badge}</span>}
        {open ? <ChevronDown className="w-4 h-4 text-dark-400" /> : <ChevronRight className="w-4 h-4 text-dark-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-dark-800/50">{children}</div>}
    </div>
  );
}

// ── Slab Editor Component ──────────────────────────────────────────────────
function SlabEditor({ slabs, onChange, rateMode = false }) {
  const addSlab = () => {
    const lastMax = slabs.length > 0 ? (slabs[slabs.length - 1].max || 0) : 0;
    onChange([...slabs, { min: lastMax + 1, max: null, [rateMode ? 'rate' : 'tax']: 0 }]);
  };

  const removeSlab = (idx) => {
    onChange(slabs.filter((_, i) => i !== idx));
  };

  const updateSlab = (idx, field, value) => {
    const updated = [...slabs];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2 text-xs font-medium text-dark-400 px-1">
        <span>Min</span><span>Max</span><span>{rateMode ? 'Rate' : 'Tax'}</span><span></span>
      </div>
      {slabs.map((slab, idx) => (
        <div key={idx} className="grid grid-cols-4 gap-2">
          <input type="number" value={slab.min} onChange={e => updateSlab(idx, 'min', Number(e.target.value))}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
          <input type="number" value={slab.max ?? ''} onChange={e => updateSlab(idx, 'max', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="No limit" className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-dark-500" />
          <input type="number" step={rateMode ? '0.01' : '1'} value={slab[rateMode ? 'rate' : 'tax']}
            onChange={e => updateSlab(idx, rateMode ? 'rate' : 'tax', Number(e.target.value))}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
          <button onClick={() => removeSlab(idx)} className="text-red-400 hover:text-red-300 p-1">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button onClick={addSlab} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 mt-2">
        <Plus className="w-3.5 h-3.5" /> Add Slab
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminPayrollSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // FY Config
  const [fyList, setFyList] = useState([]);
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const [fyConfig, setFyConfig] = useState(null);
  const [copyTargetFy, setCopyTargetFy] = useState('');

  // PT Master
  const [ptStates, setPtStates] = useState([]);
  const [selectedPtState, setSelectedPtState] = useState('');
  const [ptConfig, setPtConfig] = useState(null);

  // Default Salary Structure
  const [salaryStructure, setSalaryStructure] = useState(null);

  // Payroll Modes
  const [payrollModes, setPayrollModes] = useState(null);

  // Tax Sections
  const [taxSections, setTaxSections] = useState(null);

  // Migration
  const [migrationResult, setMigrationResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedFy) loadFyConfig(selectedFy);
  }, [selectedFy]);

  useEffect(() => {
    if (selectedPtState && selectedFy) loadPtState(selectedFy, selectedPtState);
  }, [selectedPtState]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fyRes, ptRes, salaryRes, modesRes, taxRes] = await Promise.all([
        getFYConfigs().catch(() => ({ configs: [] })),
        getPlatformPTMaster('2025-26').catch(() => ({ states: [] })),
        getPlatformSetting('default_salary_structure').catch(() => null),
        getPlatformSetting('payroll_modes').catch(() => null),
        getPlatformSetting('tax_declaration_sections').catch(() => null),
      ]);

      setFyList(fyRes.configs || []);
      setPtStates(ptRes.states || []);
      if (salaryRes?.setting) setSalaryStructure(salaryRes.setting);
      if (modesRes?.setting) setPayrollModes(modesRes.setting);
      if (taxRes?.setting) setTaxSections(taxRes.setting);

      if (fyRes.configs?.length > 0) {
        const latestFy = fyRes.configs[0].financialYear;
        setSelectedFy(latestFy);
        loadFyConfig(latestFy);
      } else {
        loadFyConfig('2025-26');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFyConfig = async (fy) => {
    try {
      const res = await getFYConfig(fy);
      setFyConfig(res.config);
    } catch {
      setFyConfig(null);
    }
  };

  const loadPtState = async (fy, stateCode) => {
    try {
      const state = ptStates.find(s => s.stateCode === stateCode);
      setPtConfig(state || null);
    } catch {
      setPtConfig(null);
    }
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const saveFyConfig = async () => {
    if (!fyConfig) return;
    try {
      setSaving(true);
      setError('');
      const { _id, financialYear, createdAt, updatedAt, updatedBy, copiedFrom, ...data } = fyConfig;
      await updateFYConfig(selectedFy, data);
      showSuccess('FY config saved successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedFy = async () => {
    try {
      setSaving(true);
      await seedFYConfig();
      await loadData();
      showSuccess('FY 2025-26 config seeded');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFy = async () => {
    if (!copyTargetFy) return;
    try {
      setSaving(true);
      await copyFYConfig(copyTargetFy, selectedFy);
      await loadData();
      showSuccess(`Copied ${selectedFy} to ${copyTargetFy}`);
      setCopyTargetFy('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePtState = async () => {
    if (!ptConfig || !selectedPtState) return;
    try {
      setSaving(true);
      const { _id, createdAt, updatedAt, updatedBy, ...data } = ptConfig;
      await updatePlatformPTState(selectedFy, selectedPtState, data);
      const ptRes = await getPlatformPTMaster(selectedFy);
      setPtStates(ptRes.states || []);
      showSuccess(`PT config for ${selectedPtState} saved`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedPt = async () => {
    try {
      setSaving(true);
      await seedPlatformPTMaster(selectedFy);
      const ptRes = await getPlatformPTMaster(selectedFy);
      setPtStates(ptRes.states || []);
      showSuccess('PT master seeded from defaults');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveSalaryStructure = async () => {
    if (!salaryStructure) return;
    try {
      setSaving(true);
      await updatePlatformSetting('default_salary_structure', salaryStructure);
      showSuccess('Default salary structure saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMigrate = async () => {
    try {
      setSaving(true);
      const res = await runPlatformMigration();
      setMigrationResult(res.results);
      await loadData();
      showSuccess('Migration completed');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    try {
      setSaving(true);
      const res = await verifyPlatformMigration();
      setVerifyResult(res);
      showSuccess(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Payroll Configuration</h1>
        <p className="text-dark-400 mt-1">Platform-wide statutory settings for payroll processing</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-200">x</button>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      <div className="space-y-4">
        {/* ── FY Statutory Config ─────────────────────────────────────────── */}
        <Section title="FY Statutory Config" icon={Calculator} defaultOpen={true} badge={`FY ${selectedFy}`}>
          <div className="mt-4 space-y-6">
            {/* FY Selector */}
            <div className="flex items-center gap-4">
              <select
                value={selectedFy}
                onChange={e => setSelectedFy(e.target.value)}
                className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                {fyList.length === 0 && <option value="2025-26">2025-26 (not seeded)</option>}
                {fyList.map(c => (
                  <option key={c.financialYear} value={c.financialYear}>{c.financialYear}</option>
                ))}
              </select>

              <button onClick={handleSeedFy} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" /> Seed 2025-26
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <input
                  placeholder="Target FY (e.g., 2026-27)"
                  value={copyTargetFy}
                  onChange={e => setCopyTargetFy(e.target.value)}
                  className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-xs text-white w-44 placeholder:text-dark-500"
                />
                <button onClick={handleCopyFy} disabled={saving || !copyTargetFy}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 disabled:opacity-50">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
            </div>

            {fyConfig ? (
              <>
                {/* PF Rates */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Provident Fund (PF)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: 'pfEmployeeRate', label: 'Employee PF Rate' },
                      { key: 'pfEmployerEpfRate', label: 'Employer EPF Rate' },
                      { key: 'pfEmployerEpsRate', label: 'Employer EPS Rate' },
                      { key: 'pfEpsWageCeiling', label: 'EPS Wage Ceiling' },
                      { key: 'pfEdliRate', label: 'EDLI Rate' },
                      { key: 'pfEdliCeiling', label: 'EDLI Ceiling' },
                      { key: 'pfAdminRate', label: 'PF Admin Rate' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-dark-400 block mb-1">{f.label}</label>
                        <input type="number" step="0.0001" value={fyConfig[f.key] ?? ''}
                          onChange={e => setFyConfig({ ...fyConfig, [f.key]: Number(e.target.value) })}
                          className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* ESI Rates */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Employee State Insurance (ESI)</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'esiEmployeeRate', label: 'Employee Rate' },
                      { key: 'esiEmployerRate', label: 'Employer Rate' },
                      { key: 'esiWageCeiling', label: 'Wage Ceiling' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-dark-400 block mb-1">{f.label}</label>
                        <input type="number" step="0.0001" value={fyConfig[f.key] ?? ''}
                          onChange={e => setFyConfig({ ...fyConfig, [f.key]: Number(e.target.value) })}
                          className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cess */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Cess & Surcharge</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Cess Rate</label>
                      <input type="number" step="0.01" value={fyConfig.cessRate ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, cessRate: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                  </div>
                  <label className="text-xs text-dark-400 block mb-2">Surcharge Slabs</label>
                  <SlabEditor slabs={fyConfig.surchargeSlabs || []} rateMode
                    onChange={surchargeSlabs => setFyConfig({ ...fyConfig, surchargeSlabs })} />
                </div>

                {/* New Regime */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">New Tax Regime</h4>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Standard Deduction</label>
                      <input type="number" value={fyConfig.newRegimeStdDeduction ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, newRegimeStdDeduction: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Rebate Limit</label>
                      <input type="number" value={fyConfig.newRegimeRebateLimit ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, newRegimeRebateLimit: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Rebate Max</label>
                      <input type="number" value={fyConfig.newRegimeRebateMax ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, newRegimeRebateMax: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                  </div>
                  <label className="text-xs text-dark-400 block mb-2">Tax Slabs (New Regime)</label>
                  <SlabEditor slabs={fyConfig.newRegimeSlabs || []} rateMode
                    onChange={newRegimeSlabs => setFyConfig({ ...fyConfig, newRegimeSlabs })} />
                </div>

                {/* Old Regime */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Old Tax Regime</h4>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Standard Deduction</label>
                      <input type="number" value={fyConfig.oldRegimeStdDeduction ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, oldRegimeStdDeduction: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Rebate Limit</label>
                      <input type="number" value={fyConfig.oldRegimeRebateLimit ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, oldRegimeRebateLimit: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-dark-400 block mb-1">Rebate Max</label>
                      <input type="number" value={fyConfig.oldRegimeRebateMax ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, oldRegimeRebateMax: Number(e.target.value) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                  </div>
                  <label className="text-xs text-dark-400 block mb-2">Tax Slabs (Old Regime)</label>
                  <SlabEditor slabs={fyConfig.oldRegimeSlabs || []} rateMode
                    onChange={oldRegimeSlabs => setFyConfig({ ...fyConfig, oldRegimeSlabs })} />
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={saveFyConfig} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-dark-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save FY Config
                  </button>
                </div>
              </>
            ) : (
              <p className="text-dark-400 text-sm py-4">No config found for FY {selectedFy}. Click "Seed 2025-26" to create defaults.</p>
            )}
          </div>
        </Section>

        {/* ── PT Master ──────────────────────────────────────────────────── */}
        <Section title="Professional Tax (PT) Master" icon={MapPin} badge={`${ptStates.length} states`}>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <select
                value={selectedPtState}
                onChange={e => { setSelectedPtState(e.target.value); const s = ptStates.find(st => st.stateCode === e.target.value); setPtConfig(s || null); }}
                className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Select State</option>
                {ptStates.map(s => (
                  <option key={s.stateCode} value={s.stateCode}>{s.stateName} ({s.stateCode})</option>
                ))}
              </select>

              <button onClick={handleSeedPt} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" /> Seed All States
              </button>
            </div>

            {ptConfig && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-dark-400 block mb-1">Annual Cap</label>
                    <input type="number" value={ptConfig.annualCap ?? 2500}
                      onChange={e => setPtConfig({ ...ptConfig, annualCap: Number(e.target.value) })}
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                      <input type="checkbox" checked={ptConfig.februaryAdjustment || false}
                        onChange={e => setPtConfig({ ...ptConfig, februaryAdjustment: e.target.checked })}
                        className="rounded bg-dark-800 border-dark-700 text-amber-500" />
                      February Adjustment
                    </label>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                      <input type="checkbox" checked={ptConfig.isActive ?? true}
                        onChange={e => setPtConfig({ ...ptConfig, isActive: e.target.checked })}
                        className="rounded bg-dark-800 border-dark-700 text-amber-500" />
                      Active
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-dark-400 block mb-2">Monthly Slabs</label>
                  <SlabEditor slabs={ptConfig.slabs || []}
                    onChange={slabs => setPtConfig({ ...ptConfig, slabs })} />
                </div>

                <div className="flex justify-end">
                  <button onClick={savePtState} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-dark-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save PT Config
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── Default Salary Structure ───────────────────────────────────── */}
        <Section title="Default Salary Structure" icon={Briefcase} badge="New orgs">
          <div className="mt-4 space-y-4">
            <p className="text-xs text-dark-400">Auto-created for new workspaces when Payroll app is enabled.</p>
            {salaryStructure?.components ? (
              <>
                <div className="space-y-2">
                  {salaryStructure.components.map((comp, idx) => (
                    <div key={idx} className="grid grid-cols-5 gap-3 items-center">
                      <input value={comp.name} onChange={e => {
                        const updated = [...salaryStructure.components];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setSalaryStructure({ ...salaryStructure, components: updated });
                      }} className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                      <div className="flex items-center gap-1">
                        <input type="number" value={comp.percentOfGross} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], percentOfGross: Number(e.target.value) };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} className="w-20 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                        <span className="text-xs text-dark-400">%</span>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-dark-300 cursor-pointer">
                        <input type="checkbox" checked={comp.isTaxable} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], isTaxable: e.target.checked };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} className="rounded bg-dark-800 border-dark-700 text-amber-500" />
                        Taxable
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-dark-300 cursor-pointer">
                        <input type="checkbox" checked={comp.isPfApplicable} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], isPfApplicable: e.target.checked };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} className="rounded bg-dark-800 border-dark-700 text-amber-500" />
                        PF Applicable
                      </label>
                      <button onClick={() => {
                        setSalaryStructure({ ...salaryStructure, components: salaryStructure.components.filter((_, i) => i !== idx) });
                      }} className="text-red-400 hover:text-red-300 p-1 justify-self-end">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => {
                    setSalaryStructure({ ...salaryStructure, components: [...salaryStructure.components, { name: '', percentOfGross: 0, isTaxable: true, isPfApplicable: false }] });
                  }} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300">
                    <Plus className="w-3.5 h-3.5" /> Add Component
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-dark-400">
                    Total: {salaryStructure.components.reduce((s, c) => s + (c.percentOfGross || 0), 0)}%
                    {salaryStructure.components.reduce((s, c) => s + (c.percentOfGross || 0), 0) !== 100 && (
                      <span className="text-red-400 ml-2">(must equal 100%)</span>
                    )}
                  </span>
                  <button onClick={saveSalaryStructure} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-dark-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Structure
                  </button>
                </div>
              </>
            ) : (
              <p className="text-dark-400 text-sm">Not configured. Run migration to seed defaults.</p>
            )}
          </div>
        </Section>

        {/* ── Payroll Modes ──────────────────────────────────────────────── */}
        <Section title="Payroll Modes" icon={Shield} badge={payrollModes?.modes?.length ? `${payrollModes.modes.length} modes` : '0'}>
          <div className="mt-4">
            {payrollModes?.modes ? (
              <div className="space-y-2">
                {payrollModes.modes.map(mode => (
                  <div key={mode.key} className="flex items-center gap-4 px-4 py-3 bg-dark-800/50 rounded-lg border border-dark-700/50">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{mode.label}</p>
                      <p className="text-xs text-dark-400">{mode.description}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-dark-700 text-dark-300 font-mono">{mode.key}</span>
                    {mode.isSystem && <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">System</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-400 text-sm">Not configured. Run migration to seed defaults.</p>
            )}
          </div>
        </Section>

        {/* ── Migration & Verification ───────────────────────────────────── */}
        <Section title="Migration & Verification" icon={FileText}>
          <div className="mt-4 space-y-4">
            <p className="text-xs text-dark-400">
              Seeds all platform settings from hardcoded values. Safe to run multiple times (idempotent).
            </p>

            <div className="flex items-center gap-4">
              <button onClick={handleMigrate} disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Migration
              </button>

              <button onClick={handleVerify} disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                Verify Migration
              </button>
            </div>

            {migrationResult && (
              <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
                <h4 className="text-sm font-medium text-white mb-2">Migration Results</h4>
                <div className="space-y-1">
                  {Object.entries(migrationResult).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="text-dark-400 w-40">{key}:</span>
                      <span className="text-white font-mono">{typeof val === 'object' ? JSON.stringify(val) : val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verifyResult && (
              <div className={`rounded-lg p-4 border ${verifyResult.mismatched === 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                <h4 className="text-sm font-medium text-white mb-2">Verification Results</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-dark-400">Total Items:</span> <span className="text-white">{verifyResult.totalItems}</span></div>
                  <div><span className="text-dark-400">Matched:</span> <span className="text-green-400">{verifyResult.matched}</span></div>
                  <div><span className="text-dark-400">Mismatched:</span> <span className={verifyResult.mismatched > 0 ? 'text-amber-400' : 'text-green-400'}>{verifyResult.mismatched}</span></div>
                </div>
                <p className="text-xs text-dark-400 mt-2">{verifyResult.message}</p>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

export default AdminPayrollSettingsPage;
