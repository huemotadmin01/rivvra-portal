import { useState, useEffect } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi, { getHolidays, getMyLeaveRequests } from '../../utils/timesheetApi';
import { ChevronLeft, ChevronRight, Save, Send, AlertCircle, RotateCcw, Loader2, Lock } from 'lucide-react';

// Check if employee is eligible for paid holidays (same as leave eligibility)
function isHolidayEligible(emp) {
  if (!emp) return false;
  const t = (emp.employmentType || '').toLowerCase();
  if (t === 'external_consultant') return false;
  if (t === 'internal_consultant' && emp.billable === true) return false;
  return ['confirmed', 'intern', 'internal_consultant'].includes(t);
}

const statusColors = {
  'working': 'bg-emerald-500',
  'leave': 'bg-red-500',
  'holiday': 'bg-purple-500',
  'weekend': 'bg-dark-600',
};

const statusLabels = {
  'working': 'Working',
  'leave': 'Leave',
  'holiday': 'Holiday',
  'weekend': 'Weekend',
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TimesheetEntry() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [timesheet, setTimesheet] = useState(null);
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periodLocked, setPeriodLocked] = useState(false);

  const isNonBillable = timesheetUser?.billable === false;
  const hasProjects = projects.length > 0;

  // Load projects (skip for non-billable — they don't need a project)
  useEffect(() => {
    if (!timesheetUser) return;
    if (isNonBillable) return;
    const controller = new AbortController();
    timesheetApi.get('/projects', { signal: controller.signal }).then(r => {
      setProjects(r.data);
      if (timesheetUser?.assignedProjects?.length > 0) {
        const assigned = r.data.find(p => timesheetUser.assignedProjects.some(ap => (ap._id || ap) === p._id));
        if (assigned) setSelectedProject(assigned._id);
        else if (r.data.length > 0) setSelectedProject(r.data[0]._id);
      } else if (r.data.length > 0) {
        setSelectedProject(r.data[0]._id);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [timesheetUser, isNonBillable]);

  useEffect(() => {
    // Non-billable employees without projects can still use timesheets
    if ((!selectedProject && !isNonBillable) || !timesheetUser) { setLoading(false); return; }
    setLoading(true);
    const controller = new AbortController();

    // Fetch timesheet + holidays + approved leaves in parallel
    const eligible = isHolidayEligible(timesheetUser);
    const tsPromise = timesheetApi.get('/timesheets', { params: { month, year, contractor: timesheetUser._id }, signal: controller.signal });
    const holidayPromise = eligible
      ? getHolidays({ year }).catch(() => ({ holidays: [] }))
      : Promise.resolve({ holidays: [] });
    const leavePromise = eligible
      ? getMyLeaveRequests({ status: 'approved' }).catch(() => ({ requests: [] }))
      : Promise.resolve({ requests: [] });

    Promise.all([tsPromise, holidayPromise, leavePromise])
      .then(([r, holData, leaveData]) => {
        // Build set of holiday day-numbers for this month
        const holidayDays = new Set();
        if (eligible) {
          (holData.holidays || []).forEach(h => {
            const match = String(h.date).match(/(\d{4})-(\d{2})-(\d{2})/);
            if (match && parseInt(match[2]) === month && parseInt(match[1]) === year) {
              holidayDays.add(parseInt(match[3]));
            }
          });
        }

        // Build set of approved leave day-numbers for this month
        const leaveDays = new Map(); // day → { hours, leaveType }
        if (eligible) {
          (leaveData.requests || leaveData.leaveRequests || []).forEach(lr => {
            if (lr.status !== 'approved') return;
            const from = new Date(lr.fromDate);
            const to = new Date(lr.toDate);
            if (lr.isHalfDay) {
              if (from.getMonth() + 1 === month && from.getFullYear() === year) {
                leaveDays.set(from.getDate(), { hours: 4, leaveType: lr.leaveType });
              }
              return;
            }
            // Iterate business days within the leave range that fall in this month
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0);
            const iterFrom = new Date(Math.max(from.getTime(), monthStart.getTime()));
            const iterTo = new Date(Math.min(to.getTime(), monthEnd.getTime()));
            for (let d = new Date(iterFrom); d <= iterTo; d.setDate(d.getDate() + 1)) {
              const dow = d.getDay();
              if (dow === 0 || dow === 6) continue; // skip weekends
              if (holidayDays.has(d.getDate())) continue; // skip holidays
              leaveDays.set(d.getDate(), { hours: 0, leaveType: lr.leaveType });
            }
          });
        }

        const ts = selectedProject
          ? r.data.find(t => t.project?._id === selectedProject || t.project === selectedProject)
          : r.data.find(t => !t.project || !t.project._id); // non-billable: find projectless timesheet

        const daysInMo = new Date(year, month, 0).getDate();
        const entryMap = {};

        // Build base entries
        for (let d = 1; d <= daysInMo; d++) {
          const dayOfWeek = new Date(year, month - 1, d).getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) entryMap[d] = { hours: 0, status: 'weekend' };
          else if (holidayDays.has(d)) entryMap[d] = { hours: 8, status: 'holiday' };
          else if (leaveDays.has(d)) entryMap[d] = { hours: leaveDays.get(d).hours, status: 'leave' };
          else entryMap[d] = { hours: '', status: null };
        }

        if (ts) {
          setTimesheet(ts);
          // Overlay saved entries (only days that were actually saved)
          ts.entries.forEach(e => {
            const d = new Date(e.date).getDate();
            const hours = e.hours || 0;
            const status = e.status || 'working';
            // Keep holiday/leave status from saved data; otherwise use saved status
            if (status === 'holiday' || status === 'leave') {
              entryMap[d] = { hours, status };
            } else if (holidayDays.has(d)) {
              // Day is a holiday but saved as working — keep holiday status (paid holiday, 8h)
              entryMap[d] = { hours: 8, status: 'holiday' };
            } else if (leaveDays.has(d)) {
              // Day has an approved leave — override saved working status
              entryMap[d] = { hours: leaveDays.get(d).hours, status: 'leave' };
            } else {
              entryMap[d] = { hours, status: (status === 'working' && hours <= 0) ? null : status };
            }
          });
        } else {
          setTimesheet(null);
        }

        setEntries(entryMap);
      })
      .catch(() => setTimesheet(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [month, year, selectedProject, timesheetUser, isNonBillable]);

  // Check if payroll period is locked
  useEffect(() => {
    setPeriodLocked(false);
    timesheetApi.get('/payroll/run/status', { params: { month, year } })
      .then(r => setPeriodLocked(r.data?.locked || false))
      .catch(() => setPeriodLocked(false));
  }, [month, year]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  // Compute effective start date — days before this are disabled
  // For billable employees: use project-specific start date
  // For non-billable employees: use their joining date
  const projectStartDate = (() => {
    if (isNonBillable) {
      const jd = timesheetUser?.joiningDate;
      if (!jd) return null;
      const d = new Date(jd);
      return isNaN(d.getTime()) ? null : d;
    }
    const startStr = timesheetUser?.projectStartDates?.[selectedProject];
    if (!startStr) return null;
    const d = new Date(startStr);
    return isNaN(d.getTime()) ? null : d;
  })();

  const isBeforeProjectStart = (day) => {
    if (!projectStartDate) return false;
    const date = new Date(year, month - 1, day);
    // Compare date-only (ignore time)
    const startDateOnly = new Date(projectStartDate.getFullYear(), projectStartDate.getMonth(), projectStartDate.getDate());
    return date < startDateOnly;
  };

  const canEdit = !periodLocked && (!timesheet || timesheet.status === 'draft' || timesheet.status === 'rejected');

  const cycleStatus = (day) => {
    if (!canEdit || isBeforeProjectStart(day)) return;
    const entry = entries[day] || { hours: '', status: null };
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekendDay) {
      // Weekend: toggle between weekend (no work) and working (8h)
      if (entry.status === 'working') {
        setEntries(prev => ({ ...prev, [day]: { hours: 0, status: 'weekend' } }));
      } else {
        setEntries(prev => ({ ...prev, [day]: { hours: 8, status: 'working' } }));
      }
      return;
    }
    // Leave/holiday entries are read-only — managed by Leave module & Holiday calendar
    if (entry.status === 'leave' || entry.status === 'holiday') return;
    // Weekday: toggle between working (8h) and working (0h)
    const newHours = (entry.hours || 0) > 0 ? 0 : 8;
    setEntries(prev => ({ ...prev, [day]: { hours: newHours, status: 'working' } }));
  };

  const setHours = (day, value) => {
    if (!canEdit || isBeforeProjectStart(day)) return;
    const entry = entries[day] || { hours: '', status: null };
    // Block editing leave/holiday entries — managed by Leave module & Holiday calendar
    if (entry.status === 'leave' || entry.status === 'holiday') return;
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

    if (value === '' || value === undefined) {
      setEntries(prev => ({
        ...prev,
        [day]: {
          hours: isWeekendDay ? 0 : '',
          status: isWeekendDay ? 'weekend' : (entry.status === 'leave' || entry.status === 'holiday' ? entry.status : null)
        }
      }));
      return;
    }
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const clamped = Math.min(24, Math.max(0, num));
    const newStatus = clamped > 0 ? 'working' : (isWeekendDay ? 'weekend' : (entry.status === 'leave' || entry.status === 'holiday' ? entry.status : null));
    setEntries(prev => ({ ...prev, [day]: { hours: clamped, status: newStatus } }));
  };

  const buildEntries = () => {
    return Object.entries(entries)
      .filter(([day, entry]) => {
        if (isBeforeProjectStart(parseInt(day))) return false; // skip days before project start
        // Only include entries the user explicitly set (has a status or non-empty hours)
        if (entry.status === 'weekend') return false; // weekends are display-only, never save
        if (entry.status === 'leave' || entry.status === 'holiday') return true;
        if (entry.status === 'working' && (parseFloat(entry.hours) || 0) > 0) return true;
        // Skip unfilled entries (status: null, hours: '')
        if (!entry.status && (entry.hours === '' || entry.hours === null || entry.hours === undefined)) return false;
        // Include if hours explicitly set to a number (even 0)
        if (typeof entry.hours === 'number') return true;
        return false;
      })
      .map(([day, entry]) => {
        const hours = entry.hours === '' || entry.hours === null || entry.hours === undefined ? 0 : parseFloat(entry.hours) || 0;
        const status = entry.status || 'working';
        return { date: new Date(year, month - 1, parseInt(day)), hours, status };
      });
  };

  const totalHours = Object.entries(entries).reduce((sum, [d, e]) => {
    if (isBeforeProjectStart(parseInt(d))) return sum;
    return sum + (e.status === 'working' ? (parseFloat(e.hours) || 0) : 0);
  }, 0);
  const totalDays = totalHours / 8;
  const totalLeaves = Object.entries(entries).filter(([d, e]) => !isBeforeProjectStart(parseInt(d)) && e.status === 'leave').length;
  const totalHolidays = Object.entries(entries).filter(([d, e]) => !isBeforeProjectStart(parseInt(d)) && e.status === 'holiday').length;

  // Helper: fetch existing timesheet for current month/year/project and sync state
  const refreshTimesheet = async () => {
    try {
      const r = await timesheetApi.get('/timesheets', { params: { month, year, contractor: timesheetUser._id } });
      const ts = selectedProject
        ? r.data.find(t => (t.project?._id || t.project) === selectedProject)
        : r.data.find(t => !t.project || !t.project._id);
      if (ts) {
        setTimesheet(ts);
        return ts;
      }
    } catch { /* ignore refresh errors */ }
    return null;
  };

  const handleSave = async () => {
    if (!selectedProject && !isNonBillable) { showToast('Please select a project first', 'error'); return; }
    if (totalHours <= 0 && totalLeaves === 0 && totalHolidays === 0) {
      showToast('Please enter hours for at least one day before saving', 'error');
      return;
    }
    setSaving(true);
    try {
      const entryData = buildEntries();
      const project = selectedProject ? projects.find(p => p._id === selectedProject) : null;
      if (timesheet) {
        // Update existing timesheet
        await timesheetApi.put(`/timesheets/${timesheet._id}`, { entries: entryData });
        showToast('Timesheet saved as draft');
      } else {
        // Create new timesheet
        try {
          const res = await timesheetApi.post('/timesheets', {
            project: selectedProject || null, client: project?.client?._id || project?.client || null, month, year, entries: entryData
          });
          setTimesheet(res.data);
          showToast('Timesheet created');
        } catch (postErr) {
          // If duplicate exists (e.g. previous save partially succeeded), recover by fetching it and updating
          const errMsg = postErr.response?.data?.error || '';
          if (postErr.response?.status === 400 && errMsg.toLowerCase().includes('already exists')) {
            const existing = await refreshTimesheet();
            if (existing && (existing.status === 'draft' || existing.status === 'rejected')) {
              await timesheetApi.put(`/timesheets/${existing._id}`, { entries: entryData });
              showToast('Timesheet saved as draft');
            } else if (existing) {
              showToast(`Timesheet already ${existing.status} — cannot overwrite`, 'error');
              return;
            } else {
              throw postErr; // Re-throw if we can't find the duplicate
            }
          } else {
            throw postErr; // Re-throw non-duplicate errors
          }
        }
      }
      await refreshTimesheet();
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!selectedProject && !isNonBillable) { showToast('Please select a project first', 'error'); return; }
    if (totalHours <= 0 && totalLeaves === 0 && totalHolidays === 0) {
      showToast('Please enter hours for at least one day before submitting', 'error');
      return;
    }

    // Validate: all past weekdays must have a status (working with hours > 0, leave, or holiday)
    const today = new Date();
    const unfilledDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (isBeforeProjectStart(d)) continue; // skip days before project start
      const date = new Date(year, month - 1, d);
      if (date > today) continue; // skip future days
      const entry = entries[d] || { hours: '', status: null };
      const dow = new Date(year, month - 1, d).getDay();
      if (dow === 0 || dow === 6) continue; // weekends are optional
      if (entry.status === 'leave' || entry.status === 'holiday') continue;
      if (entry.status === 'working' && (parseFloat(entry.hours) || 0) > 0) continue;
      // This day is unfilled or has 0 hours — needs attention
      unfilledDays.push(d);
    }
    if (unfilledDays.length > 0) {
      const daysList = unfilledDays.slice(0, 5).join(', ') + (unfilledDays.length > 5 ? ` and ${unfilledDays.length - 5} more` : '');
      showToast(`Please fill all past workdays before submitting. Unfilled: ${monthNames[month - 1]} ${daysList}. Enter hours or apply for leave via the Leave module.`, 'error');
      return;
    }

    if (!window.confirm('Submit this timesheet for approval? You won\'t be able to edit it until it\'s reviewed.')) return;
    setSaving(true);
    try {
      // Auto-save before submitting
      const entryData = buildEntries();
      const project = selectedProject ? projects.find(p => p._id === selectedProject) : null;
      let ts = timesheet;
      if (ts) {
        await timesheetApi.put(`/timesheets/${ts._id}`, { entries: entryData });
      } else {
        const res = await timesheetApi.post('/timesheets', {
          project: selectedProject || null, client: project?.client?._id || project?.client || null, month, year, entries: entryData
        });
        ts = res.data;
        setTimesheet(ts);
      }
      // Now submit
      await timesheetApi.patch(`/timesheets/${ts._id}/submit`);
      showToast('Timesheet saved & submitted for approval');
      await refreshTimesheet();
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Submit failed', 'error');
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this timesheet? All saved data will be deleted.')) return;
    try {
      if (timesheet && (timesheet.status === 'draft' || timesheet.status === 'rejected')) {
        await timesheetApi.delete(`/timesheets/${timesheet._id}`);
        setTimesheet(null);
      }
      const daysInMo = new Date(year, month, 0).getDate();
      const defaultMap = {};
      for (let d = 1; d <= daysInMo; d++) {
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) defaultMap[d] = { hours: 0, status: 'weekend' };
        else defaultMap[d] = { hours: '', status: null };
      }
      setEntries(defaultMap);
      showToast('Timesheet reset');
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Reset failed', 'error'); }
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const isReadOnly = !canEdit;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">My Timesheet</h1>
          <p className="text-dark-400 text-sm hidden sm:block mt-1">Enter hours worked per day. Leaves and holidays are managed via the Leave module.</p>
        </div>
        {hasProjects && (
          <div className="flex justify-center">
            <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
              className="px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500 w-full sm:w-auto">
              {projects.map(p => {
                const asgn = timesheetUser?.assignments?.find(a => (a.projectId?._id || a.projectId)?.toString() === p._id);
                const clientLabel = asgn?.clientName ? ` — ${asgn.clientName}` : '';
                return <option key={p._id} value={p._id}>{p.name}{clientLabel}</option>;
              })}
            </select>
          </div>
        )}
      </div>

      {/* Project info bar — hide rate for non-contractor employees (internal business data) */}
      {selectedProject && (() => {
        const asgn = timesheetUser?.assignments?.find(a => (a.projectId?._id || a.projectId)?.toString() === selectedProject);
        if (!asgn) return null;
        const isContractor = !isHolidayEligible(timesheetUser); // external consultants / billable internal
        const rate = isContractor && (asgn.billingRate?.monthly ? `₹${Number(asgn.billingRate.monthly).toLocaleString('en-IN')}/mo` : asgn.billingRate?.daily ? `₹${Number(asgn.billingRate.daily).toLocaleString('en-IN')}/day` : null);
        const startDate = asgn.startDate ? new Date(asgn.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
        return (asgn.clientName || rate || startDate) ? (
          <div className="rounded-lg bg-dark-800/50 border border-dark-700 px-4 py-2 text-sm text-dark-400 flex flex-wrap justify-center gap-x-5 gap-y-1">
            {asgn.clientName && <span>Client: <span className="text-dark-200">{asgn.clientName}</span></span>}
            {rate && <span>Rate: <span className="text-dark-200">{rate}</span></span>}
            {startDate && <span>Since: <span className="text-dark-200">{startDate}</span></span>}
          </div>
        ) : null;
      })()}

      {periodLocked && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium border bg-amber-500/5 text-amber-400 border-amber-500/20">
          <Lock size={16} />
          Payroll for {monthNames[month - 1]} {year} is locked. You cannot edit or submit timesheets for this period.
        </div>
      )}

      {timesheet && timesheet.status !== 'draft' && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium border ${
          timesheet.status === 'submitted' ? 'bg-amber-500/5 text-amber-400 border-amber-500/20' :
          timesheet.status === 'approved' ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' :
          'bg-red-500/5 text-red-400 border-red-500/20'
        }`}>
          <AlertCircle size={16} />
          {timesheet.status === 'submitted' && 'Timesheet submitted — awaiting approval'}
          {timesheet.status === 'approved' && `Timesheet approved • ${timesheet.totalHours || 0}h (${timesheet.totalWorkingDays} days)`}
          {timesheet.status === 'rejected' && `Rejected: ${timesheet.rejectionReason || 'No reason given'}`}
        </div>
      )}

      <div className="flex items-center justify-between card p-4">
        <button onClick={prevMonth} className="p-2 hover:bg-dark-800 rounded-lg text-dark-400 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
        <h2 className="text-lg font-semibold text-white">{monthNames[month - 1]} {year}</h2>
        <button onClick={nextMonth} className="p-2 hover:bg-dark-800 rounded-lg text-dark-400 hover:text-white transition-colors"><ChevronRight size={20} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>
      ) : !selectedProject && !isNonBillable ? (
        <div className="card p-8 text-center">
          <AlertCircle size={40} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-400 font-medium">No project assigned</p>
          <p className="text-dark-500 text-sm mt-1">Please ask your admin to assign a project to your account.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-dark-800">
              {dayNames.map(d => (
                <div key={d} className="text-center py-2 text-xs font-medium text-dark-400 bg-dark-800/50">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="p-1 sm:p-1.5 border-b border-r border-dark-800/50 min-h-[72px] sm:min-h-[88px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const entry = entries[day] || { hours: '', status: null };
                const isToday = day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
                const dayOfWeek = new Date(year, month - 1, day).getDay();
                const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
                const isWeekendIdle = entry.status === 'weekend'; // weekend with no work logged
                const isNonWorking = entry.status === 'leave' || entry.status === 'holiday';
                const hasStatus = entry.status !== null;
                const hoursNum = parseFloat(entry.hours) || 0;
                const dateObj = new Date(year, month - 1, day);
                const isPastUnfilled = dateObj < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !isWeekendDay && !hasStatus;
                const isWeekendWorking = isWeekendDay && entry.status === 'working' && hoursNum > 0;
                const isPreStart = isBeforeProjectStart(day);

                // Days before project start — render as disabled/greyed out
                if (isPreStart) {
                  return (
                    <div key={day} className="p-1 sm:p-1.5 border-b border-r border-dark-800/50 min-h-[72px] sm:min-h-[88px] bg-dark-900/60 opacity-40">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-dark-600">{day}</span>
                        {isWeekendDay && (
                          <span className="text-[7px] sm:text-[8px] font-medium text-dark-600 bg-dark-800/50 px-1 py-0.5 rounded">WE</span>
                        )}
                      </div>
                      <div className="flex items-center justify-center mb-1">
                        <span className="text-xs text-dark-700">—</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={day} className={`p-1 sm:p-1.5 border-b border-r border-dark-800/50 min-h-[72px] sm:min-h-[88px] transition-colors ${
                    isPastUnfilled ? 'bg-amber-500/5 border-amber-500/20' :
                    isWeekendWorking ? 'bg-blue-500/5' :
                    isWeekendDay ? 'bg-dark-800/30' :
                    isNonWorking ? (entry.status === 'leave' ? 'bg-red-500/5' : 'bg-purple-500/5') :
                    entry.status === 'working' && hoursNum > 8 ? 'bg-blue-500/5' :
                    entry.status === 'working' && hoursNum > 0 ? 'bg-emerald-500/5' : ''
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${isToday ? 'bg-rivvra-500 text-dark-950 w-5 h-5 rounded-full flex items-center justify-center' : 'text-dark-300'}`}>
                        {day}
                      </span>
                      {isWeekendDay && (
                        <span className="text-[7px] sm:text-[8px] font-medium text-dark-500 bg-dark-700/50 px-1 py-0.5 rounded">WE</span>
                      )}
                    </div>

                    <div className="flex items-center justify-center mb-1">
                      <input
                        type="number"
                        value={isWeekendIdle ? '' : (entry.hours === '' || entry.hours === null || entry.hours === undefined ? '' : entry.hours)}
                        onChange={e => setHours(day, e.target.value)}
                        onFocus={e => e.target.select()}
                        disabled={isReadOnly || entry.status === 'leave' || entry.status === 'holiday'}
                        min="0" max="24" step="0.5" placeholder={isWeekendDay ? '0' : '8'}
                        className="w-9 sm:w-12 h-6 sm:h-7 text-center text-xs sm:text-sm font-semibold bg-dark-800 border border-dark-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 focus:border-rivvra-500 disabled:bg-dark-800/50 disabled:text-dark-500 placeholder:text-dark-600 placeholder:font-normal [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[10px] text-dark-500 ml-0.5 hidden sm:inline">h</span>
                    </div>

                    <div className="text-center min-h-[18px]">
                      {isWeekendDay ? (
                        // Weekend: show working badge if hours logged, or clickable "status" to add hours
                        isWeekendWorking ? (
                          <button onClick={() => cycleStatus(day)} disabled={isReadOnly}
                            className={`inline-block px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium text-white ${statusColors['working']} ${!isReadOnly ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                            Working
                          </button>
                        ) : (
                          !isReadOnly && (
                            <button onClick={() => cycleStatus(day)}
                              className="inline-block px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium text-dark-500 border border-dashed border-dark-700 cursor-pointer hover:border-dark-500 hover:text-dark-400">
                              status
                            </button>
                          )
                        )
                      ) : hasStatus ? (
                        <button onClick={() => cycleStatus(day)} disabled={isReadOnly || entry.status === 'leave' || entry.status === 'holiday'}
                          title={entry.status === 'leave' ? 'Managed via Leave module' : entry.status === 'holiday' ? 'Public holiday' : ''}
                          className={`inline-block px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium text-white ${statusColors[entry.status]} ${(!isReadOnly && entry.status !== 'leave' && entry.status !== 'holiday') ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-90'}`}>
                          {statusLabels[entry.status]}
                        </button>
                      ) : (
                        !isReadOnly && (
                          <button onClick={() => cycleStatus(day)}
                            className="inline-block px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium text-dark-500 border border-dashed border-dark-700 cursor-pointer hover:border-dark-500 hover:text-dark-400">
                            status
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 card p-3 sm:p-4">
            {Object.entries(statusColors).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2.5 sm:w-3 h-2.5 sm:h-3 rounded ${color}`} />
                <span className="text-[10px] sm:text-xs text-dark-400">{statusLabels[key]}</span>
              </div>
            ))}
            <div className="w-full sm:w-auto sm:ml-auto text-xs sm:text-sm font-medium text-white flex items-center gap-2 sm:gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-dark-800">
              <span>{totalHours}h</span>
              <span className="text-dark-600">|</span>
              <span>{totalDays}d</span>
              {totalLeaves > 0 && <><span className="text-dark-600">|</span><span className="text-red-400">{totalLeaves} leave</span></>}
              {totalHolidays > 0 && <><span className="text-dark-600">|</span><span className="text-purple-400">{totalHolidays} hol</span></>}
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={handleReset} disabled={saving}
                className="bg-dark-800 border border-dark-700 text-dark-400 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-dark-700 hover:text-white flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 transition-colors">
                <RotateCcw size={14} /> Reset
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-dark-800 border border-dark-700 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 transition-colors">
                <Save size={14} /> Save Draft
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="bg-rivvra-500 text-dark-950 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 transition-colors">
                <Send size={14} /> Submit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
