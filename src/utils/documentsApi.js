/**
 * Documents app API client.
 * All endpoints are org-scoped and company-filtered server-side via the
 * X-Company-Id header that api.js attaches automatically.
 */
import api from './api';

const base = (slug) => `/api/org/${slug}/documents`;

function qs(params = {}) {
  const cleaned = Object.entries(params).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0));
  if (!cleaned.length) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of cleaned) sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  return `?${sp.toString()}`;
}

const documentsApi = {
  // ── Folders ───────────────────────────────────────────────────────
  listFolders(slug, { includeArchived = false } = {}) {
    return api.request(`${base(slug)}/folders${qs({ includeArchived: includeArchived || undefined })}`);
  },
  createFolder(slug, data) {
    return api.request(`${base(slug)}/folders`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateFolder(slug, id, data) {
    return api.request(`${base(slug)}/folders/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  archiveFolder(slug, id) {
    return api.request(`${base(slug)}/folders/${id}/archive`, { method: 'POST' });
  },
  unarchiveFolder(slug, id) {
    return api.request(`${base(slug)}/folders/${id}/unarchive`, { method: 'POST' });
  },

  // ── Tags ──────────────────────────────────────────────────────────
  listTags(slug, { includeArchived = false } = {}) {
    return api.request(`${base(slug)}/tags${qs({ includeArchived: includeArchived || undefined })}`);
  },
  createTag(slug, data) {
    return api.request(`${base(slug)}/tags`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateTag(slug, id, data) {
    return api.request(`${base(slug)}/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  archiveTag(slug, id) {
    return api.request(`${base(slug)}/tags/${id}/archive`, { method: 'POST' });
  },
  unarchiveTag(slug, id) {
    return api.request(`${base(slug)}/tags/${id}/unarchive`, { method: 'POST' });
  },

  // ── Documents ─────────────────────────────────────────────────────
  list(slug, params = {}) {
    return api.request(`${base(slug)}${qs(params)}`);
  },
  get(slug, id) {
    return api.request(`${base(slug)}/${id}`);
  },
  upload(slug, formData) {
    return api.uploadFile(`${base(slug)}`, formData);
  },
  uploadVersion(slug, id, formData) {
    return api.uploadFile(`${base(slug)}/${id}/versions`, formData);
  },
  restoreVersion(slug, id, versionIndex) {
    return api.request(`${base(slug)}/${id}/versions/${versionIndex}/restore`, { method: 'POST' });
  },
  updateMetadata(slug, id, data) {
    return api.request(`${base(slug)}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  archive(slug, id) {
    return api.request(`${base(slug)}/${id}/archive`, { method: 'POST' });
  },
  unarchive(slug, id) {
    return api.request(`${base(slug)}/${id}/unarchive`, { method: 'POST' });
  },
  destroy(slug, id) {
    return api.request(`${base(slug)}/${id}`, { method: 'DELETE' });
  },
  downloadUrl(slug, id, versionIndex) {
    return api.request(`${base(slug)}/${id}/download${qs({ versionIndex })}`);
  },
  previewUrl(slug, id, versionIndex) {
    return api.request(`${base(slug)}/${id}/preview${qs({ versionIndex })}`);
  },
};

export default documentsApi;
