import { getAllApps } from '../../config/apps';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useExtensionDetector } from '../../hooks/useExtensionDetector';
import AppBentoCard from './AppBentoCard';

function AppBentoGrid() {
  const { user } = useAuth();
  const { hasAppAccess, currentOrg, loading, membership } = useOrg();
  const { installed: extInstalled } = useExtensionDetector();
  const apps = getAllApps(user, membership);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2 lg:row-span-2 h-[280px] rounded-2xl bg-dark-800/50 animate-pulse" />
        <div className="lg:col-span-2 h-[140px] rounded-2xl bg-dark-800/50 animate-pulse" />
        <div className="h-[140px] rounded-2xl bg-dark-800/50 animate-pulse" />
        <div className="h-[140px] rounded-2xl bg-dark-800/50 animate-pulse" />
      </div>
    );
  }

  const visibleApps = apps.filter((app) => {
    if (app.status === 'coming_soon') return false;
    if (app.id === 'settings') return true;
    if (!currentOrg) return true;
    return hasAppAccess(app.id);
  });

  if (visibleApps.length === 0) return null;

  const badgeFor = (app) =>
    app.id === 'outreach' && !extInstalled ? { label: 'Extension Required' } : null;

  // Bento (featured + secondary + tiles) only when there are enough apps
  // to fill it. Below the threshold, fall back to an even tile grid.
  const BENTO_THRESHOLD = 4;

  if (visibleApps.length < BENTO_THRESHOLD) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleApps.map((app, i) => (
          <AppBentoCard key={app.id} app={app} index={i} variant="tile" badge={badgeFor(app)} />
        ))}
      </div>
    );
  }

  const [featured, secondary, ...rest] = visibleApps;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
        <AppBentoCard app={featured} index={0} variant="featured" badge={badgeFor(featured)} />
      </div>
      <div className="sm:col-span-2 lg:col-span-2">
        <AppBentoCard app={secondary} index={1} variant="secondary" badge={badgeFor(secondary)} />
      </div>
      {rest.map((app, i) => (
        <AppBentoCard key={app.id} app={app} index={i + 2} variant="tile" badge={badgeFor(app)} />
      ))}
    </div>
  );
}

export default AppBentoGrid;
