import { Fragment, useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import {
  getPayrollRuns, getPayrollRun, createPayrollRun, processPayrollRun,
  finalizePayrollRun, unfinalizePayrollRun, markPayrollRunPaid, deletePayrollRun,
  downloadPFChallan, downloadESIChallan, downloadPTChallan,
  lockInputs, unlockInputs, lockPayroll, unlockPayroll,
  releasePayslips, holdPayslips,
  setAdHocAdjustment, createSalaryHold, releaseSalaryHold, decideSalaryHold,
  downloadPayslipPdf, downloadAllPayslips, downloadBankTransfer, downloadPayrollExport, downloadPayrollSheet,
  downloadBankSheetHdfc, downloadBankSheetNonHdfc,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
// Guided-run decisions live in this shared module, NOT in either page. Both
// shells import the same functions, so who is releasable, what the next action
// is, and what finalize will freeze cannot drift between legacy and v2 —
// there is no second copy to fall out of sync.
import {
  isPayslipReleasedFor, isReleasable, splitByRelease, nextAction, finalizeWarning, lockConflicts, LOCK_EFFECTS,
} from '../../utils/payrollRunGuidance';
import PayrollRunStepStrip from '../../components/PayrollRunStepStrip';
import {
  Plus, Play, CheckCircle, Lock, Unlock, Trash2, ArrowLeft, Download,
  X, FileText, IndianRupee, EyeOff, Banknote, FileSpreadsheet,
  AlertTriangle, XCircle, Undo2, ChevronDown, ChevronUp, PauseCircle, Send, Loader2, CalendarX,
  Search, ArrowUp, ArrowDown, Info,
} from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, Input, Select, Modal, EmptyState, PageSpinner, Callout,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Run Payroll — the last payroll page, and the one that publishes. Two views in
// one component: a run index and a run detail with a per-employee breakdown.
//
// Unusually for this migration, most of the money math lives in the RENDER, not
// above `return (` — the summary-card reducers, the per-row live ad-hoc
// recomputation (`baseGross` → `displayNet`), the mark-paid payable/held split
// and both filter/sort pipelines. Splicing the pre-return block verbatim is
// therefore NOT sufficient here, so every one of those blocks is copied across
// byte-identically too and asserted individually. Nothing that produces a
// number was retyped.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Lifecycle → Chip tone. `finalized` is why `purple` was added to Chip: it sits
 * between `processed` (info) and `paid` (brand) and must not read as either,
 * and the legacy palette gave it its own hue for exactly that reason.
 */
const STATUS_TONES = {
  draft: 'neutral',
  processing: 'warn',
  processed: 'info',
  finalized: 'purple',
  paid: 'brand',
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

/** Money inks, matching legacy's per-column Tailwind hues. */
const INK = {
  plain: 'var(--fg)',
  muted: 'var(--fg-3)',
  deduct: 'var(--danger)',
  net: 'var(--acc-emerald)',
  pf: 'var(--acc-blue)',
  ctc: 'var(--acc-purple)',
  warn: 'var(--warn-ink)',
  hold: 'var(--acc-orange)',
};

/** Left label / right value line — the shape the breakdown panels repeat. */
function KV({ label, value, valueColor, small, strong, top }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      font: `${strong ? 500 : 400} ${small ? 11.5 : 12.5}px/1.4 'Inter', system-ui, sans-serif`,
      borderTop: top ? '1px solid var(--line-2)' : undefined,
      paddingTop: top ? 6 : undefined,
      marginTop: top ? 2 : undefined,
    }}>
      <span style={{ color: strong ? 'var(--fg-2)' : 'var(--fg-4)' }}>{label}</span>
      <span style={{ color: valueColor || (strong ? 'var(--fg)' : 'var(--fg-2)'), fontWeight: strong ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** Uppercase micro-heading used inside the breakdown panels. */
function Legend({ children, style, title }) {
  return (
    <div title={title} style={{
      font: "500 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      textTransform: 'uppercase', letterSpacing: '0.07em', ...style,
    }}>{children}</div>
  );
}

/** Tiny inline status flag on an employee row. */
function RowFlag({ tone, icon, children, title }) {
  return (
    <span title={title} style={{ display: 'inline-flex' }}>
      <Chip tone={tone} style={{ gap: 3 }}>{icon}{children}</Chip>
    </span>
  );
}

export default function PayrollRunPageV2() {
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
  const [showHoldPayslipsConfirm, setShowHoldPayslipsConfirm] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
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

  // No native confirm() here. Finalizing blocks re-processing, which on a
  // two-cohort month strands the second cohort — a browser confirm cannot say
  // that, cannot name who has no payslip yet, and cannot change its own button
  // to "Finalize anyway". The consequence dialog below does all three.
  const handleFinalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const res = await finalizePayrollRun(orgSlug, selectedRun._id);
      setSelectedRun(res.run);
      showToast('Finalized');
      setShowFinalizeConfirm(false);
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

  // Release/Hold payslips. Holding is destructive-ish (hides every released
  // payslip from ESS and blocks incentive auto-create until re-released), so
  // the button opens a confirm modal and only the modal calls this.
  const handleToggleRelease = async () => {
    if (togglingRelease) return;
    setTogglingRelease(true);
    try {
      const run = selectedRun;
      const res = run.payslipReleased
        ? await holdPayslips(orgSlug, run._id)
        : await releasePayslips(orgSlug, run._id);
      setSelectedRun(res.run);
      setShowHoldPayslipsConfirm(false);
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

  // Deciding a hold is NOT releasing it, and those are different things:
  // undecided leaves the incentive waiting for a payroll release, decided
  // settles the cost at ₹0 so the incentive can be created. The hold stays
  // active either way — the employee is still off bank sheets and payslips.
  const [decidingHoldId, setDecidingHoldId] = useState(null);
  const handleDecideHold = async (holdId, decision) => {
    if (decidingHoldId) return;
    setDecidingHoldId(holdId);
    try {
      await decideSalaryHold(orgSlug, selectedRun._id, holdId, decision);
      setSelectedRun(prev => ({
        ...prev,
        items: prev.items.map(i => (i.salaryHold?._id === holdId
          ? { ...i, salaryHold: { ...i.salaryHold, decision } }
          : i)),
      }));
      showToast(decision === 'will_not_pay'
        ? 'Marked as not paying — incentive can now be created'
        : 'Returned to undecided');
    } catch (err) {
      showToast(err?.response?.data?.message || err.message || 'Failed', 'error');
    } finally { setDecidingHoldId(null); }
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
    // Only rows that can actually be released: not already released (that would
    // re-send an email received weeks ago), not on salary hold, and with pay
    // actually computed (net 0 would email an empty payslip). The previous
    // `!i.salaryHold` here caught only the middle case.
    setReleaseSelection(new Set(
      items.filter(i => isReleasable(selectedRun, i)).map(i => i.employeeId)
    ));
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
    // Month NAME in every filename (July, not 7) — matches the xlsx exports.
    const suffix = `${MONTHS[selectedRun.month]}_${selectedRun.year}`;
    const DOWNLOAD_LABELS = {
      pf: 'PF ECR', esi: 'ESI contributions', pt: 'PT statement', bank: 'Bank transfer',
      payslips: 'Payslips', 'bank-sheet-hdfc': 'HDFC bank sheet', 'bank-sheet-non-hdfc': 'Non-HDFC bank sheet',
    };
    try {
      let blob, filename;
      if (type === 'pf') {
        blob = await downloadPFChallan(orgSlug, selectedRun._id);
        filename = `PF_ECR_${suffix}.txt`;
      } else if (type === 'esi') {
        blob = await downloadESIChallan(orgSlug, selectedRun._id);
        filename = `ESI_${suffix}.csv`;
      } else if (type === 'pt') {
        blob = await downloadPTChallan(orgSlug, selectedRun._id, '');
        filename = `PT_${suffix}.csv`;
      } else if (type === 'bank') {
        blob = await downloadBankTransfer(orgSlug, selectedRun._id);
        filename = `Bank_Transfer_${suffix}.csv`;
      } else if (type === 'payslips') {
        blob = await downloadAllPayslips(orgSlug, selectedRun._id);
        filename = `Payslips_${suffix}.zip`;
      } else if (type === 'bank-sheet-hdfc') {
        blob = await downloadBankSheetHdfc(orgSlug, selectedRun._id);
        filename = `Bank_Sheet_HDFC_${suffix}.xlsx`;
      } else if (type === 'bank-sheet-non-hdfc') {
        blob = await downloadBankSheetNonHdfc(orgSlug, selectedRun._id);
        filename = `Bank_Sheet_Non_HDFC_${suffix}.xlsx`;
      }
      triggerDownload(blob, filename);
      showToast(`${DOWNLOAD_LABELS[type] || type} downloaded`);
    } catch (err) { showToast(downloadErrorMessage(err, `${DOWNLOAD_LABELS[type] || type} download failed`), 'error'); }
  };

  const handleDownloadPayslip = async (employeeId, name) => {
    try {
      const blob = await downloadPayslipPdf(orgSlug, selectedRun._id, employeeId);
      triggerDownload(blob, `Payslip_${name.replace(/\s+/g, '_')}_${MONTHS[selectedRun.month]}_${selectedRun.year}.pdf`);
    } catch (err) { showToast(downloadErrorMessage(err, 'Download failed'), 'error'); }
  };

  const handleExport = async (type) => {
    const suffix = `${MONTHS[selectedRun.month]}_${selectedRun.year}`;
    try {
      let blob;
      if (type === 'payroll-sheet') {
        blob = await downloadPayrollSheet(orgSlug, selectedRun._id);
        triggerDownload(blob, `Payroll_${suffix}.xlsx`);
        showToast('Payroll sheet exported');
      } else if (type === 'pf-csv') {
        // Internal review sheet — NOT the EPFO upload file (that's PF ECR .txt).
        blob = await downloadPayrollExport(orgSlug, selectedRun._id, 'pf', 'csv');
        triggerDownload(blob, `PF_Summary_${suffix}.csv`);
        showToast('PF summary exported');
      } else {
        // /export serves a styled Excel workbook unless ?format=csv is passed.
        blob = await downloadPayrollExport(orgSlug, selectedRun._id, type);
        triggerDownload(blob, `${type}_${suffix}.xlsx`);
        showToast(`${type} exported`);
      }
    } catch (err) { showToast(downloadErrorMessage(err, 'Export failed'), 'error'); }
  };

  if (loading) return <PageSpinner label="Loading payroll runs…" />;

  if (loadError) return (
    <Panel>
      <EmptyState icon={<AlertTriangle size={22} />} tone="danger" title={loadError}
        actions={<Button variant="secondary" size="sm" onClick={() => loadRuns()}>Retry</Button>}>
        This is not an empty company — the request failed.
      </EmptyState>
    </Panel>
  );

  const th = { padding: '10px 12px', font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' };
  const td = { padding: '9px 12px', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", whiteSpace: 'nowrap' };
  const numTd = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

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
    // ── Re-process affordances ────────────────────────────────────────────
    // Release is per-employee, so a partially-released run CAN be re-processed:
    // released rows are frozen server-side and only unreleased employees
    // recompute. That is what lets external consultants — paid on the 15th of
    // the following month — be processed after employees were already paid.
    //
    // The one case still refused is a legacy release-all: `payslipReleased`
    // with no `releasedEmployeeIds`, where the server can't tell who was
    // released. Surface that as a disabled button with the reason, rather than
    // letting the click dead-end in an error toast.
    const releasedCount = (run.releasedEmployeeIds || []).length;
    const isLegacyReleaseAll = !!run.payslipReleased && releasedCount === 0;
    // Split the run by who has actually been released, so Release and Hold can
    // both be offered on a partially-released run.
    const {
      released: releasedItems,
      releasable: releasableItems, needsCompute: needsComputeItems,
    } = splitByRelease(run);
    // The one next step. Drives both the banner and which button is primary.
    const next = nextAction(run);
    const finalizeCaution = finalizeWarning(run);
    const lockBlockers = lockConflicts(run);
    const isNext = (key) => next?.key === key;
    const reprocessBlockedReason = run.payrollLocked
      ? 'Payroll is locked for this run. Use Unlock Payroll to re-process.'
      : isLegacyReleaseAll
        ? 'Payslips were released to everyone without a per-employee list, so figures people have already seen can\'t be protected. Hold payslips first, then re-process.'
        : null;
    const frozenDrift = run.reprocessFrozenDrift || [];
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

    const runActions = (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {run.status === 'draft' && (
          <Button size="sm" onClick={handleProcess} disabled={processing}
            iconLeft={processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}>
            {processing ? 'Processing...' : 'Process'}
          </Button>
        )}
        {/* A run stays 'processing' only while a process call is in flight; if the
            server died mid-process the status wedges here and every other action
            (ad-hoc, payslips, finalize) disappears with it. The API accepts
            re-processing a 'processing' run precisely for this recovery, so the
            button must exist — without it the only way out is DB surgery. */}
        {run.status === 'processing' && (
          <Button size="sm" onClick={handleProcess} disabled={processing}
            title="This run looks stuck mid-processing (the server may have restarted). Re-process to recompute and unstick it."
            iconLeft={processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}>
            {processing ? 'Processing...' : 'Resume Processing'}
          </Button>
        )}
        {run.status === 'processed' && (
          <>
            {/* Disabled with a reason, never hidden. A partially-released run
                CAN be re-processed — released rows freeze server-side — so
                hiding the button made a legitimate action look unavailable.
                Only a legacy release-all genuinely blocks it. */}
            <Button variant="secondary" size="sm" onClick={handleProcess}
              disabled={processing || !!reprocessBlockedReason}
              title={reprocessBlockedReason || 'Recompute this run. Released payslips keep the figures already paid.'}
              iconLeft={processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}>
              {processing ? 'Processing...' : 'Re-process'}
            </Button>
            <Button size="sm" variant={isNext('finalize') ? 'primary' : 'secondary'}
              onClick={() => setShowFinalizeConfirm(true)} disabled={finalizing}
              title={finalizeCaution || 'Locks the run so it can be marked paid.'}
              iconLeft={finalizing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}>
              {finalizing ? 'Finalizing...' : 'Finalize'}
            </Button>
          </>
        )}
        {run.status === 'finalized' && (
          <>
            <Button variant="secondary" size="sm" onClick={handleUnfinalize} disabled={unfinalizing}
              iconLeft={unfinalizing ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}>
              {unfinalizing ? 'Reverting...' : 'Unfinalize'}
            </Button>
            <Button size="sm" onClick={() => setShowMarkPaidConfirm(true)} iconLeft={<CheckCircle size={14} />}>
              Mark Paid
            </Button>
          </>
        )}
      </div>
    );

    return (
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
          <Button variant="ghost" size="sm" aria-label="Back to payroll runs" onClick={() => setSelectedRun(null)} iconLeft={<ArrowLeft size={17} />} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <h1 style={{ font: "650 19px/1.2 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
                {MONTHS[run.month]} {run.year}
              </h1>
              <Chip tone={STATUS_TONES[run.status] || 'neutral'}>{statusLabel(run.status)}</Chip>
              {run.inputsLocked && (
                <span title="Attendance & timesheet inputs are frozen for this run"><Chip tone="warn">Inputs Locked</Chip></span>
              )}
              {/* `Locked` is the normal end state of a finished run, not an
                  error — neutral, never red. Red is reserved for genuine
                  problems (missing attendance, LOP). */}
              {run.payrollLocked && (
                <span title="Payroll figures are frozen — the normal state for a finished run"><Chip tone="neutral">Payroll Locked</Chip></span>
              )}
              {/* Count, not a bare flag: release is per-employee, so "Released"
                  alone reads as all-done on a run where only some went out. */}
              {run.payslipReleased && (
                <Chip tone="brand">Released ({releasedCount}/{(run.items || []).length})</Chip>
              )}
            </div>
            <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
              FY {run.financialYear} | {statutoryItems.length} employee{statutoryItems.length === 1 ? '' : 's'}{contractorItems.length > 0 && <>, {contractorItems.length} contractor{contractorItems.length === 1 ? '' : 's'}</>}
              {summary.stoppedEmployees > 0 && <span style={{ color: INK.warn }}> | {summary.stoppedEmployees} stopped</span>}
              {summary.totalLopDays > 0 && <span style={{ color: INK.deduct }}> | {summary.totalLopDays} LOP day{summary.totalLopDays === 1 ? '' : 's'}</span>}
            </p>
          </div>
          {runActions}
        </div>

        {/* Step strip. The shared component from the legacy page, unmodified —
            it reads runSteps() from payrollRunGuidance, so both shells show the
            same four steps in the same state. */}
        {['processed', 'finalized', 'paid'].includes(run.status) && (
          <div style={{ marginBottom: 14 }}><PayrollRunStepStrip run={run} /></div>
        )}

        {/* Next action — one sentence saying what to do now, and nothing else.
            nextAction() returns {key, label, headline, why, caution} and never
            returns null for a loaded run: 'done' is a key, not an absence. The
            copy is the helper's, not this page's, so it cannot drift from
            legacy. `label` is the button text and is deliberately unused here. */}
        {['processed', 'finalized', 'paid'].includes(run.status) && next && (
          <Callout
            tone={next.key === 'done' ? 'brand' : 'info'}
            icon={next.key === 'done' ? <CheckCircle size={15} /> : <Info size={15} />}
            title={next.key === 'done' ? next.headline : `Next: ${next.headline}`}
            style={{ marginBottom: 14 }}
          >
            <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 }}>
              {next.why}
            </p>
            {next.caution && (
              <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: INK.warn, margin: '6px 0 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} /> {next.caution}
              </p>
            )}
            {/* A lock only ever needs to announce itself when it is the
                reason something is unavailable — never as "click me". */}
            {lockBlockers.map(c => (
              <p key={c.lock} style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: INK.warn, margin: '6px 0 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Lock size={12} style={{ marginTop: 2, flexShrink: 0 }} /> {c.message}
              </p>
            ))}
          </Callout>
        )}

        {/* Frozen-row drift — a released employee's inputs changed after they
            were paid, so the last re-process kept the paid figure and recorded
            what it would otherwise have become. Not an error: you file what you
            actually paid, and a genuine correction goes out as arrears. But it
            must be visible, or the run and its inputs disagree in silence.

            NOTE: legacy PayrollRunPage.jsx:738 hardcodes the word "July" in this
            sentence, so it misnames the month in every other run. Using the
            run's own month here rather than copying that forward — this is the
            one place this port deliberately does NOT match legacy, and the
            legacy line needs the same one-word fix. */}
        {frozenDrift.length > 0 && (
          <Callout
            tone="warn"
            icon={<AlertTriangle size={15} />}
            title={`${frozenDrift.length} released payslip${frozenDrift.length === 1 ? '' : 's'} kept the figure already paid`}
            style={{ marginBottom: 14 }}
          >
            <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 }}>
              {MONTHS[run.month]} data changed after these employees were paid. Their rows were left
              untouched — recomputing would have moved a figure they have already received. Pay any
              genuine correction as arrears in a later run.
            </p>
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
              <table style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", minWidth: '100%' }}>
                <thead>
                  <tr style={{ color: 'var(--fg-4)' }}>
                    <th style={{ textAlign: 'left', fontWeight: 500, paddingRight: 16, paddingBottom: 4 }}>Employee</th>
                    <th style={{ textAlign: 'right', fontWeight: 500, paddingRight: 16, paddingBottom: 4 }}>Paid net</th>
                    <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 4 }}>Would have become</th>
                  </tr>
                </thead>
                <tbody>
                  {frozenDrift.map((d) => (
                    <tr key={d.employeeId} style={{ color: 'var(--fg-2)' }}>
                      <td style={{ paddingRight: 16, padding: '2px 16px 2px 0' }}>{d.employeeName}</td>
                      <td style={{ textAlign: 'right', paddingRight: 16, padding: '2px 16px 2px 0', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(d.storedNet)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 0', fontVariantNumeric: 'tabular-nums', color: INK.warn }}>{formatMoney(d.wouldBeNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Callout>
        )}

        {/* Action Bar — split so that irreversible run-state changes (which lock
            figures or email employees) can never be mistaken for a harmless file
            download. Every existing in-flight guard and modal is preserved. */}
        {['processed', 'finalized', 'paid'].includes(run.status) && (
          <Panel style={{ marginBottom: 14 }}>
            {/* ── Run state: changes the run, some of it irreversible ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {/* Labelled "optional" because they are: a run goes Process →
                  Release → Finalize → Mark paid without either lock ever being
                  clicked. Sitting unlabelled next to the real steps is what led
                  HR to ask which of them to click first. */}
              <Legend style={{ width: '100%', marginBottom: 2 }}
                title="Optional safeguards. Neither is a step — a run completes without them.">
                Safeguards <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--fg-faint)' }}>(optional)</span>
              </Legend>
              {/* Titles come from LOCK_EFFECTS so both shells explain a lock the
                  same way. "Adjustments", not "Inputs": the lock freezes ad-hoc
                  adjustments and holds, which is what HR reads it as. */}
              <Button variant="secondary" size="sm" onClick={() => handleToggleLock('inputs')} disabled={!!togglingLock}
                title={run.inputsLocked ? LOCK_EFFECTS.inputs.unlock : LOCK_EFFECTS.inputs.lock}
                iconLeft={togglingLock === 'inputs' ? <Loader2 size={12} className="animate-spin" /> : run.inputsLocked ? <Unlock size={12} /> : <Lock size={12} />}>
                {run.inputsLocked ? 'Unlock Adjustments' : 'Lock Adjustments'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleToggleLock('payroll')} disabled={!!togglingLock}
                title={run.payrollLocked ? LOCK_EFFECTS.payroll.unlock : LOCK_EFFECTS.payroll.lock}
                iconLeft={togglingLock === 'payroll' ? <Loader2 size={12} className="animate-spin" /> : run.payrollLocked ? <Unlock size={12} /> : <Lock size={12} />}>
                {run.payrollLocked ? 'Unlock Payroll' : 'Lock Payroll'}
              </Button>

              {/* Payslips are part of the flow, unlike the two locks above —
                  hence its own label rather than sitting under "Safeguards". */}
              <Legend style={{ width: '100%', marginBottom: 2 }}>Payslips</Legend>

              {/* Release and Hold are NOT mutually exclusive. A partially
                  released run has both people still to release and people who
                  could be held; the previous `run.payslipReleased ? … : …`
                  here hid Release completely as soon as the first cohort went
                  out, which is the bug legacy fixed on 2026-08-14. Both are now
                  driven by splitByRelease(). */}
              {releasedItems.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setShowHoldPayslipsConfirm(true)} disabled={togglingRelease}
                  title={`Hide the ${releasedItems.length} released payslip${releasedItems.length === 1 ? '' : 's'} from employees again`}
                  iconLeft={togglingRelease ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}>
                  Hold Payslips
                </Button>
              )}
              {/* Counts what can ACTUALLY be released, matching the banner and
                  the modal's default selection. Using the raw unreleased count
                  promised 37 when only 34 could go out — salary holds and rows
                  with no computed pay are excluded everywhere else. */}
              {releasableItems.length > 0 && (
                <Button size="sm" variant={isNext('release') ? 'primary' : 'secondary'} onClick={openReleaseModal}
                  iconLeft={<Send size={12} />}
                  title="Emails payslips to the selected employees and makes them visible in ESS">
                  {releasedItems.length > 0
                    ? `Release Remaining (${releasableItems.length})`
                    : `Release Payslips to Employees (${releasableItems.length})`}
                </Button>
              )}
            </div>

            {/* ── Downloads & reports: read-only, nothing changes ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTop: '1px solid var(--line-2)', paddingTop: 10, marginTop: 10 }}>
              <Legend style={{ width: '100%', marginBottom: 2 }}>Downloads &amp; reports</Legend>
              <Button variant="secondary" size="sm" onClick={() => handleExport('payroll-sheet')} iconLeft={<FileSpreadsheet size={12} />}
                title="Full payroll workbook (.xlsx) — every employee with earnings & deductions">
                Payroll Sheet <span style={{ color: 'var(--fg-4)' }}>.xlsx</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownload('bank-sheet-hdfc')} iconLeft={<FileSpreadsheet size={12} />}
                title="HDFC bank transfer sheet (.xlsx)">
                HDFC Bank Sheet <span style={{ color: 'var(--fg-4)' }}>.xlsx</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownload('bank-sheet-non-hdfc')} iconLeft={<FileSpreadsheet size={12} />}
                title="Non-HDFC bank transfer sheet (.xlsx)">
                Non-HDFC Bank Sheet <span style={{ color: 'var(--fg-4)' }}>.xlsx</span>
              </Button>
              {['finalized', 'paid'].includes(run.status) && (
                <Button variant="secondary" size="sm" onClick={() => handleDownload('bank')} iconLeft={<Banknote size={12} />}
                  title="Bank transfer file (.csv)">
                  Bank Transfer <span style={{ color: 'var(--fg-4)' }}>.csv</span>
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => handleDownload('payslips')} iconLeft={<FileText size={12} />}
                title="All payslip PDFs bundled as a .zip (does not email anyone)">
                All Payslips <span style={{ color: 'var(--fg-4)' }}>.zip</span>
              </Button>
              {/* Statutory filings. Labels match what the backend actually
                  generates: PF is an EPFO ECR text file; ESI and PT are
                  per-employee contribution listings (CSV), not bank challans. */}
              <Button variant="secondary" size="sm" onClick={() => handleDownload('pf')} iconLeft={<FileText size={12} />}
                title="EPFO ECR upload file (.txt) — UAN, wages and PF contributions per employee">
                PF ECR <span style={{ color: 'var(--fg-4)' }}>.txt</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleExport('pf-csv')} iconLeft={<FileText size={12} />}
                title="PF review sheet (.csv) — UAN, PF wages, EPF/EPS split per employee. For internal review; use PF ECR for the EPFO upload">
                PF Summary <span style={{ color: 'var(--fg-4)' }}>.csv</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownload('esi')} iconLeft={<FileText size={12} />}
                title="ESI contribution listing (.csv) — IP number, wages, employee & employer ESI">
                ESI Contributions <span style={{ color: 'var(--fg-4)' }}>.csv</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownload('pt')} iconLeft={<IndianRupee size={12} />}
                title="Professional Tax listing (.csv) — PT deducted per employee, with state">
                PT Statement <span style={{ color: 'var(--fg-4)' }}>.csv</span>
              </Button>
            </div>
          </Panel>
        )}

        {/* Summary Cards — grouped by SCOPE so that "Total CTC" being smaller
            than "Total Gross" reads as a difference in coverage (CTC and PF are
            statutory employees only; gross/net/deductions cover everyone) rather
            than as a contradiction. Neither figure is changed. */}
        {items.length > 0 && (
          <div style={{ marginBottom: 18, display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { label: 'Total Gross', value: items.reduce((s, i) => s + (i.grossSalary || 0), 0), color: INK.plain, sub: `All ${items.length} rows`, tip: 'Sum of gross salary across every row in this run, employees and contractors alike.' },
                { label: 'Total Deductions', value: items.reduce((s, i) => s + (i.totalDeductions || 0), 0), color: INK.deduct, sub: `All ${items.length} rows`, tip: 'Sum of total deductions across every row in this run.' },
                { label: 'Total Net', value: items.reduce((s, i) => s + (i.netSalary || 0), 0), color: INK.net, sub: `All ${items.length} rows`, tip: 'Sum of net pay across every row in this run, employees and contractors alike.' },
                { label: 'Total PF', value: computedTotalPf, color: INK.pf, sub: `${statutoryItems.length} statutory only`, tip: 'Employee + employer PF share. Contractors have no PF, so they are not counted here.' },
                { label: 'Total CTC', value: computedTotalCtc || ((summary.totalGross || 0) + (summary.totalEmployerCost || 0)), color: INK.ctc, sub: `${statutoryItems.length} statutory only`, tip: 'Cost to company for statutory employees. Contractors carry no CTC figure, so this covers fewer rows than Total Gross — that is why it can be the smaller number.' },
              ].map(card => (
                <div key={card.label} title={card.tip} style={{ background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line)', borderRadius: 'var(--r-2)', padding: 12 }}>
                  <div style={{ font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{card.label}</div>
                  <div style={{ font: "700 16px/1.2 'Inter', system-ui, sans-serif", color: card.color, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(card.value)}</div>
                  {card.sub && <div style={{ font: "400 9.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 3 }}>{card.sub}</div>}
                </div>
              ))}
            </div>
            {contractorItems.length > 0 && (
              <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                <Info size={12} style={{ marginTop: 2, flexShrink: 0 }} />
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
            <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                {tabs.map(tab => {
                  const on = empTypeFilter === tab.key;
                  return (
                    <Button
                      key={tab.key}
                      variant={on ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={on}
                      onClick={() => setEmpTypeFilter(tab.key)}
                      style={on ? { boxShadow: '0 0 0 1px var(--brand-line)', background: 'var(--brand-soft)' } : undefined}
                    >
                      {tab.label} ({tab.count})
                    </Button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', width: 280 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
                  <Input
                    type="text"
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    placeholder="Search name, employee code or PAN"
                    aria-label="Search employees in this payroll run"
                    style={{ paddingLeft: 30, paddingRight: 30 }}
                  />
                  {empSearch && (
                    <button
                      onClick={() => setEmpSearch('')}
                      aria-label="Clear search"
                      title="Clear search"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'var(--fg-4)', display: 'grid', placeItems: 'center', padding: 0 }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {visibleItems.length} of {items.length}
                </span>
                {(isFiltered || sortKey) && (
                  <Button variant="ghost" size="sm" onClick={() => { setEmpSearch(''); setEmpTypeFilter('all'); setSortKey(null); setSortDir('asc'); }}>
                    Reset
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Employee Table */}
        <Panel flush>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  {columns.map(col => {
                    const active = col.key && sortKey === col.key;
                    const align = col.num ? 'right' : 'left';
                    if (!col.key) {
                      return <th key={col.label || 'actions'} style={{ ...th, textAlign: align }} title={col.title}>{col.label}</th>;
                    }
                    return (
                      <th key={col.key} style={{ ...th, textAlign: align, color: active ? 'var(--brand-ink)' : 'var(--fg-4)' }}
                        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          title={col.title ? `${col.title}\n\nClick to sort` : 'Click to sort'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                            background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit',
                            flexDirection: col.num ? 'row-reverse' : 'row',
                          }}
                        >
                          <span>{col.label}</span>
                          {active
                            ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                            : <ArrowDown size={11} style={{ opacity: 0.25 }} />}
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
                    <Fragment key={item.employeeId}>
                      <tr
                        onClick={() => setExpandedItem(isExpanded ? null : item.employeeId)}
                        style={{
                          borderBottom: '1px solid var(--line-2)', cursor: 'pointer',
                          background: isExpanded ? 'var(--surface-2)'
                            : item.isOverridden ? 'color-mix(in srgb, var(--warn) 7%, transparent)' : 'transparent',
                        }}
                      >
                        <td style={{ ...td, whiteSpace: 'normal' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ font: "600 12px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{item.employeeName}</span>
                            {/* Employee code — surfaced so the search field's
                                "employee code" promise is visible in the rows. */}
                            {item.employeeIdCode && <span style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>{item.employeeIdCode}</span>}
                            {/* Status badges only */}
                            {item.payrollMode === 'contractor' && item.timesheetStatus === 'not_submitted' && (
                              <RowFlag tone="danger" icon={<XCircle size={9} />} title="No approved timesheet">No Timesheet</RowFlag>
                            )}
                            {/* 'rejected' is its own state, NOT folded into pending.
                                A rejected sheet BLOCKS the run (the backend refuses
                                to process rather than guess a day count), so this
                                must be impossible to mistake for "nobody has looked
                                at it yet" — it is the state the admin has to clear
                                before payroll can run at all. */}
                            {item.payrollMode !== 'contractor' && item.attendanceStatus === 'rejected' && (
                              <RowFlag tone="danger" icon={<XCircle size={9} />} title="A manager rejected this attendance sheet. The run cannot be processed until it is corrected and approved, or the rejection reversed — payroll will not guess a day count for a rejected sheet.">Attendance Rejected</RowFlag>
                            )}
                            {/* attendanceStatus 'pending' = a sheet exists but is
                                still draft or awaiting approval. */}
                            {item.payrollMode !== 'contractor' && item.attendanceStatus === 'pending' && (
                              <RowFlag tone="warn" icon={<AlertTriangle size={9} />} title="Attendance submitted but not yet approved (still a draft or awaiting approval)">Attendance Not Approved</RowFlag>
                            )}
                            {item.payrollMode !== 'contractor' && item.attendanceStatus === 'not_submitted' && (
                              <RowFlag tone="danger" icon={<XCircle size={9} />} title="Attendance not submitted">No Attendance</RowFlag>
                            )}
                            {item.salaryHold && (
                              <RowFlag tone="warn" icon={<PauseCircle size={9} />} title={item.salaryHold.reason}>On Hold</RowFlag>
                            )}
                          </div>
                          {(item.adHocEarnings?.length > 0 || item.adHocDeductions?.length > 0) && <span style={{ font: "400 9.5px/1.3 'Inter', system-ui, sans-serif", color: INK.pf }}>Ad-hoc</span>}
                          {item.fnfAdjustments && (
                            <span title="F&F merged into this payslip" style={{ font: "400 9.5px/1.3 'Inter', system-ui, sans-serif", color: INK.warn, marginLeft: 4 }}>F&amp;F merged</span>
                          )}
                        </td>
                        <td style={{ ...td, color: 'var(--fg-3)' }}>{item.effectiveDays}/{item.totalWorkingDays}</td>
                        <td style={td}>
                          {item.lopDays > 0 ? <span style={{ color: INK.deduct }}>{item.lopDays}</span> : <span style={{ color: 'var(--fg-4)' }}>0</span>}
                        </td>
                        <td style={{ ...numTd, color: 'var(--fg)', fontWeight: 500 }}>{formatMoney(item.grossSalary)}</td>
                        <td style={{ ...numTd, color: INK.pf }}>{item.payrollMode === 'intern_no_deduction' || item.payrollMode === 'consultant_flat_tds' || item.payrollMode === 'contractor' ? '—' : formatMoney((item.employeePf || 0) + (item.employerPf || 0))}</td>
                        <td style={{ ...numTd, color: 'var(--fg-3)' }}>{formatMoney(item.tds)}</td>
                        <td style={{ ...numTd, color: INK.deduct }}>{formatMoney(item.totalDeductions)}</td>
                        <td style={{ ...numTd, color: INK.net, fontWeight: 500 }}>{formatMoney(item.netSalary)}</td>
                        <td style={{ ...numTd, color: INK.ctc, fontWeight: 500 }}>{formatMoney(item.totalCtc)}</td>
                        <td style={{ ...td, width: 30 }}>
                          {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--fg-4)' }} /> : <ChevronDown size={14} style={{ color: 'var(--fg-4)' }} />}
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

                        const typeLabels = { confirmed: 'Confirmed', internal_consultant: 'Internal Consultant', external_consultant: 'External Consultant', intern: 'Intern' };

                        return (
                        <tr>
                          <td colSpan="10" style={{ padding: 0, borderBottom: '1px solid var(--line-2)' }}>
                            <div style={{ background: 'var(--bg)', padding: 18, display: 'grid', gap: 14 }}>
                              {/* Mid-month transition banner */}
                              {item.hasTransition && item.transitions && (
                                <Callout tone="info">
                                  <div style={{ font: "500 11.5px/1.4 'Inter', system-ui, sans-serif", marginBottom: 8 }}>
                                    Mid-Month Transition: {item.transitions.map(t => typeLabels[t.employmentType] || t.employmentType).join(' → ')}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                                    {item.transitions.map((t, ti) => (
                                      <div key={ti} style={{ background: 'var(--surface-1)', borderRadius: 'var(--r-1)', padding: 10, display: 'grid', gap: 3 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                                          <span style={{ font: "500 10px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{t.period} ({typeLabels[t.employmentType] || t.employmentType})</span>
                                          <span style={{ font: "400 10px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{t.daysWorked}/{t.totalDays} days</span>
                                        </div>
                                        {(t.components || []).map((c, ci) => (
                                          <KV key={ci} small label={c.name} value={formatMoney(c.proratedAmount || c.fullAmount)} />
                                        ))}
                                        <KV top strong small label="Gross" value={formatMoney(t.grossSalary)} />
                                        {t.employeePf > 0 && <KV small label="Employee PF" value={`-${formatMoney(t.employeePf)}`} valueColor={INK.deduct} />}
                                        {t.employeeEsi > 0 && <KV small label="ESI" value={`-${formatMoney(t.employeeEsi)}`} valueColor={INK.deduct} />}
                                        {t.professionalTax > 0 && <KV small label="PT" value={`-${formatMoney(t.professionalTax)}`} valueColor={INK.deduct} />}
                                        {t.tds > 0 && <KV small label="TDS" value={`-${formatMoney(t.tds)}`} valueColor={INK.deduct} />}
                                        <KV top strong small label="Net" value={formatMoney(t.netSalary)} valueColor={INK.net} />
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ marginTop: 10 }}>
                                    <KV top strong label="Combined Net Pay" value={formatMoney(displayNet)} valueColor={INK.net} />
                                  </div>
                                </Callout>
                              )}

                              {/* Final settlement (LWD proration) banner */}
                              {item.lwdProration?.isExitMonth && (
                                <Callout tone="warn" icon={<CalendarX size={14} />} title="Final Settlement Month">
                                  Paid for {item.lwdProration.calendarDaysWorked} of {item.lwdProration.calendarDaysInMonth} days
                                  {' '}(LWD: {new Date(item.lwdProration.lastWorkingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}).
                                  Calendar-day prorated on all salary components.
                                </Callout>
                              )}

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                                {/* Left — Earnings & Deductions */}
                                <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                                  <Legend>Earnings &amp; Deductions</Legend>
                                  <div style={{ background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line)', borderRadius: 'var(--r-2)', padding: 12, display: 'grid', gap: 5 }}>
                                    {/* Earnings — Component breakdown */}
                                    <Legend>Earnings</Legend>
                                    {(item.components || []).map((c, ci) => (
                                      <KV
                                        key={c.name || ci}
                                        label={c.name}
                                        value={item.prorationFactor < 1 ? (
                                          <>
                                            <span style={{ color: 'var(--fg-4)', textDecoration: 'line-through', marginRight: 6, fontSize: 11 }}>{formatMoney(c.fullAmount)}</span>
                                            {formatMoney(c.proratedAmount)}
                                          </>
                                        ) : formatMoney(c.proratedAmount || c.fullAmount)}
                                      />
                                    ))}

                                    {/* Ad-hoc earnings (live from run) */}
                                    {liveEarnings.map((a, i) => (
                                      <KV key={`e-${i}`} small label={a.label} value={`+${formatMoney(a.amount)}`} valueColor={INK.net} />
                                    ))}

                                    {/* Holiday Work Allowance */}
                                    {item.holidayWorkAllowance > 0 && (
                                      <KV small label={`Holiday Work (${item.holidayWorkDays}d)`} value={`+${formatMoney(item.holidayWorkAllowance)}`} valueColor={INK.hold} />
                                    )}

                                    {/* Placement Incentive (Recruiter / AM share folded in for this payout month).
                                        Already counted in item.grossSalary; this just surfaces the line. */}
                                    {(item.incentiveAmount || 0) > 0 && (
                                      <>
                                        <KV
                                          small
                                          label={<>Placement Incentive{(item.incentivePayouts || []).length > 0 && <span style={{ color: 'var(--fg-4)' }}> ({item.incentivePayouts.length})</span>}</>}
                                          value={`+${formatMoney(item.incentiveAmount)}`}
                                          valueColor="var(--brand-ink)"
                                        />
                                        {(item.incentivePayouts || []).length > 0 && (
                                          <div style={{ marginLeft: 12, display: 'grid', gap: 2 }}>
                                            {item.incentivePayouts.map((pay, pi) => (
                                              <div key={pay.recordId || pi} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                                                <span>
                                                  · {pay.role === 'recruiter' ? 'Recruiter' : 'Account Manager'}
                                                  {pay.clientName ? ` · ${pay.clientName}` : ''}
                                                  {pay.serviceMonth ? ` · ${pay.serviceMonth}` : ''}
                                                </span>
                                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(pay.amount)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {/* F&F earnings (leave encashment + other additions) */}
                                    {item.fnfAdjustments && item.fnfAdjustments.leaveEncashment > 0 && (
                                      <KV small label="F&F: Leave Encashment" value={`+${formatMoney(item.fnfAdjustments.leaveEncashment)}`} valueColor={INK.warn} />
                                    )}
                                    {item.fnfAdjustments && item.fnfAdjustments.otherAdditions > 0 && (
                                      <KV
                                        small
                                        label={`F&F: Other Additions${item.fnfAdjustments.otherAdditionNotes ? ` — ${item.fnfAdjustments.otherAdditionNotes}` : ''}`}
                                        value={`+${formatMoney(item.fnfAdjustments.otherAdditions)}`}
                                        valueColor={INK.warn}
                                      />
                                    )}

                                    {/* Contractor-specific fields */}
                                    {item.payrollMode === 'contractor' && (
                                      <>
                                        {item.payType && <KV small label="Pay Type" value={<span style={{ textTransform: 'capitalize' }}>{item.payType}</span>} />}
                                        {item.rate > 0 && <KV small label="Rate" value={`${formatMoney(item.rate)}/${item.payType === 'daily' ? 'day' : 'month'}`} />}
                                        {item.projects?.length > 0 && <KV small label="Projects" value={item.projects.join(', ')} />}
                                      </>
                                    )}

                                    {/* Working days */}
                                    <KV small label={item.payrollMode === 'contractor' ? 'Timesheet Days' : 'Working Days'} value={`${item.effectiveDays} of ${item.totalWorkingDays}`} />
                                    {item.payrollMode === 'contractor' && item.paidLeave > 0 && (
                                      <KV
                                        small
                                        label="Paid Leave"
                                        valueColor={INK.net}
                                        value={`+${item.paidLeave} day${item.paidLeave === 1 ? '' : 's'}${item.payType === 'daily' && item.rate > 0
                                          ? ` × ${formatMoney(item.rate)} = +${formatMoney(item.paidLeave * item.rate)}`
                                          : ''}`}
                                      />
                                    )}
                                    {item.lopDays > 0 && <KV small label="LOP Days" value={item.lopDays} valueColor={INK.deduct} />}

                                    <KV top strong label="Total Earnings" value={formatMoney(displayGross)} />

                                    {/* Deductions */}
                                    <Legend style={{ borderTop: '1px solid var(--line-2)', paddingTop: 8, marginTop: 4 }}>Deductions</Legend>
                                    {item.employeePf > 0 && <KV label="Employee PF" value={formatMoney(item.employeePf)} valueColor={INK.deduct} />}
                                    {item.employerPf > 0 && <KV label="Employer PF" value={formatMoney(item.employerPf)} valueColor={INK.deduct} />}
                                    {item.employeeEsi > 0 && <KV label="Employee ESI" value={formatMoney(item.employeeEsi)} valueColor={INK.deduct} />}
                                    {item.employerEsi > 0 && <KV label="Employer ESI" value={formatMoney(item.employerEsi)} valueColor={INK.deduct} />}
                                    {item.professionalTax > 0 && <KV label="Professional Tax" value={formatMoney(item.professionalTax)} valueColor={INK.deduct} />}
                                    {item.tds > 0 && <KV label="TDS (Income Tax)" value={formatMoney(item.tds)} valueColor={INK.deduct} />}

                                    {/* Ad-hoc deductions (live from run) */}
                                    {liveDeductions.map((a, i) => (
                                      <KV key={`d-${i}`} small label={a.label} value={formatMoney(a.amount)} valueColor={INK.deduct} />
                                    ))}

                                    {/* F&F deductions */}
                                    {item.fnfAdjustments && item.fnfAdjustments.noticePeriodRecovery > 0 && (
                                      <KV small label="F&F: Notice Period Recovery" value={formatMoney(item.fnfAdjustments.noticePeriodRecovery)} valueColor={INK.warn} />
                                    )}
                                    {item.fnfAdjustments && item.fnfAdjustments.assetDeductions > 0 && (
                                      <KV small label="F&F: Asset Deductions" value={formatMoney(item.fnfAdjustments.assetDeductions)} valueColor={INK.warn} />
                                    )}
                                    {item.fnfAdjustments && item.fnfAdjustments.loanRecovery > 0 && (
                                      <KV small label="F&F: Loan / Advance Recovery" value={formatMoney(item.fnfAdjustments.loanRecovery)} valueColor={INK.warn} />
                                    )}
                                    {item.fnfAdjustments && item.fnfAdjustments.otherDeductions > 0 && (
                                      <KV
                                        small
                                        label={`F&F: Other Deductions${item.fnfAdjustments.otherDeductionNotes ? ` — ${item.fnfAdjustments.otherDeductionNotes}` : ''}`}
                                        value={formatMoney(item.fnfAdjustments.otherDeductions)}
                                        valueColor={INK.warn}
                                      />
                                    )}

                                    <KV top strong label="Total Deductions" value={formatMoney(displayDeductions)} valueColor={INK.deduct} />

                                    <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                      <span style={{ font: "700 14px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Net Pay</span>
                                      <span style={{ font: "700 14px/1.3 'Inter', system-ui, sans-serif", color: INK.net, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(displayNet)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Right — Bank Details */}
                                <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                                  <Legend>Bank Details</Legend>
                                  <div style={{ background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line)', borderRadius: 'var(--r-2)', padding: 12, display: 'grid', gap: 5 }}>
                                    <KV label="Bank" value={item.bankDetails?.bankName || '—'} />
                                    <KV label="A/c No." value={item.bankDetails?.accountNumber || '—'} />
                                    <KV label="IFSC" value={item.bankDetails?.ifsc || '—'} />
                                    <KV label="PAN" value={item.panNumber || '—'} />
                                  </div>
                                  {item.disbursementDate && (
                                    <div style={{ background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line)', borderRadius: 'var(--r-2)', padding: 12 }}>
                                      <KV
                                        label="Disbursement Date"
                                        value={new Date(item.disbursementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Salary Hold Banner */}
                              {item.salaryHold && (
                                <Callout tone="warn" icon={<PauseCircle size={14} />} title="Salary On Hold"
                                  actions={(
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleReleaseHold(item.salaryHold._id); }}
                                      disabled={releasingHoldId === item.salaryHold._id}
                                      iconLeft={releasingHoldId === item.salaryHold._id ? <Loader2 size={12} className="animate-spin" /> : undefined}
                                    >
                                      {releasingHoldId === item.salaryHold._id ? 'Releasing...' : 'Release Hold'}
                                    </Button>
                                  )}
                                >
                                  <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 }}>
                                    {item.salaryHold.reason}
                                  </p>
                                  {/* Deciding is not releasing. The hold stays on either
                                      way; what changes is whether the incentive for this
                                      month is still waiting on a payroll release. */}
                                  {item.salaryHold.decision === 'will_not_pay' && (
                                    <Chip tone="danger" style={{ marginTop: 6 }}>Decided — not paying</Chip>
                                  )}
                                  <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '6px 0 0' }}>
                                    {item.salaryHold.decision === 'will_not_pay'
                                      ? 'Cost settled at ₹0, so incentive drafts can be created for this month.'
                                      : 'Undecided — incentive stays on hold until this is settled or the salary is paid.'}
                                  </p>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    style={{ marginTop: 8 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDecideHold(
                                        item.salaryHold._id,
                                        item.salaryHold.decision === 'will_not_pay' ? 'undecided' : 'will_not_pay',
                                      );
                                    }}
                                    disabled={decidingHoldId === item.salaryHold._id}
                                  >
                                    {decidingHoldId === item.salaryHold._id
                                      ? 'Saving…'
                                      : item.salaryHold.decision === 'will_not_pay'
                                        ? 'Back to undecided'
                                        : 'We are not paying this month'}
                                  </Button>
                                </Callout>
                              )}

                              {/* Action buttons */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {['processed', 'finalized', 'paid'].includes(run.status) && (
                                  <Button variant="secondary" size="sm" iconLeft={<Download size={12} />}
                                    onClick={(e) => { e.stopPropagation(); handleDownloadPayslip(item.employeeId, item.employeeName); }}>
                                    Download Payslip
                                  </Button>
                                )}
                                {['draft', 'processed'].includes(run.status) && !run.inputsLocked && (
                                  <Button variant="secondary" size="sm" iconLeft={<Plus size={12} />}
                                    onClick={(e) => { e.stopPropagation(); openAdHoc(item); }}>
                                    Ad-hoc Adjustment
                                  </Button>
                                )}
                                {!item.salaryHold && run.status !== 'paid' && (
                                  <Button variant="secondary" size="sm" iconLeft={<PauseCircle size={12} />}
                                    onClick={(e) => { e.stopPropagation(); setShowHoldModal({ employeeId: item.employeeId, employeeName: item.employeeName }); }}>
                                    Hold Salary
                                  </Button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.length === 0 && <EmptyState title="No items." >Process the payroll to calculate.</EmptyState>}
          {items.length > 0 && visibleItems.length === 0 && (
            <EmptyState
              title={searchQuery
                ? <>No employees match &ldquo;{searchQuery}&rdquo;{empTypeFilter !== 'all' ? ' in this tab' : ''}.</>
                : 'No employees in this tab.'}
              actions={(
                <Button variant="secondary" size="sm" onClick={() => { setEmpSearch(''); setEmpTypeFilter('all'); }}>
                  Clear search &amp; show all {items.length}
                </Button>
              )}
            >
              Searches name, employee code and PAN.
            </EmptyState>
          )}
        </Panel>

        {/* ── Ad-Hoc Adjustment ── */}
        <Modal
          open={!!showAdHoc}
          onClose={() => setShowAdHoc(null)}
          size="md"
          title="Ad-hoc Adjustments"
          sub={showAdHoc?.employeeName}
          footer={(
            <>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setShowAdHoc(null)} disabled={savingAdHoc}>Cancel</Button>
              <Button size="sm" onClick={handleSaveAdHoc} disabled={savingAdHoc}
                iconLeft={savingAdHoc ? <Loader2 size={14} className="animate-spin" /> : undefined}>
                {savingAdHoc ? 'Saving & Recalculating...' : 'Save'}
              </Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            {[
              { key: 'earnings', label: 'Earnings (Bonus, Incentive, etc.)' },
              { key: 'deductions', label: 'Deductions' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <span style={{ font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{label}</span>
                  <Button variant="ghost" size="sm" onClick={() => setAdHocForm(f => ({ ...f, [key]: [...f[key], { label: '', amount: 0 }] }))}>+ Add</Button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {adHocForm[key].map((row, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Input
                        type="text" placeholder="Label" value={row.label}
                        aria-label={`${label} ${i + 1} label`}
                        onChange={ev => { const n = [...adHocForm[key]]; n[i].label = ev.target.value; setAdHocForm(f => ({ ...f, [key]: n })); }}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <Input
                        type="number" min="0" placeholder="Amount" value={row.amount}
                        aria-label={`${label} ${i + 1} amount`}
                        onChange={ev => { const n = [...adHocForm[key]]; n[i].amount = Number(ev.target.value); setAdHocForm(f => ({ ...f, [key]: n })); }}
                        style={{ width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      />
                      <Button variant="ghost" size="sm" aria-label={`Remove ${label} ${i + 1}`} iconLeft={<X size={14} />}
                        onClick={() => { const n = adHocForm[key].filter((_, j) => j !== i); setAdHocForm(f => ({ ...f, [key]: n })); }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>

        {/* ── Salary Hold ── */}
        <Modal
          open={!!showHoldModal}
          onClose={() => setShowHoldModal(null)}
          size="sm"
          title="Hold Salary"
          sub={showHoldModal?.employeeName}
          footer={(
            <>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setShowHoldModal(null)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateHold} disabled={!holdReason.trim() || savingHold}
                iconLeft={savingHold ? <Loader2 size={14} className="animate-spin" /> : undefined}>
                {savingHold ? 'Holding...' : 'Hold'}
              </Button>
            </>
          )}
        >
          <div>
            <label htmlFor="hold-reason" style={{ display: 'block', font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
              Reason for hold
            </label>
            <Input
              id="hold-reason" type="text" value={holdReason}
              onChange={e => setHoldReason(e.target.value)}
              placeholder="e.g., Client payment pending" autoFocus
            />
          </div>
        </Modal>

        {/* ── Release Payslips ── */}
        <Modal
          open={showReleaseModal}
          onClose={() => setShowReleaseModal(false)}
          size="md"
          icon={<Send size={18} />}
          title="Release Payslips"
          sub="Emails a payslip to every selected employee and makes it visible in ESS."
          footer={(
            <>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setShowReleaseModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleReleasePayslips} disabled={releasing || releaseSelection.size === 0}
                iconLeft={releasing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}>
                {releasing ? 'Releasing...' : `Release (${releaseSelection.size})`}
              </Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                {releaseSelection.size} of {items.length} selected
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {/* On-hold employees are excluded from Select All and their rows disabled */}
                <Button variant="ghost" size="sm" onClick={() => setReleaseSelection(new Set(items.filter(i => isReleasable(run, i)).map(i => i.employeeId)))}>Select All</Button>
                <Button variant="ghost" size="sm" onClick={() => setReleaseSelection(new Set())}>Deselect All</Button>
              </div>
            </div>
            {items.map(item => {
              const alreadyReleased = isPayslipReleasedFor(run, item.employeeId);
              // Net 0 means nothing was computed — releasing emails an empty
              // payslip, so the row is locked out the same as a salary hold.
              const noPay = !alreadyReleased && !item.salaryHold && !(Number(item.netSalary) > 0);
              // Previously only `item.salaryHold` locked a row, so an employee
              // already paid weeks ago could be re-ticked and re-emailed.
              const locked = !!item.salaryHold || alreadyReleased || noPay;
              return (
                <label key={item.employeeId} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 'var(--r-1)',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.5 : 1,
                  background: locked ? 'var(--surface-2)' : 'transparent',
                }}>
                  <input
                    type="checkbox"
                    checked={releaseSelection.has(item.employeeId)}
                    disabled={locked}
                    onChange={() => {
                      if (locked) return;
                      const next = new Set(releaseSelection);
                      next.has(item.employeeId) ? next.delete(item.employeeId) : next.add(item.employeeId);
                      setReleaseSelection(next);
                    }}
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: locked ? 'var(--fg-4)' : 'var(--fg)' }}>{item.employeeName}</span>
                    {item.salaryHold && <Chip tone="warn">On Hold</Chip>}
                    {alreadyReleased && !item.salaryHold && <Chip tone="brand">Already released</Chip>}
                    {noPay && <Chip tone="neutral">No pay computed</Chip>}
                  </span>
                  <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: INK.net, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.netSalary)}</span>
                </label>
              );
            })}
          </div>
        </Modal>

        {/* ── Mark Paid ── */}
        <Modal
          open={showMarkPaidConfirm}
          onClose={() => !markingPaid && setShowMarkPaidConfirm(false)}
          size="sm"
          icon={<CheckCircle size={18} />}
          title="Mark Payroll as Paid?"
          sub={`${MONTHS[run.month]} ${run.year}`}
          footer={(
            <>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setShowMarkPaidConfirm(false)} disabled={markingPaid}>Cancel</Button>
              <Button size="sm" onClick={handleMarkPaid} disabled={markingPaid}
                iconLeft={markingPaid ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}>
                {markingPaid ? 'Marking...' : 'Mark Paid'}
              </Button>
            </>
          )}
        >
          {(() => {
            // Employees with an active salary hold are NOT disbursed —
            // counting them would overstate the amount being confirmed.
            const payableItems = items.filter(i => !i.salaryHold);
            const heldItems = items.filter(i => i.salaryHold);
            const payableTotal = payableItems.reduce((s, i) => s + (i.netSalary || 0), 0);
            const heldTotal = heldItems.reduce((s, i) => s + (i.netSalary || 0), 0);
            return (
              <div style={{ display: 'grid', gap: 8 }}>
                <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>
                  This confirms salaries for {MONTHS[run.month]} {run.year} have been disbursed.
                  Total net payout: <span style={{ color: INK.net, fontWeight: 600 }}>{formatMoney(payableTotal)}</span> across {payableItems.length} employee{payableItems.length !== 1 ? 's' : ''}.
                </p>
                {heldItems.length > 0 && (
                  <Callout tone="warn">
                    Excludes {heldItems.length} employee{heldItems.length !== 1 ? 's' : ''} on salary hold ({formatMoney(heldTotal)} withheld).
                  </Callout>
                )}
              </div>
            );
          })()}
        </Modal>

        {/* Finalize consequence dialog. Finalizing does not just "lock" — it
            makes the run un-processable, which on a two-cohort month blocks the
            work still to come. State that plainly, and name who has no payslip
            yet. finalizeWarning() supplies the caution text so it matches
            legacy word for word. */}
        <Modal
          open={showFinalizeConfirm}
          onClose={() => !finalizing && setShowFinalizeConfirm(false)}
          size="sm"
          icon={finalizeCaution ? <AlertTriangle size={18} /> : <Lock size={18} />}
          tone={finalizeCaution ? 'warn' : undefined}
          title="Finalize this run?"
          sub={`${MONTHS[run.month]} ${run.year}`}
          footer={(
            <>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setShowFinalizeConfirm(false)} disabled={finalizing}>Cancel</Button>
              <Button size="sm" onClick={handleFinalize} disabled={finalizing}
                iconLeft={finalizing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}>
                {finalizing ? 'Finalizing...' : finalizeCaution ? 'Finalize anyway' : 'Finalize'}
              </Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>
              Finalizing marks the run complete so it can be paid.{' '}
              <span style={{ color: 'var(--fg)', fontWeight: 500 }}>It also blocks re-processing</span>
              {' '}— figures can no longer be recomputed unless you unfinalize.
            </p>
            {finalizeCaution && (
              <Callout tone="warn">
                <p style={{ font: "500 12px/1.5 'Inter', system-ui, sans-serif", margin: 0 }}>{finalizeCaution}</p>
                <ul style={{ font: "400 12px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '6px 0 0', paddingLeft: 14 }}>
                  {releasableItems.length > 0 && (
                    <li>{releasableItems.length} ready to release but not yet sent.</li>
                  )}
                  {needsComputeItems.length > 0 && (
                    <li>{needsComputeItems.length} with no pay computed — these need a re-process, which finalizing prevents.</li>
                  )}
                </ul>
              </Callout>
            )}
          </div>
        </Modal>

        {/* Hold Payslips Confirmation — this button sits next to routine actions
            and un-releasing has invisible side effects (payslips vanish from
            ESS, incentive auto-create silently blocks), so it must never fire on
            a single stray click. */}
        <Modal
          open={showHoldPayslipsConfirm}
          onClose={() => !togglingRelease && setShowHoldPayslipsConfirm(false)}
          size="sm"
          icon={<EyeOff size={18} />}
          title="Hold Payslips?"
          sub={`${MONTHS[run.month]} ${run.year}`}
          footer={(
            <>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setShowHoldPayslipsConfirm(false)} disabled={togglingRelease}>Cancel</Button>
              <Button size="sm" onClick={handleToggleRelease} disabled={togglingRelease}
                iconLeft={togglingRelease ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}>
                {togglingRelease ? 'Holding...' : 'Hold Payslips'}
              </Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>
              This un-releases the payslips
              {Array.isArray(run.releasedEmployeeIds) && run.releasedEmployeeIds.length > 0
                ? ` for all ${run.releasedEmployeeIds.length} released employee${run.releasedEmployeeIds.length !== 1 ? 's' : ''}`
                : ''} — they disappear from everyone&apos;s ESS immediately.
            </p>
            <Callout tone="warn">
              While held, incentive drafts for this month&apos;s consultants will NOT auto-create
              when their invoices are paid, and nothing retries until payslips are released again.
              Re-releasing later re-sends payslip emails.
            </Callout>
          </div>
        </Modal>
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
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="Run Payroll"
        sub="Monthly payroll for all employees & contractors"
        actions={<Button size="sm" onClick={() => setShowCreate(true)} iconLeft={<Plus size={15} />}>New Run</Button>}
      />

      {/* Filters — client-side over the already-loaded runs */}
      {runs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
            <Input
              type="text"
              value={runSearch}
              onChange={e => setRunSearch(e.target.value)}
              placeholder="Search month, year or FY"
              aria-label="Search payroll runs"
              style={{ paddingLeft: 30, paddingRight: 30 }}
            />
            {runSearch && (
              <button onClick={() => setRunSearch('')} aria-label="Clear search" title="Clear search"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'var(--fg-4)', display: 'grid', placeItems: 'center', padding: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
          <Select
            value={runStatusFilter}
            onChange={e => setRunStatusFilter(e.target.value)}
            aria-label="Filter runs by status"
            style={{ width: 'auto' }}
          >
            <option value="all">All statuses ({runs.length})</option>
            {presentStatuses.map(s => (
              <option key={s} value={s}>{statusLabel(s)} ({runs.filter(r => r.status === s).length})</option>
            ))}
          </Select>
          {runsFiltered && (
            <Button variant="ghost" size="sm" onClick={() => { setRunSearch(''); setRunStatusFilter('all'); }}>Reset</Button>
          )}
        </div>
      )}

      {/* Runs table — dense so Net can be compared down a single column */}
      <Panel flush>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Month</th>
                <th style={{ ...th, textAlign: 'left' }}>FY</th>
                <th style={{ ...th, textAlign: 'right' }} title="Rows processed in this run — includes contractors and anyone on salary hold, so it is not a paid headcount">In run</th>
                <th style={{ ...th, textAlign: 'right' }}>Net</th>
                <th style={{ ...th, textAlign: 'left' }}>Status</th>
                <th style={{ ...th, width: 40 }} />
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
                    style={{ borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }}
                  >
                    <td style={{ ...td, font: "600 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{MONTHS[run.month]} {run.year}</td>
                    <td style={{ ...td, color: 'var(--fg-4)' }}>{run.financialYear || '—'}</td>
                    <td style={{ ...numTd, color: 'var(--fg-3)' }}>{hasEmpCount ? fmt(empCount) : <span style={{ color: 'var(--fg-4)' }}>—</span>}</td>
                    <td style={{ ...numTd, color: INK.net, fontWeight: 500 }}>{hasNet ? formatMoney(net) : <span style={{ color: 'var(--fg-4)' }}>—</span>}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Chip tone={STATUS_TONES[run.status] || 'neutral'}>{statusLabel(run.status)}</Chip>
                        {run.payslipReleased && <Chip tone="brand">Released</Chip>}
                        {run.payrollLocked && (
                          <span title="Payroll figures are frozen — the normal state for a finished run"><Chip tone="neutral">Locked</Chip></span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {run.status === 'draft' && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(run._id); }}
                          disabled={!!deletingId}
                          title="Delete this draft run"
                          aria-label={`Delete draft run for ${MONTHS[run.month]} ${run.year}`}
                          iconLeft={deletingId === run._id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <EmptyState title="No payroll runs yet.">Create one to get started.</EmptyState>}
        {runs.length > 0 && visibleRuns.length === 0 && (
          <EmptyState
            title={runQuery
              ? <>No payroll runs match &ldquo;{runSearch.trim()}&rdquo;{runStatusFilter !== 'all' ? ` with status ${statusLabel(runStatusFilter)}` : ''}.</>
              : <>No payroll runs with status {statusLabel(runStatusFilter)}.</>}
            actions={(
              <Button variant="secondary" size="sm" onClick={() => { setRunSearch(''); setRunStatusFilter('all'); }}>
                Clear filters &amp; show all {runs.length}
              </Button>
            )}
          />
        )}
      </Panel>

      {/* ── New run ── */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        size="sm"
        title="New Payroll Run"
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}
              iconLeft={creating ? <Loader2 size={14} className="animate-spin" /> : undefined}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </>
        )}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="new-run-month" style={{ display: 'block', font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>Month</label>
            <Select id="new-run-month" value={newMonth} onChange={e => setNewMonth(Number(e.target.value))}>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </Select>
          </div>
          <div style={{ width: 100 }}>
            <label htmlFor="new-run-year" style={{ display: 'block', font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>Year</label>
            <Input id="new-run-year" type="number" value={newYear} onChange={e => setNewYear(Number(e.target.value))} min="2024" max="2030" style={{ textAlign: 'right' }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
