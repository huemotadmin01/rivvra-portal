import { forwardRef } from 'react';

/** Form-height native `<select>` — the `Input` of a `Field` stack when the
 *  answer is one of a handful of fixed choices.
 *
 *  `InlineSelect` is the compact toolbar/filter-strip variant of the same
 *  control; this one matches `Input`'s 38px height, radius and ring so a
 *  column of `Field`s lines up. Native on purpose: OS keyboard behaviour,
 *  type-ahead and mobile pickers come for free. When the list is long enough
 *  that the user needs to search it, reach for `ComboBox` instead. */
export const Select = forwardRef(function Select({ invalid = false, children, style, ...rest }, ref) {
  return (
    <select
      ref={ref}
      style={{
        appearance: 'none', height: 38, padding: '0 30px 0 12px', width: '100%',
        border: 'none', outline: 'none', borderRadius: 'var(--r-2, 12px)',
        background: 'var(--surface-2, #141b24)', color: 'var(--fg, #eef2f6)',
        font: "450 13.5px/1 'Inter', system-ui, sans-serif", cursor: 'pointer',
        boxShadow: invalid
          ? '0 0 0 1px var(--danger, #ef4444), 0 0 0 4px var(--danger-soft, rgba(239,68,68,.14))'
          : '0 0 0 1px var(--line, rgba(255,255,255,.07))',
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23828e9f' stroke-width='3' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center',
        transition: 'box-shadow 180ms cubic-bezier(.2,.9,.28,1)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
});
