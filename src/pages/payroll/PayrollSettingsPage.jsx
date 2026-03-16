import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getFYConfigs, getFYConfig, updateFYConfig, copyFYConfig, seedFYConfig } from '../../utils/payrollApi';
import { Settings2, ChevronDown, ChevronRight, Plus, Save, Loader2, Copy, Database, Trash2, Shield } from 'lucide-react';

const CURRENT_FY = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
})();

function SlabTable({ slabs, onChange, rateLabel = 'Rate (%)', showTax = false }) {
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
        <span>Min (₹)</span>
        <span>Max (₹)</span>
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
          <input
            type="number"
            step="0.01"
            value={showTax ? (slab.tax ?? 0) : ((slab.rate ?? 0) * 100)}
            onChange={(e) => {
              if (showTax) {
                updateRow(idx, 'tax', Number(e.target.value));
              } else {
                updateRow(idx, 'rate', Number(e.target.value) / 100);
              }
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
    </div>
  );
}

function ConfigField({ label, value, onChange, type = 'number', step, suffix }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-dark-300 min-w-[180px]">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          step={step || (type === 'number' ? '1' : undefined)}
          value={value ?? ''}
          onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
          className="bg-dark-800 border border-dark-700 rounded px-2 py-1.5 text-sm text-white w-32"
        />
        {suffix && <span className="text-xs text-dark-400">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, icon, expanded, onToggle, children }) {
  return (
    <div className="border border-dark-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-dark-800/50 hover:bg-dark-800 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} className="text-dark-400" /> : <ChevronRight size={16} className="text-dark-400" />}
        <span className="text-sm">{icon}</span>
        <span className="text-sm font-medium text-white">{title}</span>
      </button>
      {expanded && (
        <div className="px-4 py-4 space-y-4 bg-dark-900/50">
          {children}
        </div>
      )}
    </div>
  );
}

export default function PayrollSettingsPage() {
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
    } catch { /* ignore */ }
  };

  const loadConfig = async (fy) => {
    setLoading(true);
    try {
      const res = await getFYConfig(fy);
      setConfig(res.config);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadList();
      loadConfig(selectedFy);
    } else {
      setLoading(false);
    }
  }, [selectedFy]);

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
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings2 size={24} className="text-rivvra-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">FY Statutory Configuration</h1>
            <p className="text-sm text-dark-400">Tax slabs, PF/ESI rates per financial year</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedFy}
            onChange={(e) => setSelectedFy(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
          >
            {fyList.length > 0 ? (
              fyList.map(f => (
                <option key={f.financialYear} value={f.financialYear}>FY {f.financialYear}</option>
              ))
            ) : (
              <option value={CURRENT_FY}>FY {CURRENT_FY}</option>
            )}
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
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-rivvra-400" />
        </div>
      ) : !config ? (
        <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-8 text-center">
          <p className="text-dark-300 mb-2">No configuration found for FY {selectedFy}</p>
          <p className="text-dark-400 text-sm">Click "Seed 2025-26" to create the default config, or copy from an existing FY.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* New Regime */}
          <Section title="Income Tax — New Regime" icon="🆕" expanded={expanded.newRegime} onToggle={() => toggle('newRegime')}>
            <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Tax Slabs</h4>
            <SlabTable slabs={config.newRegimeSlabs || []} onChange={(v) => update('newRegimeSlabs', v)} />
            <div className="border-t border-dark-700 pt-3 space-y-2">
              <ConfigField label="Standard Deduction" value={config.newRegimeStdDeduction} onChange={(v) => update('newRegimeStdDeduction', v)} suffix="₹" />
              <ConfigField label="Rebate Limit" value={config.newRegimeRebateLimit} onChange={(v) => update('newRegimeRebateLimit', v)} suffix="₹" />
              <ConfigField label="Max Rebate" value={config.newRegimeRebateMax} onChange={(v) => update('newRegimeRebateMax', v)} suffix="₹" />
            </div>
          </Section>

          {/* Old Regime */}
          <Section title="Income Tax — Old Regime" icon="📜" expanded={expanded.oldRegime} onToggle={() => toggle('oldRegime')}>
            <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider">Tax Slabs</h4>
            <SlabTable slabs={config.oldRegimeSlabs || []} onChange={(v) => update('oldRegimeSlabs', v)} />
            <div className="border-t border-dark-700 pt-3 space-y-2">
              <ConfigField label="Standard Deduction" value={config.oldRegimeStdDeduction} onChange={(v) => update('oldRegimeStdDeduction', v)} suffix="₹" />
              <ConfigField label="Rebate Limit" value={config.oldRegimeRebateLimit} onChange={(v) => update('oldRegimeRebateLimit', v)} suffix="₹" />
              <ConfigField label="Max Rebate" value={config.oldRegimeRebateMax} onChange={(v) => update('oldRegimeRebateMax', v)} suffix="₹" />
            </div>
          </Section>

          {/* Cess & Surcharge */}
          <Section title="Cess & Surcharge" icon="💰" expanded={expanded.cess} onToggle={() => toggle('cess')}>
            <ConfigField
              label="Cess Rate"
              value={(config.cessRate || 0) * 100}
              onChange={(v) => update('cessRate', v / 100)}
              step="0.01"
              suffix="%"
            />
            <div className="border-t border-dark-700 pt-3">
              <h4 className="text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">Surcharge Slabs</h4>
              <SlabTable slabs={config.surchargeSlabs || []} onChange={(v) => update('surchargeSlabs', v)} />
            </div>
          </Section>

          {/* PF */}
          <Section title="Provident Fund" icon="🏛️" expanded={expanded.pf} onToggle={() => toggle('pf')}>
            <ConfigField label="Employee PF Rate" value={(config.pfEmployeeRate || 0) * 100} onChange={(v) => update('pfEmployeeRate', v / 100)} step="0.01" suffix="%" />
            <ConfigField label="Employer EPF Rate" value={(config.pfEmployerEpfRate || 0) * 100} onChange={(v) => update('pfEmployerEpfRate', v / 100)} step="0.01" suffix="%" />
            <ConfigField label="Employer EPS Rate" value={(config.pfEmployerEpsRate || 0) * 100} onChange={(v) => update('pfEmployerEpsRate', v / 100)} step="0.01" suffix="%" />
            <ConfigField label="EPS Wage Ceiling" value={config.pfEpsWageCeiling} onChange={(v) => update('pfEpsWageCeiling', v)} suffix="₹" />
            <ConfigField label="EDLI Rate" value={(config.pfEdliRate || 0) * 100} onChange={(v) => update('pfEdliRate', v / 100)} step="0.01" suffix="%" />
            <ConfigField label="EDLI Ceiling" value={config.pfEdliCeiling} onChange={(v) => update('pfEdliCeiling', v)} suffix="₹" />
            <ConfigField label="Admin Charges Rate" value={(config.pfAdminRate || 0) * 100} onChange={(v) => update('pfAdminRate', v / 100)} step="0.01" suffix="%" />
          </Section>

          {/* ESI */}
          <Section title="Employee State Insurance" icon="🏥" expanded={expanded.esi} onToggle={() => toggle('esi')}>
            <ConfigField label="Employee ESI Rate" value={(config.esiEmployeeRate || 0) * 100} onChange={(v) => update('esiEmployeeRate', v / 100)} step="0.01" suffix="%" />
            <ConfigField label="Employer ESI Rate" value={(config.esiEmployerRate || 0) * 100} onChange={(v) => update('esiEmployerRate', v / 100)} step="0.01" suffix="%" />
            <ConfigField label="ESI Wage Ceiling" value={config.esiWageCeiling} onChange={(v) => update('esiWageCeiling', v)} suffix="₹" />
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
          {config.updatedBy && (
            <p className="text-xs text-dark-500 text-right">
              Last updated by {config.updatedBy} on {new Date(config.updatedAt).toLocaleDateString()}
            </p>
          )}
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
