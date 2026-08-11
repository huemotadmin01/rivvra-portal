/** Labelled form control with hint and error text. Wraps any input as children. */
export function Field({ label, hint, error, required = false, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }} {...rest}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{ font: "550 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)' }}
        >
          {label}
          {required && <span style={{ color: 'var(--danger, #ef4444)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {hint && (
        <p style={{ font: "450 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', margin: '0 0 3px' }}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 5, font: "500 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger, #ef4444)', margin: '1px 0 0' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Text input styled to the system. Pass `invalid` to show the danger ring. */
export function Input({ invalid = false, style, ...rest }) {
  return (
    <input
      style={{
        height: 38, padding: '0 12px', width: '100%',
        border: 'none', outline: 'none', borderRadius: 'var(--r-2, 12px)',
        background: 'var(--surface-2, #141b24)', color: 'var(--fg, #eef2f6)',
        font: "450 13.5px/1 'Inter', system-ui, sans-serif",
        boxShadow: invalid
          ? '0 0 0 1px var(--danger, #ef4444), 0 0 0 4px var(--danger-soft, rgba(239,68,68,.14))'
          : '0 0 0 1px var(--line, rgba(255,255,255,.07))',
        transition: 'box-shadow 180ms cubic-bezier(.2,.9,.28,1)',
        ...style,
      }}
      {...rest}
    />
  );
}
