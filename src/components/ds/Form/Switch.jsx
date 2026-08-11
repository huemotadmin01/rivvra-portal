/** Binary toggle with a spring-eased thumb. Renders as a real switch for a11y. */
export function Switch({ checked = false, onChange, disabled = false, label, style, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      style={{
        width: 38, height: 22, flexShrink: 0, padding: 2, borderRadius: 999, border: 'none',
        background: checked ? 'var(--brand, #22c55e)' : 'var(--surface-4, #253040)',
        boxShadow: `inset 0 0 0 1px ${checked ? 'var(--brand, #22c55e)' : 'var(--line-strong, rgba(255,255,255,.16))'}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background-color 180ms cubic-bezier(.2,.9,.28,1), box-shadow 180ms cubic-bezier(.2,.9,.28,1)',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          display: 'block', width: 18, height: 18, borderRadius: 999, background: '#fff',
          boxShadow: 'var(--sh-1, 0 1px 2px rgba(0,0,0,.36))',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 260ms cubic-bezier(.16,1.02,.3,1)',
        }}
      />
    </button>
  );
}

/** Settings row: label, description, and a right-aligned control. */
export function SettingRow({ label, description, control, style, ...rest }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 20, padding: 16,
        borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
        ...style,
      }}
      {...rest}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "550 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)', marginBottom: 3 }}>{label}</div>
        {description && (
          <p style={{ font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', margin: 0, maxWidth: '56ch' }}>
            {description}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>{control}</div>
    </div>
  );
}
