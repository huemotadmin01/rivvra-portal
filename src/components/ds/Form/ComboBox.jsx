import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

/**
 * ComboBox — always-visible searchable single-select for forms.
 *
 * The missing third of the picker family: `InlineComboField` is the inline
 * click-to-edit row that commits on select, `EntityLookup` is the async
 * type-to-search variant for sets too large to preload, and this is the plain
 * form control — the value lives in the caller's state until they submit, and
 * nothing is saved on select.
 *
 * Reach for it over `Select` when the list is long enough that a native
 * select's first-letter type-ahead stops being enough (people, accounts,
 * anything with a disambiguating second line).
 */
export function ComboBox({
  value = '',
  onChange,
  onSearch,
  options = [],
  placeholder = 'Search…',
  emptyLabel = 'Select…',
  disabled = false,
  invalid = false,
  id,
  style,
  // A `<label for>` does not name a `<button>` in practice, so a ComboBox in a
  // `Field` still needs its own accessible name. Anything else lands on the
  // trigger too.
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const popRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    if (inputRef.current) inputRef.current.focus();
    // A ComboBox low in a scrollable container (a Modal body, a Drawer) opens
    // its popover into the clipped region below the fold, where it reads as a
    // truncated list. Pull it into view once it has laid out.
    const id = requestAnimationFrame(() => {
      popRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Server-search mode. The local filter below still runs over whatever the
  // caller hands back, so a partial overlap between query and result set is
  // fine — and an option universe larger than one page stops being silently
  // truncated to the pre-load limit.
  useEffect(() => {
    if (!onSearch || !open) return undefined;
    const id = setTimeout(() => onSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search, open, onSearch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    // `keywords` is matched but never drawn. Records are often disambiguated by
    // an identifier nobody wants on screen — an employee code, a legacy ref, a
    // GSTIN — and without this the caller has to choose between showing it and
    // being able to search it.
    return options.filter(
      (o) => String(o.label).toLowerCase().includes(q)
        || String(o.sub ?? '').toLowerCase().includes(q)
        || String(o.keywords ?? '').toLowerCase().includes(q)
    );
  }, [options, search]);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  function commit(next) {
    onChange?.(next);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => { if (!disabled) { setSearch(''); setOpen((o) => !o); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          height: 38, padding: '0 11px 0 12px', textAlign: 'left',
          border: 'none', outline: 'none', borderRadius: 'var(--r-2, 12px)',
          background: 'var(--surface-2, #141b24)',
          color: selected ? 'var(--fg, #eef2f6)' : 'var(--fg-4, #828e9f)',
          font: "450 13.5px/1 'Inter', system-ui, sans-serif",
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
          boxShadow: invalid
            ? '0 0 0 1px var(--danger, #ef4444), 0 0 0 4px var(--danger-soft, rgba(239,68,68,.14))'
            : '0 0 0 1px var(--line, rgba(255,255,255,.07))',
          transition: 'box-shadow 180ms cubic-bezier(.2,.9,.28,1)',
        }}
        {...rest}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : emptyLabel}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          ref={popRef}
          style={{
            position: 'absolute', zIndex: 60, left: 0, right: 0, marginTop: 4,
            background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-2, 10px)',
            boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.11)), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6))',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', padding: 6 }}>
            <Search size={14} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4, #828e9f)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
                // Enter commits only once the search has narrowed to a single
                // option — otherwise it would pick an arbitrary row. Always
                // swallowed, so it never submits the surrounding form.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered.length === 1) commit(filtered[0].value);
                }
              }}
              placeholder={placeholder}
              style={{
                width: '100%', padding: '6px 10px 6px 28px', border: 'none', outline: 'none',
                borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
                color: 'var(--fg, #eef2f6)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
                font: "450 13px/1.4 'Inter', system-ui, sans-serif",
              }}
            />
          </div>
          <div id={listId} role="listbox" style={{ maxHeight: 232, overflowY: 'auto', paddingBottom: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 12px', font: "450 12px/1.4 'Inter', system-ui, sans-serif", fontStyle: 'italic', color: 'var(--fg-4, #828e9f)' }}>
                No matches.
              </div>
            ) : filtered.map((o) => {
              const on = String(o.value) === String(value);
              return (
                <button
                  key={o.value === '' ? `none-${o.label}` : o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => commit(o.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '7px 12px', border: 'none',
                    font: "450 13px/1.4 'Inter', system-ui, sans-serif",
                    color: on ? 'var(--brand, #22c55e)' : 'var(--fg, #eef2f6)',
                    background: on ? 'var(--surface-3, #1c242f)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = on ? 'var(--surface-3, #1c242f)' : 'transparent'; }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                    {o.sub && (
                      <span style={{ display: 'block', font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', marginTop: 1 }}>
                        {o.sub}
                      </span>
                    )}
                  </span>
                  {on && <Check size={13} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
