// ============================================================================
// CompanyContext.jsx — Multi-company state provider (like Odoo)
// ============================================================================
//
// Provides:
//   - companies: all companies the user has access to
//   - currentCompany: the currently active company
//   - switchCompany(id): change active company
//   - loading: boolean
//
// Usage:
//   const { currentCompany, switchCompany, companies } = useCompany();
//
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from './OrgContext';
import { usePlatform } from './PlatformContext';
import api from '../utils/api';

const CompanyContext = createContext(null);

// Parent paths that don't have a route at the bare segment and need a
// canonical list path instead. e.g. `/org/x/contacts` isn't a route; the
// list lives at `/org/x/contacts/list`.
const DETAIL_PARENT_FALLBACKS = {
  '/contacts': '/contacts/list',
  '/employee': '/employee/directory',
  '/employee/edit': '/employee/directory',
  '/outreach/engage/edit-sequence': '/outreach/engage',
};

// Given a pathname, if it ends in an ObjectId-looking detail segment (with an
// optional trailing `/edit`), return the parent list path. Otherwise null.
// Used when switching companies so users don't land on a 404'd detail page
// that belongs to the previous company scope.
export function stripDetailIdFromPath(pathname) {
  const cleaned = pathname.replace(/\/[a-f0-9]{24}(?:\/edit)?\/?$/i, '');
  if (cleaned === pathname) return null;
  const orgMatch = cleaned.match(/^(\/org\/[^/]+)(\/.*)?$/);
  if (!orgMatch) return cleaned;
  const suffix = orgMatch[2] || '';
  const fallback = DETAIL_PARENT_FALLBACKS[suffix];
  return fallback ? orgMatch[1] + fallback : cleaned;
}

export function CompanyProvider({ children }) {
  const { currentOrg, membership } = useOrg();
  const { orgSlug: platformOrgSlug } = usePlatform();
  const navigate = useNavigate();

  // Use org slug from OrgContext (authoritative) with PlatformContext as fallback
  const orgSlug = currentOrg?.slug || platformOrgSlug;

  const [companies, setCompanies] = useState([]);
  const [currentCompanyId, setCurrentCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  // Derive current company from ID — use string comparison to handle ObjectId serialization
  const currentCompany = useMemo(() => {
    if (!currentCompanyId || companies.length === 0) {
      // Default to first company (the default one)
      return companies[0] || null;
    }
    return companies.find(c => String(c._id) === String(currentCompanyId)) || companies[0] || null;
  }, [currentCompanyId, companies]);

  // Persist currentCompanyId to localStorage for the api.js header
  useEffect(() => {
    const effectiveId = currentCompany?._id || null;
    if (effectiveId) {
      localStorage.setItem('rivvra_current_company', String(effectiveId));
    } else {
      localStorage.removeItem('rivvra_current_company');
    }
  }, [currentCompany]);

  // Fetch companies when org loads
  useEffect(() => {
    if (!orgSlug) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api.request(`/api/org/${orgSlug}/companies`)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setCompanies(res.companies || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [orgSlug]);

  // Initialize currentCompanyId from membership
  useEffect(() => {
    if (membership?.currentCompanyId) {
      setCurrentCompanyId(String(membership.currentCompanyId));
    }
  }, [membership]);

  // Switch company — optimistic SPA-style.
  //
  // Old flow: PUT /my-company → wait for ACK → window.location.reload().
  // The full page reload re-ran the JS bundle, all contexts, and every page
  // fetch, costing 1–3s of dead time after the click.
  //
  // New flow:
  //   1. setCurrentCompanyId() runs immediately. The localStorage useEffect
  //      below this function picks it up in the same tick, so the X-Company-Id
  //      header on the very next fetch already reflects the new company.
  //   2. The orgMiddleware on the API was extended to accept that header as
  //      an override of membership.currentCompanyId (gated by allowedCompanyIds
  //      / admin), so requests fired before the membership PUT lands resolve
  //      under the new company anyway.
  //   3. PlatformLayout's <Outlet> is keyed on currentCompanyId — when the id
  //      changes React unmounts and remounts the routed page, which re-fires
  //      every page-level useEffect and re-fetches data with the new header.
  //   4. The PUT /my-company call still happens, but in the background, just
  //      to persist the user's "preferred current company" for next session.
  //      A failure rolls back the optimistic state.
  //
  // For company-scoped detail pages (/.../<24-hex-id>[/edit]), we navigate to
  // the parent list before remount so the user doesn't sit on a 404.
  const switchCompany = useCallback(async (companyId) => {
    if (!orgSlug || !companyId) return;
    if (String(companyId) === String(currentCompanyId)) return;

    const prevCompanyId = currentCompanyId;
    const newId = String(companyId);

    // (0) IMPORTANT: write to localStorage synchronously, BEFORE any state
    //     update or fetch. api.js reads `rivvra_current_company` at the
    //     moment the request goes out, and the localStorage useEffect at
    //     line 78 only commits AFTER React processes the state update.
    //     If we set state first and then immediately fire a fetch from a
    //     re-running useEffect (e.g. a page that depends on currentCompanyId),
    //     the fetch sees the OLD localStorage and the backend resolves the
    //     request under the previous company — that's the "switch shows
    //     stale data" bug. Writing here removes the race.
    try {
      localStorage.setItem('rivvra_current_company', newId);
    } catch (_) { /* private mode etc. — ignore */ }

    // (1) Instant UI update — dropdown reflects the new company immediately.
    setCurrentCompanyId(newId);

    // (2) If we were on a record-detail page that belongs to the previous
    // company, navigate to the parent list using react-router (no reload).
    const safePath = stripDetailIdFromPath(window.location.pathname);
    if (safePath) {
      navigate(safePath, { replace: true });
    }

    // (3) Persist the switch on the server, with rollback on failure.
    setSwitching(true);
    try {
      const res = await api.request(`/api/org/${orgSlug}/my-company`, {
        method: 'PUT',
        body: JSON.stringify({ companyId: newId }),
      });
      if (!res.success) throw new Error(res.error || 'Switch failed');
    } catch (err) {
      console.error('Failed to switch company:', err);
      // Roll back both the optimistic state AND the localStorage write.
      try {
        if (prevCompanyId) localStorage.setItem('rivvra_current_company', String(prevCompanyId));
        else localStorage.removeItem('rivvra_current_company');
      } catch (_) {}
      setCurrentCompanyId(prevCompanyId);
    } finally {
      setSwitching(false);
    }
  }, [orgSlug, currentCompanyId, navigate]);

  // Refresh companies list (e.g., after CRUD in settings)
  const refreshCompanies = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const res = await api.request(`/api/org/${orgSlug}/companies`);
      if (res.success) setCompanies(res.companies || []);
    } catch {}
  }, [orgSlug]);

  // Derive company country for country-aware forms (India/US/Canada/etc.)
  const companyCountry = useMemo(() => {
    const country = (currentCompany?.address?.country || '').toLowerCase();
    const code = (currentCompany?.address?.countryCode || '').toUpperCase();
    if (country.includes('india') || code === 'IN') return 'IN';
    if (country.includes('united states') || country.includes('usa') || code === 'US') return 'US';
    if (country.includes('canada') || code === 'CA') return 'CA';
    if (country.includes('united kingdom') || code === 'UK' || code === 'GB') return 'GB';
    return code || 'IN'; // default to India
  }, [currentCompany]);

  const value = useMemo(() => ({
    companies,
    currentCompany,
    currentCompanyId: currentCompany?._id || null,
    companyCountry, // 'IN', 'US', 'CA', 'GB', etc.
    switchCompany,
    refreshCompanies,
    loading,
    switching,
    hasMultipleCompanies: companies.length > 1,
  }), [companies, currentCompany, companyCountry, switchCompany, refreshCompanies, loading, switching]);

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be inside CompanyProvider');
  return ctx;
}
