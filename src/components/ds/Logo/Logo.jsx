/** The Rivvra spiral. Strokes with a brand-token gradient, so it themes automatically. */
export function Logo({ size = 24, title, ...rest }) {
  const gid = React.useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      style={{ display: 'block' }}
      {...rest}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="64" x2="64" y2="0">
          <stop offset="0%" stopColor="var(--brand-lo, #16a34a)" />
          <stop offset="55%" stopColor="var(--brand, #22c55e)" />
          <stop offset="100%" stopColor="var(--brand-hi, #4ade80)" />
        </linearGradient>
      </defs>
      <path
        d="M46 8c14 6 18 32-2 46C28 64 8 54 8 36 8 20 22 12 34 18c10 6 10 20 0 24-8 2-12-6-8-12"
        stroke={`url(#${gid})`}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <circle cx="48" cy="5" r="2.6" fill="var(--brand-hi, #4ade80)" />
    </svg>
  );
}

/** Spiral + wordmark, locked to the correct gap and weight. */
export function LogoLockup({ size = 24, style, ...rest }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.36),
        font: `700 ${Math.round(size * 0.72)}px/1 'Inter', system-ui, sans-serif`,
        letterSpacing: '-0.018em',
        color: 'var(--fg, #eef2f6)',
        ...style,
      }}
      {...rest}
    >
      <Logo size={size} />
      Rivvra
    </span>
  );
}
