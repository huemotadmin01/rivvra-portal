// Module-level stale-while-revalidate cache shared between ExpenseList
// (which fills it) and ExpenseDetail (which invalidates it after mutations
// so navigating back to the list shows fresh data instead of the stale row).
//
// Key shape: `${orgSlug}:${scope}:${statusTab}:${search}`. After any write
// in ExpenseDetail, every key for the current org is dropped — scope/status
// filters can all be affected by a status transition.

const _cache = new Map();
const CACHE_TTL_MS = 90_000;

export function cacheGet(key) {
  return _cache.get(key);
}

export function cacheSet(key, value) {
  _cache.set(key, { ...value, ts: Date.now() });
}

export function cacheTTL() {
  return CACHE_TTL_MS;
}

// Drop all entries belonging to a specific org. Called after any mutation
// in ExpenseDetail so the next visit to the list refetches fresh rows.
export function invalidateExpensesList(orgSlug) {
  if (!orgSlug) {
    _cache.clear();
    return;
  }
  const prefix = `${orgSlug}:`;
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}
