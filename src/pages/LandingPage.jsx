import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, ChevronRight,
  Mail, Clock, Target, UserPlus, Banknote, UsersRound,
  Contact, PenTool, CheckSquare, Briefcase, UserSearch,
  Layers, Shield, Zap, Globe, Building2, Users, Star,
} from 'lucide-react';
import MarketingLayout from '../components/marketing/MarketingLayout';

// ── All 9 platform apps ──────────────────────────────────────────────────────
const PLATFORM_APPS = [
  {
    id: 'outreach', name: 'Outreach', status: 'live',
    description: 'Find leads on LinkedIn, generate AI emails, and run automated sequences.',
    icon: Mail, color: 'rivvra',
    features: ['LinkedIn extraction', 'AI email generation', 'Multi-step sequences', 'Reply detection'],
  },
  {
    id: 'timesheet', name: 'Timesheet', status: 'live',
    description: 'Track contractor hours, manage projects, and run payroll.',
    icon: Clock, color: 'blue',
    features: ['Time tracking', 'Manager approvals', 'Pay calculations', 'Payroll export'],
  },
  {
    id: 'crm', name: 'CRM', status: 'coming_soon',
    description: 'Manage your sales pipeline with deals, activities, and forecasting.',
    icon: Briefcase, color: 'emerald',
    features: ['Kanban pipeline', 'Deal tracking', 'Activity logging', 'Revenue forecasting'],
  },
  {
    id: 'ats', name: 'ATS', status: 'coming_soon',
    description: 'Track applicants from sourcing to placement.',
    icon: UserSearch, color: 'purple',
    features: ['Job postings', 'Candidate pipeline', 'Interview scheduling', 'Placement tracking'],
  },
  {
    id: 'payroll', name: 'Payroll', status: 'beta',
    description: 'Process payroll, manage disbursements, and export reports.',
    icon: Banknote, color: 'amber',
    features: ['Pay processing', 'Disbursement tracking', 'Export & reports', 'Pay configuration'],
  },
  {
    id: 'employee', name: 'Employee', status: 'beta',
    description: 'Employee directory, departments, and HR management.',
    icon: UsersRound, color: 'orange',
    features: ['Employee directory', 'Departments', 'Onboarding', 'Plan templates'],
  },
  {
    id: 'contacts', name: 'Contacts', status: 'beta',
    description: 'Unified company and individual contacts directory.',
    icon: Contact, color: 'cyan',
    features: ['Company directory', 'Individual contacts', 'Tags & filters', 'Cross-app sync'],
  },
  {
    id: 'sign', name: 'Sign', status: 'beta',
    description: 'Digital signatures and document signing workflows.',
    icon: PenTool, color: 'indigo',
    features: ['Document signing', 'Templates', 'Request tracking', 'Audit trail'],
  },
  {
    id: 'todo', name: 'To-Do', status: 'beta',
    description: 'Personal task management with AI-powered email task extraction.',
    icon: CheckSquare, color: 'teal',
    features: ['Task management', 'AI extraction', 'Priority levels', 'Due dates'],
  },
];

const COLOR_MAP = {
  rivvra: { bg: 'bg-rivvra-500/10', text: 'text-rivvra-400', border: 'border-rivvra-500/20', glow: 'group-hover:shadow-rivvra-500/10' },
  blue:   { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', glow: 'group-hover:shadow-blue-500/10' },
  emerald:{ bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', glow: 'group-hover:shadow-emerald-500/10' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', glow: 'group-hover:shadow-purple-500/10' },
  amber:  { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', glow: 'group-hover:shadow-amber-500/10' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', glow: 'group-hover:shadow-orange-500/10' },
  cyan:   { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', glow: 'group-hover:shadow-cyan-500/10' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', glow: 'group-hover:shadow-indigo-500/10' },
  teal:   { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20', glow: 'group-hover:shadow-teal-500/10' },
};

const STATUS_BADGE = {
  live:        { label: 'Live',        cls: 'bg-rivvra-500/15 text-rivvra-400 ring-rivvra-500/20' },
  coming_soon: { label: 'Coming Soon', cls: 'bg-dark-700/80 text-dark-400 ring-dark-600/30' },
  beta:        { label: 'Beta',        cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/20' },
};

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'Rivvra replaced three tools for us. Outreach, timesheets, and team management in one dashboard.',
    name: 'Sarah Chen',
    title: 'Director of Operations',
    company: 'TalentBridge Staffing',
  },
  {
    quote: 'We cut contractor onboarding time in half. Exactly what staffing agencies need.',
    name: 'Marcus Johnson',
    title: 'CEO',
    company: 'Apex Workforce Solutions',
  },
  {
    quote: 'Started with two apps, now using five. The modular approach lets us grow at our own pace.',
    name: 'Priya Sharma',
    title: 'Head of Recruitment',
    company: 'Nexus Staffing',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function LandingPage() {
  return (
    <MarketingLayout activePage="/">

      {/* ═══════════ HERO ═══════════════════════════════════════════════════ */}
      <section className="relative pt-20 pb-20 lg:pt-28 lg:pb-28">
        {/* Dot grid background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rivvra-500/[0.06] rounded-full blur-[150px]" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-rivvra-400 animate-pulse" />
            <span className="text-[13px] text-dark-400 font-medium">Built for staffing agencies</span>
          </div>

          {/* Headline */}
          <h1 className="text-[44px] sm:text-[56px] lg:text-[72px] font-bold leading-[1.05] tracking-[-0.03em] text-white mb-6">
            One platform,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rivvra-400 to-emerald-400">
              nine apps
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg lg:text-xl text-dark-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Outreach, timesheets, CRM, hiring, payroll, and more &mdash; modular tools
            that work together so your team stays on the same page.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="px-8 py-3.5 bg-rivvra-500 text-dark-950 rounded-xl text-[15px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-xl hover:shadow-rivvra-500/20 flex items-center justify-center gap-2"
            >
              Start 14-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/features"
              className="px-8 py-3.5 bg-white/[0.04] text-white border border-white/[0.08] rounded-xl text-[15px] font-semibold hover:bg-white/[0.07] hover:border-white/[0.12] transition-all flex items-center justify-center gap-2"
            >
              Explore features
            </Link>
          </div>

          <p className="mt-5 text-dark-600 text-[13px]">Free for 14 days &middot; No credit card required</p>
        </div>
      </section>

      {/* ═══════════ PRODUCT PREVIEW ═══════════════════════════════════════ */}
      <section className="pb-16 -mt-4">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-dark-600" />
                <div className="w-2.5 h-2.5 rounded-full bg-dark-600" />
                <div className="w-2.5 h-2.5 rounded-full bg-dark-600" />
              </div>
              <div className="flex-1 mx-4">
                <div className="h-6 rounded-md bg-dark-800/50 max-w-xs mx-auto" />
              </div>
            </div>
            {/* Placeholder content */}
            <div className="aspect-[16/9] bg-dark-900/50 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-rivvra-500/10 flex items-center justify-center mx-auto">
                  <Zap className="w-6 h-6 text-rivvra-400" />
                </div>
                <p className="text-dark-500 text-sm">Product demo coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ APP GRID ═══════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl lg:text-[40px] font-bold text-white tracking-[-0.02em] mb-4">
              Every tool your agency needs
            </h2>
            <p className="text-dark-400 text-lg max-w-2xl mx-auto">
              Pick the apps you need. Each one is purpose-built for staffing and works seamlessly with the others.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORM_APPS.map((app) => {
              const Icon = app.icon;
              const c = COLOR_MAP[app.color];
              const badge = STATUS_BADGE[app.status];

              return (
                <div
                  key={app.id}
                  className={`group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 ${c.glow} hover:shadow-xl`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${c.text}`} />
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ring-1 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  <h3 className="text-[15px] font-semibold text-white mb-1.5">{app.name}</h3>
                  <p className="text-dark-500 text-[13px] leading-relaxed mb-4">{app.description}</p>

                  <div className="grid grid-cols-2 gap-1.5">
                    {app.features.map((feat) => (
                      <div key={feat} className="flex items-center gap-1.5 text-[12px] text-dark-400">
                        <CheckCircle className={`w-3 h-3 ${c.text} flex-shrink-0`} />
                        {feat}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-10">
            <Link to="/features" className="inline-flex items-center gap-1.5 text-rivvra-400 hover:text-rivvra-300 font-medium text-sm transition-colors">
              Explore all features in detail
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ══════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl lg:text-[40px] font-bold text-white tracking-[-0.02em] mb-4">
              Get started in minutes
            </h2>
            <p className="text-dark-400 text-lg max-w-xl mx-auto">
              Create your workspace, choose your apps, and invite your team.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: '01', icon: Building2,
                title: 'Create your workspace',
                desc: 'Sign up with your work email. Your org workspace is auto-created.',
              },
              {
                step: '02', icon: Layers,
                title: 'Choose your apps',
                desc: 'Start with one app or all nine. Add more as your team grows.',
              },
              {
                step: '03', icon: Users,
                title: 'Invite your team',
                desc: 'Add teammates with per-app access control. Pay only for who uses what.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <item.icon className="w-6 h-6 text-rivvra-400" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-rivvra-500 uppercase tracking-widest">Step {item.step}</span>
                  <h3 className="text-lg font-semibold text-white mt-1.5">{item.title}</h3>
                </div>
                <p className="text-dark-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PLATFORM HIGHLIGHTS ═══════════════════════════════════ */}
      <section className="py-16 lg:py-20 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
                <Shield className="w-3.5 h-3.5 text-rivvra-400" />
                <span className="text-[12px] text-dark-400 font-medium">Purpose-built for staffing</span>
              </div>
              <h2 className="text-3xl lg:text-[40px] font-bold text-white leading-tight tracking-[-0.02em]">
                Every tool a staffing agency needs &mdash; nothing more
              </h2>
              <p className="text-dark-400 text-lg leading-relaxed">
                Most platforms try to serve everyone. Rivvra is built specifically
                for staffing agencies, recruiters, and workforce teams.
              </p>
              <ul className="space-y-4 pt-2">
                {[
                  { icon: Shield, text: 'Per-user app access &mdash; admins control who sees what' },
                  { icon: Globe, text: 'Org-scoped workspaces with team collaboration' },
                  { icon: Zap, text: 'Cross-app workflows &mdash; data flows between apps automatically' },
                  { icon: Layers, text: 'Modular architecture &mdash; start small, scale as you grow' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon className="w-4 h-4 text-rivvra-400" />
                    </div>
                    <span className="text-dark-400 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: item.text }} />
                  </li>
                ))}
              </ul>
            </div>

            {/* Mini app launcher preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-rivvra-500/[0.06] to-transparent rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 space-y-6 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
                    <span className="text-dark-950 font-bold text-sm">R</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Acme Staffing</p>
                    <p className="text-xs text-dark-500">5 apps active &middot; 12 members</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {PLATFORM_APPS.slice(0, 6).map((app) => {
                    const c = COLOR_MAP[app.color];
                    return (
                      <div key={app.name} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                          <app.icon className={`w-4 h-4 ${c.text}`} />
                        </div>
                        <span className="text-[11px] text-dark-400 font-medium">{app.name}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {['S', 'M', 'P', 'A', 'R'].map((l, i) => (
                      <div key={i} className="w-7 h-7 rounded-full bg-dark-800 border-2 border-dark-950 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-dark-400">{l}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-[11px] text-dark-600 ml-1">+7 team members</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ TESTIMONIALS ═════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl lg:text-[40px] font-bold text-white tracking-[-0.02em]">
              Trusted by staffing teams
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 fill-rivvra-400 text-rivvra-400" />
                  ))}
                </div>
                <p className="text-dark-300 text-sm leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-[12px] text-dark-500">{t.title}, {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PRICING TEASER ═══════════════════════════════════════ */}
      <section className="py-16 lg:py-20 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-[40px] font-bold text-white tracking-[-0.02em] mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-dark-400 text-lg mb-12 max-w-xl mx-auto">
            Two plans. Per-seat billing. Start with a 14-day free trial.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto mb-10">
            {[
              { plan: 'Core', price: '$10', desc: 'ATS, CRM, Contacts, Employee, Sign, Payroll' },
              { plan: 'All Apps', price: '$15', desc: 'Everything in Core + Outreach, Timesheet, To-Do' },
            ].map((item) => (
              <div key={item.plan} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
                <p className="text-[13px] font-semibold text-dark-400 uppercase tracking-wide mb-2">{item.plan}</p>
                <p className="text-4xl font-bold text-white">{item.price}<span className="text-base font-normal text-dark-500">/user/mo</span></p>
                <p className="text-[13px] text-dark-500 mt-2">{item.desc}</p>
              </div>
            ))}
          </div>

          <Link to="/pricing" className="inline-flex items-center gap-1.5 text-rivvra-400 hover:text-rivvra-300 font-medium text-sm transition-colors">
            View full pricing details
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ═══════════ CTA ══════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.02] p-10 lg:p-14 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-rivvra-500/[0.06] via-transparent to-emerald-500/[0.04]" />
            <div className="relative space-y-6">
              <h2 className="text-3xl lg:text-[40px] font-bold text-white tracking-[-0.02em]">
                Ready to run your agency smarter?
              </h2>
              <p className="text-dark-400 text-lg max-w-xl mx-auto">
                Start your 14-day free trial today. All apps included, no credit card required.
              </p>
              <div className="pt-2">
                <Link
                  to="/signup"
                  className="px-10 py-4 bg-rivvra-500 text-dark-950 rounded-xl text-[15px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-xl hover:shadow-rivvra-500/20 inline-flex items-center gap-2"
                >
                  Start free trial
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <p className="text-dark-600 text-[13px]">Work email required</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

export default LandingPage;
