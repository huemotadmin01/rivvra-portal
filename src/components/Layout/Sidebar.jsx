import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, CalendarDays, CheckSquare, Users, FolderKanban,
  Building2, Download, IndianRupee, Settings, X
} from 'lucide-react';

const navItems = {
  contractor: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/timesheet', label: 'My Timesheet', icon: CalendarDays },
    { to: '/earnings', label: 'My Earnings', icon: IndianRupee },
  ],
  manager: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  ],
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/approvals', label: 'Approvals', icon: CheckSquare },
    { to: '/users', label: 'Users', icon: Users },
    { to: '/projects', label: 'Projects & Clients', icon: FolderKanban },
    { to: '/exports', label: 'Export Data', icon: Download },
    { to: '/payroll-settings', label: 'Payroll Settings', icon: Settings },
  ],
};

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const items = navItems[user?.role] || [];

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-primary text-white transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h1 className="text-lg font-bold">Huemot</h1>
            <p className="text-xs text-white/60">Timesheet Portal</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
