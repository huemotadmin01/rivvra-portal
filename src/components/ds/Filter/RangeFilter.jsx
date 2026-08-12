const rangeInput = {
  flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 'var(--r-1, 7px)',
  background: 'var(--surface-2, #141b24)', color: 'var(--fg, #eef2f6)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
  font: "450 12px/1.3 'Inter', system-ui, sans-serif",
};

/** From/to pair for date or number ranges, sized for a More-filters
 *  popover. Controlled: `from`/`to` + `onFromChange`/`onToChange`. */
export function RangeFilter({ label, type = 'date', from = '', to = '', onFromChange, onToChange }) {
  const numeric = type === 'number';
  return (
    <div style={{ minWidth: 230 }}>
      <div style={{ font: "500 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type={type}
          inputMode={numeric ? 'numeric' : undefined}
          placeholder={numeric ? 'Min' : undefined}
          aria-label={`${label} from`}
          value={from}
          onChange={(e) => onFromChange?.(e.target.value)}
          style={rangeInput}
        />
        <span style={{ font: "450 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' }}>to</span>
        <input
          type={type}
          inputMode={numeric ? 'numeric' : undefined}
          placeholder={numeric ? 'Max' : undefined}
          aria-label={`${label} to`}
          value={to}
          onChange={(e) => onToChange?.(e.target.value)}
          style={rangeInput}
        />
      </div>
    </div>
  );
}
