import { useState, useEffect, useCallback } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import { getAttendance, updateAttendance, submitAttendance } from '../../utils/timesheetApi';
import {
  ChevronLeft, ChevronRight, Save, Send, Loader2, AlertCircle,
  CheckCircle2, Clock, XCircle, CalendarCheck,
} from 'lucide-react';

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function toISTDateStr(d) {
  const ist = new Date(new Date(d).getTime() + IST_OFFSET_MS);
  return ist.toISOString().split('T')[0];
}

// Status display config
const statusConfig = {
  working:  { label: 'Present',  short: 'P',  bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  half_day: { label: 'Half Day', short: '½',  bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-500' },
  absent:   { label: 'Absent',   short: 'A',  bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-500' },
  leave:    { label: 'Leave',    short: 'L',  bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    dot: 'bg-blue-500' },
  holiday:  { label: 'Holiday',  short: 'H',  bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/30',  dot: 'bg-purple-500' },
  weekend:  { label: 'Weekend',  short: '-',  bg: 'bg-dark-800/40',    text: 'text-dark-500',    border: 'border-dark-700/30',    dot: 'bg-dark-600' },
};

function getEntryDisplayStatus(entry) {
  if (entry.status === 'working') {
    const h = parseFloat(entry.hours) || 0;
    return h <= 4 && h > 0 ? 'half_day' : 'working';
  }
  return entry.status;
}

const statusBanners = {
  submitted: { icon: Clock, text: 'Submitted — waiting for approval', bg: 'bg-amber-500/10 border-amber-500/30', textColor: 'text-amber-400' },
  approved:  { icon: CheckCircle2, text: 'Approved', bg: 'bg-emerald-500/10 border-emerald-500/30', textColor: 'text-emerald-400' },
  rejected:  { icon: XCircle, text: 'Rejected — please update and re-submit', bg: 'bg-red-500/10 border-red-500/30', textColor: 'text-red-400' },
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

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    try {
      const data = await getAttendance(month, year);
      setAttendance(data.attendance);
      setEntries(data.attendance?.entries || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load attendance', 'error');
      setAttendance(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const canEdit = attendance && (attendance.status === 'draft' || attendance.status === 'rejected');

  const handleDayClick = (dateStr) => {
    if (!canEdit) return;

    setEntries(prev => prev.map(e => {
      const eDate = toISTDateStr(e.date);
      if (eDate !== dateStr) return e;
      if (['leave', 'holiday', 'weekend'].includes(e.status)) return e; // locked

      // Cycle: present (8h) → half-day (4h) → absent → present
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
    // Save first if dirty
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

  const navigateMonth = (dir) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    else if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  // Build calendar grid
  const buildCalendarGrid = () => {
    if (!entries.length) return [];

    // Build entry map by IST date string
    const entryMap = {};
    for (const e of entries) {
      entryMap[toISTDateStr(e.date)] = e;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
    // Convert to Mon-start: Mon=0, Tue=1, ..., Sun=6
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
      else if (e.status === 'leave') leave++;
      else if (e.status === 'absent') absent++;
      else if (e.status === 'working') {
        const h = parseFloat(e.hours) || 0;
        if (h >= 8) present++;
        else if (h > 0) halfDay++;
        else present++;
      }
    });
    const effective = present + (halfDay * 0.5) + holiday + leave;
    const totalCalendarDays = new Date(year, month, 0).getDate();
    return { present, halfDay, leave, holiday, absent, weekend, effective, totalCalendarDays };
  })();

  const weeks = buildCalendarGrid();
  const banner = statusBanners[attendance?.status];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <CalendarCheck size={22} className="text-rivvra-400" />
            My Attendance
          </h1>
          <p className="text-sm text-dark-400 mt-1">Mark your monthly attendance</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="text-white font-medium text-sm min-w-[140px] text-center">
            {monthNames[month - 1]} {year}
          </div>
          <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Status banner */}
      {banner && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border mb-4 ${banner.bg}`}>
          <banner.icon size={16} className={banner.textColor} />
          <span className={`text-sm font-medium ${banner.textColor}`}>{banner.text}</span>
          {attendance?.rejectionReason && (
            <span className="text-xs text-dark-400 ml-2">— {attendance.rejectionReason}</span>
          )}
        </div>
      )}

      {/* Auto-revert warning */}
      {attendance?.autoRevertReason && attendance?.status === 'draft' && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-4">
          <AlertCircle size={16} className="text-amber-400" />
          <span className="text-sm text-amber-400">{attendance.autoRevertReason}</span>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-dark-700">
          {dayHeaders.map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-dark-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-dark-700/50 last:border-0">
            {week.map((cell, ci) => {
              if (!cell) {
                return <div key={ci} className="min-h-[72px] bg-dark-850" />;
              }

              const { day, dateStr, entry } = cell;
              if (!entry) {
                return <div key={ci} className="min-h-[72px] bg-dark-850" />;
              }

              const displayStatus = getEntryDisplayStatus(entry);
              const config = statusConfig[displayStatus] || statusConfig.working;
              const isLocked = ['leave', 'holiday', 'weekend'].includes(entry.status);
              const isClickable = canEdit && !isLocked;
              const isToday = dateStr === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

              return (
                <div
                  key={ci}
                  onClick={() => isClickable && handleDayClick(dateStr)}
                  className={`min-h-[72px] p-1.5 transition-all relative
                    ${isClickable ? 'cursor-pointer hover:brightness-125' : ''}
                    ${isToday ? 'ring-1 ring-rivvra-500/50 ring-inset' : ''}
                  `}
                >
                  {/* Day number */}
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-rivvra-400' : 'text-dark-300'}`}>
                    {day}
                  </div>

                  {/* Status badge */}
                  <div className={`rounded-md px-1.5 py-1 text-center ${config.bg} border ${config.border}`}>
                    <span className={`text-[10px] font-bold ${config.text}`}>
                      {config.short}
                    </span>
                  </div>

                  {/* Note tooltip for leave/holiday */}
                  {entry.notes && ['leave', 'holiday'].includes(entry.status) && (
                    <div className={`text-[9px] mt-0.5 truncate ${config.text} opacity-70`} title={entry.notes}>
                      {entry.notes.replace('Leave: ', '')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 px-1">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className="text-xs text-dark-400">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 mt-4 p-4">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{summary.present}</div>
            <div className="text-xs text-dark-400">Present</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-400">{summary.halfDay}</div>
            <div className="text-xs text-dark-400">Half Day</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{summary.leave}</div>
            <div className="text-xs text-dark-400">Leave</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-400">{summary.holiday}</div>
            <div className="text-xs text-dark-400">Holiday</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-400">{summary.absent}</div>
            <div className="text-xs text-dark-400">Absent</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{summary.effective}</div>
            <div className="text-xs text-dark-400">Effective Days</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center justify-end gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-dark-700 text-white hover:bg-dark-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-bold"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit for Approval
          </button>
        </div>
      )}

      {/* Click hint */}
      {canEdit && (
        <p className="text-xs text-dark-500 mt-3 text-center">
          Click on a working day to cycle: Present → Half Day → Absent
        </p>
      )}
    </div>
  );
}
