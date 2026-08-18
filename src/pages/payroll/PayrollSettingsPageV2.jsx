import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getFYConfigs, getFYConfig, updateFYConfig, copyFYConfig, seedFYConfig } from '../../utils/payrollApi';
import { Settings2, Plus, Save, Loader2, Copy, Database, Trash2, Shield } from 'lucide-react';
import {
  PageHeader, Panel, Accordion, Button, Input, Select, Modal, EmptyState,
  RecordMeta, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// FY statutory rates — income-tax slabs, cess, surcharge, PF and ESI. This is
// the source every payroll run reads its rates from, so the arithmetic gets
// treated as untouchable: `toPercentDisplay` is byte-identical, and so is every
// percent↔fraction conversion and row mutation inside SlabTable and
// ConfigField (`Number(raw) / 100`, `max === '' ? null`, `addRow`'s
// `(last.max || 0) + 1`, `removeRow`'s length guard) and DraftNumberInput's
// draft-while-focused state. Only the markup around them is restyled.
// Everything above `return (` is spliced in verbatim.
//
// Super-admin only, and dual-use: this renders both at /payroll/settings and as
// the "FY Rates" tab of /settings/payroll, so both entry points switch on the
// shared PageSwitch.
// ─────────────────────────────────────────────────────────────────────────────

const CURRENT_FY = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
})();

/**
 * Rates are stored as fractions (0.04) but edited as percents (4). Naively
 * rendering `rate * 100` surfaces float artifacts like `4.000000000000001`;
 * round to 2 decimal places for display. Mirrors SettingsPayroll's TdsConfigTab.
 */
const toPercentDisplay = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 10000) / 100);
};

/**
 * Number input that keeps a string draft while focused, so partial input
 * ("4." , "0.0", "") isn't reformatted away on every keystroke. Declared at
 * module scope — defining it inside a render body would remount it per
 * keystroke and lose focus.
 */
function DraftNumberInput({ value, onChange, step, placeholder, style, ...rest }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : (value ?? '');
  return (
    <Input
      type="number"
      step={step}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        onChange(raw);
      }}
      onBlur={() => setDraft(null)}
      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...style }}
      {...rest}
    />
  );
}

const GRID = '1fr 1fr 1fr 34px';

function SlabTable({ slabs, onChange, rateLabel = 'Tax rate (%)', minLabel = 'Annual income from (₹)', maxLabel = 'Up to (₹)', showTax = false }) {
  const addRow = () => {
    const last = slabs[slabs.length - 1];
    const newMin = last ? (last.max || 0) + 1 : 0;
    onChange([...slabs, { min: newMin, max: null, rate: 0, ...(showTax && { tax: 0 }) }]);
  };

  const removeRow = (idx) => {
    if (slabs.length <= 1) return;
    onChange(slabs.filter((_, i) => i !== idx));
  };

  const updateRow = (idx, field, value) => {
    const updated = slabs.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    onChange(updated);
  };

  return (
    <div style={{ display: 'grid', gap: 8, overflowX: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: GRID, gap: 8, minWidth: 420, padding: '0 2px',
        font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      }}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
        <span>{rateLabel}</span>
        <span />
      </div>
      {slabs.map((slab, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, minWidth: 420, alignItems: 'center' }}>
          <Input
            type="number"
            value={slab.min}
            aria-label={`${minLabel} — band ${idx + 1}`}
            onChange={(e) => updateRow(idx, 'min', Number(e.target.value))}
            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          />
          <Input
            type="number"
            value={slab.max === null ? '' : slab.max}
            placeholder="∞"
            aria-label={`${maxLabel} — band ${idx + 1}`}
            onChange={(e) => updateRow(idx, 'max', e.target.value === '' ? null : Number(e.target.value))}
            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          />
          <DraftNumberInput
            step="0.01"
            aria-label={`${rateLabel} — band ${idx + 1}`}
            value={showTax ? (slab.tax ?? 0) : toPercentDisplay(slab.rate ?? 0)}
            onChange={(raw) => {
              if (raw === '' || Number.isNaN(Number(raw))) return;
              if (showTax) updateRow(idx, 'tax', Number(raw));
              else updateRow(idx, 'rate', Number(raw) / 100);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeRow(idx)}
            title="Remove"
            aria-label={`Remove band ${idx + 1}`}
            iconLeft={<Trash2 size={14} />}
          />
        </div>
      ))}
      <div>
        <Button variant="ghost" size="sm" onClick={addRow} iconLeft={<Plus size={12} />}>Add slab</Button>
      </div>
      <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
        Leave the top band’s upper limit blank for “no limit”.
      </p>
    </div>
  );
}

/**
 * With `percent`, `value`/`onChange` speak the stored FRACTION (0.04) while the
 * field displays and accepts percent (4) — rounded for display so float
 * artifacts never reach the input.
 */
function ConfigField({ label, hint, value, onChange, type = 'number', step, suffix, percent = false }) {
  const shown = percent ? toPercentDisplay(value) : (value ?? '');
  const labelBlock = (
    <label style={{ minWidth: 220, flex: '1 1 220px', paddingTop: 6 }}>
      <span style={{ display: 'block', font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{label}</span>
      {hint && <span style={{ display: 'block', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>{hint}</span>}
    </label>
  );
  const suffixBlock = suffix && (
    <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>{suffix}</span>
  );
  if (type !== 'number') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '4px 12px' }}>
        {labelBlock}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input
            type={type}
            step={step}
            value={value ?? ''}
            aria-label={label}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 128, textAlign: 'right' }}
          />
          {suffixBlock}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '4px 12px' }}>
      {labelBlock}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <DraftNumberInput
          step={step || '1'}
          value={shown}
          aria-label={label}
          onChange={(raw) => {
            if (raw === '' || Number.isNaN(Number(raw))) return;
            onChange(percent ? Number(raw) / 100 : Number(raw));
          }}
          style={{ width: 128 }}
        />
        {suffixBlock}
      </span>
    </div>
  );
}

/** Heading for a run of fields inside an Accordion. */
function GroupLabel({ children }) {
  return (
    <h4 style={{
      font: "600 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
    }}>{children}</h4>
  );
}

export default function PayrollSettingsPageV2({ embedded = false }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [fyList, setFyList] = useState([]);
  const [selectedFy, setSelectedFy] = useState(CURRENT_FY);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');

  const isSuperAdmin = user?.superAdmin === true;

  const loadList = async () => {
    try {
      const res = await getFYConfigs();
      setFyList(res.configs || []);
    } catch (err) { /* ignore */ }
  };

  const loadConfig = async (fy) => {
    setLoading(true);
    try {
      const res = await getFYConfig(fy);
      setConfig(res.config);
    } catch (err) {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  // `isSuperAdmin` must be a dependency: the auth user often resolves AFTER
  // mount, and without it a super admin stays stuck on the "only super admins"
  // panel because the effect never re-runs once the flag flips true.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isSuperAdmin) {
      loadList();
      loadConfig(selectedFy);
    } else {
      setLoading(false);
    }
  }, [selectedFy, isSuperAdmin]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { _id, financialYear, createdAt, updatedAt, updatedBy, copiedFrom, ...data } = config;
      await updateFYConfig(selectedFy, data);
      showToast('Saved successfully', 'success');
      loadList();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedFYConfig();
      showToast('FY 2025-26 defaults seeded', 'success');
      loadList();
      loadConfig('2025-26');
      setSelectedFy('2025-26');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to seed', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const handleCopy = async () => {
    if (!copyTarget) return;
    try {
      await copyFYConfig(copyTarget, selectedFy);
      showToast(`Copied to FY ${copyTarget}`, 'success');
      setShowCopyModal(false);
      setCopyTarget('');
      loadList();
      setSelectedFy(copyTarget);
      loadConfig(copyTarget);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to copy', 'error');
    }
  };

  const update = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  if (!isSuperAdmin) {
    return (
      <div style={embedded ? {} : { maxWidth: 900, margin: '0 auto' }}>
        {!embedded && (
          <PageHeader
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Shield size={18} style={{ color: 'var(--warn-ink)' }} /> FY Statutory Configuration</span>}
          />
        )}
        <Panel>
          <EmptyState icon={<Shield size={22} />} tone="warn" title="Only super admins can manage FY statutory configurations.">
            Contact your platform administrator for changes.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const toolbar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Select
        value={selectedFy}
        title="Statutory rates are stored per financial year"
        aria-label="Financial year"
        onChange={(e) => setSelectedFy(e.target.value)}
        style={{ width: 'auto' }}
      >
        {/* Always include the selected FY as an option — otherwise a
            selectedFy that isn't in fyList (e.g. CURRENT_FY before any
            config is seeded) renders a blank select. */}
        {(() => {
          const years = fyList.map(f => f.financialYear);
          if (selectedFy && !years.includes(selectedFy)) years.unshift(selectedFy);
          if (years.length === 0) years.push(CURRENT_FY);
          return years.map(fy => (
            <option key={fy} value={fy}>FY {fy}</option>
          ));
        })()}
      </Select>

      {config && (
        <Button variant="secondary" size="sm" onClick={() => setShowCopyModal(true)} iconLeft={<Copy size={14} />}>
          Copy to new FY
        </Button>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={handleSeed}
        disabled={seeding}
        iconLeft={seeding ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
      >
        Seed 2025-26
      </Button>
    </div>
  );

  return (
    <div style={embedded ? {} : { maxWidth: 900, margin: '0 auto' }}>
      {embedded
        ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>{toolbar}</div>
        : (
          <PageHeader
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Settings2 size={18} style={{ color: 'var(--brand-ink)' }} /> Statutory Rates by Financial Year</span>}
            sub="Income-tax slabs, cess, surcharge and PF/ESI rates that every payroll run for the selected year uses"
            actions={toolbar}
          />
        )}

      {loading ? (
        <PageSpinner label={`Loading statutory rates for FY ${selectedFy}…`} />
      ) : !config ? (
        <Panel>
          <EmptyState icon={<Database size={22} />} title={`No configuration found for FY ${selectedFy}`}>
            Click “Seed 2025-26” to create the default config, or copy from an existing FY.
          </EmptyState>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* New Regime */}
          <Accordion
            title="Income tax — New regime"
            subtitle="Slabs and reliefs used for employees on the new regime"
            icon="🆕" open={expanded.newRegime} onToggle={() => toggle('newRegime')}
          >
            <GroupLabel>Tax slabs (annual taxable income)</GroupLabel>
            <SlabTable slabs={config.newRegimeSlabs || []} onChange={(v) => update('newRegimeSlabs', v)} />
            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'grid', gap: 12 }}>
              <GroupLabel>Reliefs</GroupLabel>
              <ConfigField label="Standard deduction" hint="Flat amount subtracted from annual salary before tax" value={config.newRegimeStdDeduction} onChange={(v) => update('newRegimeStdDeduction', v)} suffix="₹ / year" />
              <ConfigField label="Rebate income limit" hint="Section 87A — taxable income at or below this gets the rebate" value={config.newRegimeRebateLimit} onChange={(v) => update('newRegimeRebateLimit', v)} suffix="₹ / year" />
              <ConfigField label="Maximum rebate" hint="Largest 87A rebate that can be applied" value={config.newRegimeRebateMax} onChange={(v) => update('newRegimeRebateMax', v)} suffix="₹ / year" />
            </div>
          </Accordion>

          {/* Old Regime */}
          <Accordion
            title="Income tax — Old regime"
            subtitle="Slabs and reliefs used for employees who opted for the old regime"
            icon="📜" open={expanded.oldRegime} onToggle={() => toggle('oldRegime')}
          >
            <GroupLabel>Tax slabs (annual taxable income)</GroupLabel>
            <SlabTable slabs={config.oldRegimeSlabs || []} onChange={(v) => update('oldRegimeSlabs', v)} />
            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'grid', gap: 12 }}>
              <GroupLabel>Reliefs</GroupLabel>
              <ConfigField label="Standard deduction" hint="Flat amount subtracted from annual salary before tax" value={config.oldRegimeStdDeduction} onChange={(v) => update('oldRegimeStdDeduction', v)} suffix="₹ / year" />
              <ConfigField label="Rebate income limit" hint="Section 87A — taxable income at or below this gets the rebate" value={config.oldRegimeRebateLimit} onChange={(v) => update('oldRegimeRebateLimit', v)} suffix="₹ / year" />
              <ConfigField label="Maximum rebate" hint="Largest 87A rebate that can be applied" value={config.oldRegimeRebateMax} onChange={(v) => update('oldRegimeRebateMax', v)} suffix="₹ / year" />
            </div>
          </Accordion>

          {/* Cess & Surcharge */}
          <Accordion
            title="Cess & surcharge"
            subtitle="Added on top of computed income tax"
            icon="💰" open={expanded.cess} onToggle={() => toggle('cess')}
          >
            <ConfigField
              label="Health & education cess"
              hint="Charged on the income tax amount, for both regimes"
              value={config.cessRate}
              onChange={(v) => update('cessRate', v)} percent
              step="0.01"
              suffix="%"
            />
            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'grid', gap: 10 }}>
              <GroupLabel>Surcharge on high incomes</GroupLabel>
              <SlabTable
                slabs={config.surchargeSlabs || []}
                onChange={(v) => update('surchargeSlabs', v)}
                rateLabel="Surcharge rate (%)"
              />
            </div>
          </Accordion>

          {/* PF */}
          <Accordion
            title="Provident Fund (PF / EPF)"
            subtitle="Contribution rates and wage ceilings used for every PF-applicable employee"
            icon="🏛️" open={expanded.pf} onToggle={() => toggle('pf')}
          >
            <GroupLabel>Employee side (deducted from salary)</GroupLabel>
            <ConfigField label="Employee PF contribution" hint="Deducted from the employee's PF wages" value={config.pfEmployeeRate} onChange={(v) => update('pfEmployeeRate', v)} percent step="0.01" suffix="% of PF wages" />

            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'grid', gap: 12 }}>
              <GroupLabel>Employer side (adds to cost to company)</GroupLabel>
              <ConfigField label="Employer share to EPF" hint="Employer's provident-fund portion" value={config.pfEmployerEpfRate} onChange={(v) => update('pfEmployerEpfRate', v)} percent step="0.01" suffix="% of PF wages" />
              <ConfigField label="Employer share to EPS (pension)" hint="Employees' Pension Scheme portion of the employer contribution" value={config.pfEmployerEpsRate} onChange={(v) => update('pfEmployerEpsRate', v)} percent step="0.01" suffix="% of PF wages" />
              <ConfigField label="EPS wage ceiling" hint="Pension contribution is capped at this monthly wage" value={config.pfEpsWageCeiling} onChange={(v) => update('pfEpsWageCeiling', v)} suffix="₹ / month" />
              <ConfigField label="EDLI rate (life insurance)" hint="Employees' Deposit Linked Insurance, paid by the employer" value={config.pfEdliRate} onChange={(v) => update('pfEdliRate', v)} percent step="0.01" suffix="% of PF wages" />
              <ConfigField label="EDLI wage ceiling" hint="EDLI contribution is capped at this monthly wage" value={config.pfEdliCeiling} onChange={(v) => update('pfEdliCeiling', v)} suffix="₹ / month" />
              <ConfigField label="EPFO admin charges" hint="Administration fee the employer pays to EPFO" value={config.pfAdminRate} onChange={(v) => update('pfAdminRate', v)} percent step="0.01" suffix="% of PF wages" />
            </div>
          </Accordion>

          {/* ESI */}
          <Accordion
            title="Employee State Insurance (ESI)"
            subtitle="Medical-cover contribution rates and the wage ceiling that decides who is covered"
            icon="🏥" open={expanded.esi} onToggle={() => toggle('esi')}
          >
            <ConfigField label="Employee ESI contribution" hint="Deducted from the employee's gross" value={config.esiEmployeeRate} onChange={(v) => update('esiEmployeeRate', v)} percent step="0.01" suffix="% of gross" />
            <ConfigField label="Employer ESI contribution" hint="Paid by the employer, adds to cost to company" value={config.esiEmployerRate} onChange={(v) => update('esiEmployerRate', v)} percent step="0.01" suffix="% of gross" />
            <ConfigField label="ESI wage ceiling" hint="Employees earning above this monthly gross are outside ESI" value={config.esiWageCeiling} onChange={(v) => update('esiWageCeiling', v)} suffix="₹ / month" />
          </Accordion>

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 2 }}>
            <Button
              onClick={handleSave}
              disabled={saving}
              iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            >
              Save Changes
            </Button>
          </div>

          {/* Metadata */}
          <RecordMeta
            style={{ textAlign: 'right' }}
            compact
            createdAt={config.createdAt}
            createdByName={config.createdByName}
            updatedAt={config.updatedAt}
            updatedByName={config.updatedByName || config.updatedBy}
          />
        </div>
      )}

      {/* ── Copy to a new FY ── */}
      <Modal
        open={showCopyModal}
        onClose={() => { setShowCopyModal(false); setCopyTarget(''); }}
        size="sm"
        icon={<Copy size={18} />}
        title="Copy to New FY"
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => { setShowCopyModal(false); setCopyTarget(''); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleCopy}
              disabled={!copyTarget || !/^\d{4}-\d{2}$/.test(copyTarget)}
              iconLeft={<Copy size={14} />}
            >
              Copy
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>
            Copy all values from FY {selectedFy} to a new financial year.
          </p>
          <div>
            <label htmlFor="fy-copy-target" style={{ display: 'block', font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
              Target Financial Year
            </label>
            <Input
              id="fy-copy-target"
              type="text"
              placeholder="e.g., 2026-27"
              value={copyTarget}
              onChange={(e) => setCopyTarget(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
