import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function SuperAdminRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-dark-400">Loading...</p>
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
