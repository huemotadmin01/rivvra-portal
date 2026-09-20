/**
 * picklistOptions.js — turn a configurable picklist into <select> options
 * WITHOUT losing what a record already holds.
 *
 * Added 2026-09-20 during the ATS field audit.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Source, Degree and Experience were free-text boxes while the list filters
 * beside them were built from a picklist (or, for Experience, from a second
 * hardcoded list that shared no value with the first). Anything typed that was
 * not a picklist name became unfindable.
 *
 * Moving those fields onto the picklist fixes new records — but the old values
 * are still there, and in bulk: Huemot's applications hold `legacy` (2,762),
 * `manual` (1,435) and `careers_site` (1,358), none of which is a picklist
 * name, and its jobs hold `5+` (420) and `7-8` (237), neither of which is in
 * the seeded experience list.
 *
 * A plain <select> cannot show a value that is not one of its options. It
 * renders blank, and the next save writes that blank over real data. So the
 * record's own value is always included, marked, and sorted first.
 */

/**
 * @param {Array<string|{value:string,label:string}>} options  picklist values
 * @param {string|null|undefined} current                      the record's value
 * @returns {Array<{value:string,label:string}>}
 */
export function withCurrentValue(options, current) {
  const normalised = (options || [])
    .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
    .filter((o) => o && o.value);
  const cur = String(current == null ? '' : current).trim();
  if (!cur || normalised.some((o) => o.value === cur)) return normalised;
  return [{ value: cur, label: `${cur} — not in the configured list` }, ...normalised];
}

export default withCurrentValue;
