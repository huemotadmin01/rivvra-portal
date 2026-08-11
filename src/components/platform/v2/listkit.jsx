import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilterChip } from '../../ds';

/* v2 list-page kit (Slice 2) — URL-driven filter controls composed from the
   ds primitives. Same param semantics as the legacy shared/FilterBar
   (filters live in the URL; any filter change resets `page`), so a URL
   bookmarked under one shell keeps meaning the same thing under the other.
   Popovers use the .pop classes from shell.css — v2 pages always render
   inside .ds-shell. */

export function useListParams(keys = []) {
  const [searchParams] = useSearchParams();
  const out = {};
  for (const k of keys) {
    const v = searchParams.get(k);
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

export function useUpdateParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === '' || value === false) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };
}

export function usePageParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(raw) && raw >= 1 ? raw : 1;
  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };
  return [page, setPage];
}

/** Debounced URL-synced search value for SearchInput (300ms, like legacy). */
export function useSearchParamValue(key = 'search') {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const urlValue = searchParams.get(key) || '';
  const [value, setValue] = useState(urlValue);
  const debounceRef = useRef(null);
  const skipRef = useRef(true);

  // External URL change (back button, clear-all) → adopt it.
  useEffect(() => { setValue(urlValue); }, [urlValue]);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    if (value === urlValue) return;
    debounceRef.current = setTimeout(() => updateParam(key, value), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue];
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return { open, setOpen, ref };
}

/** Single-select filter chip: closed = label (+ value when set), open = .pop menu. */
export function SelectChipV2({ paramKey, label, options = [], placeholder = 'No options' }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const { open, setOpen, ref } = usePopover();
  const value = searchParams.get(paramKey) || '';
  const selected = options.find((o) => String(o.value) === value);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <FilterChip
        label={label}
        value={selected ? selected.label : 'Any'}
        active={!!selected}
        onClick={() => setOpen((o) => !o)}
        onRemove={selected ? () => updateParam(paramKey, '') : undefined}
      />
      {open && (
        <div className="pop" style={{ top: 32, left: 0, maxHeight: 320, overflowY: 'auto' }}>
          <div className="pop-label">{label}</div>
          {options.length === 0 && (
            <div style={{ padding: '8px 10px', font: '450 12.5px/1.3 var(--font)', color: 'var(--fg-4)' }}>{placeholder}</div>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              className={`pop-item ${String(o.value) === value ? 'is-on' : ''}`}
              onClick={() => { updateParam(paramKey, String(o.value) === value ? '' : o.value); setOpen(false); }}
            >
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Boolean filter chip — click toggles the param on/off ('1' / absent). */
export function BooleanChipV2({ paramKey, label }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const on = searchParams.get(paramKey) === '1';
  return (
    <FilterChip
      label={label}
      value={on ? 'Yes' : 'Any'}
      active={on}
      onClick={() => updateParam(paramKey, on ? '' : '1')}
      onRemove={on ? () => updateParam(paramKey, '') : undefined}
    />
  );
}

/** Platform-wide Active/Archived split — same `archived=1` param as legacy. */
export function ArchivedToggleV2({ activeCount, archivedCount }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const archived = searchParams.get('archived') === '1';
  const seg = (on) => ({
    height: 26, padding: '0 10px', borderRadius: 'var(--r-full, 999px)',
    font: "500 12.5px/1 'Inter', system-ui, sans-serif", whiteSpace: 'nowrap',
    background: on ? 'var(--surface-4)' : 'transparent',
    color: on ? 'var(--fg)' : 'var(--fg-4)',
    transition: 'background 120ms var(--e-out), color 120ms var(--e-out)',
  });
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, flexShrink: 0,
      borderRadius: 'var(--r-full, 999px)', background: 'var(--surface-2)',
      boxShadow: 'inset 0 0 0 1px var(--line)',
    }}>
      <button type="button" style={seg(!archived)} onClick={() => updateParam('archived', '')}>
        Active{activeCount != null ? ` ${activeCount}` : ''}
      </button>
      <button type="button" style={seg(archived)} onClick={() => updateParam('archived', '1')}>
        Archived{archivedCount != null ? ` ${archivedCount}` : ''}
      </button>
    </span>
  );
}

/** Group-by chip — same `groupBy` param as legacy GroupByChip. */
export function GroupByChipV2({ options = [], paramKey = 'groupBy', label = 'Group by' }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const { open, setOpen, ref } = usePopover();
  const value = searchParams.get(paramKey) || '';
  const selected = options.find((o) => String(o.value) === value && o.value);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <FilterChip
        label={label}
        value={selected ? selected.label : 'None'}
        active={!!selected}
        onClick={() => setOpen((o) => !o)}
        onRemove={selected ? () => updateParam(paramKey, '') : undefined}
      />
      {open && (
        <div className="pop" style={{ top: 32, left: 0 }}>
          <div className="pop-label">{label}</div>
          {options.map((o) => (
            <button
              key={o.value}
              className={`pop-item ${String(o.value) === value ? 'is-on' : ''}`}
              onClick={() => { updateParam(paramKey, o.value); setOpen(false); }}
            >
              <span className="grow">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "More filters" chip — collapses rarely-used chips into a popover. The
 *  chip shows how many of its child params are active (legacy
 *  MoreFiltersPopover semantics). */
export function MoreFiltersV2({ paramKeys = [], label = 'More filters', children }) {
  const [searchParams] = useSearchParams();
  const { open, setOpen, ref } = usePopover();
  const activeCount = paramKeys.filter((k) => {
    const v = searchParams.get(k);
    return v != null && v !== '';
  }).length;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <FilterChip
        add={activeCount === 0}
        label={activeCount > 0 ? label : undefined}
        value={activeCount > 0 ? String(activeCount) : undefined}
        active={activeCount > 0}
        onClick={() => setOpen((o) => !o)}
      >
        {activeCount === 0 ? label : undefined}
      </FilterChip>
      {open && (
        <div className="pop" style={{ top: 32, left: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
          <div className="pop-label" style={{ padding: 0 }}>{label}</div>
          {children}
        </div>
      )}
    </div>
  );
}

const rangeInput = {
  flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 'var(--r-1, 7px)',
  background: 'var(--surface-2)', color: 'var(--fg)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--line)',
  font: "450 12px/1.3 'Inter', system-ui, sans-serif",
  colorScheme: 'dark',
};

/** From/to URL-param range row for a More-filters popover. `type` is the
 *  input type ('date' | 'number'). */
export function RangeFilterV2({ fromKey, toKey, label, type = 'date' }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const from = searchParams.get(fromKey) || '';
  const to = searchParams.get(toKey) || '';
  return (
    <div style={{ minWidth: 230 }}>
      <div style={{ font: "500 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type={type} inputMode={type === 'number' ? 'numeric' : undefined} placeholder={type === 'number' ? 'Min' : undefined}
          value={from} onChange={(e) => updateParam(fromKey, e.target.value)} style={rangeInput} />
        <span style={{ font: '450 10.5px/1 var(--font)', color: 'var(--fg-faint)' }}>to</span>
        <input type={type} inputMode={type === 'number' ? 'numeric' : undefined} placeholder={type === 'number' ? 'Max' : undefined}
          value={to} onChange={(e) => updateParam(toKey, e.target.value)} style={rangeInput} />
      </div>
    </div>
  );
}

/** v2 list-page header: title + count line on the left, actions right. */
export function PageHeaderV2({ title, sub, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
      <div>
        <h1 style={{ font: 'var(--t-title, 650 22px/1.2 var(--font))', color: 'var(--fg)', letterSpacing: '-0.015em' }}>{title}</h1>
        {sub && <p style={{ font: '450 13px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 4 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  );
}
