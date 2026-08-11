const ROWS_3 = 'M3 5h18M3 12h18M3 19h18';
const ROWS_4 = 'M3 4h18M3 9h18M3 15h18M3 20h18';

/** Comfortable / compact row-height switch. Pairs with `DataTable`'s `density`. */
export function DensityToggle({ density = 'comfortable', onChange, ...rest }) {
  const opts = [
    { key: 'comfortable', d: ROWS_3, title: 'Comfortable rows' },
    { key: 'compact', d: ROWS_4, title: 'Compact rows' },
  ];
  return (
    <div
      role="group"
      aria-label="Row density"
      style={{
        display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--r-1, 7px)', overflow: 'hidden',
        background: 'var(--surface-2, #141b24)', boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))', flexShrink: 0,
      }}
      {...rest}
    >
      {opts.map((o, i) => {
        const on = density === o.key;
        return (
          <button
            key={o.key}
            type="button"
            title={o.title}
            aria-pressed={on}
            onClick={() => onChange?.(o.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26,
              background: on ? 'var(--surface-4, #253040)' : 'transparent',
              color: on ? 'var(--fg, #eef2f6)' : 'var(--fg-4, #828e9f)',
              borderLeft: i ? '1px solid var(--line, rgba(255,255,255,.07))' : 'none',
              transition: 'background 120ms var(--e-out, ease), color 120ms var(--e-out, ease)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={o.d} /></svg>
          </button>
        );
      })}
    </div>
  );
}
