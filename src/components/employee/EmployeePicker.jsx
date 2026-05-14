// ============================================================================
// EmployeePicker.jsx — Searchable employee lookup widget
// ============================================================================
//
// Replaces plain <select> dropdowns for employee fields like `manager` and
// `sourcedByEmployeeId`. Matches across name, employeeId (#10000003), and
// designation, so a user can find a colleague by any of those.
//
// Props:
//   - value         : selected employee's _id (string) — '' / null / undefined when unset
//   - employees     : [{ _id, fullName, employeeId, designation }] — the option pool
//                     (caller is responsible for scoping to the right company)
//   - onChange(_id) : callback fired with the selected _id, or '' when cleared
//   - placeholder   : input placeholder (defaults to "Search by name or ID…")
//   - disabled      : disables interaction
//   - excludeIds    : optional array of _id strings to hide (e.g. self for manager picker)
//   - allowClear    : if true (default), shows an X to clear the selection
//
// Notes:
//   - Pure client-side filter — assumes the option pool is small (~hundreds).
//     Per-company scoping in the parent keeps this scaling fine.
//   - Stringifies _ids on compare so ObjectId vs string-of-ObjectId both match.
//   - Closes on outside click and on Escape.
// ============================================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

export default function EmployeePicker({
  value,
  employees = [],
  onChange,
  placeholder = 'Search by name or ID…',
  disabled = false,
  excludeIds = [],
  allowClear = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const valueStr = value == null ? '' : String(value);
  const excludeSet = useMemo(() => new Set(excludeIds.map(String)), [excludeIds]);

  const selected = useMemo(
    () => employees.find(e => String(e._id) === valueStr) || null,
    [employees, valueStr]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter(e => !excludeSet.has(String(e._id)))
      .filter(e => {
        if (!q) return true;
        const hay = `${e.fullName || ''} ${e.employeeId || ''} ${e.designation || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50); // cap render for sanity
  }, [employees, query, excludeSet]);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset query when closing so re-opening shows the full list
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // Auto-focus the search input when the dropdown opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const pick = (emp) => {
    onChange(String(emp._id));
    setOpen(false);
  };
  const clear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger — looks like an input field, shows current selection or placeholder */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`input-field w-full text-left flex items-center gap-2 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="flex-1 truncate text-sm">
          {selected ? (
            <>
              <span className="text-white">{selected.fullName}</span>
              {selected.employeeId && (
                <span className="text-dark-500 ml-1.5">#{selected.employeeId}</span>
              )}
            </>
          ) : (
            <span className="text-dark-500">— Select —</span>
          )}
        </span>
        {allowClear && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={clear}
            className="text-dark-500 hover:text-red-400 transition-colors"
            aria-label="Clear selection"
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown size={14} className="text-dark-500" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-xl flex flex-col" style={{ maxHeight: '20rem' }}>
          {/* Search row */}
          <div className="p-2 border-b border-dark-700 flex items-center gap-2">
            <Search size={14} className="text-dark-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="bg-transparent outline-none flex-1 text-sm text-white placeholder-dark-500"
            />
          </div>

          {/* Results */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-dark-500 text-center">
                No employees match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((e) => {
                const isSelected = String(e._id) === valueStr;
                return (
                  <button
                    key={e._id}
                    type="button"
                    onClick={() => pick(e)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-baseline gap-2 ${
                      isSelected ? 'text-orange-400 bg-dark-700/60' : 'text-white hover:bg-dark-700'
                    }`}
                  >
                    <span className="truncate">{e.fullName}</span>
                    {e.employeeId && (
                      <span className="text-dark-500 text-xs">#{e.employeeId}</span>
                    )}
                    {e.designation && (
                      <span className="text-dark-500 text-xs ml-auto truncate max-w-[40%]">{e.designation}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
