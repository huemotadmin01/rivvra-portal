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
  // ---------- OVERVIEW (list + dashboard in one round-trip) ----------
  // Returns { expenses, summary, scope } — preferred over calling list() + getDashboard() separately.
  getOverview(orgSlug, params = {}) {
    return api.request(`/api/org/${orgSlug}/expenses/overview${qs(params)}`, {
      _requestKey: `expenses-overview-${orgSlug}`,
    });
  },

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
  withdraw(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/withdraw`, { method: 'POST' });
  },
  resubmit(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/resubmit`, { method: 'POST' });
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

  // ---------- APPROVER PREVIEW ----------
  previewApprover(orgSlug) {
    return api.request(`/api/org/${orgSlug}/expenses/preview-approver`);
  },

  // ---------- CATEGORIES (read-only proxy) ----------
  listCategories(orgSlug) {
    return api.request(`/api/org/${orgSlug}/expenses/categories`);
  },

  // ---------- RECEIPTS (per-line, decoupled by receiptId) ----------
  uploadReceipt(orgSlug, id, file) {
    const fd = new FormData();
    fd.append('file', file);
    return api.uploadFile(`/api/org/${orgSlug}/expenses/${id}/receipts`, fd);
  },
  receiptUrl(orgSlug, id, receiptId) {
    return `${api.baseUrl}/api/org/${orgSlug}/expenses/${id}/receipts/${receiptId}`;
  },
  removeReceipt(orgSlug, id, receiptId) {
    return api.request(`/api/org/${orgSlug}/expenses/${id}/receipts/${receiptId}`, {
      method: 'DELETE',
    });
  },
};

export default expensesApi;
