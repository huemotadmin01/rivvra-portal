// ============================================================================
// TermHint.jsx — plain-language explainers for statutory tax terms.
//
// TermHint: a term with a tap/click "?" that opens a definition popover.
//   Click-toggled (not hover) so it works on touch, and rendered position:fixed
//   so it can't be clipped by the tables' overflow-x-auto containers.
// HowToRead: collapsible primer panel shown above a report. Expanded on first
//   visit; the collapsed choice persists per page in localStorage.
// ============================================================================
import { useState, useRef, useEffect } from 'react';
import { HelpCircle, BookOpen, ChevronDown } from 'lucide-react';

export function TermHint({ label, children, className = '' }) {
  const [pos, setPos] = useState(null); // viewport coords while open
  const btnRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onDown = (e) => { if (!btnRef.current?.contains(e.target)) close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    // Clamp so the 16rem popover stays on-screen on narrow viewports.
    const half = 128;
    setPos({
      x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8),
      y: r.bottom + 6,
    });
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {label}
      <button ref={btnRef} type="button" onClick={toggle}
        aria-label={`What does ${typeof label === 'string' ? label : 'this'} mean?`}
        className="text-dark-500 hover:text-dark-300 transition-colors align-middle">
        <HelpCircle size={12} />
      </button>
      {pos && (
        <span role="tooltip"
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)' }}
          className="z-50 w-64 rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal leading-relaxed text-dark-200 shadow-xl whitespace-normal">
          {children}
        </span>
      )}
    </span>
  );
}

export function HowToRead({ storageKey, title = 'New here? How to read this report', children }) {
  const key = `rivvra:howtoread:${storageKey}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) !== 'collapsed'; } catch { return true; }
  });
  const toggle = () => setOpen((o) => {
    const next = !o;
    try { localStorage.setItem(key, next ? 'open' : 'collapsed'); } catch { /* private mode */ }
    return next;
  });
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06]">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <BookOpen size={15} className="text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-blue-300 flex-1">{title}</span>
        <ChevronDown size={15} className={`text-blue-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-[13px] leading-relaxed text-dark-200 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
