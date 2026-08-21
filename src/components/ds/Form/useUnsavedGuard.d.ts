export interface UnsavedGuardOptions {
  /** Text for the in-app confirm. The browser's own unload prompt ignores it. */
  message?: string;
  /** Master switch. Pass `false` while saving, so the form's own submit
   *  navigation is not challenged by the guard it just satisfied. */
  enabled?: boolean;
}

export interface UnsavedGuard {
  /** Call before a PROGRAMMATIC exit (Cancel button, `navigate()`).
   *  Returns true when it is safe to proceed. */
  confirmDiscard: () => boolean;
}

/**
 * Warn before abandoning a dirty form.
 *
 * Covers `beforeunload` (tab close, refresh, other-origin) and capture-phase
 * clicks on in-app links. Does NOT cover the browser Back button — see the
 * .js for why `useBlocker` is unavailable in this app and why faking a block
 * on `popstate` is worse than the problem.
 */
export declare function useUnsavedGuard(isDirty: boolean, opts?: UnsavedGuardOptions): UnsavedGuard;
