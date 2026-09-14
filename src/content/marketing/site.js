/**
 * Site-wide marketing copy: navigation, solutions, pricing facts, FAQ.
 * Pricing numbers mirror the API's PLAN_LIMITS; change both or neither.
 */
export const EXTENSION_URL = 'https://chromewebstore.google.com/detail/rivvra-linkedin-lead-extr/afmjolicodhklbppiknbbjpjbhfjhipm';
export const SUPPORT_EMAIL = 'support@rivvra.com';

export const SOLUTIONS = [
  { slug: 'india-staffing', name: 'India IT staffing', short: 'Contract staffing with PF, ESI, PT and TDS payroll, GST invoicing and timesheets that close the month.', hero: '/shots/payroll/run-detail.webp' },
  { slug: 'us-canada-staffing', name: 'US and Canada staffing', short: 'Consultant timesheets, USD and CAD client invoicing, hourly rates and margins.', hero: '/shots/timesheet/approvals.webp' },
  { slug: 'recruitment-agencies', name: 'Recruitment agencies', short: 'ATS, careers site, AI résumé scoring, CRM and outreach for permanent placement.', hero: '/shots/ats/pipeline.webp' },
  { slug: 'hr-teams', name: 'In-house HR teams', short: 'Self service, attendance, leave, expenses, documents and e-signature for your own people.', hero: '/shots/ess/my-salary.webp' },
];
export const solutionHref = (s) => `/solutions/${s.slug}`;

export const PLANS = [
  { id: 'free', name: 'Free', price: 0, unit: 'forever', blurb: 'Every app, for a team of three.', limits: { seats: '3 team members', records: '500 active records', emails: '50 outreach emails a day', storage: '2 GB storage', ai: '100 AI actions a month' }, support: 'Email support, 2 business days', cta: 'Start for free' },
  { id: 'growth', name: 'Growth', price: 3, unit: 'per user per month', blurb: 'For agencies with a real bench.', limits: { seats: '25 team members', records: '10,000 active records', emails: '500 outreach emails a day', storage: '25 GB storage', ai: '2,000 AI actions a month' }, support: 'Email support, 1 business day', cta: 'Start for free', featured: true },
  { id: 'scale', name: 'Scale', price: 6, unit: 'per user per month', blurb: 'No seat or record limits.', limits: { seats: 'Unlimited team members', records: 'Unlimited active records', emails: '2,000 outreach emails a day', storage: '100 GB storage', ai: 'Unlimited AI actions' }, support: 'Priority support, same day', cta: 'Start for free' },
];

export const FOUNDING = {
  code: 'FOUNDING50',
  headline: 'The first five agencies get half price for a year.',
  text: 'Enter FOUNDING50 at checkout for 50% off Growth or Scale for 12 months. We onboard you personally, migrate your data, and you get a direct line to the team building the product.',
};

export const HOME_FAQ = [
  { q: 'Is the Free plan really free?', a: 'Yes. All 14 apps, no time limit, no card. It is capped at 3 team members, 500 active records, 50 outreach emails a day, 2 GB of storage and 100 AI actions a month. Upgrade when you outgrow one of those.' },
  { q: 'Is my data mine?', a: 'Yes. Your workspace is isolated from every other customer\'s, exports are available on every plan, and if you leave we delete on request. Rivvra staff never see your data without an audit-logged reason.' },
  { q: 'Does payroll work outside India?', a: 'Statutory payroll (PF, ESI, PT, TDS) is for Indian entities. US and Canadian entities use timesheets, hourly rates and USD or CAD invoicing; consultant pay is exported to your payroll provider.' },
  { q: 'What happens when I hit a limit?', a: 'Nothing is deleted. The action that would exceed the limit pauses and you are asked to upgrade. Everything else keeps working.' },
  { q: 'Can I cancel any time?', a: 'Yes. Cancel from Billing and the workspace drops to Free at the end of the period. Prices are in USD and cards are charged in USD.' },
  { q: 'How do I get help?', a: 'Every plan has email support with a person on the other end. Growth gets a one-business-day response, Scale gets same day. There is also a knowledge base and Ask Rivvra inside the product.' },
];

export const NAV = {
  primary: [
    { label: 'Pricing', to: '/pricing' },
    { label: 'Support', to: '/support' },
  ],
};
