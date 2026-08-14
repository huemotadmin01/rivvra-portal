import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { getLeaveHistory } from '../../utils/timesheetApi';
import { useToast } from '../../context/ToastContext';
import { ArrowLeft, History } from 'lucide-react';
import { DataTable, EmptyState, Chip , InlineSelect } from '../../components/ds';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const EMP_TYPE_LABELS = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal Consultant',
  intern: 'Intern',
  external_consultant: 'External Consultant',
};

// Ledger event kind → chip tone (mirrors the legacy KIND_META palette).
const KIND_META = {
  accrual: { label: 'Accrual', tone: 'brand' },
  carry_forward: { label: 'Carried Forward', tone: 'info' },
  expiry: { label: 'Expired', tone: 'neutral' },
  correction: { label: 'System Correction', tone: 'info' },
  migration: { label: 'Migration', tone: 'neutral' },
  manual_adjustment: { label: 'Manual Adjustment', tone: 'warn' },
  leave_request: { label: 'Leave', tone: 'brand' },
};

const STATUS_COLOR = {
  approved: 'var(--brand)',
  pending: 'var(--warn)',
  rejected: 'var(--danger)',
  cancelled: 'var(--fg-4)',
};

/* v2 Leave History (Slice 3 Wave A) — same data as LeaveHistory.jsx:
   per-employee summary cards + FY transaction ledger on DataTable. */
export default function LeaveHistoryV2() {
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

  const emp = data?.employee || {};
  const events = data?.events || [];
  const summaryEntries = Object.entries(data?.summary || {});

  const detailRow = (label, value, color = 'var(--fg-2)') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', font: '450 12px/1.6 var(--font)' }}>
      <span style={{ color: 'var(--fg-4)' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );

  const columns = [
    { key: 'date', header: 'Date', muted: true, width: 110, render: (ev) => fmtDate(ev.date) },
    {
      key: 'kind', header: 'Event', width: 150,
      render: (ev) => {
        const meta = KIND_META[ev.kind] || KIND_META.manual_adjustment;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Chip tone={meta.tone}>{meta.label}</Chip>
            {ev.reconstructed && <span style={{ font: '450 9px/1 var(--font)', color: 'var(--fg-4)' }} title="Reconstructed from policy schedule">est.</span>}
          </span>
        );
      },
    },
    {
      key: 'leaveType', header: 'Leave Type', width: 130,
      render: (ev) => (ev.kind === 'leave_request' && ev.leaveType === 'lop') ? 'Loss of Pay' : typeName(ev.leaveType),
    },
    {
      key: 'details', header: 'Details', wrap: true,
      render: (ev) => ev.kind === 'leave_request' ? (
        <span style={{ font: '450 12px/1.5 var(--font)', color: 'var(--fg-3)' }}>
          <span style={{ color: STATUS_COLOR[ev.status] || 'var(--fg-2)' }}>{ev.status}</span>
          {' · '}{fmtDate(ev.fromDate)}{ev.toDate && ev.toDate !== ev.fromDate ? `–${fmtDate(ev.toDate)}` : ''}
          {ev.isHalfDay ? ' · half-day' : ''}
          {ev.lopDays > 0 ? ` · ${fmt(ev.lopDays)} LOP` : ''}
          {ev.reason ? ` · ${ev.reason}` : ''}
        </span>
      ) : (
        <span style={{ font: '450 12px/1.5 var(--font)', color: 'var(--fg-3)' }}>
          {ev.reason}{ev.actor && ev.actor !== 'Leave Accrual Cron' && ev.actor !== 'Leave Accrual (reconstructed)' ? ` · ${ev.actor}` : ''}
        </span>
      ),
    },
    {
      key: 'delta', header: 'Change', align: 'right', width: 100,
      render: (ev) => {
        const isLopReq = ev.kind === 'leave_request' && ev.leaveType === 'lop';
        return (
          <span style={{ fontWeight: 550, color: ev.delta > 0 ? 'var(--brand)' : ev.delta < 0 ? 'var(--danger)' : 'var(--fg-4)' }}>
            {ev.delta > 0 ? '+' : ''}{ev.delta !== 0 ? fmt(ev.delta) : (isLopReq && ev.lopDays ? `(${fmt(ev.lopDays)} LOP)` : '—')}
          </span>
        );
      },
    },
    {
      key: 'runningBalance', header: 'Balance', align: 'right', width: 90,
      render: (ev) => ev.countsToBalance ? fmt(ev.runningBalance) : <span style={{ color: 'var(--fg-4)' }}>—</span>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <button
            type="button"
            onClick={() => navigate(orgPath('/timesheet/leave/balances'))}
            style={{ display: 'flex', alignItems: 'center', gap: 6, font: '500 13px/1 var(--font)', color: 'var(--fg-4)', marginBottom: 8 }}
          >
            <ArrowLeft size={14} /> Back to Leave Balances
          </button>
          <h1 style={{ font: '650 22px/1.2 var(--font)', color: 'var(--fg)', letterSpacing: '-0.015em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={20} style={{ color: 'var(--a-ess, var(--brand))' }} /> Leave History — {emp.name || '…'}
          </h1>
          {data && (
            <p style={{ font: '450 13px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 4 }}>
              {EMP_TYPE_LABELS[emp.employmentType] || emp.employmentType || '—'}
              {emp.billable === false ? ' · Non-billable' : ''}
              {emp.email ? ` · ${emp.email}` : ''}
              {emp.joiningDate ? ` · Joined ${fmtDate(emp.joiningDate)}` : ''}
            </p>
          )}
        </div>
        {data?.availableFYs?.length > 0 && (
          <InlineSelect value={fy} onChange={e => setFy(e.target.value)}>
            {data.availableFYs.map(y => <option key={y} value={y}>FY {y}</option>)}
          </InlineSelect>
        )}
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14, marginBottom: 16 }}>
          {summaryEntries.filter(([code]) => code !== 'lop').map(([code, s]) => {
            const reconciles = Math.abs((s.available || 0) - (s.ledgerRunning || 0)) < 0.01;
            return (
              <div key={code} style={{ background: 'var(--surface-1)', borderRadius: 'var(--r-3)', boxShadow: 'inset 0 0 0 1px var(--line)', padding: 16 }}>
                <p style={{ font: '600 12px/1.3 var(--font)', color: 'var(--fg)', marginBottom: 10 }}>{typeName(code)}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detailRow('Entitled', fmt(s.entitled))}
                  {detailRow('Accrued', fmt(s.accrued))}
                  {(s.carriedForward || 0) > 0 && detailRow('Carried Forward', fmt(s.carriedForward), 'var(--info)')}
                  {(s.manualAdjustment || 0) !== 0 && detailRow('Manual Adjustment', `${s.manualAdjustment > 0 ? '+' : ''}${fmt(s.manualAdjustment)}`, s.manualAdjustment > 0 ? 'var(--brand)' : 'var(--danger)')}
                  {detailRow('Used', fmt(s.used), 'var(--danger)')}
                  {(s.pending || 0) > 0 && detailRow('Pending', fmt(s.pending), 'var(--warn)')}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, borderTop: '1px solid var(--line)', font: '600 12.5px/1.5 var(--font)' }}>
                    <span style={{ color: 'var(--fg)' }}>Available</span>
                    <span style={{ color: (s.available || 0) <= 0 ? 'var(--danger)' : 'var(--brand)' }}>{fmt(s.available)}</span>
                  </div>
                  {!reconciles && (
                    <p style={{ font: '450 10px/1.5 var(--font)', color: 'var(--warn)', paddingTop: 4 }}>
                      Ledger total ({fmt(s.ledgerRunning)}) differs from balance — pre-Rivvra/migrated data.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {(data.summary?.lop?.used || 0) > 0 && (
            <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--r-3)', boxShadow: 'inset 0 0 0 1px var(--line)', padding: 16 }}>
              <p style={{ font: '600 12px/1.3 var(--font)', color: 'var(--fg)', marginBottom: 10 }}>Loss of Pay (LOP)</p>
              {detailRow('LOP Days', fmt(data.summary.lop.used), 'var(--danger)')}
            </div>
          )}
        </div>
      )}

      <p style={{ font: '600 13px/1.3 var(--font)', color: 'var(--fg)', margin: '0 0 8px 2px' }}>
        Transaction Ledger{fy ? ` · FY ${fy}` : ''}
      </p>
      <DataTable
        columns={columns}
        rows={events}
        rowKey={(ev, i) => i}
        loading={loading}
        resizable={false}
        empty={(
          <EmptyState icon={<History size={22} />} title="No leave activity" compact>
            No leave activity recorded for FY {fy}.
          </EmptyState>
        )}
      />
    </div>
  );
}
