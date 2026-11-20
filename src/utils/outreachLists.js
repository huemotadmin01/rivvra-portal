// Lists filled automatically from a contact's outreach status (2026-11-17).
// A contact leaves one of these only by a status change — never "Remove" —
// so a "Replied" contact can't vanish from every list while reports still
// count it as hot. Must match DEFAULT_LISTS in the API's src/lists.js.
// 'Do Not Work With' (2026-11-20) is filled by the company block.
export const AUTOMATIC_LISTS = ['Hot Leads', 'Not Interested', 'No Response', 'Converted', 'Follow Up Later', 'Do Not Work With'];
export const isAutomaticList = (name) =>
  AUTOMATIC_LISTS.some((l) => l.toLowerCase() === String(name || '').toLowerCase());
