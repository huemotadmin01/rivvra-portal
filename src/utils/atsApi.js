/**
 * ATS (Applicant Tracking System) API utility
 * Uses the main ApiClient for org-scoped ATS endpoints.
 */
import api from './api';

const atsApi = {
  // ── Stages ────────────────────────────────────────────────────────────
  // Pass jobPositionId to get the job-RESOLVED pipeline (global stages +
  // that job's extra interview rounds). Omit it for the global config list.
  listStages(orgSlug, jobPositionId) {
    const qs = jobPositionId ? `?jobPositionId=${encodeURIComponent(jobPositionId)}` : '';
    return api.request(`/api/org/${orgSlug}/ats/stages${qs}`);
  },

  // ── Per-job interview rounds ─────────────────────────────────────────
  listInterviewRounds(orgSlug, jobId) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/interview-rounds`);
  },

  setInterviewRounds(orgSlug, jobId, techRounds) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/interview-rounds`, {
      method: 'PUT',
      body: JSON.stringify({ techRounds }),
    });
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

  // ── Attachment Kinds (org-wide taxonomy for per-stage upload gates) ─────
  listAttachmentKinds(orgSlug, includeArchived = false) {
    const qs = includeArchived ? '?includeArchived=true' : '';
    return api.request(`/api/org/${orgSlug}/ats/attachment-kinds${qs}`);
  },

  createAttachmentKind(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/ats/attachment-kinds`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAttachmentKind(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/attachment-kinds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Job Positions ─────────────────────────────────────────────────────
  // 2026-05-17 health-check F.3: facets endpoint for the Jobs list's
  // Department + Client filter chips. Returns distinct values across the
  // full active/archived slice, not just the page-1 jobs.
  getJobFacets(orgSlug, { archived } = {}) {
    const qs = archived === '1' ? '?archived=1' : '';
    return api.request(`/api/org/${orgSlug}/ats/jobs/facets${qs}`);
  },

  listJobs(orgSlug, { _requestKey, ...params } = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/jobs${qs ? '?' + qs : ''}`, _requestKey ? { _requestKey } : {});
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

  publishJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/publish`, { method: 'POST' });
  },

  unpublishJob(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/unpublish`, { method: 'POST' });
  },

  changeJobStatus(orgSlug, id, status) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Explicit state transition that runs the 8-field gate server-side
  // and fires ats_job_approval_request. The salesperson clicks Submit
  // (or Resubmit after a rejection) — the same endpoint handles both.
  // On 400, response carries { missing: [...field labels] } so the
  // banner can echo what's still empty.
  submitJobForApproval(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${id}/submit-for-approval`, {
      method: 'POST',
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

  // AI-extract required skills from the JD and save them on the job.
  autofillJobSkills(orgSlug, jobId) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/autofill-skills`, { method: 'POST' });
  },

  // ── Suggested candidates (rule-based matcher; approved+open jobs only) ──
  // refresh=true bypasses the server-side suggestions cache and recomputes
  // synchronously (slow on a throttled DB tier — used by the Refresh button).
  getSuggestedCandidates(orgSlug, jobId, { limit = 10, refresh = false } = {}) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/suggested-candidates?limit=${limit}${refresh ? '&refresh=1' : ''}`);
  },
  dismissSuggestedCandidate(orgSlug, jobId, candidateId) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/suggested-candidates/${candidateId}/dismiss`, {
      method: 'POST',
    });
  },
  undismissSuggestedCandidate(orgSlug, jobId, candidateId) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/suggested-candidates/${candidateId}/dismiss`, {
      method: 'DELETE',
    });
  },
  // Account owner hands a suggested candidate to the job's recruiter.
  recommendSuggestedCandidate(orgSlug, jobId, candidateId, note) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/suggested-candidates/${candidateId}/recommend`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    });
  },
  unrecommendSuggestedCandidate(orgSlug, jobId, candidateId) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/suggested-candidates/${candidateId}/recommend`, {
      method: 'DELETE',
    });
  },
  // Copy a cross-company suggested candidate into the job's company (returns
  // the in-company candidate id to then create an application against).
  copyCrossCompanyCandidate(orgSlug, jobId, candidateId) {
    return api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/suggested-candidates/${candidateId}/copy`, {
      method: 'POST',
    });
  },

  // ── Applications ──────────────────────────────────────────────────────
  // 2026-05-17 health-check: _requestKey is stripped from query string and
  // forwarded to api.request for dedup — rapid filter typing / page changes
  // automatically abort the previous list request so we don't race-render
  // stale results.
  listApplications(orgSlug, { _requestKey, ...params } = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/applications${qs ? '?' + qs : ''}`, _requestKey ? { _requestKey } : {});
  },

  getKanban(orgSlug, { _requestKey, ...params } = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/applications/kanban${qs ? '?' + qs : ''}`, _requestKey ? { _requestKey } : {});
  },

  getApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}`);
  },

  // 2026-05-28: manual AI re-score (admin only). Synchronous — caller waits.
  // 2026-05-28: AI preview-resume — synchronous extraction at form-time
  // so the recruiter sees AI skill suggestions BEFORE creating the
  // application. Used by AtsApplicationNew.
  previewResumeAi(orgSlug, file) {
    const fd = new FormData();
    fd.append('file', file);
    return api.uploadFile(`/api/org/${orgSlug}/ats/ai-preview-resume`, fd);
  },

  rescoreApplicationAi(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/ai-rescore`, { method: 'POST' });
  },
  rescoreCandidateAi(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/${id}/ai-rescore`, { method: 'POST' });
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

  // "Assign to me" — claim an unassigned (HR-Team/default) application.
  // Carve-out from the team-scope write gate; only works on the
  // unassigned pool (see backend POST /applications/:id/claim).
  claimApplication(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({}),
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

  // 2026-05-12 stage-transition wizard (api commit d15c030). Preflight
  // returns the ordered list of fillable steps the wizard should render
  // for this transition + non-fillable blockers + (for backward moves)
  // the list of interview fields that will get wiped on commit so the
  // wizard can show the "this will clear …" warning.
  transitionPreflight(orgSlug, applicationId, targetStageId) {
    return api.request(
      `/api/org/${orgSlug}/ats/applications/${applicationId}/transition-preflight?targetStageId=${encodeURIComponent(targetStageId)}`,
    );
  },

  // Atomic wizard-submit endpoint. Re-runs every gate via the same
  // helper /stage uses, then performs the move (backward wipe +
  // stageHistory + emails). Body: { targetStageId, reason? } — the
  // wizard auto-saves per-step data via existing endpoints on Next so
  // by submit time everything is persisted.
  stageTransition(orgSlug, applicationId, body) {
    return api.request(
      `/api/org/${orgSlug}/ats/applications/${applicationId}/stage-transition`,
      { method: 'POST', body: JSON.stringify(body || {}) },
    );
  },

  refuseApplication(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/refuse`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // 2026-05-11: fetch the snapshotted HTML body of an email previously
  // sent for this application. Drives the ActivityPanel side-drawer
  // ("View email") — keeps the activity-log row itself light (200 bytes
  // metadata) while letting the recruiter pull the rendered email
  // on-demand.
  getApplicationEmailBody(orgSlug, applicationId, logId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/email-body/${logId}`);
  },

  // Documents Collection — checklist receipt + admin bypass for the
  // forward-move gate. See ats.js → collectStageGates 'documents' branch.
  markDocumentReceived(orgSlug, applicationId, name, received, attachmentId = null) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/documents/receive`, {
      method: 'POST',
      body: JSON.stringify({ name, received: !!received, attachmentId: attachmentId || null }),
    });
  },
  bypassDocumentsGate(orgSlug, applicationId, reason) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/documents/bypass`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // 2026-05-27 — admin-only escape hatch for the Rate Confirmation gate.
  // Stamp lives on application.rateConfirmationGate; auto-clears when a
  // fully-signed RC envelope is later attached. Reason must be ≥10 chars.
  bypassRateConfirmationGate(orgSlug, applicationId, reason) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/rate-confirmation/bypass`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  revokeRateConfirmationBypass(orgSlug, applicationId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/rate-confirmation/bypass`, {
      method: 'DELETE',
    });
  },

  // 2026-05-11: restore a refused application back to 'ongoing'.
  // Clears refused / refusedAt / refuseReasonId. Reason is required
  // and stored in the stageHistory entry for audit. Admin-only.
  // Note: the candidate's rejection email already went out at refuse
  // time — restoring does not un-send it.
  unrefuseApplication(orgSlug, id, reason) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${id}/unrefuse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
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
        // Only 'offer'-subtype envelopes write back to application.offer.* on
        // the Sign side. Rate Confirmations / NDAs / MSAs share the same
        // linkedModel but must NOT populate the offer block.
        linkedSubtype: 'offer',
      }),
    });
  },

  // 2026-05-18 PM: record a Rate Confirmation Sign envelope on the
  // application. The envelope itself is created via POST /sign/requests;
  // this records the metadata (envelopeId + terms) on the application
  // doc and gates by External Consultant + isClientRole + team-scope.
  // payload: { envelopeId, amount, currency, unit, startDate? }
  recordRateConfirmation(orgSlug, applicationId, payload) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/rate-confirmation`, {
      method: 'POST',
      body: JSON.stringify(payload),
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

  bulkRefuse(orgSlug, applicationIds, { refuseReasonId, sendEmail } = {}) {
    return api.request(`/api/org/${orgSlug}/ats/applications/bulk/refuse`, {
      method: 'POST',
      body: JSON.stringify({
        applicationIds,
        refuseReasonId: refuseReasonId || null,
        sendEmail: sendEmail !== false,
      }),
    });
  },

  // ── Refuse reasons ────────────────────────────────────────────────────
  listRefuseReasons(orgSlug) {
    return api.request(`/api/org/${orgSlug}/ats/config/refuse-reasons`);
  },

  // ── Candidates ────────────────────────────────────────────────────────
  listCandidates(orgSlug, { _requestKey, ...params } = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/ats/candidates${qs ? '?' + qs : ''}`, _requestKey ? { _requestKey } : {});
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

  // Bulk import: rows is an array of { name, email, phone?, mobile?,
  // linkedinProfile?, description? }. Server re-validates + dedups and returns
  // { success, summary, results[] }.
  bulkImportCandidates(orgSlug, rows) {
    return api.request(`/api/org/${orgSlug}/ats/candidates/bulk-import`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
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

  // Clone a picklist from a sibling entity into the active company.
  // Idempotent server-side (skips names already present). The active
  // company is implied by the X-Company-Id header.
  copyConfigFrom(orgSlug, entity, fromCompanyId) {
    return api.request(`/api/org/${orgSlug}/ats/config/${entity}/copy-from`, {
      method: 'POST',
      body: JSON.stringify({ fromCompanyId }),
    });
  },

  // ── Dashboard ─────────────────────────────────────────────────────────
  // 2026-05-12 audit P1 #8: time-range filter. Both dateFrom and dateTo
  // are optional ISO strings; omitting both preserves the legacy
  // "all time" behaviour.
  getDashboard(orgSlug, { dateFrom = null, dateTo = null } = {}) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const qs = params.toString();
    return api.request(`/api/org/${orgSlug}/ats/dashboard${qs ? `?${qs}` : ''}`);
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
    // Client-side mirror of the API's 10 MB multer cap. Centralized here so
    // EVERY upload path (attachments panel, required-documents checklist,
    // resume gate, stage-attachment gate) gets the friendly rejection —
    // previously only the panel checked, and the other paths surfaced an
    // unhandled server MulterError (Sentry NODE-EXPRESS-4, 2026-07-09).
    // Callers already toast err.message.
    if (file && file.size > 10 * 1024 * 1024) {
      return Promise.reject(new Error(`${file.name || 'File'} is too large — maximum 10 MB per file.`));
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isResume', String(isResume));
    if (kind) formData.append('kind', kind);
    return api.uploadFile(`/api/org/${orgSlug}/ats/applications/${applicationId}/attachments`, formData);
  },
  // Clone an attachment row onto a different application (shares the
  // underlying Cloudinary asset). Used by the New Application page when
  // a recruiter reuses the candidate's resume-on-file.
  cloneAttachment(orgSlug, applicationId, sourceAttachmentId) {
    return api.request(`/api/org/${orgSlug}/ats/applications/${applicationId}/attachments/clone`, {
      method: 'POST',
      body: JSON.stringify({ sourceAttachmentId }),
    });
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
