import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rivvra-500/30 border-t-rivvra-500 rounded-full animate-spin" />
          <p className="text-dark-400">Loading...</p>
        </div>
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

    // Fallback: generic login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
