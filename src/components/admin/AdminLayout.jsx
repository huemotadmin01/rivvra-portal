// ============================================================================
// AdminLayout.jsx — Super Admin frame, on the V2 shell (2026-11-20)
// ============================================================================
//
// Owner: "can we bring the V2 theme in admin portal as well?"
//
// Until now /admin/* had its own hard-dark Tailwind frame: no light theme, and
// below 768px the sidebar was simply hidden — no navigation and no way to log
// out on a phone. This is the same shell the rest of the portal uses
// (`.ds-shell` → `.sb` sidebar + `.appbar` + `.page`, from platform/v2/shell.css)
// with the admin's own nav, so it gets for free: the light/dark switch, the
// collapse-to-rail sidebar, and the slide-in drawer on phones.
//
// /admin/* sits OUTSIDE OrgProvider/PlatformProvider, so this file must not use
// useOrg / usePlatform / useCompany (useOrg throws without its provider).
// ============================================================================

import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Activity, Building2, Mail, Megaphone, BookOpen, Calculator, Users,
  ShieldCheck, LogOut, Menu, PanelLeftClose, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle, useTheme } from '../ds';
import { ADMIN_NAV, ADMIN_SETTINGS, adminTitleFor } from './adminNav';
import '../platform/v2/shell.css';
import '../platform/v2/legacy-bridge.css';

const ICONS = { LayoutDashboard, Activity, Building2, Mail, Megaphone, BookOpen, Calculator, Users };
const COLLAPSED_KEY = 'rivvra:sidebar-collapsed:admin';
const ACCENT = 'var(--acc-amber, #f59e0b)';

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [settingsClosed, setSettingsClosed] = useState(false);

  const toggleCollapsed = () => setCollapsed((prev) => {
    const next = !prev;
    try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* storage blocked */ }
    return next;
  });

  const isActive = (path) => (path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path));
  const inSettings = location.pathname.startsWith('/admin/settings');
  const settingsOpen = inSettings || !settingsClosed;
  const handleLogout = () => { logout(); navigate('/admin/login'); };
  const title = adminTitleFor(location.pathname);
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A';

  return (
    <div className="ds-shell">
      {mobileOpen && <div className="sb-scrim" onClick={() => setMobileOpen(false)} />}
      <aside
        className={`sb ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
        style={{ '--accent': ACCENT }}
        aria-label="Admin navigation"
        // The phone drawer closes when a link inside it is followed.
        onClick={(e) => { if (e.target.closest('a')) setMobileOpen(false); }}
      >
        <div className="sb-head">
          <Link to="/admin" className="sb-app" style={{ textDecoration: 'none', color: 'inherit' }} title="Super Admin">
            <span className="sb-app-mark" style={{ color: ACCENT }}><ShieldCheck style={{ width: 17, height: 17 }} /></span>
            <span className="sb-hide grow" style={{ minWidth: 0 }}>
              <span className="sb-app-name" style={{ display: 'block' }}>Super Admin</span>
              <span className="sb-app-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Rivvra platform</span>
            </span>
          </Link>
        </div>

        <nav className="sb-nav">
          {ADMIN_NAV.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sb-item ${isActive(item.path) ? 'is-on' : ''}`}
                title={collapsed ? item.label : undefined}
                aria-current={isActive(item.path) ? 'page' : undefined}
              >
                <span className="ico">{Icon && <Icon style={{ width: 16, height: 16 }} />}</span>
                <span className="sb-hide grow">{item.label}</span>
              </Link>
            );
          })}

          <div className="sb-group">
            {!collapsed && (
              <button
                type="button"
                className={`sb-group-head ${settingsOpen ? '' : 'is-closed'}`}
                onClick={() => setSettingsClosed((c) => !c)}
                aria-expanded={settingsOpen}
              >
                <span className="grow">Platform settings</span>
                <span className="chev" style={{ display: 'grid', placeItems: 'center' }}><ChevronDown style={{ width: 13, height: 13 }} /></span>
              </button>
            )}
            {(settingsOpen || collapsed) && ADMIN_SETTINGS.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sb-item ${isActive(item.path) ? 'is-on' : ''}`}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                >
                  <span className="ico">{Icon && <Icon style={{ width: 16, height: 16 }} />}</span>
                  <span className="sb-hide grow">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="sb-foot">
          <Link to="/home" className="sb-item" title={collapsed ? 'Back to portal' : undefined}>
            <span className="ico"><ArrowLeft style={{ width: 16, height: 16 }} /></span>
            <span className="sb-hide grow">Back to portal</span>
          </Link>
          <button type="button" className="sb-item desktop-only" onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <span className="ico" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform var(--d-3) var(--e-out)' }}>
              <PanelLeftClose style={{ width: 16, height: 16 }} />
            </span>
            <span className="sb-hide grow">Collapse</span>
          </button>
          <div className="sb-user" style={{ cursor: 'default' }}>
            <span className="avatar avatar-sm">
              {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : initial}
            </span>
            <span className="sb-hide grow" style={{ minWidth: 0 }}>
              <span className="n" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Admin'}</span>
              <span className="e" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
            </span>
            <button type="button" className="sb-hide icon-btn" onClick={handleLogout} title="Log out" aria-label="Log out" style={{ width: 28, height: 28, color: 'var(--danger)' }}>
              <LogOut style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="appbar">
          <button type="button" className="icon-btn mobile-only" onClick={() => setMobileOpen((o) => !o)} aria-label="Open navigation">
            <Menu style={{ width: 17, height: 17 }} />
          </button>
          <nav className="crumbs grow" aria-label="Breadcrumb">
            <Link to="/admin">Super Admin</Link>
            {title && (
              <>
                <span className="sep"><ChevronDown style={{ width: 12, height: 12, transform: 'rotate(-90deg)' }} /></span>
                <span className="now">{title}</span>
              </>
            )}
          </nav>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </header>
        <div className="page">
          <div className="page-inner">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
