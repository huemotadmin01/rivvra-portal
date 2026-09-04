/**
 * Contact engagement status metadata (2026-09-04).
 * Mirrors ENGAGEMENT_LABELS / STATUS_RANK in the API's
 * helpers/contactEngagement.js. Keep the two in sync.
 */
export const ENGAGEMENT_META = {
  active_customer: { label: 'Active customer', tone: 'brand', hint: 'Has an active assignment, or a hire in the last 12 months' },
  past_customer: { label: 'Past customer', tone: 'purple', hint: 'Assignments have ended, or older hires only' },
  in_progress: { label: 'In progress', tone: 'info', hint: 'Has an open job, nothing hired yet' },
  unconverted: { label: 'Unconverted', tone: 'warn', hint: 'Sent jobs, none hired, none open' },
  prospect: { label: 'Prospect', tone: 'neutral', hint: 'CRM opportunities only, never sent a job' },
  never_engaged: { label: 'Never engaged', tone: 'neutral', hint: 'No jobs, assignments or opportunities' },
};

export const ENGAGEMENT_OPTIONS = Object.entries(ENGAGEMENT_META).map(([value, m]) => ({ value, label: m.label }));

export function engagementMeta(status) {
  return ENGAGEMENT_META[status] || { label: '—', tone: 'neutral', hint: '' };
}
