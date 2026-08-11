/** Compact token-styled native `<select>` for toolbars and filter strips.
 *  Native on purpose: it inherits OS keyboard behaviour and mobile pickers,
 *  which a custom popover would have to re-implement. Pair with `Field`
 *  when it needs a label. */
export function InlineSelect({ value, onChange, children, style, ...rest }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        appearance: 'none', padding: '5px 24px 5px 10px', borderRadius: 'var(--r-1, 7px)',
        background: 'var(--surface-2, #141b24)', color: 'var(--fg-2, #bac4d0)', border: 'none',
        boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))', cursor: 'pointer',
        font: "500 12.5px/1.2 'Inter', system-ui, sans-serif",
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23828e9f' stroke-width='3' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
}
