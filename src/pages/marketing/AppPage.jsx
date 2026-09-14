import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell, { useTalkToUs } from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, Button, Shot, AppIcon, CtaBand } from '../../components/marketing/shell/ui';
import { APP_BY_SLUG, APP_BY_ID, appHref } from '../../content/marketing/apps';

/** /features/<slug> — one template, fourteen apps, content from apps.js. */
export default function AppPage() {
  const { slug } = useParams();
  const app = APP_BY_SLUG[slug];
  if (!app) return <Navigate to="/features" replace />;
  return <Shell><AppBody app={app} key={app.id} /></Shell>;
}

function AppBody({ app }) {
  const talk = useTalkToUs();
  useDocumentMeta({ title: `${app.name} for staffing agencies`, description: `${app.short} ${app.tagline}.`, path: appHref(app) });
  const related = (app.worksWith || []).map((id) => APP_BY_ID[id]).filter(Boolean);
  return (
    <>
      <Section className="pt-16 md:pt-24 pb-0">
        <div className="flex items-center gap-3 mb-6"><AppIcon app={app} /><Link to="/features" className="mk-small">Features</Link><span className="mk-small">/</span><span className="mk-small" style={{ color: 'var(--mk-ink)' }}>{app.name}</span></div>
        <div className="max-w-3xl">
          <h1 className="mk-display mk-h1">{app.tagline}</h1>
          <p className="mk-lede mt-6">{app.short}</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Button to="/signup" size="lg" arrow>Start for free</Button>
            <Button variant="secondary" size="lg" onClick={talk}>Talk to us</Button>
          </div>
        </div>
        <div className="mt-14"><Shot src={app.hero} alt={`${app.name} in Rivvra`} priority /></div>
      </Section>

      <Section>
        <ol className="grid gap-16 m-0 p-0 list-none">
          {app.capabilities.map((c, i) => (
            <li key={c.title} className="grid lg:grid-cols-12 gap-8 items-center">
              <div className={`lg:col-span-5 ${i % 2 ? 'lg:order-2' : ''}`}>
                <span className="mk-step-num">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="mk-h3 mt-4">{c.title}</h2>
                <p className="mk-p mt-3">{c.text}</p>
              </div>
              <div className={`lg:col-span-7 ${i % 2 ? 'lg:order-1' : ''}`}><Shot src={c.shot} alt={`${app.name}: ${c.title}`} /></div>
            </li>
          ))}
        </ol>
      </Section>

      {related.length > 0 && (
        <Section line tight>
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-3"><Eyebrow>Works with</Eyebrow><p className="mk-p">Records flow to and from these apps.</p></div>
            <div className="lg:col-span-9 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {related.map((r) => (
                <Link key={r.id} to={appHref(r)} className="mk-card mk-card--hover p-4 flex items-center gap-3"><AppIcon app={r} size={34} /><span className="text-[14px] font-medium" style={{ color: 'var(--mk-ink)' }}>{r.name}</span><ArrowRight style={{ width: 14, height: 14, marginLeft: 'auto', color: 'var(--mk-faint)' }} /></Link>
              ))}
            </div>
          </div>
        </Section>
      )}

      {app.faq.length > 0 && (
        <Section line>
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4"><Eyebrow>Questions</Eyebrow><h2 className="mk-display mk-h2">About {app.name}.</h2></div>
            <div className="lg:col-span-8 mk-faq">{app.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="mk-p">{f.a}</p></details>)}</div>
          </div>
        </Section>
      )}

      <CtaBand title={`${app.name} is on every plan.`} text="Start free with three seats and switch on the apps you need." onTalk={talk} />
    </>
  );
}
