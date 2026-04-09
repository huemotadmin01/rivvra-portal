import { useState, useEffect, useRef } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import fnfApi from '../../utils/fnfApi';
import {
  Loader2, Calculator, CheckCircle2, AlertTriangle, FileText, IndianRupee,
  Calendar, Clock, Package, ShieldCheck, Download, RotateCcw, Lock, Unlock,
} from 'lucide-react';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function FnFSettlement({ employeeId, employee }) {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [calculation, setCalculation] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Manual overrides
  const [resignationDate, setResignationDate] = useState('');
  const [noticeDaysServed, setNoticeDaysServed] = useState('');
  const [loanRecovery, setLoanRecovery] = useState('');
  const [otherDeductions, setOtherDeductions] = useState('');
  const [otherDeductionNotes, setOtherDeductionNotes] = useState('');
  const [otherAdditions, setOtherAdditions] = useState('');
  const [otherAdditionNotes, setOtherAdditionNotes] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { load(); }, [employeeId, orgSlug]);

  async function load() {
    setLoading(true);
    try {
      const [calcRes, settRes] = await Promise.all([
        fnfApi.calculate(orgSlug, employeeId).catch(() => null),
        fnfApi.getSettlement(orgSlug, employeeId).catch(() => null),
      ]);
      if (calcRes?.data) setCalculation(calcRes.data);
      if (settRes?.data) {
        setSettlement(settRes.data);
        // Populate form from existing settlement
        setLoanRecovery(settRes.data.loanRecovery || '');
        setOtherDeductions(settRes.data.otherDeductions || '');
        setOtherDeductionNotes(settRes.data.otherDeductionNotes || '');
        setOtherAdditions(settRes.data.otherAdditions || '');
        setOtherAdditionNotes(settRes.data.otherAdditionNotes || '');
        setNotes(settRes.data.notes || '');
        setResignationDate(settRes.data.employeeSnapshot?.resignationDate ? new Date(settRes.data.employeeSnapshot.resignationDate).toISOString().split('T')[0] : '');
        setNoticeDaysServed(settRes.data.noticePeriod?.daysServed ?? '');
      } else if (calcRes?.data) {
        setResignationDate(calcRes.data.employee.resignationDate ? new Date(calcRes.data.employee.resignationDate).toISOString().split('T')[0] : '');
        setNoticeDaysServed(calcRes.data.noticePeriod.daysServed);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fnfApi.saveSettlement(orgSlug, employeeId, {
        resignationDate: resignationDate || undefined,
        noticeDaysServed: noticeDaysServed !== '' ? parseInt(noticeDaysServed) : undefined,
        loanRecovery: parseFloat(loanRecovery) || 0,
        otherDeductions: parseFloat(otherDeductions) || 0,
        otherDeductionNotes,
        otherAdditions: parseFloat(otherAdditions) || 0,
        otherAdditionNotes,
        notes,
      });
      if (res.data) setSettlement(res.data);
      showToast('Settlement saved', 'success');
      await load();
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  }

  async function handleFinalize(force = false) {
    setFinalizing(true);
    try {
      const res = await fnfApi.finalize(orgSlug, employeeId, { forceFinalize: force });
      if (res.data) setSettlement(res.data);
      showToast('Settlement finalized', 'success');
      await load();
    } catch (e) {
      if (e.response?.data?.pendingAssets) {
        if (confirm('Employee has pending assets. Finalize anyway?')) {
          await handleFinalize(true);
        }
      } else {
        showToast(e.response?.data?.error || e.message || 'Failed to finalize', 'error');
      }
    } finally { setFinalizing(false); }
  }

  async function handleReopen() {
    try {
      await fnfApi.reopen(orgSlug, employeeId);
      showToast('Settlement reopened', 'success');
      await load();
    } catch (e) { showToast(e.message || 'Failed to reopen', 'error'); }
  }

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const s = settlement || buildPreviewData();
    if (!s) return;
    printWindow.document.write(generatePrintHTML(s, employee));
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  function buildPreviewData() {
    if (!calculation) return null;
    const leaveEnc = calculation.leaveEncashment.amount;
    const noticeRec = calculation.noticePeriod.recoveryAmount;
    const assetDed = calculation.assetDeductions.totalAmount;
    const loanRec = parseFloat(loanRecovery) || 0;
    const otherDed = parseFloat(otherDeductions) || 0;
    const otherAdd = parseFloat(otherAdditions) || 0;
    return {
      ...calculation,
      loanRecovery: loanRec,
      otherDeductions: otherDed,
      otherAdditions: otherAdd,
      totalEarnings: leaveEnc + otherAdd,
      totalDeductions: noticeRec + assetDed + loanRec + otherDed,
      netSettlement: (leaveEnc + otherAdd) - (noticeRec + assetDed + loanRec + otherDed),
    };
  }

  if (loading) return (
    <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 flex items-center gap-2">
      <Calculator size={15} className="text-dark-500" />
      <span className="text-sm text-dark-500">Loading F&F settlement...</span>
      <Loader2 size={14} className="animate-spin text-dark-600" />
    </div>
  );

  if (!calculation) return (
    <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 text-dark-500">
        <Calculator size={15} />
        <span className="text-sm">Unable to calculate F&F — salary record may be missing</span>
      </div>
    </div>
  );

  const isFinalized = settlement?.status === 'finalized';
  const data = settlement || calculation;
  const leaveEnc = data.leaveEncashment?.amount || 0;
  const noticeRec = data.noticePeriod?.recoveryAmount || 0;
  const assetDed = data.assetDeductions?.totalAmount || 0;
  const loanRec = settlement?.loanRecovery || parseFloat(loanRecovery) || 0;
  const otherDed = settlement?.otherDeductions || parseFloat(otherDeductions) || 0;
  const otherAdd = settlement?.otherAdditions || parseFloat(otherAdditions) || 0;
  const totalEarnings = leaveEnc + otherAdd;
  const totalDeductions = noticeRec + assetDed + loanRec + otherDed;
  const netSettlement = totalEarnings - totalDeductions;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Calculator size={16} /> Full & Final Settlement
        </h3>
        <div className="flex items-center gap-2">
          {isFinalized ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 size={12} /> Finalized
            </span>
          ) : settlement ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
              <FileText size={12} /> Draft
            </span>
          ) : null}
        </div>
      </div>

      {/* Salary Info */}
      <div className="bg-dark-800/40 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><p className="text-[10px] text-dark-500 uppercase">Monthly Gross</p><p className="text-sm text-white font-medium">INR {fmt(calculation.salary.monthlyGross)}</p></div>
        <div><p className="text-[10px] text-dark-500 uppercase">Monthly Basic</p><p className="text-sm text-white font-medium">INR {fmt(calculation.salary.monthlyBasic)}</p></div>
        <div><p className="text-[10px] text-dark-500 uppercase">Daily Gross</p><p className="text-sm text-dark-300">INR {fmt(calculation.salary.dailyGross)}</p></div>
        <div><p className="text-[10px] text-dark-500 uppercase">Daily Basic</p><p className="text-sm text-dark-300">INR {fmt(calculation.salary.dailyBasic)}</p></div>
      </div>

      {/* ── EARNINGS ── */}
      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-emerald-400">Earnings</h4>

        {/* Leave Encashment */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-300">Leave Encashment</span>
            <span className="text-sm text-emerald-400 font-medium">INR {fmt(leaveEnc)}</span>
          </div>
          <div className="pl-3 space-y-0.5 text-xs text-dark-500">
            {calculation.leaveEncashment.encashmentOnExit === false ? (
              <p className="text-amber-400/80">
                Leave encashment is disabled for this org. Enable
                “Encashment on Exit” in Settings → ESS → Leave Policy.
              </p>
            ) : (calculation.leaveEncashment.perLeaveType || []).length === 0 ? (
              <p className="text-amber-400/80">
                No leave types are marked encashable. Toggle individual leave
                types in Settings → ESS → Leave Policy.
              </p>
            ) : (
              <>
                {calculation.leaveEncashment.perLeaveType.map(p => (
                  <p key={p.code}>{p.name}: {p.available} days available</p>
                ))}
                <p>
                  Total: {calculation.leaveEncashment.totalEncashableLeaves} days
                  {' × '}INR {fmt(calculation.leaveEncashment.dailyBasic)}/day (daily basic)
                </p>
              </>
            )}
          </div>
        </div>

        {/* Other Additions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-300">Other Additions</span>
            {!isFinalized ? (
              <input type="number" value={otherAdditions} onChange={e => setOtherAdditions(e.target.value)}
                placeholder="0" className="w-28 px-2 py-1 text-right bg-dark-900 border border-dark-700 rounded text-sm text-white focus:outline-none focus:border-rivvra-500" />
            ) : (
              <span className="text-sm text-emerald-400 font-medium">INR {fmt(otherAdd)}</span>
            )}
          </div>
          {!isFinalized && (
            <input value={otherAdditionNotes} onChange={e => setOtherAdditionNotes(e.target.value)}
              placeholder="Notes for additions..." className="w-full px-2 py-1 bg-dark-900 border border-dark-700 rounded text-xs text-dark-300 focus:outline-none focus:border-rivvra-500" />
          )}
          {isFinalized && settlement.otherAdditionNotes && <p className="text-xs text-dark-500 pl-3">{settlement.otherAdditionNotes}</p>}
        </div>

        <div className="border-t border-emerald-500/20 pt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Total Earnings</span>
          <span className="text-sm font-bold text-emerald-400">INR {fmt(totalEarnings)}</span>
        </div>
      </div>

      {/* ── DEDUCTIONS ── */}
      <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-red-400">Deductions</h4>

        {/* Notice Period */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-300">Notice Period Recovery</span>
            <span className="text-sm text-red-400 font-medium">INR {fmt(noticeRec)}</span>
          </div>
          <div className="pl-3 text-xs text-dark-500 space-y-0.5">
            {!isFinalized ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>Resignation Date:</span>
                  <input type="date" value={resignationDate} onChange={e => setResignationDate(e.target.value)}
                    className="px-1.5 py-0.5 bg-dark-900 border border-dark-700 rounded text-xs text-white focus:outline-none focus:border-rivvra-500" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Days Served:</span>
                  <input type="number" value={noticeDaysServed} onChange={e => setNoticeDaysServed(e.target.value)}
                    className="w-16 px-1.5 py-0.5 text-right bg-dark-900 border border-dark-700 rounded text-xs text-white focus:outline-none focus:border-rivvra-500" />
                  <span>/ 90</span>
                </div>
              </div>
            ) : (
              <>
                <p>Notice Period: 90 days | Days Served: {data.noticePeriod?.daysServed || 0} | Shortfall: {data.noticePeriod?.shortfall || 0} days</p>
                <p>{data.noticePeriod?.shortfall || 0} days x INR {fmt(calculation.salary.dailyGross)}/day (daily gross)</p>
              </>
            )}
          </div>
        </div>

        {/* Asset Deductions */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-300">Asset Deductions</span>
            <span className="text-sm text-red-400 font-medium">INR {fmt(assetDed)}</span>
          </div>
          {calculation.assetDeductions.items.length > 0 && (
            <div className="pl-3 text-xs text-dark-500">
              {calculation.assetDeductions.items.map((item, i) => (
                <p key={i}>{item.assetName} ({item.condition}) — INR {fmt(item.amount)}</p>
              ))}
            </div>
          )}
          {calculation.pendingAssets.length > 0 && (
            <div className="pl-3 mt-1">
              <p className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle size={10} /> {calculation.pendingAssets.length} asset(s) still pending return</p>
            </div>
          )}
        </div>

        {/* Loan Recovery */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-dark-300">Loan/Advance Recovery</span>
          {!isFinalized ? (
            <input type="number" value={loanRecovery} onChange={e => setLoanRecovery(e.target.value)}
              placeholder="0" className="w-28 px-2 py-1 text-right bg-dark-900 border border-dark-700 rounded text-sm text-white focus:outline-none focus:border-rivvra-500" />
          ) : (
            <span className="text-sm text-red-400 font-medium">INR {fmt(loanRec)}</span>
          )}
        </div>

        {/* Other Deductions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-300">Other Deductions</span>
            {!isFinalized ? (
              <input type="number" value={otherDeductions} onChange={e => setOtherDeductions(e.target.value)}
                placeholder="0" className="w-28 px-2 py-1 text-right bg-dark-900 border border-dark-700 rounded text-sm text-white focus:outline-none focus:border-rivvra-500" />
            ) : (
              <span className="text-sm text-red-400 font-medium">INR {fmt(otherDed)}</span>
            )}
          </div>
          {!isFinalized && (
            <input value={otherDeductionNotes} onChange={e => setOtherDeductionNotes(e.target.value)}
              placeholder="Notes for deductions..." className="w-full px-2 py-1 bg-dark-900 border border-dark-700 rounded text-xs text-dark-300 focus:outline-none focus:border-rivvra-500" />
          )}
          {isFinalized && settlement.otherDeductionNotes && <p className="text-xs text-dark-500 pl-3">{settlement.otherDeductionNotes}</p>}
        </div>

        <div className="border-t border-red-500/20 pt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Total Deductions</span>
          <span className="text-sm font-bold text-red-400">INR {fmt(totalDeductions)}</span>
        </div>
      </div>

      {/* ── NET SETTLEMENT ── */}
      <div className={`rounded-xl p-4 flex items-center justify-between ${
        netSettlement >= 0 ? 'bg-emerald-500/10 border border-emerald-500/25' : 'bg-red-500/10 border border-red-500/25'
      }`}>
        <span className="text-base font-bold text-white">Net Settlement Amount</span>
        <span className={`text-xl font-bold ${netSettlement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {netSettlement < 0 ? '(' : ''}INR {fmt(Math.abs(netSettlement))}{netSettlement < 0 ? ')' : ''}
        </span>
      </div>
      {netSettlement < 0 && (
        <p className="text-xs text-red-400 text-center">Employee owes the company INR {fmt(Math.abs(netSettlement))}</p>
      )}

      {/* Notes */}
      {!isFinalized && (
        <div>
          <label className="text-xs text-dark-400 mb-1 block">Settlement Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Any additional notes..."
            className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500 resize-none" />
        </div>
      )}
      {isFinalized && settlement.notes && (
        <div className="text-xs text-dark-500"><span className="text-dark-400 font-medium">Notes:</span> {settlement.notes}</div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isFinalized && (
          <>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {settlement ? 'Update Draft' : 'Save Draft'}
            </button>
            {settlement && (
              <button onClick={() => handleFinalize(false)} disabled={finalizing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                {finalizing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Finalize
              </button>
            )}
          </>
        )}
        {isFinalized && (
          <button onClick={handleReopen}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors">
            <Unlock size={14} /> Reopen
          </button>
        )}
        {(settlement || calculation) && (
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 text-dark-300 text-sm font-medium hover:bg-dark-600 transition-colors">
            <Download size={14} /> Print / PDF
          </button>
        )}
      </div>
    </div>
  );
}

// ── Print HTML Generator ──
function generatePrintHTML(s, emp) {
  const fmtINR = (n) => Number(n || 0).toLocaleString('en-IN');
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  const empData = s.employeeSnapshot || s.employee || emp || {};
  const salary = s.salarySnapshot || s.salary || {};
  const le = s.leaveEncashment || {};
  const np = s.noticePeriod || {};
  const ad = s.assetDeductions || {};

  return `<!DOCTYPE html><html><head><title>F&F Settlement - ${empData.fullName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #222; font-size: 13px; }
  .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
  .header h1 { font-size: 20px; margin-bottom: 4px; }
  .header p { color: #666; font-size: 12px; }
  .section { margin-bottom: 20px; }
  .section h3 { font-size: 14px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
  .amount { text-align: right; font-family: monospace; }
  .earning { color: #16a34a; }
  .deduction { color: #dc2626; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; font-size: 14px; padding-top: 10px; }
  .net-row td { font-size: 16px; font-weight: bold; border-top: 3px double #333; padding-top: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 15px; }
  .info-grid .label { color: #888; font-size: 11px; }
  .info-grid .value { font-weight: 500; }
  .footer { margin-top: 50px; display: flex; justify-content: space-between; }
  .footer div { text-align: center; }
  .footer .line { width: 180px; border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; font-size: 11px; color: #666; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .status.finalized { background: #dcfce7; color: #16a34a; }
  .status.draft { background: #fef3c7; color: #d97706; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <h1>Full & Final Settlement Statement</h1>
  <p>Huemot Technology Private Limited</p>
  <span class="status ${s.status || 'draft'}">${(s.status || 'draft').toUpperCase()}</span>
</div>

<div class="section">
  <h3>Employee Details</h3>
  <div class="info-grid">
    <div><span class="label">Name:</span> <span class="value">${empData.fullName || '—'}</span></div>
    <div><span class="label">Employee ID:</span> <span class="value">${empData.employeeId || '—'}</span></div>
    <div><span class="label">Date of Joining:</span> <span class="value">${fmtD(empData.joiningDate)}</span></div>
    <div><span class="label">Last Working Date:</span> <span class="value">${fmtD(empData.lastWorkingDate)}</span></div>
    <div><span class="label">Status:</span> <span class="value" style="text-transform:capitalize">${empData.status || '—'}</span></div>
    <div><span class="label">Reason:</span> <span class="value">${empData.separationReason || '—'}</span></div>
    <div><span class="label">Monthly Gross:</span> <span class="value">INR ${fmtINR(salary.monthlyGross)}</span></div>
    <div><span class="label">Monthly Basic:</span> <span class="value">INR ${fmtINR(salary.monthlyBasic)}</span></div>
  </div>
</div>

<div class="section">
  <h3>Settlement Breakdown</h3>
  <table>
    <thead><tr><th>Component</th><th>Details</th><th class="amount">Amount (INR)</th></tr></thead>
    <tbody>
      <tr><td colspan="3" style="font-weight:600; color:#16a34a; padding-top:10px">EARNINGS</td></tr>
      <tr>
        <td>Leave Encashment</td>
        <td>${
          Array.isArray(le.perLeaveType) && le.perLeaveType.length > 0
            ? le.perLeaveType.map(p => `${p.name}: ${p.available}d`).join(' + ')
              + ` = ${le.totalEncashableLeaves || 0}d x INR ${fmtINR(le.dailyBasic)}/day`
            : `${le.totalEncashableLeaves || 0}d x INR ${fmtINR(le.dailyBasic)}/day`
        }</td>
        <td class="amount earning">${fmtINR(le.amount)}</td>
      </tr>
      ${(s.otherAdditions || 0) > 0 ? `<tr><td>Other Additions</td><td>${s.otherAdditionNotes || ''}</td><td class="amount earning">${fmtINR(s.otherAdditions)}</td></tr>` : ''}
      <tr class="total-row"><td colspan="2">Total Earnings</td><td class="amount earning">${fmtINR(s.totalEarnings || le.amount || 0)}</td></tr>

      <tr><td colspan="3" style="font-weight:600; color:#dc2626; padding-top:15px">DEDUCTIONS</td></tr>
      <tr>
        <td>Notice Period Recovery</td>
        <td>90 days - ${np.daysServed || 0} served = ${np.shortfall || 0}d shortfall x INR ${fmtINR(np.dailyGross || salary.dailyGross)}/day</td>
        <td class="amount deduction">${fmtINR(np.recoveryAmount)}</td>
      </tr>
      ${(ad.totalAmount || 0) > 0 ? `<tr><td>Asset Deductions</td><td>${(ad.items||[]).map(i => i.assetName + ' (' + i.condition + ')').join(', ')}</td><td class="amount deduction">${fmtINR(ad.totalAmount)}</td></tr>` : ''}
      ${(s.loanRecovery || 0) > 0 ? `<tr><td>Loan/Advance Recovery</td><td></td><td class="amount deduction">${fmtINR(s.loanRecovery)}</td></tr>` : ''}
      ${(s.otherDeductions || 0) > 0 ? `<tr><td>Other Deductions</td><td>${s.otherDeductionNotes || ''}</td><td class="amount deduction">${fmtINR(s.otherDeductions)}</td></tr>` : ''}
      <tr class="total-row"><td colspan="2">Total Deductions</td><td class="amount deduction">${fmtINR(s.totalDeductions || 0)}</td></tr>

      <tr class="net-row">
        <td colspan="2">NET SETTLEMENT ${(s.netSettlement || 0) < 0 ? '(Employee Owes Company)' : '(Payable to Employee)'}</td>
        <td class="amount" style="color: ${(s.netSettlement || 0) >= 0 ? '#16a34a' : '#dc2626'}">${(s.netSettlement || 0) < 0 ? '(' : ''}INR ${fmtINR(Math.abs(s.netSettlement || 0))}${(s.netSettlement || 0) < 0 ? ')' : ''}</td>
      </tr>
    </tbody>
  </table>
</div>

${s.notes ? `<div class="section"><h3>Notes</h3><p>${s.notes}</p></div>` : ''}

<div class="footer">
  <div><div class="line">Employee Signature</div></div>
  <div><div class="line">HR Signature</div></div>
  <div><div class="line">Finance Signature</div></div>
</div>
<p style="text-align:center; margin-top:30px; color:#999; font-size:10px">Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} | Rivvra HR Platform</p>
</body></html>`;
}
