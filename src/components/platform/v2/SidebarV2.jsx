import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { usePlatform } from '../../../context/PlatformContext';
import { useTimesheetContext } from '../../../context/TimesheetContext';
import { useOrg } from '../../../context/OrgContext';
import { useCompany } from '../../../context/CompanyContext';
import { stripOrgPrefix, getActiveApps, resolveDefaultRoute } from '../../../config/apps';
import { BrandMark, BRAND_MARK_IDS } from '../../ds';
import { ChevronDown, PanelLeftClose, LayoutGrid, LogOut } from 'lucide-react';
import DocumentsFolderNav from '../DocumentsFolderNav';

/* App id → semantic accent token (per-app accents from the handoff;
   apps without a token fall back to brand green). */
const ACCENT = {
  outreach: 'var(--a-outreach)', timesheet: 'var(--a-ess)', crm: 'var(--a-crm)',
  ats: 'var(--a-ats)', payroll: 'var(--a-payroll)', employee: 'var(--a-employee)',
  contacts: 'var(--a-contacts)', sign: 'var(--a-sign)', todo: 'var(--a-todo)',
  invoicing: 'var(--a-invoice)', incentive: 'var(--a-incentive)',
  knowledgeBase: 'var(--a-kb)', settings: 'var(--a-settings)',
};
const accentFor = (appId) => ACCENT[appId] || 'var(--brand)';
const markIdFor = (appId) => (appId === 'knowledgeBase' ? 'kb' : appId);

function AppMark({ appId, icon: Icon, size = 17 }) {
  const markId = markIdFor(appId);
  if (BRAND_MARK_IDS.includes(markId)) return <BrandMark id={markId} size={size} />;
  return Icon ? <Icon style={{ width: size, height: size }} /> : null;
}

function AppSwitcher({ appId, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgPath } = usePlatform();
  const { membership, hasAppAccess } = useOrg();

  const apps = getActiveApps(user, membership).filter(
    (a) => a.id === 'settings' || hasAppAccess(a.id)
  );

  const pick = (app) => {
    const role = null; // resolveDefaultRoute handles fn-or-string defaults
    navigate(orgPath(resolveDefaultRoute(app, role)));
    onClose();
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={onClose} />
      <div className="pop" style={{ top: 52, left: 8 }}>
        <div className="pop-label">Switch app</div>
        <div className="pop-grid">
          {apps.map((a) => (
            <button key={a.id} className={`pop-item ${a.id === appId ? 'is-on' : ''}`} onClick={() => pick(a)}>
              <span className="pop-mark" style={{ color: accentFor(a.id) }}>
                <AppMark appId={a.id} icon={a.icon} size={16} />
              </span>
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            </button>
          ))}
        </div>
        <div className="pop-label" style={{ marginTop: 4 }}>All apps</div>
        <button className="pop-item" onClick={() => { navigate(orgPath('/home')); onClose(); }}>
          <span className="pop-mark" style={{ color: 'var(--fg-3)' }}><LayoutGrid style={{ width: 15, height: 15 }} /></span>
          <span className="grow">Back to launcher</span>
        </button>
      </div>
    </>
  );
}

function SidebarV2({ mobileOpen, onCloseMobile, collapsed, onToggleCollapsed }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentApp, orgPath } = usePlatform();
  const { timesheetUser } = useTimesheetContext();
  const { hasAppAccess, getAppRole, currentOrg, isOrgAdmin, isOrgOwner, membership } = useOrg();
  const { currentCompany } = useCompany();
  const [closedGroups, setClosedGroups] = useState({});
  const [switcher, setSwitcher] = useState(false);

  if (!currentApp) return null;
  if (currentOrg && !currentApp.adminOnly && !hasAppAccess(currentApp.id)) return null;

  // Same role/item derivation as the legacy AppSidebar — APP_REGISTRY
  // stays the single source of nav truth.
  const orgAppRole = currentApp.adminOnly && isOrgAdmin
    ? 'admin'
    : (currentApp?.id && currentOrg ? getAppRole(currentApp.id) : null);
  const canViewProfitability = isOrgOwner || user?.superAdmin || membership?.appAccess?.invoicing?.viewProfitability === true;
  const items = currentApp.getSidebarItems(user, timesheetUser, orgAppRole, currentCompany, isOrgOwner, canViewProfitability);

  const currentPath = stripOrgPrefix(location.pathname);
  const isActive = (path) => currentPath === path;
  const accent = accentFor(currentApp.id);

  const handleLogout = () => { logout(); navigate('/find-workspace'); };

  const groupClosed = (g) => {
    if (g.children.some((c) => isActive(c.path))) return false;
    return closedGroups[g.label] === true;
  };

  return (
    <>
      {mobileOpen && <div className="sb-scrim" onClick={onCloseMobile} />}
      <aside className={`sb ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`} style={{ '--accent': accent }}>
        <div className="sb-head" style={{ position: 'relative' }}>
          <button className="sb-app" onClick={() => setSwitcher((s) => !s)}>
            <span className="sb-app-mark" style={{ color: accent }}>
              <AppMark appId={currentApp.id} icon={currentApp.icon} size={17} />
            </span>
            <span className="sb-hide grow" style={{ minWidth: 0 }}>
              <span className="sb-app-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentApp.name}</span>
              <span className="sb-app-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentApp.description}</span>
            </span>
            <span className="sb-hide" style={{ color: 'var(--fg-4)', display: 'grid', placeItems: 'center' }}><ChevronDown style={{ width: 14, height: 14 }} /></span>
          </button>
          {switcher && <AppSwitcher appId={currentApp.id} onClose={() => setSwitcher(false)} />}
        </div>

        <nav className="sb-nav">
          {items.map((item, idx) => {
            if (item.type === 'documentsFolders') {
              return <DocumentsFolderNav key={`folders-${idx}`} collapsed={collapsed} />;
            }
            if (item.type === 'group') {
              const isClosed = groupClosed(item);
              const handleGroupClick = () => {
                if (collapsed) {
                  onToggleCollapsed();
                  setClosedGroups((prev) => ({ ...prev, [item.label]: false }));
                } else {
                  setClosedGroups((prev) => ({ ...prev, [item.label]: !isClosed }));
                }
              };
              return (
                <div className="sb-group" key={item.label + idx}>
                  <button className={`sb-group-head ${isClosed ? 'is-closed' : ''}`} onClick={handleGroupClick} title={collapsed ? item.label : undefined}>
                    {collapsed && item.icon ? (
                      <span style={{ color: 'var(--fg-3)', display: 'grid', placeItems: 'center' }}><item.icon style={{ width: 16, height: 16 }} /></span>
                    ) : (
                      <>
                        <span className="sb-hide grow">{item.label}</span>
                        <span className="sb-hide chev" style={{ display: 'grid', placeItems: 'center' }}><ChevronDown style={{ width: 13, height: 13 }} /></span>
                      </>
                    )}
                  </button>
                  {!isClosed && !collapsed && (
                    <div className="sb-group-body">
                      {item.children.map((c) => (
                        <Link key={c.path} to={orgPath(c.path)} className={`sb-item ${isActive(c.path) ? 'is-on' : ''}`}>
                          <span className="grow">{c.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link key={item.path} to={orgPath(item.path)} className={`sb-item ${isActive(item.path) ? 'is-on' : ''}`} title={collapsed ? item.label : undefined}>
                <span className="ico">{item.icon && <item.icon style={{ width: 16, height: 16 }} />}</span>
                <span className="sb-hide grow">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sb-foot">
          <button className="sb-item" onClick={onToggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <span className="ico" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform var(--d-3) var(--e-out)' }}>
              <PanelLeftClose style={{ width: 16, height: 16 }} />
            </span>
            <span className="sb-hide grow">Collapse</span>
          </button>
          <div className="sb-user" style={{ cursor: 'default' }}>
            <span className="avatar avatar-sm">
              {user?.picture
                ? <img src={user.picture} alt="" referrerPolicy="no-referrer" />
                : (user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U')}
            </span>
            <span className="sb-hide grow" style={{ minWidth: 0 }}>
              <span className="n" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'User'}</span>
              <span className="e" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
            </span>
            <button className="sb-hide icon-btn" onClick={handleLogout} title="Log out" style={{ width: 28, height: 28, color: 'var(--danger)' }}>
              <LogOut style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default SidebarV2;
