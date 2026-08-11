import * as React from 'react';

const TONES = {
  neutral: { bg: 'var(--surface-3, #1c242f)', fg: 'var(--fg-3, #98a4b2)' },
  brand:   { bg: 'var(--brand-soft, rgba(34,197,94,.14))', fg: 'var(--brand, #22c55e)' },
  warn:    { bg: 'var(--warn-soft, rgba(245,158,11,.14))', fg: 'var(--warn, #f59e0b)' },
  danger:  { bg: 'var(--danger-soft, rgba(239,68,68,.14))', fg: 'var(--danger, #ef4444)' },
};

const SIZES = { sm: 400, md: 540, lg: 760 };

const Close = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

function useEscape(active, onClose) {
  React.useEffect(() => {
    if (!active || !onClose) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onClose]);
}

function Scrim({ onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'color-mix(in srgb, #04070c 62%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
    />
  );
}

/** Centred dialog. Keep it to confirmations and short create flows. */
export function Modal({ open, onClose, size = 'md', tone = 'neutral', icon, title, sub, children, footer }) {
  useEscape(open, onClose);
  if (!open) return null;
  const t = TONES[tone] || TONES.neutral;
  return (
    <>
      <Scrim onClick={onClose} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 91, display: 'grid', placeItems: 'center', padding: 20, pointerEvents: 'none' }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          style={{
            pointerEvents: 'auto', width: '100%', maxWidth: SIZES[size] || SIZES.md,
            display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 40px)',
            background: 'var(--surface-1, #101720)', borderRadius: 'var(--r-4, 20px)',
            boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.1)), var(--sh-4, 0 24px 64px rgba(0,0,0,.5)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px 12px' }}>
            {icon && (
              <span style={{ width: 34, height: 34, borderRadius: 'var(--r-2, 12px)', display: 'grid', placeItems: 'center', flexShrink: 0, background: t.bg, color: t.fg }}>
                {icon}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ font: "650 15.5px/1.35 'Inter', system-ui, sans-serif", letterSpacing: '-0.014em', color: 'var(--fg, #eef2f6)', margin: '0 0 3px' }}>{title}</h2>
              {sub && <p style={{ font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3, #98a4b2)', margin: 0 }}>{sub}</p>}
            </div>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close"
                style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 'none', background: 'none', borderRadius: 'var(--r-1, 8px)', color: 'var(--fg-4, #828e9f)', cursor: 'pointer', flexShrink: 0 }}>
                <Close />
              </button>
            )}
          </div>
          {children && <div style={{ padding: '0 20px 16px', overflowY: 'auto' }}>{children}</div>}
          {footer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 16px', marginTop: 'auto', borderTop: children ? '1px solid var(--line, rgba(255,255,255,.07))' : 'none' }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Right-edge side sheet. Inspect a record without losing the list behind it. */
export function Drawer({ open, onClose, title, sub, avatar, children, footer, width = 468 }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <Scrim onClick={onClose} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 91, display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          style={{
            pointerEvents: 'auto', width: '100%', maxWidth: width, height: '100%',
            display: 'flex', flexDirection: 'column',
            background: 'var(--surface-1, #101720)',
            boxShadow: '-1px 0 0 var(--line-2, rgba(255,255,255,.1)), var(--sh-4, 0 24px 64px rgba(0,0,0,.5))',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', borderBottom: '1px solid var(--line, rgba(255,255,255,.07))' }}>
            {avatar}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "650 15px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.014em', color: 'var(--fg, #eef2f6)', marginBottom: 2 }}>{title}</div>
              {sub && <div style={{ font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3, #98a4b2)' }}>{sub}</div>}
            </div>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close"
                style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 'none', background: 'none', borderRadius: 'var(--r-1, 8px)', color: 'var(--fg-4, #828e9f)', cursor: 'pointer', flexShrink: 0 }}>
                <Close />
              </button>
            )}
          </header>
          <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
          {footer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--line, rgba(255,255,255,.07))' }}>
              {footer}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
