import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { getLeaveHistory } from '../../utils/timesheetApi';
import { useToast } from '../../context/ToastContext';
import { ArrowLeft, History, Loader2 } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const EMP_TYPE_LABELS = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal Consultant',
  intern: 'Intern',
  external_consultant: 'External Consultant',
};

// Visual style per ledger event kind.
const KIND_META = {
  accrual: { label: 'Accrual', cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  carry_forward: { label: 'Carried Forward', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  expiry: { label: 'Expired', cls: 'bg-dark-600/40 text-dark-300 border-dark-600' },
  correction: { label: 'System Correction', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  migration: { label: 'Migration', cls: 'bg-dark-600/40 text-dark-300 border-dark-600' },
  manual_adjustment: { label: 'Manual Adjustment', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  leave_request: { label: 'Leave', cls: 'bg-rivvra-500/15 text-rivvra-300 border-rivvra-500/30' },
};

const STATUS_CLS = {
  approved: 'text-green-400',
  pending: 'text-amber-400',
  rejected: 'text-red-400',
  cancelled: 'text-dark-400',
};

export default function LeaveHistory() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [fy, setFy] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(fy); }, [orgSlug, employeeId, fy]);

  async function load(selectedFy) {
    setLoading(true);
    try {
      const res = await getLeaveHistory(employeeId, selectedFy ? { fy: selectedFy } : {});
      setData(res);
      if (!selectedFy && res.fy) setFy(res.fy);
    } catch (err) {
      showToast('Failed to load leave history', 'error');
    } finally {
      setLoading(false);
    }
  }

  const typeName = (code) => data?.leaveTypes?.find(t => t.code === code)?.name
    || code?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-rivvra-500" /></div>;
  }
  if (!data) return null;

  const emp = data.employee || {};
  const events = data.events || [];
  const summaryEntries = Object.entries(data.summary || {});

  return (
    <div className="p-3 sm:p-6 space-y-5 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => navigate(orgPath('/timesheet/leave/balances'))}
            className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors mb-2">
            <ArrowLeft size={15} /> Back to Leave Balances
          </button>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <History size={20} className="text-rivvra-400" /> Leave History — {emp.name}
          </h1>
          <p className="text-sm text-dark-400 mt-1">
            {EMP_TYPE_LABELS[emp.employmentType] || emp.employmentType || '—'}
            {emp.billable === false ? ' · Non-billable' : ''}
            {emp.email ? ` · ${emp.email}` : ''}
            {emp.joiningDate ? ` · Joined ${fmtDate(emp.joiningDate)}` : ''}
          </p>
        </div>
        {data.availableFYs?.length > 0 && (
          <select value={fy} onChange={e => setFy(e.target.value)}
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
            {data.availableFYs.map(y => <option key={y} value={y}>FY {y}</option>)}
          </select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryEntries.filter(([code]) => code !== 'lop').map(([code, s]) => {
          const reconciles = Math.abs((s.available || 0) - (s.ledgerRunning || 0)) < 0.01;
          return (
            <div key={code} className="bg-dark-900 rounded-lg border border-dark-800 p-4">
              <p className="text-xs font-medium text-white mb-3">{typeName(code)}</p>
              <div className="space-y-1.5 text-xs">
                <Row label="Entitled" value={fmt(s.entitled)} />
                <Row label="Accrued" value={fmt(s.accrued)} />
                {(s.carriedForward || 0) > 0 && <Row label="Carried Forward" value={fmt(s.carriedForward)} cls="text-blue-400" />}
                {(s.manualAdjustment || 0) !== 0 && <Row label="Manual Adjustment" value={`${s.manualAdjustment > 0 ? '+' : ''}${fmt(s.manualAdjustment)}`} cls={s.manualAdjustment > 0 ? 'text-green-400' : 'text-red-400'} />}
                <Row label="Used" value={fmt(s.used)} cls="text-red-400" />
                {(s.pending || 0) > 0 && <Row label="Pending" value={fmt(s.pending)} cls="text-amber-400" />}
                <div className="flex justify-between pt-2 border-t border-dark-800">
                  <span className="text-white font-medium">Available</span>
                  <span className={`font-semibold ${(s.available || 0) <= 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(s.available)}</span>
                </div>
                {!reconciles && (
                  <p className="text-[10px] text-amber-500/80 pt-1">Ledger total ({fmt(s.ledgerRunning)}) differs from balance — pre-Rivvra/migrated data.</p>
                )}
              </div>
            </div>
          );
        })}
        {(data.summary?.lop?.used || 0) > 0 && (
          <div className="bg-dark-900 rounded-lg border border-dark-800 p-4">
            <p className="text-xs font-medium text-white mb-3">Loss of Pay (LOP)</p>
            <Row label="LOP Days" value={fmt(data.summary.lop.used)} cls="text-red-400" />
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-dark-700 text-sm font-medium text-white">Transaction Ledger · FY {fy}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-dark-700 text-dark-400">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">Event</th>
                <th className="text-left px-3 py-2.5 font-medium">Leave Type</th>
                <th className="text-left px-3 py-2.5 font-medium">Details</th>
                <th className="text-right px-3 py-2.5 font-medium">Change</th>
                <th className="text-right px-4 py-2.5 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const meta = KIND_META[ev.kind] || KIND_META.manual_adjustment;
                const isLopReq = ev.kind === 'leave_request' && ev.leaveType === 'lop';
                return (
                  <tr key={i} className="border-b border-dark-700/40 hover:bg-dark-750/50">
                    <td className="px-4 py-2.5 text-dark-300 whitespace-nowrap">{fmtDate(ev.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.cls} whitespace-nowrap`}>{meta.label}</span>
                      {ev.reconstructed && <span className="ml-1 text-[9px] text-dark-500" title="Reconstructed from policy schedule">est.</span>}
                    </td>
                    <td className="px-3 py-2.5 text-dark-200 whitespace-nowrap">{isLopReq ? 'Loss of Pay' : typeName(ev.leaveType)}</td>
                    <td className="px-3 py-2.5 text-dark-400 text-xs">
                      {ev.kind === 'leave_request' ? (
                        <span>
                          <span className={STATUS_CLS[ev.status] || 'text-dark-300'}>{ev.status}</span>
                          {' · '}{fmtDate(ev.fromDate)}{ev.toDate && ev.toDate !== ev.fromDate ? `–${fmtDate(ev.toDate)}` : ''}
                          {ev.isHalfDay ? ' · half-day' : ''}
                          {ev.lopDays > 0 ? ` · ${fmt(ev.lopDays)} LOP` : ''}
                          {ev.reason ? ` · ${ev.reason}` : ''}
                        </span>
                      ) : (
                        <span>{ev.reason}{ev.actor && ev.actor !== 'Leave Accrual Cron' && ev.actor !== 'Leave Accrual (reconstructed)' ? ` · ${ev.actor}` : ''}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-medium whitespace-nowrap ${ev.delta > 0 ? 'text-green-400' : ev.delta < 0 ? 'text-red-400' : 'text-dark-500'}`}>
                      {ev.delta > 0 ? '+' : ''}{ev.delta !== 0 ? fmt(ev.delta) : (isLopReq && ev.lopDays ? `(${fmt(ev.lopDays)} LOP)` : '—')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-dark-200 whitespace-nowrap">
                      {ev.countsToBalance ? fmt(ev.runningBalance) : <span className="text-dark-600">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {events.length === 0 && (
          <div className="text-center py-12 text-dark-500">No leave activity recorded for FY {fy}</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, cls = 'text-dark-200' }) {
  return (
    <div className="flex justify-between">
      <span className="text-dark-400">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}
