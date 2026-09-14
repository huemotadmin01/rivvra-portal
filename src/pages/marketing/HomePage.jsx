import { Link } from 'react-router-dom';
import { ArrowRight, Chrome, Linkedin, MapPin, Sparkles, Check } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell, { useTalkToUs } from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, Button, Shot, AppIcon, CtaBand } from '../../components/marketing/shell/ui';
import { APPS, appHref } from '../../content/marketing/apps';
import { SOLUTIONS, solutionHref, PLANS, FOUNDING, HOME_FAQ, EXTENSION_URL } from '../../content/marketing/site';

// ── The recruit-to-pay flow. One sentence and one real screen per step. ──
const FLOW = [
  { n: '01', app: 'crm', title: 'Win the client', text: 'Prospects come in from LinkedIn through Outreach and become deals in the CRM, with expected value and a closing date.', shot: '/shots/crm/pipeline.webp', alt: 'CRM pipeline board with deals across Initial Contact, Qualified, Proposal Sent and Negotiation' },
  { n: '02', app: 'ats', title: 'Place the consultant', text: 'The won deal becomes a job. Candidates move through interviews to Hired on a board every recruiter can read.', shot: '/shots/ats/pipeline.webp', alt: 'ATS pipeline board with candidates in each stage' },
  { n: '03', app: 'timesheet', title: 'Track the hours', text: 'Consultants fill a monthly sheet per client project. Managers approve from one queue.', shot: '/shots/timesheet/approvals.webp', alt: 'Timesheet approvals queue with submitted September sheets' },
  { n: '04', app: 'invoicing', title: 'Invoice the client', text: 'Approved hours become numbered, GST-correct invoices. Payments and ageing on the same page.', shot: '/shots/invoicing/invoices.webp', alt: 'Customer invoices list with paid, partial and unpaid invoices' },
  { n: '05', app: 'payroll', title: 'Pay the team', text: 'Run payroll from attendance and approved timesheets, with PF, ESI, PT and TDS computed. Payslips land in self service.', shot: '/shots/payroll/run-detail.webp', alt: 'August 2026 payroll run, paid, with 22 employees' },
];

function ExtensionMock() {
  return (
    <div className="mk-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 h-10" style={{ borderBottom: '1px solid var(--mk-line)', background: 'var(--mk-surface-2)' }}>
        <span className="flex gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: '#E6E8E3' }} /><i className="w-2.5 h-2.5 rounded-full" style={{ background: '#E6E8E3' }} /><i className="w-2.5 h-2.5 rounded-full" style={{ background: '#E6E8E3' }} /></span>
        <span className="mk-mono text-[11px] mx-auto flex items-center gap-2" style={{ color: 'var(--mk-muted)' }}><Linkedin style={{ width: 12, height: 12, color: '#0a66c2' }} /> linkedin.com/in/rahul-krishnan</span>
        <span className="w-7 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--mk-brand-soft)', border: '1px solid var(--mk-brand-line)' }}><Chrome style={{ width: 13, height: 13, color: 'var(--mk-brand-hi)' }} /></span>
      </div>
      <div className="grid sm:grid-cols-[1fr_260px]">
        <div className="p-5 hidden sm:block">
          <div className="h-12 rounded-lg" style={{ background: 'linear-gradient(90deg, #DCE8F7, #EEF3FA)' }} />
          <div className="-mt-6 ml-2 w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: '#0a66c2', border: '3px solid #fff' }}>RK</div>
          <p className="mt-2 font-semibold" style={{ color: 'var(--mk-ink)' }}>Rahul Krishnan</p>
          <p className="mk-small">VP Engineering · Zenlytic Systems</p>
          <p className="mk-small flex items-center gap-1"><MapPin style={{ width: 12, height: 12 }} /> Bengaluru, Karnataka · 500+ connections</p>
          <div className="mt-5 grid gap-2">{[80, 65, 72, 50].map((w, i) => <div key={i} className="h-2 rounded" style={{ width: `${w}%`, background: 'var(--mk-surface-2)' }} />)}</div>
        </div>
        <div className="p-4" style={{ borderLeft: '1px solid var(--mk-line)', background: 'var(--mk-bg)' }}>
          <p className="mk-eyebrow" style={{ fontSize: 10.5 }}>Rivvra</p>
          <p className="mt-2 font-semibold text-[14px]" style={{ color: 'var(--mk-ink)' }}>Save to Outreach</p>
          {[['Name', 'Rahul Krishnan'], ['Title', 'VP Engineering'], ['Company', 'Zenlytic Systems'], ['Email', 'rahul.k@zenlytic…'], ['ICP score', '88']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-1.5 text-[12.5px]" style={{ borderBottom: '1px solid var(--mk-line)' }}><span style={{ color: 'var(--mk-muted)' }}>{k}</span><span className={k === 'ICP score' ? 'mk-mono mk-accent' : 'mk-mono'} style={{ color: k === 'ICP score' ? undefined : 'var(--mk-ink)' }}>{v}</span></div>
          ))}
          <div className="mk-btn mk-btn--primary mk-btn--sm w-full mt-3">Save lead</div>
          <p className="mk-small mt-2 flex items-center gap-1" style={{ fontSize: 11.5 }}><Check style={{ width: 12, height: 12, color: 'var(--mk-brand-hi)' }} /> Added to "Q3 Salesforce outreach"</p>
        </div>
      </div>
    </div>
  );
}

function AssistantMock() {
  return (
    <div className="mk-card p-5 grid gap-4">
      <div className="flex items-center gap-2"><Sparkles style={{ width: 16, height: 16, color: 'var(--mk-brand-hi)' }} /><span className="font-semibold text-[14px]" style={{ color: 'var(--mk-ink)' }}>Ask Rivvra</span></div>
      <div className="self-end max-w-[85%] rounded-xl px-3.5 py-2.5 text-[14px]" style={{ background: 'var(--mk-surface-2)', color: 'var(--mk-ink)' }}>Who is on the bench this month, and what did we bill Zenlytic in August?</div>
      <div className="max-w-[92%] rounded-xl px-4 py-3 text-[14px] grid gap-2" style={{ border: '1px solid var(--mk-line)', color: 'var(--mk-ink-2)' }}>
        <p>Two consultants are unallocated in September: <b style={{ color: 'var(--mk-ink)' }}>Ishita Sen</b> (Scrum Master, since 4 Sep) and <b style={{ color: 'var(--mk-ink)' }}>Emma Wilson</b> (Business Analyst, since 11 Sep).</p>
        <p>Zenlytic Systems was billed <span className="mk-mono" style={{ color: 'var(--mk-ink)' }}>₹7,90,600</span> in August on INV/26-27/08/0001, paid on 22 Aug.</p>
        <p className="mk-small" style={{ fontSize: 12 }}>Sources: Employee › Assignments, Invoicing › INV/26-27/08/0001</p>
      </div>
      <p className="mk-small">Answers come from your workspace. It reads; it never edits.</p>
    </div>
  );
}

export default function HomePage() {
  useDocumentMeta({ titleRaw: 'Rivvra — Run your staffing agency on one platform', description: 'Outreach, ATS, CRM, timesheets, invoicing, Indian payroll and 8 more apps sharing one set of records. Free for 3 users, $3 per user on Growth.', path: '/' });
  return (
    <Shell>
      <Home />
    </Shell>
  );
}

function Home() {
  const talk = useTalkToUs();
  return (
    <>
      {/* Hero */}
      <Section className="pt-16 md:pt-24 pb-0">
        <div className="max-w-3xl">
          <Eyebrow>Staffing OS for agencies</Eyebrow>
          <h1 className="mk-display mk-h1">Run your staffing agency on <span className="mk-accent">one platform.</span></h1>
          <p className="mk-lede mt-6">Outreach, ATS, CRM, timesheets, invoicing, payroll and eight more apps, sharing one set of records. Free for three users.</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Button to="/signup" size="lg" arrow>Start for free</Button>
            <Button variant="secondary" size="lg" onClick={talk}>Talk to us</Button>
          </div>
          <p className="mk-small mt-4">All 14 apps on Free · No credit card · Cards charged in USD</p>
        </div>
        <div className="mt-14">
          <Shot src="/shots/home/launcher.webp" alt="The Rivvra workspace home: every app on one screen" priority caption="Brightline Staffing, a demo workspace. Every screen on this site is the real product." />
        </div>
      </Section>

      {/* Flow */}
      <Section id="flow">
        <div className="max-w-2xl mb-12">
          <Eyebrow>From first call to payslip</Eyebrow>
          <h2 className="mk-display mk-h2">Five steps. One set of records.</h2>
          <p className="mk-lede mt-4">The client you win is the client you invoice. The consultant you place is the one whose hours you approve and whose payslip you release. Nothing is typed twice.</p>
        </div>
        <ol className="grid gap-16 m-0 p-0 list-none">
          {FLOW.map((s, i) => (
            <li key={s.n} className={`grid lg:grid-cols-12 gap-8 items-center`}>
              <div className={`lg:col-span-5 ${i % 2 ? 'lg:order-2' : ''}`}>
                <span className="mk-step-num">{s.n}</span>
                <h3 className="mk-h3 mt-4">{s.title}</h3>
                <p className="mk-p mt-3">{s.text}</p>
                <Link to={appHref(APPS.find((a) => a.id === s.app))} className="mk-btn mk-btn--ghost mk-btn--sm mt-4 -ml-3">See {APPS.find((a) => a.id === s.app).name} <ArrowRight style={{ width: 14, height: 14 }} /></Link>
              </div>
              <div className={`lg:col-span-7 ${i % 2 ? 'lg:order-1' : ''}`}>
                <Shot src={s.shot} alt={s.alt} />
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Apps */}
      <Section line id="apps">
        <div className="max-w-2xl mb-10">
          <Eyebrow>Fourteen apps</Eyebrow>
          <h2 className="mk-display mk-h2">Switch on what you need. Add the rest when you grow.</h2>
          <p className="mk-lede mt-4">Each app works on its own and gets better with the others. All of them are on every plan, including Free.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {APPS.map((a) => (
            <Link key={a.id} to={appHref(a)} className="mk-card mk-card--hover p-5 flex gap-4 items-start">
              <AppIcon app={a} />
              <span>
                <span className="mk-h4 block">{a.name}</span>
                <span className="mk-small block mt-1">{a.short}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Solutions */}
      <Section line id="solutions">
        <div className="max-w-2xl mb-10">
          <Eyebrow>Who it is for</Eyebrow>
          <h2 className="mk-display mk-h2">Built for the way staffing actually works.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {SOLUTIONS.map((s) => (
            <Link key={s.slug} to={solutionHref(s)} className="mk-card mk-card--hover overflow-hidden grid grid-rows-[auto_1fr]">
              <div className="p-6">
                <h3 className="mk-h3">{s.name}</h3>
                <p className="mk-p mt-2">{s.short}</p>
                <span className="mk-btn mk-btn--ghost mk-btn--sm mt-3 -ml-3">See how <ArrowRight style={{ width: 14, height: 14 }} /></span>
              </div>
              <div className="px-6 pb-0"><div className="mk-shot mk-shot--crop" style={{ borderBottom: 0, borderRadius: '12px 12px 0 0' }}><img src={s.hero} alt="" width="2400" height="1350" loading="lazy" decoding="async" /></div></div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Extension */}
      <Section line>
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <Eyebrow>Chrome extension</Eyebrow>
            <h2 className="mk-display mk-h2">LinkedIn to lead list in one click.</h2>
            <p className="mk-lede mt-4">Open a profile or a search, click Save, and the person is in Outreach with a title, a company and an ICP score. Sequences send from your own Gmail.</p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Button href={EXTENSION_URL} variant="secondary">Get the extension</Button>
              <Button to={appHref(APPS[0])} variant="ghost" arrow>How Outreach works</Button>
            </div>
          </div>
          <div className="lg:col-span-7"><ExtensionMock /></div>
        </div>
      </Section>

      {/* Assistant */}
      <Section line>
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 lg:order-2">
            <Eyebrow>Ask Rivvra</Eyebrow>
            <h2 className="mk-display mk-h2">Ask your workspace a question.</h2>
            <p className="mk-lede mt-4">Who is on the bench, which invoices are overdue, how many candidates reached L2 this month. Ask Rivvra answers from your data and shows its sources. It reads and never writes, and it respects who can see what.</p>
            <p className="mk-small mt-4">Counts toward the plan's monthly AI actions: 100 on Free, 2,000 on Growth, unlimited on Scale.</p>
          </div>
          <div className="lg:col-span-6 lg:order-1"><AssistantMock /></div>
        </div>
      </Section>

      {/* Pricing teaser */}
      <Section line id="pricing">
        <div className="max-w-2xl mb-10">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mk-display mk-h2">Per user. Every app. No surprises.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((p) => (
            <div key={p.id} className={`mk-card p-6 ${p.featured ? '' : ''}`} style={p.featured ? { borderColor: 'var(--mk-brand-line)', background: 'var(--mk-brand-soft)' } : undefined}>
              <p className="mk-h4">{p.name}</p>
              <p className="mk-display mt-2" style={{ fontSize: 40 }}>${p.price}<span className="mk-small" style={{ fontFamily: 'var(--mk-body)', fontSize: 14, marginLeft: 6 }}>{p.unit}</span></p>
              <p className="mk-small mt-2">{p.blurb}</p>
              <ul className="grid gap-2 mt-5 p-0 m-0 list-none">
                {Object.values(p.limits).map((l) => <li key={l} className="flex gap-2 text-[14px]" style={{ color: 'var(--mk-ink-2)' }}><Check style={{ width: 15, height: 15, color: 'var(--mk-brand-hi)', flexShrink: 0, marginTop: 3 }} />{l}</li>)}
                <li className="flex gap-2 text-[14px]" style={{ color: 'var(--mk-ink-2)' }}><Check style={{ width: 15, height: 15, color: 'var(--mk-brand-hi)', flexShrink: 0, marginTop: 3 }} />{p.support}</li>
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-8 items-center">
          <Button to="/pricing" variant="secondary" arrow>Compare plans</Button>
          <p className="mk-small">Annual billing: two months free.</p>
        </div>
      </Section>

      {/* Founding offer */}
      <Section line>
        <div className="mk-card p-8 md:p-12 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <Eyebrow>Founding agencies</Eyebrow>
            <h2 className="mk-display mk-h2">{FOUNDING.headline}</h2>
            <p className="mk-lede mt-4">{FOUNDING.text}</p>
          </div>
          <div className="grid gap-3">
            <div className="mk-pill mk-pill--brand mk-mono self-start" style={{ height: 34, fontSize: 14 }}>{FOUNDING.code}</div>
            <Button onClick={talk} size="lg">Claim a founding seat</Button>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section line id="faq">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mk-display mk-h2">Before you sign up.</h2>
            <p className="mk-p mt-4">Anything else, <button type="button" onClick={talk} className="mk-accent underline underline-offset-4">ask us</button>.</p>
          </div>
          <div className="lg:col-span-8 mk-faq">
            {HOME_FAQ.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p className="mk-p">{f.a}</p></details>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand title="Start with three seats. Keep them free." text="Sign up, create your workspace, and switch on the apps you need. Upgrade only when you outgrow the limits." onTalk={talk} />
    </>
  );
}
