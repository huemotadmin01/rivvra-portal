import { getAllApps } from '../../config/apps';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import AppCard from './AppCard';

function AppGrid() {
  const { user } = useAuth();
  const { hasAppAccess, currentOrg, isOrgAdmin, isOrgOwner, loading, membership } = useOrg();
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
  // 1. Remove "coming_soon" apps entirely
  // 2. For non-admins, hide apps they don't have access to (instead of showing locked)
  const visibleApps = apps.filter((app) => {
    // Never show coming_soon apps
    if (app.status === 'coming_soon') return false;
    // Settings is always visible
    if (app.id === 'settings') return true;
    // No org context = show all active apps
    if (!currentOrg) return true;
    // Admins/owners see all active apps (even ones they haven't enabled yet)
    if (isOrgAdmin || isOrgOwner) return true;
    // Non-admins only see apps they have access to
    return hasAppAccess(app.id);
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {visibleApps.map((app, index) => (
        <AppCard key={app.id} app={app} index={index} />
      ))}
    </div>
  );
}

export default AppGrid;
