// Small formatters for sign-in / onboarding activity (2026-11-18).
// Times are shown in IST, the way HR reads them.

const IST = 'Asia/Kolkata';

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' });
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", else a date. */
export function timeAgo(d, now = Date.now()) {
  if (!d) return null;
  const ms = now - new Date(d).getTime();
  if (ms < 0) return fmtDate(d);
  const min = Math.floor(ms / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return fmtDate(d);
}

export function daysSince(d, now = Date.now()) {
  if (!d) return null;
  return Math.floor((now - new Date(d).getTime()) / 86400000);
}

export const LOGIN_METHOD_LABELS = {
  password: 'Password',
  google: 'Google',
  otp: 'One-time code',
  signup: 'Sign-up',
  invite_accepted: 'Accepted invite',
  password_reset: 'Password reset',
  password_set: 'Set password',
  login_as: 'Login As (admin)',
};

export const LOGIN_FAILURE_LABELS = {
  wrong_password: 'Wrong password',
  wrong_code: 'Wrong or expired code',
  account_disabled: 'Account deactivated',
  method_not_allowed: 'Sign-in method not allowed',
  not_allowed: 'Not allowed',
  failed: 'Failed',
};

export const ONBOARDING_STAGES = {
  not_invited: { label: 'Not invited', tone: 'neutral' },
  invited: { label: 'Invited, not logged in', tone: 'warn' },
  not_requested: { label: 'Has login, form not requested', tone: 'neutral' },
  form_pending: { label: 'Form pending', tone: 'warn' },
  completed: { label: 'Completed', tone: 'brand' },
};
