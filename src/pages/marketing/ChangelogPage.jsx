import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell from '../../components/marketing/shell/Shell';
import { Section, Eyebrow } from '../../components/marketing/shell/ui';
import { CHANGELOG } from '../../content/changelog/entries';
import { APP_BY_ID, appHref } from '../../content/marketing/apps';

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function ChangelogPage() {
  useDocumentMeta({ title: 'Changelog', description: 'What changed in Rivvra, release by release.', path: '/changelog' });
  return (
    <Shell>
      <Section className="pt-16 md:pt-24">
        <div className="max-w-2xl">
          <Eyebrow>Changelog</Eyebrow>
          <h1 className="mk-display mk-h1">What changed, <span className="mk-accent">and when.</span></h1>
          <p className="mk-lede mt-6">Every release that a customer can see, newest first. Rivvra ships continuously; this is the human-readable record.</p>
        </div>
        <ol className="list-none p-0 m-0 mt-14 grid gap-0">
          {CHANGELOG.map((e) => (
            <li key={e.date} className="grid md:grid-cols-[180px_1fr] gap-4 md:gap-10 py-10" style={{ borderTop: '1px solid var(--mk-line)' }}>
              <div>
                <time dateTime={e.date} className="mk-mono text-[13px]" style={{ color: 'var(--mk-muted)' }}>{fmt(e.date)}</time>
                {e.apps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {e.apps.map((id) => APP_BY_ID[id] && <Link key={id} to={appHref(APP_BY_ID[id])} className="mk-pill">{APP_BY_ID[id].name}</Link>)}
                  </div>
                )}
              </div>
              <div>
                <h2 className="mk-h3">{e.title}</h2>
                <ul className="grid gap-2.5 mt-4 pl-5" style={{ color: 'var(--mk-ink-2)' }}>
                  {e.items.map((t) => <li key={t} className="text-[15.5px] leading-relaxed">{t}</li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </Shell>
  );
}
