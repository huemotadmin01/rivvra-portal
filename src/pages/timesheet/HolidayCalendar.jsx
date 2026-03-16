import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { getHolidays, updateHolidays, copyHolidaysToYear } from '../../utils/timesheetApi';
import { PageSkeleton } from '../../components/Skeletons';
import { Plus, Trash2, Copy, Loader2, Star, ChevronLeft, ChevronRight, Save } from 'lucide-react';

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse date string YYYY-MM-DD without timezone shift
function parseDate(d) {
  if (!d) return null;
  const s = typeof d === 'string' ? d : (d instanceof Date ? d.toISOString() : String(d));
  const match = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return { year: +match[1], month: +match[2] - 1, day: +match[3] };
  const dt = new Date(s);
  return { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
}

function toDateStr(d) {
  const p = parseDate(d);
  if (!p) return '';
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
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
      // Normalize dates to YYYY-MM-DD strings before saving
      const normalized = holidays.map(h => ({ ...h, date: toDateStr(h.date) }));
      await updateHolidays({ year, holidays: normalized });
      showToast('Holiday calendar saved', 'success');
      setIsDefault(false);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newHoliday.date || !newHoliday.name.trim()) {
      showToast('Date and name are required', 'error');
      return;
    }
    const updated = [...holidays, { ...newHoliday }].sort((a, b) => toDateStr(a.date).localeCompare(toDateStr(b.date)));
    setHolidays(updated);
    setNewHoliday({ date: '', name: '', type: 'mandatory', recurring: true });
    setShowAdd(false);
    try {
      const normalized = updated.map(h => ({ ...h, date: toDateStr(h.date) }));
      await updateHolidays({ year, holidays: normalized });
      showToast('Holiday added', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add', 'error');
      load(); // reload from DB on failure
    }
  };

  const handleRemove = async (idx) => {
    const updated = holidays.filter((_, i) => i !== idx);
    setHolidays(updated);
    try {
      const normalized = updated.map(h => ({ ...h, date: toDateStr(h.date) }));
      await updateHolidays({ year, holidays: normalized });
      showToast('Holiday removed', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove', 'error');
      setHolidays(holidays); // revert on failure
    }
  };

  const autoSave = async (updated) => {
    try {
      const normalized = updated.map(h => ({ ...h, date: toDateStr(h.date) }));
      await updateHolidays({ year, holidays: normalized });
    } catch {
      showToast('Failed to save change', 'error');
    }
  };

  const toggleType = (idx) => {
    const updated = holidays.map((h, i) => i === idx ? { ...h, type: h.type === 'mandatory' ? 'optional' : 'mandatory' } : h);
    setHolidays(updated);
    autoSave(updated);
  };

  const toggleRecurring = (idx) => {
    const updated = holidays.map((h, i) => i === idx ? { ...h, recurring: !h.recurring } : h);
    setHolidays(updated);
    autoSave(updated);
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

  // Group holidays by month using timezone-safe parsing
  const byMonth = {};
  holidays.forEach((h, idx) => {
    const p = parseDate(h.date);
    if (!p) return;
    const m = p.month;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push({ ...h, idx, day: p.day });
  });

  const mandatoryCount = holidays.filter(h => h.type === 'mandatory').length;
  const optionalCount = holidays.filter(h => h.type === 'optional').length;

  return (
    <div className="p-3 sm:p-6 space-y-5">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Holiday Calendar</h1>
        <p className="text-dark-400 text-sm mt-1">Manage public holidays for your organization</p>
        <div className="flex items-center justify-center gap-1 mt-3">
          <button onClick={() => setYear(y => y - 1)} className="p-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-400 hover:text-white hover:border-dark-600 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-white font-bold text-lg min-w-[60px] text-center px-3">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="p-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-400 hover:text-white hover:border-dark-600 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {isDefault && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="text-amber-400 text-lg">*</span>
          Showing default holidays. Click <strong>Save Calendar</strong> to customize for your organization.
        </div>
      )}

      {/* Stats + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-dark-400">
              <span className="text-white font-semibold">{holidays.length}</span> holidays
            </span>
            <span className="text-emerald-400">
              <span className="font-semibold">{mandatoryCount}</span> mandatory
            </span>
            {optionalCount > 0 && (
              <span className="text-yellow-400">
                <span className="font-semibold">{optionalCount}</span> optional
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAdd(true)} className="bg-rivvra-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 transition-colors">
            <Plus size={14} /> Add Holiday
          </button>
          <button onClick={handleCopyToNextYear} disabled={copying} className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-sm hover:text-white hover:border-dark-600 flex items-center gap-1.5 disabled:opacity-50 transition-colors">
            {copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Copy to {year + 1}
          </button>
          <button onClick={handleSave} disabled={saving} className="bg-rivvra-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-rivvra-400 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Calendar
          </button>
        </div>
      </div>

      {/* Add Holiday Form */}
      {showAdd && (
        <div className="bg-dark-800/80 border border-dark-700 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">Add New Holiday</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-dark-400 text-xs mb-1 block">Date</label>
              <input type="date" value={newHoliday.date} onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500" />
            </div>
            <div>
              <label className="text-dark-400 text-xs mb-1 block">Name</label>
              <input type="text" placeholder="Holiday name" value={newHoliday.name} onChange={e => setNewHoliday(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 placeholder:text-dark-500" />
            </div>
            <div>
              <label className="text-dark-400 text-xs mb-1 block">Type</label>
              <select value={newHoliday.type} onChange={e => setNewHoliday(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500">
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-dark-300 py-2">
              <input type="checkbox" checked={newHoliday.recurring} onChange={e => setNewHoliday(p => ({ ...p, recurring: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500" />
              Recurring yearly
            </label>
            <div className="flex gap-2">
              <button onClick={handleAdd} className="bg-rivvra-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 transition-colors">Add</button>
              <button onClick={() => setShowAdd(false)} className="text-dark-400 hover:text-white text-sm px-3 py-2 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, m) => {
          const monthHolidays = byMonth[m] || [];
          const hasHolidays = monthHolidays.length > 0;
          return (
            <div key={m} className={`rounded-xl border transition-colors ${hasHolidays ? 'bg-dark-800 border-dark-700' : 'bg-dark-800/40 border-dark-800'}`}>
              <div className={`px-4 py-2.5 border-b ${hasHolidays ? 'border-dark-700' : 'border-dark-800'}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`font-semibold text-sm ${hasHolidays ? 'text-white' : 'text-dark-500'}`}>{monthShort[m]}</h3>
                  {hasHolidays && (
                    <span className="text-[10px] text-dark-500 bg-dark-900 px-1.5 py-0.5 rounded">{monthHolidays.length}</span>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 min-h-[52px]">
                {hasHolidays ? (
                  <div className="space-y-2">
                    {monthHolidays.map(h => (
                      <div key={h.idx} className="flex items-center gap-2 group">
                        <span className="text-rivvra-400 text-xs font-mono w-5 shrink-0 text-right">{h.day}</span>
                        <span className="text-white text-sm truncate flex-1">{h.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleType(h.idx)}
                            title={`${h.type} — click to toggle`}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${h.type === 'mandatory' ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'}`}
                          >
                            {h.type === 'mandatory' ? 'M' : 'O'}
                          </button>
                          <button
                            onClick={() => toggleRecurring(h.idx)}
                            title={h.recurring ? 'Recurring — click to make one-time' : 'One-time — click to make recurring'}
                            className="transition-colors"
                          >
                            <Star size={10} className={h.recurring ? 'text-yellow-500 fill-yellow-500' : 'text-dark-600 hover:text-dark-400'} />
                          </button>
                          <button onClick={() => handleRemove(h.idx)} className="p-1 -m-1 text-dark-600 hover:text-red-400 transition-colors" title="Remove">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-dark-600 text-xs italic">No holidays</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
