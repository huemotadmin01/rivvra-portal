// Outreach send-limit bounds — keep in sync with the API validators in
// src/teams.js (PUT /api/teams/member/:userId/rate-limits) and
// src/engage.js (PUT /api/engage/settings).
export const MIN_SEND_LIMIT = 1;
export const MAX_DAILY_SEND_LIMIT = 400;
export const MAX_HOURLY_SEND_LIMIT = 50;

// Called on blur / before save — NOT on every keystroke. Clamping while the
// user is still typing eats digits ("400" becomes 4 → 40 → clamped), which is
// why these fields used to be impossible to raise past the old ceiling.
export function clampSendLimit(value, max) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return MIN_SEND_LIMIT;
  return Math.min(max, Math.max(MIN_SEND_LIMIT, n));
}

// onChange handler value: keep whatever the user typed (including '') so
// intermediate states survive. Rejects non-numeric input.
export function parseSendLimitInput(raw) {
  if (raw === '') return '';
  const n = parseInt(raw, 10);
  return isNaN(n) ? '' : n;
}
