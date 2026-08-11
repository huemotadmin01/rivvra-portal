const SIZES = { sm: { d: 24, f: 10 }, md: { d: 32, f: 12 }, lg: { d: 48, f: 16 } };

function initialsFrom(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

/** Initials circle with the brand gradient fill. Falls back to `?` with no name. */
export function Avatar({ name, initials, size = 'md', ring = false, src, style, ...rest }) {
  const s = SIZES[size] || SIZES.md;
  const label = initials || initialsFrom(name);
  return (
    <span
      title={name || undefined}
      style={{
        width: s.d, height: s.d, borderRadius: 999, flexShrink: 0,
        display: 'grid', placeItems: 'center', overflow: 'hidden',
        background: src ? 'var(--surface-3, #1c242f)' : 'linear-gradient(140deg, var(--brand-hi, #4ade80), var(--brand-lo, #16a34a))',
        color: 'var(--brand-fg, #041209)',
        font: `700 ${s.f}px/1 'Inter', system-ui, sans-serif`,
        letterSpacing: '0.01em',
        boxShadow: ring ? '0 0 0 3px var(--brand-soft, rgba(34,197,94,.14))' : 'none',
        ...style,
      }}
      {...rest}
    >
      {src ? <img src={src} alt={name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : label}
    </span>
  );
}
