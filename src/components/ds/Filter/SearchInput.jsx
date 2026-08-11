import { useRef } from 'react';

/** Search field with a leading glyph and a clear affordance. */
export function SearchInput({
  value = '',
  onChange,
  placeholder = 'Search…',
  size = 'md',
  width,
  autoFocus = false,
  style,
  ...rest
}) {
  const ref = useRef(null);
  const h = size === 'sm' ? 28 : 34;

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: h,
        padding: '0 9px', borderRadius: 'var(--r-1, 7px)', flexShrink: 0,
        background: 'var(--surface-2, #141b24)',
        boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
        transition: 'box-shadow 140ms var(--e-out, ease)',
        width: width || 240, maxWidth: '100%', ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--brand-line, rgba(34,197,94,.28)), 0 0 0 3px var(--brand-soft, rgba(34,197,94,.13))'; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))'; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4, #828e9f)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          color: 'var(--fg, #eef2f6)', font: `450 ${size === 'sm' ? 12.5 : 13.5}px/1 'Inter', system-ui, sans-serif`,
          appearance: 'none', WebkitAppearance: 'none',
        }}
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { onChange?.(''); ref.current?.focus(); }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: 999, background: 'var(--surface-4, #253040)', color: 'var(--fg-3, #98a4b2)', flexShrink: 0 }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
      <style>{'input[type=search]::-webkit-search-cancel-button{display:none}'}</style>
    </div>
  );
}
