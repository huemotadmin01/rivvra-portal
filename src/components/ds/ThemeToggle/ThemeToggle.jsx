import * as React from 'react';

const KEY = 'rivvra.theme';

function readInitial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) { /* storage blocked */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

/**
 * Theme state + persistence. Follows the OS until the user picks explicitly,
 * then remembers that choice in localStorage. Writes `data-theme` on <html>.
 */
export function useTheme() {
  const [theme, setThemeState] = React.useState(readInitial);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) { /* noop */ }
  }, [theme]);

  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = e => {
      try { if (localStorage.getItem(KEY)) return; } catch (err) { /* noop */ }
      setThemeState(e.matches ? 'light' : 'dark');
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const setTheme = React.useCallback(next => {
    document.body.classList.add('no-theme-anim');
    setThemeState(next);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.body.classList.remove('no-theme-anim')));
  }, []);

  return [theme, setTheme];
}

const Moon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 13.5A8.5 8.5 0 1110.5 4a6.8 6.8 0 009.5 9.5Z" />
  </svg>
);
const Sun = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </svg>
);

/** Two-up dark/light switch with a sliding thumb. Pair with `useTheme`. */
export function ThemeToggle({ theme = 'dark', onChange, style, ...rest }) {
  const track = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    height: 30,
    padding: 3,
    borderRadius: 999,
    background: 'var(--surface-2, #141b24)',
    boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
    ...style,
  };
  const thumb = {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 24,
    height: 24,
    borderRadius: 999,
    background: 'var(--surface-4, #253040)',
    boxShadow: 'var(--sh-1, 0 1px 2px rgba(0,0,0,.36))',
    transform: theme === 'light' ? 'translateX(26px)' : 'translateX(0)',
    transition: 'transform 260ms cubic-bezier(.16,1.02,.3,1)',
  };
  const seg = active => ({
    position: 'relative',
    zIndex: 1,
    width: 24,
    height: 24,
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    background: 'none',
    borderRadius: 999,
    cursor: 'pointer',
    color: active ? 'var(--fg, #eef2f6)' : 'var(--fg-4, #4a5563)',
    transition: 'color 180ms cubic-bezier(.2,.9,.28,1)',
  });

  return (
    <div role="group" aria-label="Color theme" style={track} {...rest}>
      <span aria-hidden="true" style={thumb} />
      <button type="button" style={seg(theme === 'dark')} aria-pressed={theme === 'dark'} aria-label="Dark theme" onClick={() => onChange?.('dark')}>
        <Moon />
      </button>
      <button type="button" style={seg(theme === 'light')} aria-pressed={theme === 'light'} aria-label="Light theme" onClick={() => onChange?.('light')}>
        <Sun />
      </button>
    </div>
  );
}
