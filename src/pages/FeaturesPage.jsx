import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ChevronRight,
  Mail, Clock, Briefcase, UserSearch, Banknote, UsersRound,
  Contact, PenTool, CheckSquare,
  // Feature icons
  Linkedin, Zap, Send, Reply, ListChecks, BarChart3,
  CalendarCheck, CheckCircle, DollarSign, Users, FileText,
  Target, Globe, Search, Shield, Layers,
  CreditCard, Download, Settings, Building2, Tag,
  Inbox, ClipboardCheck, CalendarDays, Star,
} from 'lucide-react';
import MarketingLayout from '../components/marketing/MarketingLayout';

// ── Full app details with features ────────────────────────────────────────────
const APPS = [
  {
    id: 'outreach',
    name: 'Outreach',
    tagline: 'Find, engage, and convert prospects',
    description: 'Extract contacts from LinkedIn, generate AI-powered emails, and run multi-step automated sequences.',
    icon: Mail,
    color: { bg: 'bg-rivvra-500/10', text: 'text-rivvra-400', border: 'border-rivvra-500/20', badge: 'bg-rivvra-500/15 text-rivvra-400' },
    status: 'live',
    features: [
      { icon: Linkedin, title: 'LinkedIn Lead Extraction', desc: 'One-click extraction of profiles, emails, and company data from LinkedIn search results.' },
      { icon: Zap, title: 'AI Email Generation', desc: 'Generate personalized cold emails with AI. Subject lines, body, and follow-ups.' },
      { icon: Send, title: 'Automated Sequences', desc: 'Build multi-step sequences with delays and automated follow-ups from your Gmail.' },
      { icon: Reply, title: 'Reply Detection', desc: 'Automatically detect replies and unsubscribes. Auto-pause sequences on response.' },
      { icon: ListChecks, title: 'Smart Lists', desc: 'Organize leads into dynamic lists. Auto-sort by outreach status.' },
      { icon: BarChart3, title: 'Analytics Dashboard', desc: 'Track open rates, reply rates, and sequence performance.' },
    ],
  },
  {
    id: 'timesheet',
    name: 'Timesheet',
    tagline: 'Track time, manage projects, run payroll',
    description: 'Purpose-built for staffing agencies. Contractors log hours, managers approve, admins run payroll.',
    icon: Clock,
    color: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', badge: 'bg-blue-500/15 text-blue-400' },
    status: 'live',
    features: [
      { icon: CalendarCheck, title: 'Weekly Time Entry', desc: 'Contractors submit hours per project. Regular, overtime, and holiday hours supported.' },
      { icon: CheckCircle, title: 'Manager Approvals', desc: 'Review and approve timesheets. Bulk approve or reject with comments.' },
      { icon: DollarSign, title: 'Earnings & Payroll', desc: 'Automatic pay calculations based on rates, overtime, and approved hours.' },
      { icon: Briefcase, title: 'Project Management', desc: 'Create projects, assign contractors, set budgets, track time.' },
      { icon: Users, title: 'Contractor Management', desc: 'Onboard contractors with roles, rates, and project assignments.' },
      { icon: FileText, title: 'Export & Reports', desc: 'Export timesheets and payroll data to CSV for accounting.' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    tagline: 'Manage your sales pipeline',
    description: 'Track deals from first contact to closed-won. Manage client relationships and forecast revenue.',
    icon: Briefcase,
    color: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-400' },
    status: 'coming_soon',
    features: [
      { icon: Target, title: 'Pipeline Management', desc: 'Kanban-style deal pipeline with customizable stages.' },
      { icon: BarChart3, title: 'Revenue Forecasting', desc: 'Predict revenue based on deal stages and probability.' },
      { icon: CalendarCheck, title: 'Activity Tracking', desc: 'Log calls, emails, meetings, and notes against deals.' },
      { icon: Users, title: 'Contact Management', desc: 'Unified database synced with Outreach leads.' },
      { icon: Globe, title: 'Client Accounts', desc: 'Group contacts under company accounts.' },
      { icon: FileText, title: 'Reports', desc: 'Sales performance and pipeline health dashboards.' },
    ],
  },
  {
    id: 'ats',
    name: 'ATS',
    tagline: 'Applicant tracking for recruiters',
    description: 'Source candidates, track applications, schedule interviews, and manage placements.',
    icon: UserSearch,
    color: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', badge: 'bg-purple-500/15 text-purple-400' },
    status: 'coming_soon',
    features: [
      { icon: Search, title: 'Job Postings', desc: 'Create and manage openings. Track sourcing channels.' },
      { icon: UserSearch, title: 'Candidate Tracking', desc: 'Move candidates through stages from sourced to placed.' },
      { icon: CalendarCheck, title: 'Interview Scheduling', desc: 'Calendar integrations and automated reminders.' },
      { icon: Briefcase, title: 'Placement Management', desc: 'Track active placements and contract renewals.' },
      { icon: ListChecks, title: 'Candidate Database', desc: 'Searchable database synced with Outreach.' },
      { icon: BarChart3, title: 'Recruiting Metrics', desc: 'Time-to-fill, placement rates, and sourcing analytics.' },
    ],
  },
  {
    id: 'payroll',
    name: 'Payroll',
    tagline: 'Process payroll and disbursements',
    description: 'Process payroll runs, manage pay configuration, track disbursements, and export reports.',
    icon: Banknote,
    color: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', badge: 'bg-amber-500/15 text-amber-400' },
    status: 'beta',
    features: [
      { icon: CreditCard, title: 'Pay Processing', desc: 'Run payroll with automatic calculations from approved timesheets.' },
      { icon: CalendarDays, title: 'Disbursement Tracking', desc: 'Track upcoming and completed disbursements per employee.' },
      { icon: Download, title: 'Export & Reports', desc: 'Export payroll data for accounting and compliance.' },
      { icon: Settings, title: 'Pay Configuration', desc: 'Configure pay rates, deductions, and disbursement dates.' },
    ],
  },
  {
    id: 'employee',
    name: 'Employee',
    tagline: 'HR and employee management',
    description: 'Employee directory, department management, onboarding, and plan templates.',
    icon: UsersRound,
    color: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', badge: 'bg-orange-500/15 text-orange-400' },
    status: 'beta',
    features: [
      { icon: Users, title: 'Employee Directory', desc: 'Searchable directory with profiles, departments, and contact info.' },
      { icon: Building2, title: 'Departments', desc: 'Organize employees into departments with hierarchy.' },
      { icon: ClipboardCheck, title: 'Onboarding', desc: 'Streamlined onboarding wizard for new employees.' },
      { icon: FileText, title: 'Plan Templates', desc: 'Create reusable templates for employee benefit plans.' },
    ],
  },
  {
    id: 'contacts',
    name: 'Contacts',
    tagline: 'Unified contacts directory',
    description: 'Company and individual contacts in one place, synced across all apps.',
    icon: Contact,
    color: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', badge: 'bg-cyan-500/15 text-cyan-400' },
    status: 'beta',
    features: [
      { icon: Building2, title: 'Companies', desc: 'Manage client and vendor company profiles.' },
      { icon: Users, title: 'Individuals', desc: 'Individual contact records with full history.' },
      { icon: Tag, title: 'Tags & Filters', desc: 'Organize contacts with custom tags and filters.' },
      { icon: Layers, title: 'Cross-app Sync', desc: 'Contacts sync automatically with CRM and Outreach.' },
    ],
  },
  {
    id: 'sign',
    name: 'Sign',
    tagline: 'Digital document signing',
    description: 'Send documents for digital signatures. Templates, tracking, and audit trails.',
    icon: PenTool,
    color: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', badge: 'bg-indigo-500/15 text-indigo-400' },
    status: 'beta',
    features: [
      { icon: PenTool, title: 'Document Signing', desc: 'Send documents for legally-binding digital signatures.' },
      { icon: FileText, title: 'Templates', desc: 'Create reusable document templates with signing fields.' },
      { icon: Inbox, title: 'Request Tracking', desc: 'Track signature request status and reminders.' },
      { icon: Shield, title: 'Audit Trail', desc: 'Complete audit trail for compliance and verification.' },
    ],
  },
  {
    id: 'todo',
    name: 'To-Do',
    tagline: 'Smart task management',
    description: 'Personal task management with AI-powered email task extraction.',
    icon: CheckSquare,
    color: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20', badge: 'bg-teal-500/15 text-teal-400' },
    status: 'beta',
    features: [
      { icon: CheckSquare, title: 'Task Management', desc: 'Create, organize, and prioritize tasks.' },
      { icon: Zap, title: 'AI Extraction', desc: 'Automatically extract tasks from emails.' },
      { icon: Star, title: 'Priority Levels', desc: 'Set priority levels and due dates for tasks.' },
      { icon: BarChart3, title: 'Dashboard', desc: 'Overview of task status and completion rates.' },
    ],
  },
];

const STATUS_BADGE = {
  live:        { label: 'Live',        cls: 'bg-rivvra-500/15 text-rivvra-400 ring-rivvra-500/20' },
  coming_soon: { label: 'Coming Soon', cls: 'bg-dark-700/80 text-dark-400 ring-dark-600/30' },
  beta:        { label: 'Beta',        cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/20' },
};

// ── Platform-wide features ────────────────────────────────────────────────────
const PLATFORM_FEATURES = [
  { icon: Shield, title: 'Per-User App Access', desc: 'Admins control exactly which apps each team member can access.' },
  { icon: Globe, title: 'Org Workspaces', desc: 'Every company gets a dedicated workspace with isolated data.' },
  { icon: Layers, title: 'Modular Architecture', desc: 'Start with one app, add more as you grow. Each works standalone or together.' },
  { icon: Zap, title: 'Cross-App Workflows', desc: 'Leads flow into CRM. Placements create Timesheet entries. Everything connects.' },
];

function FeaturesPage() {
  const [activeApp, setActiveApp] = useState(null);

  return (
    <MarketingLayout activePage="/features">

      {/* ═══════════ HERO ═══════════════════════════════════════════════════ */}
      <section className="pt-20 pb-16 lg:pt-28 lg:pb-24">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-5">
          <h1 className="text-[40px] lg:text-[56px] font-bold text-white tracking-[-0.03em] leading-[1.1]">
            Nine apps, one platform
          </h1>
          <p className="text-lg text-dark-400 max-w-2xl mx-auto leading-relaxed">
            Purpose-built for staffing agencies. Pick what you need now, add more later.
          </p>
        </div>

        {/* App nav pills */}
        <div className="max-w-5xl mx-auto px-6 mt-12">
          <div className="flex flex-wrap justify-center gap-2">
            {APPS.map((app) => {
              const badge = STATUS_BADGE[app.status];
              return (
                <a
                  key={app.id}
                  href={`#${app.id}`}
                  onClick={() => setActiveApp(app.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] font-medium transition-all ${
                    activeApp === app.id
                      ? 'border-white/[0.15] bg-white/[0.06] text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-dark-400 hover:text-white hover:border-white/[0.1]'
                  }`}
                >
                  <app.icon className={`w-3.5 h-3.5 ${app.color.text}`} />
                  {app.name}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ APP DEEP-DIVES ══════════════════════════════════════ */}
      {APPS.map((app) => {
        const Icon = app.icon;
        const c = app.color;
        const badge = STATUS_BADGE[app.status];

        return (
          <section key={app.id} id={app.id} className="py-14 border-t border-white/[0.04]">
            <div className="max-w-7xl mx-auto px-6">
              {/* App header */}
              <div className="max-w-3xl mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${c.text}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-bold text-white">{app.name}</h2>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ring-1 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className={`text-sm ${c.text} mt-0.5`}>{app.tagline}</p>
                  </div>
                </div>
                <p className="text-dark-400 text-base leading-relaxed">{app.description}</p>
              </div>

              {/* Features grid */}
              <div className={`grid md:grid-cols-2 ${app.features.length > 4 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
                {app.features.map((feat) => (
                  <div key={feat.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all">
                    <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
                      <feat.icon className={`w-4.5 h-4.5 ${c.text}`} />
                    </div>
                    <h3 className="text-[13px] font-semibold text-white mb-1.5">{feat.title}</h3>
                    <p className="text-dark-500 text-[12px] leading-relaxed">{feat.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* ═══════════ PLATFORM FEATURES ═══════════════════════════════════ */}
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white tracking-[-0.02em] mb-4">Platform features</h2>
            <p className="text-dark-400 text-lg max-w-xl mx-auto">
              Built into every app &mdash; org management, access control, and cross-app workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {PLATFORM_FEATURES.map((feat) => (
              <div key={feat.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center">
                <div className="w-10 h-10 rounded-xl border border-white/[0.06] bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
                  <feat.icon className="w-5 h-5 text-rivvra-400" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5">{feat.title}</h3>
                <p className="text-dark-500 text-[12px] leading-relaxed">{feat.desc}</p>
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
                Try every app free for 14 days
              </h2>
              <p className="text-dark-400 max-w-md mx-auto text-sm">
                All apps included. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  to="/signup"
                  className="px-8 py-3.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-all hover:shadow-lg hover:shadow-rivvra-500/25 inline-flex items-center justify-center gap-2"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/pricing"
                  className="px-8 py-3.5 bg-white/[0.04] text-white border border-white/[0.08] rounded-xl text-sm font-semibold hover:bg-white/[0.07] transition-all inline-flex items-center justify-center gap-2"
                >
                  View pricing
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

export default FeaturesPage;
