/**
 * Timezone-safe date utilities.
 *
 * Date-only fields (DOB, joiningDate, etc.) are stored in MongoDB as
 * midnight-UTC ISO strings ("2026-01-01T00:00:00.000Z"). Using the
 * browser's local timezone to format or extract parts from these can
 * shift the displayed date by ±1 day depending on the user's offset.
 *
 * These helpers always work in UTC so the date shown in the UI matches
 * what the user originally picked.
 */

/**
 * Format a date-only value for display using UTC (e.g. "1 Jan 2026").
 * Returns null for falsy values.
 */
export function formatDateUTC(val, opts = {}) {
  if (!val) return null;
  const { locale = 'en-IN', ...dateOpts } = opts;
  // Build options with defaults, but allow explicit exclusion via undefined/false
  const fmtOpts = { timeZone: 'UTC' };
  fmtOpts.day = 'day' in dateOpts ? dateOpts.day : 'numeric';
  fmtOpts.month = 'month' in dateOpts ? dateOpts.month : 'short';
  // Only include year if not explicitly excluded (pass year: undefined to omit)
  if ('year' in dateOpts) {
    if (dateOpts.year) fmtOpts.year = dateOpts.year;
  } else {
    fmtOpts.year = 'numeric';
  }
  // Pass through any extra options (weekday, hour, minute, etc.)
  const extra = { ...dateOpts };
  delete extra.day; delete extra.month; delete extra.year;
  Object.assign(fmtOpts, extra);
  return new Date(val).toLocaleDateString(locale, fmtOpts);
}

/**
 * Convert a stored date value to YYYY-MM-DD for <input type="date">.
 * Uses UTC components so midnight-UTC dates aren't shifted.
 * Returns '' for falsy values.
 */
export function toDateInputValue(val) {
  if (!val) return '';
  const str = String(val);
  // If already YYYY-MM-DD, return as-is
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Get today's date as YYYY-MM-DD in the user's LOCAL timezone.
 * Use this for default form values ("effective from today").
 */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
