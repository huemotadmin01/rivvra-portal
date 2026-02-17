import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ChevronLeft, ChevronRight, Save, Send, AlertCircle } from 'lucide-react';

const statusColors = {
  'full-day': 'bg-green-500',
  'half-day': 'bg-yellow-400',
  'leave': 'bg-red-400',
  'holiday': 'bg-purple-400',
  'weekend': 'bg-gray-300',
};

const statusLabels = {
  'full-day': 'Full Day',
  'half-day': 'Half Day',
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
      // Auto-select user's first assigned project or first available
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
            entryMap[d] = e.status;
          });
          setEntries(entryMap);
        } else {
          setTimesheet(null);
          // Pre-fill weekends
          const daysInMonth = new Date(year, month, 0).getDate();
          const weekendMap = {};
          for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(year, month - 1, d).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) weekendMap[d] = 'weekend';
            else weekendMap[d] = 'full-day';
          }
          setEntries(weekendMap);
        }
      })
      .catch(() => setTimesheet(null))
      .finally(() => setLoading(false));
  }, [month, year, selectedProject, user._id]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const cycleStatus = (day) => {
    if (timesheet && timesheet.status !== 'draft') return;
    const order = ['full-day', 'half-day', 'leave', 'holiday', 'weekend'];
    const current = entries[day] || 'full-day';
    const next = order[(order.indexOf(current) + 1) % order.length];
    setEntries(prev => ({ ...prev, [day]: next }));
  };

  const buildEntries = () => {
    return Object.entries(entries).map(([day, status]) => ({
      date: new Date(year, month - 1, parseInt(day)),
      status
    }));
  };

  const totalFull = Object.values(entries).filter(s => s === 'full-day').length;
  const totalHalf = Object.values(entries).filter(s => s === 'half-day').length;
  const totalWorking = totalFull + totalHalf * 0.5;

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
          <p className="text-gray-500 text-sm">Click on a date to change status</p>
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
          {timesheet.status === 'approved' && `Timesheet approved • ${timesheet.totalWorkingDays} working days`}
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
                <div key={`empty-${i}`} className="p-2 border-b border-r border-gray-100 min-h-[72px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const status = entries[day] || 'full-day';
                const isToday = day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
                return (
                  <div
                    key={day}
                    onClick={() => cycleStatus(day)}
                    className={`p-2 border-b border-r border-gray-100 min-h-[72px] cursor-pointer hover:bg-gray-50 transition-colors ${isReadOnly ? 'cursor-default' : ''}`}
                  >
                    <span className={`text-sm font-medium ${isToday ? 'bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    <div className="mt-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </span>
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
            <div className="ml-auto text-sm font-medium text-gray-900">
              Total: {totalWorking} working days ({totalFull} full + {totalHalf} half)
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
