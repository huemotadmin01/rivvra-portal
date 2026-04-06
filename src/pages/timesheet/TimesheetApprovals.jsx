import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { usePeriod } from '../../context/PeriodContext';
import timesheetApi from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, TabsSkeleton, CardListSkeleton } from '../../components/Skeletons';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCcw, Loader2, Lock, Mail } from 'lucide-react';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const statusColors = {
  'working': 'bg-emerald-500',
  'leave': 'bg-red-500',
  'holiday': 'bg-purple-500',
  'weekend': 'bg-dark-600',
};

export default function TimesheetApprovals() {
  const { showToast } = useToast();
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
    timesheetApi.get(`/timesheets?month=${selectedMonth}&year=${selectedYear}`, { signal: controllerRef.current.signal })
      .then(r => setTimesheets((r.data || []).filter(t => !t.isAttendance)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); return () => controllerRef.current?.abort(); }, [selectedMonth, selectedYear]);

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
      const res = await timesheetApi.post('/reminders/send-individual', { employeeIds: ids, type: 'timesheet' });
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
      <TabsSkeleton widths={[80, 76, 56, 44]} />
      <CardListSkeleton count={5} />
    </PageSkeleton>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Timesheet Approvals</h1>
        <p className="text-dark-400 text-sm">Review and approve contractor entries</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['submitted', 'approved', 'rejected', 'draft', 'no_entry', 'all'].map(f => {
          const label = f === 'all' ? 'All' : f === 'no_entry' ? 'No Entry' : f.charAt(0).toUpperCase() + f.slice(1);
          return (
          <button key={f} onClick={() => { setFilter(f); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700'
            }`}>
            {label} ({timesheets.filter(t => f === 'all' || t.status === f).length})
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
          <div className="card p-8 text-center text-dark-500">No timesheets found</div>
        ) : (
          filtered.map(ts => (
            <div key={ts._id} className="card">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === ts._id ? null : ts._id)}>
                <div className="flex items-center gap-3">
                  {(ts.status === 'draft' || ts.status === 'rejected' || ts.status === 'no_entry') && (
                    <input type="checkbox" checked={selectedIds.has(ts.contractor?._id || ts.contractor)} onChange={(e) => { e.stopPropagation(); toggleSelect(ts.contractor?._id || ts.contractor); }} onClick={e => e.stopPropagation()} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500 cursor-pointer" />
                  )}
                  <div>
                    <p className="font-medium text-white">{ts.contractor?.fullName || 'Unknown'} — {monthNames[ts.month]} {ts.year}</p>
                    <p className="text-sm text-dark-400">{ts.status === 'no_entry' ? 'No entry submitted' : ts.isAttendance ? 'Attendance' : [ts.project?.name, ts.client?.name].filter(Boolean).join(' • ')} • {ts.totalHours || 0}h ({ts.totalWorkingDays || 0} days)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(ts.status === 'draft' || ts.status === 'rejected' || ts.status === 'no_entry') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); sendReminder(ts.contractor?._id || ts.contractor); }}
                      disabled={sendingReminder === (ts.contractor?._id || ts.contractor)}
                      className="p-1.5 text-dark-500 hover:text-blue-400 transition-colors"
                      title="Send reminder"
                    >
                      {sendingReminder === (ts.contractor?._id || ts.contractor) ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    </button>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    ts.status === 'submitted' ? 'bg-amber-500/10 text-amber-400' :
                    ts.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                    ts.status === 'no_entry' ? 'bg-orange-500/10 text-orange-400' :
                    'bg-dark-700 text-dark-400'
                  }`}>{ts.status === 'no_entry' ? 'no entry' : ts.status}</span>
                  {expanded === ts._id ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
                </div>
              </div>

              {expanded === ts._id && (
                <div className="border-t border-dark-800 p-4">
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className="text-center text-[10px] text-dark-500 font-medium">{d}</div>
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
                        return (
                          <div key={day} className="text-center">
                            <div className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-[9px] font-medium ${
                              isWorking && hours > 8 ? (isWeekend ? 'bg-blue-500 text-white ring-2 ring-blue-300' : 'bg-blue-500 text-white') :
                              isWorking && hours > 0 ? (isWeekend ? 'bg-emerald-500 text-white ring-2 ring-emerald-300' : 'bg-emerald-500 text-white') :
                              isWeekend ? 'bg-dark-800 text-dark-500' :
                              entry?.status === 'leave' ? 'bg-red-500 text-white' :
                              entry?.status === 'holiday' ? 'bg-purple-500 text-white' :
                              'bg-dark-700 text-dark-500'
                            }`} title={isWeekend && isWorking && hours > 0 ? `${hours}h - Weekend work` : isWeekend ? 'Weekend' : entry ? `${hours}h - ${entry.status}` : 'No entry'}>
                              {isWorking && hours > 0 ? hours : day}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-dark-300 mb-4">
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
                      return weekendWork > 0 ? <span className="text-blue-400">Weekend Work: {weekendWork} day{weekendWork > 1 ? 's' : ''}</span> : null;
                    })()}
                  </div>

                  {ts.status === 'submitted' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(ts._id)} disabled={!!actionLoading}
                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {actionLoading === ts._id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approve
                      </button>
                      <button onClick={() => setRejectId(ts._id)} disabled={!!actionLoading}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  )}

                  {ts.status === 'approved' && (() => {
                    const monthKey = `${ts.month}-${ts.year}`;
                    const lockInfo = lockedMonths[monthKey];
                    const isRevertBlocked = lockInfo && ['processed', 'finalized'].includes(lockInfo.status);
                    return isRevertBlocked ? (
                      <div className="flex items-center gap-2 text-xs text-dark-500">
                        <Lock size={14} className="text-amber-400/60" />
                        <span>Cannot revert — payroll is {lockInfo.status} for this month</span>
                      </div>
                    ) : (
                      <button onClick={() => handleRevert(ts._id)} disabled={!!actionLoading}
                        className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {actionLoading === ts._id ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Revert to Draft
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {rejectId && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectId(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setRejectId(null); }}>
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-md mx-4" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold text-white mb-4">Reject Timesheet Entry</h3>
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
