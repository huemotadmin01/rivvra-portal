/** Surface container with an optional header row. The default content
 *  shell, and the detail-page section card: `icon` + `title` on the left,
 *  `actions` on the right. (Phase 3 chose to extend Panel rather than add a
 *  separate SectionCard — the shapes were the same modulo the icon slot.) */
export function Panel({ icon, title, actions, flush = false, children, style, ...rest }) {
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
          {(icon || title) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {icon && <span style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-4, #828e9f)', flexShrink: 0 }}>{icon}</span>}
              {title && (
                <span style={{ font: "650 13.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '-0.01em', color: 'var(--fg, #eef2f6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
              )}
            </span>
          )}
          {actions}
        </header>
      )}
      <div style={{ padding: flush ? 0 : 8 }}>{children}</div>
    </section>
  );
}
