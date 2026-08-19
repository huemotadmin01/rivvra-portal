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
 * local and explicitly opt-in:
 *
 *   ?ui=v2  → v2 from now on in this browser
 *   ?ui=v1  → back to legacy, and forget
 *
 * **The default is legacy, always.** This is the one page an external
 * counterparty opens from an email to sign a legal document; a signer part-way
 * through a contract must not be handed a different UI because a flag
 * defaulted the wrong way, or because a deploy shipped. Turning this on for
 * real signers is a deliberate act.
 *
 * The preference is remembered so a signer who is mid-flow when they reload
 * (or follow the link again from the same email) stays on the same UI rather
 * than switching under them. A malformed value reads as legacy.
 */
export default function PublicSigningRoute() {
  const [searchParams] = useSearchParams();
  const param = searchParams.get('ui');

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode — legacy */ }

  if (param === 'v2' || param === 'v1') {
    try {
      if (param === 'v2') localStorage.setItem(KEY, 'v2');
      else localStorage.removeItem(KEY);
    } catch { /* non-fatal: the param still applies to this visit */ }
    stored = param === 'v2' ? 'v2' : null;
  }

  // NOTE: no local <Suspense>. App.jsx already wraps <Routes> in one, and a
  // second boundary here re-orders when the signing page's effects fire
  // relative to the pdf.js worker warm-up — enough to lose a pre-existing
  // race in PdfPageWithFields's render effect (see docs/REDESIGN.md).
  const Page = stored === 'v2' ? PublicSigningPageV2 : PublicSigningPage;
  return <Page />;
}
