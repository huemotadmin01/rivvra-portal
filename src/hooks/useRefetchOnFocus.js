import { useEffect, useRef } from 'react';

// Re-run a fetcher when the tab regains focus / becomes visible (2026-09-23).
//
// Lists that reflect work done elsewhere — a candidate signing a Rate
// Confirmation, a colleague moving a stage — otherwise sit stale until the
// user reloads. Focus is the moment they come back to look, so refetch then;
// no timer, so an idle tab costs the cluster nothing. Throttled so rapid
// alt-tabbing can't stack requests (same shape as GstReportV2's onVisible).
//
// `refetch` should be a stable callback (useCallback) and should not blank
// the current rows — pass a silent variant where the page has one.
export default function useRefetchOnFocus(refetch, { minIntervalMs = 15000, enabled = true } = {}) {
  const lastRunRef = useRef(Date.now());
  useEffect(() => {
    if (!enabled || typeof refetch !== 'function') return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = Date.now();
      refetch();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refetch, minIntervalMs, enabled]);
}
