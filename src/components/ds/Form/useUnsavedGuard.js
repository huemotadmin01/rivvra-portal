import { useEffect, useCallback, useRef } from 'react';

/**
 * Warn before abandoning a dirty form.
 *
 * ── Why this is not `useBlocker` ────────────────────────────────────────────
 * React Router exports `useBlocker`, and it is the obvious answer, and it does
 * not work here. It calls `useDataRouterContext('useBlocker')`, which requires
 * the data-router API (`createBrowserRouter`). This app mounts the declarative
 * `<BrowserRouter>`, so `useBlocker` throws the moment the form re-renders.
 *
 * That is not a guess: it was tried and reverted on 2026-05-17 (health-check
 * E.2, see the note in `AtsApplicationNewV2`), and the invariant is still there
 * in react-router 7.11. A full SPA-navigation block needs a migration to the
 * data router, which is a routing change, not a form change.
 *
 * So this covers the two exits it CAN cover honestly:
 *
 *   1. `beforeunload` — tab close, hard refresh, navigation to another origin.
 *      The browser's own prompt; the custom string is ignored by every modern
 *      browser, and setting `returnValue` is the side-effect that triggers it.
 *
 *   2. In-app `<a>` clicks, intercepted in the CAPTURE phase so the guard runs
 *      before React Router's own click handler. This is what catches a user
 *      clicking the sidebar or a breadcrumb mid-edit.
 *
 * ── What it deliberately does NOT cover ─────────────────────────────────────
 * The browser BACK button. `beforeunload` does not fire for same-document
 * history moves, and re-pushing a sentinel entry on `popstate` to fake a block
 * corrupts the history stack — the user's Back then does nothing, which is
 * worse than the thing being prevented. Recorded rather than half-solved.
 *
 * @param {boolean} isDirty        Guard only while true.
 * @param {object}  [opts]
 * @param {string}  [opts.message] Text for the in-app confirm.
 * @param {boolean} [opts.enabled] Master switch; pass `false` while saving, so
 *                                 the form's own submit navigation is not
 *                                 challenged by the guard it just satisfied.
 * @returns {{ confirmDiscard: () => boolean }} `confirmDiscard()` for
 *          PROGRAMMATIC exits — a Cancel button, or a `navigate()` call. Returns
 *          true when it is safe to proceed.
 */
export function useUnsavedGuard(isDirty, opts = {}) {
  const {
    message = 'You have unsaved changes. Leave this page and discard them?',
    enabled = true,
  } = opts;

  // Read through a ref so the listeners never need re-binding on every
  // keystroke — `isDirty` flips on the first character typed.
  //
  // Synced in an effect rather than assigned during render: writing a ref
  // mid-render is the anti-pattern react-hooks/refs flags, and it is safe to
  // sync after commit because the listeners only read this when an event
  // fires, which is always after the render that set it.
  const state = useRef({ isDirty, enabled, message });
  useEffect(() => { state.current = { isDirty, enabled, message }; });

  const active = () => state.current.enabled && state.current.isDirty;

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!active()) return undefined;
      e.preventDefault();
      // Modern browsers ignore the custom string; the side-effect of setting
      // returnValue is what triggers the native prompt.
      e.returnValue = '';
      return '';
    };

    const onClickCapture = (e) => {
      if (!active()) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      // Same-document jumps and non-navigating protocols are not exits.
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
      // Another origin is handled by beforeunload, which gives the native
      // prompt — do not stack a second confirm on top of it.
      let url;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;

      if (!window.confirm(state.current.message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!active()) return true;
    return window.confirm(state.current.message);
  }, []);

  return { confirmDiscard };
}
