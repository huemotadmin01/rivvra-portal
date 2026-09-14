/**
 * Public changelog. Newest first. Write for customers: what changed for them,
 * in their words, no internal ticket names. Dates are release dates.
 *
 *   { date: 'YYYY-MM-DD', title, items: ['…'], apps: ['ats', …] }
 */
export const CHANGELOG = [
  { date: '2026-09-14', title: 'Support in the product, custom sending domains, AI usage limits', apps: ['outreach', 'invoicing', 'knowledgeBase'], items: [
    'Contact support from the top bar of any page. Your workspace, plan and the page you are on come with the message, so you do not have to explain them.',
    'Ask Rivvra hands over to a person when it cannot answer, with the conversation attached.',
    'Growth and Scale workspaces can send outreach, invoices and notifications from their own domain, and remove the "Powered by Rivvra" footer.',
    'AI actions are now metered per plan: 100 a month on Free, 2,000 on Growth, unlimited on Scale. Usage shows in Billing.',
    'Sign-up now checks for bots and rejects disposable email domains.',
  ] },
  { date: '2026-09-12', title: 'Ask Rivvra across every app', apps: ['knowledgeBase'], items: [
    'Ask a question in plain words and get an answer from your own workspace: who is on the bench, which invoices are overdue, how many candidates reached L2. Sources are listed under every answer.',
    'Company scope is respected: people see answers only from entities they can access. The assistant never edits data.',
  ] },
  { date: '2026-09-10', title: 'Bench status follows assignments', apps: ['employee', 'timesheet'], items: [
    'A consultant with no active assignment is marked non-billable automatically when the assignment ends or is removed. Upcoming and on-hold assignments keep the billable flag.',
  ] },
  { date: '2026-09-08', title: 'Self-service polish', apps: ['timesheet', 'employee'], items: [
    'My Documents and My Profile open inside the app shell with the rest of self service.',
    'Earnings estimates stop at the last working day for leavers.',
    'The referral-link toggle is back in ATS settings.',
  ] },
  { date: '2026-09-04', title: 'Customer engagement on company contacts', apps: ['contacts', 'crm'], items: [
    'Every company shows whether it is an active customer, a prospect or dormant, computed from its jobs and invoices. Filter the directory by it and export it to CSV.',
  ] },
  { date: '2026-08-30', title: 'Workspace URLs and lead recovery', apps: ['outreach'], items: [
    'The workspace in the address bar is the workspace you are working in, for people who belong to more than one.',
    'Leads saved before workspaces existed are now visible to the team that saved them.',
  ] },
  { date: '2026-08-28', title: 'Knowledge Base guides and semantic search', apps: ['knowledgeBase'], items: [
    'Seventeen written guides covering every app, from posting a job to filing GST, with search that understands the question rather than matching words.',
  ] },
  { date: '2026-08-26', title: 'The new interface for everyone', apps: [], items: [
    'The redesigned shell is on for every workspace: a single app switcher, consistent lists and detail pages, light and dark themes, and a mobile layout that works.',
  ] },
  { date: '2026-08-24', title: 'Sourcing strings and submittal summaries', apps: ['ats'], items: [
    'Generate Boolean sourcing strings from a job description, and a one-page submittal summary for a candidate to send to the client.',
  ] },
  { date: '2026-08-21', title: 'ICP scoring for leads', apps: ['outreach'], items: [
    'Every lead gets a score against the companies you already win, so lists sort by fit. Semantic matching finds similar companies you have not seen.',
  ] },
  { date: '2026-08-20', title: 'Hiring signals, job aging, reply intent', apps: ['outreach', 'ats'], items: [
    'Watch target companies and Rivvra checks their public job boards daily for new postings.',
    'The ATS dashboard shows how long each job has been open and flags the ones past their SLA.',
    'Replies logged on sequences are classified into eight intents, and the lead carries a badge.',
  ] },
  { date: '2026-08-18', title: 'Job status emails', apps: ['ats'], items: [
    'Putting a job on hold or closing it notifies the recruiter and account owner with the reason.',
  ] },
  { date: '2026-08-13', title: 'Partial payslip release', apps: ['payroll', 'timesheet'], items: [
    'Release payslips for some employees and hold the rest; re-process a run without disturbing released rows.',
    'Timesheet entries are limited to the days inside an assignment.',
  ] },
  { date: '2026-08-10', title: 'Mobile layouts and GST reconciliation', apps: ['invoicing'], items: [
    'Every app works on a phone: lists collapse to cards, forms stack, menus become sheets.',
    'The GST report re-reconciles automatically after a 2B import.',
  ] },
];
