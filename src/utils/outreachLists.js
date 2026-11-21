// Lists filled automatically from a contact's outreach status (2026-11-17).
// A contact leaves one of these only by a status change — never "Remove" —
// so a "Replied" contact can't vanish from every list while reports still
// count it as hot. Must match DEFAULT_LISTS in the API's src/lists.js.
// 'Do Not Work With' (2026-11-20) is filled by the company block.
// 'Do Not Contact' (2026-11-21) is filled by the Do Not Contact status.
export const AUTOMATIC_LISTS = ['Hot Leads', 'Not Interested', 'No Response', 'Converted', 'Follow Up Later', 'Do Not Work With', 'Do Not Contact'];
export const isAutomaticList = (name) =>
  AUTOMATIC_LISTS.some((l) => l.toLowerCase() === String(name || '').toLowerCase());
// Lists that mirror a status: filled only by that status, never ticked by
// hand. 'Follow Up Later' has no status of its own, so it can be added by hand.
export const isStatusOnlyList = (name) =>
  isAutomaticList(name) && String(name || '').toLowerCase() !== 'follow up later';
