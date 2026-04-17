import { getAllApps } from '../../config/apps';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useExtensionDetector } from '../../hooks/useExtensionDetector';
import AppCard from './AppCard';

function AppGrid() {
  const { user } = useAuth();
  const { hasAppAccess, currentOrg, loading, membership } = useOrg();
  const { installed: extInstalled } = useExtensionDetector();
  const apps = getAllApps(user, membership);

  // While org context is loading, show skeleton placeholders to prevent flash of all apps
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-dark-800/50 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    );
  }

  // Filter apps:
  //   - Remove "coming_soon" apps entirely
  //   - Settings tile is always visible (gated by OrgAdminGate on entry)
  //   - Otherwise the per-user app toggle is the single source of truth —
  //     even org admins/owners must have the toggle on to see the tile.
  //     Admins can enable any app for themselves in user settings.
  const visibleApps = apps.filter((app) => {
    if (app.status === 'coming_soon') return false;
    if (app.id === 'settings') return true;
    if (!currentOrg) return true;
    return hasAppAccess(app.id);
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {visibleApps.map((app, index) => (
        <AppCard
          key={app.id}
          app={app}
          index={index}
          badge={app.id === 'outreach' && !extInstalled ? { label: 'Extension Required' } : null}
        />
      ))}
    </div>
  );
}

export default AppGrid;
