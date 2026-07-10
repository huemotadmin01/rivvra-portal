import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * ComboSelect — searchable dropdown with inline "Create new" option.
 *
 * Props:
 *  - value        : selected option's _id ('' if none / new)
 *  - displayValue : text to show in the input (e.g. option name)
 *  - options      : [{ _id, name }]  — can be empty for free-text mode
 *  - onChange(id, name) : callback when user picks or creates
 *  - onCreateNew(name)  : optional — if provided, the "Create" item triggers
 *                          this instead of onChange('', name). Used when the
 *                          create flow needs extra fields (e.g. salesperson)
 *                          captured via a separate modal.
 *  - createLabel  : optional override for the create item label (default "Create")
 *  - placeholder  : input placeholder
 *  - disabled     : disables the input
 *  - disableCreate: hides the inline "+ Create" option entirely. Use when
 *                   the field must only pick from existing records (e.g.
 *                   Job Position → Client should only reference contacts
 *                   that already live in the contacts app, not silently
 *                   fork unmatched names into orphan strings).
 *  - onSearch(query): optional — fires on every keystroke (debounced
 *                   250 ms inside). When provided, the consumer is
 *                   expected to refetch `options` from the server based
 *                   on `query`; client-side filtering still runs over
 *                   the returned set so partial overlap is fine. Use
 *                   when the option universe is bigger than the
 *                   pre-load limit (e.g. CRM contacts, 2026-05-14
 *                   audit P1 #7 — pre-loading 500 silently truncated).
 *
 * 2026-05-08: dropdown portal-anchored to document.body so it can escape
 * narrow parent cards (e.g. Job Position → Client card was clipping the
 * full company list). Position recomputed on scroll/resize while open.
 */
export default function ComboSelect({ value, displayValue, options = [], onChange, onCreateNew, onSearch, createLabel = 'Create', placeholder, disabled, disableCreate = false }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(displayValue || '');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [coords, setCoords] = useState(null); // { left, top, width }
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Latest typed text for the blur handler's timeout (closure would be stale).
  const inputValueRef = useRef(inputValue);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);

  // Close on click outside (excluding the portal-rendered dropdown)
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display value when prop changes
  useEffect(() => { setInputValue(displayValue || ''); }, [displayValue]);

  // Always-current displayValue for the blur restore below. The restore runs
  // on a 150 ms timeout, so reading the prop via closure would capture a
  // stale value: picking an option fires blur (closure displayValue still '')
  // a tick before the parent propagates the new selection, and the timeout
  // would then wipe the just-picked text back to the placeholder. A ref lets
  // the timeout read the latest value instead.
  const displayValueRef = useRef(displayValue || '');
  useEffect(() => { displayValueRef.current = displayValue || ''; }, [displayValue]);

  // Debounced onSearch fan-out. Skipped when no onSearch is wired (the
  // common case — most ComboSelect consumers pass a static options array
  // and the in-memory filter at line 70 is enough).
  useEffect(() => {
    if (!onSearch) return;
    const id = setTimeout(() => onSearch(inputValue.trim()), 250);
    return () => clearTimeout(id);
  }, [inputValue, onSearch]);

  // Recompute portal position on open + on scroll/resize while open.
  // useLayoutEffect avoids a flicker between "no coords" and "positioned".
  useLayoutEffect(() => {
    if (!open) { setCoords(null); return; }
    const update = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const trimmed = inputValue.trim().toLowerCase();
  const filtered = options.filter(o => o.name.toLowerCase().includes(trimmed));
  const exactMatch = options.some(o => o.name.toLowerCase() === trimmed);

  function selectOption(o) {
    onChange(o._id || '', o.name);
    setInputValue(o.name);
    setOpen(false);
  }

  // disableCreate blur: commit an unambiguous typed match instead of silently
  // reverting. Typing "ashita" then Tab/click-away used to discard the input
  // and restore the previous selection — users read that as "my selection
  // reversed back to Myself". Exact match wins; else a single partial match
  // commits; only ambiguous/no-match input still restores.
  function commitOrRestore() {
    const typed = (inputValueRef.current || '').trim().toLowerCase();
    const current = displayValueRef.current || '';
    if (!typed || typed === current.trim().toLowerCase()) {
      setInputValue(current);
      return;
    }
    const exact = options.find(o => o.name.toLowerCase() === typed);
    const partial = options.filter(o => o.name.toLowerCase().includes(typed));
    const pick = exact || (partial.length === 1 ? partial[0] : null);
    if (pick) {
      onChange(pick._id || '', pick.name);
      setInputValue(pick.name);
    } else {
      setInputValue(current);
    }
  }

  // Show dropdown when open AND there's something to render — either
  // matching options, or a typed string that lets us offer "+ Create"
  // (suppressed when disableCreate is set).
  const showDropdown = open && coords && (
    filtered.length > 0 || (!disableCreate && inputValue.trim())
  );

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
            setHighlightIdx(0);
            // Free-text mode: clear the bound value as the user types
            // (so a stale id doesn't survive an unmatched input). In
            // disableCreate mode we never accept free text — keep the
            // current selection until a real option is picked.
            if (!disableCreate && value && e.target.value !== displayValue) {
              onChange('', e.target.value.trim());
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHighlightIdx(i => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlightIdx(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              // Enter picks the highlighted (or first) match instead of
              // submitting the surrounding form with a half-made choice.
              if (open && filtered.length > 0) {
                e.preventDefault();
                selectOption(filtered[Math.min(highlightIdx, filtered.length - 1)]);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          onBlur={() => {
            // disableCreate: commit an unambiguous typed match, else restore
            // the previous display value (see commitOrRestore above).
            if (disableCreate) {
              setTimeout(commitOrRestore, 150);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field w-full text-sm pr-8"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          // Min width matches input but caps wider so long company names
          // (e.g. "Huemot Technology Private Limited") aren't truncated.
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            minWidth: coords.width,
            maxWidth: Math.max(coords.width, 360),
          }}
          className="z-[60] bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {filtered.map((o, i) => (
            <button
              key={o._id || `name-${i}`}
              type="button"
              // preventDefault keeps focus in the input, so clicking an
              // option never fires the input's blur → no restore race.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightIdx(i)}
              onClick={() => selectOption(o)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-700 transition-colors ${
                i === highlightIdx ? 'bg-dark-700' : ''
              } ${o._id === value ? 'text-orange-400 bg-dark-700/50' : 'text-white'}`}
            >
              {o.name}
            </button>
          ))}
          {!disableCreate && inputValue.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const typed = inputValue.trim();
                if (onCreateNew) {
                  onCreateNew(typed);
                } else {
                  onChange('', typed);
                  setInputValue(typed);
                }
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm text-orange-400 hover:bg-dark-700 transition-colors font-medium ${
                filtered.length > 0 ? 'border-t border-dark-700' : ''
              }`}
            >
              + {createLabel} &ldquo;{inputValue.trim()}&rdquo;
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
