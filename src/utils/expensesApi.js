// ============================================================================
// expensesApi.js — Expense Management API client
// ============================================================================

import api from './api';

function qs(params = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null),
  );
  const s = new URLSearchParams(cleaned).toString();
  return s ? `?${s}` : '';
}

const expensesApi = {
  // ---------- DASHBOARD ----------
  getDashboard(orgSlug, params = {}) {
    return api.request(`/api/org/${orgSlug}/expenses/dashboard${qs(params)}`);
  },

  // ---------- LIST / CRUD ----------
  list(orgSlug, params = {}) {
    return api.request(`/api/org/${orgSlug}/expenses${qs(params)}`);
  },
  get(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}`);
  },
  create(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/expenses`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  update(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  remove(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}`, { method: 'DELETE' });
  },

  // ---------- LIFECYCLE ----------
  submit(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/submit`, { method: 'POST' });
  },
  approve(orgSlug, id, note = '') {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },
  reject(orgSlug, id, note) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },
  comment(orgSlug, id, note) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  // ---------- CATEGORIES (read-only proxy) ----------
  listCategories(orgSlug) {
    return api.request(`/api/org/${orgSlug}/expenses/categories`);
  },

  // ---------- SETTINGS ----------
  getSettings(orgSlug) {
    return api.request(`/api/org/${orgSlug}/expenses/settings`);
  },
  updateSettings(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/expenses/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  listApprovers(orgSlug) {
    return api.request(`/api/org/${orgSlug}/expenses/approvers`);
  },

  // ---------- RECEIPT ----------
  uploadReceipt(orgSlug, id, file) {
    const fd = new FormData();
    fd.append('file', file);
    return api.uploadFile(`/api/org/${orgSlug}/expenses/${id}/receipt`, fd);
  },
  receiptUrl(orgSlug, id) {
    return `${api.baseUrl}/api/org/${orgSlug}/expenses/${id}/receipt`;
  },
  removeReceipt(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/receipt`, { method: 'DELETE' });
  },
};

export default expensesApi;
