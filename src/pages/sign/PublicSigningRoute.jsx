import { lazy } from 'react';
import { useSearchParams } from 'react-router-dom';

const PublicSigningPage = lazy(() => import('./PublicSigningPage'));
const PublicSigningPageV2 = lazy(() => import('./PublicSigningPageV2'));

const KEY = 'rivvra-sign-ui';

/**
 * v2-vs-legacy selection for the PUBLIC signing route.
 *
 * `PageSwitch` reads `currentOrg.uiV2`, and this route deliberately lives
 * outside `OrgPlatformLayout` — there is no `OrgProvider`, no `currentOrg`,
 * and the verify endpoint returns `orgName` but no UI flag. So the switch is
 * local:
 *
 *   ?ui=v1  → legacy from now on in this browser (escape hatch)
 *   ?ui=v2  → back to v2, and forget
 *
 * **The default is v2 since 2026-10-11** (user decision). Until then the
 * default was legacy and v2 was opt-in; both pages carry the same signing
 * logic, stamp preview and success card, so a signer mid-flow across the
 * flip sees the same fields and the same sealed PDF.
 *
 * The preference is remembered so a signer who is mid-flow when they reload
 * (or follow the link again from the same email) stays on the same UI rather
 * than switching under them. A malformed or stale ('v2') value reads as v2.
 */
export default function PublicSigningRoute() {
  const [searchParams] = useSearchParams();
  const param = searchParams.get('ui');

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode — v2 */ }

  if (param === 'v2' || param === 'v1') {
    try {
      if (param === 'v1') localStorage.setItem(KEY, 'v1');
      else localStorage.removeItem(KEY);
    } catch { /* non-fatal: the param still applies to this visit */ }
    stored = param === 'v1' ? 'v1' : null;
  }

  // No local <Suspense>: App.jsx already wraps <Routes> in one, and a second
  // boundary here buys nothing. (An earlier version of this comment blamed it
  // for a render race in PdfPageWithFields — that race did not exist; see the
  // phase-26 correction in docs/REDESIGN.md.)
  const Page = stored === 'v1' ? PublicSigningPage : PublicSigningPageV2;
  return <Page />;
}
