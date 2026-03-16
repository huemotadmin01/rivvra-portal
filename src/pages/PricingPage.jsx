import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, ChevronRight, Zap, Shield,
  Users, Layers, Mail, Clock, Briefcase, UserSearch,
  Banknote, UsersRound, Contact, PenTool, CheckSquare, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MarketingLayout from '../components/marketing/MarketingLayout';

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: 'core',
    name: 'Core',
    price: 10,
    description: 'Essential tools to manage your agency operations.',
    badge: null,
    features: [
      'ATS \u2014 Applicant Tracking',
      'CRM \u2014 Sales Pipeline',
      'Contacts \u2014 Unified Directory',
      'Employee \u2014 HR Management',
      'Sign \u2014 Digital Signatures',
      'Payroll \u2014 Pay Processing',
      'Up to 25 team members',
      'Email support',
    ],
    cta: 'Get started with Core',
    highlight: false,
  },
  {
    id: 'all_apps',
    name: 'All Apps',
    price: 15,
    description: 'Full platform access with outreach and productivity tools.',
    badge: 'Best value',
    features: [
      'Everything in Core',
      'Outreach \u2014 Lead Gen & Sequences',
      'Timesheet \u2014 Time & Payroll Tracking',
      'To-Do \u2014 AI Task Management',
      'Unlimited team members',
      'Priority support',
      'Chrome extension access',
      'Cross-app workflows',
    ],
    cta: 'Get started with All Apps',
    highlight: true,
  },
];

// ── All apps (for "what's included") ──────────────────────────────────────────
const ALL_APPS = [
  { name: 'Outreach', icon: Mail, color: 'text-rivvra-400', status: 'Live' },
  { name: 'Timesheet', icon: Clock, color: 'text-blue-400', status: 'Live' },
  { name: 'CRM', icon: Briefcase, color: 'text-emerald-400', status: 'Coming Soon' },
  { name: 'ATS', icon: UserSearch, color: 'text-purple-400', status: 'Coming Soon' },
  { name: 'Payroll', icon: Banknote, color: 'text-amber-400', status: 'Beta' },
  { name: 'Employee', icon: UsersRound, color: 'text-orange-400', status: 'Beta' },
  { name: 'Contacts', icon: Contact, color: 'text-cyan-400', status: 'Beta' },
  { name: 'Sign', icon: PenTool, color: 'text-indigo-400', status: 'Beta' },
  { name: 'To-Do', icon: CheckSquare, color: 'text-teal-400', status: 'Beta' },
];

// ── FAQs ──────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'How does the 14-day free trial work?',
    a: 'Sign up with your work email and get instant access to all apps for 14 days. No credit card required. Invite your team during the trial. When it ends, choose a plan to keep going.',
  },
  {
    q: 'What\'s the difference between Core and All Apps?',
    a: 'Core ($10/user/mo) includes 6 essential apps: ATS, CRM, Contacts, Employee, Sign, and Payroll. All Apps ($15/user/mo) adds Outreach, Timesheet, and To-Do on top of Core, plus unlimited team members and priority support.',
  },
  {
    q: 'How does per-seat pricing work?',
    a: 'You pay per user per month. For example, 10 users on Core is 10 \u00d7 $10 = $100/month. On All Apps, that\'s 10 \u00d7 $15 = $150/month.',
  },
  {
    q: 'Can I change plans or cancel anytime?',
    a: 'Yes. Upgrade, downgrade, or cancel anytime from your billing settings. Changes take effect immediately. No long-term contracts.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'Your data is preserved. You can upgrade to a paid plan to restore full access. If you don\'t upgrade, access is limited until you choose a plan.',
  },
  {
    q: 'Do you offer annual billing?',
    a: 'Not yet, but it\'s on our roadmap. Currently all plans are billed monthly.',
  },
];

// ── Feature comparison ────────────────────────────────────────────────────────
const COMPARISON = [
  { feature: 'ATS', core: true, all_apps: true },
  { feature: 'CRM', core: true, all_apps: true },
  { feature: 'Contacts', core: true, all_apps: true },
  { feature: 'Employee', core: true, all_apps: true },
  { feature: 'Sign', core: true, all_apps: true },
  { feature: 'Payroll', core: true, all_apps: true },
  { feature: 'Outreach', core: false, all_apps: true },
  { feature: 'Timesheet', core: false, all_apps: true },
  { feature: 'To-Do', core: false, all_apps: true },
  { feature: 'Team members', core: 'Up to 25', all_apps: 'Unlimited' },
  { feature: 'Support', core: 'Email', all_apps: 'Priority' },
  { feature: 'Chrome extension', core: false, all_apps: true },
  { feature: 'Cross-app workflows', core: false, all_apps: true },
  { feature: 'Role-based access', core: true, all_apps: true },
];

function PricingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const { isAuthenticated, user } = useAuth?.() || {};
  const orgSlug = user?.defaultOrgSlug;

  function getCtaLink(planId) {
    if (isAuthenticated && orgSlug) {
      return `/org/${orgSlug}/upgrade?plan=${planId}`;
    }
    return '/signup';
  }

  function getCtaLabel(plan) {
    if (isAuthenticated && orgSlug) {
      return `Upgrade to ${plan.name}`;
    }
    return plan.cta;
  }

  return (
    <MarketingLayout activePage="/pricing">

      {/* ═══════════ HERO ═══════════════════════════════════════════════════ */}
      <section className="pt-20 pb-16 lg:pt-28 lg:pb-20">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-5">
          <h1 className="text-[40px] lg:text-[56px] font-bold text-white tracking-[-0.03em] leading-[1.1]">
            Simple, per-seat pricing
          </h1>
          <p className="text-lg text-dark-400 max-w-2xl mx-auto leading-relaxed">
            Two plans. Pick Core for essentials or All Apps for the full platform.
            Start with a 14-day free trial &mdash; no credit card required.
          </p>
        </div>
      </section>

      {/* ═══════════ TRIAL BANNER ═════════════════════════════════════════ */}
      <section className="pb-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-2xl border border-rivvra-500/20 bg-gradient-to-r from-rivvra-500/[0.04] via-dark-900/50 to-rivvra-400/[0.04] p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-rivvra-400" />
              </div>
              <div className="flex-1 text-center lg:text-left">
                <h3 className="text-base font-semibold text-white mb-1">14-day free trial</h3>
                <p className="text-dark-400 text-sm">Every app unlocked. No credit card. Work email required.</p>
              </div>
              <Link
                to="/signup"
                className="px-6 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-all hover:shadow-lg hover:shadow-rivvra-500/25 flex items-center gap-2 flex-shrink-0"
              >
                Start trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ PLAN CARDS ═══════════════════════════════════════════ */}
      <section className="pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-8 ${
                  plan.highlight
                    ? 'border-rivvra-500/30 bg-gradient-to-b from-rivvra-500/[0.04] to-transparent'
                    : 'border-white/[0.08] bg-white/[0.02]'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-8">
                    <span className="px-3 py-1 bg-rivvra-500 text-dark-950 rounded-full text-[11px] font-semibold">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                  <p className="text-[13px] text-dark-500">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-bold text-white">${plan.price}</span>
                  <span className="text-dark-500 text-sm">/user/month</span>
                </div>

                <Link
                  to={getCtaLink(plan.id)}
                  className={`block w-full text-center py-3 rounded-xl text-sm font-semibold transition-all ${
                    plan.highlight
                      ? 'bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 hover:shadow-lg hover:shadow-rivvra-500/25'
                      : 'bg-white/[0.06] text-white border border-white/[0.08] hover:bg-white/[0.1]'
                  }`}
                >
                  {getCtaLabel(plan)}
                </Link>

                <ul className="mt-8 space-y-3">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5 text-[13px] text-dark-300">
                      <CheckCircle className="w-4 h-4 text-rivvra-400 flex-shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ APPS INCLUDED ═══════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-[-0.02em] mb-3">
              All 9 apps available
            </h2>
            <p className="text-dark-400 text-sm">Core includes 6 essential apps. All Apps unlocks the full 9-app platform.</p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-9 gap-4">
            {ALL_APPS.map((app) => (
              <div key={app.name} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <app.icon className={`w-5 h-5 ${app.color}`} />
                <span className="text-[11px] font-medium text-dark-300">{app.name}</span>
                <span className="text-[9px] text-dark-600 uppercase tracking-wide">{app.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ COMPARISON TABLE ═════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white text-center mb-10 tracking-[-0.02em]">
            Compare plans
          </h2>

          <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-3 bg-white/[0.03] border-b border-white/[0.06]">
              <div className="p-4 text-[13px] text-dark-500 font-medium">Feature</div>
              <div className="p-4 text-[13px] text-white font-semibold text-center">Core</div>
              <div className="p-4 text-[13px] text-white font-semibold text-center">All Apps</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 ${i < COMPARISON.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div className="p-4 text-[13px] text-dark-400">{row.feature}</div>
                <div className="p-4 text-center">
                  {typeof row.core === 'boolean'
                    ? row.core
                      ? <CheckCircle className="w-4 h-4 text-rivvra-400 mx-auto" />
                      : <X className="w-4 h-4 text-dark-700 mx-auto" />
                    : <span className="text-[13px] text-dark-300">{row.core}</span>
                  }
                </div>
                <div className="p-4 text-center">
                  {typeof row.all_apps === 'boolean'
                    ? row.all_apps
                      ? <CheckCircle className="w-4 h-4 text-rivvra-400 mx-auto" />
                      : <X className="w-4 h-4 text-dark-700 mx-auto" />
                    : <span className="text-[13px] text-dark-300">{row.all_apps}</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PRICING EXAMPLE ══════════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white tracking-[-0.02em] mb-3">Example: What you'd pay</h2>
            <p className="text-dark-500 text-sm">A typical staffing agency with 8 team members</p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span className="text-[13px] text-dark-400">Core plan &mdash; 8 users</span>
                <span className="text-[13px] font-medium text-white">8 &times; $10 = $80</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span className="text-[13px] text-dark-400">All Apps plan &mdash; 8 users</span>
                <span className="text-[13px] font-medium text-white">8 &times; $15 = $120</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-semibold text-white">Starting from</span>
                <span className="text-xl font-bold text-rivvra-400">$80/mo</span>
              </div>
              <p className="text-[12px] text-dark-600 text-center pt-1">
                Start with Core at $10/user, or get the full platform at $15/user.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ PLATFORM INCLUDED ═══════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white tracking-[-0.02em] mb-3">Included with every plan</h2>
            <p className="text-dark-400 text-sm">Platform features that come standard.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Shield, title: 'Per-user access control', desc: 'Admin controls who accesses what' },
              { icon: Users, title: 'Org workspaces', desc: 'Dedicated workspace for your team' },
              { icon: Layers, title: 'Cross-app sync', desc: 'Data flows between apps automatically' },
              { icon: Zap, title: 'Email support', desc: 'Fast response times for all plans' },
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
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white text-center mb-10 tracking-[-0.02em]">
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
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.02] p-14 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-rivvra-500/[0.06] via-transparent to-emerald-500/[0.04]" />
            <div className="relative space-y-5">
              <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-[-0.02em]">
                Start your free trial today
              </h2>
              <p className="text-dark-400 max-w-md mx-auto text-sm">
                14 days, all apps, no credit card required.
              </p>
              <Link
                to="/signup"
                className="px-8 py-3.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-all hover:shadow-lg hover:shadow-rivvra-500/25 inline-flex items-center gap-2"
              >
                Get started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

export default PricingPage;
