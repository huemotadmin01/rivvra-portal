import { useOrg } from '../context/OrgContext';

/**
 * Hook for trial read-only enforcement in UI.
 * Returns isReadOnly flag and a guardAction wrapper.
 * Usage:
 *   const { isReadOnly } = useReadOnly();
 *   <button disabled={isReadOnly}>Create</button>
 */
export function useReadOnly() {
  const { currentOrg } = useOrg();

  const trial = currentOrg?.trial;
  const isReadOnly = trial?.status === 'grace';
  const isArchived = trial?.status === 'archived';
  const isTrialExpired = isReadOnly || isArchived;

  return {
    isReadOnly,
    isArchived,
    isTrialExpired,
    /**
     * Guard a write action — returns false and shows message if read-only.
     * @param {Function} action - The action to execute if not read-only
     * @returns {boolean} - true if action executed, false if blocked
     */
    guardAction: (action) => {
      if (isReadOnly || isArchived) {
        // Could integrate with a toast system later
        console.warn('Action blocked: organization is in read-only mode (trial expired)');
        return false;
      }
      if (typeof action === 'function') action();
      return true;
    },
  };
}

export default useReadOnly;
