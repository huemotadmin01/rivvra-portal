import { useMemo } from 'react';
import { getAllApps } from '../../config/apps';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useExtensionDetector } from '../../hooks/useExtensionDetector';
import AppBentoCard from './AppBentoCard';

function AppBentoGrid({ query = '' }) {
  const { user } = useAuth();
  const { hasAppAccess, currentOrg, loading, membership } = useOrg();
  const { installed: extInstalled } = useExtensionDetector();
  const apps = getAllApps(user, membership);

  const visibleApps = useMemo(() => apps.filter((app) => {
    if (app.status === 'coming_soon') return false;
    if (app.id === 'settings') return true;
    if (!currentOrg) return true;
    return hasAppAccess(app.id);
  }), [apps, hasAppAccess, currentOrg]);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleApps;
    return visibleApps.filter((app) => (
      app.name?.toLowerCase().includes(q) ||
      app.description?.toLowerCase().includes(q) ||
      app.category?.toLowerCase().includes(q) ||
      app.id?.toLowerCase().includes(q)
    ));
  }, [visibleApps, query]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:auto-rows-[168px]">
        <div className="lg:col-span-2 lg:row-span-2 rounded-2xl bg-dark-800/50 animate-pulse" />
        <div className="lg:col-span-2 rounded-2xl bg-dark-800/50 animate-pulse" />
        <div className="rounded-2xl bg-dark-800/50 animate-pulse" />
        <div className="rounded-2xl bg-dark-800/50 animate-pulse" />
      </div>
    );
  }

  if (visibleApps.length === 0) return null;

  const badgeFor = (app) => app.id === 'outreach' && !extInstalled ? { label: 'Extension Required' } : null;

  if (query.trim()) {
    if (filteredApps.length === 0) {
      return (
        <div className="rounded-2xl border border-dark-800 bg-dark-900/40 p-12 text-center">
          <p className="text-dark-300 text-base font-medium mb-1">No apps match "{query}"</p>
          <p className="text-dark-500 text-sm">Try a different keyword, or clear the search.</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredApps.map((app, i) => (
          <AppBentoCard key={app.id} app={app} index={i} variant="tile" badge={badgeFor(app)} />
        ))}
      </div>
    );
  }

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

  // ── Bento: featured (2col × 2row, ~352px) + secondary (2col × 1row, 168px) + 2 tiles (168px each) on row 2; rest flow ──
  const [featured, secondary, sideA, sideB, ...rest] = visibleApps;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:auto-rows-[168px]">
      <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2 lg:h-[352px]">
        <AppBentoCard app={featured} index={0} variant="featured" badge={badgeFor(featured)} />
      </div>
      <div className="sm:col-span-2 lg:col-span-2 lg:h-[168px]">
        <AppBentoCard app={secondary} index={1} variant="secondary" badge={badgeFor(secondary)} />
      </div>
      {sideA && <AppBentoCard app={sideA} index={2} variant="tile" badge={badgeFor(sideA)} />}
      {sideB && <AppBentoCard app={sideB} index={3} variant="tile" badge={badgeFor(sideB)} />}
      {rest.map((app, i) => (
        <AppBentoCard key={app.id} app={app} index={i + 4} variant="tile" badge={badgeFor(app)} />
      ))}
    </div>
  );
}

export default AppBentoGrid;
