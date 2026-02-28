import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, Mail, Clock, Target, UserPlus,
  CheckCircle, Linkedin, Zap, BarChart3, Shield, Users,
  CalendarCheck, DollarSign, FileText, Search,
  Send, Reply, ListChecks, Globe, Layers, Briefcase,
  ChevronRight
} from 'lucide-react';
import RivvraLogo from '../components/BrynsaLogo';

// ── Detailed feature lists per app ──
const APPS = [
  {
    id: 'outreach',
    name: 'Outreach',
    tagline: 'Find, engage, and convert prospects',
    description: 'Extract contacts from LinkedIn, generate AI-powered emails, and run multi-step automated sequences — all tracked in one dashboard.',
    icon: Mail,
    color: {
      bg: 'bg-rivvra-500/10',
      text: 'text-rivvra-400',
      border: 'border-rivvra-500/20',
      badge: 'bg-rivvra-500/20 text-rivvra-300',
      gradient: 'from-rivvra-500/10 to-rivvra-400/5',
    },
    status: 'live',
    features: [
      { icon: Linkedin, title: 'LinkedIn Lead Extraction', desc: 'One-click extraction of profiles, emails, and company data from LinkedIn search results and profiles.' },
      { icon: Zap, title: 'AI Email Generation', desc: 'Generate personalized cold emails using GPT-4. Subject lines, body, and follow-ups — all AI-powered.' },
      { icon: Send, title: 'Automated Email Sequences', desc: 'Build multi-step sequences with delays, conditions, and automated follow-ups sent from your Gmail.' },
      { icon: Reply, title: 'Reply Detection', desc: 'Automatically detect replies and unsubscribes. Auto-pause sequences when prospects respond.' },
      { icon: ListChecks, title: 'Smart Lists', desc: 'Organize leads into dynamic lists. Auto-add leads based on outreach status — Hot Leads, Not Interested, No Response.' },
      { icon: BarChart3, title: 'Analytics Dashboard', desc: 'Track open rates, reply rates, and sequence performance. See which messages convert best.' },
    ],
  },
  {
    id: 'timesheet',
    name: 'Timesheet',
    tagline: 'Track time, manage projects, run payroll',
    description: 'Purpose-built for staffing agencies. Contractors log hours, managers approve timesheets, and admins calculate payroll — in one place.',
    icon: Clock,
    color: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      border: 'border-blue-500/20',
      badge: 'bg-blue-500/20 text-blue-300',
      gradient: 'from-blue-500/10 to-blue-400/5',
    },
    status: 'live',
    features: [
      { icon: CalendarCheck, title: 'Weekly Time Entry', desc: 'Contractors submit hours per project with notes. Supports regular, overtime, and holiday hours.' },
      { icon: CheckCircle, title: 'Manager Approvals', desc: 'Managers review and approve timesheets. Bulk approve or reject with comments.' },
      { icon: DollarSign, title: 'Earnings & Payroll', desc: 'Automatic pay calculations based on rates, overtime rules, and approved hours.' },
      { icon: Briefcase, title: 'Project Management', desc: 'Create projects, assign contractors, set budgets, and track time against each project.' },
      { icon: Users, title: 'Contractor Management', desc: 'Onboard contractors with roles, rates, and project assignments. Per-user access control.' },
      { icon: FileText, title: 'Export & Reports', desc: 'Export timesheets and payroll data to CSV for your accounting system.' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    tagline: 'Manage your sales pipeline',
    description: 'Track deals from first contact to closed-won. Manage client relationships, log activities, and forecast revenue.',
    icon: Target,
    color: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
      badge: 'bg-amber-500/20 text-amber-300',
      gradient: 'from-amber-500/10 to-amber-400/5',
    },
    status: 'coming_soon',
    features: [
      { icon: Target, title: 'Pipeline Management', desc: 'Kanban-style deal pipeline with customizable stages for your staffing workflow.' },
      { icon: BarChart3, title: 'Revenue Forecasting', desc: 'Predict monthly revenue based on deal stages, probability, and close dates.' },
      { icon: CalendarCheck, title: 'Activity Tracking', desc: 'Log calls, emails, meetings, and notes against each deal and contact.' },
      { icon: Users, title: 'Contact Management', desc: 'Unified contact database synced with Outreach leads. No duplicate data entry.' },
      { icon: Globe, title: 'Client Accounts', desc: 'Group contacts under company accounts. Track all interactions per account.' },
      { icon: FileText, title: 'Reports & Analytics', desc: 'Sales performance, team activity, and pipeline health — all in one dashboard.' },
    ],
  },
  {
    id: 'ats',
    name: 'ATS',
    tagline: 'Applicant tracking for recruiters',
    description: 'Source candidates, track applications, schedule interviews, and manage placements — a recruiting-first ATS.',
    icon: UserPlus,
    color: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/20',
      badge: 'bg-purple-500/20 text-purple-300',
      gradient: 'from-purple-500/10 to-purple-400/5',
    },
    status: 'coming_soon',
    features: [
      { icon: Search, title: 'Job Postings', desc: 'Create and manage job openings. Track how candidates find each role.' },
      { icon: UserPlus, title: 'Candidate Tracking', desc: 'Move candidates through stages — sourced, screened, interviewed, offered, placed.' },
      { icon: CalendarCheck, title: 'Interview Scheduling', desc: 'Schedule interviews with calendar integrations and automated reminders.' },
      { icon: Briefcase, title: 'Placement Management', desc: 'Track active placements, contract renewals, and contractor assignments.' },
      { icon: ListChecks, title: 'Candidate Database', desc: 'Searchable database of all candidates. Synced with Outreach for sourcing.' },
      { icon: BarChart3, title: 'Recruiting Metrics', desc: 'Time-to-fill, placement rates, and sourcing channel analytics.' },
    ],
  },
];

// ── Platform-wide features ──
const PLATFORM_FEATURES = [
  { icon: Shield, title: 'Per-User App Access', desc: 'Admins control exactly which apps each team member can access. Granular roles within each app.' },
  { icon: Globe, title: 'Org Workspaces', desc: 'Every company gets a dedicated workspace. Invite your team, manage settings, and keep data isolated.' },
  { icon: Layers, title: 'Modular Architecture', desc: 'Start with one app, add more as you grow. Each app works standalone or together with the others.' },
  { icon: Zap, title: 'Cross-App Workflows', desc: 'Leads from Outreach flow into CRM. Placements from ATS create Timesheet entries. Everything connects.' },
];

function FeaturesPage() {
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
              <Link to="/features" className="text-sm text-white font-medium">Features</Link>
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
        {/* Hero */}
        <section className="pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to home
            </Link>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
              Everything your staffing agency needs
            </h1>
            <p className="text-lg text-dark-400 max-w-2xl mx-auto leading-relaxed">
              Four purpose-built apps that work together. Pick what you need now, add more later.
            </p>
          </div>
        </section>

        {/* ── App deep-dives ── */}
        {APPS.map((app, index) => {
          const Icon = app.icon;
          const c = app.color;
          const isEven = index % 2 === 0;

          return (
            <section key={app.id} id={app.id} className="py-20 border-t border-dark-800/50">
              <div className="max-w-7xl mx-auto px-6">
                {/* App header */}
                <div className="max-w-3xl mb-12">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${c.text}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold text-white">{app.name}</h2>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          app.status === 'live' ? c.badge : 'bg-dark-700 text-dark-400'
                        }`}>
                          {app.status === 'live' ? 'Live' : 'Coming Soon'}
                        </span>
                      </div>
                      <p className={`text-sm ${c.text}`}>{app.tagline}</p>
                    </div>
                  </div>
                  <p className="text-dark-400 text-base leading-relaxed">{app.description}</p>
                </div>

                {/* Features grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {app.features.map((feat) => (
                    <div key={feat.title} className="card p-5 hover:border-dark-600 transition-colors">
                      <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
                        <feat.icon className={`w-4.5 h-4.5 ${c.text}`} />
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1.5">{feat.title}</h3>
                      <p className="text-dark-400 text-xs leading-relaxed">{feat.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}

        {/* ── Platform features ── */}
        <section className="py-20 border-t border-dark-800/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-white mb-4">Platform features</h2>
              <p className="text-dark-400 text-lg max-w-xl mx-auto">
                Built into every app — org management, access control, and cross-app integrations.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {PLATFORM_FEATURES.map((feat) => (
                <div key={feat.title} className="card p-5 text-center">
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center mx-auto mb-3">
                    <feat.icon className="w-5 h-5 text-rivvra-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1.5">{feat.title}</h3>
                  <p className="text-dark-500 text-xs leading-relaxed">{feat.desc}</p>
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
                  Try every app free for 14 days
                </h2>
                <p className="text-dark-400 max-w-md mx-auto">
                  All apps included. Up to 5 team members. No credit card required.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Link to="/signup" className="px-8 py-3 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors inline-flex items-center justify-center gap-2">
                    Start free trial
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link to="/pricing" className="px-8 py-3 bg-dark-800 text-white border border-dark-700 rounded-xl text-sm font-semibold hover:bg-dark-750 transition-colors inline-flex items-center justify-center gap-2">
                    View pricing
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
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

export default FeaturesPage;
