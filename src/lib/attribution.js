/**
 * First-touch acquisition attribution.
 *
 * Captures the UTM parameters, click IDs, referrer and landing path from the
 * FIRST visit in this browser and keeps them for 30 days, so that when the
 * visitor eventually finishes the signup wizard the new workspace can carry
 * `acquisition` — which campaign brought this org in. That is the only way to
 * answer "which ad produced a paying customer" once the visitor has clicked
 * around for a week and the URL no longer says.
 *
 * First-touch on purpose: the campaign that earned the click gets the credit,
 * even if the person later comes back via a bookmark. Never overwritten while
 * a record is fresh; a visit with new UTMs after expiry starts a new record.
 *
 * Stored in localStorage under one key. Only marketing parameters are kept —
 * nothing that identifies the person.
 */

const KEY = 'rivvra.acquisition';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'li_fat_id'];

function clip(v, n = 200) {
  return typeof v === 'string' ? v.slice(0, n) : '';
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== 'object') return null;
    if (!rec.capturedAt || Date.now() - new Date(rec.capturedAt).getTime() > TTL_MS) return null;
    return rec;
  } catch {
    return null;
  }
}

/**
 * Call once at boot, before the router mounts, so the landing URL's query
 * string is still intact. Safe to call on every load.
 */
export function captureAttribution() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const hasUtm = UTM_KEYS.some((k) => params.get(k));
    const clickId = CLICK_ID_KEYS.find((k) => params.get(k));

    const existing = read();
    // A fresh first-touch record wins; only a tagged visit can replace an
    // expired one. An untagged return visit never overwrites anything.
    if (existing) return;
    if (!hasUtm && !clickId) {
      // Untagged first visit: still remember the referrer + landing path, so
      // organic/direct signups are attributable too.
      const ref = clip(document.referrer, 300);
      const rec = {
        source: ref ? 'referral' : 'direct',
        referrer: ref || null,
        landingPath: clip(window.location.pathname, 200),
        capturedAt: new Date().toISOString(),
      };
      localStorage.setItem(KEY, JSON.stringify(rec));
      return;
    }

    const rec = {
      source: clip(params.get('utm_source')) || (clickId === 'gclid' || clickId === 'gbraid' || clickId === 'wbraid' ? 'google' : 'unknown'),
      medium: clip(params.get('utm_medium')) || (clickId ? 'cpc' : ''),
      campaign: clip(params.get('utm_campaign')),
      term: clip(params.get('utm_term')),
      content: clip(params.get('utm_content')),
      clickId: clickId ? { [clickId]: clip(params.get(clickId), 300) } : null,
      referrer: clip(document.referrer, 300) || null,
      landingPath: clip(window.location.pathname, 200),
      capturedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    /* localStorage unavailable — attribution is best-effort */
  }
}

/** The record to send with the onboarding payload, or null. */
export function getAttribution() {
  return read();
}

/** After the workspace exists the record has done its job. */
export function clearAttribution() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
