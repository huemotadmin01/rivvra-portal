import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useOrg } from '../../context/OrgContext';
import { stripOrgPrefix } from '../../config/apps';
import {
  ChevronRight, ChevronDown, LogOut, Building2
} from 'lucide-react';
import ComingSoonModal from '../ComingSoonModal';

function AppSidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isImpersonating } = useAuth();
  const { currentApp, orgPath, orgSlug } = usePlatform();
  const { timesheetUser } = useTimesheetContext();
  const { hasAppAccess, getAppRole, currentOrg } = useOrg();
  const [showWipModal, setShowWipModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  if (!currentApp) return null;

  // If user doesn't have access to this app, don't render sidebar
  // (AppAccessGate will show NoAccessPage instead of the app content)
  if (currentOrg && currentApp.id !== 'settings' && !hasAppAccess(currentApp.id)) {
    return null;
  }

  // Pass org membership role so apps can use it as source of truth
  const orgAppRole = currentApp?.id && currentOrg ? getAppRole(currentApp.id) : null;
  const sidebarItems = currentApp.getSidebarItems(user, timesheetUser, orgAppRole);

  // Use stripOrgPrefix for active matching so /org/slug/outreach/dashboard matches /outreach/dashboard
  const currentPath = stripOrgPrefix(location.pathname);
  const isActive = (path) => currentPath === path;

  const toggleGroup = (label) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isGroupExpanded = (group) => {
    // Expanded by default, or if any child is active
    const hasActiveChild = group.children.some(child => isActive(child.path));
    if (hasActiveChild) return true;
    if (expandedGroups[group.label] === undefined) return true; // default expanded
    return expandedGroups[group.label];
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Get org name from user for display (we can enhance this later with OrgContext)
  const orgName = user?.defaultOrgSlug
    ? user.defaultOrgSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-dark-950/60 backdrop-blur-sm z-30 md:hidden" onClick={onClose} />
      )}
      <aside className={`w-64 bg-dark-900 border-r border-dark-800 flex flex-col fixed left-0 z-30
        ${isImpersonating ? 'top-24' : 'top-14'}
        ${isImpersonating ? 'h-[calc(100vh-6rem)]' : 'h-[calc(100vh-3.5rem)]'}
        transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto min-h-0">
        {sidebarItems.map((item, idx) => {
          if (item.type === 'group') {
            const expanded = isGroupExpanded(item);
            const hasActiveChild = item.children.some(child => isActive(child.path));
            return (
              <div key={item.label} className={idx > 0 ? 'pt-2' : ''}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left ${
                    hasActiveChild
                      ? 'text-rivvra-400'
                      : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1 text-sm font-semibold uppercase tracking-wider">{item.label}</span>
                  {expanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-dark-800 pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.path}
                        to={orgPath(child.path)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm ${
                          isActive(child.path)
                            ? 'bg-rivvra-500/10 text-rivvra-400'
                            : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                        }`}
                      >
                        <child.icon className="w-4 h-4" />
                        <span className="flex-1">{child.label}</span>
                        {isActive(child.path) && <ChevronRight className="w-3.5 h-3.5" />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // Regular item
          return (
            <Link
              key={item.path}
              to={orgPath(item.path)}
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
          );
        })}
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t border-dark-800 shrink-0">
        <div className="flex items-center gap-3">
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
          <button
            onClick={handleLogout}
            className="flex items-center justify-center p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0"
            title="Log out"
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
    </>
  );
}

export default AppSidebar;
