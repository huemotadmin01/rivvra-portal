import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Check, Pencil, ChevronDown, Search, X } from 'lucide-react';

/**
 * InlineComboField — inline-editable picker with search, save-on-select.
 *
 * Same idle → editing → saving → saved cycle as <InlineField> but the editor
 * is a search-and-pick popover instead of a raw <select> dropdown. Designed
 * for "pick one of N employees / contacts" lists where N is large.
 *
 * Props:
 *  label       — field label (left column, 140px)
 *  field       — key passed to onSave (e.g. "recruiterEmployeeId")
 *  value       — currently-selected option's id (or '' for none)
 *  options     — [{ value, label }]
 *  editable    — whether the field is editable for the current viewer
 *  required    — block save when value cleared
 *  allowClear  — show a "— None —" entry that clears the selection
 *  displayValue — fallback display in idle mode (e.g. name from the record)
 *  onSave      — async (field, newValue) => void — throws on failure
 *  placeholder — search input placeholder
 *  warn        — soft amber hint shown beneath the value
 */
export default function InlineComboField({
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
}) {
  const [status, setStatus] = useState('idle'); // idle | editing | saving | saved | error
  const [search, setSearch] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const savedTimerRef = useRef(null);

  // Cleanup saved timer
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  // Focus the search input when entering edit mode
  useEffect(() => {
    if (status === 'editing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [status]);

  // Click-outside cancel
  useEffect(() => {
    if (status !== 'editing') return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setStatus('idle');
      }
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

  const cancel = useCallback(() => {
    setStatus('idle');
    setErrMsg('');
  }, []);

  const save = useCallback(async (newValue) => {
    if (newValue === value) {
      setStatus('idle');
      return;
    }
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

  // Filter options by search query
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, search]);

  // Resolve display name from current value if displayValue prop not given
  const resolvedDisplay = useMemo(() => {
    if (displayValue !== undefined && displayValue !== null && displayValue !== '') {
      return displayValue;
    }
    if (value) {
      const opt = options.find((o) => String(o.value) === String(value));
      if (opt) return opt.label;
    }
    return null;
  }, [displayValue, options, value]);

  // ---------- Read mode ----------
  if (status === 'idle' || status === 'saved' || status === 'error') {
    return (
      <div
        ref={containerRef}
        className={`grid grid-cols-[140px_1fr] gap-2 py-2 group ${editable ? 'cursor-pointer' : ''}`}
        onClick={editable ? startEdit : undefined}
      >
        <span className="text-dark-400 text-sm">{label}</span>
        <div className="flex flex-col min-w-0">
          <span className="flex items-center gap-2 text-white text-sm min-h-[20px]">
            {resolvedDisplay || <span className="text-dark-600">— None —</span>}
            {editable && status === 'idle' && (
              <Pencil
                size={12}
                className="text-dark-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
            )}
            {status === 'saved' && (
              <Check size={13} className="text-emerald-400 flex-shrink-0" />
            )}
            {status === 'error' && (
              <span className="text-red-400 text-xs flex-shrink-0" title={errMsg}>!</span>
            )}
          </span>
          {status === 'error' && errMsg && (
            <span className="text-red-400 text-[11px] mt-0.5">{errMsg}</span>
          )}
          {warn && status !== 'error' && (
            <span className="text-[11px] text-amber-400/80 mt-0.5 leading-tight">{warn}</span>
          )}
        </div>
      </div>
    );
  }

  // ---------- Editing mode (popover) ----------
  return (
    <div ref={containerRef} className="grid grid-cols-[140px_1fr] gap-2 py-1.5">
      <span className="text-dark-400 text-sm pt-1.5">{label}</span>
      <div className="relative">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
              if (e.key === 'Enter' && filtered.length === 1) {
                save(filtered[0].value);
              }
            }}
            placeholder={placeholder}
            className="w-full bg-dark-900 border border-dark-600 rounded pl-8 pr-7 py-1.5 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
          />
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none"
          />
        </div>
        {status === 'saving' && (
          <div className="absolute right-7 top-1/2 -translate-y-1/2">
            <Loader2 size={14} className="text-dark-400 animate-spin" />
          </div>
        )}
        <div className="absolute z-50 left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
          {allowClear && !required && (
            <button
              type="button"
              onClick={() => save('')}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 hover:bg-dark-700 ${
                !value ? 'text-rivvra-400 bg-dark-700/50' : 'text-dark-300'
              }`}
            >
              <X size={12} className="opacity-60" />
              <span className="italic">— None —</span>
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-dark-500 italic">
              No matches.
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value || `none-${o.label}`}
                type="button"
                onClick={() => save(o.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-dark-700 ${
                  String(o.value) === String(value)
                    ? 'text-rivvra-400 bg-dark-700/50'
                    : 'text-white'
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
