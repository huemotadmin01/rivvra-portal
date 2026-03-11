import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { getHolidays, updateHolidays, copyHolidaysToYear } from '../../utils/timesheetApi';
import { PageSkeleton } from '../../components/Skeletons';
import { Calendar, Plus, Trash2, Copy, Loader2, Star, Globe } from 'lucide-react';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d) {
  const dt = new Date(d);
  return `${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear()}`;
}

export default function HolidayCalendar() {
  const { showToast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', type: 'mandatory', recurring: true });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getHolidays({ year });
      setHolidays(res.holidays || []);
      setIsDefault(!!res._isDefault);
    } catch {
      showToast('Failed to load holidays', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateHolidays({ year, holidays });
      showToast('Holiday calendar saved', 'success');
      setIsDefault(false);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) {
      showToast('Date and name are required', 'error');
      return;
    }
    setHolidays(prev => [...prev, { ...newHoliday, date: new Date(newHoliday.date) }].sort((a, b) => new Date(a.date) - new Date(b.date)));
    setNewHoliday({ date: '', name: '', type: 'mandatory', recurring: true });
    setShowAdd(false);
  };

  const handleRemove = (idx) => {
    setHolidays(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleType = (idx) => {
    setHolidays(prev => prev.map((h, i) => i === idx ? { ...h, type: h.type === 'mandatory' ? 'optional' : 'mandatory' } : h));
  };

  const toggleRecurring = (idx) => {
    setHolidays(prev => prev.map((h, i) => i === idx ? { ...h, recurring: !h.recurring } : h));
  };

  const handleCopyToNextYear = async () => {
    setCopying(true);
    try {
      const res = await copyHolidaysToYear({ fromYear: year, toYear: year + 1 });
      showToast(res.message || `Copied to ${year + 1}`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to copy', 'error');
    } finally {
      setCopying(false);
    }
  };

  if (loading) return <PageSkeleton />;

  // Group holidays by month for calendar display
  const byMonth = {};
  holidays.forEach((h, idx) => {
    const d = new Date(h.date);
    const m = d.getMonth();
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push({ ...h, idx });
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Holiday Calendar</h1>
          <p className="text-dark-400 text-sm mt-1">Manage public holidays for your organization.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(y => y - 1)} className="px-3 py-1.5 text-sm bg-dark-800 border border-dark-700 rounded-lg text-dark-300 hover:text-white">&larr;</button>
          <span className="text-white font-semibold text-lg min-w-[60px] text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-3 py-1.5 text-sm bg-dark-800 border border-dark-700 rounded-lg text-dark-300 hover:text-white">&rarr;</button>
        </div>
      </div>

      {isDefault && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm rounded-lg px-4 py-3">
          Showing default holidays. Save to customize for your organization.
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowAdd(true)} className="bg-rivvra-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-600 flex items-center gap-1.5">
          <Plus size={14} /> Add Holiday
        </button>
        <button onClick={handleCopyToNextYear} disabled={copying} className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-sm hover:text-white flex items-center gap-1.5 disabled:opacity-50">
          {copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Copy to {year + 1}
        </button>
        <button onClick={handleSave} disabled={saving} className="ml-auto bg-rivvra-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save Calendar
        </button>
      </div>

      {/* Add Holiday Form (inline) */}
      {showAdd && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-3">
          <h3 className="text-white font-medium text-sm">Add New Holiday</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input type="date" value={newHoliday.date} onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))}
              className="bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500" />
            <input type="text" placeholder="Holiday name" value={newHoliday.name} onChange={e => setNewHoliday(p => ({ ...p, name: e.target.value }))}
              className="bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 placeholder:text-dark-500" />
            <select value={newHoliday.type} onChange={e => setNewHoliday(p => ({ ...p, type: e.target.value }))}
              className="bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500">
              <option value="mandatory">Mandatory</option>
              <option value="optional">Optional</option>
            </select>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-dark-300">
                <input type="checkbox" checked={newHoliday.recurring} onChange={e => setNewHoliday(p => ({ ...p, recurring: e.target.checked }))}
                  className="rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500" />
                Recurring
              </label>
              <button onClick={handleAdd} className="bg-rivvra-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-rivvra-600">Add</button>
              <button onClick={() => setShowAdd(false)} className="text-dark-400 hover:text-white text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Holiday List by Month */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 12 }, (_, m) => (
          <div key={m} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <h3 className="text-white font-semibold text-sm mb-3">{monthNames[m]} {year}</h3>
            {byMonth[m]?.length ? (
              <div className="space-y-2">
                {byMonth[m].map(h => (
                  <div key={h.idx} className="flex items-center justify-between gap-2 group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-dark-400 text-xs font-mono w-5 shrink-0">{new Date(h.date).getDate()}</span>
                      <span className="text-white text-sm truncate">{h.name}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${h.type === 'mandatory' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}
                        onClick={() => toggleType(h.idx)} title="Click to toggle type">
                        {h.type === 'mandatory' ? 'M' : 'O'}
                      </span>
                      {h.recurring && (
                        <Star size={10} className="text-yellow-500 shrink-0 cursor-pointer" onClick={() => toggleRecurring(h.idx)} title="Recurring — click to toggle" />
                      )}
                    </div>
                    <button onClick={() => handleRemove(h.idx)} className="text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-500 text-xs">No holidays</p>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="text-dark-400 text-sm">
        Total: {holidays.length} holidays ({holidays.filter(h => h.type === 'mandatory').length} mandatory, {holidays.filter(h => h.type === 'optional').length} optional)
      </div>
    </div>
  );
}
