import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Check, Pencil, ChevronDown, Search, X } from 'lucide-react';

/**
 * InlineComboField — inline click-to-edit picker with search, committing on
 * select. Same status machine and the same pessimistic save as `InlineField`
 * (see that file for why it is not optimistic); the editor is a
 * search-and-pick popover rather than a raw input.
 *
 * Use when the option list is too long for a native select — "pick one of N
 * employees / contacts". This replaces the legacy `employee-picker` type on
 * InlineField.
 *
 * Errors surface in READ mode here, not in the editor: the popover has
 * already closed on select, so re-opening it to show a message would hide
 * the record behind a dropdown. The previous value stays visible with an
 * inline error beneath it, and clicking the row reopens the picker.
 */
export function InlineComboField({
  label,
  field,
  value,
  options = [],
  editable = false,
  required = false,
  allowClear = true,
  displayValue,
  onSave,
  placeholder = 'Search…',
  warn = '',
  labelWidth = 140,
}) {
  const [status, setStatus] = useState('idle'); // idle | editing | saving | saved | error
  const [search, setSearch] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const savedTimerRef = useRef(null);

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  useEffect(() => {
    if (status === 'editing' && inputRef.current) inputRef.current.focus();
  }, [status]);

  // Click-outside cancels — no commit, matching legacy.
  useEffect(() => {
    if (status !== 'editing') return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setStatus('idle');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [status]);

  const startEdit = useCallback(() => {
    if (!editable || status === 'saving') return;
    setSearch('');
    setErrMsg('');
    setStatus('editing');
  }, [editable, status]);

  const cancel = useCallback(() => { setStatus('idle'); setErrMsg(''); }, []);

  const save = useCallback(async (newValue) => {
    if (String(newValue ?? '') === String(value ?? '')) { setStatus('idle'); return; }
    if (required && !newValue) {
      setErrMsg(`${label} is required`);
      setStatus('error');
      return;
    }
    setStatus('saving');
    try {
      await onSave(field, newValue);
      setStatus('saved');
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      setErrMsg(err?.message || 'Failed to save');
      setStatus('error');
    }
  }, [value, required, label, field, onSave]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, search]);

  const resolvedDisplay = useMemo(() => {
    if (displayValue !== undefined && displayValue !== null && displayValue !== '') return displayValue;
    if (value) return options.find((o) => String(o.value) === String(value))?.label ?? null;
    return null;
  }, [displayValue, options, value]);

  const row = { display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr`, gap: 8, padding: '8px 0' };
  const labelStyle = { font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' };

  /* ── Read mode (also where errors surface) ── */
  if (status === 'idle' || status === 'saved' || status === 'error') {
    return (
      <div
        ref={containerRef}
        style={{ ...row, cursor: editable ? 'pointer' : 'default' }}
        onClick={editable ? startEdit : undefined}
        className={editable ? 'ds-combo-field' : undefined}
      >
        <span style={labelStyle}>{label}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20, font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)' }}>
            {resolvedDisplay || <span style={{ color: 'var(--fg-faint, #4a5563)' }}>— None —</span>}
            {editable && status === 'idle' && (
              <Pencil size={12} className="ds-combo-pencil" style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0, opacity: 0, transition: 'opacity 120ms ease' }} />
            )}
            {status === 'saved' && <Check size={13} style={{ color: 'var(--brand, #22c55e)', flexShrink: 0 }} />}
            {status === 'error' && <span title={errMsg} style={{ color: 'var(--danger, #ef4444)', font: "600 12px/1 'Inter', system-ui, sans-serif", flexShrink: 0 }}>!</span>}
          </span>
          {status === 'error' && errMsg && (
            <span style={{ font: "450 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger, #ef4444)', marginTop: 2 }}>{errMsg}</span>
          )}
          {warn && status !== 'error' && (
            <span style={{ font: "450 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn, #f59e0b)', marginTop: 2 }}>{warn}</span>
          )}
        </div>
        <style>{'.ds-combo-field:hover .ds-combo-pencil{opacity:1}'}</style>
      </div>
    );
  }

  /* ── Editing (search popover) ── */
  return (
    <div ref={containerRef} style={{ ...row, padding: '6px 0' }}>
      <span style={{ ...labelStyle, paddingTop: 6 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4, #828e9f)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
              // Enter only commits when the search has narrowed to exactly
              // one option — otherwise it would pick an arbitrary row.
              if (e.key === 'Enter' && filtered.length === 1) save(filtered[0].value);
            }}
            placeholder={placeholder}
            style={{
              width: '100%', padding: '6px 26px 6px 28px', border: 'none', outline: 'none',
              borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
              color: 'var(--fg, #eef2f6)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
              font: "450 13px/1.4 'Inter', system-ui, sans-serif",
            }}
          />
          <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4, #828e9f)', pointerEvents: 'none' }} />
          {status === 'saving' && (
            <Loader2 size={14} className="animate-spin" style={{ position: 'absolute', right: 26, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4, #828e9f)' }} />
          )}
        </div>
        <div style={{
          position: 'absolute', zIndex: 60, left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: 'auto',
          background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-2, 10px)',
          boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.11)), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6))',
        }}>
          {allowClear && !required && (
            <button type="button" onClick={() => save('')}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
                font: "450 13px/1.4 'Inter', system-ui, sans-serif", fontStyle: 'italic',
                color: !value ? 'var(--brand, #22c55e)' : 'var(--fg-3, #98a4b2)',
                background: !value ? 'var(--surface-3, #1c242f)' : 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = !value ? 'var(--surface-3, #1c242f)' : 'transparent'; }}
            >
              <X size={12} style={{ opacity: 0.6 }} /> — None —
            </button>
          )}
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', font: "450 12px/1.4 'Inter', system-ui, sans-serif", fontStyle: 'italic', color: 'var(--fg-4, #828e9f)' }}>
              No matches.
            </div>
          ) : filtered.map((o) => {
            const on = String(o.value) === String(value);
            return (
              <button key={o.value || `none-${o.label}`} type="button" onClick={() => save(o.value)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px',
                  font: "450 13px/1.4 'Inter', system-ui, sans-serif",
                  color: on ? 'var(--brand, #22c55e)' : 'var(--fg, #eef2f6)',
                  background: on ? 'var(--surface-3, #1c242f)' : 'transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = on ? 'var(--surface-3, #1c242f)' : 'transparent'; }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
