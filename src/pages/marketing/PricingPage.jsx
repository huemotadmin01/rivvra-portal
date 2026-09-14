import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell, { useTalkToUs } from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, Button, AppIcon, CtaBand } from '../../components/marketing/shell/ui';
import { APPS, appHref } from '../../content/marketing/apps';
import { PLANS, FOUNDING } from '../../content/marketing/site';

const COMPARISON = [
  { feature: 'All 14 apps', free: true, growth: true, scale: true },
  { feature: 'Team members', free: '3', growth: '25', scale: 'Unlimited' },
  { feature: 'Active records', free: '500', growth: '10,000', scale: 'Unlimited' },
  { feature: 'Outreach emails a day', free: '50', growth: '500', scale: '2,000' },
  { feature: 'Storage', free: '2 GB', growth: '25 GB', scale: '100 GB' },
  { feature: 'AI actions a month', free: '100', growth: '2,000', scale: 'Unlimited' },
  { feature: 'Chrome extension', free: true, growth: true, scale: true },
  { feature: 'Custom email sending domain', free: false, growth: true, scale: true },
  { feature: 'Remove "Powered by Rivvra" from emails', free: false, growth: true, scale: true },
  { feature: 'Multiple legal entities per workspace', free: true, growth: true, scale: true },
  { feature: 'Role-based app access', free: true, growth: true, scale: true },
  { feature: 'Support', free: 'Email · 2 business days', growth: 'Email · 1 business day', scale: 'Priority · same day' },
];

const FAQS = [
  { q: 'Is the Free plan really free forever?', a: 'Yes. All 14 apps, no time limit, no card. It is capped at 3 team members, 500 active records, 50 outreach emails a day, 2 GB of storage and 100 AI actions a month. A résumé scored, an assistant answer or an AI-screened suggestion list each count as one action. When you outgrow any of those, upgrade.' },
  { q: 'What is the founding-agency offer?', a: `The first five agencies to join get 50% off Growth or Scale for 12 months. Enter ${FOUNDING.code} on the checkout page when you upgrade; it works while any of the five seats are left. We set your team up personally.` },
  { q: 'How does per-seat pricing work?', a: 'You pay per active user per month. Ten users on Growth is 10 × $3 = $30 a month; on Scale, 10 × $6 = $60. Deactivated users stop counting the same day.' },
  { q: 'What counts as an active record?', a: 'Candidates, leads, contacts, deals, employees, invoices and claims that are not archived. Archived records are kept and searchable but do not count.' },
  { q: 'What happens when I hit a limit?', a: 'Nothing is deleted. The action that would exceed the limit pauses and you are asked to upgrade. Everything you already have stays accessible.' },
  { q: 'Do you offer annual billing?', a: 'Yes. Annual billing gives two months free: you pay for ten months and get twelve, which makes Growth $2.50 and Scale $5.00 per user per month.' },
  { q: 'Which currency?', a: 'Prices are in US dollars and cards are charged in USD through Stripe. Invoices for your subscription are available from Billing.' },
  { q: 'Can I change plans or cancel any time?', a: 'Yes. Upgrade, downgrade or cancel from Billing. Changes apply immediately; a cancelled plan drops to Free at the end of the paid period.' },
];

function Cell({ v }) {
  if (v === true) return <Check style={{ width: 16, height: 16, color: 'var(--mk-brand-hi)' }} aria-label="Included" />;
  if (v === false) return <Minus style={{ width: 16, height: 16, color: 'var(--mk-faint)' }} aria-label="Not included" />;
  return <span>{v}</span>;
}

export default function PricingPage() {
  useDocumentMeta({ title: 'Pricing', description: 'Free forever for up to 3 users. Growth $3 and Scale $6 per user per month, every app on every plan, no credit card to start.', path: '/pricing' });
  return <Shell><Pricing /></Shell>;
}

function Pricing() {
  const talk = useTalkToUs();
  return (
    <>
      <Section className="pt-16 md:pt-24">
        <div className="max-w-2xl">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mk-display mk-h1">Per user. Every app. <span className="mk-accent">No surprises.</span></h1>
          <p className="mk-lede mt-6">Start free with three seats and all fourteen apps. Pay only when your team or your data outgrows the limits. Prices in USD.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {PLANS.map((p) => (
            <div key={p.id} className="mk-card p-6 flex flex-col" style={p.featured ? { borderColor: 'var(--mk-brand-line)', background: 'var(--mk-brand-soft)' } : undefined}>
              <div className="flex items-center justify-between"><p className="mk-h4">{p.name}</p>{p.featured && <span className="mk-pill mk-pill--brand">Most chosen</span>}</div>
              <p className="mk-display mt-3" style={{ fontSize: 44 }}>${p.price}<span className="mk-small" style={{ fontFamily: 'var(--mk-body)', fontSize: 14, marginLeft: 6 }}>{p.unit}</span></p>
              <p className="mk-small mt-2">{p.blurb}</p>
              <ul className="grid gap-2 mt-5 p-0 m-0 list-none">
                {[...Object.values(p.limits), p.support].map((l) => <li key={l} className="flex gap-2 text-[14px]" style={{ color: 'var(--mk-ink-2)' }}><Check style={{ width: 15, height: 15, color: 'var(--mk-brand-hi)', flexShrink: 0, marginTop: 3 }} />{l}</li>)}
              </ul>
              <div className="mt-auto pt-6"><Button to="/signup" variant={p.featured ? 'primary' : 'secondary'} className="w-full" arrow>{p.cta}</Button></div>
            </div>
          ))}
        </div>
        <p className="mk-small mt-5">Annual billing: two months free. No credit card for Free. Cancel any time.</p>
      </Section>

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <Eyebrow>Included on every plan</Eyebrow>
            <h2 className="mk-display mk-h2">All fourteen apps, from day one.</h2>
            <p className="mk-p mt-4">Plans differ by seats, records, sending volume, storage and AI actions. Never by which app you can open.</p>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-2">
            {APPS.map((a) => (
              <Link key={a.id} to={appHref(a)} className="mk-card mk-card--hover p-3 flex items-center gap-3">
                <AppIcon app={a} size={34} /><span className="text-[14px] font-medium" style={{ color: 'var(--mk-ink)' }}>{a.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      <Section line>
        <div className="max-w-2xl mb-8">
          <Eyebrow>Compare</Eyebrow>
          <h2 className="mk-display mk-h2">What changes between plans.</h2>
        </div>
        {/* Wide screens: a table. Phones: one stacked row per feature, so
            Growth and Scale are never hidden behind a horizontal scroll. */}
        <div className="hidden md:block">
          <table className="mk-table">
            <thead><tr><th style={{ width: '40%' }}>Feature</th><th>Free</th><th>Growth</th><th>Scale</th></tr></thead>
            <tbody>
              {COMPARISON.map((r) => (
                <tr key={r.feature}><td>{r.feature}</td><td><Cell v={r.free} /></td><td><Cell v={r.growth} /></td><td><Cell v={r.scale} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden grid gap-2">
          {COMPARISON.map((r) => (
            <div key={r.feature} className="mk-card p-4">
              <p className="mk-h4" style={{ fontSize: 15 }}>{r.feature}</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[['Free', r.free], ['Growth', r.growth], ['Scale', r.scale]].map(([k, v]) => (
                  <div key={k}><p className="mk-footer-head" style={{ marginBottom: 4 }}>{k}</p><p className="text-[13.5px]" style={{ color: 'var(--mk-ink-2)' }}><Cell v={v} /></p></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <Eyebrow>Worked example</Eyebrow>
            <h2 className="mk-display mk-h2">An eight-person agency.</h2>
            <p className="mk-p mt-4">Two recruiters, an account manager, someone on finance and HR, the founder, and three consultants who only fill timesheets and check payslips.</p>
          </div>
          <div className="lg:col-span-7 mk-card p-6">
            <table className="mk-table">
              <tbody>
                <tr><td>Free, up to 3 users</td><td className="mk-mono text-right">$0 / mo</td></tr>
                <tr><td>Growth, 8 users × $3</td><td className="mk-mono text-right">$24 / mo</td></tr>
                <tr><td>Scale, 8 users × $6</td><td className="mk-mono text-right">$48 / mo</td></tr>
              </tbody>
            </table>
            <p className="mk-small mt-4">On annual billing that is about $20 a month on Growth or $40 on Scale for the whole team. Consultants who only use self service still count as users.</p>
          </div>
        </div>
      </Section>

      <Section line>
        <div className="mk-brand-tint p-8 md:p-12 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <Eyebrow>Founding agencies</Eyebrow>
            <h2 className="mk-display mk-h2">{FOUNDING.headline}</h2>
            <p className="mk-lede mt-4">{FOUNDING.text}</p>
          </div>
          <div className="grid gap-3">
            <div className="mk-pill mk-mono self-start" style={{ height: 34, fontSize: 14, background: 'var(--mk-surface)' }}>{FOUNDING.code}</div>
            <Button onClick={talk} size="lg">Claim a founding seat</Button>
          </div>
        </div>
      </Section>

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4"><Eyebrow>Questions</Eyebrow><h2 className="mk-display mk-h2">Billing, plainly.</h2></div>
          <div className="lg:col-span-8 mk-faq">{FAQS.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="mk-p">{f.a}</p></details>)}</div>
        </div>
      </Section>

      <CtaBand title="Three seats, every app, free." text="Create a workspace in a minute. Upgrade when you outgrow it, not before." onTalk={talk} />
    </>
  );
}
