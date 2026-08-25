import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BootRing from './BootRing';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      // Theme tokens, not the legacy dark-* scale. This paints before any
      // shell mounts and sits OUTSIDE `.ds-shell`, so legacy-bridge.css cannot
      // reach it — hardcoded `bg-dark-950` meant a light-theme user got a
      // near-black screen on every reload while auth resolved. The tokens
      // resolve correctly because index.html now stamps `data-theme` on <html>
      // before React runs; the fallbacks keep this dark if that ever fails.
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg, #020617)' }}
      >
        <BootRing />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Extract slug from URL path: /org/:slug/*
    const pathParts = location.pathname.split('/');
    const orgIndex = pathParts.indexOf('org');
    const slug = orgIndex !== -1 && pathParts.length > orgIndex + 1
      ? pathParts[orgIndex + 1]
      : null;

    if (slug) {
      // Redirect to org-specific login page
      return <Navigate to={`/org/${slug}/login`} state={{ from: location }} replace />;
    }

    // Fallback: find workspace
    return <Navigate to="/find-workspace" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
