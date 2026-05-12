import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { stripOrgPrefix } from '../../config/apps';
import {
  ChevronRight, ChevronDown, ChevronLeft, ChevronsLeft, ChevronsRight, LogOut, Building2
} from 'lucide-react';
import ComingSoonModal from '../ComingSoonModal';

// 2026-05-12: `collapsed` + `onToggleCollapsed` are owned by
// PlatformLayout (persists per-user via localStorage). When collapsed
// the sidebar shrinks to w-16 / icon-only; main content gets +200px
// horizontal back. Mobile (`isOpen` flag, sm: overlay) is unchanged —
// collapse only applies to md+ screens.
function AppSidebar({ isOpen, onClose, collapsed = false, onToggleCollapsed = () => {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isImpersonating } = useAuth();
  const { currentApp, orgPath, orgSlug } = usePlatform();
  const { timesheetUser } = useTimesheetContext();
  const { hasAppAccess, getAppRole, currentOrg, isOrgAdmin } = useOrg();
  const { currentCompany } = useCompany();
  const [showWipModal, setShowWipModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  if (!currentApp) return null;

  // If user doesn't have access to this app, don't render sidebar
  // (AppAccessGate will show NoAccessPage instead of the app content)
  // Admin-only apps (settings, payroll) use OrgAdminGate instead of AppAccessGate
  if (currentOrg && !currentApp.adminOnly && !hasAppAccess(currentApp.id)) {
    return null;
  }

  // Pass org membership role so apps can use it as source of truth
  // For admin-only apps (settings), use org-level role since they're not in appAccess
  const orgAppRole = currentApp.adminOnly && isOrgAdmin
    ? 'admin'
    : (currentApp?.id && currentOrg ? getAppRole(currentApp.id) : null);
  // Pass active company so apps can hide entries that don't apply to the
  // current legal entity (e.g. payroll's India-only items for non-INR cos).
  const sidebarItems = currentApp.getSidebarItems(user, timesheetUser, orgAppRole, currentCompany);

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
    navigate('/find-workspace');
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
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-dark-900 border-r border-dark-800 flex flex-col fixed left-0 z-30
        ${isImpersonating ? 'top-24' : 'top-14'}
        ${isImpersonating ? 'h-[calc(100vh-6rem)]' : 'h-[calc(100vh-3.5rem)]'}
        transition-[transform,width] duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>

      {/* Navigation */}
      <nav className={`flex-1 ${collapsed ? 'px-2 py-3' : 'p-4'} space-y-1 overflow-y-auto overflow-x-hidden min-h-0`}>
        {sidebarItems.map((item, idx) => {
          if (item.type === 'group') {
            const expanded = isGroupExpanded(item);
            const hasActiveChild = item.children.some(child => isActive(child.path));
            // 2026-05-12: when collapsed, group icons act as "expand
            // sidebar + open this group" — recruiters who want a
            // nested item like Settings click once, sidebar widens,
            // group is already open, second click hits the child.
            const handleGroupClick = () => {
              if (collapsed) {
                onToggleCollapsed();
                setExpandedGroups((prev) => ({ ...prev, [item.label]: true }));
              } else {
                toggleGroup(item.label);
              }
            };
            return (
              <div key={item.label} className={idx > 0 ? 'pt-2' : ''}>
                <button
                  onClick={handleGroupClick}
                  className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg transition-colors w-full text-left ${
                    hasActiveChild
                      ? 'text-rivvra-400'
                      : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-sm font-semibold uppercase tracking-wider">{item.label}</span>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </>
                  )}
                </button>
                {!collapsed && expanded && (
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
              className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-rivvra-500/10 text-rivvra-400'
                  : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {isActive(item.path) && <ChevronRight className="w-4 h-4" />}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle — desktop only. Mobile uses the TopBar hamburger. */}
      <button
        onClick={onToggleCollapsed}
        className={`hidden md:flex items-center ${collapsed ? 'justify-center px-2' : 'justify-end gap-2 px-3'} py-2 mx-2 mb-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors text-xs`}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight className="w-4 h-4" /> : (
          <>
            <ChevronsLeft className="w-4 h-4" />
            <span>Collapse</span>
          </>
        )}
      </button>

      {/* User Menu */}
      <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-dark-800 shrink-0`}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-3'}`}>
          {user?.picture ? (
            <img src={user.picture} alt="" className={`${collapsed ? 'w-9 h-9' : 'w-10 h-10'} rounded-full object-cover`} referrerPolicy="no-referrer" />
          ) : (
            <div className={`${collapsed ? 'w-9 h-9' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center`}>
              <span className="text-sm font-bold text-dark-950">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-dark-400 truncate">{user?.email}</p>
            </div>
          )}
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
