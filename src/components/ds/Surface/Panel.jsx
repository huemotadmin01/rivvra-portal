/** Surface container with an optional header row. The default content shell. */
export function Panel({ title, actions, flush = false, children, style, ...rest }) {
  return (
    <section
      style={{
        background: 'var(--surface-1, #101720)',
        borderRadius: 'var(--r-3, 16px)',
        boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <header
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            height: 46, padding: '0 16px',
            borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
          }}
        >
          {title && (
            <span style={{ font: "650 13.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '-0.01em', color: 'var(--fg, #eef2f6)' }}>
              {title}
            </span>
          )}
          {actions}
        </header>
      )}
      <div style={{ padding: flush ? 0 : 8 }}>{children}</div>
    </section>
  );
}
