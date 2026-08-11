/** Two-segment Active / Archived switch with optional counts. Controlled:
 *  `archived` + `onChange(nextBool)`. Platform-wide convention — every list
 *  that supports archiving shows this in the same place. */
export function ArchivedToggle({ archived = false, onChange, activeCount, archivedCount }) {
  const seg = (on) => ({
    height: 26, padding: '0 10px', borderRadius: 'var(--r-full, 999px)',
    font: "500 12.5px/1 'Inter', system-ui, sans-serif", whiteSpace: 'nowrap',
    background: on ? 'var(--surface-4, #253040)' : 'transparent',
    color: on ? 'var(--fg, #eef2f6)' : 'var(--fg-4, #828e9f)',
    transition: 'background 120ms var(--e-out, ease), color 120ms var(--e-out, ease)',
  });
  return (
    <span
      role="group"
      aria-label="Archive filter"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, flexShrink: 0,
        borderRadius: 'var(--r-full, 999px)', background: 'var(--surface-2, #141b24)',
        boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
      }}
    >
      <button type="button" aria-pressed={!archived} style={seg(!archived)} onClick={() => onChange?.(false)}>
        Active{activeCount != null ? ` ${activeCount}` : ''}
      </button>
      <button type="button" aria-pressed={archived} style={seg(archived)} onClick={() => onChange?.(true)}>
        Archived{archivedCount != null ? ` ${archivedCount}` : ''}
      </button>
    </span>
  );
}
