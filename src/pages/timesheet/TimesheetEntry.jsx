import { useState, useEffect } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { ChevronLeft, ChevronRight, Save, Send, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    if (!timesheetUser) return;
    timesheetApi.get('/projects').then(r => {
      setProjects(r.data);
      if (timesheetUser?.assignedProjects?.length > 0) {
        const assigned = r.data.find(p => timesheetUser.assignedProjects.some(ap => (ap._id || ap) === p._id));
        if (assigned) setSelectedProject(assigned._id);
        else if (r.data.length > 0) setSelectedProject(r.data[0]._id);
      } else if (r.data.length > 0) {
        setSelectedProject(r.data[0]._id);
      }
    });
  }, [timesheetUser]);

  useEffect(() => {
    if (!selectedProject || !timesheetUser) { setLoading(false); return; }
    setLoading(true);
    timesheetApi.get('/timesheets', { params: { month, year, contractor: timesheetUser._id } })
      .then(r => {
        const ts = r.data.find(t => t.project?._id === selectedProject || t.project === selectedProject);
        if (ts) {
          setTimesheet(ts);
          const entryMap = {};
          ts.entries.forEach(e => {
            const d = new Date(e.date).getDate();
            entryMap[d] = { hours: e.hours || 0, status: e.status || 'working' };
          });
          setEntries(entryMap);
        } else {
          setTimesheet(null);
          const daysInMonth = new Date(year, month, 0).getDate();
          const defaultMap = {};
          for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(year, month - 1, d).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) defaultMap[d] = { hours: 0, status: 'weekend' };
            else defaultMap[d] = { hours: '', status: null };
          }
          setEntries(defaultMap);
        }
      })
      .catch(() => setTimesheet(null))
      .finally(() => setLoading(false));
  }, [month, year, selectedProject, timesheetUser]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const cycleStatus = (day) => {
    if (timesheet && timesheet.status !== 'draft') return;
    const entry = entries[day] || { hours: '', status: null };
    if (entry.status === 'weekend') return;
    const order = ['working', 'leave', 'holiday'];
    const currentIdx = entry.status ? order.indexOf(entry.status) : -1;
    const next = order[(currentIdx + 1) % order.length];
    const newHours = next === 'working' ? 8 : 0;
    setEntries(prev => ({ ...prev, [day]: { hours: newHours, status: next } }));
  };

  const setHours = (day, value) => {
    if (timesheet && timesheet.status !== 'draft') return;
    const entry = entries[day] || { hours: '', status: null };
    if (entry.status === 'weekend') return;
    if (value === '' || value === undefined) {
      setEntries(prev => ({ ...prev, [day]: { hours: '', status: entry.status === 'leave' || entry.status === 'holiday' ? entry.status : null } }));
      return;
    }
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const clamped = Math.min(24, Math.max(0, num));
    const newStatus = clamped > 0 ? 'working' : (entry.status === 'leave' || entry.status === 'holiday' ? entry.status : null);
    setEntries(prev => ({ ...prev, [day]: { hours: clamped, status: newStatus } }));
  };

  const buildEntries = () => {
    return Object.entries(entries).map(([day, entry]) => {
      const hours = entry.hours === '' || entry.hours === null || entry.hours === undefined ? 0 : parseFloat(entry.hours) || 0;
      let status = entry.status;
      if (!status) {
        const dayOfWeek = new Date(year, month - 1, parseInt(day)).getDay();
        status = (dayOfWeek === 0 || dayOfWeek === 6) ? 'weekend' : 'working';
      }
      return { date: new Date(year, month - 1, parseInt(day)), hours, status };
    });
  };

  const totalHours = Object.values(entries).reduce((sum, e) => sum + (e.status === 'working' ? (parseFloat(e.hours) || 0) : 0), 0);
  const totalDays = totalHours / 8;
  const totalLeaves = Object.values(entries).filter(e => e.status === 'leave').length;
  const totalHolidays = Object.values(entries).filter(e => e.status === 'holiday').length;

  const handleSave = async () => {
    setSaving(true);
    try {
      const entryData = buildEntries();
      const project = projects.find(p => p._id === selectedProject);
      if (timesheet) {
        await timesheetApi.put(`/timesheets/${timesheet._id}`, { entries: entryData });
        showToast('Timesheet saved as draft');
      } else {
        const res = await timesheetApi.post('/timesheets', {
          project: selectedProject, client: project?.client?._id || project?.client, month, year, entries: entryData
        });
        setTimesheet(res.data);
        showToast('Timesheet created');
      }
      const r = await timesheetApi.get('/timesheets', { params: { month, year, contractor: timesheetUser._id } });
      const ts = r.data.find(t => (t.project?._id || t.project) === selectedProject);
      if (ts) setTimesheet(ts);
    } catch (err) {
      showToast(err.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!timesheet) { showToast('Please save the timesheet first', 'error'); return; }
    try {
      await timesheetApi.patch(`/timesheets/${timesheet._id}/submit`);
      showToast('Timesheet submitted for approval');
      const r = await timesheetApi.get('/timesheets', { params: { month, year, contractor: timesheetUser._id } });
      const ts = r.data.find(t => (t.project?._id || t.project) === selectedProject);
      if (ts) setTimesheet(ts);
    } catch (err) { showToast(err.response?.data?.message || 'Submit failed', 'error'); }
  };

  const handleReset = async () => {
    try {
      if (timesheet && timesheet.status === 'draft') {
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
    } catch (err) { showToast(err.response?.data?.message || 'Reset failed', 'error'); }
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const isReadOnly = timesheet && timesheet.status !== 'draft';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Timesheet</h1>
          <p className="text-dark-400 text-sm">Enter hours worked per day. Click status label to mark Leave/Holiday.</p>
        </div>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
          className="px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
          {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>

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
      ) : !selectedProject ? (
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
                <div key={`empty-${i}`} className="p-1.5 border-b border-r border-dark-800/50 min-h-[88px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const entry = entries[day] || { hours: '', status: null };
                const isToday = day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
                const isWeekend = entry.status === 'weekend';
                const isNonWorking = entry.status === 'leave' || entry.status === 'holiday';
                const hasStatus = entry.status !== null;
                const hoursNum = parseFloat(entry.hours) || 0;

                return (
                  <div key={day} className={`p-1.5 border-b border-r border-dark-800/50 min-h-[88px] transition-colors ${
                    isWeekend ? 'bg-dark-800/30' :
                    isNonWorking ? (entry.status === 'leave' ? 'bg-red-500/5' : 'bg-purple-500/5') :
                    entry.status === 'working' && hoursNum > 8 ? 'bg-blue-500/5' :
                    entry.status === 'working' && hoursNum > 0 ? 'bg-emerald-500/5' : ''
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${isToday ? 'bg-rivvra-500 text-dark-950 w-5 h-5 rounded-full flex items-center justify-center' : 'text-dark-300'}`}>
                        {day}
                      </span>
                    </div>

                    {!isWeekend && !isNonWorking ? (
                      <div className="flex items-center justify-center mb-1">
                        <input
                          type="number"
                          value={entry.hours === '' || entry.hours === null || entry.hours === undefined ? '' : entry.hours}
                          onChange={e => setHours(day, e.target.value)}
                          onFocus={e => e.target.select()}
                          disabled={isReadOnly}
                          min="0" max="24" step="0.5" placeholder="8"
                          className="w-12 h-7 text-center text-sm font-semibold bg-dark-800 border border-dark-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 focus:border-rivvra-500 disabled:bg-dark-800/50 disabled:text-dark-500 placeholder:text-dark-600 placeholder:font-normal [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[10px] text-dark-500 ml-0.5">h</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center mb-1">
                        <span className="text-xs text-dark-500">{isWeekend ? '' : '0h'}</span>
                      </div>
                    )}

                    <div className="text-center min-h-[18px]">
                      {hasStatus ? (
                        <button onClick={() => cycleStatus(day)} disabled={isReadOnly || isWeekend}
                          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium text-white ${statusColors[entry.status]} ${!isReadOnly && !isWeekend ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                          {statusLabels[entry.status]}
                        </button>
                      ) : (
                        !isReadOnly && (
                          <button onClick={() => cycleStatus(day)}
                            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium text-dark-500 border border-dashed border-dark-700 cursor-pointer hover:border-dark-500 hover:text-dark-400">
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

          <div className="flex flex-wrap items-center gap-4 card p-4">
            {Object.entries(statusColors).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${color}`} />
                <span className="text-xs text-dark-400">{statusLabels[key]}</span>
              </div>
            ))}
            <div className="ml-auto text-sm font-medium text-white flex items-center gap-3">
              <span>{totalHours}h total</span>
              <span className="text-dark-600">|</span>
              <span>{totalDays} days</span>
              {totalLeaves > 0 && <><span className="text-dark-600">|</span><span className="text-red-400">{totalLeaves} leave</span></>}
              {totalHolidays > 0 && <><span className="text-dark-600">|</span><span className="text-purple-400">{totalHolidays} holiday</span></>}
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex gap-3">
              <button onClick={handleReset} disabled={saving}
                className="bg-dark-800 border border-dark-700 text-dark-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-dark-700 hover:text-white flex items-center gap-2 disabled:opacity-50 transition-colors">
                <RotateCcw size={16} /> Reset
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-dark-800 border border-dark-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-dark-700 flex items-center gap-2 disabled:opacity-50 transition-colors">
                <Save size={16} /> Save as Draft
              </button>
              <button onClick={handleSubmit} disabled={!timesheet || saving}
                className="bg-rivvra-500 text-dark-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-2 disabled:opacity-50 transition-colors">
                <Send size={16} /> Submit for Approval
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
