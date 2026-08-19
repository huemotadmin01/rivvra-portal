import { forwardRef } from 'react';

/** Multi-line sibling of `Input`, sharing its surface, ring and radius so the
 *  two line up inside a `Field` stack. Resizes vertically only — horizontal
 *  resize breaks out of grid columns and is never what the user meant. */
export const Textarea = forwardRef(function Textarea({ invalid = false, style, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      style={{
        padding: '9px 12px', width: '100%', minHeight: 76, resize: 'vertical',
        border: 'none', outline: 'none', borderRadius: 'var(--r-2, 12px)',
        background: 'var(--surface-2, #141b24)', color: 'var(--fg, #eef2f6)',
        font: "450 13.5px/1.55 'Inter', system-ui, sans-serif",
        boxShadow: invalid
          ? '0 0 0 1px var(--danger, #ef4444), 0 0 0 4px var(--danger-soft, rgba(239,68,68,.14))'
          : '0 0 0 1px var(--line, rgba(255,255,255,.07))',
        transition: 'box-shadow 180ms cubic-bezier(.2,.9,.28,1)',
        ...style,
      }}
      {...rest}
    />
  );
});
