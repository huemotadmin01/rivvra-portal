import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getStatutoryConfigs, updateStatutoryConfig, getPTStates } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Shield, X, Search, CheckCircle, XCircle } from 'lucide-react';

export default function StatutoryConfigPage({ embedded = false }) {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [data, setData] = useState([]);
  const [ptStates, setPtStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});

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
      pfCappedAt15K: s.pfCappedAt15K || false,
      esiEnabled: s.esiEnabled || false,
      ptEnabled: s.ptEnabled ?? true,
      ptState: s.ptState || 'MH',
      taxRegime: s.taxRegime || 'new',
      stopSalaryProcessing: s.stopSalaryProcessing || false,
    });
    setEditing(item);
  };

  const handleSave = async () => {
    try {
      await updateStatutoryConfig(orgSlug, editing.employee._id, form);
      showToast('Updated');
      setEditing(null);
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const filtered = data.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.employee.fullName || d.employee.name || '').toLowerCase().includes(q) || (d.employee.email || '').toLowerCase().includes(q);
  });

  const StatusBadge = ({ enabled, label }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${enabled ? 'bg-green-500/10 text-green-400' : 'bg-dark-700 text-dark-500'}`}>
      {enabled ? <CheckCircle size={10} /> : <XCircle size={10} />} {label}
    </span>
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Statutory Configuration</h1>
            <p className="text-sm text-dark-400 mt-1">PF, ESI, PT, and tax regime per employee</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-64" placeholder="Search employees..." />
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-64" placeholder="Search employees..." />
          </div>
        </div>
      )}

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">PF</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">ESI</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">PT</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Tax Regime</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">PAN</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Bank</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const s = item.statutory;
              return (
                <tr key={item.employee._id} className="border-b border-dark-700/50 hover:bg-dark-750">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{item.employee.fullName || item.employee.name || item.employee.email}</span>
                      {s?.stopSalaryProcessing && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Stopped</span>}
                    </div>
                    <div className="text-xs text-dark-400">{item.employee.email}</div>
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge enabled={s?.pfEnabled} label="PF" /></td>
                  <td className="px-4 py-3 text-center"><StatusBadge enabled={s?.esiEnabled} label="ESI" /></td>
                  <td className="px-4 py-3 text-center">
                    {s?.ptEnabled ? <span className="text-xs text-dark-300">{s.ptState || 'MH'}</span> : <span className="text-xs text-dark-500">-</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s?.taxRegime === 'old' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {s?.taxRegime === 'old' ? 'Old' : 'New'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-dark-400">{getPan(item)}</td>
                  <td className="px-4 py-3 text-center text-xs text-dark-400">{getBank(item)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(item)} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-12 text-dark-500">No employees found.</div>}
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
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Provident Fund</legend>
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.pfEnabled} onChange={e => setForm(f => ({ ...f, pfEnabled: e.target.checked }))} className="rounded border-dark-600" /> PF Enabled
                </label>
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.pfCappedAt15K} onChange={e => setForm(f => ({ ...f, pfCappedAt15K: e.target.checked }))} className="rounded border-dark-600" /> PF Capped at 15K
                </label>
              </fieldset>

              {/* ESI Section */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">ESI</legend>
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.esiEnabled} onChange={e => setForm(f => ({ ...f, esiEnabled: e.target.checked }))} className="rounded border-dark-600" /> ESI Enabled
                </label>
              </fieldset>

              {/* PT Section */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Professional Tax</legend>
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.ptEnabled} onChange={e => setForm(f => ({ ...f, ptEnabled: e.target.checked }))} className="rounded border-dark-600" /> PT Enabled
                </label>
                <select value={form.ptState} onChange={e => setForm(f => ({ ...f, ptState: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
                  {ptStates.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                </select>
              </fieldset>

              {/* Tax Regime */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Tax Regime</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" value="new" checked={form.taxRegime === 'new'} onChange={() => setForm(f => ({ ...f, taxRegime: 'new' }))} /> New Regime
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" value="old" checked={form.taxRegime === 'old'} onChange={() => setForm(f => ({ ...f, taxRegime: 'old' }))} /> Old Regime
                  </label>
                </div>
              </fieldset>

              {/* Stop Salary Processing */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Payroll Processing</legend>
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.stopSalaryProcessing} onChange={e => setForm(f => ({ ...f, stopSalaryProcessing: e.target.checked }))} className="rounded border-dark-600" />
                  <span className={form.stopSalaryProcessing ? 'text-red-400' : ''}>Stop Salary Processing</span>
                </label>
                {form.stopSalaryProcessing && (
                  <p className="text-xs text-red-400/70">This employee will be excluded from payroll runs.</p>
                )}
              </fieldset>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button onClick={handleSave} className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
