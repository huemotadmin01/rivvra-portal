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
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import api from '../utils/api';

const OrgContext = createContext(null);

// Stale-while-revalidate cache: hydrate from localStorage so the app launcher
// renders instantly on revisit while the network refresh runs in the background.
const CACHE_KEY = 'rivvra_org_cache_v1';

function readCache(userIdentity) {
  if (!userIdentity || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userIdentity !== userIdentity) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(userIdentity, org, membership) {
  if (!userIdentity || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ userIdentity, org, membership, savedAt: Date.now() })
    );
  } catch {
    // localStorage full / disabled — silently skip
  }
}

function clearCache() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Org slug from URL (for /org/:slug/* routes) or from user's JWT/profile
  const urlSlug = params.slug;
  const userSlug = user?.defaultOrgSlug;

  const [currentOrg, setCurrentOrg] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 2026-05-28 — `membershipVerified` is true only after the live
  // `/api/org/by-user/me` round-trip lands. Cache-hydrated membership is
  // shown for fast first paint but is NOT trusted for privileged UI
  // (e.g. ATS Rate Confirmation bypass). Stale cache rows with
  // orgRole='admin' from prior elevation would otherwise leak admin-only
  // affordances for the ~1s window before silent revalidation.
  const [membershipVerified, setMembershipVerified] = useState(false);
  const fetchedRef = useRef(false);
  const lastUserIdRef = useRef(null);

  // The slug in the path does NOT choose the workspace. `fetchOrg` below calls
  // `/api/org/by-user/me`, which takes no slug and resolves `defaultOrgId`, and
  // the API scopes every request the same way (`helpers/orgHelper.getOrgId`).
  // So `effectiveSlug` is a display fallback, not a selector — the old comment
  // here claimed "URL takes precedence", which was never true.
  const effectiveSlug = urlSlug || userSlug || null;

  // ── Keep the address bar honest ────────────────────────────────────────
  // Because the slug is ignored, `/org/<any-slug>/…` renders the user's own
  // workspace under whatever name is in the path. That is not a data leak —
  // you only ever receive your own org — but the URL asserts a workspace the
  // page is not showing, and bookmarks and shared links inherit the lie.
  //
  // It bit hard during the 2026-08-28 QA pass: the path read
  // `/org/huemot-technology-private-limited/…` while the session was the REAL
  // org, and because both orgs carry the same `name`, nothing on screen
  // contradicted it. A write nearly landed in the live business.
  //
  // So rewrite the path to the org actually loaded. This does not add
  // multi-workspace routing (that needs the API to scope by slug — a separate
  // piece of work); it makes the mismatch impossible to sit in.
  //
  // Safe to live here: `/org/:slug/login` and `/org/:slug/invite` are mounted
  // OUTSIDE OrgProvider (see App.jsx), so switching accounts and accepting an
  // invite for another workspace are untouched. Guarded on `loading` so a
  // transient null never bounces anyone, and `replace` keeps Back working.
  useEffect(() => {
    if (loading || !urlSlug || !currentOrg?.slug || urlSlug === currentOrg.slug) return;

    // Rebuild from segments rather than string-replacing, so a slug that also
    // appears later in the path (an id, a filter value) cannot be rewritten.
    const segments = location.pathname.split('/');
    if (segments[1] !== 'org' || segments[2] !== urlSlug) return;
    segments[2] = currentOrg.slug;

    navigate(segments.join('/') + location.search + location.hash, { replace: true });
  }, [loading, urlSlug, currentOrg?.slug, location.pathname, location.search, location.hash, navigate]);

  // Fetch org data. `silent` skips the loading flag so a background refresh
  // doesn't blank out cached UI.
  const fetchOrg = useCallback(async (silent = false) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await api.request('/api/org/by-user/me');

      const userIdentity = user?.email || user?.id || null;
      if (response.success && response.org) {
        setCurrentOrg(response.org);
        setMembership(response.membership);
        writeCache(userIdentity, response.org, response.membership);
      } else {
        // User has no org — standalone user
        setCurrentOrg(null);
        setMembership(null);
        writeCache(userIdentity, null, null);
      }
      // Live server response landed — UI gating on `membershipVerified`
      // (privileged actions like ATS RC-gate bypass) can now trust the role.
      setMembershipVerified(true);
    } catch (err) {
      console.error('Failed to fetch org context:', err);
      setError(err.message);
      // Keep whatever we have (cached or null) — don't blank out the UI on
      // transient network errors.
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

      // Hydrate from cache first so the launcher renders immediately.
      const cached = readCache(userIdentity);
      if (cached) {
        setCurrentOrg(cached.org);
        setMembership(cached.membership);
        setLoading(false);
        // Background revalidation — silent so we don't flicker the cached UI.
        fetchOrg(true);
      } else {
        fetchOrg(false);
      }
    }

    // Reset if user logs out
    if (!user) {
      fetchedRef.current = false;
      lastUserIdRef.current = null;
      setCurrentOrg(null);
      setMembership(null);
      setMembershipVerified(false);
      setLoading(false);
      clearCache();
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

  // Alumni state helpers (read-only post-separation access window)
  const alumniPhase = membership?.alumniPhase || 'active';
  const isAlumni = alumniPhase === 'a' || alumniPhase === 'b';
  const isArchivedAlumni = alumniPhase === 'archived';
  const alumniCutoffAt = membership?.alumniCutoffAt ? new Date(membership.alumniCutoffAt) : null;
  const alumniDaysRemaining = alumniCutoffAt
    ? Math.max(0, Math.ceil((alumniCutoffAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

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
    // Use for privileged UI that must not trust cache-hydrated roles. See
    // membershipVerified state declaration for the rationale.
    membershipVerified,
    // Read-only access: alumni in their post-separation grace window.
    // (The 14-day trial read-only state was removed.)
    isReadOnly: isAlumni,
    // Alumni state
    alumniPhase,
    isAlumni,
    isArchivedAlumni,
    alumniCutoffAt,
    alumniDaysRemaining,
    refetchOrg: () => {
      fetchedRef.current = false;
      fetchOrg(false);
    },
  }), [currentOrg, membership, membershipVerified, effectiveSlug, loading, error, hasAppAccess, getAppRole, fetchOrg, alumniPhase, isAlumni, isArchivedAlumni, alumniCutoffAt, alumniDaysRemaining]);

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
