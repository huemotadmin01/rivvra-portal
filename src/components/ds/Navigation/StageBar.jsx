const FONT = "'Inter', system-ui, sans-serif";

/**
 * StageBar — the linear pipeline a record moves through, as a row of
 * clickable chips: done behind, current highlighted, the rest pending.
 *
 * Purely presentational. It does not know what a stage means, whether a move
 * is legal, or what to confirm first — the caller owns all of that and just
 * receives `onSelect(stageId)`.
 *
 * `tone="lost"` recolours the whole row for a terminal-negative record, and
 * `allPast` marks every visible chip as behind (a record that has graduated
 * past the end of the visible row, e.g. into a won stage that the caller
 * filtered out).
 */
export function StageBar({
  stages = [],
  value,
  onSelect,
  allPast = false,
  tone = 'default',
  /** False renders the row as a static indicator. */
  interactive = true,
  /** Per-stage secondary text for the tooltip, keyed by stage id. */
  hints = {},
}) {
  const currentIdx = stages.findIndex((s) => s.id === value);
  const lost = tone === 'lost';

  return (
    <div role="list" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {stages.map((s, i) => {
        const active = s.id === value;
        const past = allPast || (currentIdx >= 0 && i < currentIdx);

        let bg = 'var(--surface-2, #141b24)';
        let fg = 'var(--fg-4, #828e9f)';
        let ring = 'var(--line, rgba(255,255,255,.07))';
        if (lost && active) {
          bg = 'var(--danger-soft, rgba(239,68,68,.14))'; fg = 'var(--danger, #ef4444)';
          ring = 'color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)';
        } else if (active) {
          bg = 'var(--brand-soft, rgba(34,197,94,.14))'; fg = 'var(--brand, #22c55e)';
          ring = 'color-mix(in srgb, var(--brand, #22c55e) 30%, transparent)';
        } else if (past && !lost) {
          bg = 'color-mix(in srgb, var(--brand, #22c55e) 8%, transparent)';
          fg = 'color-mix(in srgb, var(--brand, #22c55e) 78%, var(--fg-3, #98a4b2))';
        }

        const Tag = interactive ? 'button' : 'span';
        return (
          <Tag
            key={s.id}
            role="listitem"
            {...(interactive ? { type: 'button', onClick: () => onSelect?.(s.id), 'aria-current': active ? 'step' : undefined } : {})}
            title={hints[s.id] ? `${s.label} · ${hints[s.id]}` : s.label}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '5px 12px',
              borderRadius: 'var(--r-full, 999px)', whiteSpace: 'nowrap',
              font: `500 12px/1 ${FONT}`, background: bg, color: fg,
              boxShadow: `inset 0 0 0 1px ${ring}`,
              cursor: interactive ? 'pointer' : 'default',
              transition: 'background 120ms var(--e-out, ease), color 120ms var(--e-out, ease)',
            }}
          >
            {s.label}
          </Tag>
        );
      })}
    </div>
  );
}
