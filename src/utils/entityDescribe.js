import api from './api';

/**
 * Resolves a (type, id) pair into { label, listLabel, listPath, path }
 * via the org-scoped /entity-describe endpoint. Used by the breadcrumb
 * trail system so a context-aware crumb can be rendered when one
 * detail page is reached via a cross-entity link on another detail
 * page (e.g. Application → Candidate, Job → Application).
 *
 * Supported types: ats_application, ats_candidate, ats_job, employee,
 * crm_contact. See ats.js → /entity-describe for the source of truth.
 */
export function describeEntity(orgSlug, type, id) {
  const qs = new URLSearchParams({ type, id }).toString();
  return api.request(`/api/org/${orgSlug}/entity-describe?${qs}`);
}

/**
 * Append ?from=<type>:<id> to a path so the destination page can
 * render the cross-entity breadcrumb trail. No-op when type or id
 * is missing — callers can pass undefined safely.
 */
export function withFromContext(path, type, id) {
  if (!path || !type || !id) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}from=${encodeURIComponent(type)}:${encodeURIComponent(id)}`;
}

/**
 * Parse a `?from=<type>:<id>` query value into { type, id } or null.
 */
export function parseFromContext(rawFrom) {
  if (!rawFrom || typeof rawFrom !== 'string') return null;
  const idx = rawFrom.indexOf(':');
  if (idx <= 0) return null;
  const type = rawFrom.slice(0, idx);
  const id = rawFrom.slice(idx + 1);
  if (!type || !id) return null;
  return { type, id };
}
