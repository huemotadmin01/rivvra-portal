/** Slides up when rows are selected: count, verbs, and a clear action.
 *  Render it inside the list container — it pins to the bottom of the viewport. */
export function BulkActionBar({
  count = 0,
  noun = 'record',
  nounPlural,
  onClear,
  actions = [],
  fixed = true,
  style,
  ...rest
}) {
  const open = count > 0;
  const plural = nounPlural || `${noun}s`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: fixed ? 'fixed' : 'sticky', bottom: fixed ? 22 : 12, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 80,
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 180ms var(--e-out, ease), transform 220ms var(--e-spring, ease)',
        visibility: open ? 'visible' : 'hidden',
        ...style,
      }}
      {...rest}
    >
      <div style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 4,
        padding: '7px 8px 7px 14px', borderRadius: 'var(--r-full, 999px)',
        background: 'var(--surface-3, #1c242f)', boxShadow: 'var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6)), inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
        maxWidth: 'calc(100vw - 32px)', overflowX: 'auto',
      }}>
        <span style={{ font: "600 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {count} {count === 1 ? noun : plural} selected
        </span>
        <span style={{ width: 1, height: 18, background: 'var(--line-2, rgba(255,255,255,.11))', margin: '0 6px', flexShrink: 0 }} />
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-full, 999px)',
              font: "600 12.5px/1 'Inter', system-ui, sans-serif", whiteSpace: 'nowrap',
              color: a.tone === 'danger' ? 'var(--danger, #f87171)' : a.tone === 'primary' ? 'var(--brand-fg, #041209)' : 'var(--fg-2, #bac4d0)',
              background: a.tone === 'primary' ? 'var(--brand, #22c55e)' : 'transparent',
              opacity: a.disabled ? 0.45 : 1, cursor: a.disabled ? 'not-allowed' : 'pointer',
              transition: 'background 120ms var(--e-out, ease), color 120ms var(--e-out, ease)',
            }}
            onMouseEnter={(e) => { if (!a.disabled && a.tone !== 'primary') e.currentTarget.style.background = 'var(--surface-4, #253040)'; }}
            onMouseLeave={(e) => { if (a.tone !== 'primary') e.currentTarget.style.background = 'transparent'; }}
          >
            {a.icon}{a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, color: 'var(--fg-4, #828e9f)', marginLeft: 2, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-4, #253040)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
