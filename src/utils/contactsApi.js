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
  listSalespersons(orgSlug) {
    return api.request(`/api/org/${orgSlug}/contacts/salespersons`);
  },
};

export default contactsApi;
