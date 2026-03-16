import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  getInternPayrollRuns, getInternPayrollRun, createInternPayrollRun, processInternPayrollRun,
  finalizeInternPayrollRun, markInternPayrollRunPaid, deleteInternPayrollRun,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import {
  Plus, Play, CheckCircle, Lock, Trash2, ArrowLeft, X,
} from 'lucide-react';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const STATUS_COLORS = {
  draft: 'bg-dark-700 text-dark-300',
  processing: 'bg-amber-500/10 text-amber-400',
  processed: 'bg-blue-500/10 text-blue-400',
  finalized: 'bg-purple-500/10 text-purple-400',
  paid: 'bg-green-500/10 text-green-400',
};

export default function InternPayrollPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [processing, setProcessing] = useState(false);

  const now = new Date();
  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);
  const [newYear, setNewYear] = useState(now.getFullYear());

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await getInternPayrollRuns(orgSlug);
      setRuns(res.runs || []);
    } catch { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  const loadRun = async (id) => {
    try {
      const res = await getInternPayrollRun(orgSlug, id);
      setSelectedRun(res.run);
    } catch { showToast('Failed to load run', 'error'); }
  };

  useEffect(() => { loadRuns(); }, [orgSlug]);

  const handleCreate = async () => {
    try {
      const res = await createInternPayrollRun(orgSlug, { month: newMonth, year: newYear });
      showToast('Intern payroll run created');
      setShowCreate(false);
      loadRuns();
      loadRun(res.run._id);
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleProcess = async () => {
    if (!selectedRun) return;
    setProcessing(true);
    try {
      const res = await processInternPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast(`Processed ${res.run.items?.length || 0} interns`);
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setProcessing(false); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize this intern payroll run? No further edits will be allowed.')) return;
    try {
      const res = await finalizeInternPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Finalized');
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleMarkPaid = async () => {
    try {
      const res = await markInternPayrollRunPaid(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Marked as paid');
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this draft intern payroll run?')) return;
    try {
      await deleteInternPayrollRun(orgSlug, id);
      showToast('Deleted');
      if (selectedRun?._id === id) setSelectedRun(null);
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  // Detail view
  if (selectedRun) {
    const run = selectedRun;
    const items = run.items || [];
    const summary = run.summary || {};

    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedRun(null)} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{MONTHS[run.month]} {run.year}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status]}`}>{run.status}</span>
            </div>
            <p className="text-sm text-dark-400">Intern Payroll | {summary.totalEmployees || 0} interns</p>
          </div>
          <div className="flex gap-2">
            {run.status === 'draft' && (
              <button onClick={handleProcess} disabled={processing} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm disabled:opacity-50">
                <Play size={14} /> {processing ? 'Processing...' : 'Process'}
              </button>
            )}
            {run.status === 'processed' && (
              <>
                <button onClick={handleProcess} disabled={processing} className="flex items-center gap-2 px-3 py-2 border border-dark-600 text-dark-300 rounded-lg hover:bg-dark-700 text-sm">
                  <Play size={14} /> Re-process
                </button>
                <button onClick={handleFinalize} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
                  <Lock size={14} /> Finalize
                </button>
              </>
            )}
            {run.status === 'finalized' && (
              <button onClick={handleMarkPaid} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                <CheckCircle size={14} /> Mark Paid
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Gross', value: summary.totalGross, color: 'text-white' },
              { label: 'TDS (2%)', value: summary.totalTds, color: 'text-purple-400' },
              { label: 'Total Deductions', value: summary.totalDeductions, color: 'text-red-400' },
              { label: 'Total Net', value: summary.totalNet, color: 'text-green-400' },
            ].map(card => (
              <div key={card.label} className="bg-dark-800 border border-dark-700 rounded-lg p-3">
                <div className="text-xs text-dark-400 mb-1">{card.label}</div>
                <div className={`text-lg font-semibold ${card.color}`}>{fmt(card.value)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Intern Table — simplified (no PF, ESI, PT columns) */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-dark-700">
                {['Intern', 'Days', 'Gross', 'TDS (2%)', 'Deductions', 'Net Pay'].map(h => (
                  <th key={h} className="px-4 py-3 text-dark-400 font-medium text-left text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.employeeId} className="border-b border-dark-700/50 hover:bg-dark-750">
                  <td className="px-4 py-2.5">
                    <div className="text-white text-xs font-medium">{item.employeeName}</div>
                    {item.employeeIdCode && <div className="text-[10px] text-dark-500">{item.employeeIdCode}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-dark-300 text-xs">{item.effectiveDays}/{item.totalWorkingDays}</td>
                  <td className="px-4 py-2.5 text-white text-xs font-medium">{fmt(item.grossSalary)}</td>
                  <td className="px-4 py-2.5 text-purple-400 text-xs">{fmt(item.tds)}</td>
                  <td className="px-4 py-2.5 text-red-400 text-xs">{fmt(item.totalDeductions)}</td>
                  <td className="px-4 py-2.5 text-green-400 text-xs font-medium">{fmt(item.netSalary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="text-center py-12 text-dark-500">No items. Process the payroll to calculate.</div>}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Intern Payroll</h1>
          <p className="text-sm text-dark-400 mt-1">Monthly payroll for interns — 2% TDS only</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
          <Plus size={16} /> New Run
        </button>
      </div>

      <div className="space-y-3">
        {runs.map(run => (
          <div key={run._id} className="bg-dark-800 rounded-xl border border-dark-700 p-4 flex items-center justify-between hover:border-dark-600 cursor-pointer" onClick={() => loadRun(run._id)}>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-white font-medium">{MONTHS[run.month]} {run.year}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[run.status]}`}>{run.status}</span>
              </div>
              <div className="text-xs text-dark-400 mt-1">
                {run.summary?.totalEmployees ? `${run.summary.totalEmployees} interns` : ''}
                {run.summary?.totalNet ? ` | Net: ${fmt(run.summary.totalNet)}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {run.status === 'draft' && (
                <button onClick={(e) => { e.stopPropagation(); handleDelete(run._id); }} className="p-2 text-dark-400 hover:text-red-400"><Trash2 size={16} /></button>
              )}
            </div>
          </div>
        ))}
        {runs.length === 0 && <div className="text-center py-12 text-dark-500">No intern payroll runs yet. Create one to get started.</div>}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-xs">
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <h2 className="text-base font-semibold text-white">New Intern Payroll Run</h2>
              <button onClick={() => setShowCreate(false)} className="text-dark-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-dark-400 mb-1">Month</label>
                  <select value={newMonth} onChange={e => setNewMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
                    {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs text-dark-400 mb-1">Year</label>
                  <input type="number" value={newYear} onChange={e => setNewYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none" min="2024" max="2030" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button onClick={handleCreate} className="flex-1 px-3 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
