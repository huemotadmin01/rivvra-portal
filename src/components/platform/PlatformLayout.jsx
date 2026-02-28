import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { TimesheetProvider } from '../../context/TimesheetContext';
import TopBar from './TopBar';
import AppSidebar from './AppSidebar';
import TrialBanner from './TrialBanner';
import { ArrowLeftRight, X } from 'lucide-react';

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
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <TimesheetProvider>
      <div className={`min-h-screen bg-dark-950 ${isImpersonating ? 'pt-10' : ''}`}>
        <ImpersonationBanner />
        <TopBar onToggleSidebar={() => setSidebarOpen(prev => !prev)} sidebarOpen={sidebarOpen} />
        <TrialBanner />
        <div className="flex">
          <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className={`flex-1 min-w-0 min-h-[calc(100vh-3.5rem)] ${currentApp ? 'md:ml-64' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </TimesheetProvider>
  );
}

export default PlatformLayout;
