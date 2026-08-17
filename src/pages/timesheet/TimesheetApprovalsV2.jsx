import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { usePeriod } from '../../context/PeriodContext';
import { useCompany } from '../../context/CompanyContext';
import timesheetApi from '../../utils/timesheetApi';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCcw, Loader2, Lock, Mail } from 'lucide-react';
import {
  PageHeader, Tabs, Panel, Chip, Button, Modal, Textarea, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Approve / reject / revert here move a timesheet into the state payroll reads,
// and the page also sends reminder emails. Everything above `return (` is
// spliced in from the legacy file verbatim — including the payroll-lock guard
// that blocks a revert once the month is processed or finalized.
//
// Two pre-existing things are carried across unchanged and written up in
// REDESIGN-QA.md rather than fixed here:
//   • `controllerRef` is a plain object, not a `useRef`, so it is rebuilt every
//     render and the abort does not reliably cancel the previous request.
//     AttendanceApprovals.jsx has the same line.
//   • legacy declared a `statusColors` map that nothing referenced. It is the
//     one thing NOT carried over — it is provably dead (zero references in the
//     file), so copying it would be copying a decoy.
// ─────────────────────────────────────────────────────────────────────────────

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Status pill tone. Legacy grouped these as amber / emerald / orange / muted;
 *  `no_entry` becomes `danger` because it is the actionable-bad state and
 *  Chip has no orange. The other three map straight across. */
const STATUS_TONE = { submitted: 'warn', approved: 'brand', no_entry: 'danger' };

/**
 * Day-cell colour for the expanded calendar.
 *
 * Legacy painted these as a saturated fill with white text — emerald-500 with
 * white is 2.54:1 and blue-500 is 3.68:1, both below AA at the 9px this renders
 * at. Same shape as the my-attendance finding, so the same fix: the tint
 * carries the state and the digit stays near-black/near-white.
 */
const DAY_ACCENT = {
  overtime: 'var(--acc-blue)',     // worked, > 8h
  working:  'var(--acc-emerald)',
  leave:    'var(--danger)',
  holiday:  'var(--acc-purple)',
};

const dayTint = (accent, pct) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`;

export default function TimesheetApprovalsV2() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(null); // tracks which ID is being acted on
  const [filter, setFilter] = useState('submitted');
  const [lockedMonths, setLockedMonths] = useState({}); // { "3-2026": { locked, status } }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sendingReminder, setSendingReminder] = useState(null); // employeeId or 'bulk'

  const { month: selectedMonth, year: selectedYear } = usePeriod();

  const controllerRef = { current: null };
  const load = () => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setLoading(true);
    setTimesheets([]);
    timesheetApi.get(`/timesheets?month=${selectedMonth}&year=${selectedYear}`, { signal: controllerRef.current.signal })
      .then(r => setTimesheets((r.data || []).filter(t => !t.isAttendance)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); return () => controllerRef.current?.abort(); }, [selectedMonth, selectedYear, currentCompany?._id]);

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this entry?')) return;
    setActionLoading(id);
    try {
      await timesheetApi.patch(`/timesheets/${id}/approve`);
      showToast('Entry approved');
      load();
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Approval failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleRevert = async (id) => {
    if (!window.confirm('Revert this entry to draft?')) return;
    setActionLoading(id);
    try {
      await timesheetApi.patch(`/timesheets/${id}/revert`);
      showToast('Entry reverted to draft');
      load();
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Revert failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { showToast('Please provide a reason', 'error'); return; }
    setActionLoading(rejectId);
    try {
      await timesheetApi.patch(`/timesheets/${rejectId}/reject`, { rejectionReason: rejectReason.trim() });
      showToast('Entry rejected');
      setRejectId(null); setRejectReason('');
      load();
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Rejection failed', 'error'); }
    finally { setActionLoading(null); }
  };

  // Fetch payroll lock status for each unique month/year in timesheets
  useEffect(() => {
    if (!timesheets.length) return;
    const uniqueKeys = [...new Set(timesheets.map(t => `${t.month}-${t.year}`))];
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
  }, [timesheets]);

  const filtered = timesheets.filter(t => filter === 'all' || t.status === filter);
  const draftFiltered = filtered.filter(t => t.status === 'draft' || t.status === 'rejected' || t.status === 'no_entry');

  const toggleSelect = (empId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(empId) ? next.delete(empId) : next.add(empId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === draftFiltered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(draftFiltered.map(t => t.contractor?._id || t.contractor)));
  };

  const sendReminder = async (employeeIds) => {
    const ids = Array.isArray(employeeIds) ? employeeIds : [employeeIds];
    setSendingReminder(ids.length > 1 ? 'bulk' : ids[0]);
    try {
      const res = await timesheetApi.post('/reminders/send-individual', { employeeIds: ids, type: 'timesheet', month: selectedMonth, year: selectedYear });
      showToast(`Sent ${res.data?.sent || ids.length} reminder(s)`, 'success');
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send', 'error');
    } finally {
      setSendingReminder(null);
    }
  };

  if (loading) return <PageSpinner label="Loading timesheets…" />;

  const FILTERS = ['submitted', 'approved', 'rejected', 'draft', 'no_entry', 'all'];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader
        title="Timesheet Approvals"
        sub={<span className="hidden sm:block">Review and approve contractor entries</span>}
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
          count: timesheets.filter(t => f === 'all' || t.status === f).length,
        }))}
        value={filter}
        onChange={(f) => { setFilter(f); setSelectedIds(new Set()); }}
        style={{ marginBottom: 14 }}
      />

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.length === 0 ? (
          <Panel><EmptyState title="No timesheets found" /></Panel>
        ) : (
          filtered.map(ts => {
            const isOpen = expanded === ts._id;
            const contractorId = ts.contractor?._id || ts.contractor;
            const selectable = ts.status === 'draft' || ts.status === 'rejected' || ts.status === 'no_entry';
            return (
              <Panel key={ts._id} flush>
                {/* ── Row header ── */}
                <div
                  onClick={() => setExpanded(isOpen ? null : ts._id)}
                  style={{
                    padding: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                    justifyContent: 'space-between', gap: 10, cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(contractorId)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(contractorId); }}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Select ${ts.contractor?.fullName || 'contractor'}`}
                        style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer', flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ font: "600 13.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
                        {ts.contractor?.fullName || 'Unknown'} — {monthNames[ts.month]} {ts.year}
                      </p>
                      <p style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
                        {ts.status === 'no_entry' ? 'No entry submitted' : ts.isAttendance ? 'Attendance' : [ts.project?.name, ts.client?.name].filter(Boolean).join(' • ')} • {ts.totalHours || 0}h ({ts.totalWorkingDays || 0} days)
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {selectable && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); sendReminder(contractorId); }}
                        disabled={sendingReminder === contractorId}
                        title="Send reminder"
                        aria-label={`Send reminder to ${ts.contractor?.fullName || 'contractor'}`}
                        style={{
                          display: 'grid', placeItems: 'center', width: 28, height: 28,
                          border: 'none', background: 'transparent', borderRadius: 'var(--r-1)',
                          color: 'var(--fg-4)', cursor: 'pointer',
                        }}
                      >
                        {sendingReminder === contractorId ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      </button>
                    )}
                    <Chip tone={STATUS_TONE[ts.status]}>
                      {ts.status === 'no_entry' ? 'no entry' : ts.status}
                    </Chip>
                    {isOpen
                      ? <ChevronUp size={16} style={{ color: 'var(--fg-4)' }} />
                      : <ChevronDown size={16} style={{ color: 'var(--fg-4)' }} />}
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--line-2)', padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16, maxWidth: 340 }}>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={i} style={{ textAlign: 'center', font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{d}</div>
                      ))}
                      {Array.from({ length: new Date(ts.year, ts.month - 1, 1).getDay() }).map((_, i) => <div key={`e-${i}`} />)}
                      {(() => {
                        const daysInMonth = new Date(ts.year, ts.month, 0).getDate();
                        const entryMap = {};
                        (ts.entries || []).forEach(e => {
                          const d = new Date(e.date).getDate();
                          entryMap[d] = e;
                        });
                        return Array.from({ length: daysInMonth }, (_, i) => {
                          const day = i + 1;
                          const dayOfWeek = new Date(ts.year, ts.month - 1, day).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const entry = entryMap[day];
                          const isWorking = entry?.status === 'working';
                          const hours = entry?.hours || 0;

                          // Same precedence ladder as legacy, only the paint differs.
                          const accent =
                            isWorking && hours > 8 ? DAY_ACCENT.overtime :
                            isWorking && hours > 0 ? DAY_ACCENT.working :
                            isWeekend ? null :
                            entry?.status === 'leave' ? DAY_ACCENT.leave :
                            entry?.status === 'holiday' ? DAY_ACCENT.holiday :
                            null;

                          const title = isWeekend && isWorking && hours > 0
                            ? `${hours}h - Weekend work`
                            : isWeekend ? 'Weekend'
                            : entry ? `${hours}h - ${entry.status}` : 'No entry';

                          return (
                            <div key={day} style={{ textAlign: 'center' }}>
                              <div
                                title={title}
                                style={{
                                  width: 26, height: 26, margin: '0 auto', borderRadius: 99,
                                  display: 'grid', placeItems: 'center',
                                  font: "600 9.5px/1 'Inter', system-ui, sans-serif",
                                  background: accent ? dayTint(accent, 22) : 'var(--surface-2)',
                                  // Weekend work keeps legacy's ring — it is the one
                                  // state the fill alone doesn't distinguish.
                                  border: accent
                                    ? `${isWeekend && isWorking ? 2 : 1}px solid ${dayTint(accent, isWeekend && isWorking ? 70 : 45)}`
                                    : '1px solid var(--line-2)',
                                  color: accent ? 'var(--fg)' : 'var(--fg-4)',
                                }}
                              >
                                {isWorking && hours > 0 ? hours : day}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16,
                      font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
                    }}>
                      <span>Hours: {ts.totalHours || 0}h</span>
                      <span>Days: {ts.totalWorkingDays}</span>
                      <span>Leaves: {ts.entries?.filter(e => e.status === 'leave').length || 0}</span>
                      <span>Holidays: {ts.entries?.filter(e => e.status === 'holiday').length || 0}</span>
                      {(() => {
                        const weekendWork = (ts.entries || []).filter(e => {
                          if (e.status !== 'working' || !e.hours) return false;
                          const d = new Date(e.date).getDay();
                          return d === 0 || d === 6;
                        }).length;
                        return weekendWork > 0
                          ? <span style={{ color: 'var(--acc-blue)' }}>Weekend Work: {weekendWork} day{weekendWork > 1 ? 's' : ''}</span>
                          : null;
                      })()}
                    </div>

                    {ts.status === 'submitted' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          onClick={() => handleApprove(ts._id)}
                          disabled={!!actionLoading}
                          size="sm"
                          iconLeft={actionLoading === ts._id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setRejectId(ts._id)}
                          disabled={!!actionLoading}
                          iconLeft={<XCircle size={15} />}
                        >
                          Reject
                        </Button>
                      </div>
                    )}

                    {ts.status === 'approved' && (() => {
                      const monthKey = `${ts.month}-${ts.year}`;
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
                          onClick={() => handleRevert(ts._id)}
                          disabled={!!actionLoading}
                          iconLeft={actionLoading === ts._id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
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
        title="Reject Timesheet Entry"
        sub="The contractor sees this reason and can resubmit."
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
