// ============================================================================
// alumniApi.js — Admin-side client for alumni lifecycle endpoints
// ============================================================================
import api from './api';

const alumniApi = {
  // Policy
  getPolicy(orgSlug) {
    return api.request(`/api/org/${orgSlug}/alumni-policy`);
  },
  updatePolicy(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/alumni-policy`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Directory
  list(orgSlug) {
    return api.request(`/api/org/${orgSlug}/alumni`);
  },
  reactivate(orgSlug, userId, days) {
    return api.request(`/api/org/${orgSlug}/alumni/${userId}/reactivate`, {
      method: 'POST',
      body: JSON.stringify(days ? { days } : {}),
    });
  },
  revoke(orgSlug, userId, reason) {
    return api.request(`/api/org/${orgSlug}/alumni/${userId}/revoke`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    });
  },
};

export default alumniApi;
