// ============================================================================
// PolicyAckContext — pending company-policy acknowledgments for the caller
// ============================================================================
// One lightweight shared fetch of /policies/mine so both the home-page banner
// and the TopBar badge can show "N policies awaiting acknowledgment" without
// double-fetching. Fails silent (count 0) — this is a non-critical nudge.
// Re-fetches when the active company changes (policies are company-scoped).
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useOrg } from './OrgContext';
import { useCompany } from './CompanyContext';
import { api } from '../utils/api';

const PolicyAckContext = createContext({ pendingCount: 0, pending: [], refresh: () => {} });

// Plain async helper (not a hook) — returns the policies needing acknowledgment.
// Never throws: a failed nudge should not surface to the user.
async function fetchPendingPolicies(orgSlug) {
  try {
    const res = await api.request(`/api/org/${orgSlug}/policies/mine`);
    return (res.policies || []).filter((p) => p.actionRequired);
  } catch {
    return [];
  }
}

export function PolicyAckProvider({ children }) {
  const { orgSlug } = useOrg();
  const { hydrated, currentCompanyId } = useCompany();
  const [pending, setPending] = useState([]);

  // Manual refresh (e.g. after an employee acknowledges on the policies page).
  const refresh = useCallback(async () => {
    if (!orgSlug || !hydrated) return;
    setPending(await fetchPendingPolicies(orgSlug));
  }, [orgSlug, hydrated]);

  // Initial load + whenever the active company changes. setState happens after
  // the await (async), so it doesn't trigger cascading renders.
  useEffect(() => {
    if (!orgSlug || !hydrated) return undefined;
    let ignore = false;
    (async () => {
      const items = await fetchPendingPolicies(orgSlug);
      if (!ignore) setPending(items);
    })();
    return () => { ignore = true; };
  }, [orgSlug, hydrated, currentCompanyId]);

  return (
    <PolicyAckContext.Provider value={{ pendingCount: pending.length, pending, refresh }}>
      {children}
    </PolicyAckContext.Provider>
  );
}

export function usePolicyAck() {
  return useContext(PolicyAckContext);
}
