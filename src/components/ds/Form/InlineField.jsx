import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Check, X, Pencil } from 'lucide-react';

/**
 * InlineField — click-to-edit field. The signature interaction of the
 * product: every record detail page is a stack of these.
 *
 * SAVE SEMANTICS (read this before changing anything):
 *
 * The save is **pessimistic**, matching `components/shared/InlineField.jsx`
 * exactly. Commit → `saving` (spinner, the editor stays open holding your
 * text) → `saved` (check, 1.5s) → `idle`, where read mode renders whatever
 * the parent passed back down as `value`.
 *
 * It is deliberately NOT optimistic-with-revert. On failure the editor stays
 * open with your text intact and offers retry — an optimistic field would
 * paint the new value, snap back, and leave the user with nothing to retry
 * from. For a field that writes one keystroke-commit at a time to real
 * records, "never lose what the user typed" beats "feels instant".
 *
 * The no-op guard matters as much as the save: committing an unchanged value
 * returns to idle without calling `onSave`. Dates are compared as YYYY-MM-DD
 * because the input yields `2026-04-21` while the API returns
 * `2026-04-21T00:00:00.000Z` — a naive compare fires a PUT on every blur.
 *
 * Keyboard: Enter commits (except textarea), Escape cancels, blur commits.
 * Not editable → renders as static text with no affordance.
 *
 * For "pick one of N" over a large list, use `InlineComboField` — it is the
 * searchable equivalent (and replaces the legacy `employee-picker` type).
 */
export function InlineField({
  label,
  field,
  value,
  type = 'text',
  editable = false,
  required = false,
  options = [],
  displayValue,
  maskFn,
  onSave,
  placeholder = '',
  warn = '',
  error = '',
  maxLength,
  transform,
  labelWidth = 140,
}) {
  const [status, setStatus] = useState('idle'); // idle | editing | saving | saved | error
  const [editVal, setEditVal] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef(null);
  const savedTimerRef = useRef(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (status === 'editing' && inputRef.current) {
      inputRef.current.focus();
      if (type !== 'date' && type !== 'select' && inputRef.current.select) inputRef.current.select();
    }
  }, [status, type]);

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  const startEdit = useCallback(() => {
    if (!editable || status === 'saving') return;
    const raw = value ?? '';
    if (type === 'date' && raw) {
      // UTC, so a date never shifts a day for users east/west of the server.
      const str = String(raw);
      const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) {
        setEditVal(`${iso[1]}-${iso[2]}-${iso[3]}`);
      } else {
        const d = new Date(str);
        setEditVal(Number.isNaN(d.getTime()) ? '' :
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
      }
    } else if (type === 'datetime-local' && raw) {
      // Local TZ is intentional here: scheduled times are set on the user's
      // own clock, unlike plain dates.
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) { setEditVal(''); } else {
        const pad = (n) => String(n).padStart(2, '0');
        setEditVal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    } else {
      setEditVal(String(raw));
    }
    setErrMsg('');
    setStatus('editing');
  }, [editable, status, value, type]);

  const cancel = useCallback(() => { setStatus('idle'); setErrMsg(''); }, []);

  const save = useCallback(async (val) => {
    let newVal = typeof val === 'string' ? val.trim() : val;

    // No-op guard. Skipping this fires a write on every blur.
    if (type === 'date') {
      if (newVal === '' || newVal == null) newVal = null; // clear stores null, not ''
      const toYMD = (v) => {
        if (v == null || v === '') return '';
        const s = String(v);
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? '' :
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      };
      if (toYMD(newVal) === toYMD(value)) { setStatus('idle'); return; }
    } else if (String(newVal) === String(value ?? '')) {
      setStatus('idle');
      return;
    }

    if (required && (newVal === '' || newVal == null)) {
      setErrMsg(`${label} is required`);
      setStatus('error');
      return;
    }

    setStatus('saving');
    try {
      await onSave(field, newVal);
      setStatus('saved');
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      // Editor stays open holding the user's text; retry/cancel are offered.
      setErrMsg(err?.message || 'Failed to save');
      setStatus('error');
    }
  }, [value, required, label, field, type, onSave]);

  const handleBlur = useCallback(() => {
    if (skipBlurRef.current) { skipBlurRef.current = false; return; }
    if (status === 'editing') save(editVal);
  }, [status, editVal, save]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && type !== 'textarea') save(editVal);
    if (e.key === 'Escape') cancel();
  }, [editVal, save, cancel, type]);

  const row = {
    display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr`, gap: 8, padding: '8px 0',
  };
  // `error` is externally driven — a preflight or server validation marking
  // this field, not a failed save. It never suppresses the field's own save
  // error, which is more urgent and describes something the user just did.
  const showExternalError = !!error && status !== 'error';
  const labelStyle = {
    font: "450 13px/1.5 'Inter', system-ui, sans-serif",
    color: showExternalError ? 'var(--danger, #ef4444)' : 'var(--fg-4, #828e9f)',
  };
  const ExternalError = () => (showExternalError ? (
    <span style={{ font: "450 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger, #ef4444)', marginTop: 2 }}>
      {error}
    </span>
  ) : null);
  const inputStyle = {
    flex: 1, minWidth: 0, padding: '6px 9px', border: 'none', outline: 'none',
    borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
    color: 'var(--fg, #eef2f6)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
    font: "450 13px/1.4 'Inter', system-ui, sans-serif",
  };

  /* ── Toggle: commits on click, never enters an editor ── */
  if (type === 'toggle') {
    const on = !!value;
    return (
      <div style={{ ...row, alignItems: showExternalError ? 'start' : 'center' }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {editable ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={label}
              disabled={status === 'saving'}
              onClick={async () => {
                setStatus('saving');
                try {
                  await onSave(field, !on);
                  setStatus('saved');
                  savedTimerRef.current = setTimeout(() => setStatus('idle'), 1500);
                } catch (err) {
                  setErrMsg(err?.message || 'Failed to save');
                  setStatus('error');
                }
              }}
              style={{
                position: 'relative', width: 36, height: 20, borderRadius: 999, border: 'none',
                background: on ? 'var(--brand, #22c55e)' : 'var(--surface-4, #253040)',
                opacity: status === 'saving' ? 0.5 : 1,
                cursor: status === 'saving' ? 'default' : 'pointer',
                transition: 'background 140ms var(--e-out, ease)',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: 999,
                background: on ? 'var(--brand-fg, #041209)' : 'var(--fg-3, #98a4b2)',
                transform: on ? 'translateX(16px)' : 'none',
                transition: 'transform 160ms var(--e-out, ease)',
              }} />
            </button>
          ) : (
            <span style={{
              padding: '2px 9px', borderRadius: 999, font: "600 11px/1.5 'Inter', system-ui, sans-serif",
              background: on ? 'var(--brand-soft, rgba(34,197,94,.14))' : 'var(--surface-3, #1c242f)',
              color: on ? 'var(--brand, #22c55e)' : 'var(--fg-4, #828e9f)',
            }}>{on ? 'Yes' : 'No'}</span>
          )}
          <StatusIcon status={status} errMsg={errMsg} />
        </span>
        <ExternalError />
        </span>
      </div>
    );
  }

  /* ── Read mode ── */
  if (status === 'idle' || status === 'saved') {
    const display = displayValue !== undefined ? displayValue : formatDisplayValue(value, type, maskFn, options);
    return (
      <div
        style={{
          ...row,
          cursor: editable ? 'pointer' : 'default',
          // A left rule rather than a filled background: these rows sit in a
          // dense stack, and tinting several at once makes the panel unreadable.
          ...(showExternalError ? {
            boxShadow: 'inset 2px 0 0 0 var(--danger, #ef4444)',
            paddingLeft: 8, marginLeft: -8, borderRadius: 'var(--r-1, 7px)',
          } : null),
        }}
        onClick={editable ? startEdit : undefined}
        className={editable ? 'ds-inline-field' : undefined}
      >
        <span style={labelStyle}>{label}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20, font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)' }}>
            {/* The em-dash below is this field's answer — "no value" — not
                decoration, so it uses the lowest TEXT tier. --fg-faint
                measures ~2.5 and is reserved for separators and glyphs. */}
            {display || (
              <span style={{ color: showExternalError ? 'var(--danger, #ef4444)' : 'var(--fg-4, #828e9f)' }}>
                {showExternalError ? 'Required' : '—'}
              </span>
            )}
            {editable && status !== 'saved' && (
              <Pencil size={12} className="ds-inline-pencil" style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0, opacity: 0, transition: 'opacity 120ms ease' }} />
            )}
            <StatusIcon status={status} errMsg={errMsg} />
          </span>
          <ExternalError />
          {warn && !showExternalError && <span style={{ font: "450 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn, #f59e0b)', marginTop: 2 }}>{warn}</span>}
        </div>
        <style>{'.ds-inline-field:hover .ds-inline-pencil{opacity:1}'}</style>
      </div>
    );
  }

  /* ── Editing / error ── */
  return (
    <div style={{ ...row, padding: '6px 0' }}>
      <span style={{ ...labelStyle, paddingTop: 6 }}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {type === 'select' ? (
          <select
            ref={inputRef}
            value={editVal}
            /* Commits on pick: a native select keeps focus after closing, so
               blur-only saving made the change feel lost until you clicked
               elsewhere. */
            onChange={(e) => { setEditVal(e.target.value); save(e.target.value); }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 24 }}
          >
            <option value="">— Select —</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
            rows={2}
            placeholder={placeholder}
            style={{ ...inputStyle, resize: 'none' }}
          />
        ) : (
          <input
            ref={inputRef}
            type={type === 'masked' ? 'text' : type === 'phone' ? 'tel' : type}
            value={editVal}
            onChange={(e) => setEditVal(transform ? transform(e.target.value) : e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            style={inputStyle}
          />
        )}
        {status === 'saving' && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0 }} />}
        {status === 'error' && (
          <>
            {/* onMouseDown fires before blur — without the guard, clicking
                retry would trigger a blur-save first. */}
            <button type="button" title="Retry" onMouseDown={() => { skipBlurRef.current = true; }} onClick={() => save(editVal)}
              style={{ color: 'var(--brand, #22c55e)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
              <Check size={14} />
            </button>
            <button type="button" title="Cancel" onMouseDown={() => { skipBlurRef.current = true; }} onClick={cancel}
              style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
              <X size={14} />
            </button>
            {errMsg && <span style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger, #ef4444)' }}>{errMsg}</span>}
          </>
        )}
      </div>
      {/* Kept visible while editing: the whole point of a preflight error is
          to tell you what to type. */}
      <ExternalError />
      </div>
    </div>
  );
}

function StatusIcon({ status, errMsg }) {
  if (status === 'saving') return <Loader2 size={13} className="animate-spin" style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0 }} />;
  if (status === 'saved') return <Check size={13} style={{ color: 'var(--brand, #22c55e)', flexShrink: 0 }} />;
  if (status === 'error') return <span title={errMsg} style={{ color: 'var(--danger, #ef4444)', font: "600 12px/1 'Inter', system-ui, sans-serif", flexShrink: 0 }}>!</span>;
  return null;
}

function formatDisplayValue(val, type, maskFn, options) {
  if (val == null || val === '') return null;
  if (maskFn) return maskFn(val);
  if (type === 'date') {
    return new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (type === 'datetime-local') {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (type === 'select' && options.length > 0) {
    return options.find((o) => String(o.value) === String(val))?.label || val;
  }
  if (type === 'url') {
    // Legacy values from Odoo imports can lack a protocol.
    const raw = String(val).trim();
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ color: 'var(--brand, #22c55e)', wordBreak: 'break-all' }}>
        {raw}
      </a>
    );
  }
  return String(val);
}
