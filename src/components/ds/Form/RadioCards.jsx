import { useEffect, useRef } from 'react';

/**
 * RadioCards — single-select where the options need explaining.
 *
 * `Select` and `ComboBox` are for picking a known value out of a list.
 * This is for the smaller, rarer case where the *choice itself* changes what
 * the form means and the user has to be told the difference before they pick:
 * an incentive-rate scope, a tax regime, a billing model. Each option carries a
 * one-line `hint`, and all of them stay on screen — that is the whole point,
 * and it is why this is not a dropdown.
 *
 * Real radio semantics, unlike the hand-rolled button rows it replaces: one tab
 * stop for the group, arrow keys move between options, and each option is
 * announced with its hint.
 */
export function RadioCards({
  value,
  onChange,
  options = [],
  disabled = false,
  columns,
  style,
  ...rest
}) {
  const ref = useRef(null);
  const pendingFocus = useRef(null);

  // Roving tabindex means the newly selected card is the only tab stop, so
  // focus has to follow the arrow key or the group is left focused on a card
  // that is now tabIndex={-1} — Tab out and back would skip past the group,
  // and a screen reader would keep announcing the old option.
  //
  // This has to run in an effect, not straight after onChange: the selection
  // lives in the CALLER's state, so the card we want to focus does not exist
  // in its selected form until React has committed the parent's re-render.
  useEffect(() => {
    const want = pendingFocus.current;
    if (want == null) return;
    pendingFocus.current = null;
    ref.current?.querySelector(`[data-rc-value="${CSS.escape(String(want))}"]`)?.focus();
  });

  function onKeyDown(e) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.value === value);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const enabled = options.filter((o) => !o.disabled);
    if (!enabled.length) return;
    // Wrap around the enabled options only, so a disabled card can never
    // swallow the keyboard focus.
    const cur = enabled.findIndex((o) => o.value === options[idx]?.value);
    const next = enabled[(((cur === -1 ? 0 : cur) + step) + enabled.length) % enabled.length];
    pendingFocus.current = next.value;
    onChange?.(next.value);
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      onKeyDown={onKeyDown}
      style={{
        display: 'grid',
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 8,
        ...style,
      }}
      {...rest}
    >
      {options.map((o) => {
        const on = o.value === value;
        const off = disabled || o.disabled;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-rc-value={String(o.value)}
            // The hint is inside the button, so it lands in the accessible name
            // — the trade-off this component exists to make is that the
            // explanation is never separated from the option.
            aria-checked={on}
            disabled={off}
            // Roving tabindex: the group is one tab stop and the arrows do the
            // rest, which is what a radiogroup is supposed to feel like.
            tabIndex={on ? 0 : -1}
            onClick={() => { if (!off) onChange?.(o.value); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 12px', border: 'none', outline: 'none',
              borderRadius: 'var(--r-2, 12px)',
              background: on ? 'var(--brand-soft, rgba(34,197,94,.13))' : 'var(--surface-2, #141b24)',
              boxShadow: on
                ? '0 0 0 1px var(--brand, #22c55e)'
                : '0 0 0 1px var(--line, rgba(255,255,255,.07))',
              cursor: off ? 'default' : 'pointer',
              opacity: off ? 0.45 : 1,
              transition: 'background 140ms var(--e-out, ease), box-shadow 140ms var(--e-out, ease)',
            }}
            onMouseEnter={(e) => { if (!off && !on) e.currentTarget.style.background = 'var(--surface-3, #1c242f)'; }}
            onMouseLeave={(e) => { if (!off && !on) e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
          >
            <span style={{
              display: 'flex', alignItems: 'center', gap: 8,
              font: "550 13px/1.4 'Inter', system-ui, sans-serif",
              color: on ? 'var(--brand-ink, #4ade80)' : 'var(--fg, #eef2f6)',
            }}>
              {o.icon}
              {o.label}
            </span>
            {o.hint && (
              <span style={{
                display: 'block', marginTop: 2,
                font: "450 11.5px/1.45 'Inter', system-ui, sans-serif",
                color: 'var(--fg-4, #828e9f)',
              }}>
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
