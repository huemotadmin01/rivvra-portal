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

/* ────────────────────────────────────────────────────────────────────────
 * Datetime formatting (viewer-timezone aware)
 *
 * Use formatDateTime for instants — anything with hour/minute precision
 * (Sign sentAt/signedAt, invoice issuedAt, payroll cutoff, activity logs).
 * Storage is UTC; display follows the viewer's tz so a Toronto recruiter
 * sees Toronto time even when viewing an Indian record.
 *
 * Resolution order: explicit opts.timeZone → user.timezone → company.timezone
 * → browser. Pass showZone:true on legal/audit stamps so the abbreviation
 * (IST, EST, PST) is rendered alongside the time.
 * ──────────────────────────────────────────────────────────────────────── */

function resolveTimeZone({ user, company, timeZone } = {}) {
  if (timeZone) return timeZone;
  if (user?.timezone) return user.timezone;
  if (company?.timezone) return company.timezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Manual overrides for zones where Intl returns a GMT-offset instead of the
// short letter abbreviation users expect. Values are either a static string
// (zones with no DST) or a function (date) => string for DST-aware zones.
//
// Why these are needed: Chrome's ICU drops the letter form when the
// abbreviation is ambiguous across regions — IST means Indian / Irish
// Summer / Israel Standard, BST means British Summer / Bangladesh Standard
// — and falls back to a GMT offset. For business display the letter form
// is what users recognise.
function isBritishSummerTime(d) {
  // The London zone's offset is +60 minutes during BST, 0 during GMT. Ask
  // Intl directly instead of duplicating the BST start/end ruleset.
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      timeZoneName: 'longOffset',
    }).formatToParts(d);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    return offsetPart?.value === 'GMT+01:00';
  } catch {
    return false;
  }
}

const ZONE_ABBR_OVERRIDES = {
  'Asia/Kolkata':   'IST',
  'Asia/Calcutta':  'IST',  // legacy alias still emitted by some browsers
  'Asia/Colombo':   'IST',  // Sri Lanka shares the same standard
  'Europe/London':  (d) => (isBritishSummerTime(d) ? 'BST' : 'GMT'),
};

/**
 * Get the short zone abbreviation (IST, EST, PST, …) for a given tz at a
 * given instant. Daylight-savings aware via the date param. Falls back to
 * whatever Intl produces (often a GMT offset) when no override applies.
 */
export function getZoneAbbr(date, tz) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const override = ZONE_ABBR_OVERRIDES[tz];
  if (override) return typeof override === 'function' ? override(d) : override;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(d);
    const part = parts.find((p) => p.type === 'timeZoneName');
    return part?.value || '';
  } catch {
    return '';
  }
}

/**
 * Format a UTC instant for display in the viewer's timezone.
 *
 * @param {Date|string|number} val - UTC instant
 * @param {object} opts
 * @param {{timezone?: string}} [opts.user]      - Current user
 * @param {{timezone?: string}} [opts.company]   - Optional company fallback
 * @param {string}  [opts.timeZone]              - Explicit tz override (IANA)
 * @param {boolean} [opts.showZone=false]        - Append zone abbr (legal stamps)
 * @param {boolean} [opts.dateOnly=false]        - Render date without time
 * @param {string}  [opts.locale='en-IN']
 * @returns {string|null}
 */
export function formatDateTime(val, opts = {}) {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;

  const { user, company, showZone = false, dateOnly = false, locale = 'en-IN' } = opts;
  const tz = resolveTimeZone(opts);

  const fmtOpts = {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  if (!dateOnly) {
    fmtOpts.hour = '2-digit';
    fmtOpts.minute = '2-digit';
    fmtOpts.hour12 = true;
  }

  let out = new Intl.DateTimeFormat(locale, fmtOpts).format(d);
  if (showZone && !dateOnly) {
    const abbr = getZoneAbbr(d, tz);
    if (abbr) out = `${out} ${abbr}`;
  }
  return out;
}
