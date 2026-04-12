// Knowledge Base article registry.
//
// Markdown bodies are imported at build time via Vite's import.meta.glob
// so the reader UI stays 100% frontend — no backend, no fetch, no CORS.
// To add a new article:
//   1. Drop a new `.md` file under src/content/knowledge/
//   2. Add a metadata entry below with `slug` matching the filename (minus .md)
//   3. Assign it to an existing category or add a new one to CATEGORIES

// Raw markdown content keyed by filename
const rawArticles = import.meta.glob('./*.md', { eager: true, query: '?raw', import: 'default' });

export const CATEGORIES = [
  {
    id: 'employee',
    name: 'Employee',
    description: 'Hiring, onboarding, separation, F&F settlement',
    color: 'orange',
  },
  {
    id: 'payroll',
    name: 'Payroll',
    description: 'Running payroll, TDS, payslips, statutory compliance',
    color: 'amber',
  },
  {
    id: 'timesheet',
    name: 'Employee Self Service',
    description: 'Attendance, leaves, timesheets',
    color: 'blue',
  },
  {
    id: 'ats',
    name: 'ATS',
    description: 'Job positions, candidate pipeline, interviews',
    color: 'purple',
  },
];

// Article metadata. The reader UI uses this to build navigation.
// Articles without an entry here are ignored even if the .md file exists.
export const ARTICLES = [
  // ── Employee ──────────────────────────────────────────────────────────
  {
    slug: 'employee-onboarding',
    title: 'Employee Onboarding Workflow',
    category: 'employee',
    description: 'Step-by-step guide for creating an employee record, inviting them to the portal, and launching their onboarding plan.',
    order: 1,
  },
  {
    slug: 'employee-offboarding',
    title: 'Employee Offboarding & Full & Final',
    category: 'employee',
    description: 'How to mark an employee resigned, prepare the F&F settlement, clear assets, and merge the final payout into payroll.',
    order: 2,
  },
  {
    slug: 'alumni-access',
    title: 'Alumni Access (Post-Separation Portal)',
    category: 'employee',
    description: 'How the read-only alumni lifecycle works: phases, policy, directory, reactivation, and alumni-aware password reset.',
    order: 3,
  },
  // ── Payroll ───────────────────────────────────────────────────────────
  {
    slug: 'running-payroll',
    title: 'Running Payroll',
    category: 'payroll',
    description: 'End-to-end payroll processing: salary structures, statutory deductions (PF/ESI/PT/TDS), tax regimes, payroll runs, payslip release, challans, and exports.',
    order: 1,
  },
  // ── Employee Self Service ─────────────────────────────────────────────
  {
    slug: 'employee-self-service',
    title: 'Employee Self Service Guide',
    category: 'timesheet',
    description: 'Attendance marking, leave management, salary and payslip access, tax declarations, holiday calendar, and ESS configuration for admins.',
    order: 1,
  },
];

export function getArticleBySlug(slug) {
  const meta = ARTICLES.find(a => a.slug === slug);
  if (!meta) return null;
  const body = rawArticles[`./${slug}.md`];
  if (!body) return null;
  return { ...meta, body };
}

export function getCategoryArticles(categoryId) {
  return ARTICLES
    .filter(a => a.category === categoryId)
    .sort((a, b) => (a.order || 999) - (b.order || 999));
}

export function getAllCategoriesWithArticles() {
  return CATEGORIES.map(cat => ({
    ...cat,
    articles: getCategoryArticles(cat.id),
  })).filter(cat => cat.articles.length > 0);
}
