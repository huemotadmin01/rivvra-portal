import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../lib/analytics';

/**
 * Sends a GA4 page_view on every client-side navigation. Renders nothing.
 * Must sit inside <Router>. The automatic gtag page_view is disabled in
 * analytics.js so the first render here is the only one counted.
 */
export default function AnalyticsRouteListener() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    trackPageView(pathname, search);
  }, [pathname, search]);
  return null;
}
