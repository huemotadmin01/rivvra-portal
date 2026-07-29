/**
 * Shared leave-type presentation constants.
 *
 * LeaveApply and LeaveMyRequests each carried their own hand-rolled label/colour
 * map and the two disagreed with each other AND with the backend. LeaveApply
 * knew `compensatory_off` / `earned_leave`; LeaveMyRequests knew `comp_off` /
 * `lop`. The backend's seeded policy (leave.js ~240-270) uses `sick_leave`,
 * `casual_leave` and `lop`, and org policies commonly add `comp_off`. Nothing
 * was outright broken because both fell back to auto-title-casing, but colours
 * silently never applied to `comp_off` on the Apply page.
 *
 * Leave types are org-configurable, so the server-supplied `name` on the policy
 * always wins — this map is only the fallback plus the colour assignment.
 *
 * Tailwind scans for complete class strings, so every variant is written out in
 * full rather than composed at runtime.
 */

export const LEAVE_TYPE_LABELS = {
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  earned_leave: 'Earned Leave',
  privilege_leave: 'Privilege Leave',
  comp_off: 'Comp Off',
  maternity_leave: 'Maternity Leave',
  paternity_leave: 'Paternity Leave',
  bereavement_leave: 'Bereavement Leave',
  unpaid_leave: 'Unpaid Leave',
  lop: 'Loss of Pay',
};

/** code → colour tone. Unknown codes fall through to a neutral tone. */
const LEAVE_TYPE_TONES = {
  sick_leave: 'red',
  casual_leave: 'blue',
  earned_leave: 'emerald',
  privilege_leave: 'emerald',
  comp_off: 'purple',
  maternity_leave: 'pink',
  paternity_leave: 'cyan',
  bereavement_leave: 'slate',
  unpaid_leave: 'orange',
  lop: 'orange',
};

/** Outlined card style (Apply Leave balance cards). */
const TEXT_CLASSES = {
  red: 'text-red-400 border-red-500/30',
  blue: 'text-blue-400 border-blue-500/30',
  emerald: 'text-emerald-400 border-emerald-500/30',
  purple: 'text-purple-400 border-purple-500/30',
  pink: 'text-pink-400 border-pink-500/30',
  cyan: 'text-cyan-400 border-cyan-500/30',
  slate: 'text-slate-400 border-slate-500/30',
  orange: 'text-orange-400 border-orange-500/30',
  neutral: 'text-dark-400 border-dark-600/30',
};

/** Filled pill style (My Requests badges). */
const BADGE_CLASSES = {
  red: 'bg-red-500/20 text-red-400',
  blue: 'bg-blue-500/20 text-blue-400',
  emerald: 'bg-emerald-500/20 text-emerald-400',
  purple: 'bg-purple-500/20 text-purple-400',
  pink: 'bg-pink-500/20 text-pink-400',
  cyan: 'bg-cyan-500/20 text-cyan-400',
  slate: 'bg-slate-500/20 text-slate-400',
  orange: 'bg-orange-500/20 text-orange-400',
  neutral: 'bg-dark-600 text-dark-400',
};

const toneOf = (code) => LEAVE_TYPE_TONES[code] || 'neutral';

/**
 * Human label for a leave-type code.
 * @param {string} code   backend leave-type code
 * @param {string} [name] server-supplied policy name, which always wins
 */
export function formatLeaveType(code, name) {
  if (name) return name;
  return (
    LEAVE_TYPE_LABELS[code] ||
    code?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
    code ||
    '—'
  );
}

export function leaveTypeTextClasses(code) {
  return TEXT_CLASSES[toneOf(code)];
}

export function leaveTypeBadgeClasses(code) {
  return BADGE_CLASSES[toneOf(code)];
}
