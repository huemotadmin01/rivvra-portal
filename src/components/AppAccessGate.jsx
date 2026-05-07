import { Outlet } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { Loader2 } from 'lucide-react';
import NoAccessPage from '../pages/NoAccessPage';

/**
 * AppAccessGate — Route-level permission gate for app access.
 *
 * Usage in App.jsx:
 *   <Route element={<AppAccessGate appId="outreach" />}>
 *     <Route path="/org/:slug/outreach/dashboard" element={<DashboardPage />} />
 *   </Route>
 *
 * Behavior:
 *   - No org context (standalone user) → allow through (backward compat)
 *   - Loading → show spinner
 *   - User has access → render child routes via <Outlet />
 *   - No access → show NoAccessPage
 */
function AppAccessGate({ appId }) {
  const { hasAppAccess, loading, currentOrg } = useOrg();

  // No org context (standalone user) → allow through for backward compat
  if (!currentOrg && !loading) {
    return <Outlet />;
  }

  // Still loading org context → show spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  // User has access → render child routes
  if (hasAppAccess(appId)) {
    return <Outlet />;
  }

  // No access → show NoAccessPage
  return <NoAccessPage appId={appId} />;
}

export default AppAccessGate;
