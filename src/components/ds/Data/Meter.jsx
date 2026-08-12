/**
 * Meter — a proportion as a track and a fill, with an optional right-aligned
 * readout.
 *
 * This is the shape every dashboard was hand-rolling: a `bg-dark-800
 * rounded-full h-2` track with a brand-coloured inner div width-set from a
 * percentage. Doing it inline meant the track colour was a fixed dark value,
 * so it survived the theme swap only by accident of the palette bridge.
 *
 * Not a chart. When the question is "how far along / what share is this",
 * this is the answer; a chart is for a distribution or a trend.
 */
export function Meter({
  value = 0,
  max = 100,
  label,
  readout,
  color = 'var(--brand, #22c55e)',
  size = 'md',
  style,
  ...rest
}) {
  // Clamp rather than trust the caller: a percentage computed from a stale
  // total can exceed 100 and would otherwise overflow the track.
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const h = size === 'sm' ? 5 : size === 'lg' ? 10 : 7;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, ...style }} {...rest}>
      {label && (
        <span style={{
          font: "450 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3, #98a4b2)',
          flexShrink: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : undefined}
        style={{
          flex: 1, minWidth: 0, height: h, borderRadius: 999, overflow: 'hidden',
          background: 'var(--surface-3, #1c242f)',
        }}
      >
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 999, background: color,
          transition: 'width 260ms var(--e-out, cubic-bezier(.2,.9,.28,1))',
        }} />
      </div>
      {readout != null && (
        <span style={{
          font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)',
          flexShrink: 0, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 32,
        }}>
          {readout}
        </span>
      )}
    </div>
  );
}
