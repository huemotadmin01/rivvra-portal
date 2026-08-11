import { useState, useRef, useEffect } from 'react';

/** Saved-view switcher: named filter sets, an unsaved-changes marker, and
 *  save / rename / delete. Views live on the server; this is the control. */
export function SavedViews({
  views = [],
  activeId = null,
  dirty = false,
  onSelect,
  onSave,
  onDelete,
  style,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = views.find((v) => v.id === activeId);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, ...style }} {...rest}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 9px',
          borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
          boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
          font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2, #bac4d0)', maxWidth: 220,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4, #828e9f)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? active.name : 'All records'}</span>
        {dirty && <span title="Unsaved changes" style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--warn, #fbbf24)', flexShrink: 0 }} />}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4, #828e9f)" strokeWidth="2.6" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, minWidth: 232,
            padding: 5, borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-2, #141b24)',
            boxShadow: 'var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6)), inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
          }}
        >
          <MenuItem
            label="All records"
            checked={!activeId}
            onClick={() => { onSelect?.(null); setOpen(false); }}
          />
          {views.length > 0 && <div style={{ height: 1, background: 'var(--line, rgba(255,255,255,.07))', margin: '4px 0' }} />}
          {views.map((v) => (
            <MenuItem
              key={v.id}
              label={v.name}
              meta={v.count != null ? String(v.count) : undefined}
              shared={v.shared}
              checked={v.id === activeId}
              onClick={() => { onSelect?.(v.id); setOpen(false); }}
              onDelete={onDelete ? () => onDelete(v.id) : undefined}
            />
          ))}
          {onSave && (
            <>
              <div style={{ height: 1, background: 'var(--line, rgba(255,255,255,.07))', margin: '4px 0' }} />
              <MenuItem
                label={dirty && active ? `Update “${active.name}”` : 'Save current filters…'}
                accent
                onClick={() => { onSave(); setOpen(false); }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, meta, checked, accent, shared, onClick, onDelete }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', borderRadius: 'var(--r-1, 7px)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3, #1c242f)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '7px 9px',
          font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", textAlign: 'left',
          color: accent ? 'var(--brand, #22c55e)' : 'var(--fg-2, #bac4d0)',
        }}
      >
        <span style={{ width: 12, flexShrink: 0, display: 'inline-flex' }}>
          {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--brand, #22c55e)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {shared && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4, #828e9f)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-label="Shared with team">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          </svg>
        )}
        {meta && <span style={{ color: 'var(--fg-4, #828e9f)', font: "450 11.5px/1 'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{meta}</span>}
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${label}`}
          onClick={onDelete}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, marginRight: 3, borderRadius: 'var(--r-1, 7px)', color: 'var(--fg-faint, #4a5563)', flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger, #f87171)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-faint, #4a5563)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
        </button>
      )}
    </div>
  );
}
