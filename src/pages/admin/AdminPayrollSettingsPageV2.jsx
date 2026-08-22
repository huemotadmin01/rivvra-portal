// ============================================================================
// AdminPayrollSettingsPageV2.jsx — platform statutory payroll config, on ds
// ============================================================================
//
// Route: /admin/settings/payroll, inside <SuperAdminRoute><AdminLayout />.
//
// This page sets the numbers the whole platform computes payroll from — PF and
// ESI rates and ceilings, cess, surcharge slabs, both tax regimes' slabs and
// deductions, per-state PT slabs, and the default salary structure new
// workspaces are seeded with. Nothing about any of that moves: every validator,
// loader and saver is spliced in byte-identically and only the chrome is new.
//
// Carried across unchanged, and each one matters:
//
//   • `validateSlabs` — min < max, no negative min, no overlap, and only the
//     LAST slab may have no upper limit. It is the one thing standing between
//     a typo and a tax table that silently skips a bracket.
//   • `SlabEditor`'s `addSlab`, which seeds the next slab at `lastMax + 1` and
//     writes `rate` or `tax` depending on `rateMode` — the two slab shapes are
//     not interchangeable.
//   • The FY-scoped PT refetch that clears the selected state AND its config
//     whenever the financial year changes. Without it a config loaded under one
//     FY could be saved under another — a cross-FY overwrite of a statutory
//     table.
//   • Both strip-before-save destructures (`_id`, `financialYear`, `createdAt`,
//     `updatedAt`, `updatedBy`, `copiedFrom`), which are why those names read as
//     "unused" to eslint. They are load-bearing: they keep server-owned metadata
//     out of the PUT body.
//   • `savePtState`'s negative-annual-cap guard, and every input's `step` —
//     `0.0001` on PF/ESI rates, `0.01` on slab rates, `1` on slab tax amounts.
//     A wrong step lets the spinner round a statutory rate.
//
// ── Two structural notes ───────────────────────────────────────────────────
// 1. `PageSwitch` CANNOT gate this route. `/admin/*` lives outside
//    `OrgProvider`, and `useOrg()` throws there — so the switch would crash
//    rather than fall back. This page ships directly, which is defensible only
//    because the whole area is behind `SuperAdminRoute`.
// 2. `AdminLayout` is a hard-dark legacy shell with no theme toggle, and
//    nothing on `/admin/*` ever writes `data-theme` — so ds tokens would
//    resolve from `:root` (dark) and happen to agree. "Happen to" is not a
//    guarantee: a client-side hop from the org app in light theme carries the
//    attribute over. The page pins `data-theme="dark"` on its own root so it
//    always matches the shell around it.
//
// Not triggered: save FY config, save PT state, save salary structure, seed FY,
// seed PT master, copy FY, run migration, verify migration.
// ============================================================================

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
import {
  Panel, Chip, Button, Input, Select, Field, Callout, Accordion,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const labelStyle = { display: 'block', font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 4 };
const h4Style = { font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 12px' };
const metaStyle = { font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 };
const monoStyle = { font: "450 11.5px/1.4 ui-monospace, SFMono-Regular, monospace" };
const grid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 });

/** Numeric field. `step` is passed through explicitly at every call site —
 *  it is part of the statutory contract, not styling.
 *
 *  `label` renders visibly; `ariaLabel` names the control without drawing it.
 *  The slab grid uses the latter — its columns are already headed Min / Max /
 *  Rate, so a visible label on every cell would repeat the header on each row
 *  and triple the height of the editor. */
// NOTE: `min` has NO default. Legacy sets min="0" on the PF/ESI, slab and
// annual-cap inputs but deliberately omits it on cess, both regimes'
// deduction/rebate fields and the salary percentages. A default here silently
// added a floor those fields never had, which is a change to what the form
// accepts on a statutory page — so every call site states it.
function NumField({ label, ariaLabel, value, onChange, step, min, placeholder, width }) {
  return (
    <div style={width ? { width } : undefined}>
      {label && <label style={labelStyle}>{label}</label>}
      <Input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel || label}
        style={{ height: 32, fontSize: 13 }}
      />
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────────────
// ds `Accordion` is controlled; legacy `Section` owned its own open state and
// each section opened independently. This keeps that behaviour by holding the
// state here rather than lifting five booleans into the page.
function Section({ title, icon, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Accordion
      icon={icon}
      open={open}
      onToggle={() => setOpen(!open)}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {title}
          {badge && <Chip tone="warn">{badge}</Chip>}
        </span>
      }
    >
      {children}
    </Accordion>
  );
}

// ── Slab validation helper ─────────────────────────────────────────────────
// Returns an error string, or null if the slabs are valid.
// Checks: min < max (when max is set) and no overlapping ranges.
function validateSlabs(slabs, label) {
  if (!Array.isArray(slabs) || slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => (a.min || 0) - (b.min || 0));
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if ((s.min || 0) < 0) return `${label}: slab min cannot be negative`;
    if (s.max !== null && s.max !== undefined && s.max <= (s.min || 0)) {
      return `${label}: slab max must be greater than min (${s.min}–${s.max})`;
    }
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      if (s.max === null || s.max === undefined) {
        return `${label}: only the last slab may have no upper limit`;
      }
      if ((next.min || 0) < s.max) {
        return `${label}: slabs overlap around ${next.min}`;
      }
    }
  }
  return null;
}

// ── Slab Editor ─────────────────────────────────────────────────────────────
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
    <div style={{ display: 'grid', gap: 8, overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: 8, minWidth: 400, padding: '0 4px' }}>
        <span style={{ ...labelStyle, marginBottom: 0 }}>Min</span>
        <span style={{ ...labelStyle, marginBottom: 0 }}>Max</span>
        <span style={{ ...labelStyle, marginBottom: 0 }}>{rateMode ? 'Rate' : 'Tax'}</span>
        <span />
      </div>
      {slabs.map((slab, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: 8, minWidth: 400, alignItems: 'center' }}>
          <NumField
            ariaLabel={`Slab ${idx + 1} min`}
            min="0"
            value={slab.min}
            onChange={e => updateSlab(idx, 'min', Number(e.target.value))}
          />
          <NumField
            ariaLabel={`Slab ${idx + 1} max`}
            min="0"
            value={slab.max ?? ''}
            placeholder="No limit"
            onChange={e => updateSlab(idx, 'max', e.target.value === '' ? null : Number(e.target.value))}
          />
          {/* step follows rateMode exactly as legacy: 0.01 for a percentage,
              1 for a rupee amount. */}
          <NumField
            ariaLabel={`Slab ${idx + 1} ${rateMode ? 'rate' : 'tax'}`}
            min="0"
            step={rateMode ? '0.01' : '1'}
            value={slab[rateMode ? 'rate' : 'tax']}
            onChange={e => updateSlab(idx, rateMode ? 'rate' : 'tax', Number(e.target.value))}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeSlab(idx)}
            aria-label={`Remove slab ${idx + 1}`}
            style={{ color: 'var(--danger)' }}
            iconLeft={<Trash2 size={16} />}
          />
        </div>
      ))}
      <div>
        <Button variant="ghost" size="sm" onClick={addSlab} iconLeft={<Plus size={14} />}>
          Add Slab
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminPayrollSettingsPageV2() {
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

  // PT master is FY-scoped: refetch whenever the selected FY changes and
  // reset the state/config selection so a config loaded for one FY can never
  // be saved under another (cross-FY overwrite).
  useEffect(() => {
    if (!selectedFy) return;
    let cancelled = false;
    setSelectedPtState('');
    setPtConfig(null);
    getPlatformPTMaster(selectedFy)
      .then(res => { if (!cancelled) setPtStates(res.states || []); })
      .catch(() => { if (!cancelled) setPtStates([]); });
    return () => { cancelled = true; };
  }, [selectedFy]);

  useEffect(() => {
    if (selectedPtState && selectedFy) loadPtState(selectedFy, selectedPtState);
  }, [selectedPtState]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fyRes, salaryRes, modesRes, taxRes] = await Promise.all([
        getFYConfigs().catch(() => ({ configs: [] })),
        getPlatformSetting('default_salary_structure').catch(() => null),
        getPlatformSetting('payroll_modes').catch(() => null),
        getPlatformSetting('tax_declaration_sections').catch(() => null),
      ]);

      setFyList(fyRes.configs || []);
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
    const slabErr =
      validateSlabs(fyConfig.surchargeSlabs || [], 'Surcharge slabs') ||
      validateSlabs(fyConfig.newRegimeSlabs || [], 'New regime slabs') ||
      validateSlabs(fyConfig.oldRegimeSlabs || [], 'Old regime slabs');
    if (slabErr) { setError(slabErr); return; }
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
    const slabErr = validateSlabs(ptConfig.slabs || [], `PT slabs (${selectedPtState})`);
    if (slabErr) { setError(slabErr); return; }
    if ((ptConfig.annualCap ?? 0) < 0) { setError('Annual cap cannot be negative'); return; }
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
      <div data-theme="dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--warn-ink)' }} />
      </div>
    );
  }

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute, so without this the page inherits
  // whatever a previous org-app visit left on <html>.
  return (
    <div data-theme="dark" style={{ maxWidth: 1024, margin: '0 auto', padding: 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          Payroll Configuration
        </h1>
        <p style={{ ...metaStyle, marginTop: 4, fontSize: 13 }}>
          Platform-wide statutory settings for payroll processing
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger" icon={<AlertCircle size={16} />}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError('')} aria-label="Dismiss error">×</Button>
            </span>
          </Callout>
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="brand" icon={<CheckCircle size={16} />}>{success}</Callout>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {/* ── FY Statutory Config ─────────────────────────────────────────── */}
        <Section title="FY Statutory Config" icon={<Calculator size={18} />} defaultOpen badge={`FY ${selectedFy}`}>
          <div style={{ display: 'grid', gap: 24 }}>
            {/* FY Selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <Select
                value={selectedFy}
                onChange={e => setSelectedFy(e.target.value)}
                aria-label="Financial year"
                style={{ width: 'auto', height: 34 }}
              >
                {fyList.length === 0 && <option value="2025-26">2025-26 (not seeded)</option>}
                {fyList.map(c => (
                  <option key={c.financialYear} value={c.financialYear}>{c.financialYear}</option>
                ))}
              </Select>

              <Button variant="secondary" size="sm" onClick={handleSeedFy} disabled={saving} iconLeft={<RefreshCw size={14} />}>
                Seed 2025-26
              </Button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <Input
                  placeholder="Target FY (e.g., 2026-27)"
                  value={copyTargetFy}
                  onChange={e => setCopyTargetFy(e.target.value)}
                  aria-label="Target financial year to copy into"
                  style={{ width: 176, height: 34, fontSize: 12 }}
                />
                <Button variant="secondary" size="sm" onClick={handleCopyFy} disabled={saving || !copyTargetFy} iconLeft={<Copy size={14} />}>
                  Copy
                </Button>
              </div>
            </div>

            {fyConfig ? (
              <>
                {/* PF Rates — step 0.0001, these are four-decimal statutory rates */}
                <div>
                  <h4 style={h4Style}>Provident Fund (PF)</h4>
                  <div style={grid(160)}>
                    {[
                      { key: 'pfEmployeeRate', label: 'Employee PF Rate' },
                      { key: 'pfEmployerEpfRate', label: 'Employer EPF Rate' },
                      { key: 'pfEmployerEpsRate', label: 'Employer EPS Rate' },
                      { key: 'pfEpsWageCeiling', label: 'EPS Wage Ceiling' },
                      { key: 'pfEdliRate', label: 'EDLI Rate' },
                      { key: 'pfEdliCeiling', label: 'EDLI Ceiling' },
                      { key: 'pfAdminRate', label: 'PF Admin Rate' },
                    ].map(f => (
                      <NumField
                        key={f.key}
                        label={f.label}
                        min="0"
                        step="0.0001"
                        value={fyConfig[f.key] ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, [f.key]: Number(e.target.value) })}
                      />
                    ))}
                  </div>
                </div>

                {/* ESI Rates — same four-decimal step */}
                <div>
                  <h4 style={h4Style}>Employee State Insurance (ESI)</h4>
                  <div style={grid(180)}>
                    {[
                      { key: 'esiEmployeeRate', label: 'Employee Rate' },
                      { key: 'esiEmployerRate', label: 'Employer Rate' },
                      { key: 'esiWageCeiling', label: 'Wage Ceiling' },
                    ].map(f => (
                      <NumField
                        key={f.key}
                        label={f.label}
                        min="0"
                        step="0.0001"
                        value={fyConfig[f.key] ?? ''}
                        onChange={e => setFyConfig({ ...fyConfig, [f.key]: Number(e.target.value) })}
                      />
                    ))}
                  </div>
                </div>

                {/* Cess */}
                <div>
                  <h4 style={h4Style}>Cess &amp; Surcharge</h4>
                  <div style={{ ...grid(180), marginBottom: 12 }}>
                    {/* No `min` in legacy on this one — kept as-is. */}
                    <NumField
                      label="Cess Rate"
                      step="0.01"
                      value={fyConfig.cessRate ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, cessRate: Number(e.target.value) })}
                    />
                  </div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>Surcharge Slabs</label>
                  <SlabEditor slabs={fyConfig.surchargeSlabs || []} rateMode
                    onChange={surchargeSlabs => setFyConfig({ ...fyConfig, surchargeSlabs })} />
                </div>

                {/* New Regime */}
                <div>
                  <h4 style={h4Style}>New Tax Regime</h4>
                  <div style={{ ...grid(180), marginBottom: 12 }}>
                    <NumField label="Standard Deduction" value={fyConfig.newRegimeStdDeduction ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, newRegimeStdDeduction: Number(e.target.value) })} />
                    <NumField label="Rebate Limit" value={fyConfig.newRegimeRebateLimit ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, newRegimeRebateLimit: Number(e.target.value) })} />
                    <NumField label="Rebate Max" value={fyConfig.newRegimeRebateMax ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, newRegimeRebateMax: Number(e.target.value) })} />
                  </div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>Tax Slabs (New Regime)</label>
                  <SlabEditor slabs={fyConfig.newRegimeSlabs || []} rateMode
                    onChange={newRegimeSlabs => setFyConfig({ ...fyConfig, newRegimeSlabs })} />
                </div>

                {/* Old Regime */}
                <div>
                  <h4 style={h4Style}>Old Tax Regime</h4>
                  <div style={{ ...grid(180), marginBottom: 12 }}>
                    <NumField label="Standard Deduction" value={fyConfig.oldRegimeStdDeduction ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, oldRegimeStdDeduction: Number(e.target.value) })} />
                    <NumField label="Rebate Limit" value={fyConfig.oldRegimeRebateLimit ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, oldRegimeRebateLimit: Number(e.target.value) })} />
                    <NumField label="Rebate Max" value={fyConfig.oldRegimeRebateMax ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, oldRegimeRebateMax: Number(e.target.value) })} />
                  </div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>Tax Slabs (Old Regime)</label>
                  <SlabEditor slabs={fyConfig.oldRegimeSlabs || []} rateMode
                    onChange={oldRegimeSlabs => setFyConfig({ ...fyConfig, oldRegimeSlabs })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                  <Button onClick={saveFyConfig} disabled={saving}
                    iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                    Save FY Config
                  </Button>
                </div>
              </>
            ) : (
              <p style={{ ...metaStyle, fontSize: 13, padding: '16px 0' }}>
                No config found for FY {selectedFy}. Click &quot;Seed 2025-26&quot; to create defaults.
              </p>
            )}
          </div>
        </Section>

        {/* ── PT Master ──────────────────────────────────────────────────── */}
        <Section title="Professional Tax (PT) Master" icon={<MapPin size={18} />} badge={`${ptStates.length} states`}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <Select
                value={selectedPtState}
                onChange={e => { setSelectedPtState(e.target.value); const s = ptStates.find(st => st.stateCode === e.target.value); setPtConfig(s || null); }}
                aria-label="Professional tax state"
                style={{ width: 'auto', height: 34 }}
              >
                <option value="">Select State</option>
                {ptStates.map(s => (
                  <option key={s.stateCode} value={s.stateCode}>{s.stateName} ({s.stateCode})</option>
                ))}
              </Select>

              <Button variant="secondary" size="sm" onClick={handleSeedPt} disabled={saving} iconLeft={<RefreshCw size={14} />}>
                Seed All States
              </Button>
            </div>

            {ptConfig && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={grid(180)}>
                  <NumField
                    label="Annual Cap"
                    min="0"
                    value={ptConfig.annualCap ?? 2500}
                    onChange={e => setPtConfig({ ...ptConfig, annualCap: Number(e.target.value) })}
                  />
                  <label style={{ display: 'flex', alignItems: 'flex-end', gap: 8, cursor: 'pointer', font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                    <input type="checkbox" checked={ptConfig.februaryAdjustment || false}
                      onChange={e => setPtConfig({ ...ptConfig, februaryAdjustment: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: 'var(--warn-ink)' }} />
                    February Adjustment
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-end', gap: 8, cursor: 'pointer', font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                    <input type="checkbox" checked={ptConfig.isActive ?? true}
                      onChange={e => setPtConfig({ ...ptConfig, isActive: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: 'var(--warn-ink)' }} />
                    Active
                  </label>
                </div>

                <div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>Monthly Slabs</label>
                  <SlabEditor slabs={ptConfig.slabs || []}
                    onChange={slabs => setPtConfig({ ...ptConfig, slabs })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button onClick={savePtState} disabled={saving}
                    iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                    Save PT Config
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── Default Salary Structure ───────────────────────────────────── */}
        <Section title="Default Salary Structure" icon={<Briefcase size={18} />} badge="New orgs">
          <div style={{ display: 'grid', gap: 16 }}>
            <p style={metaStyle}>Auto-created for new workspaces when Payroll app is enabled.</p>
            {salaryStructure?.components ? (
              <>
                <div style={{ display: 'grid', gap: 8, overflowX: 'auto' }}>
                  {salaryStructure.components.map((comp, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 100px 1fr 1fr 40px', gap: 12, alignItems: 'center', minWidth: 560 }}>
                      <Input value={comp.name} aria-label={`Component ${idx + 1} name`} onChange={e => {
                        const updated = [...salaryStructure.components];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setSalaryStructure({ ...salaryStructure, components: updated });
                      }} style={{ height: 32, fontSize: 13 }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Input type="number" value={comp.percentOfGross} aria-label={`Component ${idx + 1} percent of gross`} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], percentOfGross: Number(e.target.value) };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} style={{ height: 32, fontSize: 13, width: 72 }} />
                        <span style={metaStyle}>%</span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', ...metaStyle, color: 'var(--fg-3)' }}>
                        <input type="checkbox" checked={comp.isTaxable} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], isTaxable: e.target.checked };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} style={{ width: 15, height: 15, accentColor: 'var(--warn-ink)' }} />
                        Taxable
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', ...metaStyle, color: 'var(--fg-3)' }}>
                        <input type="checkbox" checked={comp.isPfApplicable} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], isPfApplicable: e.target.checked };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} style={{ width: 15, height: 15, accentColor: 'var(--warn-ink)' }} />
                        PF Applicable
                      </label>
                      <Button
                        variant="ghost" size="sm"
                        aria-label={`Remove component ${idx + 1}`}
                        style={{ color: 'var(--danger)', justifySelf: 'end' }}
                        iconLeft={<Trash2 size={16} />}
                        onClick={() => {
                          setSalaryStructure({ ...salaryStructure, components: salaryStructure.components.filter((_, i) => i !== idx) });
                        }}
                      />
                    </div>
                  ))}
                  <div>
                    <Button variant="ghost" size="sm" iconLeft={<Plus size={14} />} onClick={() => {
                      setSalaryStructure({ ...salaryStructure, components: [...salaryStructure.components, { name: '', percentOfGross: 0, isTaxable: true, isPfApplicable: false }] });
                    }}>
                      Add Component
                    </Button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* Total must equal 100% — the sum and the warning are the
                      legacy expressions unchanged. */}
                  <span style={metaStyle}>
                    Total: {salaryStructure.components.reduce((s, c) => s + (c.percentOfGross || 0), 0)}%
                    {salaryStructure.components.reduce((s, c) => s + (c.percentOfGross || 0), 0) !== 100 && (
                      <span style={{ color: 'var(--danger)', marginLeft: 8 }}>(must equal 100%)</span>
                    )}
                  </span>
                  <Button onClick={saveSalaryStructure} disabled={saving}
                    iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                    Save Structure
                  </Button>
                </div>
              </>
            ) : (
              <p style={{ ...metaStyle, fontSize: 13 }}>Not configured. Run migration to seed defaults.</p>
            )}
          </div>
        </Section>

        {/* ── Payroll Modes ──────────────────────────────────────────────── */}
        <Section title="Payroll Modes" icon={<Shield size={18} />} badge={payrollModes?.modes?.length ? `${payrollModes.modes.length} modes` : '0'}>
          {payrollModes?.modes ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {payrollModes.modes.map(mode => (
                <div key={mode.key} style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
                  padding: '12px 16px', borderRadius: 'var(--r-2, 12px)',
                  background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{mode.label}</p>
                    <p style={{ ...metaStyle, marginTop: 2 }}>{mode.description}</p>
                  </div>
                  <Chip tone="neutral" style={monoStyle}>{mode.key}</Chip>
                  {mode.isSystem && <Chip tone="info">System</Chip>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ ...metaStyle, fontSize: 13 }}>Not configured. Run migration to seed defaults.</p>
          )}
        </Section>

        {/* ── Migration & Verification ───────────────────────────────────── */}
        <Section title="Migration &amp; Verification" icon={<FileText size={18} />}>
          <div style={{ display: 'grid', gap: 16 }}>
            <p style={metaStyle}>
              Seeds all platform settings from hardcoded values. Safe to run multiple times (idempotent).
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <Button variant="secondary" onClick={handleMigrate} disabled={saving}
                iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}>
                Run Migration
              </Button>

              <Button variant="secondary" onClick={handleVerify} disabled={saving}
                iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}>
                Verify Migration
              </Button>
            </div>

            {migrationResult && (
              <div style={{ padding: 16, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
                <h4 style={h4Style}>Migration Results</h4>
                <div style={{ display: 'grid', gap: 4 }}>
                  {Object.entries(migrationResult).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', gap: 8, ...metaStyle }}>
                      <span style={{ width: 160, flexShrink: 0 }}>{key}:</span>
                      <span style={{ ...monoStyle, color: 'var(--fg)', wordBreak: 'break-all' }}>
                        {typeof val === 'object' ? JSON.stringify(val) : val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verifyResult && (
              <Callout tone={verifyResult.mismatched === 0 ? 'brand' : 'warn'}>
                <h4 style={{ ...h4Style, margin: '0 0 8px' }}>Verification Results</h4>
                <div style={{ ...grid(140), font: "450 13px/1.5 'Inter', system-ui, sans-serif" }}>
                  <div><span style={{ color: 'var(--fg-4)' }}>Total Items:</span> <span style={{ color: 'var(--fg)' }}>{verifyResult.totalItems}</span></div>
                  <div><span style={{ color: 'var(--fg-4)' }}>Matched:</span> <span style={{ color: 'var(--brand-ink)' }}>{verifyResult.matched}</span></div>
                  <div>
                    <span style={{ color: 'var(--fg-4)' }}>Mismatched:</span>{' '}
                    <span style={{ color: verifyResult.mismatched > 0 ? 'var(--warn-ink)' : 'var(--brand-ink)' }}>{verifyResult.mismatched}</span>
                  </div>
                </div>
                <p style={{ ...metaStyle, marginTop: 8 }}>{verifyResult.message}</p>
              </Callout>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

export default AdminPayrollSettingsPageV2;
