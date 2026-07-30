import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getStatutoryConfigs, updateStatutoryConfig, getPTStates } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Shield, X, Search, CheckCircle, XCircle, Loader2 } from 'lucide-react';

// Module scope — a component declared inside the render body is a new type on
// every render, which remounts it and would lose focus in any input it holds.
function StatusBadge({ enabled, label, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${enabled ? 'bg-green-500/10 text-green-400' : 'bg-dark-700 text-dark-500'}`}
    >
      {enabled ? <CheckCircle size={10} /> : <XCircle size={10} />} {label}
    </span>
  );
}

// Client-side filters over already-loaded rows — no extra API calls.
const FILTERS = [
  { key: 'all', label: 'All employees' },
  { key: 'pf', label: 'PF applicable' },
  { key: 'noPf', label: 'PF not applicable' },
  { key: 'esi', label: 'ESI applicable' },
  { key: 'stopped', label: 'Salary processing stopped' },
];

export default function StatutoryConfigPage({ embedded = false }) {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [data, setData] = useState([]);
  const [ptStates, setPtStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({});
  // In-flight guard — this writes PF/ESI/PT/tax-regime for an employee.
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setData([]);
    setPtStates([]);
    try {
      const [res, stRes] = await Promise.all([
        getStatutoryConfigs(orgSlug),
        getPTStates(orgSlug),
      ]);
      setData(res.data || []);
      setPtStates(stRes.states || []);
    } catch (err) { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id]);

  const openEdit = (item) => {
    const s = item.statutory || {};
    setForm({
      pfEnabled: s.pfEnabled ?? true,
      pfCappedAt15K: s.pfCappedAt15K ?? true,
      esiEnabled: s.esiEnabled || false,
      ptEnabled: s.ptEnabled ?? true,
      ptState: s.ptState || 'MH',
      taxRegime: s.taxRegime || 'new',
      stopSalaryProcessing: s.stopSalaryProcessing || false,
    });
    setEditing(item);
  };

  const handleSave = async () => {
    if (saving || !editing?.employee?._id) return;
    setSaving(true);
    try {
      await updateStatutoryConfig(orgSlug, editing.employee._id, form);
      showToast('Updated');
      setEditing(null);
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const filtered = data.filter(d => {
    const s = d.statutory || {};
    // Mirror the same policy defaults the edit form uses (?? true), so the
    // filter agrees with what the row badges show.
    const pfOn = s.pfEnabled ?? true;
    if (filter === 'pf' && !pfOn) return false;
    if (filter === 'noPf' && pfOn) return false;
    if (filter === 'esi' && !(s.esiEnabled || false)) return false;
    if (filter === 'stopped' && !(s.stopSalaryProcessing || false)) return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const e = d.employee || {};
    return [e.fullName, e.name, e.email, e.employeeId, e.employeeCode, e.code]
      .some(v => (v || '').toString().toLowerCase().includes(q));
  });

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" />
      <p className="text-xs text-dark-500">Loading statutory settings for every employee…</p>
    </div>
  );

  // Helper to get employee-level data
  const getPan = (item) => item.employee?.bankDetails?.pan || item.employee?.statutory?.pan || '-';
  const getBank = (item) => {
    const b = item.employee?.bankDetails;
    if (!b?.bankName && !b?.accountNumber) return '-';
    return b.bankName || 'Set';
  };

  return (
    <div className={embedded ? '' : 'max-w-6xl mx-auto'}>
      {!embedded && (
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-white">Statutory Configuration</h1>
          <p className="text-sm text-dark-400 mt-1">
            Per-employee Provident Fund (PF), Employee State Insurance (ESI), Professional Tax (PT)
            and income-tax regime used by every payroll run
          </p>
        </div>
      )}

      {/* Search + filters — both operate on the rows already loaded */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-72" placeholder="Search name, email or employee code…" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f.key
                  ? 'bg-rivvra-500/10 text-rivvra-400 border-rivvra-500/30'
                  : 'bg-dark-800 text-dark-400 border-dark-700 hover:text-white hover:border-dark-500'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-dark-500 ml-auto">
          {filtered.length} of {data.length} employee{data.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium" title="Provident Fund — deducted from the employee and matched by the employer">Provident&nbsp;Fund</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium" title="Employee State Insurance — medical cover for employees under the wage ceiling">ESI&nbsp;(insurance)</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium" title="Professional Tax — a state levy; the state decides the slab">Professional&nbsp;Tax</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium" title="Income-tax regime used when computing TDS">Tax&nbsp;Regime</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium" title="Permanent Account Number, from the employee record">PAN</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium" title="Salary bank account, from the employee record">Salary&nbsp;Bank</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const s = item.statutory || {};
              // Same `?? true` policy defaults as the edit form, so the row
              // never claims PF/PT is off when the record simply has no
              // explicit value stored yet.
              const pfOn = s.pfEnabled ?? true;
              const ptOn = s.ptEnabled ?? true;
              return (
                <tr key={item.employee._id} className="border-b border-dark-700/50 hover:bg-dark-750">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{item.employee.fullName || item.employee.name || item.employee.email}</span>
                      {s.stopSalaryProcessing && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium" title="Excluded from payroll runs">Salary on hold</span>}
                    </div>
                    <div className="text-xs text-dark-400">{item.employee.email}</div>
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge enabled={pfOn} label={pfOn ? 'Applicable' : 'Not applicable'} title="Provident Fund" /></td>
                  <td className="px-4 py-3 text-center"><StatusBadge enabled={s.esiEnabled || false} label={s.esiEnabled ? 'Applicable' : 'Not applicable'} title="Employee State Insurance" /></td>
                  <td className="px-4 py-3 text-center">
                    {ptOn
                      ? <span className="text-xs text-dark-300">{s.ptState || 'MH'} slab</span>
                      : <span className="text-xs text-dark-500">Not applicable</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.taxRegime === 'old' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {s.taxRegime === 'old' ? 'Old regime' : 'New regime'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-dark-400 whitespace-nowrap">{getPan(item)}</td>
                  <td className="px-4 py-3 text-center text-xs text-dark-400 whitespace-nowrap">{getBank(item)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(item)} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 px-6">
            {data.length === 0 ? (
              <>
                <p className="text-sm text-dark-300">No employees to configure yet</p>
                <p className="text-xs text-dark-500 mt-1 max-w-md mx-auto">Statutory settings appear here once employees exist for this company. Add employees in the Employee app and they will show up with the default PF, PT and New-regime settings.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-dark-300">No employee matches your search or filter</p>
                <button onClick={() => { setSearch(''); setFilter('all'); }} className="mt-2 text-xs text-rivvra-400 hover:text-rivvra-300">Clear search and filters</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal — only payroll-specific settings */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Shield size={18} /> Statutory Config</h2>
                <p className="text-xs text-dark-400 mt-0.5">{editing.employee.fullName || editing.employee.email}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Employee data (read-only) */}
              <div className="bg-dark-900/50 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-dark-500 font-medium mb-2">From Employee Record</p>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">PAN</span>
                  <span className="text-dark-300">{getPan(editing)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">UAN</span>
                  <span className="text-dark-300">{editing.employee?.statutory?.uan || '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">ESI Number</span>
                  <span className="text-dark-300">{editing.employee?.statutory?.esicNumber || '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">Bank</span>
                  <span className="text-dark-300">{editing.employee?.bankDetails?.bankName || '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">Account</span>
                  <span className="text-dark-300">{editing.employee?.bankDetails?.accountNumber ? '••••' + editing.employee.bankDetails.accountNumber.slice(-4) : '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">IFSC</span>
                  <span className="text-dark-300">{editing.employee?.bankDetails?.ifsc || '-'}</span>
                </div>
              </div>

              {/* PF Section */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Provident Fund (PF)</legend>
                <label className="flex items-start gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.pfEnabled} onChange={e => setForm(f => ({ ...f, pfEnabled: e.target.checked }))} className="rounded border-dark-600 mt-0.5" />
                  <span>
                    Deduct PF for this employee
                    <span className="block text-[11px] text-dark-500">Employee contribution is deducted from salary and the employer share is added to cost.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.pfCappedAt15K} onChange={e => setForm(f => ({ ...f, pfCappedAt15K: e.target.checked }))} className="rounded border-dark-600 mt-0.5" />
                  <span>
                    Cap PF wages at ₹15,000/month
                    <span className="block text-[11px] text-dark-500">The statutory ceiling. Leave ticked unless you know this employee must contribute on full Basic.</span>
                  </span>
                </label>
                {form.pfEnabled && !form.pfCappedAt15K && (
                  <div className="text-[11px] text-amber-300/90 bg-amber-900/20 border border-amber-700/40 rounded-md px-2 py-1.5 leading-snug">
                    ⚠️ PF will be calculated on the full Basic salary, not capped at ₹15,000. Employer cost rises significantly. Only uncheck this if the employee was never a PF member at any prior employer AND their Basic exceeds ₹15K. Most employees should stay capped.
                  </div>
                )}
              </fieldset>

              {/* ESI Section */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Employee State Insurance (ESI)</legend>
                <label className="flex items-start gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.esiEnabled} onChange={e => setForm(f => ({ ...f, esiEnabled: e.target.checked }))} className="rounded border-dark-600 mt-0.5" />
                  <span>
                    Deduct ESI for this employee
                    <span className="block text-[11px] text-dark-500">Applies only to employees earning at or below the ESI wage ceiling.</span>
                  </span>
                </label>
              </fieldset>

              {/* PT Section */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Professional Tax (PT)</legend>
                <label className="flex items-start gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.ptEnabled} onChange={e => setForm(f => ({ ...f, ptEnabled: e.target.checked }))} className="rounded border-dark-600 mt-0.5" />
                  <span>
                    Deduct Professional Tax for this employee
                    <span className="block text-[11px] text-dark-500">A state levy. Some states do not charge it at all.</span>
                  </span>
                </label>
                <div>
                  <label className="block text-[11px] text-dark-500 mb-1">State whose PT slab applies (usually the work location)</label>
                  <select value={form.ptState} onChange={e => setForm(f => ({ ...f, ptState: e.target.value }))}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
                    {ptStates.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
              </fieldset>

              {/* Tax Regime */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Income-tax regime (used for TDS)</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" value="new" checked={form.taxRegime === 'new'} onChange={() => setForm(f => ({ ...f, taxRegime: 'new' }))} /> New regime
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" value="old" checked={form.taxRegime === 'old'} onChange={() => setForm(f => ({ ...f, taxRegime: 'old' }))} /> Old regime
                  </label>
                </div>
                <p className="text-[11px] text-dark-500">The employee's declared choice for the year. It changes the slabs and deductions used to compute monthly TDS.</p>
              </fieldset>

              {/* Stop Salary Processing */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Payroll processing</legend>
                <label className="flex items-start gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.stopSalaryProcessing} onChange={e => setForm(f => ({ ...f, stopSalaryProcessing: e.target.checked }))} className="rounded border-dark-600 mt-0.5" />
                  <span className={form.stopSalaryProcessing ? 'text-red-400' : ''}>
                    Hold salary — skip this employee in payroll runs
                    <span className="block text-[11px] text-dark-500">Use for absconding, unpaid-leave or dispute cases. No payslip is generated while this is on.</span>
                  </span>
                </label>
                {form.stopSalaryProcessing && (
                  <p className="text-xs text-red-400/70">This employee will be excluded from every payroll run until you untick this.</p>
                )}
              </fieldset>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)} disabled={saving} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 disabled:opacity-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
