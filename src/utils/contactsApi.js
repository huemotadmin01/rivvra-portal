/**
 * Contacts App API utility
 * Uses the main ApiClient for org-scoped contacts endpoints.
 */
import api from './api';

const contactsApi = {
  // ── Contacts ──────────────────────────────────────────────────────────
  list(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/contacts${qs ? '?' + qs : ''}`);
  },

  get(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/contacts/${id}`);
  },

  create(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/contacts/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Companies dropdown ────────────────────────────────────────────────
  listCompanies(orgSlug) {
    return api.request(`/api/org/${orgSlug}/contacts/companies`);
  },

  // ── Tags ──────────────────────────────────────────────────────────────
  listTags(orgSlug) {
    return api.request(`/api/org/${orgSlug}/contacts/tags`);
  },

  createTag(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/contacts/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTag(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/contacts/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteTag(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/contacts/tags/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Salespersons dropdown ──────────────────────────────────────────────
  listSalespersons(orgSlug, search = '') {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.request(`/api/org/${orgSlug}/contacts/salespersons${qs}`);
  },

  // ── Attachments ──────────────────────────────────────────────────────
  listAttachments(orgSlug, contactId) {
    return api.request(`/api/org/${orgSlug}/contacts/${contactId}/attachments`);
  },
  uploadAttachment(orgSlug, contactId, file, label) {
    const formData = new FormData();
    formData.append('file', file);
    if (label) formData.append('label', label);
    return api.uploadFile(`/api/org/${orgSlug}/contacts/${contactId}/attachments`, formData);
  },
  getAttachmentUrl(orgSlug, contactId, docId) {
    return `${api.baseUrl}/api/org/${orgSlug}/contacts/${contactId}/attachments/${docId}`;
  },
  deleteAttachment(orgSlug, contactId, docId) {
    return api.request(`/api/org/${orgSlug}/contacts/${contactId}/attachments/${docId}`, { method: 'DELETE' });
  },
};

export default contactsApi;
