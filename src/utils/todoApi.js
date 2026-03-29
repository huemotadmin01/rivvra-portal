/**
 * To-Do App API utility
 * Uses the main ApiClient for org-scoped To-Do endpoints.
 */
import api from './api';

const todoApi = {
  // ── Tasks ──────────────────────────────────────────────────────────
  getTasks(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/todo/tasks${qs ? '?' + qs : ''}`);
  },

  getTask(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/todo/tasks/${id}`);
  },

  createTask(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/todo/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTask(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/todo/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteTask(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/todo/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  acceptAiTask(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/todo/tasks/${id}/accept`, {
      method: 'POST',
    });
  },

  dismissAiTask(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/todo/tasks/${id}/dismiss`, {
      method: 'POST',
    });
  },

  bulkStatus(orgSlug, taskIds, status) {
    return api.request(`/api/org/${orgSlug}/todo/tasks/bulk-status`, {
      method: 'POST',
      body: JSON.stringify({ taskIds, status }),
    });
  },

  // ── Dashboard ──────────────────────────────────────────────────────
  getDashboard(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/dashboard`);
  },

  // ── Per-User Settings (Gmail + scanEnabled) ────────────────────────
  getSettings(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/settings`);
  },

  updateSettings(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/todo/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Org-Wide Config (Admin: frequency, topN, blocklist) ───────────
  getOrgConfig(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/org-config`);
  },

  updateOrgConfig(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/todo/org-config`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Gmail OAuth ────────────────────────────────────────────────────
  getGmailOAuthUrl(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/gmail/oauth-url`);
  },

  connectGmail(orgSlug, code, state) {
    return api.request(`/api/org/${orgSlug}/todo/gmail/connect`, {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  },

  disconnectGmail(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/gmail/disconnect`, {
      method: 'POST',
    });
  },

  getGmailStatus(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/gmail/status`);
  },

  // ── Scan ───────────────────────────────────────────────────────────
  triggerScan(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/scan`, {
      method: 'POST',
    });
  },

  getScanLogs(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/scan-logs`);
  },

  // ── Notifications ──────────────────────────────────────────────────
  getNotifications(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/notifications`);
  },

  markNotificationRead(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/todo/notifications/${id}/read`, {
      method: 'POST',
    });
  },

  markAllNotificationsRead(orgSlug) {
    return api.request(`/api/org/${orgSlug}/todo/notifications/read-all`, {
      method: 'POST',
    });
  },
};

export default todoApi;
