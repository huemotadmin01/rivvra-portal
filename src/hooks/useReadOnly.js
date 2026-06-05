/**
 * useReadOnly — RETIRED (trial removed).
 *
 * The 14-day trial and its read-only "grace" / "archived" states are gone, so
 * this hook no longer restricts anything. It's kept as a no-op (same API) so
 * the components still importing it keep working; the call sites can be removed
 * in a later cleanup. NOTE: alumni read-only is handled separately via
 * useOrg().isReadOnly — this hook was only ever about trials.
 */
export function useReadOnly() {
  return {
    isReadOnly: false,
    isArchived: false,
    isTrialExpired: false,
    guardAction: (action) => {
      if (typeof action === 'function') action();
      return true;
    },
  };
}

export default useReadOnly;
