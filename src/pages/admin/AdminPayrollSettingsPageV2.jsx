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

import { useState, useEffect, useRef } from 'react';
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
            onChange={e => updateSlab(idx, 'min', numOrBlank(e))}
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
            onChange={e => updateSlab(idx, rateMode ? 'rate' : 'tax', numOrBlank(e))}
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
// ── Platform PF wage ceiling schedule ───────────────────────────────────────
// The EPFO wage ceiling changes by notification with effect from a DATE (e.g.
// ₹15,000 → ₹25,000 w.e.f. 17-Sep-2026), so it is a dated list rather than a
// per-FY number. Every India company follows this list unless its workspace
// pins its own; payroll splits a month that straddles a revision.
const CODE_DEFAULT_PF_SCHEDULE = [
  { effectiveFrom: '2014-09-01', wageCeiling: 15000, reference: 'G.S.R. 609(E) dated 22-Aug-2014' },
  { effectiveFrom: '2026-09-17', wageCeiling: 25000, reference: 'S.O. 5109(E) dated 17-Sep-2026' },
];

function PfCeilingScheduleSection({ onError, onSuccess }) {
  const [rows, setRows] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPlatformSetting('pf_wage_ceiling_schedule')
      .then(res => {
        const items = res?.setting?.items;
        setIsSaved(!!items?.length);
        setRows((items?.length ? items : CODE_DEFAULT_PF_SCHEDULE).map(r => ({ ...r, wageCeiling: String(r.wageCeiling) })));
      })
      .catch(() => setRows(CODE_DEFAULT_PF_SCHEDULE.map(r => ({ ...r, wageCeiling: String(r.wageCeiling) }))));
  }, []);

  const update = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    for (const [i, r] of rows.entries()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom || '')) return onError(`Row ${i + 1}: effective date is required`);
      if (!(Number(r.wageCeiling) > 0)) return onError(`Row ${i + 1}: ceiling must be greater than 0`);
    }
    try {
      setSaving(true);
      await updatePlatformSetting('pf_wage_ceiling_schedule', {
        items: rows.map(r => ({ effectiveFrom: r.effectiveFrom, wageCeiling: Number(r.wageCeiling), ...(r.reference ? { reference: r.reference } : {}) })),
      });
      setIsSaved(true);
      onSuccess('PF wage ceiling schedule saved — applies to every workspace without its own');
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="PF Wage Ceiling Schedule" icon={<Shield size={18} />} badge={isSaved ? null : 'Built-in default'}>
      {!rows ? <Loader2 size={18} className="animate-spin" /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={metaStyle}>
            Effective-dated EPFO wage ceiling (caps EPF wages for capped members, the EPS pensionable wage and the EDLI wage).
            Every India company follows this list unless its workspace pins its own under Settings → Payroll → PF &amp; CTC.
            Add a row when a new notification is issued — runs split any month that straddles the date.
          </p>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={labelStyle}>Effective from</label>
                <Input type="date" value={r.effectiveFrom} onChange={e => update(i, 'effectiveFrom', e.target.value)}
                  aria-label={`Row ${i + 1} effective date`} style={{ height: 32, width: 160 }} />
              </div>
              <NumField label="Ceiling (₹ / month)" min="1" step="1" width={150} value={r.wageCeiling}
                onChange={e => update(i, 'wageCeiling', e.target.value)} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={labelStyle}>Notification / reference</label>
                <Input value={r.reference || ''} onChange={e => update(i, 'reference', e.target.value)}
                  aria-label={`Row ${i + 1} reference`} style={{ height: 32 }} />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                disabled={rows.length <= 1} aria-label={`Remove row ${i + 1}`} iconLeft={<Trash2 size={14} />} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => setRows(rs => [...rs, { effectiveFrom: '', wageCeiling: '', reference: '' }])}
              iconLeft={<Plus size={14} />}>Add revision</Button>
            <Button size="sm" onClick={save} disabled={saving}
              iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}>Save schedule</Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// A cleared number field stays BLANK in the form (and blocks the save) — it
// used to become 0 the moment it was emptied, and 0 is a valid-looking value
// for a tax slab, a rebate limit or a deduction. (2026-11-20)
const numOrBlank = (e) => (e.target.value === '' ? '' : Number(e.target.value));
/** First blank / not-a-number field in a config about to be saved, or null. */
function findBlank(value, path = '') {
  if (value === '' || (typeof value === 'number' && Number.isNaN(value))) return path || 'a field';
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const hit = findBlank(value[i], `${path} row ${i + 1}`); if (hit) return hit; }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && v !== '') continue; // names, codes, notes
      const hit = findBlank(v, path ? `${path} → ${k}` : k); if (hit) return hit;
    }
  }
  return null;
}

function AdminPayrollSettingsPageV2() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // FY Config
  const [fyList, setFyList] = useState([]);
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const [fyConfig, setFyConfig] = useState(null);
  // 'loading' | 'ready' | 'missing' (really not set up) | 'error' (could not
  // be read — NOT the same as missing, and nothing may be saved over it).
  const [fyState, setFyState] = useState('loading');
  const fySeq = useRef(0);
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

  // `quiet`: refresh after Seed / Copy / Migrate without swapping the page for
  // a spinner, which remounted every section and wiped unsaved edits.
  const loadData = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      // Only "not found" means "not set up yet". Any other failure is an
      // error the admin must see — the page used to treat every failure as
      // "not configured", show built-in defaults, and let Save overwrite the
      // real stored values with them.
      const missingOk = (fallback) => (err) => { if (err?.status === 404) return fallback; throw err; };
      const [fyRes, salaryRes, modesRes, taxRes] = await Promise.all([
        getFYConfigs(),
        getPlatformSetting('default_salary_structure').catch(missingOk(null)),
        getPlatformSetting('payroll_modes').catch(missingOk(null)),
        getPlatformSetting('tax_declaration_sections').catch(missingOk(null)),
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
      setError(`Could not load the payroll settings: ${err.message}. Nothing has been changed — reload the page before editing.`);
    } finally {
      setLoading(false);
    }
  };

  // Only the newest request may fill the form. Without this, switching year
  // quickly (or the first-load requests landing out of order) left year A's
  // numbers on screen under year B's name — and Save wrote A's slabs into B.
  const loadFyConfig = async (fy) => {
    const seq = ++fySeq.current;
    setFyState('loading');
    try {
      const res = await getFYConfig(fy);
      if (seq !== fySeq.current) return;
      setFyConfig(res.config || null);
      setFyState(res.config ? 'ready' : 'missing');
    } catch (err) {
      if (seq !== fySeq.current) return;
      setFyConfig(null);
      if (err?.status === 404) setFyState('missing');
      else { setFyState('error'); setError(`Could not load the ${fy} settings: ${err.message}`); }
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
    if (!fyConfig || saving) return;
    // The form must hold THIS year's numbers.
    if (fyState !== 'ready' || (fyConfig.financialYear && fyConfig.financialYear !== selectedFy)) {
      setError(`The form is not showing ${selectedFy} — nothing was saved. Pick the year again and wait for it to load.`);
      return;
    }
    const blank = findBlank(fyConfig);
    if (blank) { setError(`"${blank}" is empty. Fill in every number (type 0 if it really is zero) — nothing was saved.`); return; }
    const slabErr =
      validateSlabs(fyConfig.surchargeSlabs || [], 'Surcharge slabs') ||
      validateSlabs(fyConfig.newRegimeSlabs || [], 'New regime slabs') ||
      validateSlabs(fyConfig.oldRegimeSlabs || [], 'Old regime slabs');
    if (slabErr) { setError(slabErr); return; }
    try {
      setSaving(true);
      setError('');
      const { _id, financialYear, createdAt, updatedAt, updatedBy, copiedFrom, needsReview: _needsReview, autoRolledOver: _autoRolledOver, ...data } = fyConfig;
      await updateFYConfig(selectedFy, data);
      // Saving is the review of an auto-rolled FY (the API clears the flag).
      setFyConfig(c => (c ? { ...c, needsReview: false } : c));
      setFyList(list => list.map(c => (c.financialYear === selectedFy ? { ...c, needsReview: false } : c)));
      showSuccess('FY config saved successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const markFyReviewed = async () => {
    try {
      setSaving(true);
      setError('');
      await updateFYConfig(selectedFy, { markReviewed: true });
      setFyConfig(c => (c ? { ...c, needsReview: false } : c));
      setFyList(list => list.map(c => (c.financialYear === selectedFy ? { ...c, needsReview: false } : c)));
      showSuccess(`FY ${selectedFy} marked as reviewed`);
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
      await loadData(true);
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
      await loadData(true);
      showSuccess(`Copied ${selectedFy} to ${copyTargetFy}`);
      setCopyTargetFy('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePtState = async () => {
    if (!ptConfig || !selectedPtState || saving) return;
    if (ptConfig.financialYear && ptConfig.financialYear !== selectedFy) {
      setError(`These slabs belong to ${ptConfig.financialYear}, not ${selectedFy} — nothing was saved. Pick the state again.`);
      return;
    }
    const ptBlank = findBlank({ slabs: ptConfig.slabs, annualCap: ptConfig.annualCap });
    if (ptBlank) { setError(`"${ptBlank}" is empty. Fill in every number (type 0 if it really is zero) — nothing was saved.`); return; }
    const slabErr = validateSlabs(ptConfig.slabs || [], `PT slabs (${selectedPtState})`);
    if (slabErr) { setError(slabErr); return; }
    if ((ptConfig.annualCap ?? 0) < 0) { setError('Annual cap cannot be negative'); return; }
    try {
      setSaving(true);
      setError('');
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
    if (!salaryStructure || saving) return;
    const ssBlank = findBlank(salaryStructure);
    if (ssBlank) { setError(`"${ssBlank}" is empty. Fill in every number — nothing was saved.`); return; }
    try {
      setSaving(true);
      setError('');
      await updatePlatformSetting('default_salary_structure', salaryStructure);
      showSuccess('Default salary structure saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMigrate = async () => {
    if (!window.confirm('Run the settings migration?\n\nThis writes the platform payroll settings into the database from the built-in defaults where they are missing. It is meant to be run once.')) return;
    try {
      setSaving(true);
      const res = await runPlatformMigration();
      setMigrationResult(res.results);
      await loadData(true);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--warn-ink)' }} />
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Header */}
      <div>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          Payroll rules
        </h1>
        <p style={{ ...metaStyle, marginTop: 4, fontSize: 13 }}>
          Statutory settings used by every workspace's payroll (PF, ESI, income-tax slabs, professional tax). Rates are entered as fractions: 0.12 means 12%.
        </p>
      </div>

      {/* Status Messages */}
      {/* Sticky: every Save button on this long page reports here, so the
          message must be visible wherever the admin has scrolled to. */}
      {error && (
        <div role="alert" style={{ position: 'sticky', top: 64, zIndex: 5 }}>
          <Callout tone="danger" icon={<AlertCircle size={16} />} style={{ boxShadow: '0 6px 20px rgba(0,0,0,.18)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError('')} aria-label="Dismiss error">×</Button>
            </span>
          </Callout>
        </div>
      )}
      {success && !error && (
        <div style={{ position: 'sticky', top: 64, zIndex: 5 }}>
          <Callout tone="brand" icon={<CheckCircle size={16} />} style={{ boxShadow: '0 6px 20px rgba(0,0,0,.18)' }}>{success}</Callout>
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
                  <option key={c.financialYear} value={c.financialYear}>
                    {c.financialYear}{c.needsReview ? ' — needs review' : ''}
                  </option>
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

            {fyConfig?.needsReview && (
              <Callout tone="warn" icon={<AlertCircle size={16} />}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 240 }}>
                    FY {selectedFy} was created automatically by copying FY {fyConfig.copiedFrom}. Check the tax slabs,
                    rebates and rates against the Budget, then save — or confirm it as-is.
                  </span>
                  <Button size="sm" variant="secondary" onClick={markFyReviewed} disabled={saving} iconLeft={<ClipboardCheck size={14} />}>
                    Confirm as reviewed
                  </Button>
                </span>
              </Callout>
            )}

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
                        onChange={e => setFyConfig({ ...fyConfig, [f.key]: numOrBlank(e) })}
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
                        onChange={e => setFyConfig({ ...fyConfig, [f.key]: numOrBlank(e) })}
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
                      onChange={e => setFyConfig({ ...fyConfig, cessRate: numOrBlank(e) })}
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
                      onChange={e => setFyConfig({ ...fyConfig, newRegimeStdDeduction: numOrBlank(e) })} />
                    <NumField label="Rebate Limit" value={fyConfig.newRegimeRebateLimit ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, newRegimeRebateLimit: numOrBlank(e) })} />
                    <NumField label="Rebate Max" value={fyConfig.newRegimeRebateMax ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, newRegimeRebateMax: numOrBlank(e) })} />
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
                      onChange={e => setFyConfig({ ...fyConfig, oldRegimeStdDeduction: numOrBlank(e) })} />
                    <NumField label="Rebate Limit" value={fyConfig.oldRegimeRebateLimit ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, oldRegimeRebateLimit: numOrBlank(e) })} />
                    <NumField label="Rebate Max" value={fyConfig.oldRegimeRebateMax ?? ''}
                      onChange={e => setFyConfig({ ...fyConfig, oldRegimeRebateMax: numOrBlank(e) })} />
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
                {fyState === 'loading' && `Loading ${selectedFy}…`}
                {fyState === 'error' && `The ${selectedFy} settings could not be loaded. Nothing is shown so nothing can be overwritten — reload the page.`}
                {fyState === 'missing' && `No settings exist for ${selectedFy} yet. Use “Seed 2025-26” to create the defaults, or copy another year.`}
              </p>
            )}
          </div>
        </Section>

        {/* ── PF Wage Ceiling Schedule (platform-wide, effective-dated) ─── */}
        <PfCeilingScheduleSection onError={setError} onSuccess={showSuccess} />

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
                    onChange={e => setPtConfig({ ...ptConfig, annualCap: numOrBlank(e) })}
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
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 100px 1fr 40px', gap: 12, alignItems: 'center', minWidth: 480 }}>
                      <Input value={comp.name} aria-label={`Component ${idx + 1} name`} onChange={e => {
                        const updated = [...salaryStructure.components];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setSalaryStructure({ ...salaryStructure, components: updated });
                      }} style={{ height: 32, fontSize: 13 }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Input type="number" value={comp.percentOfGross} aria-label={`Component ${idx + 1} percent of gross`} onChange={e => {
                          const updated = [...salaryStructure.components];
                          updated[idx] = { ...updated[idx], percentOfGross: numOrBlank(e) };
                          setSalaryStructure({ ...salaryStructure, components: updated });
                        }} style={{ height: 32, fontSize: 13, width: 72 }} />
                        <span style={metaStyle}>%</span>
                      </div>
                      {/* isTaxable / isPfApplicable toggles removed 2026-10-06: the
                          engine reads neither — PF is on the component named
                          "Basic", everything is taxable. Fields stay in the data. */}
                      <span style={{ ...metaStyle, color: 'var(--fg-4)' }}>{comp.name === 'Basic' ? 'PF base' : ''}</span>
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
