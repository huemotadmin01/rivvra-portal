import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { usePeriod } from '../../context/PeriodContext';
import timesheetApi from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, TabsSkeleton, CardListSkeleton } from '../../components/Skeletons';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCcw, Loader2, Lock, Mail } from 'lucide-react';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const entryColors = {
  working: 'bg-emerald-500 text-white',      // Full day present
  half_day: 'bg-amber-500 text-white',       // Half day
  leave: 'bg-blue-500 text-white',           // Full day leave
  half_day_leave: 'bg-blue-400/70 text-white', // Half day leave
  holiday: 'bg-purple-500 text-white',
  holiday_work: 'bg-orange-500 text-white',        // Full day holiday work
  holiday_work_half: 'bg-orange-400 text-white',   // Half day holiday work
  absent: 'bg-dark-700 text-red-400',
  weekend: 'bg-dark-800 text-dark-500',
  not_joined: 'bg-dark-900 text-dark-600',   // Before joining date
  upcoming: 'bg-dark-900/50 text-dark-600 border border-dashed border-dark-700', // Future dates
};

export default function AttendanceApprovals() {
  const { showToast } = useToast();
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
    timesheetApi.get(`/attendance/all?month=${selectedMonth}&year=${selectedYear}`, { signal: controllerRef.current.signal })
      .then(r => setRecords(r.data?.attendance || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); return () => controllerRef.current?.abort(); }, [selectedMonth, selectedYear]);

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
      const res = await timesheetApi.post('/reminders/send-individual', { employeeIds: ids, type: 'attendance' });
      showToast(`Sent ${res.data?.sent || ids.length} reminder(s)`, 'success');
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send', 'error');
    } finally {
      setSendingReminder(null);
    }
  };

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton subtitleW="w-64" />
      <TabsSkeleton widths={[80, 76, 68, 44]} />
      <CardListSkeleton count={5} />
    </PageSkeleton>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Attendance Approvals</h1>
        <p className="text-dark-400 text-sm">Review and approve employee attendance records</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['submitted', 'approved', 'rejected', 'draft', 'no_entry', 'all'].map(f => {
          const label = f === 'all' ? 'All' : f === 'no_entry' ? 'No Entry' : f.charAt(0).toUpperCase() + f.slice(1);
          return (
          <button key={f} onClick={() => { setFilter(f); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700'
            }`}>
            {label} ({records.filter(r => f === 'all' || r.status === f).length})
          </button>
          );
        })}
        {selectedIds.size > 0 && (
          <button
            onClick={() => sendReminder([...selectedIds])}
            disabled={sendingReminder === 'bulk'}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 text-sm font-medium transition-colors"
          >
            {sendingReminder === 'bulk' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Send Reminder ({selectedIds.size})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-dark-500">No attendance records found</div>
        ) : (
          filtered.map(att => (
            <div key={att._id} className="card">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === att._id ? null : att._id)}>
                <div className="flex items-center gap-3">
                  {(att.status === 'draft' || att.status === 'rejected' || att.status === 'no_entry') && (
                    <input type="checkbox" checked={selectedIds.has(att.contractor)} onChange={(e) => { e.stopPropagation(); toggleSelect(att.contractor); }} onClick={e => e.stopPropagation()} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500 cursor-pointer" />
                  )}
                  <div>
                    <p className="font-medium text-white">{att.employeeName} — {monthNames[att.month]} {att.year}</p>
                    <p className="text-sm text-dark-400">
                      {att.presentDays || 0} present • {att.halfDays || 0} half days • {att.leaveDays || 0} leaves • {att.totalWorkingDays || 0} working days{att.holidayWorkDays > 0 ? ` • ${att.holidayWorkDays} holiday work` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(att.status === 'draft' || att.status === 'rejected' || att.status === 'no_entry') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); sendReminder(att.contractor); }}
                      disabled={sendingReminder === att.contractor}
                      className="p-1.5 text-dark-500 hover:text-blue-400 transition-colors"
                      title="Send reminder"
                    >
                      {sendingReminder === att.contractor ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    </button>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    att.status === 'submitted' ? 'bg-amber-500/10 text-amber-400' :
                    att.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                    att.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                    att.status === 'no_entry' ? 'bg-orange-500/10 text-orange-400' :
                    'bg-dark-700 text-dark-400'
                  }`}>{att.status === 'no_entry' ? 'no entry' : att.status}</span>
                  {expanded === att._id ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
                </div>
              </div>

              {expanded === att._id && (
                <div className="border-t border-dark-800 p-4">
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className="text-center text-[10px] text-dark-500 font-medium">{d}</div>
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

                        let colorClass = 'bg-dark-700 text-dark-500';
                        if (entry?.status === 'working') {
                          const h = parseFloat(entry.hours) || 0;
                          colorClass = (h > 0 && h < 8) ? entryColors.half_day : entryColors.working;
                        } else if (status === 'leave') {
                          const h = parseFloat(entry?.hours) || 0;
                          colorClass = (h > 0 && h <= 4) ? entryColors.half_day_leave : entryColors.leave;
                        }
                        else if (status === 'holiday') colorClass = entryColors.holiday;
                        else if (status === 'holiday_work') colorClass = entryColors.holiday_work;
                        else if (status === 'holiday_work_half') colorClass = entryColors.holiday_work_half;
                        else if (status === 'absent') colorClass = entryColors.absent;
                        else if (status === 'not_joined') colorClass = entryColors.not_joined;
                        else if (isWeekend) colorClass = entryColors.weekend;

                        return (
                          <div key={day} className="text-center">
                            <div className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-[9px] font-medium ${colorClass}`}
                              title={status ? `${day} - ${status.replace('_', ' ')}` : `${day}`}>
                              {day}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-dark-300 mb-4">
                    {[
                      { label: 'Present', color: 'bg-emerald-500' },
                      { label: 'Half Day', color: 'bg-amber-500' },
                      { label: 'Leave', color: 'bg-blue-500' },
                      { label: '½ Leave', color: 'bg-blue-400' },
                      { label: 'Holiday', color: 'bg-purple-500' },
                      { label: 'Holiday Work', color: 'bg-orange-500' },
                      { label: 'Weekend', color: 'bg-dark-800' },
                    ].map(item => (
                      <span key={item.label} className="flex items-center gap-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                        {item.label}
                      </span>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-dark-300 mb-4">
                    <span>Present: {att.presentDays || 0}</span>
                    <span>Half Days: {att.halfDays || 0}</span>
                    <span>Leaves: {att.leaveDays || 0}</span>
                    <span>Absent: {att.absentDays || 0}</span>
                    <span>Working Days: {att.totalWorkingDays || 0}</span>
                  </div>

                  {/* Rejection reason if rejected */}
                  {att.status === 'rejected' && att.rejectionReason && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                      <p className="text-xs text-red-400 font-medium mb-1">Rejection Reason</p>
                      <p className="text-sm text-dark-300">{att.rejectionReason}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {att.status === 'submitted' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(att._id)} disabled={!!actionLoading}
                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {actionLoading === att._id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approve
                      </button>
                      <button onClick={() => setRejectId(att._id)} disabled={!!actionLoading}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  )}

                  {att.status === 'approved' && (() => {
                    const monthKey = `${att.month}-${att.year}`;
                    const lockInfo = lockedMonths[monthKey];
                    const isRevertBlocked = lockInfo && ['processed', 'finalized'].includes(lockInfo.status);
                    return isRevertBlocked ? (
                      <div className="flex items-center gap-2 text-xs text-dark-500">
                        <Lock size={14} className="text-amber-400/60" />
                        <span>Cannot revert — payroll is {lockInfo.status} for this month</span>
                      </div>
                    ) : (
                      <button onClick={() => handleRevert(att._id)} disabled={!!actionLoading}
                        className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {actionLoading === att._id ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Revert to Draft
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectId(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setRejectId(null); }}>
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-md mx-4" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold text-white mb-4">Reject Attendance</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." maxLength={500}
              className="w-full bg-dark-800/50 border border-dark-700 rounded-lg p-3 text-sm text-white placeholder-dark-500 mb-4 min-h-[100px] outline-none focus:border-rivvra-500 focus:ring-2 focus:ring-rivvra-500/20" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm text-dark-400 hover:bg-dark-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleReject} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 transition-colors">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
