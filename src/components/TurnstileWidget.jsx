import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile challenge, explicit-render mode.
 *
 * Renders nothing and loads nothing unless `siteKey` is given — the API tells
 * the page whether the gate is on (registration-status.turnstile), so a
 * flag-off deployment never touches challenges.cloudflare.com. Mirrors the
 * loader in pages/careers/CareersJobDetail.jsx; the script is shared once it
 * is on the page.
 *
 *   <TurnstileWidget siteKey={key} onToken={setToken} theme="dark" />
 *
 * onToken(null) is called when a token expires or errors so the caller can
 * disable its submit button again.
 */

let scriptPromise = null;
function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile || null);
    s.onerror = () => { scriptPromise = null; reject(new Error('Failed to load Turnstile')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function TurnstileWidget({ siteKey, onToken, theme = 'dark', className = '' }) {
  const hostRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !hostRef.current) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !ts || !hostRef.current) return;
        widgetIdRef.current = ts.render(hostRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => onTokenRef.current?.(null),
        });
      })
      .catch(() => onTokenRef.current?.(null));
    return () => {
      cancelled = true;
      try { if (widgetIdRef.current != null && window.turnstile) window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      widgetIdRef.current = null;
    };
  }, [siteKey, theme]);

  if (!siteKey) return null;
  return <div ref={hostRef} className={className} />;
}
