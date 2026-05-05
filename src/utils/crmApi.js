// ============================================================================
// crmApi.js — CRM API client
// ============================================================================

import api from './api';

const crmApi = {
  // ---------- STAGES ----------
  listStages(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/stages`);
  },
  createStage(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/crm/stages`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateStage(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/crm/stages/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteStage(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/stages/${id}`, { method: 'DELETE' });
  },
  reorderStages(orgSlug, order) {
    return api.request(`/api/org/${orgSlug}/crm/stages/reorder`, { method: 'PUT', body: JSON.stringify({ order }) });
  },
  resetStagesToDefaults(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/stages/reset-defaults`, { method: 'POST' });
  },

  // ---------- OPPORTUNITIES ----------
  listOpportunities(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/crm/opportunities${qs ? '?' + qs : ''}`);
  },
  getOpportunity(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}`);
  },
  getKanban(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/crm/opportunities/kanban${qs ? '?' + qs : ''}`);
  },
  createOpportunity(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities`, { method: 'POST', body: JSON.stringify(data) });
  },
  convertLead(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/crm/convert-lead`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateOpportunity(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  moveStage(orgSlug, id, stageId) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stageId }) });
  },
  markWon(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}/won`, { method: 'PATCH' });
  },
  markLost(orgSlug, id, lostReasonId) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}/lost`, { method: 'PATCH', body: JSON.stringify({ lostReasonId }) });
  },
  restore(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}/restore`, { method: 'PATCH' });
  },
  convertToJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}/convert-to-job`, { method: 'PATCH' });
  },
  detachJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}/detach-job`, { method: 'PATCH' });
  },
  deleteOpportunity(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/opportunities/${id}`, { method: 'DELETE' });
  },

  // ACTIVITIES — use activityApi.js (unified across employee / crm /
  // ats / invoice). Legacy crmApi.{list,create,update,markActivityDone,
  // delete}Activity removed 2026-05-02; the corresponding /crm/activities
  // backend endpoints are gone. ActivityPanel was already wired through
  // activityApi.js via the unified /api/org/:slug/activities surface.

  // ---------- TAGS ----------
  listTags(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/tags`);
  },
  createTag(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/crm/tags`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateTag(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/crm/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteTag(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/tags/${id}`, { method: 'DELETE' });
  },

  // ---------- LOST REASONS ----------
  listLostReasons(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/lost-reasons`);
  },
  createLostReason(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/crm/lost-reasons`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateLostReason(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/crm/lost-reasons/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteLostReason(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/crm/lost-reasons/${id}`, { method: 'DELETE' });
  },

  // ---------- SALESPERSONS ----------
  listSalespersons(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/salespersons`);
  },

  // ---------- DASHBOARD ----------
  getDashboard(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/dashboard`);
  },

  // ---------- CONFIG ----------
  getSettings(orgSlug) {
    return api.request(`/api/org/${orgSlug}/crm/config/settings`);
  },
  updateSettings(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/crm/config/settings`, { method: 'PUT', body: JSON.stringify(data) });
  },
};

export default crmApi;
