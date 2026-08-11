/** Indeterminate spinner. `PageSpinner` is the route-level suspense
 *  fallback; bare `Spinner` sits inline in buttons and toolbars. */
export function Spinner({ size = 18, color = 'var(--brand, #22c55e)', style, label = 'Loading' }) {
  return (
    <>
      <span
        role="status"
        aria-label={label}
        style={{
          display: 'inline-block', width: size, height: size, flexShrink: 0,
          border: `${Math.max(2, Math.round(size / 9))}px solid var(--line-2, rgba(255,255,255,.11))`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'ds-spin .7s linear infinite',
          ...style,
        }}
      />
      <style>{'@keyframes ds-spin{to{transform:rotate(360deg)}}'}</style>
    </>
  );
}

/** Centered spinner sized for a route-level Suspense fallback. */
export function PageSpinner({ minHeight = '50vh', label = 'Loading page' }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight }}>
      <Spinner size={24} label={label} />
    </div>
  );
}
