/** One applied filter: `field: value`, removable. `add` renders the dashed
 *  "add filter" affordance instead. */
export function FilterChip({
  label,
  value,
  onRemove,
  onClick,
  add = false,
  active = false,
  style,
  children,
  ...rest
}) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 26,
    padding: onRemove ? '0 4px 0 10px' : '0 10px', borderRadius: 'var(--r-full, 999px)',
    font: "500 12.5px/1 'Inter', system-ui, sans-serif", whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'background 120ms var(--e-out, ease), box-shadow 120ms var(--e-out, ease)',
  };

  if (add) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          ...base, color: 'var(--fg-3, #98a4b2)', background: 'transparent',
          boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
          borderRadius: 'var(--r-full, 999px)', ...style,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; e.currentTarget.style.color = 'var(--fg, #eef2f6)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3, #98a4b2)'; }}
        {...rest}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        {children || label || 'Add filter'}
      </button>
    );
  }

  return (
    <span
      style={{
        ...base,
        background: active ? 'var(--brand-soft, rgba(34,197,94,.13))' : 'var(--surface-3, #1c242f)',
        // --brand-ink, not --brand: the accent on its own 10% tint measures
        // 4.37 against a 4.5 floor on paper. Same pairing, and the same fix,
        // as ds/Chip. In dark --brand-ink aliases --brand, so nothing moves.
        color: active ? 'var(--brand-ink, #22c55e)' : 'var(--fg-2, #bac4d0)',
        boxShadow: active ? 'inset 0 0 0 1px var(--brand-line, rgba(34,197,94,.28))' : 'none',
        ...style,
      }}
      {...rest}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        // `alignSelf: stretch` makes this fill the chip's 26px height instead
        // of hugging its 13px of text — it is the chip's PRIMARY action (it
        // opens the filter) and was the smallest target on most list pages.
        // Stretching costs nothing visually: `alignItems` moves baseline ->
        // center, and label and value are the same font-size, so the text
        // lands in exactly the same place.
        style={{ display: 'inline-flex', alignSelf: 'stretch', alignItems: 'center', gap: 5, font: 'inherit', color: 'inherit', cursor: onClick ? 'pointer' : 'default', padding: 0 }}
      >
        {label && <span style={{ color: active ? 'inherit' : 'var(--fg-4, #828e9f)', fontWeight: 500 }}>{label}</span>}
        <span style={{ fontWeight: 600 }}>{value ?? children}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label || ''} filter`}
          onClick={onRemove}
          // The visible circle stays 18px — widening it would fatten every
          // chip on every list page. `hit-24` adds a transparent 24x24 overlay
          // so the tap target meets the WCAG 2.2 AA floor while the chip keeps
          // its size. `position: relative` is the class's contract.
          className="hit-24"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: 18, height: 18, borderRadius: 999, color: 'inherit', opacity: 0.6, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = 'var(--surface-4, #253040)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </span>
  );
}
