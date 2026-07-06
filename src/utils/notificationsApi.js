/**
 * Platform Notifications API utility
 * Feed for the TopBar bell — any app can produce notifications server-side.
 */
import api from './api';

const notificationsApi = {
  list(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/notifications${qs ? '?' + qs : ''}`);
  },

  markRead(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/notifications/${id}/read`, { method: 'POST' });
  },

  markAllRead(orgSlug) {
    return api.request(`/api/org/${orgSlug}/notifications/read-all`, { method: 'POST' });
  },
};

export default notificationsApi;
