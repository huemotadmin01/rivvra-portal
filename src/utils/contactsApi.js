/**
 * Contacts App API utility
 * Uses the main ApiClient for org-scoped contacts endpoints.
 */
import api, { getActiveCompanyId } from './api';

const contactsApi = {
  // ── Contacts ──────────────────────────────────────────────────────────
  // 2026-05-17 CONTACTS-B: _requestKey forwarded to api.request for dedup
  // — rapid filter typing auto-aborts the previous list request so stale
  // responses can't overwrite a newer fetch. Same pattern as ATS/CRM list
  // methods.
  list(orgSlug, { _requestKey, ...params } = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/contacts${qs ? '?' + qs : ''}`, _requestKey ? { _requestKey } : {});
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

  archivePreview(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/contacts/${id}/archive-preview`);
  },
  archive(orgSlug, id, { cascade = false } = {}) {
    return api.request(`/api/org/${orgSlug}/contacts/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ cascade }),
    });
  },
  unarchive(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/contacts/${id}/unarchive`, { method: 'PATCH' });
  },

  // Returns the parsed JSON body whether the response is 200 or 409 so callers
  // can inspect the `references`/`samples` payload produced by the server's FK
  // safety check and offer the user a force-delete confirmation. Non-JSON or
  // other error statuses still throw.
  async delete(orgSlug, id, { force = false } = {}) {
    const qs = force ? '?force=true' : '';
    const url = `${api.baseUrl}/api/org/${orgSlug}/contacts/${id}${qs}`;
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('rivvra_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const companyId = getActiveCompanyId();
    if (companyId) headers['X-Company-Id'] = companyId;

    const response = await fetch(url, { method: 'DELETE', headers });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (response.status === 409) {
      return { ...data, status: 409 };
    }
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
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
  // Single-employee membership probe used by EmployeeLookup to decide
  // whether to render a name as a hyperlink. Returns { salespersons: [] }
  // when the id isn't an active employee in the current company scope.
  probeSalesperson(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/contacts/salespersons?id=${encodeURIComponent(id)}`);
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
