const TONES = {
  brand:  { bg: 'var(--brand-soft, rgba(34,197,94,.14))', fg: 'var(--brand, #22c55e)', d: 'M20 6 9 17l-5-5' },
  warn:   { bg: 'var(--warn-soft, rgba(245,158,11,.14))', fg: 'var(--warn, #f59e0b)', d: 'M12 8v5M12 16.5v.5' },
  danger: { bg: 'var(--danger-soft, rgba(239,68,68,.14))', fg: 'var(--danger, #ef4444)', d: 'M18 6 6 18M6 6l12 12' },
};

/** Single notification. Render inside `ToastStack`. */
export function Toast({ tone = 'brand', title, children, onDismiss, style, ...rest }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 10,
        minWidth: 268, maxWidth: 380, padding: '11px 13px',
        background: 'var(--surface-2, #141b24)', borderRadius: 'var(--r-3, 16px)',
        boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.1)), var(--sh-3, 0 12px 32px rgba(0,0,0,.4)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
        ...style,
      }}
      {...rest}
    >
      <span style={{ width: 20, height: 20, borderRadius: 999, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1, background: t.bg, color: t.fg }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={t.d} />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: "550 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)' }}>{title}</span>
        {children && <span style={{ display: 'block', font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', marginTop: 2 }}>{children}</span>}
      </span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss"
          style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', border: 'none', background: 'none', borderRadius: 6, color: 'var(--fg-4, #828e9f)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Fixed bottom-right column for `Toast` children. */
export function ToastStack({ children, style, ...rest }) {
  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 95,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
