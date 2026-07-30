import React, { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import {
  getPayrollRuns, getPayrollRun, createPayrollRun, processPayrollRun,
  finalizePayrollRun, unfinalizePayrollRun, markPayrollRunPaid, deletePayrollRun,
  downloadPFChallan, downloadESIChallan, downloadPTChallan,
  lockInputs, unlockInputs, lockPayroll, unlockPayroll,
  releasePayslips, holdPayslips,
  setAdHocAdjustment, createSalaryHold, releaseSalaryHold,
  downloadPayslipPdf, downloadAllPayslips, downloadBankTransfer, downloadPayrollExport, downloadPayrollSheet,
  downloadBankSheetHdfc, downloadBankSheetNonHdfc,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
import {
  Plus, Play, CheckCircle, Lock, Unlock, Trash2, ArrowLeft, Download,
  Edit2, X, FileText, IndianRupee, Eye, EyeOff, Banknote, FileSpreadsheet,
  AlertTriangle, XCircle, Undo2, ChevronDown, ChevronUp, PauseCircle, Send, Loader2, CalendarX,
  Search, ArrowUp, ArrowDown, Info,
} from 'lucide-react';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// `fmt` is for non-money counts only (day counts etc.). All money goes through
// the shared formatMoney() so the ₹ symbol and paise rules stay consistent.
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

// Generic HTTP status texts carry no information — fall back to our own copy.
const GENERIC_HTTP_TEXTS = new Set([
  '', 'Bad Request', 'Unauthorized', 'Payment Required', 'Forbidden', 'Not Found',
  'Conflict', 'Unprocessable Entity', 'Too Many Requests',
  'Internal Server Error', 'Bad Gateway', 'Service Unavailable', 'Gateway Timeout',
]);

/**
 * Surface the backend's actionable text (e.g. "PT not configured for state")
 * instead of a bare "Download failed".
 * NOTE: for `responseType: 'blob'` requests payrollApi's request() throws
 * `new ApiError(res.statusText, status, {})` and discards the JSON body, so
 * only the status text survives there — we detect that and use the fallback.
 */
const downloadErrorMessage = (err, fallback) => {
  const msg = err?.response?.data?.message || err?.data?.message || err?.data?.error || err?.message;
  if (!msg || GENERIC_HTTP_TEXTS.has(String(msg).trim())) return fallback;
  return `${fallback}: ${msg}`;
};

const STATUS_COLORS = {
  draft: 'bg-dark-700 text-dark-300',
  processing: 'bg-amber-500/10 text-amber-400',
  processed: 'bg-blue-500/10 text-blue-400',
  finalized: 'bg-purple-500/10 text-purple-400',
  paid: 'bg-green-500/10 text-green-400',
};

// Display casing only — the underlying status strings are untouched, so the
// state names stay the ones admins already know (draft → Draft, etc.).
const STATUS_LABELS = {
  draft: 'Draft',
  processing: 'Processing',
  processed: 'Processed',
  finalized: 'Finalized',
  paid: 'Paid',
};
const statusLabel = (s) => STATUS_LABELS[s] || String(s || '').replace(/\b\w/g, c => c.toUpperCase());

// `Locked` is the normal end state of a finished run, not an error — neutral,
// never red. Red is reserved for genuine problems (missing attendance, LOP).
const LOCKED_BADGE = 'bg-dark-700 text-dark-200 border border-dark-600';

// The employment-type bucket a row falls into. Contractors carry
// `payrollMode: 'contractor'` and default to external_consultant; everyone
// else defaults to confirmed. Shared by the tabs and the row filter so the
// two can never disagree.
const itemTypeKey = (item) => (
  item.payrollMode === 'contractor'
    ? (item.employmentType || 'external_consultant')
    : (item.employmentType || 'confirmed')
);

// Identifying fields a payroll item actually carries: employeeName and
// employeeIdCode (the human employee code, e.g. RIV-014) plus panNumber.
// NOTE: items do NOT carry an email address — the backend never puts one on
// the item (employeeName falls back to the email only when fullName is blank),
// so email search is name-search in practice.
const itemMatchesSearch = (item, needle) => {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return [item.employeeName, item.employeeIdCode, item.panNumber]
    .some(v => v && String(v).toLowerCase().includes(q));
};

// Sortable columns for the employee table. `num: true` sorts high→low on the
// first click (the useful direction for money); name sorts A→Z first.
const ROW_SORTS = {
  name: { get: i => String(i.employeeName || '').toLowerCase(), num: false },
  gross: { get: i => Number(i.grossSalary || 0), num: true },
  pf: { get: i => Number(i.employeePf || 0) + Number(i.employerPf || 0), num: true },
  tds: { get: i => Number(i.tds || 0), num: true },
  deductions: { get: i => Number(i.totalDeductions || 0), num: true },
  net: { get: i => Number(i.netSalary || 0), num: true },
  ctc: { get: i => Number(i.totalCtc || 0), num: true },
};

export default function PayrollRunPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const { month: periodMonth, year: periodYear } = usePeriod();
  const { currentCompany } = useCompany();
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
  const [empSearch, setEmpSearch] = useState('');
  // `sortKey: null` = the backend's original item order, so nothing moves on load.
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  // List-view (run index) filters — purely client-side over the loaded runs.
  const [runStatusFilter, setRunStatusFilter] = useState('all');
  const [runSearch, setRunSearch] = useState('');
  const [showHoldModal, setShowHoldModal] = useState(null); // { employeeId, employeeName }
  const [holdReason, setHoldReason] = useState('');
  const [savingHold, setSavingHold] = useState(false);
  const [releasingHoldId, setReleasingHoldId] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseSelection, setReleaseSelection] = useState(new Set());
  const [releasing, setReleasing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showMarkPaidConfirm, setShowMarkPaidConfirm] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // In-flight guards for the remaining financial / destructive actions
  const [finalizing, setFinalizing] = useState(false);
  const [unfinalizing, setUnfinalizing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingLock, setTogglingLock] = useState(null); // 'inputs' | 'payroll' | null
  const [togglingRelease, setTogglingRelease] = useState(false);

  const [newMonth, setNewMonth] = useState(periodMonth);
  const [newYear, setNewYear] = useState(periodYear);

  // `preserveSelection` keeps the open detail view (and its filter tabs /
  // expanded rows) across an action-triggered refresh. The default — used by
  // the org/company-switch effect — still hard-resets the selection so a run
  // from the previous company can never stay on screen.
  const loadRuns = async ({ preserveSelection = false } = {}) => {
    if (!preserveSelection) {
      setLoading(true);
      setRuns([]);
      setSelectedRun(null);
      setLoadError(null);
    }
    try {
      const res = await getPayrollRuns(orgSlug);
      setRuns(res.runs || []);
    } catch (err) {
      if (!preserveSelection) setLoadError(err.response?.data?.message || 'Failed to load payroll runs');
      showToast(err.response?.data?.message || 'Failed to load', 'error');
    }
    finally { if (!preserveSelection) setLoading(false); }
  };

  const loadRun = async (id) => {
    try {
      const res = await getPayrollRun(orgSlug, id);
      setSelectedRun(res.run);
    } catch (err) { showToast(err.response?.data?.message || 'Failed to load run', 'error'); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRuns(); }, [orgSlug, currentCompany?._id]);

  // First click on a column sorts it (money high→low, name A→Z); clicking the
  // active column flips direction. There is no third "back to original order"
  // click — the Reset link next to the search box does that.
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(ROW_SORTS[key]?.num ? 'desc' : 'asc');
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await createPayrollRun(orgSlug, { month: newMonth, year: newYear });
      showToast('Payroll run created');
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
      const res = await processPayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast(`Processed ${res.run.items?.length || 0} employees`);
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setProcessing(false); }
  };

  const handleFinalize = async () => {
    if (finalizing) return;
    if (!confirm('Finalize this payroll run? No further edits will be allowed.')) return;
    setFinalizing(true);
    try {
      const res = await finalizePayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Finalized');
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setFinalizing(false); }
  };

  const handleUnfinalize = async () => {
    if (unfinalizing) return;
    if (!confirm('Revert to processed? This will allow re-processing and edits.')) return;
    setUnfinalizing(true);
    try {
      const res = await unfinalizePayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Reverted to processed');
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setUnfinalizing(false); }
  };

  const handleMarkPaid = async () => {
    if (markingPaid) return;
    setMarkingPaid(true);
    try {
      const res = await markPayrollRunPaid(orgSlug, selectedRun._id, {});
      setSelectedRun(res.run);
      setShowMarkPaidConfirm(false);
      showToast('Marked as paid');
      loadRuns({ preserveSelection: true });
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setMarkingPaid(false); }
  };

  const handleDelete = async (id) => {
    if (deletingId) return;
    if (!confirm('Delete this draft payroll run?')) return;
    setDeletingId(id);
    try {
      await deletePayrollRun(orgSlug, id);
      showToast('Deleted');
      if (selectedRun?._id === id) setSelectedRun(null);
      loadRuns();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setDeletingId(null); }
  };

  // Lock/Unlock handlers
  const handleToggleLock = async (type) => {
    if (togglingLock) return;
    setTogglingLock(type);
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
    finally { setTogglingLock(null); }
  };

  // Release/Hold payslips
  const handleToggleRelease = async () => {
    if (togglingRelease) return;
    setTogglingRelease(true);
    try {
      const run = selectedRun;
      const res = run.payslipReleased
        ? await holdPayslips(orgSlug, run._id)
        : await releasePayslips(orgSlug, run._id);
      setSelectedRun(res.run);
      showToast(res.run.payslipReleased ? 'Payslips released to employees' : 'Payslips held');
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setTogglingRelease(false); }
  };

  // Ad-hoc adjustment
  const openAdHoc = (item) => {
    const existing = (selectedRun.adHocAdjustments || []).find(a => a.employeeId === item.employeeId);
    // Deep-copy: the stored adjustment lines live inside `selectedRun`, and the
    // modal's onChange handlers write into the row objects. Without a copy,
    // unsaved keystrokes mutate the run in place (gross/net in the expanded
    // row jump around) and Cancel can't revert.
    setAdHocForm({
      earnings: existing?.earnings?.length ? existing.earnings.map(e => ({ ...e })) : [{ label: '', amount: 0 }],
      deductions: existing?.deductions?.length ? existing.deductions.map(d => ({ ...d })) : [{ label: '', amount: 0 }],
    });
    setShowAdHoc(item);
  };

  const handleSaveAdHoc = async () => {
    setSavingAdHoc(true);
    try {
      const cleanEarnings = adHocForm.earnings.filter(e => e.label && e.amount > 0);
      const cleanDeductions = adHocForm.deductions.filter(d => d.label && d.amount > 0);
      // Surface silently-dropped lines (missing label or non-positive amount)
      const droppedCount =
        adHocForm.earnings.filter(e => (e.label || e.amount) && !(e.label && e.amount > 0)).length +
        adHocForm.deductions.filter(d => (d.label || d.amount) && !(d.label && d.amount > 0)).length;
      if (droppedCount > 0) {
        showToast(`${droppedCount} line${droppedCount > 1 ? 's' : ''} skipped (needs a label and an amount greater than 0)`, 'error');
      }
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

  // Release payslips with employee selection — on-hold employees excluded
  const openReleaseModal = () => {
    const items = selectedRun?.items || [];
    setReleaseSelection(new Set(items.filter(i => !i.salaryHold).map(i => i.employeeId)));
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
      } else if (type === 'bank-sheet-hdfc') {
        blob = await downloadBankSheetHdfc(orgSlug, selectedRun._id);
        filename = `Bank_Sheet_HDFC_${MONTHS[selectedRun.month]}_${selectedRun.year}.xlsx`;
      } else if (type === 'bank-sheet-non-hdfc') {
        blob = await downloadBankSheetNonHdfc(orgSlug, selectedRun._id);
        filename = `Bank_Sheet_Non_HDFC_${MONTHS[selectedRun.month]}_${selectedRun.year}.xlsx`;
      }
      triggerDownload(blob, filename);
      showToast(`Downloaded ${type}`);
    } catch (err) { showToast(downloadErrorMessage(err, 'Download failed'), 'error'); }
  };

  const handleDownloadPayslip = async (employeeId, name) => {
    try {
      const blob = await downloadPayslipPdf(orgSlug, selectedRun._id, employeeId);
      triggerDownload(blob, `Payslip_${name.replace(/\s+/g, '_')}_${MONTHS[selectedRun.month]}_${selectedRun.year}.pdf`);
    } catch (err) { showToast(downloadErrorMessage(err, 'Download failed'), 'error'); }
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
    } catch (err) { showToast(downloadErrorMessage(err, 'Export failed'), 'error'); }
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
    // Exclude contractors from PF/CTC totals (they have no statutory deductions)
    const statutoryItems = items.filter(i => i.payrollMode !== 'contractor');
    const contractorItems = items.filter(i => i.payrollMode === 'contractor');
    const computedTotalPf = statutoryItems.reduce((s, i) => s + (i.employeePf || 0) + (i.employerPf || 0), 0);
    const computedTotalCtc = statutoryItems.reduce((s, i) => s + (i.totalCtc || 0), 0);

    // ── Employee table view model: type tab → search → sort ──────────────
    // Search composes WITH the type tabs (it narrows whatever tab is active)
    // and is entirely client-side over the already-loaded run items.
    const typeFilteredItems = empTypeFilter === 'all'
      ? items
      : items.filter(i => itemTypeKey(i) === empTypeFilter);
    const searchQuery = empSearch.trim();
    const searchedItems = searchQuery
      ? typeFilteredItems.filter(i => itemMatchesSearch(i, searchQuery))
      : typeFilteredItems;
    // Copy before sorting — never mutate run.items. With no sortKey the backend's
    // original order is preserved exactly, so nothing shifts on first load.
    const sortSpec = sortKey ? ROW_SORTS[sortKey] : null;
    const visibleItems = sortSpec
      ? [...searchedItems].sort((a, b) => {
          const av = sortSpec.get(a);
          const bv = sortSpec.get(b);
          let cmp;
          if (sortSpec.num) cmp = av - bv;
          else cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortDir === 'asc' ? cmp : -cmp;
        })
      : searchedItems;
    const isFiltered = !!searchQuery || empTypeFilter !== 'all';
    // Header cells: `key` present ⇒ sortable. `num` right-aligns money columns.
    const columns = [
      { key: 'name', label: 'Employee' },
      { label: 'Days', title: 'Effective days paid / total working days in the month' },
      { label: 'LOP', title: 'Loss-of-pay days' },
      { key: 'gross', label: 'Gross', num: true },
      { key: 'pf', label: 'PF (Emp + Employer)', num: true, title: 'Employee PF share + employer PF share. Excludes EDLI and PF admin charges. Shown as — for contractors, interns and flat-TDS consultants, who have no PF.' },
      { key: 'tds', label: 'TDS', num: true },
      { key: 'deductions', label: 'Deductions', num: true },
      { key: 'net', label: 'Net', num: true },
      { key: 'ctc', label: 'CTC', num: true },
      { label: '' },
    ];

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedRun(null)} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{MONTHS[run.month]} {run.year}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status]}`}>{statusLabel(run.status)}</span>
              {run.inputsLocked && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400" title="Attendance & timesheet inputs are frozen for this run">Inputs Locked</span>}
              {run.payrollLocked && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LOCKED_BADGE}`} title="Payroll figures are frozen — the normal state for a finished run">Payroll Locked</span>}
              {run.payslipReleased && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400">Released</span>}
            </div>
            <p className="text-sm text-dark-400">
              FY {run.financialYear} | {statutoryItems.length} employee{statutoryItems.length === 1 ? '' : 's'}{contractorItems.length > 0 && <>, {contractorItems.length} contractor{contractorItems.length === 1 ? '' : 's'}</>}
              {summary.stoppedEmployees > 0 && <span className="text-amber-400"> | {summary.stoppedEmployees} stopped</span>}
              {summary.totalLopDays > 0 && <span className="text-red-400"> | {summary.totalLopDays} LOP day{summary.totalLopDays === 1 ? '' : 's'}</span>}
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
                <button onClick={handleFinalize} disabled={finalizing} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
                  {finalizing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  {finalizing ? 'Finalizing...' : 'Finalize'}
                </button>
              </>
            )}
            {run.status === 'finalized' && (
              <>
                <button onClick={handleUnfinalize} disabled={unfinalizing} className="flex items-center gap-2 px-3 py-2 border border-dark-600 text-dark-300 rounded-lg hover:bg-dark-700 text-sm disabled:opacity-50">
                  {unfinalizing ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                  {unfinalizing ? 'Reverting...' : 'Unfinalize'}
                </button>
                <button onClick={() => setShowMarkPaidConfirm(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <CheckCircle size={14} /> Mark Paid
                </button>
              </>
            )}
          </div>
        </div>

        {/* Action Bar — split so that irreversible run-state changes (which lock
            figures or email employees) can never be mistaken for a harmless file
            download. Every existing in-flight guard and modal is preserved. */}
        {['processed', 'finalized', 'paid'].includes(run.status) && (
          <div className="mb-4 space-y-2">
            {/* ── Run state: changes the run, some of it irreversible ── */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-dark-500 w-full sm:w-auto sm:mr-1">Run state</span>
              <button onClick={() => handleToggleLock('inputs')} disabled={!!togglingLock} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-50 ${run.inputsLocked ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-dark-600 text-dark-300 hover:bg-dark-700'}`} title={run.inputsLocked ? 'Re-open attendance & timesheet inputs for this run' : 'Freeze attendance & timesheet inputs for this run'}>
                {togglingLock === 'inputs' ? <Loader2 size={12} className="animate-spin" /> : run.inputsLocked ? <Unlock size={12} /> : <Lock size={12} />}
                {run.inputsLocked ? 'Unlock Inputs' : 'Lock Inputs'}
              </button>
              <button onClick={() => handleToggleLock('payroll')} disabled={!!togglingLock} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-50 ${run.payrollLocked ? 'border-dark-500 text-dark-200 bg-dark-700/60 hover:bg-dark-700' : 'border-dark-600 text-dark-300 hover:bg-dark-700'}`} title={run.payrollLocked ? 'Re-open payroll figures for editing' : 'Freeze payroll figures for this run'}>
                {togglingLock === 'payroll' ? <Loader2 size={12} className="animate-spin" /> : run.payrollLocked ? <Unlock size={12} /> : <Lock size={12} />}
                {run.payrollLocked ? 'Unlock Payroll' : 'Lock Payroll'}
              </button>
              {/* Release/Hold — Release EMAILS payslips to employees, so it gets a
                  filled primary treatment, never the bordered download look. */}
              {run.payslipReleased ? (
                <button onClick={handleToggleRelease} disabled={togglingRelease} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50" title="Hide released payslips from employees again">
                  {togglingRelease ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />} Hold Payslips
                </button>
              ) : (
                <button onClick={openReleaseModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rivvra-600 text-white hover:bg-rivvra-700 shadow-sm" title="Emails payslips to the selected employees and makes them visible in ESS">
                  <Send size={12} /> Release Payslips to Employees
                </button>
              )}
            </div>

            {/* ── Downloads & reports: read-only, nothing changes ── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-dark-800 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-dark-500 w-full sm:w-auto sm:mr-1">Downloads &amp; reports</span>
              <button onClick={() => handleExport('payroll-sheet')} className="flex items-center gap-1.5 px-3 py-1.5 bg-rivvra-600/20 border border-rivvra-500/30 rounded-lg text-xs text-rivvra-300 hover:bg-rivvra-600/30" title="Full payroll workbook (.xlsx) — every employee with earnings & deductions"><FileSpreadsheet size={12} /> Payroll Sheet <span className="text-dark-500">.xlsx</span></button>
              <button onClick={() => handleDownload('bank-sheet-hdfc')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="HDFC bank transfer sheet (.xlsx)"><FileSpreadsheet size={12} /> HDFC Bank Sheet <span className="text-dark-500">.xlsx</span></button>
              <button onClick={() => handleDownload('bank-sheet-non-hdfc')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="Non-HDFC bank transfer sheet (.xlsx)"><FileSpreadsheet size={12} /> Non-HDFC Bank Sheet <span className="text-dark-500">.xlsx</span></button>
              {['finalized', 'paid'].includes(run.status) && (
                <button onClick={() => handleDownload('bank')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="Bank transfer file (.csv)"><Banknote size={12} /> Bank Transfer <span className="text-dark-500">.csv</span></button>
              )}
              <button onClick={() => handleDownload('payslips')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="All payslip PDFs bundled as a .zip (does not email anyone)"><FileText size={12} /> All Payslips <span className="text-dark-500">.zip</span></button>
              {/* Statutory filings. Labels match what the backend actually
                  generates: PF is an EPFO ECR text file; ESI and PT are
                  per-employee contribution listings (CSV), not bank challans. */}
              <button onClick={() => handleDownload('pf')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="EPFO ECR upload file (.txt) — UAN, wages and PF contributions per employee"><FileText size={12} /> PF ECR <span className="text-dark-500">.txt</span></button>
              <button onClick={() => handleDownload('esi')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="ESI contribution listing (.csv) — IP number, wages, employee & employer ESI"><FileText size={12} /> ESI Contributions <span className="text-dark-500">.csv</span></button>
              <button onClick={() => handleDownload('pt')} className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700" title="Professional Tax listing (.csv) — PT deducted per employee, with state"><IndianRupee size={12} /> PT Statement <span className="text-dark-500">.csv</span></button>
            </div>
          </div>
        )}

        {/* Summary Cards — grouped by SCOPE so that "Total CTC" being smaller
            than "Total Gross" reads as a difference in coverage (CTC and PF are
            statutory employees only; gross/net/deductions cover everyone) rather
            than as a contradiction. Neither figure is changed. */}
        {items.length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Total Gross', value: items.reduce((s, i) => s + (i.grossSalary || 0), 0), color: 'text-white', sub: `All ${items.length} rows`, tip: 'Sum of gross salary across every row in this run, employees and contractors alike.' },
                { label: 'Total Deductions', value: items.reduce((s, i) => s + (i.totalDeductions || 0), 0), color: 'text-red-400', sub: `All ${items.length} rows`, tip: 'Sum of total deductions across every row in this run.' },
                { label: 'Total Net', value: items.reduce((s, i) => s + (i.netSalary || 0), 0), color: 'text-green-400', sub: `All ${items.length} rows`, tip: 'Sum of net pay across every row in this run, employees and contractors alike.' },
                { label: 'Total PF', value: computedTotalPf, color: 'text-blue-400', sub: `${statutoryItems.length} statutory only`, tip: 'Employee + employer PF share. Contractors have no PF, so they are not counted here.' },
                { label: 'Total CTC', value: computedTotalCtc || ((summary.totalGross || 0) + (summary.totalEmployerCost || 0)), color: 'text-purple-400', sub: `${statutoryItems.length} statutory only`, tip: 'Cost to company for statutory employees. Contractors carry no CTC figure, so this covers fewer rows than Total Gross — that is why it can be the smaller number.' },
              ].map(card => (
                <div key={card.label} className="bg-dark-800 border border-dark-700 rounded-lg p-3" title={card.tip}>
                  <div className="text-xs text-dark-400 mb-1">{card.label}</div>
                  <div className={`text-lg font-semibold ${card.color}`}>{formatMoney(card.value)}</div>
                  {card.sub && <div className="text-[9px] text-dark-500 mt-0.5">{card.sub}</div>}
                </div>
              ))}
            </div>
            {contractorItems.length > 0 && (
              <p className="flex items-start gap-1.5 text-[11px] text-dark-500">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>
                  Gross, Deductions and Net cover all {items.length} rows ({statutoryItems.length} employee{statutoryItems.length === 1 ? '' : 's'} + {contractorItems.length} contractor{contractorItems.length === 1 ? '' : 's'}).
                  PF and CTC cover only the {statutoryItems.length} statutory employee{statutoryItems.length === 1 ? '' : 's'} — contractors have no PF or CTC — so CTC is expected to be lower than Gross here.
                </span>
              </p>
            )}
          </div>
        )}

        {/* Filter Tabs + employee search */}
        {items.length > 0 && (() => {
          // Dynamic tabs — auto-detect all employment types from items
          const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultants', external_consultant: 'External Consultants', intern: 'Interns' };
          const typeCounts = {};
          for (const i of items) {
            const key = itemTypeKey(i);
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
            <div className="mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex gap-1 flex-wrap flex-1">
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
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
                  <input
                    type="text"
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    placeholder="Search name, employee code or PAN"
                    aria-label="Search employees in this payroll run"
                    className="w-full lg:w-72 pl-8 pr-8 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white placeholder-dark-500 focus:border-rivvra-500 focus:outline-none"
                  />
                  {empSearch && (
                    <button
                      onClick={() => setEmpSearch('')}
                      aria-label="Clear search"
                      title="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <span className="text-xs text-dark-400 whitespace-nowrap tabular-nums">
                  {visibleItems.length} of {items.length}
                </span>
                {(isFiltered || sortKey) && (
                  <button
                    onClick={() => { setEmpSearch(''); setEmpTypeFilter('all'); setSortKey(null); setSortDir('asc'); }}
                    className="text-xs text-rivvra-400 hover:text-rivvra-300 whitespace-nowrap"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Employee Table */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-dark-700">
                {columns.map(col => {
                  const active = col.key && sortKey === col.key;
                  const align = col.num ? 'text-right' : 'text-left';
                  if (!col.key) {
                    return <th key={col.label || 'actions'} className={`px-3 py-3 text-dark-400 font-medium text-xs ${align}`} title={col.title}>{col.label}</th>;
                  }
                  return (
                    <th key={col.key} className={`px-3 py-3 font-medium text-xs ${align} ${active ? 'text-rivvra-400' : 'text-dark-400'}`} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        title={col.title ? `${col.title}\n\nClick to sort` : 'Click to sort'}
                        className={`group inline-flex items-center gap-1 hover:text-white transition-colors ${col.num ? 'flex-row-reverse' : ''}`}
                      >
                        <span>{col.label}</span>
                        {active
                          ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                          : <ArrowDown size={11} className="opacity-0 group-hover:opacity-40" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => {
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
                          {/* Employee code — surfaced so the search field's
                              "employee code" promise is visible in the rows. */}
                          {item.employeeIdCode && <span className="text-[10px] text-dark-500 tabular-nums">{item.employeeIdCode}</span>}
                          {/* Status badges only */}
                          {item.payrollMode === 'contractor' && item.timesheetStatus === 'not_submitted' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400" title="No approved timesheet">
                              <XCircle size={9} /> No Timesheet
                            </span>
                          )}
                          {/* attendanceStatus 'pending' = an attendance sheet exists
                              but is not approved (still draft, awaiting approval,
                              or rejected). Say so rather than a bare "Pending". */}
                          {item.payrollMode !== 'contractor' && item.attendanceStatus === 'pending' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400" title="Attendance submitted but not yet approved (may still be a draft, awaiting approval, or rejected)">
                              <AlertTriangle size={9} /> Attendance Not Approved
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
                        {item.fnfAdjustments && (
                          <span className="text-[9px] text-amber-400 ml-1" title="F&F merged into this payslip">F&amp;F merged</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-dark-300 text-xs">{item.effectiveDays}/{item.totalWorkingDays}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.lopDays > 0 ? <span className="text-red-400">{item.lopDays}</span> : <span className="text-dark-500">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-white text-xs font-medium text-right tabular-nums">{formatMoney(item.grossSalary)}</td>
                      <td className="px-3 py-2.5 text-blue-400 text-xs text-right tabular-nums">{item.payrollMode === 'intern_no_deduction' || item.payrollMode === 'consultant_flat_tds' || item.payrollMode === 'contractor' ? '—' : formatMoney((item.employeePf || 0) + (item.employerPf || 0))}</td>
                      <td className="px-3 py-2.5 text-dark-300 text-xs text-right tabular-nums">{formatMoney(item.tds)}</td>
                      <td className="px-3 py-2.5 text-red-400 text-xs text-right tabular-nums">{formatMoney(item.totalDeductions)}</td>
                      <td className="px-3 py-2.5 text-green-400 text-xs font-medium text-right tabular-nums">{formatMoney(item.netSalary)}</td>
                      <td className="px-3 py-2.5 text-purple-400 text-xs font-medium text-right tabular-nums">{formatMoney(item.totalCtc)}</td>
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
                      const baseGross = item.grossSalary - (item.adHocEarnings || []).reduce((s, e) => s + (e.amount || 0), 0) - (item.holidayWorkAllowance || 0);
                      const displayGross = baseGross + adHocEarningsTotal + (item.holidayWorkAllowance || 0);
                      // item.totalDeductions already includes both ad-hoc and F&F deductions
                      // (backend bundles them into otherDeductions). Strip ad-hoc only so live
                      // edits flow through; keep F&F in place so the total matches the payslip.
                      const fnfDedAmt = item?.fnfAdjustments?.totalDeductions || 0;
                      const baseDeductions = item.totalDeductions - (item.otherDeductions || 0) + fnfDedAmt;
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
                                    const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultant', external_consultant: 'External Consultant', intern: 'Intern' };
                                    return (
                                      <div key={ti} className="bg-dark-900/50 rounded-lg p-2.5 space-y-1">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[10px] font-medium text-dark-300">{t.period} ({typeLabels[t.employmentType] || t.employmentType})</span>
                                          <span className="text-[10px] text-dark-500">{t.daysWorked}/{t.totalDays} days</span>
                                        </div>
                                        {(t.components || []).map((c, ci) => (
                                          <div key={ci} className="flex justify-between text-xs">
                                            <span className="text-dark-500">{c.name}</span>
                                            <span className="text-dark-300">{formatMoney(c.proratedAmount || c.fullAmount)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between text-xs font-medium border-t border-dark-700/50 pt-1 mt-1">
                                          <span className="text-dark-400">Gross</span>
                                          <span className="text-white">{formatMoney(t.grossSalary)}</span>
                                        </div>
                                        {t.employeePf > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">Employee PF</span><span className="text-red-400">-{formatMoney(t.employeePf)}</span></div>}
                                        {t.employeeEsi > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">ESI</span><span className="text-red-400">-{formatMoney(t.employeeEsi)}</span></div>}
                                        {t.professionalTax > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">PT</span><span className="text-red-400">-{formatMoney(t.professionalTax)}</span></div>}
                                        {t.tds > 0 && <div className="flex justify-between text-xs"><span className="text-dark-500">TDS</span><span className="text-red-400">-{formatMoney(t.tds)}</span></div>}
                                        <div className="flex justify-between text-xs font-medium border-t border-dark-700/50 pt-1">
                                          <span className="text-dark-400">Net</span>
                                          <span className="text-green-400">{formatMoney(t.netSalary)}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-blue-500/20">
                                  <span className="text-blue-300">Combined Net Pay</span>
                                  <span className="text-green-400">{formatMoney(displayNet)}</span>
                                </div>
                              </div>
                            )}

                            {/* Final settlement (LWD proration) banner */}
                            {item.lwdProration?.isExitMonth && (
                              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-2 flex items-start gap-2">
                                <CalendarX size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-amber-400">Final Settlement Month</p>
                                  <p className="text-[11px] text-amber-300/80 mt-0.5">
                                    Paid for {item.lwdProration.calendarDaysWorked} of {item.lwdProration.calendarDaysInMonth} days
                                    {' '}(LWD: {new Date(item.lwdProration.lastWorkingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}).
                                    Calendar-day prorated on all salary components.
                                  </p>
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
                                            <span className="text-dark-500 line-through mr-1.5 text-xs">{formatMoney(c.fullAmount)}</span>
                                            {formatMoney(c.proratedAmount)}
                                          </>
                                        ) : (
                                          <>{formatMoney(c.proratedAmount || c.fullAmount)}</>
                                        )}
                                      </span>
                                    </div>
                                  ))}

                                  {/* Ad-hoc earnings (live from run) */}
                                  {liveEarnings.map((a, i) => (
                                    <div key={`e-${i}`} className="flex justify-between">
                                      <span className="text-dark-400 text-xs">{a.label}</span>
                                      <span className="text-emerald-400 text-xs">+{formatMoney(a.amount)}</span>
                                    </div>
                                  ))}

                                  {/* Holiday Work Allowance */}
                                  {item.holidayWorkAllowance > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">Holiday Work ({item.holidayWorkDays}d)</span>
                                      <span className="text-orange-400 text-xs">+{formatMoney(item.holidayWorkAllowance)}</span>
                                    </div>
                                  )}

                                  {/* Placement Incentive (Recruiter / AM share folded in for this payout month).
                                      Already counted in item.grossSalary; this just surfaces the line. */}
                                  {(item.incentiveAmount || 0) > 0 && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-dark-400 text-xs">
                                          Placement Incentive
                                          {(item.incentivePayouts || []).length > 0 && (
                                            <span className="text-dark-500"> ({item.incentivePayouts.length})</span>
                                          )}
                                        </span>
                                        <span className="text-rivvra-400 text-xs">+{formatMoney(item.incentiveAmount)}</span>
                                      </div>
                                      {(item.incentivePayouts || []).length > 0 && (
                                        <div className="ml-3 space-y-0.5">
                                          {item.incentivePayouts.map((pay, pi) => (
                                            <div key={pay.recordId || pi} className="flex justify-between text-[10px] text-dark-500">
                                              <span>
                                                · {pay.role === 'recruiter' ? 'Recruiter' : 'Account Manager'}
                                                {pay.clientName ? ` · ${pay.clientName}` : ''}
                                                {pay.serviceMonth ? ` · ${pay.serviceMonth}` : ''}
                                              </span>
                                              <span>{formatMoney(pay.amount)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* F&F earnings (leave encashment + other additions) */}
                                  {item.fnfAdjustments && item.fnfAdjustments.leaveEncashment > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">F&amp;F: Leave Encashment</span>
                                      <span className="text-amber-400 text-xs">+{formatMoney(item.fnfAdjustments.leaveEncashment)}</span>
                                    </div>
                                  )}
                                  {item.fnfAdjustments && item.fnfAdjustments.otherAdditions > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">
                                        F&amp;F: Other Additions
                                        {item.fnfAdjustments.otherAdditionNotes ? ` — ${item.fnfAdjustments.otherAdditionNotes}` : ''}
                                      </span>
                                      <span className="text-amber-400 text-xs">+{formatMoney(item.fnfAdjustments.otherAdditions)}</span>
                                    </div>
                                  )}

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
                                          <span className="text-dark-400 text-xs">{formatMoney(item.rate)}/{item.payType === 'daily' ? 'day' : 'month'}</span>
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
                                  {item.payrollMode === 'contractor' && item.paidLeave > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-500 text-xs">Paid Leave</span>
                                      <span className="text-emerald-400 text-xs">
                                        +{item.paidLeave} day{item.paidLeave === 1 ? '' : 's'}
                                        {item.payType === 'daily' && item.rate > 0
                                          ? ` × ${formatMoney(item.rate)} = +${formatMoney(item.paidLeave * item.rate)}`
                                          : ''}
                                      </span>
                                    </div>
                                  )}
                                  {item.lopDays > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-500 text-xs">LOP Days</span>
                                      <span className="text-red-400 text-xs">{item.lopDays}</span>
                                    </div>
                                  )}

                                  <hr className="border-dark-800 my-1" />
                                  <div className="flex justify-between font-medium">
                                    <span className="text-dark-300">Total Earnings</span>
                                    <span className="text-white">{formatMoney(displayGross)}</span>
                                  </div>

                                  <hr className="border-dark-800 my-1" />

                                  {/* Deductions */}
                                  <div className="text-[10px] text-dark-500 uppercase tracking-wider">Deductions</div>
                                  {item.employeePf > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employee PF</span>
                                      <span className="text-red-400">{formatMoney(item.employeePf)}</span>
                                    </div>
                                  )}
                                  {item.employerPf > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employer PF</span>
                                      <span className="text-red-400">{formatMoney(item.employerPf)}</span>
                                    </div>
                                  )}
                                  {item.employeeEsi > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employee ESI</span>
                                      <span className="text-red-400">{formatMoney(item.employeeEsi)}</span>
                                    </div>
                                  )}
                                  {item.employerEsi > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Employer ESI</span>
                                      <span className="text-red-400">{formatMoney(item.employerEsi)}</span>
                                    </div>
                                  )}
                                  {item.professionalTax > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Professional Tax</span>
                                      <span className="text-red-400">{formatMoney(item.professionalTax)}</span>
                                    </div>
                                  )}
                                  {item.tds > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">TDS (Income Tax)</span>
                                      <span className="text-red-400">{formatMoney(item.tds)}</span>
                                    </div>
                                  )}

                                  {/* Ad-hoc deductions (live from run) */}
                                  {liveDeductions.map((a, i) => (
                                    <div key={`d-${i}`} className="flex justify-between">
                                      <span className="text-dark-400 text-xs">{a.label}</span>
                                      <span className="text-red-400 text-xs">{formatMoney(a.amount)}</span>
                                    </div>
                                  ))}

                                  {/* F&F deductions */}
                                  {item.fnfAdjustments && item.fnfAdjustments.noticePeriodRecovery > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">F&amp;F: Notice Period Recovery</span>
                                      <span className="text-amber-400 text-xs">{formatMoney(item.fnfAdjustments.noticePeriodRecovery)}</span>
                                    </div>
                                  )}
                                  {item.fnfAdjustments && item.fnfAdjustments.assetDeductions > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">F&amp;F: Asset Deductions</span>
                                      <span className="text-amber-400 text-xs">{formatMoney(item.fnfAdjustments.assetDeductions)}</span>
                                    </div>
                                  )}
                                  {item.fnfAdjustments && item.fnfAdjustments.loanRecovery > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">F&amp;F: Loan / Advance Recovery</span>
                                      <span className="text-amber-400 text-xs">{formatMoney(item.fnfAdjustments.loanRecovery)}</span>
                                    </div>
                                  )}
                                  {item.fnfAdjustments && item.fnfAdjustments.otherDeductions > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-dark-400 text-xs">
                                        F&amp;F: Other Deductions
                                        {item.fnfAdjustments.otherDeductionNotes ? ` — ${item.fnfAdjustments.otherDeductionNotes}` : ''}
                                      </span>
                                      <span className="text-amber-400 text-xs">{formatMoney(item.fnfAdjustments.otherDeductions)}</span>
                                    </div>
                                  )}


                                  <hr className="border-dark-800 my-1" />
                                  <div className="flex justify-between font-medium">
                                    <span className="text-dark-300">Total Deductions</span>
                                    <span className="text-red-400">{formatMoney(displayDeductions)}</span>
                                  </div>

                                  <hr className="border-dark-800 my-1" />

                                  {/* Net Pay */}
                                  <div className="flex justify-between font-bold text-base">
                                    <span className="text-dark-200">Net Pay</span>
                                    <span className="text-emerald-400">{formatMoney(displayNet)}</span>
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
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleReleaseHold(item.salaryHold._id); }}
                                  disabled={releasingHoldId === item.salaryHold._id}
                                  className="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {releasingHoldId === item.salaryHold._id && <Loader2 size={12} className="animate-spin" />}
                                  {releasingHoldId === item.salaryHold._id ? 'Releasing...' : 'Release Hold'}
                                </button>
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
          {items.length > 0 && visibleItems.length === 0 && (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-dark-300">
                {searchQuery
                  ? <>No employees match &ldquo;<span className="text-white">{searchQuery}</span>&rdquo;{empTypeFilter !== 'all' ? ' in this tab' : ''}.</>
                  : 'No employees in this tab.'}
              </p>
              <p className="text-xs text-dark-500 mt-1">Searches name, employee code and PAN.</p>
              <button
                onClick={() => { setEmpSearch(''); setEmpTypeFilter('all'); }}
                className="mt-3 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs text-dark-200 hover:bg-dark-600"
              >
                Clear search &amp; show all {items.length}
              </button>
            </div>
          )}
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
                      <input type="number" min="0" placeholder="Amount" value={e.amount} onChange={ev => { const n = [...adHocForm.earnings]; n[i].amount = Number(ev.target.value); setAdHocForm(f => ({ ...f, earnings: n })); }}
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
                      <input type="number" min="0" placeholder="Amount" value={d.amount} onChange={ev => { const n = [...adHocForm.deductions]; n[i].amount = Number(ev.target.value); setAdHocForm(f => ({ ...f, deductions: n })); }}
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
                    {/* On-hold employees are excluded from Select All and their rows disabled */}
                    <button onClick={() => setReleaseSelection(new Set(items.filter(i => !i.salaryHold).map(i => i.employeeId)))} className="text-[10px] text-rivvra-400 hover:text-rivvra-300">Select All</button>
                    <button onClick={() => setReleaseSelection(new Set())} className="text-[10px] text-dark-400 hover:text-dark-300">Deselect All</button>
                  </div>
                </div>
                {items.map(item => (
                  <label key={item.employeeId} className={`flex items-center gap-3 p-2 rounded-lg hover:bg-dark-750 ${item.salaryHold ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={releaseSelection.has(item.employeeId)}
                      disabled={!!item.salaryHold}
                      onChange={() => {
                        if (item.salaryHold) return;
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
                    <span className="text-xs text-green-400">{formatMoney(item.netSalary)}</span>
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
                    <h3 className="text-base font-semibold text-white">Mark Payroll as Paid?</h3>
                    <p className="text-xs text-dark-400">{MONTHS[run.month]} {run.year}</p>
                  </div>
                </div>
                {(() => {
                  // Employees with an active salary hold are NOT disbursed —
                  // counting them would overstate the amount being confirmed.
                  const payableItems = items.filter(i => !i.salaryHold);
                  const heldItems = items.filter(i => i.salaryHold);
                  const payableTotal = payableItems.reduce((s, i) => s + (i.netSalary || 0), 0);
                  const heldTotal = heldItems.reduce((s, i) => s + (i.netSalary || 0), 0);
                  return (
                    <div className="space-y-2">
                      <p className="text-sm text-dark-300 leading-relaxed">
                        This confirms salaries for {MONTHS[run.month]} {run.year} have been disbursed.
                        Total net payout: <span className="text-green-400 font-medium">{formatMoney(payableTotal)}</span> across {payableItems.length} employee{payableItems.length !== 1 ? 's' : ''}.
                      </p>
                      {heldItems.length > 0 && (
                        <p className="text-xs text-amber-400 leading-relaxed">
                          Excludes {heldItems.length} employee{heldItems.length !== 1 ? 's' : ''} on salary hold ({formatMoney(heldTotal)} withheld).
                        </p>
                      )}
                    </div>
                  );
                })()}
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
  // Status filter options come from the runs actually present, so the dropdown
  // never offers a state with nothing behind it. Ordered by lifecycle.
  const STATUS_ORDER = ['draft', 'processing', 'processed', 'finalized', 'paid'];
  const presentStatuses = STATUS_ORDER.filter(s => runs.some(r => r.status === s))
    .concat([...new Set(runs.map(r => r.status))].filter(s => s && !STATUS_ORDER.includes(s)));
  const runQuery = runSearch.trim().toLowerCase();
  const visibleRuns = runs.filter(run => {
    if (runStatusFilter !== 'all' && run.status !== runStatusFilter) return false;
    if (!runQuery) return true;
    // Month name, numeric month, year, FY and status are all searchable.
    return [MONTHS[run.month], String(run.month), String(run.year), run.financialYear, statusLabel(run.status)]
      .some(v => v && String(v).toLowerCase().includes(runQuery));
  });
  const runsFiltered = runStatusFilter !== 'all' || !!runQuery;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Run Payroll</h1>
          <p className="text-sm text-dark-400 mt-1">Monthly payroll for all employees & contractors</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
          <Plus size={16} /> New Run
        </button>
      </div>

      {/* Filters — client-side over the already-loaded runs */}
      {runs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
            <input
              type="text"
              value={runSearch}
              onChange={e => setRunSearch(e.target.value)}
              placeholder="Search month, year or FY"
              aria-label="Search payroll runs"
              className="w-full pl-8 pr-8 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white placeholder-dark-500 focus:border-rivvra-500 focus:outline-none"
            />
            {runSearch && (
              <button onClick={() => setRunSearch('')} aria-label="Clear search" title="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={runStatusFilter}
            onChange={e => setRunStatusFilter(e.target.value)}
            aria-label="Filter runs by status"
            className="px-3 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:border-rivvra-500 focus:outline-none"
          >
            <option value="all">All statuses ({runs.length})</option>
            {presentStatuses.map(s => (
              <option key={s} value={s}>{statusLabel(s)} ({runs.filter(r => r.status === s).length})</option>
            ))}
          </select>
          {runsFiltered && (
            <button onClick={() => { setRunSearch(''); setRunStatusFilter('all'); }} className="text-xs text-rivvra-400 hover:text-rivvra-300 whitespace-nowrap self-start sm:self-auto">
              Reset
            </button>
          )}
        </div>
      )}

      {/* Runs table — dense so Net can be compared down a single column */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="px-4 py-3 text-left text-xs font-medium text-dark-400">Month</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-dark-400">FY</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-dark-400">Employees</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-dark-400">Net</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-dark-400">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleRuns.map(run => {
              // Draft runs have `summary: {}` — no counts, no totals. Show an
              // em-dash rather than an empty cell so the row stays readable.
              const empCount = run.summary?.totalEmployees;
              const hasEmpCount = Number.isFinite(Number(empCount)) && empCount != null;
              const net = run.summary?.totalNet;
              const hasNet = Number.isFinite(Number(net)) && net != null;
              return (
                <tr
                  key={run._id}
                  onClick={() => loadRun(run._id)}
                  className="border-b border-dark-700/50 last:border-0 hover:bg-dark-750 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-white font-medium">{MONTHS[run.month]} {run.year}</td>
                  <td className="px-4 py-3 text-dark-400 text-xs">{run.financialYear || '—'}</td>
                  <td className="px-4 py-3 text-right text-dark-300 text-xs tabular-nums">{hasEmpCount ? fmt(empCount) : <span className="text-dark-500">—</span>}</td>
                  <td className="px-4 py-3 text-right text-green-400 text-xs font-medium tabular-nums">{hasNet ? formatMoney(net) : <span className="text-dark-500">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[run.status]}`}>{statusLabel(run.status)}</span>
                      {run.payslipReleased && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400">Released</span>}
                      {run.payrollLocked && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LOCKED_BADGE}`} title="Payroll figures are frozen — the normal state for a finished run">Locked</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {run.status === 'draft' && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(run._id); }} disabled={!!deletingId} title="Delete this draft run" className="p-1.5 text-dark-400 hover:text-red-400 disabled:opacity-50">
                        {deletingId === run._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {runs.length === 0 && <div className="text-center py-12 text-dark-500">No payroll runs yet. Create one to get started.</div>}
        {runs.length > 0 && visibleRuns.length === 0 && (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-dark-300">
              {runQuery
                ? <>No payroll runs match &ldquo;<span className="text-white">{runSearch.trim()}</span>&rdquo;{runStatusFilter !== 'all' ? ` with status ${statusLabel(runStatusFilter)}` : ''}.</>
                : <>No payroll runs with status {statusLabel(runStatusFilter)}.</>}
            </p>
            <button
              onClick={() => { setRunSearch(''); setRunStatusFilter('all'); }}
              className="mt-3 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs text-dark-200 hover:bg-dark-600"
            >
              Clear filters &amp; show all {runs.length}
            </button>
          </div>
        )}
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
