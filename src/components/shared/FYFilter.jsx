// ============================================================================
// FYFilter — Indian Financial Year filter (April–March)
// Dropdown: Current FY / Previous FY / All time / Custom range
// Emits { dateFrom, dateTo } as ISO date strings (YYYY-MM-DD) or nulls.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';

// Indian FY runs Apr 1 → Mar 31. Apr 2026 = FY 26-27.
function fyForDate(d) {
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const start = m >= 4 ? y : y - 1;
  return { start, end: start + 1, label: `${String(start).slice(-2)}-${String(start + 1).slice(-2)}` };
}

function fyRange(fy) {
  const from = new Date(Date.UTC(fy.start, 3, 1)); // Apr 1
  const to = new Date(Date.UTC(fy.end, 2, 31, 23, 59, 59, 999)); // Mar 31
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}

const CURRENT = fyForDate(new Date());
const PRESETS = [
  { key: 'all', label: 'All time', range: () => ({ dateFrom: null, dateTo: null }) },
  { key: 'current', label: `Current FY (${CURRENT.label})`, range: () => fyRange(CURRENT) },
  { key: 'previous', label: `Previous FY (${String(CURRENT.start - 1).slice(-2)}-${String(CURRENT.start).slice(-2)})`, range: () => fyRange({ start: CURRENT.start - 1, end: CURRENT.start }) },
  { key: 'fy_minus_2', label: `FY ${String(CURRENT.start - 2).slice(-2)}-${String(CURRENT.start - 1).slice(-2)}`, range: () => fyRange({ start: CURRENT.start - 2, end: CURRENT.start - 1 }) },
];

export default function FYFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(value?.preset === 'custom');
  const [customFrom, setCustomFrom] = useState(value?.dateFrom || '');
  const [customTo, setCustomTo] = useState(value?.dateTo || '');
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const active = PRESETS.find(p => p.key === value?.preset) || (value?.preset === 'custom' ? null : PRESETS[0]);
  const buttonLabel = value?.preset === 'custom'
    ? (value.dateFrom || value.dateTo
        ? `${value.dateFrom || '…'} → ${value.dateTo || '…'}`
        : 'Custom range')
    : (active?.label || 'All time');

  function pickPreset(p) {
    setShowCustom(false);
    onChange({ preset: p.key, ...p.range() });
    setOpen(false);
  }

  function applyCustom() {
    onChange({ preset: 'custom', dateFrom: customFrom || null, dateTo: customTo || null });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-dark-850 border border-dark-700 hover:border-dark-600 rounded-lg px-3 py-2 text-sm text-white transition-colors"
      >
        <Calendar size={14} className="text-dark-400" />
        <span className="font-medium">{buttonLabel}</span>
        <ChevronDown size={14} className="text-dark-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-72 bg-dark-850 border border-dark-700 rounded-lg shadow-xl overflow-hidden">
          <div className="py-1.5">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => pickPreset(p)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${value?.preset === p.key ? 'bg-rivvra-500/10 text-rivvra-400' : 'text-white hover:bg-dark-800'}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustom(s => !s)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${value?.preset === 'custom' ? 'bg-rivvra-500/10 text-rivvra-400' : 'text-white hover:bg-dark-800'}`}
            >
              Custom range…
            </button>
          </div>
          {(showCustom || value?.preset === 'custom') && (
            <div className="border-t border-dark-700 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] uppercase tracking-wider text-dark-500">
                  From
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="mt-1 w-full bg-dark-900 border border-dark-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-rivvra-500" />
                </label>
                <label className="text-[10px] uppercase tracking-wider text-dark-500">
                  To
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="mt-1 w-full bg-dark-900 border border-dark-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-rivvra-500" />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setCustomFrom(''); setCustomTo(''); onChange({ preset: 'all', dateFrom: null, dateTo: null }); setOpen(false); }} className="text-xs text-dark-400 hover:text-white px-2 py-1 inline-flex items-center gap-1">
                  <X size={12} /> Clear
                </button>
                <button type="button" onClick={applyCustom} className="text-xs bg-rivvra-500 hover:bg-rivvra-600 text-white px-3 py-1 rounded font-medium">Apply</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
