import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ChevronRight, Check,
  Mail, Clock, Banknote, UsersRound,
  Contact, PenTool, CheckSquare, Briefcase, UserSearch,
  Receipt, Wallet, Award, FolderArchive, BookOpen,
  Layers, Shield, Zap, Globe, KeyRound, Boxes, Search, Bell,
  Chrome, Linkedin, Sparkles, MapPin, BadgeCheck,
} from 'lucide-react';

// Live Chrome Web Store listing for the LinkedIn Lead Extractor extension
const EXTENSION_URL = 'https://chromewebstore.google.com/detail/rivvra-linkedin-lead-extr/afmjolicodhklbppiknbbjpjbhfjhipm';
import MarketingLayout from '../components/marketing/MarketingLayout';
import RivvraLogo from '../components/RivvraLogo';

// ── All 9 platform apps ──────────────────────────────────────────────────────
const PLATFORM_APPS = [
  {
    id: 'outreach', name: 'Outreach', status: 'live',
    description: 'Find leads on LinkedIn, generate AI emails, and run automated sequences.',
    icon: Mail, color: 'rivvra',
    features: ['LinkedIn extraction', 'AI email generation', 'Multi-step sequences', 'Reply detection'],
  },
  {
    id: 'timesheet', name: 'ESS', status: 'live',
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
  {
    id: 'invoicing', name: 'Invoicing', status: 'live',
    description: 'Customer invoices, vendor bills, payments, and tax-ready reports.',
    icon: Receipt, color: 'amber',
    features: ['Customer invoices', 'Vendor bills', 'Payments & TDS', 'Aged reports'],
  },
  {
    id: 'expenses', name: 'Expenses', status: 'live',
    description: 'Submit, categorize, and approve employee expense claims.',
    icon: Wallet, color: 'emerald',
    features: ['Expense claims', 'Approvals', 'Categories', 'Reimbursements'],
  },
  {
    id: 'incentive', name: 'Incentive', status: 'live',
    description: 'Track recruiter and account-manager commissions end to end.',
    icon: Award, color: 'fuchsia',
    features: ['Commission tracking', 'Rate tables', 'Recruiter earnings', 'Payout records'],
  },
  {
    id: 'documents', name: 'Documents', status: 'live',
    description: 'A company document library with versioning and access control.',
    icon: FolderArchive, color: 'slate',
    features: ['Document library', 'Versioning', 'Folders & tags', 'Secure access'],
  },
  {
    id: 'knowledgeBase', name: 'Knowledge Base', status: 'live',
    description: 'Internal guides and workflow walkthroughs for your team.',
    icon: BookOpen, color: 'sky',
    features: ['Guides & articles', 'Walkthroughs', 'Searchable', 'Admin authored'],
  },
];

const COLOR_MAP = {
  rivvra: { bg: 'bg-rivvra-500/10', text: 'text-rivvra-400', dot: 'bg-rivvra-400' },
  blue:   { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  emerald:{ bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
  amber:  { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
  cyan:   { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  teal:   { bg: 'bg-teal-500/10', text: 'text-teal-400', dot: 'bg-teal-400' },
  fuchsia:{ bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', dot: 'bg-fuchsia-400' },
  slate:  { bg: 'bg-slate-500/10', text: 'text-slate-300', dot: 'bg-slate-400' },
  sky:    { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
};

const STATUS_BADGE = {
  live:        { label: 'Live',        cls: 'bg-rivvra-500/15 text-rivvra-300 ring-rivvra-500/25' },
  coming_soon: { label: 'Soon',        cls: 'bg-white/[0.04] text-dark-400 ring-white/[0.08]' },
  beta:        { label: 'Beta',        cls: 'bg-amber-500/12 text-amber-300/90 ring-amber-500/20' },
};

// ── Reveal ────────────────────────────────────────────────────────────────────
// Scroll/mount reveal whose VISIBILITY is driven by React state (not by an
// animation completing). A guaranteed timer fallback flips it visible even if
// IntersectionObserver never fires or the tab is backgrounded — so content can
// never get stranded invisible. The CSS transition is pure enhancement.
const EASE = 'cubic-bezier(.22,1,.36,1)';

function Reveal({ children, delay = 0, y = 22, className = '', immediate = false }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (immediate || typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setShown(true), 20);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    const safety = setTimeout(() => setShown(true), 1300); // never strand content
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setShown(true); io.disconnect(); clearTimeout(safety); }
      },
      { rootMargin: '0px 0px -60px 0px' }
    );
    if (el) io.observe(el);
    return () => { io.disconnect(); clearTimeout(safety); };
  }, [immediate]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${y}px)`,
        transition: `opacity .7s ${EASE} ${delay}s, transform .7s ${EASE} ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// Section eyebrow — serif-accented label used above section headings
function Eyebrow({ children }) {
  return (
    <p className="text-dark-500 text-sm tracking-wide mb-4">
      <span className="font-serif-accent italic text-rivvra-400/90 text-[17px]">{children}</span>
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT MOCK — high-fidelity, in-code representation of the Rivvra app.
// Neutral sample data; not a screenshot, no real customer data.
// ═══════════════════════════════════════════════════════════════════════════════
function ProductMock() {
  const railApps = PLATFORM_APPS.slice(0, 7);
  const launcher = PLATFORM_APPS.slice(0, 6);
  return (
    <div className="relative rounded-2xl bg-dark-900/90 shadow-mock overflow-hidden backdrop-blur-xl">
      {/* window chrome */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 px-3 h-6 rounded-md bg-dark-950/60 border border-white/[0.05] text-[11px] text-dark-500 max-w-xs w-full justify-center">
            <Shield className="w-3 h-3 text-rivvra-500/70" />
            rivvra.com/org/northwind/home
          </div>
        </div>
        <div className="w-12" />
      </div>

      <div className="flex">
        {/* left app rail */}
        <div className="hidden sm:flex flex-col items-center gap-1.5 py-4 px-2.5 border-r border-white/[0.06] bg-white/[0.01]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center mb-2">
            <span className="text-dark-950 font-bold text-xs">N</span>
          </div>
          {railApps.map((app, i) => {
            const c = COLOR_MAP[app.color];
            return (
              <div
                key={app.id}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${i === 0 ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
              >
                <app.icon className={`w-4 h-4 ${i === 0 ? c.text : 'text-dark-500'}`} />
              </div>
            );
          })}
        </div>

        {/* main panel */}
        <div className="flex-1 p-5 sm:p-6 min-w-0">
          {/* top bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
                <span className="text-dark-950 font-bold text-[9px]">N</span>
              </div>
              <span className="text-[12px] font-medium text-dark-200">Northwind Staffing</span>
              <ChevronRight className="w-3 h-3 text-dark-600 rotate-90" />
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-2.5 h-7 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] text-dark-500">
                <Search className="w-3 h-3" /> Search
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
                <Bell className="w-3.5 h-3.5 text-dark-500" />
              </div>
              <div className="w-7 h-7 rounded-full bg-rivvra-500/20 border border-rivvra-500/30 flex items-center justify-center">
                <span className="text-[10px] font-semibold text-rivvra-300">AL</span>
              </div>
            </div>
          </div>

          {/* greeting */}
          <div className="mb-5">
            <h3 className="font-marketing text-[19px] sm:text-[22px] font-semibold text-white tracking-[-0.01em]">
              Good morning, Alex
            </h3>
            <p className="text-[12px] text-dark-500 mt-0.5">6 apps active · 12 members · everything in one workspace</p>
          </div>

          {/* app launcher grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {launcher.map((app) => {
              const c = COLOR_MAP[app.color];
              const badge = STATUS_BADGE[app.status];
              return (
                <div
                  key={app.id}
                  className="group/app relative rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 hover:bg-white/[0.04] hover:border-white/[0.09] transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <app.icon className={`w-4 h-4 ${c.text}`} />
                    </div>
                    <span className={`w-1.5 h-1.5 rounded-full ${app.status === 'live' ? 'bg-rivvra-400' : app.status === 'beta' ? 'bg-amber-400/80' : 'bg-dark-600'}`} />
                  </div>
                  <p className="text-[12px] font-semibold text-dark-200">{app.name}</p>
                  <p className="text-[10px] text-dark-600 mt-0.5">{badge.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHROME EXTENSION MOCK — LinkedIn profile with the Rivvra side panel docked.
// In-code mock, neutral sample data; mirrors the real extension's panel.
// ═══════════════════════════════════════════════════════════════════════════════
function ExtensionMock() {
  return (
    <div className="relative rounded-2xl bg-dark-900/90 shadow-mock overflow-hidden backdrop-blur-xl">
      {/* browser chrome */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 px-3 h-6 rounded-md bg-dark-950/60 border border-white/[0.05] text-[11px] text-dark-500 max-w-xs w-full justify-center">
            <Linkedin className="w-3 h-3 text-[#0a66c2]" />
            linkedin.com/in/jordan-rivera
          </div>
        </div>
        <div className="w-7 h-6 rounded-md bg-rivvra-500/15 ring-1 ring-rivvra-500/25 flex items-center justify-center">
          <Chrome className="w-3.5 h-3.5 text-rivvra-300" />
        </div>
      </div>

      <div className="flex">
        {/* LinkedIn profile (left) */}
        <div className="hidden sm:block flex-1 p-5 min-w-0">
          <div className="h-12 rounded-lg bg-gradient-to-r from-[#0a66c2]/30 to-[#0a66c2]/10 mb-[-24px]" />
          <div className="px-1">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0a66c2] to-[#004182] ring-4 ring-dark-900 flex items-center justify-center">
              <span className="text-white font-bold text-lg">JR</span>
            </div>
            <p className="mt-3 text-[15px] font-semibold text-dark-100">Jordan Rivera</p>
            <p className="text-[12px] text-dark-400">VP of Talent Acquisition · Northwind</p>
            <p className="text-[11px] text-dark-500 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> San Francisco, CA · 500+ connections
            </p>
            <div className="flex gap-2 mt-3">
              <div className="h-7 w-20 rounded-full bg-[#0a66c2]/80" />
              <div className="h-7 w-16 rounded-full border border-dark-700" />
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-2 rounded bg-white/[0.05] w-3/4" />
              <div className="h-2 rounded bg-white/[0.04] w-full" />
              <div className="h-2 rounded bg-white/[0.04] w-5/6" />
            </div>
          </div>
        </div>

        {/* Rivvra extension panel (right) */}
        <div className="w-full sm:w-[290px] flex-shrink-0 border-l border-white/[0.06] bg-dark-950/50 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RivvraLogo className="w-5 h-5" />
              <span className="text-[13px] font-semibold text-white">Lead Extractor</span>
            </div>
            <span className="text-[10px] font-medium text-rivvra-300 bg-rivvra-500/15 ring-1 ring-rivvra-500/25 rounded px-1.5 py-0.5">
              Synced
            </span>
          </div>

          <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Extracted from profile</p>
          <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            {[
              { k: 'Name', v: 'Jordan Rivera' },
              { k: 'Title', v: 'VP of Talent Acquisition' },
              { k: 'Company', v: 'Northwind' },
            ].map((f) => (
              <div key={f.k} className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-dark-500">{f.k}</span>
                <span className="text-[11px] text-dark-200 font-medium truncate">{f.v}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <span className="text-[11px] text-dark-500">Email</span>
              <span className="text-[11px] text-rivvra-300 font-medium flex items-center gap-1 truncate">
                <BadgeCheck className="w-3 h-3 flex-shrink-0" /> j.rivera@northwind.com
              </span>
            </div>
          </div>

          {/* profile type toggle */}
          <div className="flex gap-1 mt-3 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex-1 text-center text-[11px] py-1.5 rounded-md text-dark-400">Candidate</div>
            <div className="flex-1 text-center text-[11px] py-1.5 rounded-md bg-white/[0.06] text-white font-medium">Client</div>
          </div>

          {/* actions */}
          <button className="w-full mt-3 h-9 rounded-lg bg-rivvra-500 text-dark-950 text-[12px] font-semibold flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Save to Outreach
          </button>
          <button className="w-full mt-2 h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] text-dark-200 text-[12px] font-medium flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-rivvra-400" /> Generate AI email
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function LandingPage() {
  return (
    <MarketingLayout activePage="/">
      {/* ════════════ HERO ════════════════════════════════════════════════ */}
      <section className="relative grain pt-16 pb-12 lg:pt-24">
        {/* atmospheric backdrop */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-[820px] h-[820px] aurora rounded-full blur-[120px] opacity-70" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '34px 34px' }}
          />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <Reveal immediate className="inline-block mb-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
              <span className="w-1.5 h-1.5 rounded-full bg-rivvra-400 animate-pulse" />
              <span className="text-[13px] text-dark-300 font-medium">Built for staffing agencies</span>
            </div>
          </Reveal>

          <Reveal immediate delay={0.06}>
            <h1 className="font-marketing text-[46px] sm:text-[62px] lg:text-[80px] font-extrabold leading-[0.98] tracking-[-0.035em] text-white">
              Run your agency on{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rivvra-300 via-rivvra-400 to-emerald-300">
                one platform
              </span>
              <span className="block text-dark-400 font-serif-accent italic font-normal text-[34px] sm:text-[44px] lg:text-[54px] tracking-[-0.01em] mt-3">
                not fourteen logins.
              </span>
            </h1>
          </Reveal>

          <Reveal immediate delay={0.14}>
            <p className="text-lg lg:text-xl text-dark-400 max-w-2xl mx-auto leading-relaxed mt-7">
              Outreach, hiring, timesheets, payroll, invoicing and more — fourteen modular
              apps that share one workspace, one login, and one source of truth.
            </p>
          </Reveal>

          <Reveal immediate delay={0.22}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-9">
              <Link
                to="/signup"
                className="group px-7 py-3.5 bg-rivvra-500 text-dark-950 rounded-xl text-[15px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-xl hover:shadow-rivvra-500/25 flex items-center justify-center gap-2"
              >
                Start 14-day free trial
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/features"
                className="px-7 py-3.5 bg-white/[0.04] text-white border border-white/[0.08] rounded-xl text-[15px] font-semibold hover:bg-white/[0.07] hover:border-white/[0.14] transition-all flex items-center justify-center gap-2"
              >
                Explore features
              </Link>
            </div>
          </Reveal>

          <Reveal immediate delay={0.3}>
            <p className="mt-5 text-dark-600 text-[13px]">Free for 14 days · No credit card required</p>
          </Reveal>
        </div>

        {/* ── product mock ── */}
        <Reveal immediate delay={0.32} y={40} className="relative max-w-5xl mx-auto px-6 mt-16">
          <div className="absolute -inset-x-10 -top-10 bottom-0 aurora blur-[100px] opacity-50 pointer-events-none" />
          <div className="relative">
            <ProductMock />
          </div>
          {/* fade the mock into the page */}
          <div className="absolute inset-x-0 -bottom-1 h-24 bg-gradient-to-b from-transparent to-dark-950 pointer-events-none" />
        </Reveal>
      </section>

      {/* ════════════ FACT STRIP (honest, product-true) ══════════════════ */}
      <section className="relative border-y border-white/[0.05] bg-white/[0.01]">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.05]">
          {[
            { k: '14 apps', v: 'one workspace' },
            { k: '1 login', v: 'every tool' },
            { k: 'Per-seat', v: 'pay for who works' },
            { k: 'Org-scoped', v: 'access you control' },
          ].map((s, i) => (
            <Reveal key={s.k} delay={i * 0.06} className="px-5 text-center">
              <p className="font-marketing text-2xl lg:text-[28px] font-bold text-white tracking-[-0.02em]">{s.k}</p>
              <p className="text-[12px] text-dark-500 mt-1">{s.v}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════ APP GRID ═══════════════════════════════════════════ */}
      <section className="relative grain py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="max-w-2xl mb-12">
            <Eyebrow>the toolkit</Eyebrow>
            <h2 className="font-marketing text-[34px] lg:text-[46px] font-bold text-white tracking-[-0.025em] leading-[1.05]">
              Every tool your agency needs — and nothing it doesn't
            </h2>
            <p className="text-dark-400 text-lg mt-5 leading-relaxed">
              Each app is purpose-built for staffing and speaks to the others. Turn on what you need today; add the rest as you grow.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORM_APPS.map((app, i) => {
              const c = COLOR_MAP[app.color];
              const badge = STATUS_BADGE[app.status];
              return (
                <Reveal key={app.id} delay={(i % 3) * 0.06} y={26}>
                  <div className="group relative h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.035] hover:border-white/[0.12] transition-all duration-300 overflow-hidden">
                    {/* hover wash in app color */}
                    <div className={`absolute -right-12 -top-12 w-32 h-32 rounded-full ${c.bg} blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    <div className="relative">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center`}>
                          <app.icon className={`w-5 h-5 ${c.text}`} />
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ring-1 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <h3 className="font-marketing text-[17px] font-semibold text-white mb-1.5">{app.name}</h3>
                      <p className="text-dark-500 text-[13px] leading-relaxed mb-5">{app.description}</p>
                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                        {app.features.map((feat) => (
                          <div key={feat} className="flex items-center gap-1.5 text-[12px] text-dark-400">
                            <Check className={`w-3 h-3 ${c.text} flex-shrink-0`} />
                            {feat}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={0.1} className="mt-10">
            <Link to="/features" className="inline-flex items-center gap-1.5 text-rivvra-400 hover:text-rivvra-300 font-medium text-sm transition-colors">
              Explore all features in detail
              <ChevronRight className="w-4 h-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ════════════ WHY ONE PLATFORM (split + product detail) ══════════ */}
      <section className="relative py-20 lg:py-28 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <Reveal>
              <Eyebrow>why rivvra</Eyebrow>
              <h2 className="font-marketing text-[34px] lg:text-[46px] font-bold text-white tracking-[-0.025em] leading-[1.05]">
                One workspace, so your data stops living in silos
              </h2>
              <p className="text-dark-400 text-lg mt-5 leading-relaxed">
                Most platforms try to serve everyone. Rivvra is built only for staffing —
                recruiters, contractors, and the back office working from the same record.
              </p>
              <ul className="space-y-3 mt-8">
                {[
                  { icon: KeyRound, title: 'Per-user app access', text: 'Admins decide exactly who sees which app.' },
                  { icon: Globe, title: 'Org-scoped workspaces', text: 'Every record is partitioned to your company.' },
                  { icon: Zap, title: 'Cross-app workflows', text: 'A placement flows from CRM to payroll automatically.' },
                  { icon: Boxes, title: 'Modular by design', text: 'Start with one app; switch on the rest anytime.' },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-3.5 group">
                    <div className="w-9 h-9 rounded-xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center flex-shrink-0 group-hover:border-rivvra-500/30 group-hover:bg-rivvra-500/[0.06] transition-colors">
                      <item.icon className="w-4 h-4 text-rivvra-400" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-dark-100">{item.title}</p>
                      <p className="text-dark-500 text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="relative">
                <div className="absolute -inset-6 aurora blur-[80px] opacity-40 pointer-events-none" />
                <div className="relative rounded-2xl border border-white/[0.08] bg-dark-900/70 p-7 backdrop-blur-sm shadow-mock">
                  <div className="flex items-center gap-3 pb-5 border-b border-white/[0.06]">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
                      <span className="text-dark-950 font-bold text-sm">N</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Northwind Staffing</p>
                      <p className="text-xs text-dark-500">6 apps active · 12 members</p>
                    </div>
                    <span className="ml-auto text-[10px] font-semibold text-rivvra-300 bg-rivvra-500/15 ring-1 ring-rivvra-500/25 rounded-md px-2 py-0.5">
                      Owner
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 py-5">
                    {PLATFORM_APPS.slice(0, 6).map((app) => {
                      const c = COLOR_MAP[app.color];
                      return (
                        <div key={app.name} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.025] border border-white/[0.05]">
                          <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                            <app.icon className={`w-4 h-4 ${c.text}`} />
                          </div>
                          <span className="text-[11px] text-dark-400 font-medium">{app.name}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t border-white/[0.06]">
                    <div className="flex -space-x-2">
                      {['A', 'M', 'P', 'R', 'S'].map((l, i) => (
                        <div key={i} className="w-7 h-7 rounded-full bg-dark-800 border-2 border-dark-900 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-dark-400">{l}</span>
                        </div>
                      ))}
                    </div>
                    <span className="text-[11px] text-dark-600 ml-1">+7 with per-app access</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════ CHROME EXTENSION ═══════════════════════════════════ */}
      <section className="relative py-20 lg:py-28 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-16 items-center">
            <Reveal>
              <Eyebrow>chrome extension</Eyebrow>
              <h2 className="font-marketing text-[34px] lg:text-[46px] font-bold text-white tracking-[-0.025em] leading-[1.05]">
                Capture leads without leaving LinkedIn
              </h2>
              <p className="text-dark-400 text-lg mt-5 leading-relaxed">
                The <span className="text-dark-200 font-medium">Rivvra LinkedIn Lead Extractor</span> pulls a prospect's
                name, title, company and verified email straight from their profile or a search —
                then saves them to Outreach in one click.
              </p>
              <ul className="space-y-3 mt-8">
                {[
                  { icon: Linkedin, title: 'One-click extraction', text: 'Grab profile data from any LinkedIn page or search result.' },
                  { icon: BadgeCheck, title: 'Email enrichment', text: 'Find and verify a working email for every contact.' },
                  { icon: Sparkles, title: 'AI emails, DMs & notes', text: 'Draft personalized outreach right inside the panel.' },
                  { icon: Mail, title: 'Straight into Outreach', text: 'Saved leads sync to your workspace — no copy-paste.' },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-3.5 group">
                    <div className="w-9 h-9 rounded-xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center flex-shrink-0 group-hover:border-rivvra-500/30 group-hover:bg-rivvra-500/[0.06] transition-colors">
                      <item.icon className="w-4 h-4 text-rivvra-400" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-dark-100">{item.title}</p>
                      <p className="text-dark-500 text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
                <a
                  href={EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group px-6 py-3.5 bg-rivvra-500 text-dark-950 rounded-xl text-[15px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-xl hover:shadow-rivvra-500/25 inline-flex items-center justify-center gap-2"
                >
                  <Chrome className="w-4 h-4" />
                  Add to Chrome
                </a>
                <span className="text-dark-500 text-[13px]">Free · auto-pairs with your Rivvra login</span>
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="relative">
                <div className="absolute -inset-6 aurora blur-[80px] opacity-40 pointer-events-none" />
                <div className="relative">
                  <ExtensionMock />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════ HOW IT WORKS ═══════════════════════════════════════ */}
      <section className="relative grain py-20 lg:py-28 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="text-center max-w-xl mx-auto mb-14">
            <Eyebrow>get going</Eyebrow>
            <h2 className="font-marketing text-[34px] lg:text-[46px] font-bold text-white tracking-[-0.025em] leading-[1.05]">
              Live in minutes, not a migration
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Create your workspace', desc: 'Sign up with your work email — your org workspace is created automatically.' },
              { step: '02', title: 'Choose your apps', desc: 'Switch on one app or all nine. Add more as your team grows.' },
              { step: '03', title: 'Invite your team', desc: 'Add teammates with per-app access. Pay only for who uses what.' },
            ].map((item, i) => (
              <Reveal key={item.step} delay={i * 0.1}>
                <div className="relative h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7">
                  <span className="font-serif-accent italic text-[40px] text-rivvra-400/30 leading-none">{item.step}</span>
                  <h3 className="font-marketing text-lg font-semibold text-white mt-3">{item.title}</h3>
                  <p className="text-dark-500 text-sm leading-relaxed mt-2">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ PRICING TEASER ═════════════════════════════════════ */}
      <section className="relative py-20 lg:py-28 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal className="text-center max-w-xl mx-auto mb-12">
            <Eyebrow>pricing</Eyebrow>
            <h2 className="font-marketing text-[34px] lg:text-[46px] font-bold text-white tracking-[-0.025em] leading-[1.05]">
              Start free. Pay only as you grow.
            </h2>
            <p className="text-dark-400 text-lg mt-5">All 14 apps on every plan — per-seat, no surprises.</p>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {[
              { plan: 'Free', price: '$0', desc: 'All 14 apps · up to 3 users · 50 emails/day · 2 GB', featured: false },
              { plan: 'Growth', price: '$3', desc: 'All 14 apps · up to 25 users · 500 emails/day · 25 GB', featured: true },
              { plan: 'Scale', price: '$6', desc: 'All 14 apps · unlimited users · 2,000 emails/day · 100 GB', featured: false },
            ].map((item) => (
              <Reveal key={item.plan} delay={item.featured ? 0.08 : 0}>
                <div className={`relative h-full rounded-2xl p-7 ${item.featured ? 'border border-rivvra-500/30 bg-rivvra-500/[0.04]' : 'border border-white/[0.08] bg-white/[0.02]'}`}>
                  {item.featured && (
                    <span className="absolute top-5 right-5 text-[10px] font-semibold text-rivvra-300 bg-rivvra-500/15 ring-1 ring-rivvra-500/25 rounded-md px-2 py-0.5">
                      Most popular
                    </span>
                  )}
                  <p className="text-[12px] font-semibold text-dark-400 uppercase tracking-widest mb-3">{item.plan}</p>
                  <p className="font-marketing text-[44px] font-bold text-white leading-none tracking-[-0.02em]">
                    {item.price}<span className="text-base font-normal text-dark-500"> {item.price === '$0' ? '/forever' : '/user/mo'}</span>
                  </p>
                  <p className="text-[13px] text-dark-500 mt-4 leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1} className="text-center mt-10">
            <Link to="/pricing" className="inline-flex items-center gap-1.5 text-rivvra-400 hover:text-rivvra-300 font-medium text-sm transition-colors">
              View full pricing details
              <ChevronRight className="w-4 h-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ════════════ FINAL CTA ══════════════════════════════════════════ */}
      <section className="relative py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="relative grain rounded-[28px] border border-white/[0.08] bg-dark-900/40 px-8 py-14 lg:px-16 lg:py-20 overflow-hidden text-center">
              <div className="absolute inset-0 aurora opacity-70 pointer-events-none" />
              <div className="absolute inset-x-0 -bottom-20 h-40 bg-rivvra-500/10 blur-[80px] pointer-events-none" />
              <div className="relative">
                <h2 className="font-marketing text-[34px] lg:text-[52px] font-bold text-white tracking-[-0.03em] leading-[1.02]">
                  Run your agency smarter
                  <span className="block font-serif-accent italic font-normal text-dark-400 text-[26px] lg:text-[38px] mt-2">
                    starting today.
                  </span>
                </h2>
                <p className="text-dark-400 text-lg max-w-xl mx-auto mt-6">
                  Spin up your workspace in minutes. All apps included in the trial, no credit card required.
                </p>
                <div className="mt-9">
                  <Link
                    to="/signup"
                    className="group px-9 py-4 bg-rivvra-500 text-dark-950 rounded-xl text-[15px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-xl hover:shadow-rivvra-500/25 inline-flex items-center gap-2"
                  >
                    Start free trial
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
                <p className="text-dark-600 text-[13px] mt-5">Work email required</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingLayout>
  );
}

export default LandingPage;
