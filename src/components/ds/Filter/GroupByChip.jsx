import { FilterChip } from './FilterChip';
import { usePopover } from './usePopover';

/** Group-by selector chip. Controlled: `value` + `onChange(nextValue)`;
 *  '' means ungrouped. See SelectChip for the `.pop` class-coupling note. */
export function GroupByChip({ options = [], value = '', onChange, label = 'Group by', noneLabel = 'None' }) {
  const { open, setOpen, ref } = usePopover();
  const selected = options.find((o) => String(o.value) === String(value) && o.value);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <FilterChip
        label={label}
        value={selected ? selected.label : noneLabel}
        active={!!selected}
        onClick={() => setOpen((o) => !o)}
        onRemove={selected ? () => onChange?.('') : undefined}
      />
      {open && (
        <div className="pop" style={{ top: 32, left: 0 }}>
          <div className="pop-label">{label}</div>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`pop-item ${String(o.value) === String(value) ? 'is-on' : ''}`}
              onClick={() => { onChange?.(o.value); setOpen(false); }}
            >
              <span className="grow">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
