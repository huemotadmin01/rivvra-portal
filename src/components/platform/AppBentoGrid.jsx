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
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-[240px] rounded-2xl bg-dark-800/50 animate-pulse" />
          <div className="h-[240px] rounded-2xl bg-dark-800/50 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[160px] rounded-2xl bg-dark-800/50 animate-pulse" />
          ))}
        </div>
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

  // ── Bento: row 1 = featured + secondary (2 cols each), row 2+ = 4-col tile grid ──
  const [featured, secondary, ...rest] = visibleApps;

  return (
    <div className="space-y-4">
      {/* Row 1: featured (2 cols) + secondary (2 cols), equal height via grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        <AppBentoCard app={featured} index={0} variant="featured" badge={badgeFor(featured)} />
        <AppBentoCard app={secondary} index={1} variant="secondary" badge={badgeFor(secondary)} />
      </div>
      {/* Row 2+: 4-col tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {rest.map((app, i) => (
          <AppBentoCard key={app.id} app={app} index={i + 2} variant="tile" badge={badgeFor(app)} />
        ))}
      </div>
    </div>
  );
}

export default AppBentoGrid;
