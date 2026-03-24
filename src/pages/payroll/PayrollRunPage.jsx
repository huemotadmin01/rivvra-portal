import React, { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  getPayrollRuns, getPayrollRun, createPayrollRun, processPayrollRun,
  finalizePayrollRun, unfinalizePayrollRun, markPayrollRunPaid, deletePayrollRun,
  downloadPFChallan, downloadESIChallan, downloadPTChallan,
  lockInputs, unlockInputs, lockPayroll, unlockPayroll,
  releasePayslips, holdPayslips,
  setAdHocAdjustment, createSalaryHold, releaseSalaryHold,
  downloadPayslipPdf, downloadAllPayslips, downloadBankTransfer, downloadPayrollExport, downloadPayrollSheet,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import {
  Plus, Play, CheckCircle, Lock, Unlock, Trash2, ArrowLeft, Download,
  Edit2, X, FileText, IndianRupee, Eye, EyeOff, Banknote, FileSpreadsheet,
  AlertTriangle, XCircle, Undo2, ChevronDown, ChevronUp, PauseCircle, Send, Loader2,
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

export default function PayrollRunPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdHoc, setShowAdHoc] = useState(null);
  const [adHocForm, setAdHocForm] = useState({ earnings: [], deductions: [] });
  const [processing, setProcessing] = useState(false);
  const [savingAdHoc, setSavingAdHoc] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);
  const [empTypeFilter, setEmpTypeFilter] = useState('all');
  const [showHoldModal, setShowHoldModal] = useState(null); // { employeeId, employeeName }
  const [holdReason, setHoldReason] = useState('');
  const [savingHold, setSavingHold] = useState(false);
  const [releasingHoldId, setReleasingHoldId] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseSelection, setReleaseSelection] = useState(new Set());
  const [releasing, setReleasing] = useState(false);

  const now = new Date();
  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);
  const [newYear, setNewYear] = useState(now.getFullYear());

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await getPayrollRuns(orgSlug);
      setRuns(res.runs || []);
    } catch (err) { showToast(err.response?.data?.message || 'Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  const loadRun = async (id) => {
    try {
      const res = await getPayrollRun(orgSlug, id);
      setSelectedRun(res.run);
    } catch (err) { showToast(err.response?.data?.message || 'Failed to load run', 'error'); }
  };

  useEffect(() => { loadRuns(); }, [orgSlug]);

  const handleCreate = async () => {
    try {
      const res = await createPayrollRun(orgSlug, { month: newMonth, year: newYear });
      showToast('Payroll run created');
      setShowCreate(false);
      loadRuns();
      loadRun(res.run._id);
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleProcess = async () => {
    if (!selectedRun) return;
    setProcessing(true);
    try {
      const res = await processPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast(`Processed ${res.run.items?.length || 0} employees`);
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setProcessing(false); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize this payroll run? No further edits will be allowed.')) return;
    try {
      const res = await finalizePayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Finalized');
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleUnfinalize = async () => {
    if (!confirm('Revert to processed? This will allow re-processing and edits.')) return;
    try {
      const res = await unfinalizePayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Reverted to processed');
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleMarkPaid = async () => {
    try {
      const res = await markPayrollRunPaid(orgSlug, selectedRun._id, {});
      setSelectedRun(res.run);
      showToast('Marked as paid');
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this draft payroll run?')) return;
    try {
      await deletePayrollRun(orgSlug, id);
      showToast('Deleted');
      if (selectedRun?._id === id) setSelectedRun(null);
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  // Lock/Unlock handlers
  const handleToggleLock = async (type) => {
    try {
      const run = selectedRun;
      let res;
      if (type === 'inputs') {
        res = run.inputsLocked ? await unlockInputs(orgSlug, run._id) : await lockInputs(orgSlug, run._id);
      } else {
        res = run.payrollLocked ? await unlockPayroll(orgSlug, run._id) : await lockPayroll(orgSlug, run._id);
      }
      setSelectedRun(res.run);
      showToast(`${type === 'inputs' ? 'Inputs' : 'Payroll'} ${res.run[type === 'inputs' ? 'inputsLocked' : 'payrollLocked'] ? 'locked' : 'unlocked'}`);
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  // Release/Hold payslips
  const handleToggleRelease = async () => {
    try {
      const run = selectedRun;
      const res = run.payslipReleased
        ? await holdPayslips(orgSlug, run._id)
        : await releasePayslips(orgSlug, run._id);
      setSelectedRun(res.run);
      showToast(res.run.payslipReleased ? 'Payslips released to employees' : 'Payslips held');
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  // Ad-hoc adjustment
  const openAdHoc = (item) => {
    const existing = (selectedRun.adHocAdjustments || []).find(a => a.employeeId === item.employeeId);
    setAdHocForm({
      earnings: existing?.earnings || [{ label: '', amount: 0 }],
      deductions: existing?.deductions || [{ label: '', amount: 0 }],
    });
    setShowAdHoc(item);
  };

  const handleSaveAdHoc = async () => {
    setSavingAdHoc(true);
    try {
      const cleanEarnings = adHocForm.earnings.filter(e => e.label && e.amount > 0);
      const cleanDeductions = adHocForm.deductions.filter(d => d.label && d.amount > 0);
      await setAdHocAdjustment(orgSlug, selectedRun._id, showAdHoc.employeeId, {
        earnings: cleanEarnings, deductions: cleanDeductions,
      });
      // Auto re-process to recalculate net pay with ad-hoc applied (modal stays open with spinner)
      const processRes = await processPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(processRes.run);
      setShowAdHoc(null);
      showToast('Adjustment applied & payroll recalculated');
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSavingAdHoc(false); }
  };

  // Salary Hold
  const handleCreateHold = async () => {
    if (!showHoldModal || !holdReason.trim()) return;
    setSavingHold(true);
    try {
      const holdRes = await createSalaryHold(orgSlug, selectedRun._id, showHoldModal.employeeId, holdReason.trim());
      const updatedRun = { ...selectedRun, items: (selectedRun.items || []).map(i =>
        i.employeeId === showHoldModal.employeeId ? { ...i, salaryHold: holdRes.hold } : i
      )};
      setSelectedRun(updatedRun);
      setShowHoldModal(null);
      setHoldReason('');
      showToast('Salary hold applied');
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSavingHold(false); }
  };

  const handleReleaseHold = async (holdId) => {
    setReleasingHoldId(holdId);
    try {
      await releaseSalaryHold(orgSlug, selectedRun._id, holdId);
      const updatedRun = { ...selectedRun, items: (selectedRun.items || []).map(i =>
        i.salaryHold?._id === holdId ? { ...i, salaryHold: null } : i
      )};
      setSelectedRun(updatedRun);
      showToast('Hold released');
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setReleasingHoldId(null); }
  };

  // Release payslips with employee selection
  const openReleaseModal = () => {
    const items = selectedRun?.items || [];
    setReleaseSelection(new Set(items.map(i => i.employeeId)));
    setShowReleaseModal(true);
  };

  const handleReleasePayslips = async () => {
    setReleasing(true);
    try {
      const employeeIds = [...releaseSelection];
      const res = await releasePayslips(orgSlug, selectedRun._id, employeeIds);
      setSelectedRun(res.run);
      setShowReleaseModal(false);
      showToast(`Payslips released for ${employeeIds.length} employees`);
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setReleasing(false); }
  };

  // Download helpers
  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async (type) => {
    try {
      let blob, filename;
      if (type === 'pf') {
        blob = await downloadPFChallan(orgSlug, selectedRun._id);
        filename = `PF_ECR_${selectedRun.month}_${selectedRun.year}.txt`;
      } else if (type === 'esi') {
        blob = await downloadESIChallan(orgSlug, selectedRun._id);
        filename = `ESI_${selectedRun.month}_${selectedRun.year}.csv`;
      } else if (type === 'pt') {
        blob = await downloadPTChallan(orgSlug, selectedRun._id, '');
        filename = `PT_${selectedRun.month}_${selectedRun.year}.csv`;
      } else if (type === 'bank') {
        blob = await downloadBankTransfer(orgSlug, selectedRun._id);
        filename = `Bank_Transfer_${selectedRun.month}_${selectedRun.year}.csv`;
      } else if (type === 'payslips') {
        blob = await downloadAllPayslips(orgSlug, selectedRun._id);
        filename = `Payslips_${selectedRun.month}_${selectedRun.year}.zip`;
      }
      triggerDownload(blob, filename);
      showToast(`Downloaded ${type}`);
    } catch (err) { showToast('Download failed', 'error'); }
  };

  const handleDownloadPayslip = async (employeeId, name) => {
    try {
      const blob = await downloadPayslipPdf(orgSlug, selectedRun._id, employeeId);
      triggerDownload(blob, `Payslip_${name.replace(/\s+/g, '_')}_${MONTHS[selectedRun.month]}_${selectedRun.year}.pdf`);
    } catch (err) { showToast('Download failed', 'error'); }
  };

  const handleExport = async (type) => {
    try {
      let blob;
      if (type === 'payroll-sheet') {
        blob = await downloadPayrollSheet(orgSlug, selectedRun._id);
        triggerDownload(blob, `Payroll_${MONTHS[selectedRun.month]}_${selectedRun.year}.xlsx`);
      } else {
        blob = await downloadPayrollExport(orgSlug, selectedRun._id, type);
        triggerDownload(blob, `${type}_${MONTHS[selectedRun.month]}_${selectedRun.year}.xlsx`);
      }
      showToast(`${type} exported`);
    } catch (err) { showToast('Export failed', 'error'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  // Detail view
  if (selectedRun) {
    const run = selectedRun;
    const items = run.items || [];
    const summary = run.summary || {};
    // Exclude contractors from PF/CTC totals (they have no statutory deductions)
    const statutoryItems = items.filter(i => i.payrollMode !== 'contractor');
    const contractorItems = items.filter(i => i.payrollMode === 'contractor');
    const computedTotalPf = statutoryItems.reduce((s, i) => s + (i.employeePf || 0) + (i.employerPf || 0), 0);
    const computedTotalCtc = statutoryItems.reduce((s, i) => s + (i.totalCtc || 0), 0);

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedRun(null)} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{MONTHS[run.month]} {run.year}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status]}`}>{run.status}</span>
              {run.inputsLocked && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400">Inputs Locked</span>}
              {run.payrollLocked && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400">Payroll Locked</span>}
              {run.payslipReleased && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400">Released</span>}
            </div>
            <p className="text-sm text-dark-400">
              FY {run.financialYear} | {statutoryItems.length} employees{contractorItems.length > 0 && <>, {contractorItems.length} contractors</>}
              {summary.stoppedEmployees > 0 && <span className="text-amber-400"> | {summary.stoppedEmployees} stopped</span>}
              {summary.totalLopDays > 0 && <span className="text-red-400"> | {summary.totalLopDays} LOP days</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {run.status === 'draft' && (
              <button onClick={handleProcess} disabled={processing} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm disabled:opacity-50">
                {processing ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" /> : <Play size={14} />}
                {processing ? 'Processing...' : 'Process'}
              </button>
            )}
            {run.status === 'processed' && (
              <>
                {!run.payrollLocked && (
                  <button onClick={handleProcess} disabled={processing} className="flex items-center gap-2 px-3 py-2 border border-dark-600 text-dark-300 rounded-lg hover:bg-dark-700 text-sm disabled:opacity-50">
                    {processing ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-dark-300/30 border-t-dark-300" /> : <Play size={14} />}
                    {processing ? 'Processing...' : 'Re-process'}
                  </button>
                )}
                <button onClick={handleFinalize} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
                  <Lock size={14} /> Finalize
                </button>
              </>
            )}
            {run.status === 'finalized' && (
              <>
                <button onClick={handleUnfinalize} className="flex items-center gap-2 px-3 py-2 border border-dark-600 text-dark-300 rounded-lg hover:bg-dark-700 text-sm">
                  <Undo2 size={14} /> Unfinalize
                </button>
                <button onClick={handleMarkPaid} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <CheckCircle size={14} /> Mark Paid
                </button>
              </>
            )}
          </div>
        </div>

        {/* Action Bar */}
        {['processed', 'finalized', 'paid'].includes(run.status) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {/* Lock Controls */}
            <button onClick={() => handleToggleLock('inputs')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${run.inputsLocked ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-dark-600 text-dark-300 hover:bg-dark-700'}`}>
              {run.inputsLocked ? <Unlock size={12} /> : <Lock size={12} />}
              {run.inputsLocked ? 'Unlock Inputs' : 'Lock Inputs'}
            </button>
            <button onClick={() => handleToggleLock('payroll')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${run.payrollLocked ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-dark-600 text-dark-300 hover:bg-dark-700'}`}>
              {run.payrollLocked ? <Unlock size={12} /> : <Lock size={12} />}
              {run.payrollLocked ? 'Unlock Payroll' : 'Lock Payroll'}
            </button>
            {/* Release/Hold */}
            {run.payslipReleased ? (
              <button onClick={handleToggleRelease} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-green-500/30 text-green-400 hover:bg-green-500/10">
                <EyeOff size={12} /> Hold Payslips
              </button>
            ) : (
              <button onClick={openReleaseModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-dark-600 text-dark-300 hover:bg-dark-700">
                <Send size={12} /> Release Payslips
              </button>
            )}
            <div className="border-l border-dark-700 mx-1" />
            {/* Downloads */}
            <button onClick={() => handleDownload('pf')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="PF ECR"><FileText size={12} /> PF</button>
            <button onClick={() => handleDownload('esi')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="ESI CSV"><Download size={12} /> ESI</button>
            <button onClick={() => handleDownload('pt')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="PT CSV"><IndianRupee size={12} /> PT</button>
            {['finalized', 'paid'].includes(run.status) && (
              <button onClick={() => handleDownload('bank')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="Bank Transfer CSV"><Banknote size={12} /> Bank CSV</button>
            )}
            <button onClick={() => handleDownload('payslips')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="Download all payslips as ZIP"><FileText size={12} /> All Payslips</button>
            <div className="border-l border-dark-700 mx-1" />
            <button onClick={() => handleExport('payroll-sheet')} className="flex items-center gap-1.5 px-3 py-1.5 bg-rivvra-600/20 border border-rivvra-500/30 rounded-lg text-xs text-rivvra-400 hover:bg-rivvra-600/30" title="Full payroll Excel with all employees & deductions"><Download size={12} /> Payroll Sheet</button>
          </div>
        )}

        {/* Summary Cards */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total Gross', value: items.reduce((s, i) => s + (i.grossSalary || 0), 0), color: 'text-white' },
              { label: 'Total PF', value: computedTotalPf, color: 'text-blue-400', sub: `(${statutoryItems.length} statutory)` },
              { label: 'Total Deductions', value: items.reduce((s, i) => s + (i.totalDeductions || 0), 0), color: 'text-red-400' },
              { label: 'Total Net', value: items.reduce((s, i) => s + (i.netSalary || 0), 0), color: 'text-green-400' },
              { label: 'Total CTC', value: computedTotalCtc || ((summary.totalGross || 0) + (summary.totalEmployerCost || 0)), color: 'text-purple-400', sub: contractorItems.length > 0 ? `(excl. contractors)` : '' },
            ].map(card => (
              <div key={card.label} className="bg-dark-800 border border-dark-700 rounded-lg p-3">
                <div className="text-xs text-dark-400 mb-1">{card.label}</div>
                <div className={`text-lg font-semibold ${card.color}`}>{fmt(card.value)}</div>
                {card.sub && <div className="text-[9px] text-dark-500 mt-0.5">{card.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Filter Tabs */}
        {items.length > 0 && (() => {
          // Dynamic tabs — auto-detect all employment types from items
          const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultants', external_consultant: 'External Consultants', intern: 'Interns' };
          const typeCounts = {};
          for (const i of items) {
            const key = i.payrollMode === 'contractor' ? (i.employmentType || 'external_consultant') : (i.employmentType || 'confirmed');
            typeCounts[key] = (typeCounts[key] || 0) + 1;
          }
          const tabs = [
            { key: 'all', label: 'All', count: items.length },
            ...Object.entries(typeCounts).map(([key, count]) => ({
              key,
              label: typeLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              count,
            })),
          ];
          return (
            <div className="flex gap-1 mb-4 flex-wrap">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setEmpTypeFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    empTypeFilter === tab.key
                      ? 'bg-rivvra-600/20 text-rivvra-400 border border-rivvra-500/30'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-750 border border-transparent'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          );
        })()}

        {/* Employee Table */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-dark-700">
                {['Employee', 'Days', 'LOP', 'Gross', 'PF (Total)', 'TDS', 'Deductions', 'Net', 'CTC', ''].map(h => (
                  <th key={h || 'actions'} className="px-3 py-3 text-dark-400 font-medium text-left text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.filter(item => {
                if (empTypeFilter === 'all') return true;
                const itemType = item.payrollMode === 'contractor' ? (item.employmentType || 'external_consultant') : (item.employmentType || 'confirmed');
                return itemType === empTypeFilter;
              }).map(item => {
                const isExpanded = expandedItem === item.employeeId;
                return (
                  <React.Fragment key={item.employeeId}>
                    <tr
                      onClick={() => setExpandedItem(isExpanded ? null : item.employeeId)}
                      className={`border-b border-dark-700/50 hover:bg-dark-750 cursor-pointer transition-colors ${item.isOverridden ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-white text-xs font-medium">{item.employeeName}</span>
                          {/* Status badges only */}
                          {item.payrollMode === 'contractor' && item.timesheetStatus === 'not_submitted' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400" title="No approved timesheet">
                              <XCircle size={9} /> No Timesheet
                            </span>
                          )}
                          {item.payrollMode !== 'contractor' && item.attendanceStatus === 'pending' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400" title="Attendance pending">
                              <AlertTriangle size={9} /> Pending
                            </span>
                          )}
                          {item.payrollMode !== 'contractor' && item.attendanceStatus === 'not_submitted' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400" title="Attendance not submitted">
                              <XCircle size={9} /> No Attendance
                            </span>
                          )}
                          {item.salaryHold && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/10 text-orange-400" title={item.salaryHold.reason}>
                              <PauseCircle size={9} /> On Hold
                            </span>
                          )}
                        </div>
                        {(item.adHocEarnings?.length > 0 || item.adHocDeductions?.length > 0) && <span className="text-[9px] text-blue-400">Ad-hoc</span>}
                      </td>
                      <td className="px-3 py-2.5 text-dark-300 text-xs">{item.effectiveDays}/{item.totalWorkingDays}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.lopDays > 0 ? <span className="text-red-400">{item.lopDays}</span> : <span className="text-dark-500">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-white text-xs font-medium">{fmt(item.grossSalary)}</td>
                      <td className="px-3 py-2.5 text-blue-400 text-xs">{item.payrollMode === 'intern_no_deduction' || item.payrollMode === 'consultant_flat_tds' || item.payrollMode === 'contractor' ? '—' : fmt((item.employeePf || 0) + (item.employerPf || 0))}</td>
                      <td className="px-3 py-2.5 text-dark-300 text-xs">{fmt(item.tds)}</td>
                      <td className="px-3 py-2.5 text-red-400 text-xs">{fmt(item.totalDeductions)}</td>
                      <td className="px-3 py-2.5 text-green-400 text-xs font-medium">{fmt(item.netSalary)}</td>
                      <td className="px-3 py-2.5 text-purple-400 text-xs font-medium">{fmt(item.totalCtc)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center">
                          {isExpanded ? <ChevronUp size={14} className="text-dark-400" /> : <ChevronDown size={14} className="text-dark-400" />}
                        </div>
                      </td>
                    </tr>

                    {/* Accordion expanded section */}
                    {isExpanded && (() => {
                      // Read ad-hoc from run.adHocAdjustments (live) instead of stale item data
                      const liveAdHoc = (run.adHocAdjustments || []).find(a => a.employeeId === item.employeeId);
                      const liveEarnings = liveAdHoc?.earnings?.filter(e => e.label && e.amount > 0) || [];
                      const liveDeductions = liveAdHoc?.deductions?.filter(d => d.label && d.amount > 0) || [];
                      const adHocEarningsTotal = liveEarnings.reduce((s, e) => s + (e.amount || 0), 0);
                      const adHocDeductionsTotal = liveDeductions.reduce((s, d) => s + (d.amount || 0), 0);
                      // Recalculate display values with live ad-hoc
                      const baseGross = item.grossSalary - (item.adHocEarnings || []).reduce((s, e) => s + (e.amount || 0), 0);
                      const displayGross = baseGross + adHocEarningsTotal;
                      const baseDeductions = item.totalDeductions - (item.otherDeductions || 0);
                      const displayDeductions = baseDeductions + adHocDeductionsTotal;
                      const displayNet = Math.max(0, displayGross - displayDeductions);

                      return (
                      <tr>
                        <td colSpan="10" className="p-0">
                          <div className="border-t border-dark-800 bg-dark-950/50 p-4 sm:p-6 space-y-4">
                            {/* Mid-month transition banner */}
                            {item.hasTransition && item.transitions && (
                              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-2">
                                <p className="text-xs font-medium text-blue-400 mb-2">
                                  Mid-Month Transition: {item.transitions.map(t => {
                                    const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultant', external_consultant: 'External Consultant', intern: 'Intern' };
                                    return typeLabels[t.employmentType] || t.employmentType;
                                  }).join(' → ')}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {item.transitions.map((t, ti) => {
                                    const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultant', extern_consultant: 'External Consultant', intern: 'Intern' };
                                    return (
                                      <div key={ti} className="bg-dark-900/50 rounded-lg p-2.5 space-y-1">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[10px] font-medium text-dark-300">{t.period} ({typeLabels[t.employmentType] || t.employmentType})</span>
                                          <span className="text-[10px] text-dark-500">{t.daysWorked}/{t.totalDays} days</span>
                                        </div>
                                        {(t.components || []).map((c, ci) => (
                                          <div key={ci} className="flex justify-between text-xs">
                                            <span className="text-dark-500">{c.name}</span>
                                            <span className="text-dark-300">₹{fmt(c.proratedAmount || c.fullAmount)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between text-xs font-medium border-t border-dark-700/50 pt-1 mt-1">
                                          <span className="text-dark-400">Gross</span>
                                          <span className="text-white">₹{fmt(t.grossSalary)}</span>
                                        </div>
                                        {t.employeePf > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">Employee PF</span><span className="text-red-400">-₹{fmt(t.employeePf)}</span></div>}
                                        {t.employeeEsi > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">ESI</span><span className="text-red-400">-₹{fmt(t.employeeEsi)}</span></div>}
                                        {t.professionalTax > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">PT</span><span className="text-red-400">-₹{fmt(t.professionalTax)}</span></div>}
                                        {t.tds > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">TDS</span><span className="text-red-400">-₹{fmt(t.tds)}</span></div>}
                                        <div className="flex justify-between text-xs font-medium border-t border-dark-700/50 pt-1">
                                          <span className="text-dark-400">Net</span>
                                          <span className="text-green-400">₹{fmt(t.netSalary)}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-blue-500/20">
                                  <span className="text-blue-300">Combined Net Pay</span>
                                  <span className="text-green-400">₹{fmt(displayNet)}</span>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Left — Earnings & Deductions */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Earnings & Deductions</h4>
                                <div className="bg-dark-900 rounded-lg p-3 space-y-1.5 text-sm">
                                  {/* Earnings — Component breakdown */}
                                  <div className="text-[10px] text-dark-500 uppercase tracking-wider">Earnings</div>
                                  {(item.components || []).map((c, ci) => (
                                    <div key={c.name || ci} className="flex justify-between">
                                      <span className="text-dark-400">{c.name}</span>
                                      <span className="text-dark-200">
                                        {item.prorationFactor < 1 ? (
                                          <>
                                            <span className="text-dark-500 line-through mr-1.5 text-xs">₹{fmt(c.fullAmount)}</span>
                                            ₹{fmt(c.proratedAmount)}
                                          </>
                                        ) : (
                                          <>₹{fmt(c.proratedAmount || c.fullAmount)}</>
                                        )}
                                      </span>
                                    </div>
                                  ))}

                                  {/* Ad-hoc earnings (live from run) */}
                                  {liveEarnings.map((a, i) => (
                                    <div key={`e-${i}`} className="flex justify-between">
                                      <span className="text-dark-400 text-xs">{a.label}</span>
                                      <span className="text-emerald-400 text-xs">+₹{fmt(a.amount)}</span>
                                    </div>
                                  ))}

                                  {/* Contractor-specific fields */}
                                  {item.payrollMode === 'contractor' && (
                                    <>
                                      {item.payType && (
                                        <div className="flex justify-between">
                                          <span className="text-dark-500 text-xs">Pay Type</span>
                                          <span className="text-dark-400 text-xs capitalize">{item.payType}</span>
                                        </div>
                                      )}
                                      {item.rate > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-dark-500 text-xs">Rate</span>
                                          <span className="text-dark-400 text-xs">₹{fmt(item.rate)}/{item.payType === 'daily' ? 'day' : 'month'}</span>
                                        </div>
                                      )}
                                      {item.projects?.length > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-dark-500 text-xs">Projects</span>
                                          <span className="text-dark-400 text-xs">{item.projects.join(', ')}</span>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* Working days */}
                                  <div className="flex justify-between">
                                    <span className="text-dark-500 text-xs">{item.payrollMode === 'contractor' ? 'Timesheet Days' : 'Working Days'}</span>
                                    <span className="text-dark-400 text-xs">{item.effectiveDays} of {item.totalWorkingDays}</span>
                                  </div>
                                  {item.lopDays > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-500 text-xs">LOP Days</span>
                                      <span className="text-red-400 text-xs">{item.lopDays}</span>
                                    </div>
                                  )}

                                  <hr className="border-dark-800 my-1" />
                                  <div className="flex justify-between font-medium">
                                    <span className="text-dark-300">Total Earnings</span>
                                    <span className="text-white">₹{fmt(displayGross)}</span>
                                  </div>

                                  <hr className="border-dark-800 my-1" />

                                  {/* Deductions */}
                                  <div className="text-[10px] text-dark-500 uppercase tracking-wider">Deductions</div>
                                  {item.employeePf > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employee PF</span>
                                      <span className="text-red-400">₹{fmt(item.employeePf)}</span>
                                    </div>
                                  )}
                                  {item.employerPf > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employer PF</span>
                                      <span className="text-red-400">₹{fmt(item.employerPf)}</span>
                                    </div>
                                  )}
                                  {item.employeeEsi > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employee ESI</span>
                                      <span className="text-red-400">₹{fmt(item.employeeEsi)}</span>
                                    </div>
                                  )}
                                  {item.employerEsi > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employer ESI</span>
                                      <span className="text-red-400">₹{fmt(item.employerEsi)}</span>
                                    </div>
                                  )}
                                  {item.professionalTax > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Professional Tax</span>
                                      <span className="text-red-400">₹{fmt(item.professionalTax)}</span>
                                    </div>
                                  )}
                                  {item.tds > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">TDS (Income Tax)</span>
                                      <span className="text-red-400">₹{fmt(item.tds)}</span>
                                    </div>
                                  )}

                                  {/* Ad-hoc deductions (live from run) */}
                                  {liveDeductions.map((a, i) => (
                                    <div key={`d-${i}`} className="flex justify-between">
                                      <span className="text-dark-400 text-xs">{a.label}</span>
                                      <span className="text-red-400 text-xs">₹{fmt(a.amount)}</span>
                                    </div>
                                  ))}


                                  <hr className="border-dark-800 my-1" />
                                  <div className="flex justify-between font-medium">
                                    <span className="text-dark-300">Total Deductions</span>
                                    <span className="text-red-400">₹{fmt(displayDeductions)}</span>
                                  </div>

                                  <hr className="border-dark-800 my-1" />

                                  {/* Net Pay */}
                                  <div className="flex justify-between font-bold text-base">
                                    <span className="text-dark-200">Net Pay</span>
                                    <span className="text-emerald-400">₹{fmt(displayNet)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Right — Bank Details */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Bank Details</h4>
                                <div className="bg-dark-900 rounded-lg p-3 space-y-1.5 text-sm">
                                  <div className="flex justify-between"><span className="text-dark-400">Bank</span><span className="text-dark-200">{item.bankDetails?.bankName || '—'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">A/c No.</span><span className="text-dark-200">{item.bankDetails?.accountNumber || '—'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">IFSC</span><span className="text-dark-200">{item.bankDetails?.ifsc || '—'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">PAN</span><span className="text-dark-200">{item.panNumber || '—'}</span></div>
                                </div>
                                {item.disbursementDate && (
                                  <div className="bg-dark-900 rounded-lg p-3 text-sm mt-2">
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Disbursement Date</span>
                                      <span className="text-dark-200">
                                        {new Date(item.disbursementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Salary Hold Banner */}
                            {item.salaryHold && (
                              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-medium text-orange-400">Salary On Hold</p>
                                  <p className="text-xs text-dark-400 mt-0.5">{item.salaryHold.reason}</p>
                                </div>
                                {run.status !== 'paid' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleReleaseHold(item.salaryHold._id); }}
                                    disabled={releasingHoldId === item.salaryHold._id}
                                    className="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                  >
                                    {releasingHoldId === item.salaryHold._id && <Loader2 size={12} className="animate-spin" />}
                                    {releasingHoldId === item.salaryHold._id ? 'Releasing...' : 'Release Hold'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {['processed', 'finalized', 'paid'].includes(run.status) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDownloadPayslip(item.employeeId, item.employeeName); }}
                                  className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors"
                                >
                                  <Download size={12} /> Download Payslip
                                </button>
                              )}
                              {['draft', 'processed'].includes(run.status) && !run.inputsLocked && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openAdHoc(item); }}
                                  className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors"
                                >
                                  <Plus size={12} /> Ad-hoc Adjustment
                                </button>
                              )}
                              {!item.salaryHold && run.status !== 'paid' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowHoldModal({ employeeId: item.employeeId, employeeName: item.employeeName }); }}
                                  className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors"
                                >
                                  <PauseCircle size={12} /> Hold Salary
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && <div className="text-center py-12 text-dark-500">No items. Process the payroll to calculate.</div>}
        </div>

        {/* Ad-Hoc Adjustment Modal */}
        {showAdHoc && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <div>
                  <h2 className="text-base font-semibold text-white">Ad-hoc Adjustments</h2>
                  <p className="text-xs text-dark-400">{showAdHoc.employeeName}</p>
                </div>
                <button onClick={() => setShowAdHoc(null)} className="text-dark-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-4">
                {/* Earnings */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-dark-300">Earnings (Bonus, Incentive, etc.)</label>
                    <button onClick={() => setAdHocForm(f => ({ ...f, earnings: [...f.earnings, { label: '', amount: 0 }] }))} className="text-[10px] text-rivvra-400 hover:text-rivvra-300">+ Add</button>
                  </div>
                  {adHocForm.earnings.map((e, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input type="text" placeholder="Label" value={e.label} onChange={ev => { const n = [...adHocForm.earnings]; n[i].label = ev.target.value; setAdHocForm(f => ({ ...f, earnings: n })); }}
                        className="flex-1 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white focus:border-rivvra-500 focus:outline-none" />
                      <input type="number" placeholder="Amount" value={e.amount} onChange={ev => { const n = [...adHocForm.earnings]; n[i].amount = Number(ev.target.value); setAdHocForm(f => ({ ...f, earnings: n })); }}
                        className="w-24 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white focus:border-rivvra-500 focus:outline-none" />
                      <button onClick={() => { const n = adHocForm.earnings.filter((_, j) => j !== i); setAdHocForm(f => ({ ...f, earnings: n })); }} className="text-dark-500 hover:text-red-400"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                {/* Deductions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-dark-300">Deductions</label>
                    <button onClick={() => setAdHocForm(f => ({ ...f, deductions: [...f.deductions, { label: '', amount: 0 }] }))} className="text-[10px] text-rivvra-400 hover:text-rivvra-300">+ Add</button>
                  </div>
                  {adHocForm.deductions.map((d, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input type="text" placeholder="Label" value={d.label} onChange={ev => { const n = [...adHocForm.deductions]; n[i].label = ev.target.value; setAdHocForm(f => ({ ...f, deductions: n })); }}
                        className="flex-1 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white focus:border-rivvra-500 focus:outline-none" />
                      <input type="number" placeholder="Amount" value={d.amount} onChange={ev => { const n = [...adHocForm.deductions]; n[i].amount = Number(ev.target.value); setAdHocForm(f => ({ ...f, deductions: n })); }}
                        className="w-24 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white focus:border-rivvra-500 focus:outline-none" />
                      <button onClick={() => { const n = adHocForm.deductions.filter((_, j) => j !== i); setAdHocForm(f => ({ ...f, deductions: n })); }} className="text-dark-500 hover:text-red-400"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdHoc(null)} disabled={savingAdHoc} className="flex-1 px-3 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 disabled:opacity-50">Cancel</button>
                  <button onClick={handleSaveAdHoc} disabled={savingAdHoc} className="flex-1 px-3 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {savingAdHoc && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
                    {savingAdHoc ? 'Saving & Recalculating...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Salary Hold Modal */}
        {showHoldModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <div>
                  <h2 className="text-base font-semibold text-white">Hold Salary</h2>
                  <p className="text-xs text-dark-400">{showHoldModal.employeeName}</p>
                </div>
                <button onClick={() => setShowHoldModal(null)} className="text-dark-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Reason for hold</label>
                  <input type="text" value={holdReason} onChange={e => setHoldReason(e.target.value)}
                    className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-white focus:border-rivvra-500 focus:outline-none"
                    placeholder="e.g., Client payment pending" autoFocus />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowHoldModal(null)} className="flex-1 px-3 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                  <button onClick={handleCreateHold} disabled={!holdReason.trim() || savingHold} className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {savingHold && <Loader2 size={14} className="animate-spin" />}
                    {savingHold ? 'Holding...' : 'Hold'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Release Payslips Modal */}
        {showReleaseModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <h2 className="text-base font-semibold text-white">Release Payslips</h2>
                <button onClick={() => setShowReleaseModal(false)} className="text-dark-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-dark-400">{releaseSelection.size} of {items.length} selected</span>
                  <div className="flex gap-2">
                    <button onClick={() => setReleaseSelection(new Set(items.map(i => i.employeeId)))} className="text-[10px] text-rivvra-400 hover:text-rivvra-300">Select All</button>
                    <button onClick={() => setReleaseSelection(new Set())} className="text-[10px] text-dark-400 hover:text-dark-300">Deselect All</button>
                  </div>
                </div>
                {items.map(item => (
                  <label key={item.employeeId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-750 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={releaseSelection.has(item.employeeId)}
                      onChange={() => {
                        const next = new Set(releaseSelection);
                        next.has(item.employeeId) ? next.delete(item.employeeId) : next.add(item.employeeId);
                        setReleaseSelection(next);
                      }}
                      className="rounded border-dark-600"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-white">{item.employeeName}</span>
                      {item.salaryHold && <span className="text-[9px] text-orange-400 ml-2">On Hold</span>}
                    </div>
                    <span className="text-xs text-green-400">₹{fmt(item.netSalary)}</span>
                  </label>
                ))}
                <div className="flex gap-3 pt-3">
                  <button onClick={() => setShowReleaseModal(false)} className="flex-1 px-3 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                  <button onClick={handleReleasePayslips} disabled={releasing || releaseSelection.size === 0} className="flex-1 px-3 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {releasing && <Loader2 size={14} className="animate-spin" />}
                    {releasing ? 'Releasing...' : `Release (${releaseSelection.size})`}
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Run Payroll</h1>
          <p className="text-sm text-dark-400 mt-1">Monthly payroll for all employees & contractors</p>
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
                {run.payslipReleased && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400">Released</span>}
                {run.payrollLocked && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400">Locked</span>}
              </div>
              <div className="text-xs text-dark-400 mt-1">
                FY {run.financialYear}
                {run.summary?.totalEmployees ? ` | ${run.summary.totalEmployees} employees` : ''}
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
        {runs.length === 0 && <div className="text-center py-12 text-dark-500">No payroll runs yet. Create one to get started.</div>}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-xs">
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <h2 className="text-base font-semibold text-white">New Payroll Run</h2>
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
