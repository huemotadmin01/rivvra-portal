/**
 * Shared constants for the Sequence Wizard and SequenceDetailPage
 */

// ==================== PLACEHOLDERS ====================
export const PLACEHOLDERS = [
  { label: '{{firstName}}', desc: 'First name' },
  { label: '{{lastName}}', desc: 'Last name' },
  { label: '{{company}}', desc: 'Company name' },
  { label: '{{title}}', desc: 'Job title' },
  { label: '{{senderName}}', desc: 'Your name' },
  { label: '{{senderTitle}}', desc: 'Your title' },
];

// ==================== OUTBOUND OUTREACH TEMPLATE ====================
const OUTBOUND_TEMPLATE_STEPS = [
  { type: 'email', subject: 'Quick intro - {{firstName}}', body: 'Hi {{firstName}},\n\nI came across your profile at {{company}} and wanted to reach out.\n\nWould love to connect and share how we might be able to help.\n\nBest,\n{{senderName}}', days: 0 },
  { type: 'wait', subject: '', body: '', days: 2 },
  { type: 'email', subject: 'Re: Quick intro - {{firstName}}', body: 'Hi {{firstName}},\n\nJust following up on my last email. I understand you\'re busy, so I\'ll keep this brief.\n\nWould you be open to a quick 15-minute call this week?\n\nBest,\n{{senderName}}', days: 0 },
  { type: 'wait', subject: '', body: '', days: 2 },
  { type: 'email', subject: 'One more thought, {{firstName}}', body: 'Hi {{firstName}},\n\nI wanted to share one more thought that might be relevant for {{company}}.\n\nMany companies in your space have seen great results with our approach. Happy to share specifics if you\'re interested.\n\nBest,\n{{senderName}}', days: 0 },
  { type: 'wait', subject: '', body: '', days: 4 },
  { type: 'email', subject: 'Following up - {{firstName}}', body: 'Hi {{firstName}},\n\nI know timing is everything, so I wanted to check in one more time.\n\nIf now isn\'t the right time, I completely understand. Just let me know either way.\n\nBest,\n{{senderName}}', days: 0 },
  { type: 'wait', subject: '', body: '', days: 2 },
  { type: 'email', subject: 'Last note from me, {{firstName}}', body: 'Hi {{firstName}},\n\nThis will be my last follow-up. I don\'t want to be a bother.\n\nIf you\'d ever like to revisit this conversation, feel free to reach out anytime.\n\nWishing you and {{company}} all the best!\n\n{{senderName}}', days: 0 },
];

export const SEQUENCE_TEMPLATES = [
  {
    id: 'outbound-outreach',
    name: 'Outbound Outreach',
    description: 'Target and warm up cold leads to generate new business opportunities.',
    popular: true,
    steps: OUTBOUND_TEMPLATE_STEPS,
  },
];

// ==================== AUTOMATION RULES ====================
export const DEFAULT_RULES = {
  onReplied: { updateStatus: true, moveToList: '', addTags: [] },
  onRepliedNotInterested: { updateStatus: true, moveToList: '', addTags: [] },
  onNoResponse: { updateStatus: true, moveToList: '', addTags: [] },
  onBounced: { updateStatus: true, moveToList: '', addTags: [] },
};

export const TRIGGER_CONFIG = [
  { key: 'onReplied', label: 'On Reply (Interested)', statusLabel: 'Interested', color: 'emerald' },
  { key: 'onRepliedNotInterested', label: 'On Reply (Not Interested)', statusLabel: 'Not Interested', color: 'purple' },
  { key: 'onNoResponse', label: 'On No Response', statusLabel: 'No Response', color: 'orange' },
  { key: 'onBounced', label: 'On Bounce', statusLabel: 'Bounced', color: 'red' },
];

// ==================== ENTERING CRITERIA ====================
export const OUTREACH_STATUS_OPTIONS = [
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'in_sequence', label: 'In Sequence' },
  { value: 'replied', label: 'Interested' },
  { value: 'replied_not_interested', label: 'Not Interested' },
  { value: 'no_response', label: 'No Response' },
  { value: 'bounced', label: 'Bounced' },
];

export const DEFAULT_ENTERING_CRITERIA = {
  profileType: { enabled: false, value: 'any' },
  mustHaveEmail: { enabled: true },
  mustHaveVerifiedEmail: { enabled: false },
  allowedOutreachStatuses: { enabled: false, value: ['not_contacted'] },
  mustHaveCompany: { enabled: false },
  mustHaveTitle: { enabled: false },
  mustBeInList: { enabled: false, value: '' },
  mustHaveTags: { enabled: false, value: [] },
};

// ==================== SCHEDULE ====================
export const DEFAULT_SCHEDULE = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  days: {
    mon: { enabled: true, start: '08:00', end: '18:00' },
    tue: { enabled: true, start: '08:00', end: '18:00' },
    wed: { enabled: true, start: '08:00', end: '18:00' },
    thu: { enabled: true, start: '08:00', end: '18:00' },
    fri: { enabled: true, start: '08:00', end: '18:00' },
    sat: { enabled: false, start: '08:00', end: '18:00' },
    sun: { enabled: false, start: '08:00', end: '18:00' },
  }
};

export const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      opts.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
    }
  }
  return opts;
})();

export function tzLabel(tz) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const parts = fmt.formatToParts(now);
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return `(${offset}) ${tz.replace(/_/g, ' ')}`;
  } catch { return tz; }
}

const BASE_TIMEZONES = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ALL_TIMEZONES = BASE_TIMEZONES.includes(USER_TZ)
  ? BASE_TIMEZONES
  : [USER_TZ, ...BASE_TIMEZONES];

export const TIMEZONE_OPTIONS = ALL_TIMEZONES.map(tz => ({ value: tz, label: tzLabel(tz) }));

export const DAY_LABELS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

// ==================== HELPERS ====================

/** Count how many placeholder tokens appear in a string */
export function countPlaceholders(text) {
  if (!text) return 0;
  const matches = text.match(/\{\{[a-zA-Z]+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

/** Compute cumulative day for an email step given the full steps array and the step's index */
export function computeEmailDay(steps, emailStepIndex) {
  let day = 1;
  for (let i = 0; i < emailStepIndex; i++) {
    if (steps[i].type === 'wait') day += steps[i].days || 0;
  }
  return day;
}

/** Count email steps + total days in a steps array */
export function getTemplateStats(steps) {
  let emails = 0;
  let totalDays = 0;
  for (const step of steps) {
    if (step.type === 'email') emails++;
    if (step.type === 'wait') totalDays += step.days || 0;
  }
  return { emails, totalDays };
}
