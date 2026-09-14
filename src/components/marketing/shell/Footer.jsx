import { Link } from 'react-router-dom';
import RivvraLogo from '../../RivvraLogo';
import { APPS, appHref } from '../../../content/marketing/apps';
import { SOLUTIONS, solutionHref, EXTENSION_URL, SUPPORT_EMAIL } from '../../../content/marketing/site';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mk-footer">
      <div className="mk-wrap py-16">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2.5"><RivvraLogo className="w-7 h-7" /><span className="mk-wordmark">Rivvra</span></Link>
            <p className="mk-small mt-4 max-w-xs">Run your staffing agency on one platform. Fourteen apps, one set of records, free for three users.</p>
            <p className="mk-small mt-4"><a className="mk-footer-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
          </div>
          <div>
            <p className="mk-footer-head">Product</p>
            <ul className="grid gap-2.5">
              {APPS.slice(0, 7).map((a) => <li key={a.id}><Link className="mk-footer-link" to={appHref(a)}>{a.name}</Link></li>)}
            </ul>
          </div>
          <div>
            <p className="mk-footer-head hidden md:block" aria-hidden="true">&nbsp;</p>
            <ul className="grid gap-2.5">
              {APPS.slice(7).map((a) => <li key={a.id}><Link className="mk-footer-link" to={appHref(a)}>{a.name}</Link></li>)}
              <li><a className="mk-footer-link" href={EXTENSION_URL} target="_blank" rel="noopener noreferrer">Chrome extension</a></li>
            </ul>
          </div>
          <div>
            <p className="mk-footer-head">Solutions</p>
            <ul className="grid gap-2.5">
              {SOLUTIONS.map((s) => <li key={s.slug}><Link className="mk-footer-link" to={solutionHref(s)}>{s.name}</Link></li>)}
              <li><Link className="mk-footer-link" to="/pricing">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <p className="mk-footer-head">Company</p>
            <ul className="grid gap-2.5">
              <li><Link className="mk-footer-link" to="/about">About</Link></li>
              <li><Link className="mk-footer-link" to="/changelog">Changelog</Link></li>
              <li><Link className="mk-footer-link" to="/support">Support</Link></li>
              <li><Link className="mk-footer-link" to="/contact">Contact</Link></li>
              <li><Link className="mk-footer-link" to="/privacy">Privacy</Link></li>
              <li><Link className="mk-footer-link" to="/terms">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="mk-divider mt-12 mb-6" />
        <div className="flex flex-col md:flex-row justify-between gap-3">
          <p className="mk-small">© {year} Rivvra. A product of Huemot Technology Inc.</p>
          <p className="mk-small">Prices in USD. Statutory payroll for Indian entities.</p>
        </div>
      </div>
    </footer>
  );
}
