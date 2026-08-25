import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
        {/* Ring only, no "Loading..." text — the text was the V1 spinner's
            signature, and this ring is pixel-matched to the boot splash in
            index.html so splash -> auth -> org reads as ONE loading state. */}
        <div
          className="w-12 h-12 rounded-full animate-spin"
          style={{
            border: '4px solid color-mix(in srgb, var(--brand, #22c55e) 30%, transparent)',
            borderTopColor: 'var(--brand, #22c55e)',
          }}
        />
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
