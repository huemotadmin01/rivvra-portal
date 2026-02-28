/**
 * ATS (Applicant Tracking System) API utility
 * Uses the main ApiClient for org-scoped ATS endpoints.
 */
import api from './api';

const atsApi = {
  // ── Stages ────────────────────────────────────────────────────────────
  listStages(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/stages`);
  },

  createStage(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/stages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStage(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/stages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteStage(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/stages/${id}`, {
      method: 'DELETE',
    });
  },

  reorderStages(orgSlug, stages) {
    return api.request(`/api/org/${orgSlug}/ats/stages/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ stages }),
    });
  },

  // ── Job Positions ─────────────────────────────────────────────────────
  listJobs(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/jobs${qs ? '?' + qs : ''}`);
  },

  getJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}`);
  },

  createJob(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/jobs`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateJob(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  changeJobStatus(orgSlug, id, status) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  deleteJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Applications ──────────────────────────────────────────────────────
  listApplications(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/applications${qs ? '?' + qs : ''}`);
  },

  getKanban(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/applications/kanban${qs ? '?' + qs : ''}`);
  },

  getApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}`);
  },

  createApplication(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/applications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateApplication(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  moveStage(orgSlug, id, stageId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stageId }),
    });
  },

  refuseApplication(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/refuse`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  hireApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/hire`, {
      method: 'PATCH',
    });
  },

  deleteApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Candidates ────────────────────────────────────────────────────────
  listCandidates(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/candidates${qs ? '?' + qs : ''}`);
  },

  getCandidate(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${id}`);
  },

  updateCandidate(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Activities ────────────────────────────────────────────────────────
  listActivities(orgSlug, applicationId) {
    return api.request(`/api/org/${orgSlug}/ats/activities?applicationId=${applicationId}`);
  },

  createActivity(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateActivity(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  markActivityDone(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/activities/${id}/done`, {
      method: 'PATCH',
    });
  },

  deleteActivity(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/activities/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Config (Tags, Sources, Refuse Reasons, Degrees, Employment Types) ─
  listConfig(orgSlug, entity) {
    return api.request(`/api/org/${orgSlug}/ats/config/${entity}`);
  },

  createConfig(orgSlug, entity, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/${entity}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateConfig(orgSlug, entity, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/${entity}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteConfig(orgSlug, entity, id) {
    return api.request(`/api/org/${orgSlug}/ats/config/${entity}/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Dashboard ─────────────────────────────────────────────────────────
  getDashboard(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/dashboard`);
  },

  // ── Settings ──────────────────────────────────────────────────────────
  getSettings(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/config/settings`);
  },

  updateSettings(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Recruiters ────────────────────────────────────────────────────────
  listRecruiters(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/recruiters`);
  },
};

export default atsApi;
