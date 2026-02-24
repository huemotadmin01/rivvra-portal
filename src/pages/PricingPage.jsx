import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, Mail, Clock, Target, UserPlus,
  CheckCircle, Check, X, HelpCircle, ChevronRight,
  Users, Shield, Layers, Zap
} from 'lucide-react';
import RivvraLogo from '../components/BrynsaLogo';

// ── Per-app pricing ──
const APP_PRICING = [
  {
    id: 'outreach',
    name: 'Outreach',
    icon: Mail,
    color: { bg: 'bg-rivvra-500/10', text: 'text-rivvra-400', badge: 'bg-rivvra-500/20 text-rivvra-300', border: 'border-rivvra-500/30' },
    price: 19,
    description: 'Lead extraction, AI emails, and automated sequences.',
    features: [
      'LinkedIn lead extraction',
      'AI email & DM generation',
      'Multi-step email sequences',
      'Reply & unsubscribe detection',
      'Smart lists & lead management',
      'Team collaboration & analytics',
      'Gmail OAuth integration',
      'Chrome extension access',
    ],
    status: 'live',
  },
  {
    id: 'timesheet',
    name: 'Timesheet',
    icon: Clock,
    color: { bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300', border: 'border-blue-500/30' },
    price: 9,
    description: 'Time tracking, approvals, and payroll for contractors.',
    features: [
      'Weekly time entry',
      'Manager approvals & comments',
      'Automatic pay calculations',
      'Project & client management',
      'Contractor onboarding',
      'Payroll export (CSV)',
      'Overtime & holiday tracking',
      'Role-based access (Admin / Manager / Contractor)',
    ],
    status: 'live',
  },
  {
    id: 'crm',
    name: 'CRM',
    icon: Target,
    color: { bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300', border: 'border-amber-500/30' },
    price: 15,
    description: 'Pipeline management and client relationships.',
    features: [
      'Kanban deal pipeline',
      'Contact & account management',
      'Activity logging',
      'Revenue forecasting',
      'Synced with Outreach leads',
      'Team performance reports',
    ],
    status: 'coming_soon',
  },
  {
    id: 'ats',
    name: 'ATS',
    icon: UserPlus,
    color: { bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300', border: 'border-purple-500/30' },
    price: 15,
    description: 'Applicant tracking and placement management.',
    features: [
      'Job posting management',
      'Candidate pipeline',
      'Interview scheduling',
      'Placement tracking',
      'Candidate database',
      'Recruiting analytics',
    ],
    status: 'coming_soon',
  },
];

// ── FAQs ──
const FAQS = [
  {
    q: 'How does the 14-day free trial work?',
    a: 'Sign up with your work email and get instant access to all apps for 14 days. No credit card required. Invite up to 5 team members during the trial. When the trial ends, you choose which apps to keep.',
  },
  {
    q: 'Can I start with one app and add more later?',
    a: 'Absolutely. Most teams start with Outreach or Timesheet, then add more apps as they need them. You only pay for what you use.',
  },
  {
    q: 'How does per-seat pricing work?',
    a: 'You pay per user, per app, per month. If you have 5 users on Outreach ($19/user) and 3 of them also use Timesheet ($9/user), you pay 5 x $19 + 3 x $9 = $122/month.',
  },
  {
    q: 'Can different team members have access to different apps?',
    a: 'Yes. Admins control exactly which apps each team member can access. You only pay for the apps each person actually uses.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'Your data is preserved. You downgrade to the free tier (1 user, limited features). Upgrade anytime to restore full access for your team.',
  },
  {
    q: 'Do you offer annual billing?',
    a: 'Not yet, but it is on our roadmap. Currently all plans are billed monthly with no long-term commitment.',
  },
  {
    q: 'Why is a work email required?',
    a: 'Rivvra is built for teams. Work emails help us create your org workspace and prevent duplicate accounts. Invited team members can use any email.',
  },
];

function PricingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* Nav */}
      <nav className="relative z-10 border-b border-dark-800/50 bg-dark-950/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-dark-800 flex items-center justify-center shadow-lg shadow-rivvra-500/20 group-hover:shadow-rivvra-500/30 transition-shadow">
                <RivvraLogo className="w-6 h-6" />
              </div>
              <span className="text-lg font-bold text-white">Rivvra</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link to="/features" className="text-sm text-dark-300 hover:text-white transition-colors">Features</Link>
              <Link to="/pricing" className="text-sm text-white font-medium">Pricing</Link>
              <Link to="/signup" className="px-5 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 transition-colors flex items-center gap-1.5">
                Start free trial
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <Link to="/signup" className="md:hidden px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero */}
        <section className="pt-16 pb-16 lg:pt-24 lg:pb-20">
          <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to home
            </Link>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
              Pay per user, per app
            </h1>
            <p className="text-lg text-dark-400 max-w-2xl mx-auto leading-relaxed">
              Only pay for the apps your team actually uses. Start with a 14-day
              free trial — all apps included, no credit card required.
            </p>
          </div>
        </section>

        {/* ── Trial banner ── */}
        <section className="pb-16">
          <div className="max-w-5xl mx-auto px-6">
            <div className="card p-6 lg:p-8 bg-gradient-to-r from-rivvra-500/5 via-dark-900 to-rivvra-400/5 border-rivvra-500/20">
              <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
                <div className="w-14 h-14 rounded-2xl bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-7 h-7 text-rivvra-400" />
                </div>
                <div className="flex-1 text-center lg:text-left">
                  <h3 className="text-lg font-semibold text-white mb-1">14-day free trial</h3>
                  <p className="text-dark-400 text-sm">
                    Every app unlocked. Up to 5 team members. No credit card. Work email required.
                  </p>
                </div>
                <Link to="/signup" className="px-6 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors flex items-center gap-2 flex-shrink-0">
                  Start trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── App pricing cards ── */}
        <section className="pb-24">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-6">
              {APP_PRICING.map((app) => {
                const Icon = app.icon;
                const c = app.color;
                const isComingSoon = app.status === 'coming_soon';

                return (
                  <div key={app.id} className={`card p-6 lg:p-8 ${isComingSoon ? 'opacity-60' : ''}`}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center`}>
                          <Icon className={`w-5.5 h-5.5 ${c.text}`} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{app.name}</h3>
                          <p className="text-xs text-dark-400">{app.description}</p>
                        </div>
                      </div>
                      {isComingSoon && (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-dark-700 text-dark-400">
                          Coming Soon
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mb-5 pt-2">
                      <span className="text-4xl font-bold text-white">${app.price}</span>
                      <span className="text-dark-400 text-sm">/user/month</span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 mb-6">
                      {app.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2.5 text-sm text-dark-300">
                          <CheckCircle className={`w-4 h-4 ${c.text} flex-shrink-0 mt-0.5`} />
                          {feat}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    {!isComingSoon ? (
                      <Link to="/signup" className={`block w-full text-center py-3 rounded-xl text-sm font-semibold transition-colors bg-dark-800 text-white border border-dark-600 hover:bg-dark-700`}>
                        Start with {app.name}
                      </Link>
                    ) : (
                      <div className="block w-full text-center py-3 rounded-xl text-sm font-medium bg-dark-800/50 text-dark-500 border border-dark-700 cursor-not-allowed">
                        Coming soon
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Pricing example ── */}
        <section className="py-20 border-t border-dark-800/50">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-3">Example: What you'd pay</h2>
              <p className="text-dark-400 text-sm">A typical staffing agency with 8 team members</p>
            </div>

            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-dark-800">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-rivvra-400" />
                  <span className="text-sm text-dark-300">Outreach &mdash; 5 users</span>
                </div>
                <span className="text-sm font-medium text-white">5 &times; $19 = $95</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-dark-800">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-dark-300">Timesheet &mdash; 8 users</span>
                </div>
                <span className="text-sm font-medium text-white">8 &times; $9 = $72</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-semibold text-white">Total per month</span>
                <span className="text-lg font-bold text-rivvra-400">$167/mo</span>
              </div>
              <p className="text-xs text-dark-500 text-center pt-1">
                That's about $20.88 per team member per month for two full apps.
              </p>
            </div>
          </div>
        </section>

        {/* ── Platform included ── */}
        <section className="py-20 border-t border-dark-800/50">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-white mb-3">Included with every plan</h2>
              <p className="text-dark-400 text-sm">Platform features that come with any app subscription.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: Shield, title: 'Per-user access control', desc: 'Admin controls who accesses what' },
                { icon: Users, title: 'Org workspaces', desc: 'Dedicated workspace for your team' },
                { icon: Layers, title: 'Cross-app sync', desc: 'Data flows between apps automatically' },
                { icon: Zap, title: 'Priority support', desc: 'Email support with fast response times' },
              ].map((item) => (
                <div key={item.title} className="card p-5 text-center">
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center mx-auto mb-3">
                    <item.icon className="w-5 h-5 text-rivvra-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                  <p className="text-xs text-dark-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQs ── */}
        <section className="py-20 border-t border-dark-800/50">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-white text-center mb-10">Frequently asked questions</h2>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="card overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-dark-800/30 transition-colors"
                  >
                    <span className="text-sm font-medium text-white pr-4">{faq.q}</span>
                    <ChevronRight className={`w-4 h-4 text-dark-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-5">
                      <p className="text-sm text-dark-400 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <div className="card p-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-rivvra-500/10 via-transparent to-rivvra-400/5" />
              <div className="relative space-y-5">
                <h2 className="text-2xl lg:text-3xl font-bold text-white">
                  Start your free trial today
                </h2>
                <p className="text-dark-400 max-w-md mx-auto">
                  14 days, all apps, up to 5 users. No credit card required.
                </p>
                <Link to="/signup" className="px-8 py-3 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors inline-flex items-center gap-2">
                  Get started
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-dark-800/50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center">
                <RivvraLogo className="w-5 h-5" />
              </div>
              <span className="font-semibold text-white">Rivvra</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-dark-400">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="mailto:support@rivvra.com" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-dark-500 text-sm">&copy; {new Date().getFullYear()} Rivvra. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PricingPage;
