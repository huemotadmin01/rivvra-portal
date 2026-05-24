// ============================================================================
// devAuthBoot — Dev-only: seed localStorage with a real auth token before
// React mounts, so /org/:slug/* pages render without manually logging in.
//
// HOW TO USE
//   1. Visit https://www.rivvra.com in your normal browser while logged in.
//   2. Open DevTools → Application → Local Storage → www.rivvra.com.
//   3. Copy the values of `rivvra_token` and `rivvra_user`.
//   4. Create (or edit) `.env.local` in this repo root with:
//
//        VITE_DEV_AUTH_TOKEN="paste-rivvra_token-value-here"
//        VITE_DEV_AUTH_USER='paste-rivvra_user-JSON-here'
//
//      (.env.local is gitignored — your token never gets committed.)
//   5. Restart `npm run dev`. The dev server now boots as if you were logged
//      in; auth, org membership, and API calls all just work against prod.
//
// THIS IS DEV-ONLY. The module is gated by `import.meta.env.DEV`, so the
// boot logic is tree-shaken out of any production build. Even if it ran in
// prod, env vars wouldn't exist there.
// ============================================================================

function boot() {
  if (!import.meta.env.DEV) return;
  const token = import.meta.env.VITE_DEV_AUTH_TOKEN;
  const userJson = import.meta.env.VITE_DEV_AUTH_USER;
  if (!token || !userJson) return;

  // Don't clobber a real session if one already exists in this browser.
  if (localStorage.getItem('rivvra_token')) return;

  try {
    JSON.parse(userJson);  // validate shape
  } catch {
    console.warn('[devAuthBoot] VITE_DEV_AUTH_USER is not valid JSON — skipping seed.');
    return;
  }

  localStorage.setItem('rivvra_token', token);
  localStorage.setItem('rivvra_user', userJson);
  // The AuthContext sync key — keeps the Chrome extension + tab broadcasts
  // in step with what we just seeded.
  localStorage.setItem('rivvra_auth', JSON.stringify({
    token,
    user: JSON.parse(userJson),
    timestamp: Date.now(),
    devSeeded: true,
  }));
  console.info('[devAuthBoot] Seeded localStorage from VITE_DEV_AUTH_* — you are "logged in" for this dev session.');
}

boot();
