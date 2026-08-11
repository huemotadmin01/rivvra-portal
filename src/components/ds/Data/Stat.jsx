function Spark({ points, color }) {
  const w = 96, h = 38;
  const max = Math.max.apply(null, points), min = Math.min.apply(null, points);
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / (max - min || 1)) * (h - 6) - 3;
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      style={{ position: 'absolute', right: 0, bottom: 0, width: 96, height: 38, opacity: 0.5, pointerEvents: 'none' }}
      fill="none"
    >
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity=".12" />
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const Arrow = ({ down }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: down ? 'rotate(45deg)' : 'rotate(-45deg)', flexShrink: 0 }} aria-hidden="true">
    <path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5" />
  </svg>
);

/**
 * KPI card. `delta` drives the arrow direction from its sign; `invert` flips
 * only the tone, for metrics where falling is the win (time-to-fill, backlog).
 */
export function Stat({ label, value, delta, note, icon, color = 'var(--brand, #22c55e)', points, invert = false, style, ...rest }) {
  const rising = delta != null && delta >= 0;
  const good = invert ? !rising : rising;
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden', padding: 16,
        background: 'var(--surface-1, #101720)', borderRadius: 'var(--r-3, 16px)',
        boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
        color,
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-3, #98a4b2)' }}>{label}</span>
        {icon && (
          <span style={{ width: 26, height: 26, borderRadius: 'var(--r-1, 8px)', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
            {icon}
          </span>
        )}
      </div>
      <div style={{ font: "700 26px/1 'Inter', system-ui, sans-serif", letterSpacing: '-0.028em', color: 'var(--fg, #eef2f6)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {(delta != null || note) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, font: "500 11.5px/1 'Inter', system-ui, sans-serif" }}>
          {delta != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: good ? 'var(--brand, #22c55e)' : 'var(--danger, #ef4444)' }}>
              <Arrow down={!rising} />
              <span>{Math.abs(delta)}%</span>
            </span>
          )}
          {note && <span style={{ color: 'var(--fg-4, #828e9f)' }}>{note}</span>}
        </div>
      )}
      {points && points.length > 1 && <Spark points={points} color={color} />}
    </div>
  );
}
