/** Collapsible group header row. Renders a single full-width `<tr>` so it
 *  slots into any table body. Accent bar + initials/icon give each group a
 *  visual hook; `sticky` pins it while its rows scroll. */
export function GroupedHeader({
  label,
  count = 0,
  noun = 'record',
  nounPlural,
  colSpan = 1,
  collapsed = false,
  onToggle,
  accent = 'var(--fg-faint, #4a5563)',
  avatarText,
  icon = null,
  sticky = false,
  stickyTop = 0,
  children,
  style,
  ...rest
}) {
  const plural = nounPlural || `${noun}s`;
  const initials = avatarText === '' ? '' : (avatarText ?? initialsOf(label));

  return (
    <tr style={{ background: 'var(--surface-2, #141b24)', ...style }} {...rest}>
      <td
        colSpan={colSpan}
        style={{
          padding: 0, borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
          position: sticky ? 'sticky' : 'static', top: sticky ? stickyTop : 'auto', zIndex: 1,
          background: 'var(--surface-2, #141b24)',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{ display: 'flex', alignItems: 'stretch', width: '100%', textAlign: 'left', background: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3, #1c242f)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ width: 3, flexShrink: 0, background: accent }} aria-hidden="true" />
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', flex: 1, minWidth: 0 }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4, #828e9f)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 140ms var(--e-out, ease)' }}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            {(icon || initials) && (
              <span style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in oklab, ${accent} 20%, transparent)`, color: accent,
                font: "600 10px/1 'Inter', system-ui, sans-serif",
              }}>
                {icon || initials}
              </span>
            )}
            <span style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{ font: "450 12px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {count} {count === 1 ? noun : plural}
            </span>
            {children && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, font: "450 12px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3, #98a4b2)' }}>{children}</span>}
          </span>
        </button>
      </td>
    </tr>
  );
}

function initialsOf(name) {
  if (!name || typeof name !== 'string') return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length === 1 ? p[0][0] : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
