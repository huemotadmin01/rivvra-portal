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
};

export default announcementsApi;
