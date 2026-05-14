import { createContext, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getAppByPath, getAllApps, getActiveApps, stripOrgPrefix } from '../config/apps';

const PlatformContext = createContext(null);

export function PlatformProvider({ children }) {
  const location = useLocation();

  const value = useMemo(() => {
    const currentApp = getAppByPath(location.pathname);

    // Extract org slug from URL if present (for path construction)
    const orgMatch = location.pathname.match(/^\/org\/([^/]+)/);
    const orgSlugFromUrl = orgMatch ? orgMatch[1] : null;

    return {
      currentApp,
      allApps: getAllApps(),
      activeApps: getActiveApps(),
      isInApp: !!currentApp,
      // Org prefix for building org-scoped links
      orgSlug: orgSlugFromUrl,
      // Helper: build an org-prefixed path (e.g., "/outreach/dashboard" → "/org/acme/outreach/dashboard")
      orgPath: (path) => orgSlugFromUrl ? `/org/${orgSlugFromUrl}${path}` : path,
    };
  }, [location.pathname]);

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return context;
}
