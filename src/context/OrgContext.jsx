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
import WorkspaceNoAccess from '../components/WorkspaceNoAccess';

const OrgContext = createContext(null);

// Stale-while-revalidate cache: hydrate from localStorage so the app launcher
// renders instantly on revisit while the network refresh runs in the background.
//
// KEYED BY USER **AND** WORKSPACE. It used to be keyed by user alone, which was
// fine while everyone only ever had one workspace — but the slug now selects
// the workspace, so a user in two of them would open /org/b/ and see workspace
// A's name, apps and role painted from cache for the ~1s before the network
// landed. That is precisely the "right data, wrong label" failure this whole
// change exists to remove, so the slug is part of the identity.
const CACHE_KEY = 'rivvra_org_cache_v2';
// v1 was the user-only shape. Drop it on sight rather than migrating: it holds
// no workspace identity, so there is no safe way to decide which slug it was for.
const LEGACY_CACHE_KEY = 'rivvra_org_cache_v1';

function cacheIdentity(userIdentity, slug) {
  return `${userIdentity}::${slug || '(default)'}`;
}

function readCache(userIdentity, slug) {
  if (!userIdentity || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.identity !== cacheIdentity(userIdentity, slug)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(userIdentity, slug, org, membership) {
  if (!userIdentity || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ identity: cacheIdentity(userIdentity, slug), org, membership, savedAt: Date.now() })
    );
  } catch {
    // localStorage full / disabled — silently skip
  }
}

function clearCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch { /* ignore */ }
}

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
  // 2026-05-28 — `membershipVerified` is true only after the live
  // `/api/org/by-user/me` round-trip lands. Cache-hydrated membership is
  // shown for fast first paint but is NOT trusted for privileged UI
  // (e.g. ATS Rate Confirmation bypass). Stale cache rows with
  // orgRole='admin' from prior elevation would otherwise leak admin-only
  // affordances for the ~1s window before silent revalidation.
  const [membershipVerified, setMembershipVerified] = useState(false);
  const fetchedRef = useRef(false);
  const lastUserIdRef = useRef(null);

  // The slug in the path IS the workspace selector. When it is present,
  // `fetchOrg` resolves context through `GET /api/org/:slug/context`, which
  // verifies membership server-side, and `utils/api.js` mirrors it onto every
  // request as `X-Org-Slug` so the ~200 routes that carry no slug in their path
  // scope the same way. `userSlug` is the fallback for the slug-less legacy
  // routes (`/home`, `/outreach/*`), which `OrgRedirect` then canonicalises.
  const effectiveSlug = urlSlug || userSlug || null;

  // Set when the slug named a workspace we can't open: 403 (not a member) or
  // 404 (no such slug). Renders a blocking page instead of the app — see the
  // provider return below for why this is not a redirect.
  const [accessError, setAccessError] = useState(null); // { reason, slug }

  // ── The address bar used to need policing; now it decides ──────────────
  //
  // Until 2026-08-29 the slug was decorative: context came from the token's
  // defaultOrgId, so `/org/<any-slug>/…` rendered your own workspace under
  // whatever name was in the path. A canonical-redirect effect lived here and
  // rewrote the URL to match the org that had loaded, which kept the address
  // bar from lying but could never let you *choose* a workspace.
  //
  // That effect is deliberately GONE. With the slug authoritative it would be
  // actively wrong: on a resolved path `urlSlug` and `currentOrg.slug` are
  // equal by construction, and on a genuine cross-workspace navigation the
  // effect would fight the navigation and bounce the user back. The slug-less
  // legacy routes are still canonicalised — by `OrgRedirect`, which is where
  // that belongs.
  //
  // Still true, and still load-bearing: `/org/:slug/login` and
  // `/org/:slug/invite` mount OUTSIDE OrgProvider (see App.jsx), so switching
  // accounts and accepting another workspace's invite never reach this code.

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

      // The URL picks the workspace when it names one. `/api/org/:slug/context`
      // resolves it server-side and verifies membership (404 unknown slug, 403
      // non-member, alumni still admitted). Slug-less legacy routes fall back to
      // `/api/org/by-user/me`, which resolves the caller's defaultOrgId.
      //
      // Both endpoints return the SAME payload shape (see
      // buildOrgContextPayload in the API's src/org.js) — `uiV2`, `companies`
      // and the full membership all have to be there, or the v2 shell and
      // CompanyContext silently degrade.
      const response = urlSlug
        ? await api.request(`/api/org/${encodeURIComponent(urlSlug)}/context`)
        : await api.request('/api/org/by-user/me');

      const userIdentity = user?.email || user?.id || null;
      setAccessError(null);
      if (response.success && response.org) {
        setCurrentOrg(response.org);
        setMembership(response.membership);
        writeCache(userIdentity, urlSlug, response.org, response.membership);
      } else {
        // User has no org — standalone user
        setCurrentOrg(null);
        setMembership(null);
        writeCache(userIdentity, urlSlug, null, null);
      }
      // Live server response landed — UI gating on `membershipVerified`
      // (privileged actions like ATS RC-gate bypass) can now trust the role.
      setMembershipVerified(true);
    } catch (err) {
      // 403/404 on a slug-resolved fetch is an ANSWER, not a failure: the URL
      // named a workspace this account cannot open. Drop whatever cached org is
      // in state — continuing to render workspace A while the URL says B is the
      // exact defect being fixed — and let the provider render the blocking
      // page below.
      if (urlSlug && (err.status === 403 || err.status === 404)) {
        setCurrentOrg(null);
        setMembership(null);
        setMembershipVerified(true);
        setAccessError({ reason: err.status === 404 ? 'notFound' : 'forbidden', slug: urlSlug });
        clearCache();
      } else {
        console.error('Failed to fetch org context:', err);
        setError(err.message);
        // Keep whatever we have (cached or null) — don't blank out the UI on
        // transient network errors.
      }
    } finally {
      setLoading(false);
    }
  }, [user, urlSlug]);

  // Fetch on mount and re-fetch when user changes (e.g., impersonation / Login As)
  // Use email as the identity key — it's always present and unique per user
  const userIdentity = user?.email || user?.id || null;

  // Refetch on a change of EITHER identity — the user (impersonation / Login As)
  // or the workspace in the URL. The slug half is what makes cross-workspace
  // navigation work at all: without it, moving from /org/a/… to /org/b/… would
  // keep rendering workspace A because the user never changed.
  const contextKey = `${userIdentity}::${urlSlug || '(default)'}`;

  useEffect(() => {
    if (user && (!fetchedRef.current || lastUserIdRef.current !== contextKey)) {
      fetchedRef.current = true;
      const isWorkspaceSwitch = lastUserIdRef.current !== null && lastUserIdRef.current !== contextKey;
      lastUserIdRef.current = contextKey;

      // Hydrate from cache first so the launcher renders immediately. The cache
      // is keyed by user AND slug, so a miss here means we genuinely have
      // nothing to show for THIS workspace.
      const cached = readCache(userIdentity, urlSlug);
      if (cached) {
        setCurrentOrg(cached.org);
        setMembership(cached.membership);
        setAccessError(null);
        setLoading(false);
        // Background revalidation — silent so we don't flicker the cached UI.
        fetchOrg(true);
      } else {
        // Switching workspaces with nothing cached: clear the previous org
        // first. Leaving it in place would paint workspace A's name, apps and
        // role under workspace B's URL for the length of the round-trip.
        if (isWorkspaceSwitch) {
          setCurrentOrg(null);
          setMembership(null);
          setMembershipVerified(false);
          setAccessError(null);
        }
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
      setAccessError(null);
      setLoading(false);
      clearCache();
    }
  }, [user, userIdentity, urlSlug, contextKey, fetchOrg]);

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
      setAccessError(null);
      fetchOrg(false);
    },
  }), [currentOrg, membership, membershipVerified, effectiveSlug, loading, error, hasAppAccess, getAppRole, fetchOrg, alumniPhase, isAlumni, isArchivedAlumni, alumniCutoffAt, alumniDaysRemaining]);

  // The URL named a workspace this account cannot open. Render the answer
  // INSTEAD of the app — not a redirect, and not the app with an error toast.
  // Anything that still mounted underneath would be showing another workspace's
  // data under this workspace's URL, which is the whole defect.
  if (accessError) {
    return (
      <OrgContext.Provider value={value}>
        <WorkspaceNoAccess slug={accessError.slug} reason={accessError.reason} />
      </OrgContext.Provider>
    );
  }

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
