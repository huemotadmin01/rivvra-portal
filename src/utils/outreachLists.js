// Lists filled automatically from a contact's outreach status (2026-11-17).
// A contact leaves one of these only by a status change — never "Remove" —
// so a "Replied" contact can't vanish from every list while reports still
// count it as hot. Must match DEFAULT_LISTS in the API's src/lists.js.
export const AUTOMATIC_LISTS = ['Hot Leads', 'Not Interested', 'No Response', 'Converted', 'Follow Up Later'];
export const isAutomaticList = (name) =>
  AUTOMATIC_LISTS.some((l) => l.toLowerCase() === String(name || '').toLowerCase());
