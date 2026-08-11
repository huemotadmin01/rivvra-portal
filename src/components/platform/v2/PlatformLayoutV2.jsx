import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { usePlatform } from '../../../context/PlatformContext';
import { useCompany } from '../../../context/CompanyContext';
import { TimesheetProvider } from '../../../context/TimesheetContext';
import { BreadcrumbProvider } from '../../../context/BreadcrumbContext';
import { PeriodProvider } from '../../../context/PeriodContext';
import SidebarV2 from './SidebarV2';
import AppBarV2 from './AppBarV2';
import AlumniBanner from '../AlumniBanner';
import SampleDataBanner from '../../SampleDataBanner';
import UsageWarningBanner from '../../UsageWarningBanner';
import AnnouncementBanner from '../AnnouncementBanner';
import { ArrowLeftRight, X, Loader2 } from 'lucide-react';
import './shell.css';

/* v2 shell (Slice 1) — prototype shell.jsx composition, same providers,
   banners and Outlet gating as the legacy PlatformLayout. Renders only
   when the org's uiV2 flag is on (see ShellSwitch in App.jsx). */

function ImpersonationBannerV2() {
  const { isImpersonating, user, originalAdmin, stopImpersonating } = useAuth();
  if (!isImpersonating) return null;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50, height: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'var(--warn)', color: '#1C1914', font: '500 13px/1 var(--font)',
    }}>
      <ArrowLeftRight style={{ width: 14, height: 14 }} />
      <span>
        Viewing as <strong>{user?.name || user?.email}</strong>
        {originalAdmin?.user?.name && <span style={{ opacity: 0.75 }}> (logged in as {originalAdmin.user.name})</span>}
      </span>
      <button onClick={stopImpersonating} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        borderRadius: 'var(--r-1)', background: 'rgba(0,0,0,.18)', font: '600 11.5px/1 var(--font)',
      }}>
        <X style={{ width: 12, height: 12 }} /> Switch back
      </button>
    </div>
  );
}

// Same per-app collapse persistence as the legacy shell — shared keys,
// so a user's preference carries across the flag flip.
const SIDEBAR_COLLAPSED_KEY_PREFIX = 'rivvra:sidebar-collapsed:';
const APPS_DEFAULT_COLLAPSED = new Set(['ats']);
const storageKeyForApp = (appId) => `${SIDEBAR_COLLAPSED_KEY_PREFIX}${appId || 'default'}`;
const defaultCollapsedFor = (appId) => APPS_DEFAULT_COLLAPSED.has(appId);

function PlatformLayoutV2() {
  const { currentApp } = usePlatform();
  const { currentCompanyId, hydrated } = useCompany();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => defaultCollapsedFor(currentApp?.id));

  useEffect(() => {
    const appId = currentApp?.id;
    try {
      const stored = localStorage.getItem(storageKeyForApp(appId));
      if (stored === 'true') setCollapsed(true);
      else if (stored === 'false') setCollapsed(false);
      else setCollapsed(defaultCollapsedFor(appId));
    } catch (_) {
      setCollapsed(defaultCollapsedFor(appId));
    }
  }, [currentApp?.id]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKeyForApp(currentApp?.id), String(next)); } catch (_) {}
      return next;
    });
  };

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isFullScreenPage = location.pathname.includes('/employee/onboarding');
  const isKnowledgeBase = currentApp?.id === 'knowledgeBase';
  const showSidebar = currentApp && !isFullScreenPage && !isKnowledgeBase;

  return (
    <TimesheetProvider>
      <BreadcrumbProvider>
        <PeriodProvider>
          <div className="ds-shell">
            {showSidebar && (
              <SidebarV2
                mobileOpen={mobileOpen}
                onCloseMobile={() => setMobileOpen(false)}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
              />
            )}
            <div className="main">
              <ImpersonationBannerV2 />
              <AppBarV2 onMenu={() => setMobileOpen((o) => !o)} />
              <AlumniBanner />
              <SampleDataBanner />
              <UsageWarningBanner />
              <AnnouncementBanner />
              <div className="page">
                <div className="page-inner">
                  {/* Same hydration gate + company-keyed remount as the
                      legacy shell — see PlatformLayout.jsx for the why. */}
                  {hydrated ? (
                    <div key={`co-${currentCompanyId || 'none'}`}>
                      <Outlet />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '128px 0' }} aria-label="Loading workspace">
                      <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: 'var(--brand)' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </PeriodProvider>
      </BreadcrumbProvider>
    </TimesheetProvider>
  );
}

export default PlatformLayoutV2;
