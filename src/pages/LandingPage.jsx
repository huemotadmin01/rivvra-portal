import { Link } from 'react-router-dom';
import {
  ArrowRight, Users, Clock, Target, BarChart3,
  Zap, Shield, Building2, ChevronRight, CheckCircle,
  Briefcase, UserPlus, CalendarCheck, LineChart,
  Mail, Globe, Star, Layers
} from 'lucide-react';
import RivvraLogo from '../components/BrynsaLogo';

// ── App cards for the platform showcase ──
const PLATFORM_APPS = [
  {
    id: 'outreach',
    name: 'Outreach',
    description: 'Find leads on LinkedIn, generate AI emails, and run automated email sequences — all from one place.',
    icon: Mail,
    color: 'rivvra',
    status: 'live',
    features: ['LinkedIn lead extraction', 'AI email generation', 'Automated sequences', 'Reply detection'],
  },
  {
    id: 'timesheet',
    name: 'Timesheet',
    description: 'Track contractor hours, manage projects, and run payroll — built for staffing agencies.',
    icon: Clock,
    color: 'blue',
    status: 'live',
    features: ['Time tracking', 'Project management', 'Payroll & earnings', 'Manager approvals'],
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Manage your candidate and client pipeline with deals, activities, and reporting.',
    icon: Target,
    color: 'amber',
    status: 'coming_soon',
    features: ['Pipeline management', 'Deal tracking', 'Activity logging', 'Revenue forecasting'],
  },
  {
    id: 'ats',
    name: 'ATS',
    description: 'Track applicants from sourcing to placement with a recruiting-first applicant tracking system.',
    icon: UserPlus,
    color: 'purple',
    status: 'coming_soon',
    features: ['Job postings', 'Candidate tracking', 'Interview scheduling', 'Placement management'],
  },
];

const STATS = [
  { value: '2,500+', label: 'Sales teams' },
  { value: '500K+', label: 'Leads extracted' },
  { value: '98%', label: 'Uptime' },
  { value: '4.8/5', label: 'User rating' },
];

const TESTIMONIALS = [
  {
    quote: 'Rivvra replaced three tools for us. Outreach, timesheets, and team management — all in one dashboard.',
    name: 'Sarah Chen',
    title: 'Director of Operations',
    company: 'TalentBridge Staffing',
  },
  {
    quote: 'We cut our contractor onboarding time in half. The timesheet + outreach combo is exactly what staffing agencies need.',
    name: 'Marcus Johnson',
    title: 'CEO',
    company: 'Apex Workforce Solutions',
  },
  {
    quote: 'The per-app pricing means we only pay for what we use. Started with Outreach, added Timesheet when we were ready.',
    name: 'Priya Sharma',
    title: 'Head of Recruitment',
    company: 'Nexus Staffing',
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* ── Subtle background ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-rivvra-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-40 right-10 w-96 h-96 bg-rivvra-400/5 rounded-full blur-3xl" />
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* NAVIGATION                                                */}
      {/* ══════════════════════════════════════════════════════════ */}
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
              <Link to="/pricing" className="text-sm text-dark-300 hover:text-white transition-colors">Pricing</Link>
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
        {/* ══════════════════════════════════════════════════════════ */}
        {/* HERO                                                      */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="pt-20 pb-24 lg:pt-28 lg:pb-32">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto text-center space-y-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rivvra-500/10 border border-rivvra-500/20">
                <Layers className="w-3.5 h-3.5 text-rivvra-400" />
                <span className="text-sm text-rivvra-300 font-medium">The all-in-one staffing platform</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
                <span className="text-white">Run your staffing agency</span>
                <br />
                <span className="text-gradient">from one platform</span>
              </h1>

              {/* Sub */}
              <p className="text-lg lg:text-xl text-dark-300 max-w-2xl mx-auto leading-relaxed">
                Outreach, timesheets, CRM, and hiring — modular apps that work
                together so your team stays on the same page.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link to="/signup" className="px-8 py-3.5 bg-rivvra-500 text-dark-950 rounded-xl text-base font-semibold hover:bg-rivvra-400 transition-colors flex items-center justify-center gap-2">
                  Start 14-day free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/features" className="px-8 py-3.5 bg-dark-800 text-white border border-dark-700 rounded-xl text-base font-semibold hover:bg-dark-750 hover:border-dark-600 transition-colors flex items-center justify-center gap-2">
                  See all features
                </Link>
              </div>

              <p className="text-dark-500 text-sm">Work email required &middot; No credit card needed</p>
            </div>

            {/* Stats bar */}
            <div className="mt-20 max-w-3xl mx-auto">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {STATS.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                    <div className="text-sm text-dark-400 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* PLATFORM APPS GRID                                        */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="py-24 border-t border-dark-800/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                One platform, every tool you need
              </h2>
              <p className="text-dark-400 text-lg max-w-2xl mx-auto">
                Pick the apps you need. Each one is purpose-built for staffing
                agencies and works seamlessly with the others.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {PLATFORM_APPS.map((app) => {
                const Icon = app.icon;
                const colorMap = {
                  rivvra: { bg: 'bg-rivvra-500/10', text: 'text-rivvra-400', border: 'border-rivvra-500/20', badge: 'bg-rivvra-500/20 text-rivvra-300' },
                  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', badge: 'bg-blue-500/20 text-blue-300' },
                  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', badge: 'bg-amber-500/20 text-amber-300' },
                  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', badge: 'bg-purple-500/20 text-purple-300' },
                };
                const c = colorMap[app.color];

                return (
                  <div key={app.id} className="card p-6 lg:p-8 hover:border-dark-600 transition-colors group">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 ${c.text}`} />
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                        app.status === 'live' ? c.badge : 'bg-dark-700 text-dark-400'
                      }`}>
                        {app.status === 'live' ? 'Live' : 'Coming Soon'}
                      </span>
                    </div>

                    <h3 className="text-xl font-semibold text-white mb-2">{app.name}</h3>
                    <p className="text-dark-400 text-sm mb-5 leading-relaxed">{app.description}</p>

                    <div className="grid grid-cols-2 gap-2">
                      {app.features.map((feat) => (
                        <div key={feat} className="flex items-center gap-2 text-sm text-dark-300">
                          <CheckCircle className={`w-3.5 h-3.5 ${c.text} flex-shrink-0`} />
                          {feat}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-center mt-10">
              <Link to="/features" className="inline-flex items-center gap-2 text-rivvra-400 hover:text-rivvra-300 font-medium text-sm transition-colors">
                Explore all features in detail
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* HOW IT WORKS                                              */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="py-24 border-t border-dark-800/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                Get started in 3 minutes
              </h2>
              <p className="text-dark-400 text-lg max-w-xl mx-auto">
                Create your workspace, pick your apps, and invite your team.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {[
                {
                  step: '01',
                  title: 'Create your workspace',
                  desc: 'Sign up with your work email. We auto-create your org and assign you as admin.',
                  icon: Building2,
                },
                {
                  step: '02',
                  title: 'Choose your apps',
                  desc: 'Start with Outreach, Timesheet, or both. Add more apps as your team grows.',
                  icon: Layers,
                },
                {
                  step: '03',
                  title: 'Invite your team',
                  desc: 'Add teammates with per-app access control. They get exactly the tools they need.',
                  icon: Users,
                },
              ].map((item) => (
                <div key={item.step} className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-dark-800 border border-dark-700">
                    <item.icon className="w-6 h-6 text-rivvra-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-rivvra-400 uppercase tracking-wider">Step {item.step}</span>
                    <h3 className="text-lg font-semibold text-white mt-1">{item.title}</h3>
                  </div>
                  <p className="text-dark-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* BUILT FOR STAFFING                                        */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="py-24 border-t border-dark-800/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rivvra-500/10 border border-rivvra-500/20">
                  <Briefcase className="w-3.5 h-3.5 text-rivvra-400" />
                  <span className="text-xs text-rivvra-300 font-medium">Purpose-built for staffing</span>
                </div>
                <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
                  Every tool a staffing agency needs — nothing more
                </h2>
                <p className="text-dark-400 text-lg leading-relaxed">
                  Most platforms try to serve everyone. Rivvra is built specifically
                  for staffing agencies, recruiters, and workforce management teams.
                  Every feature is designed around how you actually work.
                </p>
                <ul className="space-y-4 pt-2">
                  {[
                    { icon: Shield, text: 'Per-user app access — admins control who sees what' },
                    { icon: Globe, text: 'Org-scoped workspaces with team collaboration' },
                    { icon: BarChart3, text: 'Cross-app analytics for full pipeline visibility' },
                    { icon: Zap, text: 'Automated workflows between apps' },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <item.icon className="w-4 h-4 text-rivvra-400" />
                      </div>
                      <span className="text-dark-300 text-sm leading-relaxed">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mini app launcher preview */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-rivvra-500/10 to-rivvra-400/5 rounded-3xl blur-2xl" />
                <div className="relative card p-8 space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center">
                      <RivvraLogo className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Acme Staffing</p>
                      <p className="text-xs text-dark-400">3 apps active &middot; 8 members</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Outreach', icon: Mail, color: 'text-rivvra-400', bg: 'bg-rivvra-500/10' },
                      { name: 'Timesheet', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                      { name: 'CRM', icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10', locked: true },
                      { name: 'ATS', icon: UserPlus, color: 'text-purple-400', bg: 'bg-purple-500/10', locked: true },
                    ].map((app) => (
                      <div key={app.name} className={`flex items-center gap-3 p-3.5 rounded-xl bg-dark-800/60 border border-dark-700/50 ${app.locked ? 'opacity-50' : ''}`}>
                        <div className={`w-9 h-9 rounded-lg ${app.bg} flex items-center justify-center`}>
                          <app.icon className={`w-4.5 h-4.5 ${app.color}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{app.name}</p>
                          <p className="text-xs text-dark-500">{app.locked ? 'Coming soon' : 'Active'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="flex -space-x-2">
                      {['S', 'M', 'P', 'Y'].map((l, i) => (
                        <div key={i} className="w-7 h-7 rounded-full bg-dark-700 border-2 border-dark-900 flex items-center justify-center">
                          <span className="text-xs font-semibold text-dark-300">{l}</span>
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-dark-500 ml-1">+4 team members</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TESTIMONIALS                                              */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="py-24 border-t border-dark-800/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                Trusted by staffing teams everywhere
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="card p-6 space-y-4">
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-rivvra-400 text-rivvra-400" />
                    ))}
                  </div>
                  <p className="text-dark-300 text-sm leading-relaxed italic">"{t.quote}"</p>
                  <div className="pt-2 border-t border-dark-800">
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="text-xs text-dark-400">{t.title}, {t.company}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* PRICING TEASER                                            */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="py-24 border-t border-dark-800/50">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Pay only for what you use
            </h2>
            <p className="text-dark-400 text-lg mb-10 max-w-xl mx-auto">
              Per-seat, per-app pricing. Start with a 14-day free trial of every
              app — no credit card required.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              {[
                { app: 'Outreach', price: '$19', icon: Mail, color: 'text-rivvra-400' },
                { app: 'Timesheet', price: '$9', icon: Clock, color: 'text-blue-400' },
                { app: 'CRM', price: '$15', icon: Target, color: 'text-amber-400', soon: true },
                { app: 'ATS', price: '$15', icon: UserPlus, color: 'text-purple-400', soon: true },
              ].map((item) => (
                <div key={item.app} className={`card p-5 text-center ${item.soon ? 'opacity-50' : ''}`}>
                  <item.icon className={`w-6 h-6 ${item.color} mx-auto mb-3`} />
                  <p className="text-sm font-medium text-white">{item.app}</p>
                  <p className="text-2xl font-bold text-white mt-1">{item.price}<span className="text-sm font-normal text-dark-400">/user/mo</span></p>
                  {item.soon && <p className="text-xs text-dark-500 mt-1">Coming soon</p>}
                </div>
              ))}
            </div>

            <Link to="/pricing" className="inline-flex items-center gap-2 text-rivvra-400 hover:text-rivvra-300 font-medium text-sm transition-colors">
              View full pricing details
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* CTA                                                       */}
        {/* ══════════════════════════════════════════════════════════ */}
        <section className="py-24">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <div className="card p-12 lg:p-16 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-rivvra-500/10 via-transparent to-rivvra-400/5" />
              <div className="relative space-y-6">
                <h2 className="text-3xl lg:text-4xl font-bold text-white">
                  Ready to run your agency smarter?
                </h2>
                <p className="text-dark-400 text-lg max-w-xl mx-auto">
                  Start your 14-day free trial today. All apps included,
                  up to 5 team members, no credit card required.
                </p>
                <div className="pt-2">
                  <Link to="/signup" className="px-10 py-4 bg-rivvra-500 text-dark-950 rounded-xl text-base font-semibold hover:bg-rivvra-400 transition-colors inline-flex items-center gap-2">
                    Start free trial
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </div>
                <p className="text-dark-500 text-sm">Work email required</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* FOOTER                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-dark-800/50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="space-y-3">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center">
                  <RivvraLogo className="w-5 h-5" />
                </div>
                <span className="font-semibold text-white">Rivvra</span>
              </Link>
              <p className="text-dark-500 text-sm">The all-in-one platform for staffing agencies.</p>
            </div>

            {/* Product */}
            <div>
              <p className="text-sm font-semibold text-white mb-3">Product</p>
              <ul className="space-y-2">
                <li><Link to="/features" className="text-sm text-dark-400 hover:text-white transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="text-sm text-dark-400 hover:text-white transition-colors">Pricing</Link></li>
                <li><Link to="/signup" className="text-sm text-dark-400 hover:text-white transition-colors">Get started</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <p className="text-sm font-semibold text-white mb-3">Company</p>
              <ul className="space-y-2">
                <li><Link to="/privacy" className="text-sm text-dark-400 hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><a href="#" className="text-sm text-dark-400 hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <p className="text-sm font-semibold text-white mb-3">Support</p>
              <ul className="space-y-2">
                <li><a href="mailto:support@rivvra.com" className="text-sm text-dark-400 hover:text-white transition-colors">support@rivvra.com</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-dark-800/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-dark-500 text-sm">&copy; {new Date().getFullYear()} Rivvra. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm text-dark-400">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
