// ============================================================================
// MyFnfReceipt.jsx — Read-only F&F settlement view for alumni
// ============================================================================
//
// Backed by GET /api/org/:slug/fnf/my-settlement, which only returns settlements
// with status 'finalized' or 'paid' so alumni can't see draft numbers.
// ============================================================================

import { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import fnfApi from '../../utils/fnfApi';
import { FileText, AlertCircle, CheckCircle2 } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function MyFnfReceipt() {
  const { orgSlug } = usePlatform();
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settlement, setSettlement] = useState(null);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fnfApi.getMySettlement(orgSlug);
        if (!cancelled) setSettlement(res?.data || null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load settlement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug]);

  if (loading) {
    return (
      <div className="p-6">
        <span className="text-sm text-dark-500">Loading F&F receipt...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      </div>
    );
  }

  if (!settlement) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-dark-400" />
          <h1 className="text-lg font-semibold text-white">F&F Receipt</h1>
        </div>
        <div className="p-4 border border-dark-700 bg-dark-900/50 rounded-md text-sm text-dark-400">
          Your Full & Final settlement for {currentOrg?.name || 'this organization'} has not been finalized yet.
          Once your former employer finalizes the settlement, it will appear here.
        </div>
      </div>
    );
  }

  const calc = settlement.calculation || {};
  const leaveEnc = Number(calc.leaveEncashment?.amount || 0);
  const noticeRec = Number(calc.noticePeriod?.recoveryAmount || 0);
  const assetDed = Number(calc.assetDeductions?.totalAmount || 0);
  const loanRec = Number(settlement.loanRecovery || 0);
  const otherAdd = Number(settlement.otherAddition || 0);
  const otherDed = Number(settlement.otherDeduction || 0);
  const totalEarnings = Number(settlement.totalEarnings ?? (leaveEnc + otherAdd));
  const totalDeductions = Number(settlement.totalDeductions ?? (noticeRec + assetDed + loanRec + otherDed));
  const net = Number(settlement.netSettlement ?? (totalEarnings - totalDeductions));

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-dark-400" />
          <h1 className="text-lg font-semibold text-white">F&F Receipt</h1>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          {settlement.status === 'paid' ? 'Paid' : 'Finalized'}
        </span>
      </div>

      <div className="text-xs text-dark-500">
        Finalized on <span className="text-dark-300">{fmtDate(settlement.finalizedAt || settlement.updatedAt)}</span>
        {settlement.paidAt && <> · Paid on <span className="text-dark-300">{fmtDate(settlement.paidAt)}</span></>}
      </div>

      {/* Earnings */}
      <div className="border border-dark-700 rounded-md bg-dark-900/40">
        <div className="px-3 py-2 border-b border-dark-700 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
          Earnings
        </div>
        <div className="divide-y divide-dark-800">
          <Row label="Leave encashment" amount={leaveEnc} />
          {otherAdd > 0 && <Row label="Other additions" amount={otherAdd} note={settlement.otherAdditionNotes} />}
          <div className="flex items-center justify-between px-3 py-2 bg-dark-900/60">
            <span className="text-sm font-medium text-dark-200">Total Earnings</span>
            <span className="text-sm font-bold text-emerald-400">INR {fmt(totalEarnings)}</span>
          </div>
        </div>
      </div>

      {/* Deductions */}
      <div className="border border-dark-700 rounded-md bg-dark-900/40">
        <div className="px-3 py-2 border-b border-dark-700 text-xs font-semibold text-red-400 uppercase tracking-wider">
          Deductions
        </div>
        <div className="divide-y divide-dark-800">
          {noticeRec > 0 && <Row label="Notice period recovery" amount={noticeRec} />}
          {assetDed > 0 && <Row label="Asset deductions" amount={assetDed} />}
          {loanRec > 0 && <Row label="Loan / advance recovery" amount={loanRec} />}
          {otherDed > 0 && <Row label="Other deductions" amount={otherDed} note={settlement.otherDeductionNotes} />}
          {(noticeRec + assetDed + loanRec + otherDed) === 0 && (
            <div className="px-3 py-3 text-xs text-dark-500 italic">No deductions</div>
          )}
          <div className="flex items-center justify-between px-3 py-2 bg-dark-900/60">
            <span className="text-sm font-medium text-dark-200">Total Deductions</span>
            <span className="text-sm font-bold text-red-400">INR {fmt(totalDeductions)}</span>
          </div>
        </div>
      </div>

      {/* Net */}
      <div className="border border-rivvra-500/40 bg-rivvra-500/10 rounded-md px-3 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Net Settlement</span>
        <span className={`text-lg font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          INR {fmt(net)}
        </span>
      </div>

      {settlement.notes && (
        <div className="text-xs text-dark-500">
          <span className="text-dark-400 font-medium">Notes:</span> {settlement.notes}
        </div>
      )}

      <p className="text-[11px] text-dark-500 italic pt-2">
        This is a read-only view. For corrections, contact the admin of {currentOrg?.name || 'your former employer'}.
      </p>
    </div>
  );
}

function Row({ label, amount, note }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-dark-300">{label}</span>
        <span className="text-sm text-white">INR {fmt(amount)}</span>
      </div>
      {note && <p className="text-[11px] text-dark-500 mt-0.5">{note}</p>}
    </div>
  );
}
