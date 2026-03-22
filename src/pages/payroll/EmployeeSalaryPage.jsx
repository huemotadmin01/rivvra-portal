import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  getEmployeeSalaries, getSalaryStructures, createEmployeeSalary, reviseEmployeeSalary,
  getEmployeeSalaryHistory, getUnconfiguredEmployees,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Plus, History, AlertTriangle, X, IndianRupee } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function EmployeeSalaryPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [salaries, setSalaries] = useState([]);
  const [structures, setStructures] = useState([]);
  const [unconfigured, setUnconfigured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ employeeId: '', structureId: '', ctcAnnual: '', effectiveFrom: '', pfApplicable: true, pfCappedAt15K: false });
  const [revising, setRevising] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [salRes, structRes, unRes] = await Promise.all([
        getEmployeeSalaries(orgSlug),
        getSalaryStructures(orgSlug),
        getUnconfiguredEmployees(orgSlug),
      ]);
      setSalaries(salRes.salaries || []);
      setStructures(structRes.structures || []);
      setUnconfigured(unRes.employees || []);
    } catch (err) { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [orgSlug]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (revising) {
        await reviseEmployeeSalary(orgSlug, revising, {
          ctcAnnual: Number(form.ctcAnnual),
          structureId: form.structureId,
          effectiveFrom: form.effectiveFrom,
          pfApplicable: form.pfApplicable,
          pfCappedAt15K: form.pfCappedAt15K,
        });
        showToast('Salary revised');
      } else {
        await createEmployeeSalary(orgSlug, {
          ...form,
          ctcAnnual: Number(form.ctcAnnual),
        });
        showToast('Salary configured');
      }
      setShowForm(false);
      setRevising(null);
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const openRevise = (salary) => {
    setForm({
      employeeId: salary.employeeId,
      structureId: salary.structureId,
      ctcAnnual: salary.ctcAnnual,
      effectiveFrom: new Date().toISOString().split('T')[0],
      pfApplicable: salary.pfApplicable,
      pfCappedAt15K: salary.pfCappedAt15K,
    });
    setRevising(salary._id);
    setShowForm(true);
  };

  const openHistory = async (employeeId) => {
    try {
      const res = await getEmployeeSalaryHistory(orgSlug, employeeId);
      setHistory(res.history || []);
      setShowHistory(employeeId);
    } catch (err) { showToast('Failed to load history', 'error'); }
  };

  const openNew = (empId = '') => {
    setForm({
      employeeId: empId,
      structureId: structures.find(s => s.isDefault)?._id || structures[0]?._id || '',
      ctcAnnual: '',
      effectiveFrom: new Date().toISOString().split('T')[0],
      pfApplicable: true,
      pfCappedAt15K: false,
    });
    setRevising(null);
    setShowForm(true);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Employee Salary</h1>
          <p className="text-sm text-dark-400 mt-1">CTC configuration for statutory payroll</p>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
        <IndianRupee size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-300">CTC is managed from the Employee Detail page. Go to <span className="font-medium">Employee → employee profile → Work Information</span> to set or revise CTC.</p>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Structure</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">CTC/Year</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Gross/Mo</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Employer Cost</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">PF</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">ESI</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {salaries.map(s => (
              <tr key={s._id} className="border-b border-dark-700/50 hover:bg-dark-750">
                <td className="px-4 py-3">
                  <div className="text-white font-medium">{s.employee?.fullName || s.employee?.name || 'Unknown'}</div>
                  <div className="text-xs text-dark-400">{s.employee?.email}</div>
                </td>
                <td className="px-4 py-3 text-dark-300">{s.structure?.name || '-'}</td>
                <td className="px-4 py-3 text-right text-white font-medium">{fmt(s.ctcAnnual)}</td>
                <td className="px-4 py-3 text-right text-dark-300">{fmt(s.grossMonthly)}</td>
                <td className="px-4 py-3 text-right text-dark-300">{fmt(s.totalEmployerCost)}</td>
                <td className="px-4 py-3 text-center">
                  {s.pfApplicable ? <span className="text-green-400 text-xs">Yes</span> : <span className="text-dark-500 text-xs">No</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.esiApplicable ? <span className="text-green-400 text-xs">Yes</span> : <span className="text-dark-500 text-xs">No</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openHistory(s.employeeId)} className="p-1 text-dark-400 hover:text-white" title="View history"><History size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {salaries.length === 0 && <div className="text-center py-12 text-dark-500">No salary configurations yet.</div>}
      </div>

      {/* Create/Revise Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <h2 className="text-lg font-semibold text-white">{revising ? 'Revise Salary' : 'Configure Salary'}</h2>
              <button onClick={() => { setShowForm(false); setRevising(null); }} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {!revising && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Employee</label>
                  <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none" required>
                    <option value="">Select employee...</option>
                    {unconfigured.map(e => <option key={e._id} value={e._id}>{e.fullName || e.name || e.email}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Salary Structure</label>
                <select value={form.structureId} onChange={e => setForm(f => ({ ...f, structureId: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none" required>
                  {structures.map(s => <option key={s._id} value={s._id}>{s.name}{s.isDefault ? ' (Default)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Annual CTC</label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-2.5 text-dark-500" />
                  <input type="number" value={form.ctcAnnual} onChange={e => setForm(f => ({ ...f, ctcAnnual: e.target.value }))}
                    className="w-full pl-8 pr-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none" placeholder="600000" required min="1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Effective From</label>
                <input type="date" value={form.effectiveFrom} onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none" required />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.pfApplicable} onChange={e => setForm(f => ({ ...f, pfApplicable: e.target.checked }))} className="rounded border-dark-600" /> PF Applicable
                </label>
                <label className="flex items-center gap-2 text-sm text-dark-300">
                  <input type="checkbox" checked={form.pfCappedAt15K} onChange={e => setForm(f => ({ ...f, pfCappedAt15K: e.target.checked }))} className="rounded border-dark-600" /> PF Capped at 15K
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setRevising(null); }} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700">{revising ? 'Revise' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <h2 className="text-lg font-semibold text-white">Salary History</h2>
              <button onClick={() => setShowHistory(null)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              {history.map((h, i) => (
                <div key={h._id} className={`bg-dark-900/50 rounded-lg p-4 ${i === 0 ? 'border border-rivvra-500/30' : 'border border-dark-700'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium text-white">CTC: {fmt(h.ctcAnnual)}/yr</div>
                    {i === 0 && <span className="text-[10px] text-rivvra-400 bg-rivvra-500/10 px-2 py-0.5 rounded-full">Current</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-dark-400">
                    <div>Gross: {fmt(h.grossMonthly)}/mo</div>
                    <div>Employer: {fmt(h.totalEmployerCost)}/mo</div>
                    <div>From: {new Date(h.effectiveFrom).toLocaleDateString('en-IN')}</div>
                    <div>{h.effectiveTo ? `To: ${new Date(h.effectiveTo).toLocaleDateString('en-IN')}` : 'Active'}</div>
                  </div>
                </div>
              ))}
              {history.length === 0 && <div className="text-center py-8 text-dark-500">No history found.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
