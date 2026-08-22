import { FilterChip } from './FilterChip';
import { usePopover } from './usePopover';

/* NOTE ON COUPLING: the popover markup uses the `.pop` / `.pop-item` /
   `.pop-label` classes defined in components/platform/v2/shell.css, scoped
   under `.ds-shell`. Every v2 page renders inside that shell, so this is
   safe today; if a ds consumer ever lives outside the shell these three
   classes have to travel with it. Same applies to GroupByChip and
   MoreFilters. */

/**
 * Single-select filter chip. Controlled: the caller owns `value` and gets
 * `onChange(nextValue)` — passing '' means "cleared". The URL-bound variant
 * lives in the app layer (platform/v2/listkit).
 */
export function SelectChip({
  label,
  value = '',
  onChange,
  options = [],
  placeholder = 'No options',
  anyLabel = 'Any',
}) {
  const { open, setOpen, ref } = usePopover();
  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <FilterChip
        label={label}
        value={selected ? selected.label : anyLabel}
        active={!!selected}
        onClick={() => setOpen((o) => !o)}
        onRemove={selected ? () => onChange?.('') : undefined}
      />
      {open && (
        <div className="pop" style={{ top: 32, left: 0, maxHeight: 320, overflowY: 'auto' }}>
          <div className="pop-label">{label}</div>
          {options.length === 0 && (
            <div style={{ padding: '8px 10px', font: "450 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' }}>
              {placeholder}
            </div>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`pop-item ${String(o.value) === String(value) ? 'is-on' : ''}`}
              onClick={() => { onChange?.(String(o.value) === String(value) ? '' : o.value); setOpen(false); }}
            >
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
