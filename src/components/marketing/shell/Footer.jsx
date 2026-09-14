import { Link } from 'react-router-dom';
import RivvraLogo from '../../RivvraLogo';
import { Button } from './ui';
import { APPS, appHref } from '../../../content/marketing/apps';
import { SOLUTIONS, solutionHref, EXTENSION_URL, SUPPORT_EMAIL } from '../../../content/marketing/site';

const FLOW = ['Source', 'Place', 'Track', 'Invoice', 'Pay'];

/** The one dark block on the site. Opens with the recruit-to-pay flow in
 *  display type, then the free-plan facts and the two CTAs, then links. */
export default function Footer({ onTalk }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mk-footer">
      <div className="mk-wrap pt-16 pb-10">
        <p className="mk-footer-flow" aria-label="Source, place, track, invoice, pay">
          {FLOW.map((w, i) => (
            <span key={w} className="inline-flex items-baseline gap-3">
              <span>{w}{i === FLOW.length - 1 && <em>.</em>}</span>{i < FLOW.length - 1 && <i aria-hidden="true">→</i>}
            </span>
          ))}
        </p>
        <div className="grid lg:grid-cols-12 gap-8 items-end mt-8">
          <p className="lg:col-span-6 mk-lede" style={{ color: 'var(--mk-ink-2)' }}>One set of records from the first email to the payslip. Three seats are free for as long as you want them.</p>
          <div className="lg:col-span-6 flex flex-wrap gap-3 lg:justify-end">
            <Button to="/signup" size="lg" arrow>Start for free</Button>
            <Button variant="secondary" size="lg" onClick={onTalk}>Talk to us</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-10">
          {[['14', 'apps on every plan'], ['3', 'free seats, no card'], ['$3', 'per user per month on Growth'], ['1 day', 'support reply on Growth']].map(([b, t]) => (
            <div key={t} className="mk-footer-fact"><b>{b}</b><span>{t}</span></div>
          ))}
        </div>

        <div className="mk-divider my-12" style={{ background: 'var(--mk-line)' }} />

        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2.5"><RivvraLogo className="w-7 h-7" /><span className="mk-wordmark">Rivvra</span></Link>
            <p className="mk-small mt-4 max-w-xs" style={{ color: 'var(--mk-muted)' }}>The operating platform for staffing agencies. Made in Bengaluru and Austin.</p>
            <p className="mk-small mt-4"><a className="mk-footer-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
          </div>
          <div>
            <p className="mk-footer-head">Product</p>
            <ul className="grid gap-2.5">{APPS.slice(0, 7).map((a) => <li key={a.id}><Link className="mk-footer-link" to={appHref(a)}>{a.name}</Link></li>)}</ul>
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
            </ul>
          </div>
        </div>

        <div className="mk-divider mt-12 mb-6" style={{ background: 'var(--mk-line)' }} />
        <div className="mk-footer-bottom">
          <p>© {year} Rivvra. A product of Huemot Technology Inc.</p>
          <p className="flex flex-wrap gap-x-5"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><span>Prices in USD · Statutory payroll for Indian entities</span></p>
        </div>
      </div>
    </footer>
  );
}
