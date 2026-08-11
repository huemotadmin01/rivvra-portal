import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { usePlatform } from '../../../context/PlatformContext';
import { useCompany } from '../../../context/CompanyContext';
import { useOrg } from '../../../context/OrgContext';
import { useBreadcrumbs } from '../../../hooks/useBreadcrumbs';
import { useFromEntity } from '../../../hooks/useFromEntity';
import { ThemeToggle, useTheme } from '../../ds';
import KbHelpButton from '../../KbHelpButton';
import PeriodPicker from '../PeriodPicker';
import NotificationBell from '../NotificationBell';
import {
  Menu, ChevronDown, Check, Building2, UserCircle, CreditCard, LogOut, LayoutGrid,
} from 'lucide-react';

/* v2 appbar — prototype AppBar composition (crumbs left, actions right)
   powered by the existing contexts. NotificationBell / PeriodPicker /
   KbHelpButton are reused verbatim; the company switcher and user menu
   re-render the legacy TopBar logic in shell chrome. */
function AppBarV2({ onMenu }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentApp, orgPath } = usePlatform();
  const { companies, currentCompany, switchCompany, hasMultipleCompanies, switching } = useCompany();
  const { isOrgAdmin } = useOrg();
  useFromEntity();
  const crumbs = useBreadcrumbs() || [];
  const [theme, setTheme] = useTheme();

  const [companyOpen, setCompanyOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const companyRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (companyRef.current && !companyRef.current.contains(e.target)) setCompanyOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleLogout = () => { logout(); navigate('/find-workspace'); };
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <header className="appbar">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Open navigation">
        <Menu style={{ width: 17, height: 17 }} />
      </button>

      <nav className="crumbs grow" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span className="sep"><ChevronDown style={{ width: 12, height: 12, transform: 'rotate(-90deg)' }} /></span>}
            {i === crumbs.length - 1 || !c.path
              ? <span className="now">{c.label}</span>
              : <Link to={c.path}>{c.label}</Link>}
          </span>
        ))}
      </nav>

      {/* Company switcher — only when the org has multiple legal entities */}
      {hasMultipleCompanies && (
        <div ref={companyRef} style={{ position: 'relative' }}>
          <button
            className="icon-btn desktop-only"
            style={{ width: 'auto', padding: '0 10px', gap: 6, display: 'flex', alignItems: 'center', font: '500 12.5px/1 var(--font)' }}
            onClick={() => setCompanyOpen((o) => !o)}
            disabled={switching}
          >
            <Building2 style={{ width: 14, height: 14 }} />
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentCompany?.name || 'Company'}
            </span>
            <ChevronDown style={{ width: 12, height: 12 }} />
          </button>
          {companyOpen && (
            <div className="pop" style={{ top: 42, right: 0, minWidth: 220 }}>
              <div className="pop-label">Company</div>
              {companies.map((c) => (
                <button key={c._id} className={`pop-item ${c._id === currentCompany?._id ? 'is-on' : ''}`}
                  onClick={() => { switchCompany(c._id); setCompanyOpen(false); }}>
                  <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  {c._id === currentCompany?._id && <Check style={{ width: 14, height: 14, color: 'var(--brand)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {currentApp?.id === 'timesheet' && <PeriodPicker />}
      {currentApp?.id && <KbHelpButton appId={currentApp.id} />}
      <ThemeToggle theme={theme} onChange={setTheme} />
      <NotificationBell />

      <div ref={userRef} style={{ position: 'relative' }}>
        <button onClick={() => setUserOpen((o) => !o)} style={{ display: 'grid', placeItems: 'center' }} aria-label="Account menu">
          <span className="avatar avatar-sm avatar-ring">
            {user?.picture
              ? <img src={user.picture} alt="" referrerPolicy="no-referrer" />
              : initial}
          </span>
        </button>
        {userOpen && (
          <div className="pop" style={{ top: 42, right: 0, minWidth: 220 }}>
            <div className="pop-label" style={{ textTransform: 'none', letterSpacing: 0, font: '450 12px/1.4 var(--font)' }}>
              <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 600 }}>{user?.name || 'User'}</span>
              <span style={{ display: 'block', color: 'var(--fg-4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</span>
            </div>
            <button className="pop-item" onClick={() => { navigate(orgPath('/employee/profile')); setUserOpen(false); }}>
              <UserCircle style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
              <span className="grow">My profile</span>
            </button>
            <button className="pop-item" onClick={() => { navigate(orgPath('/home')); setUserOpen(false); }}>
              <LayoutGrid style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
              <span className="grow">App launcher</span>
            </button>
            {isOrgAdmin && (
              <button className="pop-item" onClick={() => { navigate(orgPath('/settings/billing')); setUserOpen(false); }}>
                <CreditCard style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
                <span className="grow">Billing &amp; settings</span>
              </button>
            )}
            <button className="pop-item" onClick={handleLogout}>
              <LogOut style={{ width: 15, height: 15, color: 'var(--danger)' }} />
              <span className="grow" style={{ color: 'var(--danger)' }}>Log out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default AppBarV2;
