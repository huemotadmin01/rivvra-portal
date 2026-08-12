import { useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { usePopover } from '../Filter/usePopover';

/**
 * TagPicker — the assigned-tags row on a detail page: current tags as
 * removable chips, plus a dashed "Add tag" trigger opening a searchable list
 * of the ones not yet applied.
 *
 * Controlled and vocabulary-agnostic: the caller owns both `value` (the
 * selected ids) and `options` (everything assignable), and receives the full
 * next id array. Nothing here knows what a tag *is*, so the same component
 * serves contacts, candidates and jobs.
 *
 * `onChange` is fire-and-forget — unlike InlineField this does not await the
 * save, because a tag chip appearing instantly is worth more than strict
 * commit ordering. Callers that need failure handling should revert `value`
 * themselves and show a toast.
 */
export function TagPicker({
  value = [],
  options = [],
  onChange,
  editable = false,
  /** Read-mode text when nothing is assigned. */
  emptyLabel = 'No tags assigned',
  placeholder = 'Search tags…',
}) {
  const [query, setQuery] = useState('');
  const { open, setOpen, ref } = usePopover();

  // Options carry the display names; ids not present in `options` (a tag
  // deleted from the vocabulary but still on the record) fall back to the id
  // so the chip never renders blank.
  const labelById = useMemo(() => {
    const m = new Map();
    options.forEach((o) => m.set(String(o.value), o.label));
    return m;
  }, [options]);

  const remaining = useMemo(
    () => options.filter((o) => !value.some((v) => String(v) === String(o.value))),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [remaining, query]);

  const add = (opt) => {
    onChange?.([...value, opt.value]);
    setOpen(false);
    setQuery('');
  };

  const remove = (id) => onChange?.(value.filter((v) => String(v) !== String(id)));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      {value.length === 0 && !editable && (
        <span style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-faint, #4a5563)' }}>
          {emptyLabel}
        </span>
      )}

      {value.map((id) => (
        <span
          key={id}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 999,
            background: 'var(--surface-3, #1c242f)', color: 'var(--fg-2, #c3ccd6)',
            font: "500 11.5px/1.6 'Inter', system-ui, sans-serif",
          }}
        >
          {labelById.get(String(id)) || id}
          {editable && (
            <button
              type="button"
              onClick={() => remove(id)}
              aria-label={`Remove ${labelById.get(String(id)) || 'tag'}`}
              title="Remove tag"
              style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-4, #828e9f)', flexShrink: 0 }}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}

      {editable && (
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 9px', borderRadius: 999,
              border: '1px dashed var(--line-2, rgba(255,255,255,.11))',
              color: 'var(--fg-4, #828e9f)', background: 'transparent',
              font: "500 11.5px/1.6 'Inter', system-ui, sans-serif",
            }}
          >
            <Plus size={11} /> Add tag
          </button>

          {open && (
            <div
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60,
                width: 224, maxWidth: 'calc(100vw - 24px)', overflow: 'hidden',
                background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-2, 10px)',
                boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.11)), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6))',
              }}
            >
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                style={{
                  width: '100%', padding: '8px 12px', border: 'none', outline: 'none',
                  background: 'transparent', color: 'var(--fg, #eef2f6)',
                  borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
                  font: "450 13px/1.4 'Inter', system-ui, sans-serif",
                }}
              />
              <div style={{ maxHeight: 192, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '8px 12px', font: "450 12px/1.4 'Inter', system-ui, sans-serif", fontStyle: 'italic', color: 'var(--fg-4, #828e9f)' }}>
                    {remaining.length === 0 ? 'All tags added' : 'No matches'}
                  </div>
                ) : filtered.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => add(o)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '7px 12px', background: 'transparent',
                      font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
