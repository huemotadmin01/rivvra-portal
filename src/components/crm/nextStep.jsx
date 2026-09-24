// Next step on an opportunity — the rep's due commitment (2026-09-25).
//
// Shared by the opportunities list (read-only chip) and the opportunity
// detail page (panel), so a deal reads the same in both places.
//
// Due dates are stored day-granularity at UTC midnight (a date input sends
// YYYY-MM-DD). So compare the stored date's UTC calendar day against the
// viewer's LOCAL calendar day — mixing the two is what made "due today" read
// as tomorrow for IST users on the server side.

import { AlertTriangle, CalendarClock, CircleDashed, CalendarCheck } from 'lucide-react';

export function dueState(dueAt) {
  if (!dueAt) return 'none';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return 'none';
  const due = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}

export function daysFromToday(dueAt) {
  const d = new Date(dueAt);
  const due = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((due - today) / 86400000);
}

const STATES = {
  overdue:  { Icon: AlertTriangle,  fg: 'var(--danger)',    bg: 'var(--danger-soft)' },
  today:    { Icon: CalendarClock,  fg: 'var(--warn-ink)',  bg: 'var(--warn-soft)' },
  upcoming: { Icon: CalendarCheck,  fg: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  none:     { Icon: CircleDashed,   fg: 'var(--fg-4)',      bg: 'transparent' },
};

export function dueLabel(dueAt) {
  const state = dueState(dueAt);
  if (state === 'none') return 'No date';
  const n = daysFromToday(dueAt);
  if (state === 'today') return 'Due today';
  if (state === 'overdue') return n === -1 ? 'Overdue 1 day' : `Overdue ${Math.abs(n)} days`;
  if (n === 1) return 'Due tomorrow';
  if (n <= 14) return `Due in ${n} days`;
  return `Due ${new Date(dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** Small due badge. `text` puts the step itself next to it (list cell). */
export function NextStepChip({ opp, showText = false }) {
  const state = dueState(opp?.nextStepDueAt);
  const s = STATES[state];
  const { Icon } = s;
  if (!opp?.nextStep && state === 'none') {
    return <span style={{ color: 'var(--fg-4)', font: '450 12px/1.4 var(--font)' }}>—</span>;
  }
  return (
    <span
      title={opp.nextStep ? `${opp.nextStep} · ${dueLabel(opp.nextStepDueAt)}` : dueLabel(opp.nextStepDueAt)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        padding: '2px 7px', borderRadius: 6, font: '500 11px/1.2 var(--font)',
        color: s.fg, background: s.bg, whiteSpace: 'nowrap',
      }}>
        <Icon size={11} strokeWidth={2.25} />
        {dueLabel(opp.nextStepDueAt)}
      </span>
      {showText && opp.nextStep && (
        <span style={{
          font: '450 12px/1.4 var(--font)', color: 'var(--fg-3)', minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {opp.nextStep}
        </span>
      )}
    </span>
  );
}

export const NEXT_STEP_FILTER_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'none', label: 'No next step set' },
];

// Suggestions offered when setting a step — typing is what stops people
// filling a field, and these are the moves that actually happen on a
// staffing deal.
export const NEXT_STEP_SUGGESTIONS = [
  'Call to qualify the requirement',
  'Send company profile / capability deck',
  'Follow up on no reply',
  'Schedule intro meeting',
  'Send rate card / commercials',
  'Chase signed rate confirmation',
  'Collect job description',
];
