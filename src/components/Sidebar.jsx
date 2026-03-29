import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Home, Send, Users, List, Settings, LogOut,
  ChevronRight, ChevronDown, BarChart3, UsersRound, Layers
} from 'lucide-react';
import RivvraLogo from './RivvraLogo';
import ComingSoonModal from './ComingSoonModal';

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isImpersonating } = useAuth();
  const [showWipModal, setShowWipModal] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'team_lead';

  // Collapsible groups — start expanded
  const [contactsExpanded, setContactsExpanded] = useState(true);
  const [listsExpanded, setListsExpanded] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/find-workspace');
  };

  const isActive = (path) => location.pathname === path;

  // Keep groups expanded if any child is active
  const contactsPaths = ['/leads', '/team-contacts'];
  const listsPaths = ['/lists', '/team-lists'];
  const isContactsGroupActive = contactsPaths.some(p => isActive(p));
  const isListsGroupActive = listsPaths.some(p => isActive(p));

  // Top-level standalone items
  const topItems = [
    { path: '/dashboard', label: 'Home', icon: Home },
    { path: '/engage', label: 'Engage', icon: Send },
  ];

  // Bottom standalone items (admin only)
  const bottomItems = isAdmin
    ? [{ path: '/team-dashboard', label: 'Team Dashboard', icon: BarChart3 }]
    : [];

  return (
    <aside className={`w-64 bg-dark-900 border-r border-dark-800 flex flex-col fixed left-0 z-40 ${
      isImpersonating ? 'top-10 h-[calc(100vh-2.5rem)]' : 'top-0 h-screen'
    }`}>
      {/* Logo */}
      <div className="p-4 border-b border-dark-800 shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-dark-800 flex items-center justify-center">
            <RivvraLogo className="w-6 h-6" />
          </div>
          <span className="text-lg font-bold text-white">Rivvra</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto min-h-0">
        {/* Top standalone items */}
        {topItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive(item.path)
                ? 'bg-rivvra-500/10 text-rivvra-400'
                : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="flex-1">{item.label}</span>
            {isActive(item.path) && <ChevronRight className="w-4 h-4" />}
          </Link>
        ))}

        {/* All Contacts Group */}
        <div className="pt-2">
          <button
            onClick={() => setContactsExpanded(!contactsExpanded)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left ${
              isContactsGroupActive
                ? 'text-rivvra-400'
                : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="flex-1 text-sm font-semibold uppercase tracking-wider">Contacts</span>
            {(contactsExpanded || isContactsGroupActive) ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {(contactsExpanded || isContactsGroupActive) && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-dark-800 pl-3">
              <Link
                to="/leads"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm ${
                  isActive('/leads')
                    ? 'bg-rivvra-500/10 text-rivvra-400'
                    : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="flex-1">My Contacts</span>
                {isActive('/leads') && <ChevronRight className="w-3.5 h-3.5" />}
              </Link>
              {isAdmin && (
                <Link
                  to="/team-contacts"
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm ${
                    isActive('/team-contacts')
                      ? 'bg-rivvra-500/10 text-rivvra-400'
                      : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                  }`}
                >
                  <UsersRound className="w-4 h-4" />
                  <span className="flex-1">Team Contacts</span>
                  {isActive('/team-contacts') && <ChevronRight className="w-3.5 h-3.5" />}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* All Lists Group */}
        <div className="pt-1">
          <button
            onClick={() => setListsExpanded(!listsExpanded)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left ${
              isListsGroupActive
                ? 'text-rivvra-400'
                : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span className="flex-1 text-sm font-semibold uppercase tracking-wider">Lists</span>
            {(listsExpanded || isListsGroupActive) ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {(listsExpanded || isListsGroupActive) && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-dark-800 pl-3">
              <Link
                to="/lists"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm ${
                  isActive('/lists')
                    ? 'bg-rivvra-500/10 text-rivvra-400'
                    : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                }`}
              >
                <List className="w-4 h-4" />
                <span className="flex-1">My Lists</span>
                {isActive('/lists') && <ChevronRight className="w-3.5 h-3.5" />}
              </Link>
              <Link
                to="/team-lists"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm ${
                  isActive('/team-lists')
                    ? 'bg-rivvra-500/10 text-rivvra-400'
                    : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span className="flex-1">Team Lists</span>
                {isActive('/team-lists') && <ChevronRight className="w-3.5 h-3.5" />}
              </Link>
            </div>
          )}
        </div>

        {/* Bottom standalone items */}
        {bottomItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive(item.path)
                ? 'bg-rivvra-500/10 text-rivvra-400'
                : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="flex-1">{item.label}</span>
            {isActive(item.path) && <ChevronRight className="w-4 h-4" />}
          </Link>
        ))}
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t border-dark-800 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          {user?.picture ? (
            <img src={user.picture} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
              <span className="text-sm font-bold text-dark-950">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-dark-400 truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/settings"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors text-sm"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      <ComingSoonModal
        isOpen={showWipModal}
        onClose={() => setShowWipModal(false)}
        feature="Pro Plan"
      />
    </aside>
  );
}

export default Sidebar;
