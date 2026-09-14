import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell, { useTalkToUs } from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, Button, Shot, AppIcon, CtaBand } from '../../components/marketing/shell/ui';
import { APP_BY_ID, appHref } from '../../content/marketing/apps';
import { SOLUTION_PAGES } from '../../content/marketing/solutions';

/** /solutions/<slug> — one template, four audiences. */
export default function SolutionPage() {
  const { slug } = useParams();
  const s = SOLUTION_PAGES[slug];
  if (!s) return <Navigate to="/" replace />;
  return <Shell><SolutionBody s={s} slug={slug} key={slug} /></Shell>;
}

function SolutionBody({ s, slug }) {
  const talk = useTalkToUs();
  useDocumentMeta({ title: `Rivvra for ${s.eyebrow}`, description: s.lede, path: `/solutions/${slug}` });
  const apps = s.apps.map((id) => APP_BY_ID[id]).filter(Boolean);
  return (
    <>
      <Section className="pt-16 md:pt-24 pb-0">
        <div className="max-w-3xl">
          <Eyebrow>{s.eyebrow}</Eyebrow>
          <h1 className="mk-display mk-h1">{s.title}</h1>
          <p className="mk-lede mt-6">{s.lede}</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Button to="/signup" size="lg" arrow>Start for free</Button>
            <Button variant="secondary" size="lg" onClick={talk}>Talk to us</Button>
          </div>
        </div>
        <div className="mt-14"><Shot src={s.hero} alt={s.heroAlt} priority /></div>
      </Section>

      <Section>
        <ol className="grid gap-16 m-0 p-0 list-none">
          {s.points.map((c, i) => (
            <li key={c.title} className="grid lg:grid-cols-12 gap-8 items-center">
              <div className={`lg:col-span-5 ${i % 2 ? 'lg:order-2' : ''}`}>
                <span className="mk-step-num">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="mk-h3 mt-4">{c.title}</h2>
                <p className="mk-p mt-3">{c.text}</p>
              </div>
              <div className={`lg:col-span-7 ${i % 2 ? 'lg:order-1' : ''}`}><Shot src={c.shot} alt={c.title} /></div>
            </li>
          ))}
        </ol>
      </Section>

      <Section line tight>
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-3"><Eyebrow>The apps you would use</Eyebrow><p className="mk-p">Switch these on; leave the rest off until you need them.</p></div>
          <div className="lg:col-span-9 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {apps.map((a) => <Link key={a.id} to={appHref(a)} className="mk-card mk-card--hover p-4 flex items-center gap-3"><AppIcon app={a} size={34} /><span className="text-[14px] font-medium" style={{ color: 'var(--mk-ink)' }}>{a.name}</span><ArrowRight style={{ width: 14, height: 14, marginLeft: 'auto', color: 'var(--mk-faint)' }} /></Link>)}
          </div>
        </div>
        <div className="mk-brand-tint px-5 py-4 mt-8"><p className="mk-small" style={{ color: 'var(--mk-ink-2)', fontSize: 14 }}><b style={{ color: 'var(--mk-ink)' }}>Out of scope, so you know:</b> {s.outOfScope}</p></div>
      </Section>

      {s.faq.length > 0 && (
        <Section line>
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4"><Eyebrow>Questions</Eyebrow><h2 className="mk-display mk-h2">Asked by teams like yours.</h2></div>
            <div className="lg:col-span-8 mk-faq">{s.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="mk-p">{f.a}</p></details>)}</div>
          </div>
        </Section>
      )}

      <CtaBand title="Try it with your own numbers." text="Three seats are free. Tell us about your agency and we will set up the workspace with you." onTalk={talk} />
    </>
  );
}
