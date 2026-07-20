/**
 * Knowledge Base API utility (v2)
 *
 * DB-backed help center. Reads are app-access filtered server-side (a member
 * only sees articles for apps they can access); org admins can author their
 * organization's own articles alongside the canonical platform docs.
 */
import api from './api';

const base = (orgSlug) => `/api/org/${orgSlug}/knowledge-base`;

const knowledgeBaseApi = {
  // ── Reader ───────────────────────────────────────────────────────────
  listArticles(orgSlug, { app, scope, q, includeDrafts } = {}) {
    const params = new URLSearchParams();
    if (app) params.set('app', app);
    if (scope) params.set('scope', scope);
    if (q) params.set('q', q);
    if (includeDrafts) params.set('includeDrafts', '1');
    const qs = params.toString();
    return api.request(`${base(orgSlug)}/articles${qs ? `?${qs}` : ''}`);
  },

  getArticle(orgSlug, slug) {
    return api.request(`${base(orgSlug)}/articles/${encodeURIComponent(slug)}`);
  },

  search(orgSlug, q) {
    return api.request(`${base(orgSlug)}/search?q=${encodeURIComponent(q)}`);
  },

  ask(orgSlug, question) {
    return api.request(`${base(orgSlug)}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },

  // ── Org authoring (admins) ───────────────────────────────────────────
  create(orgSlug, data) {
    return api.request(`${base(orgSlug)}/articles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(orgSlug, id, data) {
    return api.request(`${base(orgSlug)}/articles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  remove(orgSlug, id) {
    return api.request(`${base(orgSlug)}/articles/${id}`, { method: 'DELETE' });
  },
};

export default knowledgeBaseApi;
