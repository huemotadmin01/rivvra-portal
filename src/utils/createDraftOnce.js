// ============================================================================
// createDraftOnce — de-duplicate "New → create a blank draft" requests
// (2026-10-20). The invoice and vendor-bill "new" pages create a draft on open
// (Odoo-style). Their guard lived in component state, so a REMOUNT — the route
// mounting twice while the workspace context settles — started with a fresh
// flag and created a second blank draft (two drafts in the same second, seen
// 20 Oct). This guard is module-level: any mount for the same key within the
// window gets the SAME in-flight promise instead of issuing another create.
// ============================================================================
const inflight = new Map(); // key -> { at, promise }
const WINDOW_MS = 15000;

export function createDraftOnce(key, create) {
  const now = Date.now();
  const hit = inflight.get(key);
  if (hit && now - hit.at < WINDOW_MS) return hit.promise;
  const promise = Promise.resolve().then(create);
  inflight.set(key, { at: now, promise });
  // A failed create may be retried right away by a fresh visit.
  promise.catch(() => { if (inflight.get(key)?.promise === promise) inflight.delete(key); });
  return promise;
}
