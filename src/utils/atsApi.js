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

  archiveJobPreview(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/archive-preview`);
  },
  archiveJob(orgSlug, id, { cascade = false } = {}) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ cascade }),
    });
  },
  unarchiveJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/unarchive`, { method: 'PATCH' });
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

  // Phase-1 / Q13 (2026-05-10): backward stage moves require a reason
  // (captured in stageHistory). Forward moves don't, so reason is
  // optional. The API ignores reason on forward moves; passing it is
  // harmless. Caller (handleMoveStage) supplies it after the user fills
  // the BackwardMoveReasonModal that fires on the first 400.
  moveStage(orgSlug, id, stageId, opts = {}) {
    const body = { stageId };
    if (opts && typeof opts.reason === 'string' && opts.reason.trim()) {
      body.reason = opts.reason.trim();
    }
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  refuseApplication(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/refuse`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // P0.1 (2026-05-10): /hire now requires offer-acceptance data.
  //   payload: { offer: { joiningDate, offeredCTC: {currency, amount},
  //                       noticePeriodDays, probationMonths, signedOfferDocId? } }
  hireApplication(orgSlug, id, payload) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/hire`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    });
  },

  // P0.2 (2026-05-10): save the offer subdoc independently of /hire so
  // recruiters can satisfy the Offer Proposal / Offer Signed stage gates
  // without marking the application as Hired. Same payload shape as /hire.
  updateOffer(orgSlug, id, payload) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/offer`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    });
  },

  // Phase-1 / Q28 (2026-05-11): capture an interview's result. Used by
  // the result-gate that blocks forward moves out of L1/L2/HR. Body:
  //   { level: 'l1'|'l2'|'hr',
  //     result: { recommendation: 'Proceed'|'Hold'|'Reject', notes? } }
  captureInterviewResult(orgSlug, applicationId, payload) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/interview-result`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Phase-1 / Q26 (2026-05-11): schedule one round of interview on the
  // application. Used by the interview-slot gate at L1/L2/HR. Body:
  //   { level: 'l1'|'l2'|'hr', slot: { datetime, interviewerId,
  //     interviewerName?, mode, meetingLink?, durationMinutes? } }
  scheduleInterview(orgSlug, applicationId, payload) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/interview`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Phase-1 / Q11+Q12 (2026-05-10): list Sign templates available to this
  // org+company. Reuses the existing Sign module endpoint as-is per Q17-A1
  // — same filtering Sign already applies (active + non-ephemeral + scope).
  listSignTemplates(orgSlug) {
    return api.request(`/api/org/${orgSlug}/sign/templates`);
  },

  // Phase-1 / Q11+Q12 (2026-05-10): create a Sign request for an offer
  // letter from the ATS offer modal. linkedModel='ats_application' makes
  // the Sign completion handler write back to application.offer
  // .signedOfferDocId once all signers complete.
  // payload: { templateId, signers: [{ name, email, roleName? }], reference?, subject?, message? }
  createOfferSignRequest(orgSlug, applicationId, payload) {
    return api.request(`/api/org/${orgSlug}/sign/requests`, {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        linkedModel: 'ats_application',
        linkedId: applicationId,
      }),
    });
  },

  // 2026-05-11: detach the in-flight envelope from the offer subdoc
  // (clears offer.signEnvelopeId + signEnvelopeSentAt). Used by the
  // Offer Details modal's Disconnect button when the recruiter needs
  // to reset and resend — e.g. wrong candidate email captured. Does
  // NOT cancel the underlying sign request.
  disconnectOfferEnvelope(orgSlug, applicationId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/offer/envelope`, {
      method: 'DELETE',
    });
  },

  // 2026-05-11: revise an already-signed offer (rate renegotiation etc).
  // Snapshots the current offer subdoc into offer.previousVersions[],
  // clears signedOfferDocId + envelope back-link, regresses the stage
  // from Offer Signed → Offer Proposal. Reason is required. Admin-only.
  reviseOffer(orgSlug, applicationId, reason) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/offer/revise`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // P0.1 (2026-05-10): /create-employee now requires HR-side fields.
  //   payload: { workEmail, managerId, internalCompanyId, billable,
  //              department?, designation?, employeeCode? }
  createEmployeeFromApplication(orgSlug, id, payload) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/create-employee`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  deleteApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}`, {
      method: 'DELETE',
    });
  },

  archiveApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/archive`, { method: 'PATCH' });
  },
  unarchiveApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/unarchive`, { method: 'PATCH' });
  },

  // ── Bulk actions ──────────────────────────────────────────────────────
  // Recruiters use these from the applications list when moving/refusing
  // many candidates at once. Backend caps at 200 per request, suppresses
  // candidate-facing emails (status hygiene rather than communication),
  // and writes per-doc stageHistory entries with `bulk: true` so the
  // audit trail distinguishes bulk moves from individual ones.
  bulkMoveStage(orgSlug, applicationIds, stageId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/bulk/stage`, {
      method: 'POST',
      body: JSON.stringify({ applicationIds, stageId }),
    });
  },

  bulkRefuse(orgSlug, applicationIds, refuseReasonId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/bulk/refuse`, {
      method: 'POST',
      body: JSON.stringify({ applicationIds, refuseReasonId: refuseReasonId || null }),
    });
  },

  // ── Refuse reasons ────────────────────────────────────────────────────
  listRefuseReasons(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/config/refuse-reasons`);
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

  archiveCandidatePreview(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${id}/archive-preview`);
  },
  archiveCandidate(orgSlug, id, { cascade = false } = {}) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ cascade }),
    });
  },
  unarchiveCandidate(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${id}/unarchive`, { method: 'PATCH' });
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
  // Phase-1 / Q14 (2026-05-10): optional `kind` slug ties an upload to
  // a stage-attachment requirement (e.g. 'screening_evidence',
  // 'hr_discussion_evidence'). The API rejects unknown slugs so a typo
  // can't silently bypass the gate.
  uploadAttachment(orgSlug, applicationId, file, isResume = false, kind = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isResume', String(isResume));
    if (kind) formData.append('kind', kind);
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
  getAttachmentDownloadUrl(orgSlug, attachmentId) {
    return `${api.baseUrl}/api/org/${orgSlug}/ats/attachments/${attachmentId}/download`;
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

  // ── Candidate Resume (lookup latest isResume:true attachment) ────────
  getCandidateResume(orgSlug, candidateId) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${candidateId}/resume`);
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
