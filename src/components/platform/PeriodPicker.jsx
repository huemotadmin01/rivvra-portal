import { useState, useRef, useEffect } from 'react';
import { usePeriod } from '../../context/PeriodContext';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PeriodPicker() {
  const { month, year, fyShort, isActive, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  const ref = useRef(null);

  // Sync viewYear when year changes externally
  useEffect(() => { setViewYear(year); }, [year]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!isActive) return null;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800/50 hover:bg-dark-800 border border-dark-700/50 transition-colors text-sm"
      >
        <Calendar size={14} className="text-dark-400" />
        <span className="text-dark-200 font-medium">{MONTHS[month - 1]} {year}</span>
        <span className="text-dark-500 text-xs hidden sm:inline">| {fyShort}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-dark-900 border border-dark-700 rounded-xl shadow-xl z-50 p-3">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setViewYear(v => v - 1)}
              className="p-1 rounded-md hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-white">{viewYear}</span>
            <button
              onClick={() => setViewYear(v => v + 1)}
              disabled={viewYear >= currentYear + 1}
              className="p-1 rounded-md hover:bg-dark-800 text-dark-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const mNum = i + 1;
              const isSelected = mNum === month && viewYear === year;
              const isCurrent = mNum === currentMonth && viewYear === currentYear;
              const isFuture = viewYear > currentYear || (viewYear === currentYear && mNum > currentMonth);

              return (
                <button
                  key={m}
                  onClick={() => { setPeriod(mNum, viewYear); setOpen(false); }}
                  disabled={isFuture}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-rivvra-500 text-dark-950'
                      : isCurrent
                        ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/30'
                        : isFuture
                          ? 'text-dark-600 cursor-not-allowed'
                          : 'text-dark-300 hover:bg-dark-800 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* FY label */}
          <div className="mt-2.5 pt-2 border-t border-dark-700/50 text-center">
            <span className="text-[10px] text-dark-500">
              Financial Year: {month >= 4 ? viewYear : viewYear - 1}-{month >= 4 ? viewYear + 1 : viewYear}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
