import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BootRing from './BootRing';

function SuperAdminRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      // Same fix as ProtectedRoute: theme tokens, not the legacy dark-* scale.
      // Paints before any shell mounts and outside `.ds-shell`, so the bridge
      // cannot reach it. Amber is kept deliberately — it is the super-admin
      // identity colour and distinguishes /admin from the org app.
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg, #020617)' }}
      >
        <BootRing color="var(--acc-amber, #f59e0b)" />
      </div>
    );
  }

  if (!isAuthenticated || !user?.superAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

export default SuperAdminRoute;
