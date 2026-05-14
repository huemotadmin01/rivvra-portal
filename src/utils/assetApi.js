/**
 * Asset Tracker API utility
 * Uses the main ApiClient for org-scoped asset endpoints.
 */
import api from './api';

const assetApi = {
  // ── Asset Types ──────────────────────────────────────────────────────
  listTypes(orgSlug) {
    return api.request(`/api/org/${orgSlug}/assets/types`);
  },
  createType(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/assets/types`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateType(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/assets/types/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteType(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/assets/types/${id}`, { method: 'DELETE' });
  },

  // ── Assets ───────────────────────────────────────────────────────────
  list(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/assets${qs ? '?' + qs : ''}`);
  },
  get(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/assets/${id}`);
  },
  create(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/assets`, { method: 'POST', body: JSON.stringify(data) });
  },
  update(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  remove(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/assets/${id}`, { method: 'DELETE' });
  },
  stats(orgSlug) {
    return api.request(`/api/org/${orgSlug}/assets/stats`);
  },

  // ── Assignment ───────────────────────────────────────────────────────
  assign(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/assets/${id}/assign`, { method: 'POST', body: JSON.stringify(data) });
  },
  returnAsset(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/assets/${id}/return`, { method: 'POST', body: JSON.stringify(data) });
  },
  markLost(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/assets/${id}/mark-lost`, { method: 'POST', body: JSON.stringify(data) });
  },
  makeAvailable(orgSlug, id, data = {}) {
    return api.request(`/api/org/${orgSlug}/assets/${id}/make-available`, { method: 'POST', body: JSON.stringify(data) });
  },
  bulkAssign(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/assets/bulk-assign`, { method: 'POST', body: JSON.stringify(data) });
  },

  // ── My Assets (Employee) ────────────────────────────────────────────
  myAssets(orgSlug) {
    return api.request(`/api/org/${orgSlug}/assets/my-assets`);
  },

  // ── Clearance ────────────────────────────────────────────────────────
  getClearance(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/assets/clearance/${employeeId}`);
  },
  generateClearance(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/assets/clearance/${employeeId}/generate`, { method: 'POST' });
  },
  updateClearance(orgSlug, employeeId, data) {
    return api.request(`/api/org/${orgSlug}/assets/clearance/${employeeId}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  listClearances(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/assets/clearances${qs ? '?' + qs : ''}`);
  },
};

export default assetApi;
