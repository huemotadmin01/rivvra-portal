/**
 * Tabs — in-page section navigation for detail and config pages.
 *
 * Controlled: the caller owns `value` and receives `onChange(key)`, so tab
 * state can live in the URL (`?tab=`) where it belongs. Renders as a real
 * tablist so arrow-key navigation and screen readers work.
 *
 * `sticky` pins the strip under the app bar while the section scrolls — pass
 * the offset the shell's app bar occupies (56px in the v2 shell).
 */
export function Tabs({ tabs = [], value, onChange, sticky = false, stickyTop = 0, accent = 'var(--brand, #22c55e)', style }) {
  const idx = tabs.findIndex((t) => t.key === value);

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const last = tabs.length - 1;
    let next = idx;
    if (e.key === 'ArrowRight') next = idx >= last ? 0 : idx + 1;
    if (e.key === 'ArrowLeft') next = idx <= 0 ? last : idx - 1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = last;
    if (tabs[next]) onChange?.(tabs[next].key);
  };

  return (
    <div
      role="tablist"
      className="ds-tablist"
      onKeyDown={onKeyDown}
      style={{
        display: 'flex', gap: 2, overflowX: 'auto', borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
        // The gutter macOS reserves for the overlay scrollbar reads as a stray
        // rule beside the underline. Tabs stay reachable by drag and by arrow
        // keys, and a clipped tab is its own overflow affordance.
        scrollbarWidth: 'none',
        ...(sticky ? {
          position: 'sticky', top: stickyTop, zIndex: 20,
          background: 'color-mix(in srgb, var(--bg, #06080b) 90%, transparent)',
          backdropFilter: 'blur(12px)',
        } : null),
        ...style,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange?.(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', whiteSpace: 'nowrap',
              font: `${on ? 600 : 500} 12.5px/1 'Inter', system-ui, sans-serif`,
              color: on ? 'var(--fg, #eef2f6)' : 'var(--fg-4, #828e9f)',
              borderBottom: `2px solid ${on ? accent : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 120ms var(--e-out, ease)',
            }}
          >
            {Icon && <Icon size={13} />}
            {t.label}
            {t.count != null && (
              <span style={{
                font: "600 10px/1 'Inter', system-ui, sans-serif", fontVariantNumeric: 'tabular-nums',
                // A tab's count is content, and it stays readable when the
                // tab is inactive. --fg-faint would put it at ~2.5.
                color: on ? 'var(--fg-3, #98a4b2)' : 'var(--fg-4, #828e9f)',
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
      <style>{'.ds-tablist::-webkit-scrollbar{display:none}'}</style>
    </div>
  );
}
