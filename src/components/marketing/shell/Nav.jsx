import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import RivvraLogo from '../../RivvraLogo';
import { APPS, appHref } from '../../../content/marketing/apps';
import { SOLUTIONS, solutionHref, NAV } from '../../../content/marketing/site';
import { AppIcon, Button } from './ui';

function Dropdown({ label, active, children, width = 640 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`mk-nav-link ${active ? 'mk-nav-link--active' : ''}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        {label} <ChevronDown style={{ width: 14, height: 14, opacity: .7 }} />
      </button>
      {open && <div className="mk-menu" style={{ width }} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export default function Nav({ onTalk }) {
  const { pathname } = useLocation();
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(false); }, [pathname]);
  const is = (p) => pathname === p || pathname.startsWith(`${p}/`);

  return (
    <header className="mk-nav">
      <div className="mk-wrap mk-nav-inner">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Rivvra home">
          <RivvraLogo className="w-7 h-7" />
          <span className="mk-wordmark">Rivvra</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
          <Dropdown label="Features" active={is('/features')} width={660}>
            <p className="mk-menu-head">Fourteen apps, one set of records</p>
            <div className="grid grid-cols-2 gap-x-2">
              {APPS.map((a) => (
                <Link key={a.id} to={appHref(a)} className="mk-menu-item">
                  <AppIcon app={a} size={32} />
                  <span><b>{a.name}</b><span>{a.short}</span></span>
                </Link>
              ))}
            </div>
            <div className="mk-divider mt-2" />
            <div className="mk-menu-foot"><span>Every app is on every plan, including Free.</span><Link to="/features">All features →</Link></div>
          </Dropdown>
          <Dropdown label="Solutions" active={is('/solutions')} width={400}>
            <p className="mk-menu-head">By the kind of team you run</p>
            <div className="grid gap-x-2">
              {SOLUTIONS.map((s) => (
                <Link key={s.slug} to={solutionHref(s)} className="mk-menu-item">
                  <AppIcon app={s} size={32} />
                  <span><b>{s.name}</b><span>{s.short}</span></span>
                </Link>
              ))}
            </div>
          </Dropdown>
          {NAV.primary.map((l) => (
            <Link key={l.to} to={l.to} className={`mk-nav-link ${is(l.to) ? 'mk-nav-link--active' : ''}`}>{l.label}</Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <Link to="/login" className="mk-nav-link">Log in</Link>
          <Button variant="secondary" size="sm" onClick={onTalk}>Talk to us</Button>
          <Button to="/signup" size="sm" arrow>Start for free</Button>
        </div>

        <div className="lg:hidden">
          <button type="button" className="mk-btn mk-btn--ghost mk-btn--sm" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} onClick={() => setMobile((v) => !v)}>
            {mobile ? <X style={{ width: 20, height: 20 }} /> : <Menu style={{ width: 20, height: 20 }} />}
          </button>
        </div>
      </div>

      {mobile && (
        <div className="lg:hidden border-t" style={{ borderColor: 'var(--mk-line)', background: 'var(--mk-surface)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}>
          <div className="mk-wrap py-4 grid gap-1">
            <p className="mk-footer-head mt-2">Features</p>
            <div className="grid grid-cols-2 gap-1">
              {APPS.map((a) => <Link key={a.id} to={appHref(a)} className="mk-nav-link">{a.name}</Link>)}
            </div>
            <p className="mk-footer-head mt-4">Solutions</p>
            {SOLUTIONS.map((s) => <Link key={s.slug} to={solutionHref(s)} className="mk-nav-link">{s.name}</Link>)}
            <div className="mk-divider my-3" />
            {NAV.primary.map((l) => <Link key={l.to} to={l.to} className="mk-nav-link">{l.label}</Link>)}
            <Link to="/login" className="mk-nav-link">Log in</Link>
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" onClick={() => { setMobile(false); onTalk(); }} className="flex-1">Talk to us</Button>
              <Button to="/signup" className="flex-1" arrow>Start for free</Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
