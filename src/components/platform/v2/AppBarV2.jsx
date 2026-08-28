import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { usePlatform } from '../../../context/PlatformContext';
import { useCompany } from '../../../context/CompanyContext';
import { useOrg } from '../../../context/OrgContext';
import { useBreadcrumbs } from '../../../hooks/useBreadcrumbs';
import RivvraLogo from '../../RivvraLogo';
import { useFromEntity } from '../../../hooks/useFromEntity';
import { ThemeToggle, useTheme } from '../../ds';
import KbHelpButton from '../../KbHelpButton';
import PeriodPicker from '../PeriodPicker';
import NotificationBell from '../NotificationBell';
import { usePolicyAck } from '../../../context/PolicyAckContext';
import MyActivitiesV2 from './MyActivitiesV2';
import {
  Menu, ChevronDown, Check, Building2, UserCircle, CreditCard, LogOut, LayoutGrid,
  ShieldCheck, FolderDown, Settings,
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
  const { isOrgAdmin, currentOrg } = useOrg();
  const { pendingCount: policyPending } = usePolicyAck();
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

      {/* Home link — the always-available way out. Legacy TopBar has had this
          logo→/home link all along; V2 shipped without it, which turned every
          sidebar-less page (upgrade, my-documents, my-policies, the onboarding
          hub) into a dead end whose only exit was the browser back button.
          Shown only when the sidebar is absent, so app pages keep their
          breadcrumb-led layout unchanged. */}
      {!currentApp && (
        <Link
          to={orgPath('/home')}
          title="Back to workspace"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
            marginRight: 12, textDecoration: 'none', color: 'var(--fg-2)',
            font: "600 13.5px/1 'Inter', system-ui, sans-serif",
          }}
        >
          <RivvraLogo className="w-5 h-5" />
          <span>Rivvra</span>
        </Link>
      )}

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
          {/* Layout lives in .company-btn, not an inline style: an inline
              `display: flex` outranks the stylesheet, so `desktop-only` could
              never hide this button and it overflowed the bar on phones. */}
          <button
            className="icon-btn company-btn desktop-only"
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
      <MyActivitiesV2 orgSlug={currentOrg?.slug} orgPath={orgPath} />

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
            {/* Paths below match the routes in App.jsx, which are the ones the
                legacy TopBar uses. Two earlier guesses did not exist as routes:
                `/employee/profile` fell through to the Employee app layout and
                rendered a blank page, and `/settings/billing` hit the `*`
                catch-all and silently bounced the user to `/`. */}
            <button className="pop-item" onClick={() => { navigate(orgPath('/my-profile')); setUserOpen(false); }}>
              <UserCircle style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
              <span className="grow">My profile</span>
            </button>
            <button className="pop-item" onClick={() => { navigate(orgPath('/my-policies')); setUserOpen(false); }}>
              <ShieldCheck style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
              <span className="grow">Company policies</span>
              {policyPending > 0 && (
                <span style={{
                  minWidth: 18, height: 18, padding: '0 5px', display: 'grid', placeItems: 'center',
                  borderRadius: 999, background: 'var(--acc-amber)', color: 'var(--bg)',
                  font: '700 11px/1 var(--font)',
                }}>
                  {policyPending}
                </span>
              )}
            </button>
            <button className="pop-item" onClick={() => { navigate(orgPath('/my-documents')); setUserOpen(false); }}>
              <FolderDown style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
              <span className="grow">My documents</span>
            </button>
            <button className="pop-item" onClick={() => { navigate(orgPath('/home')); setUserOpen(false); }}>
              <LayoutGrid style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
              <span className="grow">App launcher</span>
            </button>
            {isOrgAdmin && (
              <button className="pop-item" onClick={() => { navigate(orgPath('/upgrade')); setUserOpen(false); }}>
                <CreditCard style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
                <span className="grow">Billing</span>
              </button>
            )}
            {isOrgAdmin && (
              <button className="pop-item" onClick={() => { navigate(orgPath('/settings/general')); setUserOpen(false); }}>
                <Settings style={{ width: 15, height: 15, color: 'var(--fg-3)' }} />
                <span className="grow">Settings</span>
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
