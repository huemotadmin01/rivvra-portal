/**
 * fetchAllPages — pull EVERY row of a paginated list, for exports.
 *
 * 2026-09-21: both invoicing CSV exports asked the list route for
 * `limit: 5000` in one shot. The server caps a page at 200, so an export of
 * 864 invoices silently produced a 200-row file — and the toast reported
 * "Exported 200 rows" as a success. Nothing on screen said three quarters of
 * the book was missing.
 *
 * Pages at the server's own size until it has `total` rows. Bounded, and it
 * reports truncation rather than hiding it if the bound is ever hit.
 *
 * @param {(params:object)=>Promise<object>} fetchPage  e.g. p => api.listInvoices(slug, p)
 * @param {object} params        filters/sort — page + limit are set here
 * @param {(res:object)=>Array} pickRows  pulls the row array out of a response
 * @returns {Promise<{rows:Array,total:number,truncated:boolean}>}
 */
const PAGE_SIZE = 200;   // the server's per-page ceiling
const MAX_PAGES = 250;   // 50,000 rows — a guard, not an expectation

export async function fetchAllPages(fetchPage, params, pickRows) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchPage({ ...params, page, limit: PAGE_SIZE });
    const batch = pickRows(res) || [];
    rows.push(...batch);
    if (typeof res?.total === 'number') total = res.total;
    const done = batch.length < PAGE_SIZE || (total !== null && rows.length >= total);
    if (done) return { rows, total: total ?? rows.length, truncated: false };
  }
  return { rows, total: total ?? rows.length, truncated: true };
}

export default fetchAllPages;
