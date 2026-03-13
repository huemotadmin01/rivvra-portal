// ============================================================================
// OrgContext.jsx — Organization state provider for multi-tenant platform
// ============================================================================
//
// Fetches the current user's org + membership from the backend and provides:
//   - currentOrg: { _id, name, slug, enabledApps }
//   - membership: { orgRole, appAccess }
//   - orgSlug: string (from URL or user's default org)
//   - hasAppAccess(appId): boolean
//   - getAppRole(appId): string | null
//   - isOrgAdmin: boolean (owner or admin org role)
//   - loading: boolean
//
// Usage: Wrap inside PlatformLayout (after auth is confirmed).
//
//   const { currentOrg, hasAppAccess, getAppRole } = useOrg();
//   if (!hasAppAccess('outreach')) return <NoAccess />;
//
// ============================================================================

import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import api from '../utils/api';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const params = useParams();

  // Org slug from URL (for /org/:slug/* routes) or from user's JWT/profile
  const urlSlug = params.slug;
  const userSlug = user?.defaultOrgSlug;

  const [currentOrg, setCurrentOrg] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);
  const lastUserIdRef = useRef(null);

  // Determine effective slug: URL takes precedence, then user's default
  const effectiveSlug = urlSlug || userSlug || null;

  // Fetch org data
  const fetchOrg = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.request('/api/org/by-user/me');

      if (response.success && response.org) {
        setCurrentOrg(response.org);
        setMembership(response.membership);
      } else {
        // User has no org — standalone user
        setCurrentOrg(null);
        setMembership(null);
      }
    } catch (err) {
      console.error('Failed to fetch org context:', err);
      setError(err.message);
      // Don't block the app — just continue without org context
      setCurrentOrg(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch on mount and re-fetch when user changes (e.g., impersonation / Login As)
  // Use email as the identity key — it's always present and unique per user
  const userIdentity = user?.email || user?.id || null;

  useEffect(() => {
    if (user && (!fetchedRef.current || lastUserIdRef.current !== userIdentity)) {
      fetchedRef.current = true;
      lastUserIdRef.current = userIdentity;
      fetchOrg();
    }

    // Reset if user logs out
    if (!user) {
      fetchedRef.current = false;
      lastUserIdRef.current = null;
      setCurrentOrg(null);
      setMembership(null);
      setLoading(false);
    }
  }, [user, userIdentity, fetchOrg]);

  // Helper: check if user has access to a specific app
  const hasAppAccess = useCallback((appId) => {
    if (!membership?.appAccess) return false;
    const access = membership.appAccess[appId];
    return access?.enabled === true;
  }, [membership]);

  // Helper: get user's role within a specific app
  // Priority: org owner/admin → always 'admin'; otherwise use per-app role from appAccess
  const getAppRole = useCallback((appId) => {
    if (!membership?.appAccess) return null;
    const access = membership.appAccess[appId];
    if (!access?.enabled) return null;
    const orgRole = membership.orgRole;
    if (orgRole === 'owner' || orgRole === 'admin') return 'admin';
    // Return per-app role if set (e.g. 'team_lead', 'salesperson'), otherwise 'member'
    return access.role || 'member';
  }, [membership]);

  // Trial state helpers
  const trial = currentOrg?.trial || null;
  const isTrialActive = trial?.status === 'active';
  const isGracePeriod = trial?.status === 'grace';
  const isTrialArchived = trial?.status === 'archived';
  const isReadOnly = trial?.status === 'grace';
  const trialDaysRemaining = trial?.daysRemaining ?? null;

  // Memoize context value
  const value = useMemo(() => ({
    currentOrg,
    membership,
    orgSlug: currentOrg?.slug || effectiveSlug,
    loading,
    error,
    hasAppAccess,
    getAppRole,
    isOrgAdmin: membership?.orgRole === 'owner' || membership?.orgRole === 'admin',
    isOrgOwner: membership?.orgRole === 'owner',
    orgRole: membership?.orgRole || null,
    // Trial state
    trial,
    isTrialActive,
    isGracePeriod,
    isTrialArchived,
    isReadOnly,
    trialDaysRemaining,
    refetchOrg: () => {
      fetchedRef.current = false;
      fetchOrg();
    },
  }), [currentOrg, membership, effectiveSlug, loading, error, hasAppAccess, getAppRole, fetchOrg, trial, isTrialActive, isGracePeriod, isTrialArchived, isReadOnly, trialDaysRemaining]);

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}

export default OrgContext;
