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
import { useOrg } from './OrgContext';
import { usePlatform } from './PlatformContext';
import api from '../utils/api';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const { currentOrg, membership } = useOrg();
  const { orgSlug: platformOrgSlug } = usePlatform();

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

  // Switch company
  const switchCompany = useCallback(async (companyId) => {
    if (!orgSlug || !companyId) {
      console.warn('switchCompany: missing orgSlug or companyId', { orgSlug, companyId });
      return;
    }

    setSwitching(true);
    try {
      const res = await api.request(`/api/org/${orgSlug}/my-company`, {
        method: 'PUT',
        body: JSON.stringify({ companyId: String(companyId) }),
      });

      if (res.success) {
        setCurrentCompanyId(String(companyId));
        // Force page reload to refetch all data with new company context
        window.location.reload();
      } else {
        console.error('switchCompany: API returned failure', res);
        setSwitching(false);
      }
    } catch (err) {
      console.error('Failed to switch company:', err);
      setSwitching(false);
    }
  }, [orgSlug]);

  // Refresh companies list (e.g., after CRUD in settings)
  const refreshCompanies = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const res = await api.request(`/api/org/${orgSlug}/companies`);
      if (res.success) setCompanies(res.companies || []);
    } catch {}
  }, [orgSlug]);

  const value = useMemo(() => ({
    companies,
    currentCompany,
    currentCompanyId: currentCompany?._id || null,
    switchCompany,
    refreshCompanies,
    loading,
    switching,
    hasMultipleCompanies: companies.length > 1,
  }), [companies, currentCompany, switchCompany, refreshCompanies, loading, switching]);

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
