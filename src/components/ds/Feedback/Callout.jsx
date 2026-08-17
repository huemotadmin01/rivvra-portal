/**
 * Callout — a full-width inline notice.
 *
 * The legacy UI hand-rolls this shape everywhere: a tinted rounded rect, a
 * lucide icon, a line of text, sometimes a trailing action. MyAttendancePage
 * alone had four, each with its own gradient and its own opacity stop, and
 * every one of them was dark-only.
 *
 * Tones follow Chip's table exactly, including its correction: `brand` and
 * `warn` read the *-ink tokens rather than the accent itself, because the
 * accent on its own tint measures ~4.35 against a 4.5 floor.
 */

const TONES = {
  neutral: { bg: 'var(--surface-2, #131a23)', fg: 'var(--fg-2, #bac4d0)', ring: 'var(--line-2, #1e293b)' },
  brand:   { bg: 'var(--brand-soft, rgba(34,197,94,.14))', fg: 'var(--brand-ink, #22c55e)', ring: 'var(--brand-line, rgba(34,197,94,.28))' },
  warn:    { bg: 'var(--warn-soft, rgba(245,158,11,.14))', fg: 'var(--warn-ink, #f59e0b)', ring: 'color-mix(in srgb, var(--warn, #f59e0b) 28%, transparent)' },
  danger:  { bg: 'var(--danger-soft, rgba(239,68,68,.14))', fg: 'var(--danger, #ef4444)', ring: 'color-mix(in srgb, var(--danger, #ef4444) 28%, transparent)' },
  info:    { bg: 'var(--info-soft, rgba(59,130,246,.14))', fg: 'var(--info, #3b82f6)', ring: 'color-mix(in srgb, var(--info, #3b82f6) 28%, transparent)' },
};

export function Callout({ tone = 'neutral', icon, title, actions, children, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 'var(--r-2, 12px)',
        background: t.bg, boxShadow: `inset 0 0 0 1px ${t.ring}`,
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: t.fg, display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0, font: "500 13px/1.45 'Inter', system-ui, sans-serif", color: t.fg }}>
        {title && <span style={{ fontWeight: 600 }}>{title}</span>}
        {title && children ? ' ' : null}
        {children}
      </div>
      {actions && <div style={{ flexShrink: 0, display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}
