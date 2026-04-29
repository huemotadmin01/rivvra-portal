import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { TimesheetProvider } from '../../context/TimesheetContext';
import { BreadcrumbProvider } from '../../context/BreadcrumbContext';
import { PeriodProvider } from '../../context/PeriodContext';
import TopBar from './TopBar';
import AppSidebar from './AppSidebar';
import TrialBanner from './TrialBanner';
import AlumniBanner from './AlumniBanner';
import Breadcrumbs from './Breadcrumbs';
import { ArrowLeftRight, X, Loader2 } from 'lucide-react';

function ImpersonationBanner() {
  const { isImpersonating, user, originalAdmin, stopImpersonating } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 backdrop-blur-sm px-4 py-2 flex items-center justify-center gap-3">
      <ArrowLeftRight className="w-4 h-4 text-dark-950" />
      <span className="text-sm font-medium text-dark-950">
        Viewing as <strong>{user?.name || user?.email}</strong>
        {originalAdmin?.user?.name && (
          <span className="opacity-75"> (logged in as {originalAdmin.user.name})</span>
        )}
      </span>
      <button
        onClick={stopImpersonating}
        className="ml-2 px-3 py-1 bg-dark-950/20 hover:bg-dark-950/30 text-dark-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
      >
        <X className="w-3 h-3" />
        Switch Back
      </button>
    </div>
  );
}

function PlatformLayout() {
  const { isImpersonating } = useAuth();
  const { currentApp } = usePlatform();
  const { currentCompanyId, hydrated } = useCompany();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Full-screen focused pages — hide sidebar for distraction-free experience.
  // Knowledge Base has its own in-content category nav, so the app sidebar is redundant.
  const isFullScreenPage = location.pathname.includes('/employee/onboarding');
  const isKnowledgeBase = currentApp?.id === 'knowledgeBase';
  const showSidebar = currentApp && !isFullScreenPage && !isKnowledgeBase;

  return (
    <TimesheetProvider>
      <BreadcrumbProvider>
        <PeriodProvider>
        <div className={`min-h-screen bg-dark-950 ${isImpersonating ? 'pt-10' : ''}`}>
          <ImpersonationBanner />
          <TopBar onToggleSidebar={() => setSidebarOpen(prev => !prev)} sidebarOpen={sidebarOpen} />
          <div className="flex">
            {showSidebar && <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
            <main className={`flex-1 min-w-0 min-h-[calc(100vh-3.5rem)] ${showSidebar ? 'md:ml-64' : ''}`}>
              <TrialBanner />
              <AlumniBanner />
              {!isFullScreenPage && <Breadcrumbs />}
              {/* Hold rendering of company-scoped pages until CompanyContext
                  has hydrated — i.e. OrgContext has settled and the
                  authoritative membership.currentCompanyId has been written
                  to localStorage. Without this gate, page-level useEffects
                  fire on first render reading whatever stale value is in
                  localStorage from a prior session, causing a brief flash of
                  wrong-company data and a wasted refetch when hydration
                  catches up. The spinner is sub-second on cache hits.

                  Key the Outlet on the active company so any company switch
                  triggers a clean remount of the routed page. This re-fires
                  every page-level useEffect (including those that only depend
                  on [orgSlug] and would otherwise see stale data after a
                  switch), without paying the cost of a full page reload. */}
              {hydrated ? (
                <div key={`co-${currentCompanyId || 'none'}`}>
                  <Outlet />
                </div>
              ) : (
                <div className="flex items-center justify-center py-32" aria-label="Loading workspace">
                  <Loader2 className="w-6 h-6 animate-spin text-rivvra-500" />
                </div>
              )}
            </main>
          </div>
        </div>
      </PeriodProvider>
      </BreadcrumbProvider>
    </TimesheetProvider>
  );
}

export default PlatformLayout;
