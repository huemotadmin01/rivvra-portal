import { ChevronDown } from 'lucide-react';

/**
 * Titled collapsible section — the settings-page archetype: a row of these,
 * each holding a group of related fields, only one or two open at a time.
 *
 * Controlled on purpose. Settings pages routinely need to open a section from
 * outside (a deep link, a validation error, "expand all"), and an internally
 * stateful version cannot do that without a ref escape hatch.
 *
 * The chevron rotates rather than swapping glyphs, so the open/closed states
 * are one element to a screen reader and one transition to the eye.
 */
export function Accordion({ icon, title, subtitle, open = false, onToggle, children, style, ...rest }) {
  return (
    <section
      style={{
        background: 'var(--surface-1, #101720)',
        borderRadius: 'var(--r-2, 12px)',
        boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07))',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', textAlign: 'left', cursor: 'pointer',
          background: open ? 'var(--surface-2)' : 'transparent',
          border: 0, borderBottom: open ? '1px solid var(--line-2)' : '1px solid transparent',
          color: 'inherit', font: 'inherit',
        }}
      >
        <ChevronDown
          size={15}
          style={{
            flexShrink: 0, color: 'var(--fg-4)',
            transform: open ? 'none' : 'rotate(-90deg)',
            transition: 'transform 120ms ease',
          }}
        />
        {icon && <span style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</span>}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ display: 'block', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>
              {subtitle}
            </span>
          )}
        </span>
      </button>
      {open && <div style={{ padding: 14, display: 'grid', gap: 14 }}>{children}</div>}
    </section>
  );
}
