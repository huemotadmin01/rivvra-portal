/**
 * Checkbox — the small square with a tick.
 *
 * Extracted verbatim from `DataTable`, where it had lived as a private
 * `Check` since row selection was built. It was always a general primitive;
 * being private just meant every other surface that needed a checkbox had to
 * hand-roll one. `DataTable` imports it back under its old name, so its
 * behaviour is unchanged.
 *
 * A `<span role="checkbox">` rather than an `<input>`: the tick is drawn, so
 * the native control would only ever be hidden underneath. Space and Enter
 * both toggle, and clicks are stopped from propagating so a checkbox inside a
 * clickable table row does not also trigger the row.
 */
export function Checkbox({ checked, indeterminate, onChange, label, disabled = false }) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!disabled) onChange(!checked); } }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        background: checked || indeterminate ? 'var(--brand, #22c55e)' : 'transparent',
        boxShadow: `inset 0 0 0 ${checked || indeterminate ? 0 : 1.5}px var(--line-strong, rgba(255,255,255,.18))`,
        transition: 'background 120ms var(--e-out, ease), box-shadow 120ms var(--e-out, ease)',
      }}
    >
      {indeterminate ? (
        <span style={{ width: 7, height: 2, borderRadius: 1, background: 'var(--brand-fg, #041209)' }} />
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--brand-fg, #041209)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : null}
    </span>
  );
}
