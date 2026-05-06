import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, ChevronDown, Filter, Check } from 'lucide-react';

/**
 * FilterBar — shared list-page filter shell.
 *
 * Composition pattern (locked 2026-05-06): each list page imports this shell
 * and composes its own <FilterChip> children. State syncs to URL query
 * params so views are bookmarkable / shareable / refresh-safe.
 *
 * Mobile (<640px): chips collapse into a single "Filters (N)" button that
 * opens a bottom-sheet with the same chip set.
 *
 * Usage:
 *   const filterParams = useFilterParams(['stageId', 'salespersonId', ...]);
 *   <FilterBar searchKey="search">
 *     <FilterChip type="select" paramKey="stageId" label="Stage" options={stageOptions} />
 *     <FilterChip type="boolean" paramKey="isLost" label="Lost" />
 *     <ArchivedToggle activeCount={…} archivedCount={…} />
 *   </FilterBar>
 */

// ---------------------------------------------------------------------------
// Hook: read all known filter params from the URL into a stable object.
// Page components pass this object straight to their list API.
// ---------------------------------------------------------------------------
export function useFilterParams(keys = []) {
  const [searchParams] = useSearchParams();
  const out = {};
  for (const k of keys) {
    const v = searchParams.get(k);
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helper: set/clear a single param while preserving the rest.
// ---------------------------------------------------------------------------
function useUpdateParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === '' || value === false) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    // Reset page param whenever any other filter changes.
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: false });
  };
}

// ---------------------------------------------------------------------------
// FilterBar shell — search box + chip row on desktop, collapsed sheet on mobile.
// ---------------------------------------------------------------------------
export default function FilterBar({ searchKey = 'search', searchPlaceholder = 'Search…', children }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const [searchValue, setSearchValue] = useState(searchParams.get(searchKey) || '');
  const [mobileOpen, setMobileOpen] = useState(false);
  const debounceRef = useRef(null);

  // Sync local input to URL — debounced so typing doesn't slam the API.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParam(searchKey, searchValue);
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // Re-sync if URL changes externally (e.g. user clicks back).
  useEffect(() => {
    const urlVal = searchParams.get(searchKey) || '';
    if (urlVal !== searchValue) setSearchValue(urlVal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get(searchKey)]);

  // Count active non-search filter params for the mobile collapse pill.
  const activeChipCount = Array.from(searchParams.entries()).filter(([k, v]) => k !== searchKey && k !== 'page' && v).length;

  const clearAll = () => {
    const next = new URLSearchParams();
    if (searchValue) next.set(searchKey, searchValue);
    // setSearchParams via updateParam is per-key; do it directly here.
    window.history.replaceState({}, '', window.location.pathname + (next.toString() ? '?' + next.toString() : ''));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
          />
        </div>

        {/* Desktop chip row */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
          {children}
          {activeChipCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-dark-500 hover:text-dark-300 underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Mobile: single "Filters (N)" button */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-800 border border-dark-600 rounded-lg text-dark-200"
        >
          <Filter size={13} /> Filters{activeChipCount > 0 ? ` (${activeChipCount})` : ''}
        </button>
      </div>

      {/* Mobile bottom-sheet */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full bg-dark-900 border-t border-dark-700 rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-dark-100">Filters</h3>
              <button onClick={() => setMobileOpen(false)} className="text-dark-400 hover:text-dark-200"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {children}
            </div>
            <div className="flex gap-2 mt-5">
              {activeChipCount > 0 && (
                <button
                  type="button"
                  onClick={() => { clearAll(); setMobileOpen(false); }}
                  className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-800 border border-dark-600 rounded-lg hover:bg-dark-700"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex-1 px-3 py-2 text-xs text-white bg-rivvra-500 rounded-lg hover:bg-rivvra-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterChip — typed primitive used inside a FilterBar.
// ---------------------------------------------------------------------------
/**
 * Props:
 *   type      — 'select' | 'boolean' | 'segmented'
 *   paramKey  — URL param key to read/write
 *   label     — display label
 *   options   — for 'select' / 'segmented': [{ value, label, count? }]
 *   placeholder — for 'select': empty-state label
 */
export function FilterChip({ type = 'select', paramKey, label, options = [], placeholder }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const value = searchParams.get(paramKey) || '';
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (type === 'segmented') {
    return (
      <div className="inline-flex items-center bg-dark-800 border border-dark-600 rounded-lg overflow-hidden">
        {options.map((o, i) => {
          const isActive = (value || options[0].value) === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => updateParam(paramKey, o.value === options[0].value ? '' : o.value)}
              className={`px-3 py-1.5 text-xs ${isActive ? 'bg-rivvra-500/20 text-rivvra-300' : 'text-dark-400 hover:text-dark-200'} ${i > 0 ? 'border-l border-dark-600' : ''}`}
            >
              {o.label}{o.count != null ? ` ${o.count}` : ''}
            </button>
          );
        })}
      </div>
    );
  }

  if (type === 'boolean') {
    const isActive = value === 'true' || value === '1';
    return (
      <button
        type="button"
        onClick={() => updateParam(paramKey, isActive ? '' : 'true')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          isActive
            ? 'bg-rivvra-500/15 text-rivvra-300 border-rivvra-500/30'
            : 'bg-dark-800 text-dark-400 border-dark-600 hover:text-dark-200'
        }`}
      >
        {isActive && <Check size={12} />}
        {label}
      </button>
    );
  }

  // type === 'select'
  const selected = options.find(o => String(o.value) === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          value
            ? 'bg-rivvra-500/15 text-rivvra-300 border-rivvra-500/30'
            : 'bg-dark-800 text-dark-400 border-dark-600 hover:text-dark-200'
        }`}
      >
        <span>{label}{selected ? `: ${selected.label}` : ''}</span>
        {value && (
          <X
            size={12}
            className="hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); updateParam(paramKey, ''); }}
          />
        )}
        {!value && <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[180px] bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
          {!options.length && <div className="px-3 py-2 text-xs text-dark-500">{placeholder || 'No options'}</div>}
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { updateParam(paramKey, o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-dark-700 ${
                String(o.value) === value ? 'text-rivvra-300' : 'text-dark-200'
              }`}
            >
              <span>{o.label}</span>
              {String(o.value) === value && <Check size={12} className="text-rivvra-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArchivedToggle — convenience wrapper around a 2-segment chip for the
// platform-wide Active/Archived split.
// ---------------------------------------------------------------------------
export function ArchivedToggle({ activeCount, archivedCount }) {
  return (
    <FilterChip
      type="segmented"
      paramKey="archived"
      label="Archive"
      options={[
        { value: '', label: `Active${activeCount != null ? ` ${activeCount}` : ''}` },
        { value: '1', label: `Archived${archivedCount != null ? ` ${archivedCount}` : ''}` },
      ]}
    />
  );
}
