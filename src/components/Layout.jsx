import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { ArrowLeftRight, X } from 'lucide-react';

function ImpersonationBanner() {
  const { isImpersonating, user, originalAdmin, stopImpersonating } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 backdrop-blur-sm px-4 py-2 flex items-center justify-center gap-3">
      <ArrowLeftRight className="w-4 h-4 text-dark-950" />
      <span className="text-sm font-medium text-dark-950">
        Viewing as <strong>{user?.name || user?.email}</strong>
        {originalAdmin?.user?.name && (
          <span className="opacity-75"> (logged in as {originalAdmin.user.name})</span>
        )}
      </span>
      <button
        onClick={stopImpersonating}
        className="ml-2 px-3 py-1 bg-dark-950/20 hover:bg-dark-950/30 text-dark-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
      >
        <X className="w-3 h-3" />
        Switch Back
      </button>
    </div>
  );
}

function Layout({ children }) {
  const { isImpersonating } = useAuth();

  return (
    <div className="min-h-screen bg-dark-950">
      <ImpersonationBanner />
      <Sidebar />
      <div className={`ml-64 ${isImpersonating ? 'pt-10' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export default Layout;
