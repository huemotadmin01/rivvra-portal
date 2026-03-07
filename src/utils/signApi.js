/**
 * Sign App API utility
 * Uses the main ApiClient for org-scoped Sign endpoints.
 */
import api from './api';

const signApi = {
  // ── Templates ──────────────────────────────────────────────────────
  listTemplates(orgSlug) {
    return api.request(`/api/org/${orgSlug}/sign/templates`);
  },

  getTemplate(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/templates/${id}`);
  },

  createTemplate(orgSlug, formData) {
    return api.uploadFile(`/api/org/${orgSlug}/sign/templates`, formData);
  },

  updateTemplate(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/sign/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteTemplate(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/templates/${id}`, {
      method: 'DELETE',
    });
  },

  duplicateTemplate(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/templates/${id}/duplicate`, {
      method: 'POST',
    });
  },

  // ── Sign Requests ──────────────────────────────────────────────────
  listRequests(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/sign/requests${qs ? '?' + qs : ''}`);
  },

  getRequest(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/requests/${id}`);
  },

  createRequest(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/sign/requests`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  cancelRequest(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/requests/${id}/cancel`, {
      method: 'PUT',
    });
  },

  remindSigners(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/requests/${id}/remind`, {
      method: 'POST',
    });
  },

  // ── Public Signing (no auth token) ─────────────────────────────────
  verifySigningLink(requestId, signerId, token) {
    return api.request(`/api/sign/verify/${requestId}/${signerId}/${token}`);
  },

  submitSignature(requestId, signerId, token, data) {
    return api.request(`/api/sign/submit/${requestId}/${signerId}/${token}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  refuseSignature(requestId, signerId, token) {
    return api.request(`/api/sign/refuse/${requestId}/${signerId}/${token}`, {
      method: 'POST',
    });
  },

  // ── Config: Tags ───────────────────────────────────────────────────
  listTags(orgSlug) {
    return api.request(`/api/org/${orgSlug}/sign/tags`);
  },

  createTag(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/sign/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTag(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/sign/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteTag(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/tags/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Config: Roles ──────────────────────────────────────────────────
  listRoles(orgSlug) {
    return api.request(`/api/org/${orgSlug}/sign/roles`);
  },

  createRole(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/sign/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRole(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/sign/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteRole(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/sign/roles/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Dashboard ──────────────────────────────────────────────────────
  getDashboard(orgSlug) {
    return api.request(`/api/org/${orgSlug}/sign/dashboard`);
  },

  // ── Email Templates ───────────────────────────────────────────────
  listEmailTemplates(orgSlug) {
    return api.request(`/api/org/${orgSlug}/sign/config/email-templates`);
  },
  updateEmailTemplate(orgSlug, key, data) {
    return api.request(`/api/org/${orgSlug}/sign/config/email-templates/${key}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  },
  previewEmailTemplate(orgSlug, key, sampleData) {
    return api.request(`/api/org/${orgSlug}/sign/config/email-templates/${key}/preview`, {
      method: 'POST', body: JSON.stringify({ sampleData }),
    });
  },
  deleteEmailTemplate(orgSlug, key) {
    return api.request(`/api/org/${orgSlug}/sign/config/email-templates/${key}`, {
      method: 'DELETE',
    });
  },
};

export default signApi;
