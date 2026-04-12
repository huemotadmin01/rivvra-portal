// ============================================================================
// activityApi.js — Unified Activities API client
// ============================================================================

import api from './api';

const activityApi = {
  /**
   * List activities for a specific entity
   */
  list(orgSlug, entityType, entityId) {
    const qs = new URLSearchParams({ entityType, entityId }).toString();
    return api.request(`/api/org/${orgSlug}/activities?${qs}`);
  },

  /**
   * Get my activities across all entities (upcoming / pending)
   */
  my(orgSlug, params = {}) {
    const qs = new URLSearchParams();
    if (params.isDone !== undefined) qs.set('isDone', params.isDone);
    if (params.limit) qs.set('limit', params.limit);
    const q = qs.toString();
    return api.request(`/api/org/${orgSlug}/activities/my${q ? '?' + q : ''}`);
  },

  /**
   * Create a new activity or log note
   */
  create(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update an existing activity
   */
  update(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Toggle done status
   */
  markDone(orgSlug, id, isDone = true) {
    return api.request(`/api/org/${orgSlug}/activities/${id}/done`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone }),
    });
  },

  /**
   * Delete an activity
   */
  remove(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/activities/${id}`, {
      method: 'DELETE',
    });
  },
};

export default activityApi;
