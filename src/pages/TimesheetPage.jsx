import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ChevronLeft, ChevronRight, Save, Send, AlertCircle } from 'lucide-react';

const statusColors = {
  'working': 'bg-green-500',
  'leave': 'bg-red-400',
  'holiday': 'bg-purple-400',
  'weekend': 'bg-gray-300',
};

const statusLabels = {
  'working': 'Working',
  'leave': 'Leave',
  'holiday': 'Holiday',
  'weekend': 'Weekend',
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TimesheetPage() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [timesheet, setTimesheet] = useState(null);
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load projects
  useEffect(() => {
    api.get('/projects').then(r => {
      setProjects(r.data);
      if (user?.assignedProjects?.length > 0) {
        const assigned = r.data.find(p => user.assignedProjects.some(ap => (ap._id || ap) === p._id));
        if (assigned) setSelectedProject(assigned._id);
        else if (r.data.length > 0) setSelectedProject(r.data[0]._id);
      } else if (r.data.length > 0) {
        setSelectedProject(r.data[0]._id);
      }
    });
  }, [user]);

  // Load timesheet for selected month/project
  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    api.get('/timesheets', { params: { month, year, contractor: user._id } })
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
          // Pre-fill: weekends=0h/weekend, weekdays=empty (placeholder 8)
          const daysInMonth = new Date(year, month, 0).getDate();
          const defaultMap = {};
          for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(year, month - 1, d).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              defaultMap[d] = { hours: 0, status: 'weekend' };
            } else {
              defaultMap[d] = { hours: '', status: null };
            }
          }
          setEntries(defaultMap);
        }
      })
      .catch(() => setTimesheet(null))
      .finally(() => setLoading(false));
  }, [month, year, selectedProject, user._id]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const cycleStatus = (day) => {
    if (timesheet && timesheet.status !== 'draft') return;
    const entry = entries[day] || { hours: '', status: null };
    if (entry.status === 'weekend') return;

    // Cycle: null/working -> leave -> holiday -> working
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

    // Allow empty string while editing
    if (value === '' || value === undefined) {
      setEntries(prev => ({ ...prev, [day]: { hours: '', status: entry.status === 'leave' || entry.status === 'holiday' ? entry.status : null } }));
      return;
    }

    const num = parseFloat(value);
    if (isNaN(num)) return;
    const clamped = Math.min(24, Math.max(0, num));

    // Auto-set status to working only when typing non-zero hours
    const newStatus = clamped > 0 ? 'working' : (entry.status === 'leave' || entry.status === 'holiday' ? entry.status : null);
    setEntries(prev => ({ ...prev, [day]: { hours: clamped, status: newStatus } }));
  };

  const buildEntries = () => {
    return Object.entries(entries).map(([day, entry]) => ({
      date: new Date(year, month - 1, parseInt(day)),
      hours: entry.hours === '' || entry.hours === null || entry.hours === undefined ? 0 : entry.hours,
      status: entry.status || 'working'
    }));
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
        await api.put(`/timesheets/${timesheet._id}`, { entries: entryData });
        toast.success('Timesheet saved as draft');
      } else {
        const res = await api.post('/timesheets', {
          project: selectedProject,
          client: project?.client?._id || project?.client,
          month, year,
          entries: entryData
        });
        setTimesheet(res.data);
        toast.success('Timesheet created');
      }
      // Reload
      const r = await api.get('/timesheets', { params: { month, year, contractor: user._id } });
      const ts = r.data.find(t => (t.project?._id || t.project) === selectedProject);
      if (ts) setTimesheet(ts);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!timesheet) {
      toast.error('Please save the timesheet first');
      return;
    }
    try {
      await api.patch(`/timesheets/${timesheet._id}/submit`);
      toast.success('Timesheet submitted for approval');
      const r = await api.get('/timesheets', { params: { month, year, contractor: user._id } });
      const ts = r.data.find(t => (t.project?._id || t.project) === selectedProject);
      if (ts) setTimesheet(ts);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submit failed');
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const isReadOnly = timesheet && timesheet.status !== 'draft';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Timesheet</h1>
          <p className="text-gray-500 text-sm">Enter hours worked per day. Click status label to mark Leave/Holiday.</p>
        </div>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
        >
          {projects.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Status Banner */}
      {timesheet && timesheet.status !== 'draft' && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm font-medium ${
          timesheet.status === 'submitted' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
          timesheet.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' :
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <AlertCircle size={16} />
          {timesheet.status === 'submitted' && 'Timesheet submitted — awaiting approval'}
          {timesheet.status === 'approved' && `Timesheet approved • ${timesheet.totalHours || 0}h (${timesheet.totalWorkingDays} days)`}
          {timesheet.status === 'rejected' && `Rejected: ${timesheet.rejectionReason || 'No reason given'}`}
        </div>
      )}

      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
        <h2 className="text-lg font-semibold text-gray-900">{monthNames[month - 1]} {year}</h2>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* Calendar Grid */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {dayNames.map(d => (
                <div key={d} className="text-center py-2 text-xs font-medium text-gray-500 bg-gray-50">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="p-1.5 border-b border-r border-gray-100 min-h-[88px]" />
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
                  <div
                    key={day}
                    className={`p-1.5 border-b border-r border-gray-100 min-h-[88px] transition-colors ${
                      isWeekend ? 'bg-gray-50' :
                      isNonWorking ? (entry.status === 'leave' ? 'bg-red-50/50' : 'bg-purple-50/50') :
                      entry.status === 'working' && hoursNum > 8 ? 'bg-blue-50/50' :
                      entry.status === 'working' && hoursNum > 0 ? 'bg-green-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${isToday ? 'bg-accent text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-gray-700'}`}>
                        {day}
                      </span>
                    </div>

                    {/* Hours input — show for working or unset days */}
                    {!isWeekend && !isNonWorking ? (
                      <div className="flex items-center justify-center mb-1">
                        <input
                          type="number"
                          value={entry.hours === '' || entry.hours === null || entry.hours === undefined ? '' : entry.hours}
                          onChange={e => setHours(day, e.target.value)}
                          onFocus={e => e.target.select()}
                          disabled={isReadOnly}
                          min="0"
                          max="24"
                          step="0.5"
                          placeholder="8"
                          className="w-12 h-7 text-center text-sm font-semibold border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent disabled:bg-gray-50 disabled:text-gray-500 placeholder:text-gray-300 placeholder:font-normal [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[10px] text-gray-400 ml-0.5">h</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center mb-1">
                        <span className="text-xs text-gray-400">{isWeekend ? '' : '0h'}</span>
                      </div>
                    )}

                    {/* Status label — only show when status is set */}
                    <div className="text-center min-h-[18px]">
                      {hasStatus ? (
                        <button
                          onClick={() => cycleStatus(day)}
                          disabled={isReadOnly || isWeekend}
                          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium text-white ${statusColors[entry.status]} ${
                            !isReadOnly && !isWeekend ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                          }`}
                        >
                          {statusLabels[entry.status]}
                        </button>
                      ) : (
                        !isReadOnly && (
                          <button
                            onClick={() => cycleStatus(day)}
                            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium text-gray-300 border border-dashed border-gray-200 cursor-pointer hover:border-gray-400 hover:text-gray-400"
                          >
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

          {/* Legend & Summary */}
          <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl border border-gray-200 p-4">
            {Object.entries(statusColors).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${color}`} />
                <span className="text-xs text-gray-600">{statusLabels[key]}</span>
              </div>
            ))}
            <div className="ml-auto text-sm font-medium text-gray-900 flex items-center gap-3">
              <span>{totalHours}h total</span>
              <span className="text-gray-400">|</span>
              <span>{totalDays} days</span>
              {totalLeaves > 0 && <><span className="text-gray-400">|</span><span className="text-red-500">{totalLeaves} leave</span></>}
              {totalHolidays > 0 && <><span className="text-gray-400">|</span><span className="text-purple-500">{totalHolidays} holiday</span></>}
            </div>
          </div>

          {/* Actions */}
          {!isReadOnly && (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={16} /> Save as Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={!timesheet || saving}
                className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2 disabled:opacity-50"
              >
                <Send size={16} /> Submit for Approval
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
