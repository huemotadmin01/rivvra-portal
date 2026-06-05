import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, ChevronRight, Zap, Shield, Sparkles,
  Users, Layers, Mail, Clock, Briefcase, UserSearch,
  Banknote, UsersRound, Contact, PenTool, CheckSquare, X,
  Receipt, Wallet, Award, FolderArchive, BookOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MarketingLayout from '../components/marketing/MarketingLayout';

const FOUNDING_MAILTO =
  'mailto:support@rivvra.com?subject=Founding%20agency%20offer&body=Hi%20Rivvra%20team%2C%20we%27d%20like%20to%20claim%20the%20founding-agency%20offer%20(50%25%20off%20for%2012%20months).';

// ── Plans (per user / month, billed monthly) ───────────────────────────────────
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Run your agency free, forever — perfect to get started.',
    badge: null,
    cta: 'Start for free',
    highlight: false,
    features: [
      'All 14 apps included',
      'Up to 3 team members',
      '500 active records',
      '50 outreach emails / day',
      '2 GB storage',
      'AI features (trial)',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 3,
    tagline: 'For growing agencies running day-to-day operations.',
    badge: 'Most popular',
    cta: 'Choose Growth',
    highlight: true,
    features: [
      'Everything in Free, plus —',
      'Up to 25 team members',
      '10,000 active records',
      '500 outreach emails / day',
      '25 GB storage',
      'AI features included',
      'Email support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 6,
    tagline: 'For established teams running at full throttle.',
    badge: null,
    cta: 'Choose Scale',
    highlight: false,
    features: [
      'Everything in Growth, plus —',
      'Unlimited team members',
      'Unlimited active records',
      '2,000 outreach emails / day',
      '100 GB storage',
      'AI features included',
      'Priority support',
    ],
  },
];

// ── All apps (included in every plan) ──────────────────────────────────────────
const ALL_APPS = [
  { name: 'Outreach', icon: Mail, color: 'text-rivvra-400', status: 'Live' },
  { name: 'ESS', icon: Clock, color: 'text-blue-400', status: 'Live' },
  { name: 'CRM', icon: Briefcase, color: 'text-emerald-400', status: 'Coming Soon' },
  { name: 'ATS', icon: UserSearch, color: 'text-purple-400', status: 'Coming Soon' },
  { name: 'Payroll', icon: Banknote, color: 'text-amber-400', status: 'Beta' },
  { name: 'Employee', icon: UsersRound, color: 'text-orange-400', status: 'Beta' },
  { name: 'Contacts', icon: Contact, color: 'text-cyan-400', status: 'Beta' },
  { name: 'Sign', icon: PenTool, color: 'text-indigo-400', status: 'Beta' },
  { name: 'To-Do', icon: CheckSquare, color: 'text-teal-400', status: 'Beta' },
  { name: 'Invoicing', icon: Receipt, color: 'text-amber-400', status: 'Live' },
  { name: 'Expenses', icon: Wallet, color: 'text-emerald-400', status: 'Live' },
  { name: 'Incentive', icon: Award, color: 'text-fuchsia-400', status: 'Live' },
  { name: 'Documents', icon: FolderArchive, color: 'text-slate-300', status: 'Live' },
  { name: 'Knowledge Base', icon: BookOpen, color: 'text-sky-400', status: 'Live' },
];

// ── Plan comparison ────────────────────────────────────────────────────────────
const COMPARISON = [
  { feature: 'All 14 apps', free: true, growth: true, scale: true },
  { feature: 'Team members', free: '3', growth: '25', scale: 'Unlimited' },
  { feature: 'Active records', free: '500', growth: '10,000', scale: 'Unlimited' },
  { feature: 'Outreach emails / day', free: '50', growth: '500', scale: '2,000' },
  { feature: 'Storage', free: '2 GB', growth: '25 GB', scale: '100 GB' },
  { feature: 'AI features', free: 'Trial', growth: true, scale: true },
  { feature: 'Chrome extension', free: true, growth: true, scale: true },
  { feature: 'Cross-app workflows', free: true, growth: true, scale: true },
  { feature: 'Role-based access', free: true, growth: true, scale: true },
  { feature: 'Support', free: 'Email', growth: 'Email', scale: 'Priority' },
];

// ── FAQs ──────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'Is the Free plan really free forever?',
    a: 'Yes. The Free plan gives you all 14 apps with no time limit and no credit card. It is capped at 3 team members, 500 active records, 50 outreach emails per day, and 2 GB of storage. When you outgrow any of those, upgrade to Growth or Scale.',
  },
  {
    q: 'What is the founding-agency offer?',
    a: 'The first 5 agencies to join get 50% off Growth or Scale for 12 months, with the rate locked for that year. Email support@rivvra.com to claim it — we will set your team up personally.',
  },
  {
    q: 'How does per-seat pricing work?',
    a: 'You pay per active user per month. For example, 10 users on Growth is 10 × $3 = $30/month. On Scale, that is 10 × $6 = $60/month. The Free plan is always $0.',
  },
  {
    q: 'What happens when I hit a plan limit?',
    a: 'We never delete your data. When you reach a limit (seats, records, emails/day, or storage) the related action pauses and we prompt you to upgrade. Everything you already have stays accessible.',
  },
  {
    q: 'Do you offer annual billing?',
    a: 'Yes. Switch to annual and get 2 months free — you pay for 10 months and get 12. That makes Growth effectively $2.50/user/mo and Scale $5.00/user/mo.',
  },
  {
    q: 'Can I change plans or cancel anytime?',
    a: 'Yes. Upgrade, downgrade, or cancel anytime from billing settings. Changes take effect immediately and there are no long-term contracts.',
  },
];

// Serif eyebrow to match the marketing system
function Eyebrow({ children }) {
  return (
    <p className="text-dark-500 text-sm tracking-wide mb-4">
      <span className="font-serif-accent italic text-rivvra-400/90 text-[17px]">{children}</span>
    </p>
  );
}

// Price for the big number, reactive to the billing toggle.
function priceFor(plan, annual) {
  if (plan.price === 0) return { big: '$0', unit: 'forever', sub: 'No credit card' };
  if (annual) {
    const perMo = (plan.price * 10) / 12; // 2 months free
    return {
      big: `$${perMo.toFixed(2)}`,
      unit: '/user/mo',
      sub: `billed annually · $${plan.price * 10}/user/yr`,
    };
  }
  return { big: `$${plan.price}`, unit: '/user/mo', sub: 'billed monthly' };
}

function Cell({ value }) {
  if (typeof value === 'boolean') {
    return value
      ? <CheckCircle className="w-4 h-4 text-rivvra-400 mx-auto" />
      : <X className="w-4 h-4 text-dark-700 mx-auto" />;
  }
  return <span className="text-[13px] text-dark-200 font-medium">{value}</span>;
}

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const { isAuthenticated, user } = useAuth?.() || {};
  const orgSlug = user?.defaultOrgSlug;

  function getCtaLink() {
    if (isAuthenticated && orgSlug) return `/org/${orgSlug}/upgrade`;
    return '/signup';
  }

  return (
    <MarketingLayout activePage="/pricing">

      {/* ═══════════ HERO ═══════════════════════════════════════════════════ */}
      <section className="relative grain pt-20 pb-10 lg:pt-28">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[760px] h-[600px] aurora rounded-full blur-[120px] opacity-60" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <Eyebrow>pricing</Eyebrow>
          <h1 className="font-marketing text-[40px] lg:text-[58px] font-extrabold text-white tracking-[-0.03em] leading-[1.04]">
            Start free. Pay only{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rivvra-300 via-rivvra-400 to-emerald-300">
              as you grow.
            </span>
          </h1>
          <p className="text-lg text-dark-400 max-w-2xl mx-auto leading-relaxed mt-6">
            All 14 apps on every plan — including Free. Per-seat pricing, no credit card to start,
            and you only upgrade when your team outgrows the limits.
          </p>

          {/* billing toggle */}
          <div className="inline-flex items-center gap-1 mt-8 p-1 rounded-full border border-white/[0.08] bg-white/[0.03]">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${!annual ? 'bg-white/[0.08] text-white' : 'text-dark-400 hover:text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 ${annual ? 'bg-white/[0.08] text-white' : 'text-dark-400 hover:text-white'}`}
            >
              Annual
              <span className="text-[10px] font-semibold text-rivvra-300 bg-rivvra-500/15 ring-1 ring-rivvra-500/25 rounded px-1.5 py-0.5">2 months free</span>
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════ FOUNDING OFFER ═══════════════════════════════════════ */}
      <section className="pb-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative grain rounded-2xl border border-rivvra-500/25 bg-dark-900/50 p-6 lg:p-7 overflow-hidden">
            <div className="absolute inset-0 aurora opacity-50 pointer-events-none" />
            <div className="relative flex flex-col lg:flex-row items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-rivvra-500/15 ring-1 ring-rivvra-500/25 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-rivvra-300" />
              </div>
              <div className="flex-1 text-center lg:text-left">
                <h3 className="font-marketing text-lg font-bold text-white">
                  Founding agencies — 50% off for 12 months
                </h3>
                <p className="text-dark-400 text-sm mt-1">
                  The first <span className="text-rivvra-300 font-medium">5 agencies</span> get half-price Growth or Scale, rate locked for a year. We onboard you personally.
                </p>
              </div>
              <a
                href={FOUNDING_MAILTO}
                className="px-6 py-3 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-all hover:shadow-lg hover:shadow-rivvra-500/25 flex items-center gap-2 flex-shrink-0"
              >
                Claim founding offer
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ PLAN CARDS ═══════════════════════════════════════════ */}
      <section className="pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map((plan) => {
              const p = priceFor(plan, annual);
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border p-7 flex flex-col ${
                    plan.highlight
                      ? 'border-rivvra-500/40 bg-rivvra-500/[0.05] shadow-mock'
                      : 'border-white/[0.08] bg-white/[0.02]'
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-rivvra-500 text-dark-950 rounded-full text-[11px] font-semibold whitespace-nowrap">
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className="font-marketing text-xl font-bold text-white">{plan.name}</h3>
                    <p className="text-[13px] text-dark-500 mt-1 min-h-[36px]">{plan.tagline}</p>
                  </div>

                  <div className="mb-1 flex items-baseline gap-1.5">
                    <span className="font-marketing text-[44px] font-bold text-white leading-none tracking-[-0.02em]">{p.big}</span>
                    <span className="text-dark-500 text-sm">{p.unit}</span>
                  </div>
                  <p className="text-[12px] text-dark-500 mb-6 h-4">{p.sub}</p>

                  <Link
                    to={getCtaLink()}
                    className={`block w-full text-center py-3 rounded-xl text-sm font-semibold transition-all ${
                      plan.highlight
                        ? 'bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 hover:shadow-lg hover:shadow-rivvra-500/25'
                        : 'bg-white/[0.06] text-white border border-white/[0.08] hover:bg-white/[0.1]'
                    }`}
                  >
                    {plan.cta}
                  </Link>

                  <ul className="mt-7 space-y-3">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-[13px] text-dark-300">
                        <CheckCircle className="w-4 h-4 text-rivvra-400 flex-shrink-0 mt-0.5" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="text-center text-[12px] text-dark-600 mt-6">
            Limits are per workspace. Reach one and we prompt an upgrade — your data is always kept.
          </p>
        </div>
      </section>

      {/* ═══════════ APPS INCLUDED ═══════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-marketing text-2xl lg:text-[34px] font-bold text-white tracking-[-0.02em] mb-3">
              All 14 apps — on every plan
            </h2>
            <p className="text-dark-400 text-sm">Even Free. Plans differ on team size and usage, never on which apps you get.</p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {ALL_APPS.map((app) => (
              <div key={app.name} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <app.icon className={`w-5 h-5 ${app.color}`} />
                <span className="text-[11px] font-medium text-dark-300 text-center">{app.name}</span>
                <span className="text-[9px] text-dark-600 uppercase tracking-wide">{app.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ COMPARISON TABLE ═════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.05]">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-marketing text-2xl lg:text-[34px] font-bold text-white text-center mb-10 tracking-[-0.02em]">
            Compare plans
          </h2>

          <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
            <div className="grid grid-cols-4 bg-white/[0.03] border-b border-white/[0.06]">
              <div className="p-4 text-[13px] text-dark-500 font-medium">Feature</div>
              <div className="p-4 text-[13px] text-white font-semibold text-center">Free</div>
              <div className="p-4 text-[13px] text-rivvra-300 font-semibold text-center">Growth</div>
              <div className="p-4 text-[13px] text-white font-semibold text-center">Scale</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-4 items-center ${i < COMPARISON.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div className="p-4 text-[13px] text-dark-400">{row.feature}</div>
                <div className="p-4 text-center"><Cell value={row.free} /></div>
                <div className="p-4 text-center"><Cell value={row.growth} /></div>
                <div className="p-4 text-center"><Cell value={row.scale} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PRICING EXAMPLE ══════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="font-marketing text-2xl lg:text-[34px] font-bold text-white tracking-[-0.02em] mb-3">What an 8-person agency pays</h2>
            <p className="text-dark-500 text-sm">Per-seat, billed monthly</p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="space-y-1">
              <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
                <span className="text-[13px] text-dark-400">Free — up to 3 users</span>
                <span className="text-[13px] font-medium text-white">$0 / mo</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
                <span className="text-[13px] text-dark-400">Growth — 8 users</span>
                <span className="text-[13px] font-medium text-white">8 × $3 = $24 / mo</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[13px] text-dark-400">Scale — 8 users</span>
                <span className="text-[13px] font-medium text-white">8 × $6 = $48 / mo</span>
              </div>
              <p className="text-[12px] text-dark-600 text-center pt-3">
                On annual billing that’s ~$20/mo (Growth) or ~$40/mo (Scale) for the whole team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ INCLUDED WITH EVERY PLAN ════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-marketing text-2xl lg:text-[34px] font-bold text-white tracking-[-0.02em] mb-3">Included with every plan</h2>
            <p className="text-dark-400 text-sm">The platform foundations — even on Free.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Shield, title: 'Per-user access control', desc: 'Admins control who accesses what' },
              { icon: Users, title: 'Org workspaces', desc: 'Company-scoped, isolated data' },
              { icon: Layers, title: 'Cross-app workflows', desc: 'Data flows between apps automatically' },
              { icon: Zap, title: 'All 14 apps', desc: 'No app is ever locked behind a tier' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center">
                <div className="w-10 h-10 rounded-xl border border-white/[0.06] bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-5 h-5 text-rivvra-400" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-[12px] text-dark-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FAQS ════════════════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-marketing text-2xl lg:text-[34px] font-bold text-white text-center mb-10 tracking-[-0.02em]">
            Frequently asked questions
          </h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-[13px] font-medium text-white pr-4">{faq.q}</span>
                  <ChevronRight className={`w-4 h-4 text-dark-500 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-90' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5">
                    <p className="text-[13px] text-dark-400 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA ═════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative grain rounded-[28px] border border-white/[0.08] bg-dark-900/40 px-8 py-14 lg:px-16 lg:py-16 overflow-hidden text-center">
            <div className="absolute inset-0 aurora opacity-70 pointer-events-none" />
            <div className="relative">
              <h2 className="font-marketing text-[30px] lg:text-[44px] font-bold text-white tracking-[-0.03em] leading-[1.05]">
                Start free today
                <span className="block font-serif-accent italic font-normal text-dark-400 text-[22px] lg:text-[32px] mt-2">
                  upgrade only when you grow.
                </span>
              </h2>
              <p className="text-dark-400 max-w-md mx-auto text-base mt-6">
                All 14 apps, no credit card. Founding agencies get 50% off for a year.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/signup"
                  className="px-9 py-4 bg-rivvra-500 text-dark-950 rounded-xl text-[15px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-xl hover:shadow-rivvra-500/25 inline-flex items-center justify-center gap-2"
                >
                  Start for free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href={FOUNDING_MAILTO}
                  className="px-9 py-4 bg-white/[0.04] text-white border border-white/[0.08] rounded-xl text-[15px] font-semibold hover:bg-white/[0.07] transition-all inline-flex items-center justify-center gap-2"
                >
                  Claim founding offer
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

export default PricingPage;
