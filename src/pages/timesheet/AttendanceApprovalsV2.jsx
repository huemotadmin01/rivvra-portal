import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { usePeriod } from '../../context/PeriodContext';
import { useCompany } from '../../context/CompanyContext';
import timesheetApi from '../../utils/timesheetApi';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCcw, Loader2, Lock, Mail } from 'lucide-react';
import {
  PageHeader, Tabs, Panel, Chip, Button, Modal, Textarea, Callout, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Sibling of TimesheetApprovals: same approve / reject / revert / remind
// surface, over attendance rather than timesheets. Everything above `return (`
// is spliced in verbatim, including the payroll-lock guard.
//
// It carries the same `controllerRef` defect as its sibling — a plain object
// rather than a `useRef`, rebuilt every render, so the abort does not reliably
// cancel the previous request. Preserved and written up, not fixed here.
//
// It decayed differently from the sibling, though: this file has NO
// `toggleSelectAll` at all, yet still computes `draftFiltered` — the list that
// only ever existed to feed it. So the half-built select-all left a different
// residue in each file. `draftFiltered` stays (it is inside the verbatim
// slice); see REDESIGN-QA.md.
// ─────────────────────────────────────────────────────────────────────────────

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Day-cell accents, replacing legacy's `entryColors` class map.
 *
 * Legacy painted every one of these as a saturated fill with `text-white`, at
 * 9px. emerald-500 + white is 2.54:1, amber-500 is 2.15:1, blue-500 is 3.68:1 —
 * all well below AA. Same fix as my-attendance and the sibling page: the tint
 * carries the state and the digit stays near-black / near-white.
 *
 * `upcoming` is kept to mirror legacy's map exactly, and like legacy's it is
 * never reached — the colour ladder below has no `status === 'upcoming'` branch,
 * so a future day falls through to the default. That is legacy behaviour and is
 * flagged rather than changed.
 */
const ENTRY_ACCENT = {
  working:           'var(--acc-emerald)',
  half_day:          'var(--acc-amber)',
  leave:             'var(--acc-blue)',
  half_day_leave:    'var(--acc-blue)',
  holiday:           'var(--acc-purple)',
  holiday_work:      'var(--acc-orange)',
  holiday_work_half: 'var(--acc-orange)',
  absent:            'var(--danger)',
  weekend:           null,
  not_joined:        null,
  upcoming:          null,
};

/** The ½ variants take a weaker tint of the parent hue, as on my-attendance. */
const HALF_KEYS = new Set(['half_day_leave', 'holiday_work_half']);

const entryTint = (key, pct) => {
  const accent = ENTRY_ACCENT[key];
  if (!accent) return null;
  return `color-mix(in srgb, ${accent} ${HALF_KEYS.has(key) ? pct * 0.6 : pct}%, transparent)`;
};

/** Status pill tone. `rejected` is its own tone here — unlike the sibling,
 *  this page also renders the rejection reason, so the pill should agree. */
const STATUS_TONE = { submitted: 'warn', approved: 'brand', rejected: 'danger', no_entry: 'danger' };

/** Legend, mirroring legacy's seven entries and their order. */
const LEGEND = [
  { label: 'Present', key: 'working' },
  { label: 'Half Day', key: 'half_day' },
  { label: 'Leave', key: 'leave' },
  { label: '½ Leave', key: 'half_day_leave' },
  { label: 'Holiday', key: 'holiday' },
  { label: 'Holiday Work', key: 'holiday_work' },
  { label: 'Weekend', key: 'weekend' },
];

export default function AttendanceApprovalsV2() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState('submitted');
  const [lockedMonths, setLockedMonths] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sendingReminder, setSendingReminder] = useState(null);

  const { month: selectedMonth, year: selectedYear } = usePeriod();

  const controllerRef = { current: null };
  const load = () => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setLoading(true);
    setRecords([]);
    timesheetApi.get(`/attendance/all?month=${selectedMonth}&year=${selectedYear}`, { signal: controllerRef.current.signal })
      .then(r => setRecords(r.data?.attendance || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); return () => controllerRef.current?.abort(); }, [selectedMonth, selectedYear, currentCompany?._id]);

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this attendance?')) return;
    setActionLoading(id);
    try {
      await timesheetApi.patch(`/attendance/${id}/approve`);
      showToast('Attendance approved');
      load();
    } catch (err) { showToast(err.response?.data?.error || err.message || 'Approval failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleRevert = async (id) => {
    if (!window.confirm('Revert this attendance to draft?')) return;
    setActionLoading(id);
    try {
      await timesheetApi.patch(`/attendance/${id}/revert`);
      showToast('Attendance reverted to draft');
      load();
    } catch (err) { showToast(err.response?.data?.error || err.message || 'Revert failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { showToast('Please provide a reason', 'error'); return; }
    setActionLoading(rejectId);
    try {
      await timesheetApi.patch(`/attendance/${rejectId}/reject`, { rejectionReason: rejectReason.trim() });
      showToast('Attendance rejected');
      setRejectId(null); setRejectReason('');
      load();
    } catch (err) { showToast(err.response?.data?.error || err.message || 'Rejection failed', 'error'); }
    finally { setActionLoading(null); }
  };

  // Fetch payroll lock status
  useEffect(() => {
    if (!records.length) return;
    const uniqueKeys = [...new Set(records.map(r => `${r.month}-${r.year}`))];
    Promise.all(uniqueKeys.map(key => {
      const [m, y] = key.split('-');
      return timesheetApi.get('/payroll/run/status', { params: { month: m, year: y } })
        .then(r => ({ key, ...r.data }))
        .catch(() => ({ key, locked: false, status: 'open' }));
    })).then(results => {
      const map = {};
      results.forEach(r => { map[r.key] = r; });
      setLockedMonths(map);
    });
  }, [records]);

  const filtered = records.filter(r => filter === 'all' || r.status === filter);
  const draftFiltered = filtered.filter(r => r.status === 'draft' || r.status === 'rejected' || r.status === 'no_entry');

  const toggleSelect = (empId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(empId) ? next.delete(empId) : next.add(empId);
      return next;
    });
  };

  const sendReminder = async (employeeIds) => {
    const ids = Array.isArray(employeeIds) ? employeeIds : [employeeIds];
    setSendingReminder(ids.length > 1 ? 'bulk' : ids[0]);
    try {
      const res = await timesheetApi.post('/reminders/send-individual', { employeeIds: ids, type: 'attendance', month: selectedMonth, year: selectedYear });
      showToast(`Sent ${res.data?.sent || ids.length} reminder(s)`, 'success');
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send', 'error');
    } finally {
      setSendingReminder(null);
    }
  };

  if (loading) return <PageSpinner label="Loading attendance records…" />;

  const FILTERS = ['submitted', 'approved', 'rejected', 'draft', 'no_entry', 'all'];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader
        title="Attendance Approvals"
        sub={<span className="hidden sm:block">Review and approve employee attendance records</span>}
        actions={selectedIds.size > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => sendReminder([...selectedIds])}
            disabled={sendingReminder === 'bulk'}
            iconLeft={sendingReminder === 'bulk' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          >
            Send Reminder ({selectedIds.size})
          </Button>
        )}
      />

      <Tabs
        tabs={FILTERS.map(f => ({
          key: f,
          label: f === 'all' ? 'All' : f === 'no_entry' ? 'No Entry' : f.charAt(0).toUpperCase() + f.slice(1),
          count: records.filter(r => f === 'all' || r.status === f).length,
        }))}
        value={filter}
        onChange={(f) => { setFilter(f); setSelectedIds(new Set()); }}
        style={{ marginBottom: 14 }}
      />

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.length === 0 ? (
          <Panel><EmptyState title="No attendance records found" /></Panel>
        ) : (
          filtered.map(att => {
            const isOpen = expanded === att._id;
            const selectable = att.status === 'draft' || att.status === 'rejected' || att.status === 'no_entry';
            return (
              <Panel key={att._id} flush>
                {/* ── Row header ── */}
                <div
                  onClick={() => setExpanded(isOpen ? null : att._id)}
                  style={{
                    padding: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                    justifyContent: 'space-between', gap: 10, cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(att.contractor)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(att.contractor); }}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Select ${att.employeeName || 'employee'}`}
                        style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer', flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ font: "600 13.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
                        {att.employeeName} — {monthNames[att.month]} {att.year}
                      </p>
                      <p style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
                        {att.presentDays || 0} present • {att.halfDays || 0} half days • {att.leaveDays || 0} leaves • {att.totalWorkingDays || 0} working days{att.holidayWorkDays > 0 ? ` • ${att.holidayWorkDays} holiday work` : ''}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {selectable && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); sendReminder(att.contractor); }}
                        disabled={sendingReminder === att.contractor}
                        title="Send reminder"
                        aria-label={`Send reminder to ${att.employeeName || 'employee'}`}
                        style={{
                          display: 'grid', placeItems: 'center', width: 28, height: 28,
                          border: 'none', background: 'transparent', borderRadius: 'var(--r-1)',
                          color: 'var(--fg-4)', cursor: 'pointer',
                        }}
                      >
                        {sendingReminder === att.contractor ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      </button>
                    )}
                    <Chip tone={STATUS_TONE[att.status]}>
                      {att.status === 'no_entry' ? 'no entry' : att.status}
                    </Chip>
                    {isOpen
                      ? <ChevronUp size={16} style={{ color: 'var(--fg-4)' }} />
                      : <ChevronDown size={16} style={{ color: 'var(--fg-4)' }} />}
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--line-2)', padding: 14 }}>
                    {/* Calendar grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16, maxWidth: 340 }}>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={i} style={{ textAlign: 'center', font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{d}</div>
                      ))}
                      {Array.from({ length: new Date(att.year, att.month - 1, 1).getDay() }).map((_, i) => <div key={`e-${i}`} />)}
                      {(() => {
                        const daysInMonth = new Date(att.year, att.month, 0).getDate();
                        const entryMap = {};
                        (att.entries || []).forEach(e => {
                          const d = new Date(e.date).getDate();
                          entryMap[d] = e;
                        });
                        return Array.from({ length: daysInMonth }, (_, i) => {
                          const day = i + 1;
                          const dayOfWeek = new Date(att.year, att.month - 1, day).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const entry = entryMap[day];
                          const status = entry?.status || (isWeekend ? 'weekend' : '');

                          // Precedence ladder mirrors legacy exactly — only the
                          // paint differs. `upcoming` has no branch here, same as
                          // legacy, so a future day falls through to the default.
                          let key = null;
                          if (entry?.status === 'working') {
                            const h = parseFloat(entry.hours) || 0;
                            key = (h > 0 && h < 8) ? 'half_day' : 'working';
                          } else if (status === 'leave') {
                            const h = parseFloat(entry?.hours) || 0;
                            key = (h > 0 && h <= 4) ? 'half_day_leave' : 'leave';
                          }
                          else if (status === 'holiday') key = 'holiday';
                          else if (status === 'holiday_work') key = 'holiday_work';
                          else if (status === 'holiday_work_half') key = 'holiday_work_half';
                          else if (status === 'absent') key = 'absent';
                          else if (status === 'not_joined') key = 'not_joined';
                          else if (isWeekend) key = 'weekend';

                          const fill = key ? entryTint(key, 22) : null;
                          const ring = key ? entryTint(key, 45) : null;

                          return (
                            <div key={day} style={{ textAlign: 'center' }}>
                              <div
                                title={status ? `${day} - ${status.replace('_', ' ')}` : `${day}`}
                                style={{
                                  width: 26, height: 26, margin: '0 auto', borderRadius: 99,
                                  display: 'grid', placeItems: 'center',
                                  font: "600 9.5px/1 'Inter', system-ui, sans-serif",
                                  background: fill || 'var(--surface-2)',
                                  border: `1px solid ${ring || 'var(--line-2)'}`,
                                  color: fill ? 'var(--fg)' : 'var(--fg-4)',
                                }}
                              >
                                {day}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Legend */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', marginBottom: 16,
                      font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
                    }}>
                      {LEGEND.map(item => (
                        <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 9, height: 9, borderRadius: 99, flexShrink: 0,
                            background: ENTRY_ACCENT[item.key] || 'var(--fg-faint)',
                          }} />
                          {item.label}
                        </span>
                      ))}
                    </div>

                    {/* Summary */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16,
                      font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
                    }}>
                      <span>Present: {att.presentDays || 0}</span>
                      <span>Half Days: {att.halfDays || 0}</span>
                      <span>Leaves: {att.leaveDays || 0}</span>
                      <span>Absent: {att.absentDays || 0}</span>
                      <span>Working Days: {att.totalWorkingDays || 0}</span>
                    </div>

                    {/* Rejection reason if rejected */}
                    {att.status === 'rejected' && att.rejectionReason && (
                      <div style={{ marginBottom: 16 }}>
                        <Callout tone="danger" icon={<XCircle size={16} />} title="Rejection Reason">
                          {att.rejectionReason}
                        </Callout>
                      </div>
                    )}

                    {/* Actions */}
                    {att.status === 'submitted' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          onClick={() => handleApprove(att._id)}
                          disabled={!!actionLoading}
                          size="sm"
                          iconLeft={actionLoading === att._id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setRejectId(att._id)}
                          disabled={!!actionLoading}
                          iconLeft={<XCircle size={15} />}
                        >
                          Reject
                        </Button>
                      </div>
                    )}

                    {att.status === 'approved' && (() => {
                      const monthKey = `${att.month}-${att.year}`;
                      const lockInfo = lockedMonths[monthKey];
                      const isRevertBlocked = lockInfo && ['processed', 'finalized'].includes(lockInfo.status);
                      return isRevertBlocked ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "400 12px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                          <Lock size={14} style={{ color: 'var(--warn-ink)', flexShrink: 0 }} />
                          <span>Cannot revert — payroll is {lockInfo.status} for this month</span>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRevert(att._id)}
                          disabled={!!actionLoading}
                          iconLeft={actionLoading === att._id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                        >
                          Revert to Draft
                        </Button>
                      );
                    })()}
                  </div>
                )}
              </Panel>
            );
          })
        )}
      </div>

      <Modal
        open={!!rejectId}
        onClose={() => setRejectId(null)}
        size="sm"
        tone="danger"
        icon={<XCircle size={18} />}
        title="Reject Attendance"
        sub="The employee sees this reason and can resubmit."
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleReject}>Reject</Button>
          </>
        )}
      >
        <Textarea
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Reason for rejection..."
          maxLength={500}
          aria-label="Reason for rejection"
          style={{ minHeight: 100 }}
        />
      </Modal>
    </div>
  );
}
