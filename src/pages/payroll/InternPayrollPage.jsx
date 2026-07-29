import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import {
  getInternPayrollRuns, getInternPayrollRun, createInternPayrollRun, processInternPayrollRun,
  finalizeInternPayrollRun, markInternPayrollRunPaid, deleteInternPayrollRun,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import {
  Plus, Play, CheckCircle, Lock, Trash2, ArrowLeft, X, AlertTriangle, Loader2,
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
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showMarkPaidConfirm, setShowMarkPaidConfirm] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const now = new Date();
  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);
  const [newYear, setNewYear] = useState(now.getFullYear());

  // `preserveSelection` keeps the open detail view across an action-triggered
  // refresh. The default still hard-resets the selection so the org/company
  // switch effect can't leave a previous company's run on screen.
  const loadRuns = async ({ preserveSelection = false } = {}) => {
    if (!preserveSelection) {
      setLoading(true);
      setRuns([]);
      setSelectedRun(null);
      setLoadError(null);
    }
    try {
      const res = await getInternPayrollRuns(orgSlug);
      setRuns(res.runs || []);
    } catch (err) {
      if (!preserveSelection) setLoadError(err.response?.data?.message || 'Failed to load intern payroll runs');
      showToast('Failed to load', 'error');
    }
    finally { if (!preserveSelection) setLoading(false); }
  };

  const loadRun = async (id) => {
    try {
      const res = await getInternPayrollRun(orgSlug, id);
      setSelectedRun(res.run);
    } catch (err) { showToast('Failed to load run', 'error'); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRuns(); }, [orgSlug, currentCompany?._id]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await createInternPayrollRun(orgSlug, { month: newMonth, year: newYear });
      showToast('Intern payroll run created');
      setShowCreate(false);
      loadRuns({ preserveSelection: true });
      loadRun(res.run._id);
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setCreating(false); }
  };

  const handleProcess = async () => {
    if (!selectedRun) return;
    setProcessing(true);
    try {
      const res = await processInternPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast(`Processed ${res.run.items?.length || 0} interns`);
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setProcessing(false); }
  };

  const handleFinalize = async () => {
    if (finalizing) return;
    if (!confirm('Finalize this intern payroll run? No further edits will be allowed.')) return;
    setFinalizing(true);
    try {
      const res = await finalizeInternPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Finalized');
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setFinalizing(false); }
  };

  const handleMarkPaid = async () => {
    if (markingPaid) return;
    setMarkingPaid(true);
    try {
      const res = await markInternPayrollRunPaid(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      setShowMarkPaidConfirm(false);
      showToast('Marked as paid');
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setMarkingPaid(false); }
  };

  const handleDelete = async (id) => {
    if (deletingId) return;
    if (!confirm('Delete this draft intern payroll run?')) return;
    setDeletingId(id);
    try {
      await deleteInternPayrollRun(orgSlug, id);
      showToast('Deleted');
      if (selectedRun?._id === id) setSelectedRun(null);
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setDeletingId(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  if (loadError) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertTriangle size={24} className="text-red-400" />
      <p className="text-sm text-red-400">{loadError}</p>
      <button onClick={() => loadRuns()} className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200 hover:bg-dark-700">Retry</button>
    </div>
  );

  // Detail view
  if (selectedRun) {
    const run = selectedRun;
    const items = run.items || [];
    const summary = run.summary || {};
    // TDS rate is org-configurable (payroll settings → tdsRateByType.intern,
    // 0% by default) and stamped per item as `tdsRate`. Never hardcode 2%.
    const tdsRates = [...new Set(items.map(i => Number(i.tdsRate) || 0))];
    const tdsLabel = tdsRates.length === 1
      ? `TDS (${Math.round(tdsRates[0] * 10000) / 100}%)`
      : 'TDS';

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
                <button onClick={handleFinalize} disabled={finalizing} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
                  {finalizing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  {finalizing ? 'Finalizing...' : 'Finalize'}
                </button>
              </>
            )}
            {run.status === 'finalized' && (
              <button onClick={() => setShowMarkPaidConfirm(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
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
              { label: tdsLabel, value: summary.totalTds, color: 'text-purple-400' },
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
                {['Intern', 'Days', 'Gross', tdsLabel, 'Deductions', 'Net Pay'].map(h => (
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

        {/* Mark Paid Confirmation Modal */}
        {showMarkPaidConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !markingPaid && setShowMarkPaidConfirm(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <CheckCircle size={20} className="text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Mark Intern Payroll as Paid?</h3>
                    <p className="text-xs text-dark-400">{MONTHS[run.month]} {run.year}</p>
                  </div>
                </div>
                <p className="text-sm text-dark-300 leading-relaxed">
                  This confirms stipends for {MONTHS[run.month]} {run.year} have been disbursed.
                  Total net payout: <span className="text-green-400 font-medium">₹{fmt(summary.totalNet)}</span> across {summary.totalEmployees || items.length} intern{(summary.totalEmployees || items.length) !== 1 ? 's' : ''}.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={() => setShowMarkPaidConfirm(false)} disabled={markingPaid}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 border border-dark-700 text-dark-300 text-sm font-medium hover:bg-dark-700 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleMarkPaid} disabled={markingPaid}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {markingPaid ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    {markingPaid ? 'Marking...' : 'Mark Paid'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Intern Payroll</h1>
          <p className="text-sm text-dark-400 mt-1">Monthly payroll for interns — flat TDS only (rate from Payroll Settings)</p>
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
                <button onClick={(e) => { e.stopPropagation(); handleDelete(run._id); }} disabled={!!deletingId} className="p-2 text-dark-400 hover:text-red-400 disabled:opacity-50">
                  {deletingId === run._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
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
                <button onClick={() => setShowCreate(false)} disabled={creating} className="flex-1 px-3 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 disabled:opacity-50">Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 px-3 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
