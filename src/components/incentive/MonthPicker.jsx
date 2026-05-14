// ============================================================================
// MonthPicker — styled wrapper around <input type="month">
// ============================================================================
// Native month inputs render with Chrome's hardcoded "--------- ----" empty
// placeholder that can't be styled or replaced, which looks broken on our
// dark theme. This wrapper overlays a proper label ("All months" / "Apr 2026")
// and programmatically opens the native picker via showPicker() on click,
// because an opacity:0 input doesn't forward clicks to its tiny calendar glyph.
// ============================================================================

import { useRef } from 'react';
import { Calendar, X } from 'lucide-react';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonth(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return '';
  const [y, m] = ym.split('-').map(Number);
  if (m < 1 || m > 12) return ym;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function MonthPicker({
  value,
  onChange,
  placeholder = 'All months',
  className = '',
  allowClear = true,
}) {
  const inputRef = useRef(null);
  const display = value ? formatMonth(value) : placeholder;
  const hasValue = !!value;

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Fall through to focus fallback (e.g. non-user-gesture contexts)
      }
    }
    el.focus();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
      className={`relative inline-flex items-center bg-dark-900 border border-dark-700 rounded-lg hover:border-dark-600 focus-within:border-fuchsia-600 transition-colors cursor-pointer ${className}`}
    >
      <Calendar size={14} className="ml-3 text-dark-400 pointer-events-none" />
      <span
        className={`pl-2 pr-3 py-2 text-sm pointer-events-none select-none ${
          hasValue ? 'text-white' : 'text-dark-400'
        } min-w-[90px]`}
      >
        {display}
      </span>
      {hasValue && allowClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange('');
          }}
          className="relative z-10 mr-2 text-dark-400 hover:text-white p-0.5 rounded"
          aria-label="Clear month"
        >
          <X size={14} />
        </button>
      )}
      <input
        ref={inputRef}
        type="month"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          colorScheme: 'dark',
        }}
      />
    </div>
  );
}
