import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Pencil } from 'lucide-react';

/**
 * EditableHeading — click-to-edit record title for detail pages.
 *
 * The same pessimistic save as `InlineField`: the input stays open with the
 * user's text while saving, and on failure it stays open with an error rather
 * than reverting. A record's name is usually the only way to find it again,
 * so silently discarding a typed name is the worst available failure.
 *
 * Enter commits, Escape reverts, blur commits. An unchanged (or whitespace-
 * only) value never calls `onSave` — the heading just closes.
 */
export function EditableHeading({
  value,
  editable = false,
  onSave,
  placeholder = '',
  /** Open in edit mode on mount when there is no value yet (create flows). */
  autoEdit = false,
  /** Runs on the committed string before it reaches `onSave`. */
  transform,
  size = 22,
}) {
  const [editing, setEditing] = useState(autoEdit && !value);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef(null);
  // Blur fires as the component unmounts the input after Enter/Escape; this
  // stops a second commit racing the first.
  const skipBlurRef = useRef(false);

  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = useCallback(async () => {
    if (skipBlurRef.current) { skipBlurRef.current = false; return; }
    const trimmed = draft.trim();
    if (!trimmed || trimmed === (value || '')) {
      setDraft(value || '');
      setEditing(false);
      setErrMsg('');
      return;
    }
    setSaving(true);
    setErrMsg('');
    try {
      await onSave(transform ? transform(trimmed) : trimmed);
      setEditing(false);
    } catch (err) {
      setErrMsg(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave, transform]);

  const cancel = () => {
    skipBlurRef.current = true;
    setDraft(value || '');
    setErrMsg('');
    setEditing(false);
  };

  const headingFont = `650 ${size}px/1.2 'Inter', system-ui, sans-serif`;

  if (!editable || !editing) {
    return (
      <span
        className={editable ? 'ds-edit-heading' : undefined}
        onClick={editable ? () => setEditing(true) : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0,
          cursor: editable ? 'pointer' : 'default',
          borderRadius: 'var(--r-1, 7px)', padding: '2px 4px', margin: '-2px -4px',
        }}
      >
        <h1 style={{ font: headingFont, letterSpacing: '-0.015em', color: 'var(--fg, #eef2f6)', minWidth: 0 }}>
          {value || <span style={{ color: 'var(--fg-4, #828e9f)', fontStyle: 'italic', fontWeight: 450 }}>{placeholder || 'Untitled'}</span>}
        </h1>
        {editable && (
          <Pencil size={13} className="ds-edit-heading-pencil"
            style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0, opacity: 0, transition: 'opacity 120ms ease' }} />
        )}
        <style>{'.ds-edit-heading:hover{background:var(--surface-2,#141b24)}.ds-edit-heading:hover .ds-edit-heading-pencil{opacity:1}'}</style>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 0, maxWidth: '100%' }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { skipBlurRef.current = true; commit(); }
            if (e.key === 'Escape') cancel();
          }}
          placeholder={placeholder}
          style={{
            font: headingFont, letterSpacing: '-0.015em', color: 'var(--fg, #eef2f6)',
            background: 'var(--surface-2, #141b24)', border: 'none', outline: 'none',
            borderRadius: 'var(--r-1, 7px)', padding: '2px 26px 2px 6px', width: 'min(420px, 100%)',
            boxShadow: `inset 0 0 0 1px ${errMsg ? 'var(--danger, #ef4444)' : 'var(--brand, #22c55e)'}`,
          }}
        />
        {saving && (
          <Loader2 size={14} className="animate-spin"
            style={{ position: 'absolute', right: 8, color: 'var(--fg-4, #828e9f)' }} />
        )}
      </span>
      {errMsg && (
        <span style={{ font: "450 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger, #ef4444)' }}>
          {errMsg} — press Enter to retry, Escape to discard.
        </span>
      )}
    </span>
  );
}
