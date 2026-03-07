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

  createEmployeeFromApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/create-employee`, {
      method: 'POST',
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

  createCandidate(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/candidates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

  // ── Attachments ──────────────────────────────────────────────────────
  listAttachments(orgSlug, applicationId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/attachments`);
  },
  uploadAttachment(orgSlug, applicationId, file, isResume = false) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isResume', String(isResume));
    return api.uploadFile(`/api/org/${orgSlug}/ats/applications/${applicationId}/attachments`, formData);
  },
  toggleResume(orgSlug, attachmentId) {
    return api.request(`/api/org/${orgSlug}/ats/attachments/${attachmentId}/resume`, {
      method: 'PUT',
    });
  },
  deleteAttachment(orgSlug, attachmentId) {
    return api.request(`/api/org/${orgSlug}/ats/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  },

  // ── Skills Config ───────────────────────────────────────────────────
  listSkillTypes(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-types`);
  },
  createSkillType(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-types`, {
      method: 'POST', body: JSON.stringify(data),
    });
  },
  updateSkillType(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-types/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  },
  deleteSkillType(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-types/${id}`, {
      method: 'DELETE',
    });
  },

  listSkills(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/config/skills${qs ? '?' + qs : ''}`);
  },
  createSkill(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/skills`, {
      method: 'POST', body: JSON.stringify(data),
    });
  },
  updateSkill(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/skills/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  },
  deleteSkill(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/config/skills/${id}`, {
      method: 'DELETE',
    });
  },

  listSkillLevels(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-levels`);
  },
  createSkillLevel(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-levels`, {
      method: 'POST', body: JSON.stringify(data),
    });
  },
  updateSkillLevel(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-levels/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  },
  deleteSkillLevel(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/config/skill-levels/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Candidate Skills ────────────────────────────────────────────────
  listCandidateSkills(orgSlug, candidateId) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${candidateId}/skills`);
  },
  addCandidateSkill(orgSlug, candidateId, data) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${candidateId}/skills`, {
      method: 'POST', body: JSON.stringify(data),
    });
  },
  removeCandidateSkill(orgSlug, candidateId, assignmentId) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${candidateId}/skills/${assignmentId}`, {
      method: 'DELETE',
    });
  },

  // ── Email Templates ───────────────────────────────────────────────
  listEmailTemplates(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/config/email-templates`);
  },
  updateEmailTemplate(orgSlug, key, data) {
    return api.request(`/api/org/${orgSlug}/ats/config/email-templates/${key}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  },
  previewEmailTemplate(orgSlug, key, sampleData) {
    return api.request(`/api/org/${orgSlug}/ats/config/email-templates/${key}/preview`, {
      method: 'POST', body: JSON.stringify({ sampleData }),
    });
  },
  deleteEmailTemplate(orgSlug, key) {
    return api.request(`/api/org/${orgSlug}/ats/config/email-templates/${key}`, {
      method: 'DELETE',
    });
  },
  toggleStageEmail(orgSlug, stageId, emailEnabled) {
    return api.request(`/api/org/${orgSlug}/ats/stages/${stageId}/email`, {
      method: 'PATCH', body: JSON.stringify({ emailEnabled }),
    });
  },
};

export default atsApi;
