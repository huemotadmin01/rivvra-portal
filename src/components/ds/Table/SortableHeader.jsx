/** Standalone sortable `<th>` for hand-built tables. Three-state cycle:
 *  asc → desc → cleared. `DataTable` has this built in via `column.sortable`. */
export function SortableHeader({
  column,
  sort = null,
  onSortChange,
  align = 'left',
  children,
  style,
  ...rest
}) {
  const state = sort?.key === column ? sort.dir : null;
  const cycle = () => onSortChange?.(state === null ? { key: column, dir: 'asc' } : state === 'asc' ? { key: column, dir: 'desc' } : null);
  const d = state === 'asc' ? 'M12 19V5M5 12l7-7 7 7' : state === 'desc' ? 'M12 5v14M19 12l-7 7-7-7' : 'M7 15l5 5 5-5M7 9l5-5 5 5';

  return (
    <th
      aria-sort={state ? (state === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{
        font: "600 10.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--fg-4, #828e9f)', padding: '9px 14px', textAlign: align, whiteSpace: 'nowrap',
        background: 'var(--surface-2, #141b24)', borderBottom: '1px solid var(--line, rgba(255,255,255,.07))', userSelect: 'none', ...style,
      }}
      {...rest}
    >
      <button
        type="button"
        onClick={cycle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, font: 'inherit',
          letterSpacing: 'inherit', textTransform: 'inherit',
          color: state ? 'var(--brand, #22c55e)' : 'inherit',
          justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        }}
      >
        {children}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: state ? 1 : 0.34, flexShrink: 0 }}><path d={d} /></svg>
      </button>
    </th>
  );
}
