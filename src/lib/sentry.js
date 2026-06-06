/**
 * Frontend Sentry initialization.
 *
 * Fully guarded: a no-op unless VITE_SENTRY_DSN is set at build time. Any
 * failure is swallowed so it can never break app boot — monitoring is strictly
 * additive.
 *
 * To enable: set VITE_SENTRY_DSN in the build env (GitHub Pages / Vite).
 */
import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // disabled — no DSN configured
  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || 'production',
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.1,
      // Only capture errors originating from our own app bundle.
      release: import.meta.env.VITE_APP_VERSION || undefined,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Sentry init skipped:', e?.message);
  }
}
