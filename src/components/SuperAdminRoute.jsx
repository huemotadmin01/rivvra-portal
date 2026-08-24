import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full animate-spin"
            style={{
              border: '4px solid color-mix(in srgb, var(--acc-amber, #f59e0b) 30%, transparent)',
              borderTopColor: 'var(--acc-amber, #f59e0b)',
            }}
          />
          <p style={{ color: 'var(--fg-3, #94a3b8)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.superAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

export default SuperAdminRoute;
