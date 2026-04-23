import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * ComboSelect — searchable dropdown with inline "Create new" option.
 *
 * Props:
 *  - value        : selected option's _id ('' if none / new)
 *  - displayValue : text to show in the input (e.g. option name)
 *  - options      : [{ _id, name }]  — can be empty for free-text mode
 *  - onChange(id, name) : callback when user picks or creates
 *  - placeholder  : input placeholder
 *  - disabled     : disables the input
 */
export default function ComboSelect({ value, displayValue, options = [], onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(displayValue || '');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display value when prop changes
  useEffect(() => { setInputValue(displayValue || ''); }, [displayValue]);

  const trimmed = inputValue.trim().toLowerCase();
  const filtered = options.filter(o => o.name.toLowerCase().includes(trimmed));
  const exactMatch = options.some(o => o.name.toLowerCase() === trimmed);

  // Only show dropdown when there are results or user is typing (for Create option)
  const showDropdown = open && (filtered.length > 0 || inputValue.trim());

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
            // Clear selection if user is typing something different
            if (value && e.target.value !== displayValue) {
              onChange('', e.target.value.trim());
            }
          }}
          onFocus={() => setOpen(true)}
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
      {showDropdown && (
        <div className="absolute z-50 top-full mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length > 0 &&
            filtered.map((o, i) => (
              <button
                key={o._id || `name-${i}`}
                type="button"
                onClick={() => {
                  onChange(o._id || '', o.name);
                  setInputValue(o.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-700 transition-colors ${
                  o._id === value ? 'text-orange-400 bg-dark-700/50' : 'text-white'
                }`}
              >
                {o.name}
              </button>
            ))
          }
          {inputValue.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => {
                onChange('', inputValue.trim());
                setInputValue(inputValue.trim());
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm text-orange-400 hover:bg-dark-700 transition-colors font-medium ${
                filtered.length > 0 ? 'border-t border-dark-700' : ''
              }`}
            >
              + Create &ldquo;{inputValue.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
