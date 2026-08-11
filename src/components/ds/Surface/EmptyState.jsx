const TONES = {
  neutral: { bg: 'var(--surface-3, #1c242f)', fg: 'var(--fg-3, #98a4b2)' },
  brand:   { bg: 'var(--brand-soft, rgba(34,197,94,.14))', fg: 'var(--brand, #22c55e)' },
  warn:    { bg: 'var(--warn-soft, rgba(245,158,11,.14))', fg: 'var(--warn, #f59e0b)' },
  danger:  { bg: 'var(--danger-soft, rgba(239,68,68,.14))', fg: 'var(--danger, #ef4444)' },
  info:    { bg: 'var(--info-soft, rgba(59,130,246,.14))', fg: 'var(--info, #3b82f6)' },
};

/** Centred placeholder for empty, filtered, error, and no-access views. */
export function EmptyState({ icon, tone = 'neutral', title, children, actions, compact = false, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: compact ? '40px 20px' : '64px 24px',
        ...style,
      }}
      {...rest}
    >
      {icon && (
        <span
          style={{
            width: compact ? 42 : 54, height: compact ? 42 : 54,
            borderRadius: 'var(--r-3, 16px)', display: 'grid', placeItems: 'center',
            background: t.bg, color: t.fg, marginBottom: compact ? 12 : 16,
          }}
        >
          {icon}
        </span>
      )}
      <h3 style={{ font: `650 ${compact ? 14 : 15.5}px/1.3 'Inter', system-ui, sans-serif`, letterSpacing: '-0.012em', color: 'var(--fg, #eef2f6)', margin: '0 0 6px' }}>
        {title}
      </h3>
      {children && (
        <p style={{ font: `450 ${compact ? 12.5 : 13.5}px/1.55 'Inter', system-ui, sans-serif`, color: 'var(--fg-3, #98a4b2)', margin: 0, maxWidth: '38ch' }}>
          {children}
        </p>
      )}
      {actions && <div style={{ display: 'flex', gap: 8, marginTop: compact ? 16 : 20 }}>{actions}</div>}
    </div>
  );
}
