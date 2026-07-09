/**
 * Platform Announcements API utility
 * Feature-launch banners; dismissal is remembered per-user server-side.
 */
import api from './api';

const announcementsApi = {
  list(orgSlug) {
    return api.request(`/api/org/${orgSlug}/announcements`);
  },

  dismiss(orgSlug, key) {
    return api.request(`/api/org/${orgSlug}/announcements/${key}/dismiss`, { method: 'POST' });
  },

  // ── Super-admin console ────────────────────────────────────────────
  adminList() {
    return api.request('/api/superadmin/announcements');
  },

  adminCreate(data) {
    return api.request('/api/superadmin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  adminUpdate(id, data) {
    return api.request(`/api/superadmin/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  adminDelete(id) {
    return api.request(`/api/superadmin/announcements/${id}`, { method: 'DELETE' });
  },
};

export default announcementsApi;
