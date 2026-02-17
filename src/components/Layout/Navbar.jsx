import { useAuth } from '../../hooks/useAuth';
import { Menu, LogOut, User } from 'lucide-react';

export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden text-gray-600 hover:text-gray-900">
          <Menu size={22} />
        </button>
        <h2 className="text-lg font-semibold text-primary hidden sm:block">Huemot Timesheet Portal</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
        </div>
        <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white text-sm font-medium">
          {user?.fullName?.charAt(0) || <User size={16} />}
        </div>
        <button
          onClick={logout}
          className="text-gray-500 hover:text-red-500 transition-colors"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
