// ============================================================================
// lazyPage — code-split a page WITHOUT React's Suspense reveal delay
// (2026-11-24)
// ============================================================================
//
// React 19 will not swap a Suspense fallback for the real content until 300 ms
// after the fallback appeared (it does this to avoid a flicker). With React.lazy
// that cost is paid on every fresh load even when the code is already in the
// browser's cache — and here it was paid TWICE in a row: once for the app shell,
// then again for the page inside it. Measured on the live CRM: the shell's code
// arrived at 0.78 s but the shell only mounted at 1.08 s; the page's code
// arrived at 1.09 s but its first data request only left at 1.43 s. Nothing was
// downloading in either gap.
//
// This does the same job as React.lazy with a plain state flip instead of a
// Suspense boundary, so the page mounts the moment its code is ready. A page
// already loaded once renders straight away. A failed download is thrown in
// render, so the nearest ErrorBoundary handles it exactly as before.
//
//   const Page = lazyPage(() => import('./pages/Page'), <PageLoader />);
//   Page.preload();   // optional: start the download early
// ============================================================================

import { useState, useEffect, createElement } from 'react';

export function lazyPage(factory, fallback = null) {
  let Loaded = null;
  let promise = null;
  const load = () => {
    if (!promise) {
      promise = factory().then(
        (m) => { Loaded = m.default; return m; },
        (e) => { promise = null; throw e; }, // let a later attempt retry
      );
    }
    return promise;
  };

  function LazyPage(props) {
    const [, bump] = useState(0);
    const [error, setError] = useState(null);
    useEffect(() => {
      if (Loaded) return undefined;
      let alive = true;
      load().then(() => { if (alive) bump((n) => n + 1); }, (e) => { if (alive) setError(e); });
      return () => { alive = false; };
    }, []);
    if (error) throw error;
    return Loaded ? createElement(Loaded, props) : fallback;
  }
  LazyPage.preload = () => load().catch(() => {});
  return LazyPage;
}

export default lazyPage;
