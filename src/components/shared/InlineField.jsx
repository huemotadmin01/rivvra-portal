import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Check, X, Pencil } from 'lucide-react';

/**
 * InlineField — inline-editable field with save-on-blur.
 *
 * Props:
 *  label       — field label
 *  field       — key used in onSave (e.g. "email", "bankDetails.pan")
 *  value       — current value
 *  type        — text | email | phone | date | select | toggle | masked | textarea
 *  editable    — whether the field is editable for the current viewer
 *  required    — if true, empty value shows validation error on blur
 *  options     — [{ value, label }] for select type
 *  displayValue — custom ReactNode for read mode (overrides default rendering)
 *  maskFn      — function to mask value in read mode (e.g. bank account)
 *  onSave      — async (field, newValue) => void — throws on error
 *  placeholder — placeholder text in input
 */
export default function InlineField({
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
}) {
  const [status, setStatus] = useState('idle'); // idle | editing | saving | saved | error
  const [editVal, setEditVal] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef(null);
  const savedTimerRef = useRef(null);
  const skipBlurRef = useRef(false);

  // Focus input when entering edit mode
  useEffect(() => {
    if (status === 'editing' && inputRef.current) {
      inputRef.current.focus();
      if (type !== 'date' && type !== 'select' && inputRef.current.select) {
        inputRef.current.select();
      }
    }
  }, [status, type]);

  // Cleanup timer
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  const startEdit = useCallback(() => {
    if (!editable || status === 'saving') return;
    const raw = value ?? '';
    if (type === 'date' && raw) {
      // Convert to YYYY-MM-DD for date input — use UTC to avoid timezone shift
      const str = String(raw);
      const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        setEditVal(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
      } else {
        const d = new Date(str);
        setEditVal(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
      }
    } else {
      setEditVal(String(raw));
    }
    setErrMsg('');
    setStatus('editing');
  }, [editable, status, value, type]);

  const cancel = useCallback(() => {
    setStatus('idle');
    setErrMsg('');
  }, []);

  const save = useCallback(async (val) => {
    const newVal = typeof val === 'string' ? val.trim() : val;
    // Skip if unchanged
    const oldVal = value ?? '';
    if (String(newVal) === String(oldVal)) {
      setStatus('idle');
      return;
    }
    // Required validation
    if (required && !newVal) {
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
      setErrMsg(err?.message || 'Failed to save');
      setStatus('error');
    }
  }, [value, required, label, field, onSave]);

  const handleBlur = useCallback(() => {
    if (skipBlurRef.current) { skipBlurRef.current = false; return; }
    if (status === 'editing') save(editVal);
  }, [status, editVal, save]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && type !== 'textarea') save(editVal);
    if (e.key === 'Escape') cancel();
  }, [editVal, save, cancel, type]);

  // ---------- Toggle type — special handling ----------
  if (type === 'toggle') {
    const boolVal = !!value;
    return (
      <div className="grid grid-cols-[140px_1fr] gap-2 py-2 group">
        <span className="text-dark-400 text-sm">{label}</span>
        <span className="flex items-center gap-2 text-sm">
          {editable ? (
            <button
              type="button"
              disabled={status === 'saving'}
              onClick={async () => {
                setStatus('saving');
                try {
                  await onSave(field, !boolVal);
                  setStatus('saved');
                  savedTimerRef.current = setTimeout(() => setStatus('idle'), 1500);
                } catch (err) {
                  setErrMsg(err?.message || 'Failed to save');
                  setStatus('error');
                }
              }}
              className={`relative w-9 h-5 rounded-full transition-colors ${boolVal ? 'bg-rivvra-500' : 'bg-dark-600'} ${status === 'saving' ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${boolVal ? 'translate-x-4' : ''}`} />
            </button>
          ) : (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${boolVal ? 'bg-green-500/10 text-green-400' : 'bg-dark-700 text-dark-400'}`}>
              {boolVal ? 'Yes' : 'No'}
            </span>
          )}
          <StatusIcon status={status} errMsg={errMsg} />
        </span>
      </div>
    );
  }

  // ---------- Read mode ----------
  if (status === 'idle' || status === 'saved') {
    const display = displayValue !== undefined
      ? displayValue
      : formatDisplayValue(value, type, maskFn, options);
    return (
      <div
        className={`grid grid-cols-[140px_1fr] gap-2 py-2 group ${editable ? 'cursor-pointer' : ''}`}
        onClick={editable ? startEdit : undefined}
      >
        <span className="text-dark-400 text-sm">{label}</span>
        <span className="flex items-center gap-2 text-white text-sm min-h-[20px]">
          {display || <span className="text-dark-600">—</span>}
          {editable && status !== 'saved' && (
            <Pencil size={12} className="text-dark-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          )}
          <StatusIcon status={status} errMsg={errMsg} />
        </span>
      </div>
    );
  }

  // ---------- Error mode — re-show input ----------
  // ---------- Editing / Error mode ----------
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1.5">
      <span className="text-dark-400 text-sm pt-1.5">{label}</span>
      <div className="flex items-center gap-1.5">
        {type === 'select' ? (
          <select
            ref={inputRef}
            value={editVal}
            onChange={e => { setEditVal(e.target.value); }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
          >
            <option value="">— Select —</option>
            {options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
            rows={2}
            className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none resize-none"
            placeholder={placeholder}
          />
        ) : (
          <input
            ref={inputRef}
            type={type === 'masked' ? 'text' : type === 'phone' ? 'tel' : type}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
          />
        )}
        {status === 'saving' && <Loader2 size={14} className="text-dark-400 animate-spin flex-shrink-0" />}
        {status === 'error' && (
          <>
            <button
              type="button"
              onMouseDown={() => { skipBlurRef.current = true; }}
              onClick={() => save(editVal)}
              className="text-emerald-400 hover:text-emerald-300 flex-shrink-0"
              title="Retry"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onMouseDown={() => { skipBlurRef.current = true; }}
              onClick={cancel}
              className="text-dark-500 hover:text-dark-300 flex-shrink-0"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </>
        )}
        {status === 'error' && errMsg && (
          <span className="text-red-400 text-xs">{errMsg}</span>
        )}
      </div>
    </div>
  );
}

// ---------- Status indicator ----------
function StatusIcon({ status, errMsg }) {
  if (status === 'saving') return <Loader2 size={13} className="text-dark-400 animate-spin flex-shrink-0" />;
  if (status === 'saved') return <Check size={13} className="text-emerald-400 flex-shrink-0" />;
  if (status === 'error') return <span className="text-red-400 text-xs flex-shrink-0" title={errMsg}>!</span>;
  return null;
}

// ---------- Format display value ----------
function formatDisplayValue(val, type, maskFn, options) {
  if (val == null || val === '') return null;
  if (maskFn) return maskFn(val);
  if (type === 'date') {
    return new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (type === 'select' && options.length > 0) {
    const opt = options.find(o => String(o.value) === String(val));
    return opt?.label || val;
  }
  return String(val);
}
