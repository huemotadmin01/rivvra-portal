import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, LogOut } from 'lucide-react';
import RivvraLogo from '../RivvraLogo';
import AdminSidebar from './AdminSidebar';

function AdminTopBar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="h-14 border-b border-dark-800/50 bg-dark-950/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left: Logo + Admin Badge */}
        <div className="flex items-center gap-4">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center">
              <RivvraLogo className="w-5 h-5" />
            </div>
            <span className="text-base font-bold text-white">Rivvra</span>
          </Link>

          <div className="w-px h-5 bg-dark-700" />
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Admin</span>
          </div>
        </div>

        {/* Right: Back to portal + User info */}
        <div className="flex items-center gap-3">
          <Link
            to="/home"
            className="text-xs text-dark-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-dark-800/50"
          >
            Back to Portal
          </Link>
          <div className="w-px h-5 bg-dark-700" />
          <span className="text-sm text-dark-400">{user?.email}</span>
        </div>
      </div>
    </header>
  );
}

function AdminLayout() {
  return (
    <div className="min-h-screen bg-dark-950">
      <AdminTopBar />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 ml-64 min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
