import { useState, useEffect, useCallback } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import { getAttendance, updateAttendance, submitAttendance, resetAttendance } from '../../utils/timesheetApi';
import {
  ChevronLeft, ChevronRight, Save, Send, Loader2, AlertCircle,
  CheckCircle2, Clock, XCircle, CalendarCheck, Info, RotateCcw, Lock,
} from 'lucide-react';

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Use UTC extraction — dates stored as midnight UTC in MongoDB
import { toDateInputValue } from '../../utils/dateUtils';
function toISTDateStr(d) {
  return toDateInputValue(d);
}

// Status display config
const statusConfig = {
  working:  { label: 'Present',  short: 'P',  emoji: '✓', gradient: 'from-emerald-500/20 to-emerald-600/5', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', dot: 'bg-emerald-500', ring: 'ring-emerald-500/40', hoverBg: 'hover:bg-emerald-500/25' },
  half_day: { label: 'Half Day', short: '½',  emoji: '◑', gradient: 'from-amber-500/20 to-amber-600/5', bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/25',   dot: 'bg-amber-500',   ring: 'ring-amber-500/40',   hoverBg: 'hover:bg-amber-500/25' },
  absent:   { label: 'Absent',   short: 'A',  emoji: '✕', gradient: 'from-red-500/20 to-red-600/5', bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/25',     dot: 'bg-red-500',     ring: 'ring-red-500/40',     hoverBg: 'hover:bg-red-500/25' },
  leave:    { label: 'Leave',    short: 'L',  emoji: '🏖', gradient: 'from-blue-500/20 to-blue-600/5', bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/25',    dot: 'bg-blue-500',    ring: 'ring-blue-500/40',    hoverBg: '' },
  half_day_leave: { label: '½ Leave', short: '½L', emoji: '🏖', gradient: 'from-blue-500/10 to-amber-500/5', bg: 'bg-blue-400/10', text: 'text-blue-300', border: 'border-blue-400/20', dot: 'bg-blue-400', ring: 'ring-blue-400/30', hoverBg: '' },
  holiday:  { label: 'Holiday',  short: 'H',  emoji: '🎉', gradient: 'from-purple-500/20 to-purple-600/5', bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/25',  dot: 'bg-purple-500',  ring: 'ring-purple-500/40',  hoverBg: '' },
  weekend:  { label: 'Weekend',  short: '—',  emoji: '—', gradient: '', bg: 'bg-dark-900/60',    text: 'text-dark-600',    border: 'border-dark-700/20',    dot: 'bg-dark-600',    ring: '',    hoverBg: '' },
  unfilled: { label: 'Unfilled', short: '—',  emoji: '—', gradient: '', bg: 'bg-dark-800/30',    text: 'text-dark-500',    border: 'border-dark-700/30 border-dashed', dot: 'bg-dark-600',    ring: '',    hoverBg: 'hover:bg-dark-700/30' },
};

function getEntryDisplayStatus(entry) {
  if (entry.status === 'working') {
    const h = parseFloat(entry.hours) || 0;
    if (h === 0) return 'unfilled';
    return h <= 4 ? 'half_day' : 'working';
  }
  if (entry.status === 'leave') {
    const h = parseFloat(entry.hours) || 0;
    if (h > 0 && h <= 4) return 'half_day_leave';
  }
  return entry.status;
}

const statusBanners = {
  submitted: { icon: Clock, text: 'Submitted — waiting for manager approval', bg: 'bg-gradient-to-r from-amber-500/10 to-amber-600/5 border-amber-500/20', textColor: 'text-amber-400' },
  approved:  { icon: CheckCircle2, text: 'Approved by manager', bg: 'bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border-emerald-500/20', textColor: 'text-emerald-400' },
  rejected:  { icon: XCircle, text: 'Rejected — please update and re-submit', bg: 'bg-gradient-to-r from-red-500/10 to-red-600/5 border-red-500/20', textColor: 'text-red-400' },
};

export default function MyAttendancePage() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [attendance, setAttendance] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [periodLocked, setPeriodLocked] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    setPeriodLocked(false);
    try {
      const data = await getAttendance(month, year);
      setAttendance(data.attendance);
      setEntries(data.attendance?.entries || []);
      setPeriodLocked(!!data.periodLocked);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load attendance', 'error');
      setAttendance(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const canEdit = !periodLocked && attendance && (attendance.status === 'draft' || attendance.status === 'rejected');

  const handleDayClick = (dateStr) => {
    if (!canEdit) return;

    setEntries(prev => prev.map(e => {
      const eDate = toISTDateStr(e.date);
      if (eDate !== dateStr) return e;
      if (['leave', 'holiday', 'weekend'].includes(e.status)) return e;

      if (e.status === 'working' && parseFloat(e.hours) >= 8) {
        return { ...e, status: 'working', hours: 4, notes: 'Half day' };
      } else if (e.status === 'working' && parseFloat(e.hours) <= 4) {
        return { ...e, status: 'absent', hours: 0, notes: '' };
      } else {
        return { ...e, status: 'working', hours: 8, notes: '' };
      }
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!attendance || saving) return;
    setSaving(true);
    try {
      const data = await updateAttendance(attendance._id, entries);
      setAttendance(data.attendance);
      setEntries(data.attendance.entries);
      setDirty(false);
      showToast('Attendance saved', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!attendance || submitting) return;

    // Check for unfilled working days
    const unfilledDays = entries.filter(e => e.status === 'working' && (parseFloat(e.hours) || 0) === 0).length;
    if (unfilledDays > 0) {
      if (!window.confirm(`You have ${unfilledDays} unfilled day${unfilledDays > 1 ? 's' : ''}. Submit anyway?`)) return;
    }

    if (dirty) {
      setSaving(true);
      try {
        const data = await updateAttendance(attendance._id, entries);
        setAttendance(data.attendance);
        setEntries(data.attendance.entries);
        setDirty(false);
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to save', 'error');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setSubmitting(true);
    try {
      const data = await submitAttendance(attendance._id);
      setAttendance(data.attendance);
      setEntries(data.attendance.entries);
      showToast('Attendance submitted for approval', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!attendance) return;
    if (!window.confirm('Reset this attendance? All entries will be cleared.')) return;
    try {
      // Blank working entries via PATCH (keeps leave/holiday/weekend intact)
      const data = await resetAttendance(attendance._id);
      setAttendance(data.attendance);
      setEntries(data.attendance.entries);
      setDirty(false);
      showToast('Attendance reset');
    } catch (err) {
      showToast(err.response?.data?.error || 'Reset failed', 'error');
    }
  };

  // Earliest allowed month: January of current year
  const minYear = now.getFullYear();
  const minMonth = 1;

  const navigateMonth = (dir) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    else if (m < 1) { m = 12; y--; }
    // Block navigation to previous years
    if (y < minYear) return;
    setMonth(m);
    setYear(y);
  };

  const canGoBack = !(year === minYear && month === minMonth);

  // Build calendar grid
  const buildCalendarGrid = () => {
    if (!entries.length) return [];

    const entryMap = {};
    for (const e of entries) {
      entryMap[toISTDateStr(e.date)] = e;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const weeks = [];
    let currentWeek = new Array(startOffset).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const entry = entryMap[dateStr] || null;
      currentWeek.push({ day: d, dateStr, entry });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  };

  // Summary counts
  const summary = (() => {
    let present = 0, halfDay = 0, leave = 0, holiday = 0, absent = 0, weekend = 0;
    entries.forEach(e => {
      if (e.status === 'weekend') weekend++;
      else if (e.status === 'holiday') holiday++;
      else if (e.status === 'leave') {
        const h = parseFloat(e.hours) || 0;
        leave += (h > 0 && h <= 4) ? 0.5 : 1;
      }
      else if (e.status === 'absent') absent++;
      else if (e.status === 'working') {
        const h = parseFloat(e.hours) || 0;
        if (h >= 8) present++;
        else if (h > 0) halfDay++;
        // hours === 0 means unfilled — don't count
      }
    });
    const effective = present + (halfDay * 0.5) + holiday + leave;
    const totalCalendarDays = new Date(year, month, 0).getDate();
    return { present, halfDay, leave, holiday, absent, weekend, effective, totalCalendarDays };
  })();

  const weeks = buildCalendarGrid();
  const banner = statusBanners[attendance?.status];
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Summary card data
  const summaryCards = [
    { label: 'Present', value: summary.present, color: 'emerald', config: statusConfig.working },
    { label: 'Half Day', value: summary.halfDay, color: 'amber', config: statusConfig.half_day },
    { label: 'Leave', value: summary.leave, color: 'blue', config: statusConfig.leave },
    { label: 'Holiday', value: summary.holiday, color: 'purple', config: statusConfig.holiday },
    { label: 'Absent', value: summary.absent, color: 'red', config: statusConfig.absent },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-dark-700" />
          <Loader2 className="w-12 h-12 text-rivvra-500 animate-spin absolute inset-0" />
        </div>
        <span className="text-sm text-dark-400">Loading attendance...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0">

      {/* ── Header Section ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rivvra-500/15 flex items-center justify-center flex-shrink-0">
            <CalendarCheck size={20} className="text-rivvra-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white leading-tight">My Attendance</h1>
            <p className="text-xs text-dark-400 mt-0.5">Mark your monthly attendance</p>
          </div>
        </div>

        {/* Month navigation pill */}
        <div className="flex items-center gap-1 bg-dark-800 rounded-xl border border-dark-700/60 p-1 self-start sm:self-auto">
          <button
            onClick={() => navigateMonth(-1)}
            disabled={!canGoBack}
            className={`p-2 rounded-lg transition-all active:scale-95 ${canGoBack ? 'hover:bg-dark-700 text-dark-400 hover:text-white' : 'text-dark-700 cursor-not-allowed'}`}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-white font-medium text-sm min-w-[130px] text-center px-2 select-none">
            {monthNames[month - 1]} {year}
          </div>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-all active:scale-95"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Period Locked Banner ── */}
      {periodLocked && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-amber-600/5 mb-4 backdrop-blur-sm">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-300">Payroll for {monthNames[month - 1]} {year} is locked. Attendance cannot be modified.</span>
        </div>
      )}

      {/* ── Status Banner ── */}
      {banner && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 backdrop-blur-sm ${banner.bg}`}>
          <banner.icon size={18} className={banner.textColor} />
          <span className={`text-sm font-medium ${banner.textColor}`}>{banner.text}</span>
          {attendance?.rejectionReason && (
            <span className="text-xs text-dark-400 ml-1 italic">"{attendance.rejectionReason}"</span>
          )}
        </div>
      )}

      {/* Auto-revert warning */}
      {attendance?.autoRevertReason && attendance?.status === 'draft' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-amber-600/5 mb-4">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-300">{attendance.autoRevertReason}</span>
        </div>
      )}

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 mb-4">
        {summaryCards.map(({ label, value, config }) => (
          <div key={label} className={`bg-dark-800/80 rounded-xl border border-dark-700/50 p-3 text-center transition-all hover:border-dark-600/70`}>
            <div className={`text-xl sm:text-2xl font-bold ${config.text} tabular-nums leading-none mb-1`}>
              {value}
            </div>
            <div className="text-[10px] sm:text-xs text-dark-400 font-medium uppercase tracking-wider">{label}</div>
          </div>
        ))}
        <div className="bg-dark-800/80 rounded-xl border border-rivvra-500/20 p-3 text-center">
          <div className="text-xl sm:text-2xl font-bold text-rivvra-400 tabular-nums leading-none mb-1">
            {summary.effective}
          </div>
          <div className="text-[10px] sm:text-xs text-dark-400 font-medium uppercase tracking-wider">Effective</div>
        </div>
      </div>

      {/* ── Calendar Grid ── */}
      <div className="bg-dark-800/70 rounded-2xl border border-dark-700/50 overflow-hidden backdrop-blur-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7">
          {dayHeaders.map((d, i) => (
            <div
              key={d}
              className={`py-3 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-widest
                ${i >= 5 ? 'text-dark-500' : 'text-dark-400'}
              `}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar weeks */}
        <div className="border-t border-dark-700/40">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((cell, ci) => {
                if (!cell) {
                  return (
                    <div key={ci} className="min-h-[68px] sm:min-h-[80px] md:min-h-[88px] bg-dark-900/30 border-b border-r border-dark-700/20" />
                  );
                }

                const { day, dateStr, entry } = cell;
                if (!entry) {
                  return (
                    <div key={ci} className="min-h-[68px] sm:min-h-[80px] md:min-h-[88px] bg-dark-900/30 border-b border-r border-dark-700/20" />
                  );
                }

                const displayStatus = getEntryDisplayStatus(entry);
                const config = statusConfig[displayStatus] || statusConfig.working;
                const isLocked = ['leave', 'holiday', 'weekend'].includes(entry.status);
                const isClickable = canEdit && !isLocked;
                const isToday = dateStr === todayStr;
                const isWeekend = entry.status === 'weekend';

                return (
                  <div
                    key={ci}
                    onClick={() => isClickable && handleDayClick(dateStr)}
                    className={`
                      min-h-[68px] sm:min-h-[80px] md:min-h-[88px] p-1.5 sm:p-2
                      border-b border-r border-dark-700/20
                      transition-all duration-150 relative group
                      ${isWeekend ? 'bg-dark-900/40' : `bg-gradient-to-br ${config.gradient}`}
                      ${isClickable ? 'cursor-pointer hover:brightness-125 active:scale-[0.97]' : ''}
                      ${isToday ? 'ring-2 ring-inset ring-rivvra-500/60' : ''}
                    `}
                  >
                    {/* Today indicator dot */}
                    {isToday && (
                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rivvra-500 animate-pulse" />
                    )}

                    {/* Day number */}
                    <div className={`text-[11px] sm:text-xs font-semibold mb-1.5 ${isToday ? 'text-rivvra-400' : isWeekend ? 'text-dark-600' : 'text-dark-300'}`}>
                      {day}
                    </div>

                    {/* Status pill */}
                    <div className={`
                      rounded-lg px-1 sm:px-2 py-1 sm:py-1.5 text-center
                      border ${config.border} ${config.bg}
                      ${isClickable ? 'group-hover:shadow-sm' : ''}
                    `}>
                      <span className={`text-[10px] sm:text-xs font-bold ${config.text} leading-none`}>
                        {config.short}
                      </span>
                    </div>

                    {/* Note for leave/holiday */}
                    {entry.notes && ['leave', 'holiday'].includes(entry.status) && (
                      <div
                        className={`text-[8px] sm:text-[9px] mt-1 truncate ${config.text} opacity-60 leading-tight`}
                        title={entry.notes}
                      >
                        {entry.notes.replace('Leave: ', '')}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 px-1">
        {Object.entries(statusConfig).filter(([k]) => k !== 'weekend').map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="text-[10px] sm:text-xs text-dark-500">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      {canEdit && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-5">
          <div className="flex items-center gap-2 text-dark-500">
            <Info size={13} />
            <p className="text-[11px]">
              Click a weekday to cycle: <span className="text-emerald-400">Present</span> → <span className="text-amber-400">Half Day</span> → <span className="text-red-400">Absent</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={handleReset}
              disabled={saving || submitting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-800 text-dark-400 hover:bg-dark-700 hover:text-white border border-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97] text-sm font-medium"
            >
              <RotateCcw size={15} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-700/80 text-white hover:bg-dark-600 border border-dark-600/50 hover:border-dark-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97] text-sm font-medium"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save Draft
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97] text-sm font-bold shadow-lg shadow-rivvra-500/20 hover:shadow-rivvra-400/30"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Submit for Approval
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
