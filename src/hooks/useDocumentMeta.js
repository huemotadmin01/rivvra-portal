import { useEffect } from 'react';

/**
 * Per-route <title>, meta description and canonical for the public pages.
 *
 * index.html carries one title and description for the whole SPA, so every
 * route used to show "Rivvra — All-in-one staffing platform" in the tab, in
 * search results and in Google Ads' landing-page assessment. This sets the
 * three tags a crawler and an ad reviewer read, and restores the defaults
 * on unmount so app routes are not left wearing a marketing title.
 *
 *   useDocumentMeta({ title: 'Pricing', description: '…', path: '/pricing' });
 *
 * `title` is suffixed with " · Rivvra"; pass `titleRaw` to control it fully.
 */

const SITE = 'https://www.rivvra.com';
const DEFAULT_TITLE = 'Rivvra — All-in-one staffing platform';
const DEFAULT_DESC = 'Rivvra — The all-in-one staffing platform. Outreach, timesheets, CRM, ATS, payroll, e-signatures, and more. Built for staffing agencies.';

function setMeta(selector, attr, value, create) {
  let el = document.head.querySelector(selector);
  if (!el && create) { el = create(); document.head.appendChild(el); }
  if (el) el.setAttribute(attr, value);
}

export function useDocumentMeta({ title, titleRaw, description, path } = {}) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const fullTitle = titleRaw || (title ? `${title} · Rivvra` : DEFAULT_TITLE);
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'content', description || DEFAULT_DESC, () => {
      const m = document.createElement('meta'); m.setAttribute('name', 'description'); return m;
    });
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', description || DEFAULT_DESC);
    const url = SITE + (path || '/');
    setMeta('link[rel="canonical"]', 'href', url);
    setMeta('meta[property="og:url"]', 'content', url);
    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('meta[name="description"]', 'content', DEFAULT_DESC);
      setMeta('meta[property="og:title"]', 'content', DEFAULT_TITLE);
      setMeta('meta[property="og:description"]', 'content', DEFAULT_DESC);
      setMeta('link[rel="canonical"]', 'href', SITE);
      setMeta('meta[property="og:url"]', 'content', SITE);
    };
  }, [title, titleRaw, description, path]);
}

export default useDocumentMeta;
