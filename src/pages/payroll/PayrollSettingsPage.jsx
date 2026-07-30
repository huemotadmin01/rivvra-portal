import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getFYConfigs, getFYConfig, updateFYConfig, copyFYConfig, seedFYConfig } from '../../utils/payrollApi';
import { Settings2, ChevronDown, ChevronRight, Plus, Save, Loader2, Copy, Database, Trash2, Shield } from 'lucide-react';
import RecordMeta from '../../components/shared/RecordMeta';

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
function DraftNumberInput({ value, onChange, className, step, placeholder }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : (value ?? '');
  return (
    <input
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
      className={className}
    />
  );
}

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
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 text-xs text-dark-400 font-medium px-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
        <span>{rateLabel}</span>
        <span></span>
      </div>
      {slabs.map((slab, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2">
          <input
            type="number"
            value={slab.min}
            onChange={(e) => updateRow(idx, 'min', Number(e.target.value))}
            className="bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-white"
          />
          <input
            type="number"
            value={slab.max === null ? '' : slab.max}
            placeholder="∞"
            onChange={(e) => updateRow(idx, 'max', e.target.value === '' ? null : Number(e.target.value))}
            className="bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-white placeholder-dark-500"
          />
          <DraftNumberInput
            step="0.01"
            value={showTax ? (slab.tax ?? 0) : toPercentDisplay(slab.rate ?? 0)}
            onChange={(raw) => {
              if (raw === '' || Number.isNaN(Number(raw))) return;
              if (showTax) updateRow(idx, 'tax', Number(raw));
              else updateRow(idx, 'rate', Number(raw) / 100);
            }}
            className="bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-white"
          />
          <button
            onClick={() => removeRow(idx)}
            className="text-dark-500 hover:text-red-400 transition-colors p-1"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={addRow}
        className="flex items-center gap-1 text-xs text-rivvra-400 hover:text-rivvra-300 mt-1"
      >
        <Plus size={12} /> Add slab
      </button>
      <p className="text-[11px] text-dark-500">Leave the top band's upper limit blank for “no limit”.</p>
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
  if (type !== 'number') {
    return (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <label className="text-sm text-dark-300 min-w-[220px] pt-1.5">
          {label}
          {hint && <span className="block text-[11px] text-dark-500 font-normal">{hint}</span>}
        </label>
        <div className="flex items-center gap-1">
          <input
            type={type}
            step={step}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-white w-32"
          />
          {suffix && <span className="text-xs text-dark-400">{suffix}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <label className="text-sm text-dark-300 min-w-[220px] pt-1.5">
        {label}
        {hint && <span className="block text-[11px] text-dark-500 font-normal">{hint}</span>}
      </label>
      <div className="flex items-center gap-1">
        <DraftNumberInput
          step={step || '1'}
          value={shown}
          onChange={(raw) => {
            if (raw === '' || Number.isNaN(Number(raw))) return;
            onChange(percent ? Number(raw) / 100 : Number(raw));
          }}
          className="bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-white w-32"
        />
        {suffix && <span className="text-xs text-dark-400">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, subtitle, icon, expanded, onToggle, children }) {
  return (
    <div className="border border-dark-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-dark-800/50 hover:bg-dark-800 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} className="text-dark-400" /> : <ChevronRight size={16} className="text-dark-400" />}
        <span className="text-sm">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white">{title}</span>
          {subtitle && <span className="block text-[11px] text-dark-500">{subtitle}</span>}
        </span>
      </button>
      {expanded && (
        <div className="px-4 py-4 space-y-4 bg-dark-900/50">
          {children}
        </div>
      )}
    </div>
  );
}

export default function PayrollSettingsPage({ embedded = false }) {
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
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <Shield size={24} className="text-amber-400" />
          <h1 className="text-xl font-semibold text-white">FY Statutory Configuration</h1>
        </div>
        <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-6 text-center">
          <p className="text-dark-300">Only super admins can manage FY statutory configurations.</p>
          <p className="text-dark-400 text-sm mt-1">Contact your platform administrator for changes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-8 max-w-4xl'}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        {!embedded && (
          <div className="flex items-center gap-3">
            <Settings2 size={24} className="text-rivvra-400" />
            <div>
              <h1 className="text-xl font-semibold text-white">Statutory Rates by Financial Year</h1>
              <p className="text-sm text-dark-400">Income-tax slabs, cess, surcharge and PF/ESI rates that every payroll run for the selected year uses</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedFy}
            title="Statutory rates are stored per financial year"
            onChange={(e) => setSelectedFy(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
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
          </select>

          {config && (
            <button
              onClick={() => setShowCopyModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 rounded text-sm text-white transition-colors"
            >
              <Copy size={14} /> Copy to new FY
            </button>
          )}

          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 rounded text-sm text-white transition-colors disabled:opacity-50"
          >
            {seeding ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Seed 2025-26
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={24} className="animate-spin text-rivvra-400" />
          <p className="text-xs text-dark-500">Loading statutory rates for FY {selectedFy}…</p>
        </div>
      ) : !config ? (
        <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-8 text-center">
          <p className="text-dark-300 mb-2">No configuration found for FY {selectedFy}</p>
          <p className="text-dark-400 text-sm">Click "Seed 2025-26" to create the default config, or copy from an existing FY.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* New Regime */}
          <Section
            title="Income tax — New regime"
            subtitle="Slabs and reliefs used for employees on the new regime"
            icon="🆕" expanded={expanded.newRegime} onToggle={() => toggle('newRegime')}
          >
            <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Tax slabs (annual taxable income)</h4>
            <SlabTable slabs={config.newRegimeSlabs || []} onChange={(v) => update('newRegimeSlabs', v)} />
            <div className="border-t border-dark-700 pt-3 space-y-3">
              <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Reliefs</h4>
              <ConfigField label="Standard deduction" hint="Flat amount subtracted from annual salary before tax" value={config.newRegimeStdDeduction} onChange={(v) => update('newRegimeStdDeduction', v)} suffix="₹ / year" />
              <ConfigField label="Rebate income limit" hint="Section 87A — taxable income at or below this gets the rebate" value={config.newRegimeRebateLimit} onChange={(v) => update('newRegimeRebateLimit', v)} suffix="₹ / year" />
              <ConfigField label="Maximum rebate" hint="Largest 87A rebate that can be applied" value={config.newRegimeRebateMax} onChange={(v) => update('newRegimeRebateMax', v)} suffix="₹ / year" />
            </div>
          </Section>

          {/* Old Regime */}
          <Section
            title="Income tax — Old regime"
            subtitle="Slabs and reliefs used for employees who opted for the old regime"
            icon="📜" expanded={expanded.oldRegime} onToggle={() => toggle('oldRegime')}
          >
            <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Tax slabs (annual taxable income)</h4>
            <SlabTable slabs={config.oldRegimeSlabs || []} onChange={(v) => update('oldRegimeSlabs', v)} />
            <div className="border-t border-dark-700 pt-3 space-y-3">
              <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Reliefs</h4>
              <ConfigField label="Standard deduction" hint="Flat amount subtracted from annual salary before tax" value={config.oldRegimeStdDeduction} onChange={(v) => update('oldRegimeStdDeduction', v)} suffix="₹ / year" />
              <ConfigField label="Rebate income limit" hint="Section 87A — taxable income at or below this gets the rebate" value={config.oldRegimeRebateLimit} onChange={(v) => update('oldRegimeRebateLimit', v)} suffix="₹ / year" />
              <ConfigField label="Maximum rebate" hint="Largest 87A rebate that can be applied" value={config.oldRegimeRebateMax} onChange={(v) => update('oldRegimeRebateMax', v)} suffix="₹ / year" />
            </div>
          </Section>

          {/* Cess & Surcharge */}
          <Section
            title="Cess & surcharge"
            subtitle="Added on top of computed income tax"
            icon="💰" expanded={expanded.cess} onToggle={() => toggle('cess')}
          >
            <ConfigField
              label="Health & education cess"
              hint="Charged on the income tax amount, for both regimes"
              value={config.cessRate}
              onChange={(v) => update('cessRate', v)} percent
              step="0.01"
              suffix="%"
            />
            <div className="border-t border-dark-700 pt-3">
              <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">Surcharge on high incomes</h4>
              <SlabTable
                slabs={config.surchargeSlabs || []}
                onChange={(v) => update('surchargeSlabs', v)}
                rateLabel="Surcharge rate (%)"
              />
            </div>
          </Section>

          {/* PF */}
          <Section
            title="Provident Fund (PF / EPF)"
            subtitle="Contribution rates and wage ceilings used for every PF-applicable employee"
            icon="🏛️" expanded={expanded.pf} onToggle={() => toggle('pf')}
          >
            <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Employee side (deducted from salary)</h4>
            <ConfigField label="Employee PF contribution" hint="Deducted from the employee's PF wages" value={config.pfEmployeeRate} onChange={(v) => update('pfEmployeeRate', v)} percent step="0.01" suffix="% of PF wages" />

            <div className="border-t border-dark-700 pt-3 space-y-3">
              <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Employer side (adds to cost to company)</h4>
              <ConfigField label="Employer share to EPF" hint="Employer's provident-fund portion" value={config.pfEmployerEpfRate} onChange={(v) => update('pfEmployerEpfRate', v)} percent step="0.01" suffix="% of PF wages" />
              <ConfigField label="Employer share to EPS (pension)" hint="Employees' Pension Scheme portion of the employer contribution" value={config.pfEmployerEpsRate} onChange={(v) => update('pfEmployerEpsRate', v)} percent step="0.01" suffix="% of PF wages" />
              <ConfigField label="EPS wage ceiling" hint="Pension contribution is capped at this monthly wage" value={config.pfEpsWageCeiling} onChange={(v) => update('pfEpsWageCeiling', v)} suffix="₹ / month" />
              <ConfigField label="EDLI rate (life insurance)" hint="Employees' Deposit Linked Insurance, paid by the employer" value={config.pfEdliRate} onChange={(v) => update('pfEdliRate', v)} percent step="0.01" suffix="% of PF wages" />
              <ConfigField label="EDLI wage ceiling" hint="EDLI contribution is capped at this monthly wage" value={config.pfEdliCeiling} onChange={(v) => update('pfEdliCeiling', v)} suffix="₹ / month" />
              <ConfigField label="EPFO admin charges" hint="Administration fee the employer pays to EPFO" value={config.pfAdminRate} onChange={(v) => update('pfAdminRate', v)} percent step="0.01" suffix="% of PF wages" />
            </div>
          </Section>

          {/* ESI */}
          <Section
            title="Employee State Insurance (ESI)"
            subtitle="Medical-cover contribution rates and the wage ceiling that decides who is covered"
            icon="🏥" expanded={expanded.esi} onToggle={() => toggle('esi')}
          >
            <ConfigField label="Employee ESI contribution" hint="Deducted from the employee's gross" value={config.esiEmployeeRate} onChange={(v) => update('esiEmployeeRate', v)} percent step="0.01" suffix="% of gross" />
            <ConfigField label="Employer ESI contribution" hint="Paid by the employer, adds to cost to company" value={config.esiEmployerRate} onChange={(v) => update('esiEmployerRate', v)} percent step="0.01" suffix="% of gross" />
            <ConfigField label="ESI wage ceiling" hint="Employees earning above this monthly gross are outside ESI" value={config.esiWageCeiling} onChange={(v) => update('esiWageCeiling', v)} suffix="₹ / month" />
          </Section>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Changes
            </button>
          </div>

          {/* Metadata */}
          <RecordMeta
            className="text-right"
            compact
            createdAt={config.createdAt}
            createdByName={config.createdByName}
            updatedAt={config.updatedAt}
            updatedByName={config.updatedByName || config.updatedBy}
          />
        </div>
      )}

      {/* Copy Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-lg font-medium text-white">Copy to New FY</h3>
            <p className="text-sm text-dark-300">Copy all values from FY {selectedFy} to a new financial year.</p>
            <div>
              <label className="text-sm text-dark-400 block mb-1">Target Financial Year</label>
              <input
                type="text"
                placeholder="e.g., 2026-27"
                value={copyTarget}
                onChange={(e) => setCopyTarget(e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCopyModal(false); setCopyTarget(''); }}
                className="px-4 py-2 text-sm text-dark-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCopy}
                disabled={!copyTarget || !/^\d{4}-\d{2}$/.test(copyTarget)}
                className="flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded text-sm disabled:opacity-50"
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
