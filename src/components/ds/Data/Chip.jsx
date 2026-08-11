const TONES = {
  neutral: { bg: 'var(--surface-3, #1c242f)', fg: 'var(--fg-3, #98a4b2)', ring: 'transparent' },
  brand:   { bg: 'var(--brand-soft, rgba(34,197,94,.14))', fg: 'var(--brand, #22c55e)', ring: 'var(--brand-line, rgba(34,197,94,.28))' },
  warn:    { bg: 'var(--warn-soft, rgba(245,158,11,.14))', fg: 'var(--warn, #f59e0b)', ring: 'transparent' },
  danger:  { bg: 'var(--danger-soft, rgba(239,68,68,.14))', fg: 'var(--danger, #ef4444)', ring: 'transparent' },
  info:    { bg: 'var(--info-soft, rgba(59,130,246,.14))', fg: 'var(--info, #3b82f6)', ring: 'transparent' },
};

/** Compact status pill. Pattern is bg/14, text/full, optional 1px ring. */
export function Chip({ tone = 'neutral', dot = false, uppercase = false, children, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 20, padding: '0 8px', borderRadius: 'var(--r-1, 8px)',
        background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1px ${t.ring}`,
        font: `600 ${uppercase ? 10 : 11}px/1 'Inter', system-ui, sans-serif`,
        letterSpacing: uppercase ? '0.08em' : 0,
        textTransform: uppercase ? 'uppercase' : 'none',
        whiteSpace: 'nowrap', flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', flexShrink: 0 }} />}
      {children}
    </span>
  );
}
