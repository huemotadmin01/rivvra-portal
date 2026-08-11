import { FilterChip } from './FilterChip';
import { usePopover } from './usePopover';

/** Overflow chip that collapses rarely-used filters into a popover. The
 *  chip badges how many of them are currently set — the caller computes
 *  `activeCount` because only it knows where the filter state lives.
 *  See SelectChip for the `.pop` class-coupling note. */
export function MoreFilters({ activeCount = 0, label = 'More filters', children }) {
  const { open, setOpen, ref } = usePopover();
  const has = activeCount > 0;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <FilterChip
        add={!has}
        label={has ? label : undefined}
        value={has ? String(activeCount) : undefined}
        active={has}
        onClick={() => setOpen((o) => !o)}
      >
        {has ? undefined : label}
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
