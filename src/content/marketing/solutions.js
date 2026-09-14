/**
 * Solution pages by audience. Each says plainly what the audience gets and
 * what is out of scope; every claim maps to a shipped capability.
 */
export const SOLUTION_PAGES = {
  'india-staffing': {
    eyebrow: 'India IT staffing',
    title: 'Contract staffing that closes the month on time.',
    lede: 'Consultants at client sites, monthly billing with GST, statutory payroll with PF, ESI, PT and TDS, and commission for the recruiters who placed them. All from one set of records.',
    hero: '/shots/payroll/run-detail.webp',
    heroAlt: 'August payroll run for an Indian entity, paid, with PF and TDS columns',
    points: [
      { title: 'Timesheets by client project', text: 'Each consultant fills a monthly calendar against the project they are deployed on. Weekends and Indian holidays are pre-marked; managers approve from one queue.', shot: '/shots/timesheet/approvals.webp' },
      { title: 'Invoices with the right tax', text: 'CGST and SGST for same-state clients, IGST across states, sequential numbering per journal, place of supply on every invoice. GSTR-1 and 3B reports and 2B reconciliation are built in.', shot: '/shots/invoicing/invoice-detail.webp' },
      { title: 'Payroll you can file from', text: 'Salary structures, PF and ESI applicability per employee, professional tax by state, TDS under the new or old regime. The run produces the ECR, ESI and bank files.', shot: '/shots/payroll/run-detail.webp' },
      { title: 'Commission from paid invoices', text: 'When the client pays, a draft incentive is minted per consultant and month for the recruiter and the account manager, at the rates you set.', shot: '/shots/incentive/records.webp' },
    ],
    apps: ['timesheet', 'invoicing', 'payroll', 'incentive', 'employee', 'ats'],
    outOfScope: 'E-invoicing (IRN) switches on per entity once your GSTIN is enabled for it. Payroll is for Indian entities; overseas entities use timesheets and invoicing.',
    faq: [
      { q: 'Multiple entities?', a: 'Yes. A workspace can hold several legal entities. Each has its own currency, GST details, journals and payroll; people are scoped to the entity they work in.' },
      { q: 'Can we migrate from Tally, Zoho or Odoo?', a: 'Contacts, employees and invoice history import from CSV. We help with the first migration on the Scale plan.' },
    ],
  },
  'us-canada-staffing': {
    eyebrow: 'US and Canada staffing',
    title: 'Hourly consultants, USD invoices, margins you can see.',
    lede: 'Consultants on W-2 or corp-to-corp fill hours against client projects. You approve, invoice in USD or CAD, and see pay against bill on every assignment.',
    hero: '/shots/timesheet/approvals.webp',
    heroAlt: 'Timesheet approvals queue',
    points: [
      { title: 'Hourly rates on the assignment', text: 'Pay rate and bill rate live on the consultant\'s assignment, with a rate history. Margin is visible per person, per client.', shot: '/shots/employee/detail.webp' },
      { title: 'Timesheets your clients accept', text: 'Monthly sheets per project with daily hours. Approved hours become invoice lines with the period on each line.', shot: '/shots/ess/my-timesheet.webp' },
      { title: 'USD and CAD invoicing', text: 'Invoices in the client\'s currency, Net 15, 30 or 45 terms, partial payments, aged receivables by client.', shot: '/shots/invoicing/receivables.webp' },
      { title: 'A separate US entity', text: 'Your US corporation is its own entity in the workspace: its own contacts, journals, invoice numbering and consultants, next to an Indian or other entity.', shot: '/shots/settings/companies.webp' },
    ],
    apps: ['timesheet', 'invoicing', 'employee', 'ats', 'crm', 'contacts'],
    outOfScope: 'US and Canadian payroll taxes are not computed by Rivvra. Export approved hours and pay rates to your payroll provider.',
    faq: [
      { q: 'Do you handle 1099 or T4A filing?', a: 'No. Rivvra tracks hours, rates and payments; filings stay with your accountant or payroll provider.' },
      { q: 'Time zones?', a: 'Timesheets are per calendar day in the consultant\'s entity; the app displays times in each viewer\'s zone.' },
    ],
  },
  'recruitment-agencies': {
    eyebrow: 'Recruitment agencies',
    title: 'From sourcing to placement fee, without the tab chaos.',
    lede: 'A pipeline per job, a careers site that feeds it, AI that scores résumés and explains itself, and a CRM for the clients who send the roles.',
    hero: '/shots/ats/pipeline.webp',
    heroAlt: 'ATS pipeline board',
    points: [
      { title: 'A pipeline per job', text: 'Nine stages from New to Hired, drag to move, timestamps on every transition, interview rounds with results.', shot: '/shots/ats/pipeline.webp' },
      { title: 'Résumés scored, not skimmed', text: 'Upload a résumé and get a score against the job\'s required skills and experience with a written rationale. Duplicate candidates are caught on entry.', shot: '/shots/ats/candidates.webp' },
      { title: 'Clients in the CRM', text: 'Deals for each requirement with expected fee, probability and closing date. Convert a won deal into the job.', shot: '/shots/crm/opportunities.webp' },
      { title: 'Time to fill on the dashboard', text: 'Funnel, stage counts and median time to fill for the period. Jobs past their SLA are flagged.', shot: '/shots/ats/dashboard.webp' },
    ],
    apps: ['ats', 'crm', 'outreach', 'contacts', 'sign', 'incentive'],
    outOfScope: 'Rivvra does not post to job boards on your behalf; it hosts your careers page and takes applications from it.',
    faq: [
      { q: 'Careers page?', a: 'Every workspace gets one at rivvra.com/careers/<your-workspace>. Publish a job and it appears with an application form and résumé upload.' },
      { q: 'Offer letters?', a: 'Send offers for e-signature from the application with Sign; the signed copy stays on the candidate.' },
    ],
  },
  'hr-teams': {
    eyebrow: 'In-house HR teams',
    title: 'Self service your people will actually use.',
    lede: 'Attendance, leave, payslips, expense claims, documents and e-signature, in one place, on any device. Payroll for Indian entities included.',
    hero: '/shots/ess/my-salary.webp',
    heroAlt: 'My Salary page in employee self service',
    points: [
      { title: 'Everything an employee needs', text: 'Salary breakdown, payslips, leave balances and requests, attendance, assets, documents, all under their own login with nothing else visible.', shot: '/shots/ess/dashboard.webp' },
      { title: 'Leave with real balances', text: 'Sick, casual and loss-of-pay by financial year, accrued monthly, approved by managers, reflected in payroll.', shot: '/shots/timesheet/leave-balances.webp' },
      { title: 'Expenses with receipts', text: 'Claims with a receipt on every line, approval by team lead or admin, reimbursement as a bill finance can pay.', shot: '/shots/expenses/all.webp' },
      { title: 'Onboarding plans and assets', text: 'Reusable task lists for joiners and leavers; laptops and cards issued, returned and cleared at exit.', shot: '/shots/employee/plan-templates.webp' },
    ],
    apps: ['timesheet', 'employee', 'payroll', 'expenses', 'documents', 'sign'],
    outOfScope: 'Rivvra is not a performance-review or learning tool. It runs the records and the money.',
    faq: [
      { q: 'Can people log in with Google?', a: 'Yes. Workspaces allow Google sign-in, password sign-in, or both.' },
      { q: 'Do we need the agency apps?', a: 'No. Admins switch on only the apps you use; the rest never appear in the launcher.' },
    ],
  },
};
