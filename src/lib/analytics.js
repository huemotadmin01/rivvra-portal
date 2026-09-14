/**
 * Google Analytics 4 + Google Ads conversion tracking.
 *
 * Fully guarded, like sentry.js: a no-op unless at least one of these is set
 * at build time (deploy.yml maps them from GitHub repository variables):
 *
 *   VITE_GA_MEASUREMENT_ID   G-XXXXXXXXXX      (GA4 property)
 *   VITE_ADS_CONVERSION_ID   AW-XXXXXXXXXX     (Google Ads account tag)
 *   VITE_ADS_SIGNUP_LABEL    conversion label for "workspace created"
 *   VITE_ADS_PURCHASE_LABEL  conversion label for "paid plan activated"
 *
 * Why it lives here and not in index.html: an inline gtag snippet would ship
 * to every build including staging and local dev, and the IDs would be pasted
 * into markup nobody re-reads. Loading it from code keeps the switch in one
 * place and makes "is tracking on?" answerable by one env lookup.
 *
 * Consent: Google's EU user-consent policy requires consent before ad cookies
 * for EEA/UK/CH visitors. Rather than build a banner nobody in India wants,
 * Consent Mode v2 defaults to DENIED for those regions only — gtag then sends
 * cookieless pings (modelled conversions) there and full measurement
 * everywhere else. If ads ever target Europe, add a banner that calls
 * grantConsent() and revisit this default.
 *
 * Events are named for the funnel step a marketer recognises, not the API
 * call: signup_started → signup_verified → workspace_created → checkout_started
 * → subscription_activated. workspace_created and subscription_activated also
 * fire the matching Ads conversion when a label is configured.
 */

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
const ADS_ID = import.meta.env.VITE_ADS_CONVERSION_ID || '';
const SIGNUP_LABEL = import.meta.env.VITE_ADS_SIGNUP_LABEL || '';
const PURCHASE_LABEL = import.meta.env.VITE_ADS_PURCHASE_LABEL || '';

// Regions where Consent Mode defaults to denied (EEA + UK + Switzerland).
const CONSENT_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
];

let enabled = false;

export function analyticsEnabled() {
  return enabled;
}

function gtag() {
  // gtag pushes `arguments` (not an array) — keep the exact shape it expects.
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

export function initAnalytics() {
  if (enabled) return;
  if (!GA_ID && !ADS_ID) return; // not configured — stay silent
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Don't count our own dev sessions or the staging service as traffic.
  if (import.meta.env.DEV || import.meta.env.VITE_STAGING === 'true') return;

  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || gtag;

    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      region: CONSENT_REGIONS,
      wait_for_update: 500,
    });
    gtag('consent', 'default', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });

    gtag('js', new Date());
    // page_view is sent by AnalyticsRouteListener on every client-side
    // navigation, including the first one, so the automatic one is off —
    // otherwise the landing page would count twice.
    if (GA_ID) gtag('config', GA_ID, { send_page_view: false });
    if (ADS_ID) gtag('config', ADS_ID, { allow_enhanced_conversions: true });

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID || ADS_ID)}`;
    document.head.appendChild(s);
    enabled = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Analytics init skipped:', e?.message);
  }
}

/** Call from a consent banner if one is ever added. */
export function grantConsent() {
  if (!enabled) return;
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });
}

/** SPA page view. Paths under /org/<slug>/ are collapsed so per-tenant URLs
 *  don't fan out into thousands of "pages" in GA. */
export function trackPageView(pathname, search = '') {
  if (!enabled) return;
  const path = pathname.replace(/^\/org\/[^/]+/, '/org/_');
  gtag('event', 'page_view', {
    page_path: path + (search || ''),
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}

/** Generic funnel event. Params are kept small and non-identifying. */
export function trackEvent(name, params = {}) {
  if (!enabled) return;
  try {
    gtag('event', name, params);
  } catch { /* never let telemetry break the UI */ }
}

function trackConversion(label, params = {}) {
  if (!enabled || !ADS_ID || !label) return;
  try {
    gtag('event', 'conversion', { send_to: `${ADS_ID}/${label}`, ...params });
  } catch { /* ignore */ }
}

// ── Funnel helpers (one call site each, named for the step) ─────────────────

export function trackSignupStarted(params = {}) {
  trackEvent('signup_started', params);
}

export function trackSignupVerified(params = {}) {
  trackEvent('signup_verified', params);
}

/** The primary Ads conversion: a workspace now exists. */
export function trackWorkspaceCreated(params = {}) {
  trackEvent('workspace_created', params);
  trackEvent('sign_up', { method: params.method || 'email' }); // GA4 recommended event
  trackConversion(SIGNUP_LABEL, { value: 0, currency: 'USD' });
}

export function trackCheckoutStarted(params = {}) {
  trackEvent('checkout_started', params);
  trackEvent('begin_checkout', params); // GA4 recommended event
}

/** Secondary Ads conversion: a paid plan is live on the org. */
export function trackSubscriptionActivated(params = {}) {
  trackEvent('subscription_activated', params);
  trackEvent('purchase', params); // GA4 recommended event
  trackConversion(PURCHASE_LABEL, {
    value: params.value ?? 0,
    currency: params.currency || 'USD',
    transaction_id: params.transaction_id,
  });
}
