// ============================================================================
// incentiveApi.js — Incentive app API client
// ============================================================================

import api from './api';

const qs = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
};

const base = (slug) => `/api/org/${slug}/incentive`;

const incentiveApi = {
  // ---------- SETTINGS ----------
  getSettings(slug) {
    return api.request(`${base(slug)}/settings`);
  },
  updateSettings(slug, data) {
    return api.request(`${base(slug)}/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ---------- RATES ----------
  listRates(slug, params = {}) {
    return api.request(`${base(slug)}/rates${qs(params)}`);
  },
  createRate(slug, data) {
    return api.request(`${base(slug)}/rates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateRate(slug, id, data) {
    return api.request(`${base(slug)}/rates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteRate(slug, id) {
    return api.request(`${base(slug)}/rates/${id}`, { method: 'DELETE' });
  },
  resolveRate(slug, params = {}) {
    return api.request(`${base(slug)}/rates/resolve${qs(params)}`);
  },

  // ---------- LOOKUPS ----------
  lookupEmployees(slug, params = {}) {
    return api.request(`${base(slug)}/lookup/employees${qs(params)}`);
  },
  lookupClients(slug, params = {}) {
    return api.request(`${base(slug)}/lookup/clients${qs(params)}`);
  },

  // ---------- RECORDS ----------
  listRecords(slug, params = {}) {
    return api.request(`${base(slug)}/records${qs(params)}`);
  },
  getRecord(slug, id) {
    return api.request(`${base(slug)}/records/${id}`);
  },
  createRecord(slug, data) {
    return api.request(`${base(slug)}/records`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateRecord(slug, id, data) {
    return api.request(`${base(slug)}/records/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteRecord(slug, id) {
    return api.request(`${base(slug)}/records/${id}`, { method: 'DELETE' });
  },

  // ---------- LIFECYCLE ----------
  approve(slug, id) {
    return api.request(`${base(slug)}/records/${id}/approve`, { method: 'POST' });
  },
  unapprove(slug, id) {
    return api.request(`${base(slug)}/records/${id}/unapprove`, { method: 'POST' });
  },
  cancel(slug, id, data = {}) {
    return api.request(`${base(slug)}/records/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  refreshRate(slug, id) {
    return api.request(`${base(slug)}/records/${id}/refresh-rate`, { method: 'POST' });
  },
  reverse(slug, id, data = {}) {
    return api.request(`${base(slug)}/records/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ---------- SUMMARY ----------
  getSummary(slug, params = {}) {
    return api.request(`${base(slug)}/summary${qs(params)}`);
  },

  // ---------- EXPORT ----------
  async exportRecordsCsv(slug, params = {}) {
    const token = localStorage.getItem('rivvra_token');
    const baseUrl = api.baseUrl || '';
    const res = await fetch(
      `${baseUrl}${base(slug)}/records/export.csv${qs(params)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('Failed to export CSV');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `incentive_records_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ---------- NOTIFICATIONS ----------
  listNotifications(slug, params = {}) {
    return api.request(`${base(slug)}/notifications${qs(params)}`);
  },
  markNotificationsRead(slug, data = {}) {
    return api.request(`${base(slug)}/notifications/mark-read`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export default incentiveApi;
