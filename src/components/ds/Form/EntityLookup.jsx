import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Check, Pencil, Plus, Search, X } from 'lucide-react';

const FONT = "'Inter', system-ui, sans-serif";
const DEBOUNCE_MS = 250;

/**
 * EntityLookup — pick a record from a set too large to preload, by typing.
 *
 * The async sibling of `InlineComboField`: that one filters an array you
 * already hold, this one calls `search(query)` and shows what comes back. Use
 * it when the option list is unbounded (every contact, every employee) or
 * lives behind a paginated endpoint.
 *
 * Two shapes:
 *   variant='row'    — a labelled detail-page row, click to edit.
 *   variant='button' — a standalone trigger ("Add person") with no row.
 *
 * `onCreate` adds an inline "Create <query>" entry, offered only when the
 * typed text doesn't already match a result exactly. It must resolve to the
 * created option, which is then selected.
 *
 * Save is pessimistic, like `InlineField`: `onSelect` must reject to signal
 * failure. Errors surface in read mode, because the popover has closed by
 * then and reopening it would hide the record behind a dropdown.
 */
export function EntityLookup({
  label,
  field,
  /** Currently selected id, or '' for none. */
  value = '',
  /** Read-mode text for the current selection (usually denormalised). */
  displayValue,
  /** (query) => Promise<Array<{ value, label, sub? }>>. Called with '' on open. */
  search,
  onSelect,
  /** (query) => Promise<{ value, label }>. Omit to hide the create entry. */
  onCreate,
  editable = false,
  allowClear = true,
  variant = 'row',
  /** variant='button' trigger text. */
  triggerLabel = 'Add',
  placeholder = 'Search…',
  /** Read-mode link target for the current selection. */
  href,
  labelWidth = 140,
}) {
  const [status, setStatus] = useState('idle'); // idle | editing | saving | saved | error
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const savedTimerRef = useRef(null);
  // Guards against a slow early query overwriting a later, faster one.
  const seqRef = useRef(0);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const runSearch = useCallback(async (q) => {
    const seq = ++seqRef.current;
    setSearching(true);
    try {
      const rows = await search?.(q);
      if (seq === seqRef.current) setResults(Array.isArray(rows) ? rows : []);
    } catch {
      if (seq === seqRef.current) setResults([]);
    } finally {
      if (seq === seqRef.current) setSearching(false);
    }
  }, [search]);

  const open = status === 'editing';

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    runSearch('');
  }, [open, runSearch]);

  // Click-outside cancels without committing.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setStatus('idle');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEdit = () => {
    if (!editable || status === 'saving') return;
    setQuery('');
    setResults([]);
    setErrMsg('');
    setStatus('editing');
  };

  const commit = async (nextValue) => {
    if (variant === 'row' && String(nextValue ?? '') === String(value ?? '')) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    try {
      await onSelect?.(field, nextValue);
      setStatus('saved');
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      setErrMsg(err?.message || 'Failed to save');
      setStatus('error');
    }
  };

  const onQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  };

  const doCreate = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(name);
      if (created?.value) await commit(created.value);
    } catch (err) {
      setErrMsg(err?.message || 'Failed to create');
      setStatus('error');
    } finally {
      setCreating(false);
    }
  };

  const trimmed = query.trim();
  const exactMatch = results.some((r) => String(r.label).toLowerCase() === trimmed.toLowerCase());
  const showCreate = !!onCreate && trimmed.length > 0 && !exactMatch;

  const list = (
    <div style={{
      position: 'absolute', zIndex: 60, left: 0, right: 0, marginTop: 4,
      minWidth: 240, maxHeight: 260, overflowY: 'auto',
      background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-2, 10px)',
      boxShadow: `0 0 0 1px var(--line-2, rgba(255,255,255,.11)), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6))`,
    }}>
      {variant === 'row' && allowClear && (
        <button type="button" onClick={() => commit('')}
          style={{
            width: '100%', textAlign: 'left', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', font: `450 13px/1.4 ${FONT}`, fontStyle: 'italic',
            color: !value ? 'var(--brand, #22c55e)' : 'var(--fg-3, #98a4b2)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <X size={12} style={{ opacity: 0.6 }} /> — None —
        </button>
      )}

      {searching && (
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 7, font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-4, #828e9f)' }}>
          <Loader2 size={12} className="animate-spin" /> Searching…
        </div>
      )}

      {!searching && results.length === 0 && !showCreate && (
        <div style={{ padding: '8px 12px', font: `450 12px/1.4 ${FONT}`, fontStyle: 'italic', color: 'var(--fg-4, #828e9f)' }}>
          No matches.
        </div>
      )}

      {results.map((o) => {
        const on = String(o.value) === String(value);
        return (
          <button key={o.value} type="button" onClick={() => commit(o.value)}
            style={{
              width: '100%', textAlign: 'left', padding: '7px 12px',
              background: on ? 'var(--surface-3, #1c242f)' : 'transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = on ? 'var(--surface-3, #1c242f)' : 'transparent'; }}
          >
            <span style={{ display: 'block', font: `450 13px/1.4 ${FONT}`, color: on ? 'var(--brand, #22c55e)' : 'var(--fg, #eef2f6)' }}>
              {o.label}
            </span>
            {o.sub && (
              <span style={{ display: 'block', font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4, #828e9f)', marginTop: 1 }}>
                {o.sub}
              </span>
            )}
          </button>
        );
      })}

      {showCreate && (
        <button type="button" onClick={doCreate} disabled={creating}
          style={{
            width: '100%', textAlign: 'left', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 7,
            background: 'transparent', font: `500 12.5px/1.4 ${FONT}`, color: 'var(--brand, #22c55e)',
            borderTop: results.length ? '1px solid var(--line, rgba(255,255,255,.07))' : 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create “{trimmed}”
        </button>
      )}
    </div>
  );

  const searchBox = (
    <div style={{ position: 'relative' }}>
      <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4, #828e9f)', pointerEvents: 'none' }} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={onQueryChange}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setStatus('idle');
          // Enter picks only when the search has narrowed to one row —
          // otherwise it would commit an arbitrary result.
          if (e.key === 'Enter' && !searching && results.length === 1) commit(results[0].value);
        }}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '6px 10px 6px 28px', border: 'none', outline: 'none',
          borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
          color: 'var(--fg, #eef2f6)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
          font: `450 13px/1.4 ${FONT}`,
        }}
      />
    </div>
  );

  /* ── Button variant ── */
  if (variant === 'button') {
    return (
      <span ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => (open ? setStatus('idle') : startEdit())}
          disabled={!editable || status === 'saving'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
            borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
            boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
            font: `500 12px/1.5 ${FONT}`, color: 'var(--fg-2, #c3ccd6)',
            opacity: editable ? 1 : 0.5,
          }}
        >
          {status === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {triggerLabel}
        </button>
        {open && <span style={{ position: 'absolute', top: '100%', right: 0, width: 260, display: 'block' }}>{searchBox}{list}</span>}
        {status === 'error' && errMsg && (
          <span style={{ display: 'block', font: `450 11px/1.4 ${FONT}`, color: 'var(--danger, #ef4444)', marginTop: 3 }}>{errMsg}</span>
        )}
      </span>
    );
  }

  /* ── Row variant, read mode (also where errors surface) ── */
  const row = { display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr`, gap: 8, padding: '8px 0' };
  const labelStyle = { font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-4, #828e9f)' };

  if (!open) {
    return (
      <div
        ref={containerRef}
        style={{ ...row, cursor: editable ? 'pointer' : 'default' }}
        onClick={editable ? startEdit : undefined}
        className={editable ? 'ds-lookup-row' : undefined}
      >
        <span style={labelStyle}>{label}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20, font: `450 13px/1.5 ${FONT}`, color: 'var(--fg, #eef2f6)' }}>
            {displayValue || <span style={{ color: 'var(--fg-faint, #4a5563)' }}>— None —</span>}
            {editable && status === 'idle' && (
              <Pencil size={12} className="ds-lookup-pencil" style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0, opacity: 0, transition: 'opacity 120ms ease' }} />
            )}
            {status === 'saving' && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0 }} />}
            {status === 'saved' && <Check size={13} style={{ color: 'var(--brand, #22c55e)', flexShrink: 0 }} />}
          </span>
          {href && value && (
            <a
              href={href}
              onClick={(e) => e.stopPropagation()}
              style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--brand, #22c55e)', marginTop: 1 }}
            >
              Open →
            </a>
          )}
          {status === 'error' && errMsg && (
            <span style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--danger, #ef4444)', marginTop: 2 }}>{errMsg}</span>
          )}
        </div>
        <style>{'.ds-lookup-row:hover .ds-lookup-pencil{opacity:1}'}</style>
      </div>
    );
  }

  /* ── Row variant, editing ── */
  return (
    <div ref={containerRef} style={{ ...row, padding: '6px 0' }}>
      <span style={{ ...labelStyle, paddingTop: 6 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        {searchBox}
        {list}
      </div>
    </div>
  );
}
