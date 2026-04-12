/**
 * F&F Settlement API utility
 */
import api from './api';

const fnfApi = {
  calculate(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/fnf/calculate/${employeeId}`);
  },
  getSettlement(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/fnf/settlement/${employeeId}`);
  },
  saveSettlement(orgSlug, employeeId, data) {
    return api.request(`/api/org/${orgSlug}/fnf/settlement/${employeeId}`, { method: 'POST', body: JSON.stringify(data) });
  },
  finalize(orgSlug, employeeId, data = {}) {
    return api.request(`/api/org/${orgSlug}/fnf/settlement/${employeeId}/finalize`, { method: 'POST', body: JSON.stringify(data) });
  },
  reopen(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/fnf/settlement/${employeeId}/reopen`, { method: 'POST' });
  },
  listSettlements(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/fnf/settlements${qs ? '?' + qs : ''}`);
  },
  getPending(orgSlug) {
    return api.request(`/api/org/${orgSlug}/fnf/pending`);
  },
  deleteSettlement(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/fnf/settlement/${employeeId}`, { method: 'DELETE' });
  },
  // Alumnus's own finalized F&F receipt (read-only)
  getMySettlement(orgSlug) {
    return api.request(`/api/org/${orgSlug}/fnf/my-settlement`);
  },
};

export default fnfApi;
