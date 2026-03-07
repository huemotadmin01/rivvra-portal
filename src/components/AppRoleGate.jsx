import { Outlet, useNavigate } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { usePlatform } from '../context/PlatformContext';
import { Loader2, ShieldAlert, Home } from 'lucide-react';

/**
 * AppRoleGate — Route-level permission gate for app-specific admin pages.
 *
 * Usage in App.jsx:
 *   <Route element={<AppRoleGate appId="employee" requiredRole="admin" />}>
 *     <Route path="/org/:slug/employee/add" element={<EmployeeForm />} />
 *   </Route>
 *
 * Behavior:
 *   - No org context (standalone user) → allow through (backward compat)
 *   - Loading → show spinner
 *   - User has required app role → render child routes via <Outlet />
 *   - Not authorized → show access denied page
 */
function AppRoleGate({ appId, requiredRole = 'admin' }) {
  const { getAppRole, isOrgAdmin, isOrgOwner, loading, currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();

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

  // Org admins/owners always have access
  if (isOrgAdmin || isOrgOwner) {
    return <Outlet />;
  }

  // Check app-specific role
  const userRole = getAppRole(appId);
  if (userRole === requiredRole) {
    return <Outlet />;
  }

  // Not authorized → show access denied
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
        <ShieldAlert className="w-8 h-8 text-amber-400" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">
        Admin Access Required
      </h1>
      <p className="text-dark-400 text-sm max-w-md mb-8 leading-relaxed">
        This page is only available to app admins.
        Contact your organization admin if you need access.
      </p>
      <button
        onClick={() => navigate(orgPath('/home'))}
        className="flex items-center gap-2 px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
      >
        <Home className="w-4 h-4" />
        Go to Home
      </button>
    </div>
  );
}

export default AppRoleGate;
