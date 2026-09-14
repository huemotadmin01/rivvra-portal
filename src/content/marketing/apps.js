/**
 * The 14 apps as the marketing site describes them — ONE source for the nav
 * dropdown, the home grid, the features hub and every /features/<slug> page.
 *
 * Every claim here was checked against an API route on 2026-09-14 (see
 * Rivvra-Platform/LAUNCH_READINESS_2026_09_13.md, "marketing copy audit").
 * Keep it that way: describe what the product does today, in the product's
 * own words. Screenshots live in public/shots/<app>/ and were captured from
 * the Brightline Staffing demo workspace.
 */
import {
  Mail, Clock, Briefcase, UserSearch, Banknote, UsersRound, Contact, PenTool,
  CheckSquare, Receipt, Wallet, Award, FolderArchive, BookOpen,
} from 'lucide-react';

export const APPS = [
  {
    id: 'outreach', slug: 'outreach', name: 'Outreach', icon: Mail, tint: 'green',
    short: 'Find prospects on LinkedIn and run email sequences from your own Gmail.',
    tagline: 'Client acquisition without the spreadsheet',
    hero: '/shots/outreach/leads.webp',
    capabilities: [
      { title: 'LinkedIn extraction', text: 'The Chrome extension saves profiles, titles and companies from LinkedIn search results into your lead list in one click.', shot: '/shots/outreach/team-contacts.webp' },
      { title: 'Sequences from your Gmail', text: 'Multi-step sequences with waits and follow-ups, sent from the connected Gmail account so replies land where you already work.', shot: '/shots/outreach/sequence-editor.webp' },
      { title: 'Reply handling', text: 'Log a reply in one click; AI classifies the intent and the sequence pauses. Unsubscribe links are handled automatically.', shot: '/shots/outreach/sequences.webp' },
      { title: 'Hiring signals and ICP score', text: 'Every lead carries an ICP score against your best clients, and companies you watch are checked daily for new job postings.', shot: '/shots/outreach/dashboard.webp' },
    ],
    worksWith: ['crm', 'contacts', 'ats'],
    faq: [
      { q: 'Does Rivvra send from its own servers?', a: 'No. Sequences send through the Gmail account you connect, under your name, within the daily limit you set.' },
      { q: 'Can my team share lists?', a: 'Yes. Leads and sequences can be shared with the workspace, and team leads see everyone\'s pipeline.' },
    ],
  },
  {
    id: 'ats', slug: 'ats', name: 'ATS', icon: UserSearch, tint: 'purple',
    short: 'Jobs, candidates and a pipeline from sourced to placed, with AI résumé scoring.',
    tagline: 'Applicant tracking built for agencies',
    hero: '/shots/ats/pipeline.webp',
    capabilities: [
      { title: 'Client and internal jobs', text: 'Open a client role or an internal one, set budgets and hiring mode, and route it through approval before recruiters start sourcing.', shot: '/shots/ats/jobs.webp' },
      { title: 'A pipeline you can drag', text: 'Nine stages from New to Hired, per company. Move candidates with a drag, and every move is timestamped.', shot: '/shots/ats/pipeline.webp' },
      { title: 'Interview rounds and results', text: 'Schedule L1, L2 and HR rounds, email .ics invites to candidates and interviewers, and record results against the application.', shot: '/shots/ats/application.webp' },
      { title: 'Time to fill, at a glance', text: 'The dashboard shows the funnel, stage counts and median time to fill for the period you pick.', shot: '/shots/ats/dashboard.webp' },
    ],
    worksWith: ['contacts', 'employee', 'incentive', 'sign'],
    faq: [
      { q: 'Is there a careers page?', a: 'Yes. Every workspace gets a public careers site; published jobs accept applications with résumé upload.' },
      { q: 'How does AI résumé scoring work?', a: 'Upload a résumé and Rivvra scores it against the job\'s required skills and experience, with a written rationale. Scoring counts toward the plan\'s monthly AI actions.' },
    ],
  },
  {
    id: 'crm', slug: 'crm', name: 'CRM', icon: Briefcase, tint: 'green',
    short: 'Deals with expected value, probability and closing date, on a kanban or a list.',
    tagline: 'Every client conversation in one pipeline',
    hero: '/shots/crm/pipeline.webp',
    capabilities: [
      { title: 'Pipeline stages you control', text: 'Initial Contact to Converted, or your own stages. Drag deals across the board or work them as a list.', shot: '/shots/crm/pipeline.webp' },
      { title: 'Expected revenue on every deal', text: 'Value, probability and closing date sit on the deal, with pipeline totals by stage on the dashboard.', shot: '/shots/crm/dashboard.webp' },
      { title: 'Deals become jobs', text: 'Convert a won staffing deal into an ATS job without re-entering the client or the role.', shot: '/shots/crm/opportunity.webp' },
    ],
    worksWith: ['contacts', 'ats', 'outreach', 'invoicing'],
    faq: [{ q: 'Can I import from another CRM?', a: 'Contacts import from CSV. Deals are created in Rivvra; we can help with a one-time migration on the Scale plan.' }],
  },
  {
    id: 'contacts', slug: 'contacts', name: 'Contacts', icon: Contact, tint: 'cyan',
    short: 'One record per company and person, shared by CRM, ATS and Invoicing.',
    tagline: 'The directory every other app reads',
    hero: '/shots/contacts/companies.webp',
    capabilities: [
      { title: 'Companies and people', text: 'Clients, prospects and vendors as companies; their people underneath, with titles and phone numbers.', shot: '/shots/contacts/companies.webp' },
      { title: 'Engagement you can see', text: 'Each company shows whether it is an active customer, a prospect or has never engaged, computed from jobs and invoices.', shot: '/shots/contacts/company-detail.webp' },
      { title: 'GST and billing details', text: 'GSTIN, PAN and billing address live on the contact so invoices are right the first time.', shot: '/shots/contacts/individuals.webp' },
    ],
    worksWith: ['crm', 'ats', 'invoicing'],
    faq: [{ q: 'Do employees become contacts?', a: 'Yes. Every employee gets a mirrored contact so bills and reimbursements can be raised against them.' }],
  },
  {
    id: 'timesheet', slug: 'timesheets', name: 'Timesheets & ESS', icon: Clock, tint: 'blue',
    short: 'Consultants log hours against client projects; managers approve; payroll and invoices follow.',
    tagline: 'Hours in, invoices and payslips out',
    hero: '/shots/timesheet/approvals.webp',
    capabilities: [
      { title: 'Monthly sheets per project', text: 'Consultants fill a calendar for each client project. Weekends and holidays are pre-marked; leave comes from the Leave module.', shot: '/shots/ess/my-timesheet.webp' },
      { title: 'One approval queue', text: 'Submitted sheets land in a single queue with the client, project and hours. Approve, reject with a reason, or revert.', shot: '/shots/timesheet/approvals.webp' },
      { title: 'Self service for every employee', text: 'Salary breakdown, payslips, leave balances, assets and documents, each on its own page.', shot: '/shots/ess/my-salary.webp' },
      { title: 'Leave with balances', text: 'Sick, casual and loss-of-pay by financial year, accrued monthly, approved by managers.', shot: '/shots/timesheet/leave-balances.webp' },
    ],
    worksWith: ['payroll', 'invoicing', 'employee'],
    faq: [{ q: 'Do approved hours flow into invoices?', a: 'Yes. Customer invoices can be built from approved timesheets for the period, per client.' }],
  },
  {
    id: 'payroll', slug: 'payroll', name: 'Payroll', icon: Banknote, tint: 'amber',
    short: 'Indian statutory payroll: PF, ESI, PT and TDS computed, payslips released to ESS.',
    tagline: 'Statutory payroll for Indian entities',
    hero: '/shots/payroll/run-detail.webp',
    capabilities: [
      { title: 'Salary structures', text: 'Basic, HRA and allowances as shares of gross; one default, overrides per employee, revisions with an effective date.', shot: '/shots/payroll/salary-structures.webp' },
      { title: 'A run per month', text: 'Create, process, review each line, finalize, mark paid. Attendance and approved timesheets feed the day count.', shot: '/shots/payroll/run-detail.webp' },
      { title: 'PF, ESI, PT and TDS', text: 'Statutory deductions per employee with the FY tables, plus the ECR, ESI and PT files you file with.', shot: '/shots/payroll/process.webp' },
      { title: 'Payslips in self service', text: 'Release payslips and every employee sees theirs under My Payslips, with a PDF.', shot: '/shots/ess/my-payslips.webp' },
    ],
    worksWith: ['timesheet', 'employee', 'invoicing'],
    faq: [
      { q: 'Which countries?', a: 'Statutory payroll is available for Indian entities. US and Canadian entities use Timesheets and Invoicing for consultant pay and client billing.' },
      { q: 'Can I import past payslips?', a: 'Yes. Payslip history can be imported so year-to-date tax figures are right from the first run.' },
    ],
  },
  {
    id: 'invoicing', slug: 'invoicing', name: 'Invoicing', icon: Receipt, tint: 'amber',
    short: 'Customer invoices with GST, vendor and employee bills, payments, aged reports.',
    tagline: 'Bill clients, pay vendors, file GST',
    hero: '/shots/invoicing/invoices.webp',
    capabilities: [
      { title: 'Numbered, GST-correct invoices', text: 'Sequential numbering per journal, CGST/SGST or IGST by place of supply, multi-currency for overseas clients.', shot: '/shots/invoicing/invoice-detail.webp' },
      { title: 'Payments and what is outstanding', text: 'Record full or partial payments; aged receivables show who owes what and for how long.', shot: '/shots/invoicing/receivables.webp' },
      { title: 'Vendor and employee bills', text: 'Bills with TDS, and reimbursements that come straight from approved expense claims.', shot: '/shots/invoicing/bills.webp' },
      { title: 'GST and TDS reports', text: 'GSTR-1, GSTR-3B, 2B reconciliation and TDS reports for Indian entities, plus profitability by month.', shot: '/shots/invoicing/dashboard.webp' },
    ],
    worksWith: ['contacts', 'timesheet', 'expenses', 'incentive'],
    faq: [{ q: 'E-invoicing?', a: 'IRN generation is built and switches on per entity once your GSTIN is enabled for e-invoicing.' }],
  },
  {
    id: 'employee', slug: 'employee', name: 'Employee', icon: UsersRound, tint: 'orange',
    short: 'Directory, departments, assignments, onboarding plans and assets.',
    tagline: 'HR records that payroll and timesheets trust',
    hero: '/shots/employee/directory.webp',
    capabilities: [
      { title: 'Directory and org chart', text: 'Every person with their department, manager, employment type and billable status; the chart draws itself.', shot: '/shots/employee/org-chart.webp' },
      { title: 'Assignments with rates', text: 'Client, project, pay rate and bill rate on each consultant, with a rate history.', shot: '/shots/employee/detail.webp' },
      { title: 'Onboarding plans', text: 'Reusable task lists for joiners and leavers, assigned to HR, the manager or the employee with due days.', shot: '/shots/employee/plan-templates.webp' },
      { title: 'Assets', text: 'Laptops, phones and cards issued and returned, with a clearance list at exit.', shot: '/shots/employee/assets.webp' },
    ],
    worksWith: ['timesheet', 'payroll', 'ats'],
    faq: [{ q: 'Can a hire in the ATS become an employee?', a: 'Yes. A hired application creates the employee record with the offer details carried over.' }],
  },
  {
    id: 'expenses', slug: 'expenses', name: 'Expenses', icon: Wallet, tint: 'green',
    short: 'Claims with receipts, approval by team lead or admin, reimbursement through bills.',
    tagline: 'Claims that end as paid bills',
    hero: '/shots/expenses/all.webp',
    capabilities: [
      { title: 'Claims with receipts', text: 'Lines with category, merchant and a receipt on each. Drafts stay private until submitted.', shot: '/shots/expenses/all.webp' },
      { title: 'Approvals with history', text: 'Team leads see their team, admins see everything, and every decision is on the claim.', shot: '/shots/expenses/team.webp' },
      { title: 'Reimbursed through Invoicing', text: 'An approved claim becomes an employee bill, so finance pays it like any other bill.', shot: '/shots/invoicing/bills.webp' },
    ],
    worksWith: ['invoicing', 'employee'],
    faq: [{ q: 'Foreign currency?', a: 'Lines can be in another currency with a conversion rate; the claim settles in the entity currency.' }],
  },
  {
    id: 'incentive', slug: 'incentive', name: 'Incentive', icon: Award, tint: 'rose',
    short: 'Recruiter and account-manager commission from paid invoices, with rate tables.',
    tagline: 'Commission from paid invoices, not spreadsheets',
    hero: '/shots/incentive/records.webp',
    capabilities: [
      { title: 'Drafts from paid invoices', text: 'When a client invoice is paid, a draft incentive is minted per consultant and month, attributed to the recruiter and account manager.', shot: '/shots/incentive/records.webp' },
      { title: 'Rate tables', text: 'Default rates per role, personal overrides, and effective dates.', shot: '/shots/incentive/dashboard.webp' },
      { title: 'My earnings', text: 'Every recruiter sees their own records, what is approved and what is paid.', shot: '/shots/incentive/my-earnings.webp' },
    ],
    worksWith: ['invoicing', 'ats', 'employee'],
    faq: [{ q: 'What if the consultant leaves?', a: 'A forfeit-on-separation rule can stop further incentive for that placement.' }],
  },
  {
    id: 'sign', slug: 'sign', name: 'Sign', icon: PenTool, tint: 'indigo',
    short: 'E-signature for offers, contracts and NDAs, with templates and an audit trail.',
    tagline: 'Send, sign, done',
    hero: '/shots/sign/templates.webp',
    capabilities: [
      { title: 'Templates with fields', text: 'Upload a PDF once, place signature and text fields, reuse it for every offer or agreement.', shot: '/shots/sign/templates.webp' },
      { title: 'Requests with reminders', text: 'Send to one or many signers, in order or in parallel, with expiry and reminder days.', shot: '/shots/sign/templates.webp' },
      { title: 'Audit trail', text: 'Who viewed, signed or refused, when, from where, on every request.', shot: '/shots/sign/templates.webp' },
    ],
    worksWith: ['ats', 'employee', 'crm'],
    faq: [{ q: 'Do signers need an account?', a: 'No. Signers get a link by email and sign in the browser.' }],
  },
  {
    id: 'todo', slug: 'to-do', name: 'To-Do', icon: CheckSquare, tint: 'teal',
    short: 'Personal and team tasks, with AI task extraction from your inbox.',
    tagline: 'The follow-ups you would otherwise forget',
    hero: '/shots/todo/tasks.webp',
    capabilities: [
      { title: 'Tasks with priority and due dates', text: 'Personal tasks, team tasks assigned to an employee, recurring ones.', shot: '/shots/todo/tasks.webp' },
      { title: 'AI inbox scanner', text: 'Connect Gmail and Rivvra proposes tasks from your emails; accept or dismiss each.', shot: '/shots/todo/dashboard.webp' },
    ],
    worksWith: ['employee'],
    faq: [],
  },
  {
    id: 'documents', slug: 'documents', name: 'Documents', icon: FolderArchive, tint: 'slate',
    short: 'Company document library with folders, tags, versions and signed links.',
    tagline: 'One place for policies and contracts',
    hero: '/shots/documents/library.webp',
    capabilities: [
      { title: 'Folders and tags', text: 'Policies, client contracts, templates, statutory filings, organised your way.', shot: '/shots/documents/library.webp' },
      { title: 'Versions', text: 'Upload a new version and the history stays; restore any earlier one.', shot: '/shots/documents/library.webp' },
      { title: 'Secure access', text: 'Scoped per entity, served through signed links that expire.', shot: '/shots/documents/library.webp' },
    ],
    worksWith: ['employee', 'sign'],
    faq: [],
  },
  {
    id: 'knowledgeBase', slug: 'knowledge-base', name: 'Knowledge Base', icon: BookOpen, tint: 'sky',
    short: 'How-to guides for every app, searchable, with Ask Rivvra on top.',
    tagline: 'Answers before the question reaches you',
    hero: '/shots/kb/home.webp',
    capabilities: [
      { title: 'Guides for every app', text: 'Posting a job, moving candidates, running payroll, filing GST: written walkthroughs, maintained by Rivvra and your admins.', shot: '/shots/kb/home.webp' },
      { title: 'Ask Rivvra', text: 'Ask a question in plain words and get an answer from the guides and from your own workspace data. It never edits anything.', shot: '/shots/kb/home.webp' },
    ],
    worksWith: [],
    faq: [],
  },
];

export const APP_BY_SLUG = Object.fromEntries(APPS.map((a) => [a.slug, a]));
export const APP_BY_ID = Object.fromEntries(APPS.map((a) => [a.id, a]));
export const appHref = (a) => `/features/${a.slug}`;
