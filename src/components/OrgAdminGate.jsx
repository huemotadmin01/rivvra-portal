import { Outlet, useNavigate } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { usePlatform } from '../context/PlatformContext';
import { Loader2, ShieldAlert, Home } from 'lucide-react';

/**
 * OrgAdminGate — Route-level permission gate for org admin/owner pages.
 *
 * Usage in App.jsx:
 *   <Route element={<OrgAdminGate />}>
 *     <Route path="/org/:slug/settings/general" element={<SettingsGeneral />} />
 *     <Route path="/org/:slug/settings/users" element={<SettingsTeam />} />
 *   </Route>
 *
 * Behavior:
 *   - No org context (standalone user) → allow through (backward compat)
 *   - Loading → show spinner
 *   - User is org admin or owner → render child routes via <Outlet />
 *   - Not admin → show access denied page
 */
function OrgAdminGate() {
  const { isOrgAdmin, loading, currentOrg } = useOrg();
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

  // User is admin or owner → render child routes
  if (isOrgAdmin) {
    return <Outlet />;
  }

  // Not admin → show access denied
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
        <ShieldAlert className="w-8 h-8 text-amber-400" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">
        Admin Access Required
      </h1>
      <p className="text-dark-400 text-sm max-w-md mb-8 leading-relaxed">
        Settings are only available to organization admins and owners.
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

export default OrgAdminGate;
