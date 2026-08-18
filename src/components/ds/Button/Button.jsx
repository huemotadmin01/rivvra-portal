export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  iconRight = null,
  iconLeft = null,
  // Render as something other than <button>. The only real use is `as="a"` for
  // a navigation that must stay a link — middle-click, open-in-new-tab and
  // "copy link address" are behaviours a button cannot give back. `type` and
  // `disabled` are button-only attributes and are dropped for other elements.
  as: As = 'button',
  children,
  // Pulled out of `rest` so a caller-supplied style merges with the computed
  // one. Spreading `rest` over `style=` replaced it wholesale, dropping the
  // button's own display, padding and height — a caller tinting the text
  // colour got an unstyled inline element.
  style,
  ...rest
}) {
  const base = {
    display: block ? 'flex' : 'inline-flex',
    width: block ? '100%' : undefined,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: 'none',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.005em',
    fontWeight: 600,
    fontFamily: "'Inter', system-ui, sans-serif",
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? 'none' : undefined,
    transition: 'background-color 120ms cubic-bezier(.2,.9,.28,1), box-shadow 180ms cubic-bezier(.2,.9,.28,1), transform 120ms cubic-bezier(.2,.9,.28,1)',
  };

  const sizes = {
    sm: { height: 30, padding: '0 12px', fontSize: 12.5, borderRadius: 7 },
    md: { height: 38, padding: '0 16px', fontSize: 13.5, borderRadius: 10 },
    lg: { height: 44, padding: '0 20px', fontSize: 14.5, borderRadius: 14 },
  };

  const variants = {
    primary: {
      background: 'var(--brand, #22c55e)',
      color: 'var(--brand-fg, #041209)',
      boxShadow: '0 1px 0 rgba(255,255,255,.14) inset, 0 6px 18px -8px var(--brand-glow, rgba(34,197,94,.2))',
    },
    secondary: {
      background: 'var(--surface-2, #141b24)',
      color: 'var(--fg, #eef2f6)',
      boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--fg-2, #a2aebc)',
    },
    // Destructive confirm. Same weight as `primary` — a delete is still the
    // dialog's main action — but the fill carries the warning, so it never
    // reads as the safe choice.
    danger: {
      background: 'var(--danger, #ef4444)',
      color: 'var(--danger-fg, #fff)',
      boxShadow: '0 1px 0 rgba(255,255,255,.14) inset, 0 6px 18px -8px var(--danger-glow, rgba(239,68,68,.2))',
    },
  };

  const isButton = As === 'button';
  return (
    <As
      {...(isButton ? { type: 'button', disabled } : {})}
      {...(!isButton && disabled ? { 'aria-disabled': true } : {})}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </As>
  );
}
