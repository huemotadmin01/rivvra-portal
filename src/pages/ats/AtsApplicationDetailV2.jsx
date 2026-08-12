import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/formatCurrency';
import atsApi from '../../utils/atsApi';
import signApi from '../../utils/signApi';
import employeeApi from '../../utils/employeeApi';
import ActivityPanelV2 from '../../components/shared/v2/ActivityPanelV2';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import SkillsPicker from '../../components/ats/SkillsPicker';
import AttachmentsPanel from '../../components/ats/AttachmentsPanel';
import AiResumeInsights from '../../components/ats/AiResumeInsights';
import RateConfirmationModal from '../../components/ats/RateConfirmationModal';
import RefuseModal from '../../components/ats/RefuseModal';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import { withFromContext } from '../../utils/entityDescribe';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import ReasonPromptDialog from '../../components/shared/ReasonPromptDialog';
import { InlineField, Panel, RecordMeta, StageBar as DsStageBar } from '../../components/ds';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  Loader2,
  Star,
  ChevronLeft,
  User,
  Briefcase,
  FileText,
  Tag,
  Calendar,
  XCircle,
  Award,
  ExternalLink,
  FileSignature,
  UserPlus,
  UserCheck,
  DollarSign,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Trash2,
  AlertCircle,
  FileCheck,
  Check,
  ShieldOff,
  Upload,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import { getEmploymentTypeMeta, SALARY_UNIT_INPUT } from '../../utils/atsEmploymentTypes';


import {
  KanbanDot, HireModal, CreateEmployeeDrawer, BackwardMoveReasonModal,
  AttachmentUploadModal, InterviewScheduleModal, InterviewResultModal,
  MoveStageDropdown, InterviewRoundCard, formatEventDateTime,
  EVAL_OPTIONS, INTERVIEW_LEVEL_LABEL, KANBAN_STATES, KANBAN_LABELS,
} from './applicationDetailParts';

export default function AtsApplicationDetail() {
  const { applicationId } = useParams();
  const { currentOrg, getAppRole, hasAppAccess, isOrgAdmin, membershipVerified } = useOrg();
  // 2026-05-28 — Bypass-gate UI must wait for the live `/by-user/me`
  // round-trip before trusting `isOrgAdmin`. Cache-hydrated membership
  // could carry a stale `orgRole: 'admin'` from prior elevation and would
  // leak the bypass affordance for ~1s on first paint.
  const canBypassRcGate = membershipVerified && isOrgAdmin === true;
  const { user: authUser } = useAuth();
  const { currentCompany, companies } = useCompany();
  const handleScoped404 = useCompanyScoped404('application');
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const companyCurrency = currentCompany?.currency || 'INR';
  // Treat 0 as "unset" for display. Imported records pre-2026-05-09
  // were written with salaryExpected/Proposed = 0 instead of null;
  // the importer was hardened (5-import-data.js: null defaults) but it
  // skips existing rows on re-run, so backfilling those legacy zeros
  // here is the cheapest fix. Legitimate "0 expected" is not a real
  // staffing case at Huemot — confirmed before shipping.
  // Salary figures render in the application's compensationCurrency when set
  // (e.g. an India-based candidate on a US-company req quotes INR); null falls
  // back to the company currency — the pre-existing behavior.
  const fmtSalary = (v, currency) =>
    v == null || v === '' || Number(v) === 0 ? null : formatCurrency(v, currency || companyCurrency);

  const [application, setApplication] = useState(null);
  usePageTitle(application?.candidateName);
  const [loading, setLoading] = useState(true);
  const [aiRescoring, setAiRescoring] = useState(false);

  // Dropdown data
  const [stages, setStages] = useState([]);
  const [refuseReasons, setRefuseReasons] = useState([]);
  const [recruiters, setRecruiters] = useState([]);

  // Modal / action UI state
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [showDocumentsBypassDialog, setShowDocumentsBypassDialog] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  // editOfferOnly: opens the HireModal in 'offer' mode without any
  // pending stage move — used by the header "Offer" button so the
  // recruiter can view / edit / Revise the offer (including
  // already-signed ones) without having to drag the chip past a gate.
  const [editOfferOnly, setEditOfferOnly] = useState(false);
  // (pendingStageMove removed 2026-07-18 — since the 2026-05-13 change
  // that stopped auto-opening the HireModal on requiresOffer, it was
  // never set to a non-null value; the branch was dead code.)
  // Phase-1 / Q13 (2026-05-10): backward stage moves require a reason.
  // When the API rejects with requiresBackwardReason, we open the
  // BackwardMoveReasonModal and remember the target stage so the
  // success handler can retry with the captured reason.
  //   { stageId, fromStageName, toStageName } | null
  const [pendingBackwardMove, setPendingBackwardMove] = useState(null);
  // Phase-1 / Q14+Q15 (2026-05-10): when a forward move is blocked
  // because the target stage requires a document the application
  // doesn't have yet, open the AttachmentUploadModal pre-loaded with
  // the missing kind. After upload, re-fire the original transition.
  //   { stageId, targetStageName, missingAttachment } | null
  const [pendingAttachmentMove, setPendingAttachmentMove] = useState(null);
  // Resume gate (memory ats_resume_gate_2026_05_22): every forward stage
  // move requires an attachment with isResume=true on the candidate.
  // Backend returns { requiresResume: true, code: RESUME_MISSING }.
  // We open the same AttachmentUploadModal shape with a synthetic
  // "missingAttachment" descriptor pointing at the resume isResume flag.
  //   { stageId, targetStageName } | null
  const [pendingResumeMove, setPendingResumeMove] = useState(null);
  // Phase-1 / Q26 (2026-05-11): when a forward move into L1 / L2 / HR
  // is blocked because the interview slot is missing, open the
  // InterviewScheduleModal pre-filled with whatever the API echoes
  // back (existingSlot). After save, re-fire the original transition.
  //   { stageId, targetStageName, level, existingSlot } | null
  const [pendingInterviewMove, setPendingInterviewMove] = useState(null);
  // Phase-1 / Q28+Q30 (2026-05-11): when a forward move out of an
  // interview stage (L1→L2, L2→Documents, HR→Offer Proposal) is
  // blocked because the previous round's result wasn't captured (or
  // is on Hold), open the InterviewResultModal pre-filled.
  //   { stageId, targetStageName, level, existingResult, isHoldChange } | null
  const [pendingResultMove, setPendingResultMove] = useState(null);
  // P0.1 (2026-05-10): Create Employee is now a pre-filled drawer (Q4-B step 2),
  // not a one-click action. Old immediate-create behaviour produced empty
  // employee records (bug B2).
  const [showCreateEmpDrawer, setShowCreateEmpDrawer] = useState(false);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [showRateConfirmationModal, setShowRateConfirmationModal] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 2026-05-27 — admin-only RC gate bypass. Reason ≥10 chars enforced
  // both client-side (button disabled) and server-side.
  const [showRcBypassModal, setShowRcBypassModal] = useState(false);
  const [rcBypassReason, setRcBypassReason] = useState('');
  const [rcBypassSaving, setRcBypassSaving] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  // 2026-05-18 RBAC two-tier: any ATS user can edit applications, skills,
  // attachments, run interviews, refuse, advance stages. Admin retains
  // exclusive control over offer compensation (extend/revise/envelope)
  // and delete.
  const canRecruit = !!getAppRole('ats');
  const orgSlug = currentOrg?.slug;

  // Current user's employee _id — recruiters can now READ any application
  // org-wide (2026-05-18 PM), but writes stay team-scoped: only the
  // assigned recruiter (or admin) sees Edit/Refuse/Hire/Move buttons.
  const [myEmployeeId, setMyEmployeeId] = useState(null);
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.getMyProfile(orgSlug)
      .then((res) => { if (res?.success && res.employee) setMyEmployeeId(res.employee._id); })
      .catch(() => {});
  }, [orgSlug]);
  const isMine = !!(application?.recruiterId && myEmployeeId && String(application.recruiterId) === String(myEmployeeId));
  // canWrite is the server's verdict (admin / team-lead-for-this-recruiter /
  // member-owns-it). Falls back to the legacy admin-or-mine check when the
  // server response predates the field — so old API + new portal still works
  // for the most common pre-team-lead case. Team leads only became editors
  // for their team's applications via the canWrite flag.
  const canActOnThis = typeof application?.canWrite === 'boolean'
    ? application.canWrite
    : (isAdmin || isMine);

  // Canonical status field on ats_applications is `applicationStatus`
  // ('ongoing' | 'hired' | 'refused'). Tolerate the legacy `status` alias
  // in case any caller still emits it, but prefer the canonical one.
  const appStatus = application?.applicationStatus || application?.status;
  const isTerminal = appStatus === 'hired' || appStatus === 'refused';
  const canEdit = canRecruit && canActOnThis && !application?.archived && !isTerminal;
  // People fields stay editable on `refused` apps too — only `hired` locks
  // them, since changing the recruiter on a closed-loss record is a normal
  // attribution correction. Mirrors the user request 2026-05-10.
  const canEditPeople = canRecruit && canActOnThis && !application?.archived && appStatus !== 'hired';
  // View-only mode: caller has ATS access and the app loaded, but they're
  // not the assigned recruiter and not an admin. Surfaced as a pill so
  // they understand why action buttons are missing.
  const isViewOnly = !!(canRecruit && application && !canActOnThis);
  // "Assign to me": an application is claimable when it's in the
  // unassigned pool — no recruiter, or parked on the "HR Team" holding
  // account. Heuristic mirrors the backend (null OR HR-Team/default);
  // the backend is the source of truth and 403s anything not claimable.
  // Shown even when the caller can't otherwise act (that's the point —
  // it's how a recruiter picks up a careers lead under the team-scope RBAC).
  const isUnassignedApp = application
    && (!application.recruiterId || /^\s*HR\s*Team\s*$/i.test(application.recruiterName || ''));
  const canClaim = canRecruit && isUnassignedApp
    && !application?.archived && appStatus !== 'hired';

  // ── Fetch application ─────────────────────────────────────────────────
  // Race guard via monotonic seq — rapid stage moves trigger multiple
  // fetchApplication calls; without this, an out-of-order response can
  // overwrite fresh data with stale data. List pages use _requestKey
  // dedup; detail page did not until 2026-05-25 health-check F-P1-5.
  const fetchAppSeq = useRef(0);
  const fetchApplication = useCallback(async () => {
    if (!orgSlug || !applicationId) return;
    // ObjectId shape check — Express :applicationId catches segments like
    // "new" / "create" / typos and would otherwise 404 with a misleading
    // "Application not found" toast. Gate the fetch on a valid 24-char
    // hex shape; show NotFound directly without burning a request.
    if (!/^[a-f0-9]{24}$/i.test(applicationId)) { setLoading(false); return; }
    const mySeq = ++fetchAppSeq.current;
    setLoading(true);
    try {
      const res = await atsApi.getApplication(orgSlug, applicationId);
      if (mySeq !== fetchAppSeq.current) return;
      if (res.success) {
        // Merge enriched fields onto the doc so InlineField can read
        // them as plain properties.
        // Prefer API-enriched names, fall back to the doc's own
        // denormalized values. Importer writes accountOwnerName /
        // accountManagerName / submittedByName onto the application
        // doc; without the fallback those rows showed "—" whenever the
        // API enrichment couldn't resolve the FK (e.g. employee._id on
        // People fields that older code only looked up in portal_users).
        const a = res.application || {};
        const merged = {
          ...a,
          jobName: res.jobName || a.jobName,
          jobDepartment: res.jobDepartment || a.department,
          jobClient: res.jobClientName || null,
          stageName: res.stageName || a.stageName,
          recruiterName: res.recruiterName || a.recruiterName || null,
          accountOwnerName: res.accountOwnerName || a.accountOwnerName || null,
          accountManagerName: res.accountManagerName || a.accountManagerName || null,
          submittedByName: res.submittedByName || a.submittedByName || null,
          createdByName: res.createdByName || a.createdByName || null,
          updatedByName: res.updatedByName || a.updatedByName || null,
          // 2026-05-18 PM: server-computed write permission. Mirrors the
          // team-scope rule used by every write endpoint (admin → always,
          // team lead → recruiter on their team, member → only own).
          // Defaulting to false here would lock out everyone if the field
          // is missing; default to true (the legacy behavior) so a server
          // without the field falls back to client-side isMine + isAdmin.
          canWrite: typeof res.canWrite === 'boolean' ? res.canWrite : undefined,
          // 2026-05-28: candidate doc embeds AI-extracted fields (aiProfileSummary,
          // aiSkills, aiQualityScore, aiWorkHistory, etc). Stash for the
          // AiResumeInsights card.
          _candidate: res.candidate || null,
        };
        setApplication(merged);
      }
    } catch (err) {
      if (mySeq !== fetchAppSeq.current) return;
      if (handleScoped404(err)) return;
      console.error('Failed to load application:', err);
      showToast('Failed to load application', 'error');
    } finally {
      if (mySeq === fetchAppSeq.current) setLoading(false);
    }
  }, [orgSlug, applicationId, showToast, handleScoped404]);

  // 2026-05-28: manual AI re-score (admin-only). Synchronous call —
  // re-fetches the application afterwards to pull the refreshed candidate doc.
  const handleAiRescore = useCallback(async () => {
    if (!applicationId) return;
    setAiRescoring(true);
    try {
      const res = await atsApi.rescoreApplicationAi(orgSlug, applicationId);
      if (res?.success) {
        showToast('AI re-score complete', 'success');
        // Re-fetch to pick up updated candidate fields (summary, skills, etc).
        try {
          const fresh = await atsApi.getApplication(orgSlug, applicationId);
          if (fresh?.success) {
            setApplication((prev) => ({
              ...(prev || {}),
              ...(fresh.application || {}),
              _candidate: fresh.candidate || null,
            }));
          }
        } catch (_) { /* swallow */ }
      } else {
        showToast(res?.error || 'AI re-score failed', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'AI re-score failed', 'error');
    } finally {
      setAiRescoring(false);
    }
  }, [orgSlug, applicationId, showToast]);

  // ── Fetch dropdown data ───────────────────────────────────────────────
  const fetchDropdowns = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const [stagesRes, reasonsRes, recruitersRes] = await Promise.all([
        atsApi.listStages(orgSlug),
        atsApi.listConfig(orgSlug, 'refuse-reasons').catch(() => ({ success: true, items: [] })),
        atsApi.listRecruiters(orgSlug).catch(() => ({ success: true, recruiters: [] })),
      ]);
      if (stagesRes.success) setStages(stagesRes.stages || []);
      if (reasonsRes.success) setRefuseReasons(reasonsRes.items || reasonsRes.reasons || []);
      if (recruitersRes.success) setRecruiters(recruitersRes.recruiters || recruitersRes.users || []);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
  }, [orgSlug]);

  useEffect(() => { fetchApplication(); }, [fetchApplication]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  // 2026-06-26: once we know the job, refetch the JOB-RESOLVED pipeline so
  // the stage bar + interview rounds include this requirement's extra
  // rounds (L3, L4 …). fetchDropdowns' initial global fetch is just the
  // first paint; this replaces it with the job-specific list.
  const jobPositionId = application?.jobPositionId;
  useEffect(() => {
    if (!orgSlug || !jobPositionId) return undefined;
    let alive = true;
    atsApi.listStages(orgSlug, jobPositionId)
      .then((res) => { if (alive && res?.success) setStages(res.stages || []); })
      .catch(() => { /* keep global stages on failure */ });
    return () => { alive = false; };
  }, [orgSlug, jobPositionId]);

  // Interview rounds to render: technical rounds (l1, l2, l3 …) in pipeline
  // order, then HR. Derived from the resolved pipeline's roundKeys.
  const interviewRounds = useMemo(() => {
    const LEGACY_FEEDBACK = { l1: 'l1Feedback', l2: 'l2Feedback', hr: 'hrRoundFeedback' };
    const tech = (stages || [])
      .filter((s) => /^l\d+$/.test(s.roundKey || ''))
      .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0))
      .map((s) => ({
        level: s.roundKey,
        label: s.roundKey.toUpperCase(),
        isHr: false,
        feedbackField: LEGACY_FEEDBACK[s.roundKey] || `${s.roundKey}Feedback`,
      }));
    const hr = (stages || []).find((s) => s.roundKey === 'hr');
    if (hr) tech.push({ level: 'hr', label: 'HR', isHr: true, feedbackField: 'hrRoundFeedback' });
    return tech;
  }, [stages]);

  const recruiterOptions = useMemo(
    () => recruiters.map((r) => ({ value: r._id, label: r.name || r.email || r._id })),
    [recruiters]
  );

  // ── Generic per-field inline-save ────────────────────────────────────
  const saveField = async (field, value) => {
    let coerced = value;
    if (field === 'evaluation') {
      const n = Number(value);
      coerced = [0, 1, 2, 3].includes(n) ? n : 0;
    } else if (field === 'salaryExpected' || field === 'salaryProposed') {
      if (value === '' || value == null) {
        coerced = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Must be a positive number');
        coerced = n;
      }
    }
    const res = await atsApi.updateApplication(orgSlug, applicationId, { [field]: coerced });
    if (res?.application) {
      setApplication((prev) => ({ ...prev, ...res.application }));
    } else {
      setApplication((prev) => ({ ...prev, [field]: coerced }));
    }
  };

  // savePerson — atomic update of an id + denormalized name pair (e.g.
  // recruiterId + recruiterName). Mirrors AtsJobDetail.savePerson so the
  // EmployeeLookup picker behaves identically across detail pages.
  const savePerson = async (idField, nameField, id, name) => {
    try {
      const res = await atsApi.updateApplication(orgSlug, applicationId, {
        [idField]: id || null,
        [nameField]: name || '',
      });
      if (res?.application) {
        setApplication((prev) => ({ ...prev, ...res.application }));
      } else {
        setApplication((prev) => ({ ...prev, [idField]: id || null, [nameField]: name || '' }));
      }
    } catch (err) {
      showToast(err?.message || `Failed to update ${nameField.replace('Name', '')}`, 'error');
    }
  };

  // handleClaim — "Assign to me". Takes ownership of an application that's
  // sitting in the unassigned pool (no recruiter, or parked on the
  // HR-Team / careers-default account). Backend enforces eligibility and
  // wins/loses the race; we just refetch to refresh the (permission-
  // derived) UI once ownership flips to the caller.
  const handleClaim = async () => {
    try {
      setClaiming(true);
      const res = await atsApi.claimApplication(orgSlug, applicationId);
      if (res?.data) setApplication((prev) => ({ ...prev, ...res.data }));
      showToast('Application assigned to you');
      fetchApplication();
    } catch (err) {
      showToast(err?.message || 'Failed to claim application', 'error');
      // On a 409 (someone else just claimed) refresh to show the truth.
      fetchApplication();
    } finally {
      setClaiming(false);
    }
  };

  // ── Stage / refuse / hire / archive / delete actions ─────────────────
  const handleMoveStage = async (stageId, opts = {}) => {
    setShowMoveDropdown(false);
    try {
      setActionSaving(true);
      await atsApi.moveStage(orgSlug, applicationId, stageId, opts);
      showToast(opts.reason ? 'Stage moved back' : 'Stage updated');
      // Backward-reason flow finished — clear the pending state so a
      // fresh click on a different chip starts clean.
      if (pendingBackwardMove) setPendingBackwardMove(null);
      // Await the refetch before the finally re-enables the StageBar, otherwise
      // actionSaving clears while `application` still holds the old stage —
      // opening a window where a click re-fires the move against stale data.
      await fetchApplication();
    } catch (err) {
      // 2026-05-19: Rate Confirmation gate fires before every other check
      // on forward moves. Toast keyed to the specific code, then auto-open
      // the Send Rate Confirmation modal so the recruiter can act in one click.
      if (err?.requiresRateConfirmation) {
        const codeMessages = {
          RATE_CONFIRMATION_MISSING: 'Send a Rate Confirmation and wait for both parties to sign before moving forward.',
          RATE_CONFIRMATION_PENDING: 'Rate Confirmation is awaiting signatures — wait for both parties to sign before moving forward.',
          RATE_CONFIRMATION_DECLINED: 'The previous Rate Confirmation was declined. Send a new one and wait for both parties to sign.',
          RATE_CONFIRMATION_CANCELLED: 'The previous Rate Confirmation was cancelled. Send a new one and wait for both parties to sign.',
          RATE_CONFIRMATION_EXPIRED: 'The previous Rate Confirmation expired. Send a new one and wait for both parties to sign.',
        };
        showToast(codeMessages[err.code] || err.message || 'Rate Confirmation must be fully signed before moving forward.', 'warning');
        // Auto-open the modal for MISSING / DECLINED / CANCELLED / EXPIRED
        // (recruiter needs to act). For PENDING we just inform — the
        // envelope is already in flight, opening the modal would imply
        // they should re-send.
        if (err.code !== 'RATE_CONFIRMATION_PENDING') {
          setShowRateConfirmationModal(true);
        }
        return;
      }
      // Phase-1 / Q13: skip-ahead is rejected with the immediate next
      // stage's name so we can guide the user instead of showing a raw
      // error string.
      if (err?.requiresSequentialMove) {
        showToast(err.message || 'Stages must advance one at a time', 'warning');
        return;
      }
      // Phase-1 / Q13: backward moves need a reason for audit. Open
      // the modal, then retry with the captured reason.
      if (err?.requiresBackwardReason) {
        setPendingBackwardMove({
          stageId,
          fromStageName: err.currentStageName || '',
          toStageName: err.targetStageName || stages.find((s) => s._id === stageId)?.name || '',
        });
        return;
      }
      // Resume gate (memory ats_resume_gate_2026_05_22): forward move
      // requires isResume=true attachment on the candidate. Pre-load
      // the upload modal pointing at "Resume" so the recruiter has the
      // same targeted affordance as the per-stage attachment gate.
      if (err?.requiresResume || err?.code === 'RESUME_MISSING') {
        setPendingResumeMove({
          stageId,
          targetStageName: err.targetStageName || stages.find((s) => s._id === stageId)?.name || '',
        });
        return;
      }
      // Phase-1 / Q14+Q15: forward move blocked because the target
      // stage requires a document this application doesn't have.
      // Open the upload modal pre-loaded with the missing kind label,
      // then re-fire the move once the upload succeeds.
      if (err?.requiresAttachment && Array.isArray(err.missingAttachments) && err.missingAttachments.length > 0) {
        setPendingAttachmentMove({
          stageId,
          targetStageName: err.targetStageName || stages.find((s) => s._id === stageId)?.name || '',
          missingAttachment: err.missingAttachments[0],
        });
        return;
      }
      // Phase-1 / Q26: forward move blocked because the target stage
      // (L1 / L2 / HR) needs an interview slot. Open the schedule
      // modal pre-filled with whatever the API echoed back.
      if (err?.requiresInterview && err.interviewLevel) {
        setPendingInterviewMove({
          stageId,
          targetStageName: err.targetStageName || stages.find((s) => s._id === stageId)?.name || '',
          level: err.interviewLevel,
          existingSlot: err.existingSlot || null,
          // 2026-05-11: client roles drop interviewer + meeting link
          // requirements (client schedules with consultant directly).
          isClientRole: err.isClientRole === true,
        });
        return;
      }
      // Phase-1 / Q28+Q29+Q30: forward move out of an interview stage
      // blocked because the previous round's result is missing / Hold /
      // Reject. Q29-B: Reject doesn't open the result modal — we
      // surface a confirm-toast pointing at the Refuse button instead.
      // Q30-A: Hold opens the result modal pre-filled so the recruiter
      // can flip the call. Missing opens the result modal blank.
      if (err?.requiresInterviewResult && err.interviewLevel) {
        const levelLabel = err.interviewLevel.toUpperCase();
        if (err.suggestRefuse) {
          showToast(`${levelLabel} result is "Reject" — click Refuse (top right) to terminate this application.`, 'warning');
          return;
        }
        setPendingResultMove({
          stageId,
          targetStageName: err.targetStageName || stages.find((s) => s._id === stageId)?.name || '',
          level: err.interviewLevel,
          existingResult: err.existingResult || null,
          isHoldChange: err.onHold === true,
        });
        return;
      }
      // 2026-05-13: stage chips navigate the pipeline; offer creation is
      // a structured side-effect action that belongs on the dedicated
      // header Offer button — same convention as Hire (below). Was:
      // auto-opening the HireModal in 'offer' mode mid-stage-move,
      // which trained recruiters to expect side-effect modals on stage
      // clicks and made "Save and continue" on the HR result modal
      // cascade unexpectedly into an offer popup.
      if (err?.requiresOffer) {
        // 2026-05-18 PM: L1 gate now accepts the inline Salary Proposed
        // field in the Compensation section (no modal needed). Offer
        // Proposal + Hire gates still require structured offer.offeredCTC,
        // captured via the admin Offer button.
        const msg = err.offerLevel === 'salary'
          ? 'Please fill the Salary Proposed field in the Compensation section below before moving to this stage.'
          : 'Click "Capture Offer" (top right) to capture the offer details first.';
        showToast(msg, 'warning');
        return;
      }
      if (err?.requiresHire) {
        showToast('Click the Hire button (top right) to capture offer details and mark as hired.', 'warning');
        return;
      }
      // 2026-05-20: Documents Collection gate — forward moves out of
      // Documents Collection require every snapshotted required document
      // to be marked received. Toast names the pending items and scrolls
      // to the checklist card.
      if (err?.requiresDocuments && Array.isArray(err.pending)) {
        const list = err.pending.length > 3
          ? `${err.pending.slice(0, 3).join(', ')} + ${err.pending.length - 3} more`
          : err.pending.join(', ');
        showToast(`Documents pending: ${list}. Mark them received in the Documents Checklist below.`, 'warning');
        setTimeout(() => {
          document.getElementById('documents-checklist-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return;
      }
      showToast(err.message || 'Failed to move stage', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // 2026-05-20: optimistic-update helper for the Documents Checklist.
  // Avoids the jarring full-record refetch every time a recruiter ticks
  // a row — the only thing that changed is the local row state.
  const patchLocalDoc = (name, patch) => {
    setApplication((prev) => {
      if (!prev || !Array.isArray(prev.requiredDocuments)) return prev;
      return {
        ...prev,
        requiredDocuments: prev.requiredDocuments.map((d) =>
          d.name === name ? { ...d, ...patch } : d
        ),
      };
    });
  };

  const handleMarkDocumentReceived = async (name, received, attachmentId = null) => {
    // Optimistic patch — flip the row immediately. On failure, refetch
    // to bring the UI back in sync with the server.
    const stamp = new Date().toISOString();
    patchLocalDoc(name, {
      receivedAt: received ? stamp : null,
      receivedBy: received ? (authUser?._id || null) : null,
      receivedByName: received ? (authUser?.name || authUser?.email || 'You') : null,
      attachmentId: received ? (attachmentId || null) : null,
    });
    try {
      const res = await atsApi.markDocumentReceived(orgSlug, applicationId, name, received, attachmentId);
      if (!res?.success) {
        showToast(res?.error || 'Failed to update document', 'error');
        fetchApplication();
      }
    } catch (err) {
      showToast(err?.message || 'Failed to update document', 'error');
      fetchApplication();
    }
  };

  // 2026-05-20: inline upload from the Documents Checklist row.
  // Uploads via the regular ats_attachments endpoint, then links the
  // attachment id onto the checklist row and marks received in one shot.
  // The file also shows up in the Attachments section since it's a
  // normal attachment record.
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const handleUploadDocument = async (name, file) => {
    if (!file) return;
    // FE mirror of the server's 10 MB multer cap — fail fast with a
    // friendly message instead of a 413 after the full upload attempt.
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name} exceeds the 10 MB upload limit`, 'error');
      return;
    }
    try {
      setUploadingDoc(name);
      const up = await atsApi.uploadAttachment(orgSlug, applicationId, file);
      const att = up?.attachment || up?.data || null;
      const attachmentId = att?._id;
      if (!up?.success || !attachmentId) {
        showToast(up?.error || 'Upload failed', 'error');
        return;
      }
      const linked = await atsApi.markDocumentReceived(orgSlug, applicationId, name, true, attachmentId);
      if (linked?.success) {
        showToast(`Uploaded: ${name}`);
        patchLocalDoc(name, {
          receivedAt: new Date().toISOString(),
          receivedBy: authUser?._id || null,
          receivedByName: authUser?.name || authUser?.email || 'You',
          attachmentId,
          attachment: { fileName: att.fileName, mimeType: att.mimeType, url: att.url },
        });
      } else {
        showToast(linked?.error || 'Linked upload but failed to mark received', 'warning');
        fetchApplication();
      }
    } catch (err) {
      showToast(err?.message || 'Upload failed', 'error');
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleRemoveDocumentFile = async (name, attachmentId) => {
    if (!attachmentId) return;
    // Optimistic clear.
    patchLocalDoc(name, {
      receivedAt: null,
      receivedBy: null,
      receivedByName: null,
      attachmentId: null,
    });
    try {
      // Best-effort: delete the underlying file too. If the user already
      // removed it via the Attachments section the delete fails benignly
      // — we still clear the link on the checklist row.
      await atsApi.deleteAttachment(orgSlug, attachmentId).catch(() => null);
      const res = await atsApi.markDocumentReceived(orgSlug, applicationId, name, false, null);
      if (!res?.success) {
        showToast(res?.error || 'Failed to remove document', 'error');
        fetchApplication();
      }
    } catch (err) {
      showToast(err?.message || 'Failed to remove document', 'error');
      fetchApplication();
    }
  };

  const handleBypassDocumentsGate = async (reason) => {
    try {
      setActionSaving(true);
      const res = await atsApi.bypassDocumentsGate(orgSlug, applicationId, reason);
      if (res?.success) {
        showToast('Documents gate bypassed — forward moves unblocked.');
        setShowDocumentsBypassDialog(false);
        fetchApplication();
      } else {
        showToast(res?.error || 'Failed to bypass gate', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to bypass gate', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  const handleRefuse = async ({ refuseReasonId, sendEmail }) => {
    try {
      setActionSaving(true);
      await atsApi.refuseApplication(orgSlug, applicationId, { refuseReasonId, sendEmail });
      showToast(sendEmail ? 'Application refused — rejection email sent' : 'Application refused');
      setShowRefuseModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to refuse application', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // P0.1+P0.2 (2026-05-10): single submit handler for the HireModal,
  // which operates in two modes. editOfferOnly (the header "Offer"
  // button) saves via /offer and closes. Otherwise it's the Hire flow
  // — call /hire as before.
  const handleHire = async (payload) => {
    const isOfferOnly = editOfferOnly;
    try {
      setActionSaving(true);
      if (isOfferOnly) {
        const res = await atsApi.updateOffer(orgSlug, applicationId, payload);
        const warns = Array.isArray(res?.warnings) ? res.warnings : [];
        if (warns.includes('signed_offer_missing')) {
          showToast('Offer details saved — signed offer still missing.', 'warning');
        } else {
          showToast('Offer details saved');
        }
        setEditOfferOnly(false);
        setShowHireModal(false);
        // Q24+race-fix (2026-05-10): await the refetch so React state is
        // current before the user's next click. Without this, clicking
        // a subsequent stage chip immediately would open the next gate
        // modal against the stale offer subdoc and the salary the user
        // just typed wouldn't pre-fill.
        await fetchApplication();
        return;
      }

      const res = await atsApi.hireApplication(orgSlug, applicationId, payload);
      const warns = Array.isArray(res?.warnings) ? res.warnings : [];
      if (warns.includes('signed_offer_missing')) {
        showToast('Hired — remember to attach the signed offer.', 'warning');
      } else {
        showToast('Candidate hired!');
      }
      setShowHireModal(false);
      fetchApplication();
    } catch (err) {
      const fields = err?.fieldErrors;
      const verb = isOfferOnly ? 'save offer' : 'hire candidate';
      if (fields && typeof fields === 'object') {
        const first = Object.entries(fields)[0];
        if (first) showToast(`${first[0]}: ${first[1]}`, 'error');
        else showToast(err.message || `Failed to ${verb}`, 'error');
      } else {
        showToast(err.message || `Failed to ${verb}`, 'error');
      }
    } finally {
      setActionSaving(false);
    }
  };

  // Phase-1 / Q14+Q15 (2026-05-10): upload the missing required
  // attachment and re-fire the original stage transition. The upload
  // tags the file with the kind slug from missingAttachment so the
  // re-fire passes the gate.
  const handleAttachmentUpload = async (file) => {
    if (!pendingAttachmentMove) return;
    const { stageId, missingAttachment } = pendingAttachmentMove;
    try {
      setActionSaving(true);
      await atsApi.uploadAttachment(orgSlug, applicationId, file, false, missingAttachment.slug);
      showToast(`${missingAttachment.label} uploaded`);
      setPendingAttachmentMove(null);
      // 2026-05-12: route the retry through handleMoveStage so the
      // next gate failure (e.g. requiresInterview) opens its modal
      // automatically. handleMoveStage handles its own errors.
      await handleMoveStage(stageId);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // Resume gate retry — uploads with isResume=true (no kind slug) so the
  // gate at /stage clears, then re-fires the original move.
  const handleResumeUpload = async (file) => {
    if (!pendingResumeMove) return;
    const { stageId } = pendingResumeMove;
    try {
      setActionSaving(true);
      await atsApi.uploadAttachment(orgSlug, applicationId, file, true);
      showToast('Resume uploaded');
      setPendingResumeMove(null);
      await handleMoveStage(stageId);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // Phase-1 / Q26 (2026-05-11): save the interview slot via /interview
  // and re-fire the original stage move. Same chained-action pattern
  // as the offer/attachment gates: clear the pending state, retry
  // the transition; if a different gate now trips, the existing
  // handleMoveStage error-routing catches it and opens the right
  // modal next.
  // Q4-D entry points (2026-05-12): callers from the InterviewRoundCard's
  // Schedule / Reschedule button. Reuse pendingInterviewMove with
  // stageId:null so the handler below skips the post-save stage retry.
  const openInterviewScheduleModal = (level, existingSlot, isClientRole) => {
    setPendingInterviewMove({
      stageId: null,
      level,
      targetStageName: '',
      existingSlot: existingSlot || null,
      isClientRole: !!isClientRole,
    });
  };
  const openInterviewResultModal = (level, existingResult) => {
    setPendingResultMove({
      stageId: null,
      level,
      targetStageName: '',
      existingResult: existingResult || null,
      isHoldChange: existingResult?.recommendation === 'Awaited',
    });
  };

  const handleScheduleInterview = async (slot) => {
    if (!pendingInterviewMove) return;
    const { stageId, level } = pendingInterviewMove;
    try {
      setActionSaving(true);
      await atsApi.scheduleInterview(orgSlug, applicationId, { level, slot });
      showToast(`${INTERVIEW_LEVEL_LABEL[level] || 'Interview'} scheduled`);
      setPendingInterviewMove(null);
      // Only re-fire the stage move when this modal was opened by a
      // gate (stageId present). The standalone "Schedule" / "Reschedule"
      // entry points from InterviewRoundCard pass stageId:null and just
      // want the slot saved without advancing the pipeline.
      if (stageId) {
        // 2026-05-12: route through handleMoveStage so the next gate
        // failure (e.g. requiresOffer at L1) opens its modal automatically.
        await handleMoveStage(stageId);
      }
      await fetchApplication();
    } catch (err) {
      const fields = err?.fieldErrors;
      if (fields && typeof fields === 'object') {
        const first = Object.entries(fields)[0];
        if (first) showToast(`${first[0]}: ${first[1]}`, 'error');
        else showToast(err.message || 'Failed to schedule interview', 'error');
      } else {
        showToast(err.message || 'Failed to schedule interview', 'error');
      }
    } finally {
      setActionSaving(false);
    }
  };

  // Phase-1 / Q28+Q30 (2026-05-11): save the interview result via
  // /interview-result, then re-fire the original stage move. If the
  // user picked Reject, we save the result but DON'T re-fire the
  // move (Q29-B says Reject means the candidate should be Refused,
  // not advanced) — we surface the same Refuse-prompt toast as the
  // gate's `suggestRefuse` branch.
  const handleCaptureResult = async (resultPayload) => {
    if (!pendingResultMove) return;
    const { stageId, level } = pendingResultMove;
    try {
      setActionSaving(true);
      await atsApi.captureInterviewResult(orgSlug, applicationId, { level, result: resultPayload });
      const levelLabel = (level || '').toUpperCase();
      showToast(`${levelLabel} result saved`);
      setPendingResultMove(null);
      if (resultPayload.recommendation === 'Reject') {
        // Q29-B: don't advance. Tell the recruiter to Refuse.
        showToast(`${levelLabel} result is "Reject" — click Refuse (top right) to terminate this application.`, 'warning');
        await fetchApplication();
        return;
      }
      // Q4-D (2026-05-12): standalone result-capture from InterviewRoundCard
      // passes stageId:null. Skip the stage retry — the recruiter just
      // wants the result saved.
      if (stageId) {
        // 2026-05-12: route through handleMoveStage so the next gate
        // failure (e.g. requiresInterview for the round being entered)
        // opens its modal automatically. Q30-A behavior is preserved:
        // if the user kept Hold (didn't flip to Proceed), the result
        // gate fires again and re-opens the result modal.
        await handleMoveStage(stageId);
      }
      await fetchApplication();
    } catch (err) {
      const fields = err?.fieldErrors;
      if (fields && typeof fields === 'object') {
        const first = Object.entries(fields)[0];
        if (first) showToast(`${first[0]}: ${first[1]}`, 'error');
        else showToast(err.message || 'Failed to save result', 'error');
      } else {
        showToast(err.message || 'Failed to save result', 'error');
      }
    } finally {
      setActionSaving(false);
    }
  };

  const handleArchiveApp = async () => {
    setArchiving(true);
    try {
      await atsApi.archiveApplication(orgSlug, applicationId);
      setApplication((a) => ({ ...a, archived: true }));
      showToast('Archived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to archive application', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchiveApp = async () => {
    try {
      await atsApi.unarchiveApplication(orgSlug, applicationId);
      setApplication((a) => ({ ...a, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive application', 'error');
    }
  };

  // Restore a refused application via the styled ReasonPromptDialog
  // instead of the browser's native confirm/prompt chain. The
  // ats_refused rejection email was already sent at refuse time —
  // restoring does NOT recall it, which is why the dialog body is
  // explicit about reaching out separately.
  const [showUnrefuseDialog, setShowUnrefuseDialog] = useState(false);
  const [unrefuseSaving, setUnrefuseSaving] = useState(false);
  const handleUnrefuseConfirm = async (reason) => {
    setUnrefuseSaving(true);
    try {
      await atsApi.unrefuseApplication(orgSlug, applicationId, reason);
      showToast('Application restored', 'success');
      setShowUnrefuseDialog(false);
      await fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to restore application', 'error');
    } finally {
      setUnrefuseSaving(false);
    }
  };

  const handleDeleteApp = async () => {
    setDeleting(true);
    try {
      await atsApi.deleteApplication(orgSlug, applicationId);
      showToast('Application deleted', 'success');
      navigate(orgPath('/ats/applications'));
    } catch (err) {
      setDeleting(false);
      showToast(err.message || 'Failed to delete application', 'error');
    }
  };

  // 2026-05-27 — confirm the RC gate bypass. Server enforces ≥10 chars
  // and org-admin, but we mirror both so the button stays accurate.
  const handleBypassRcGate = async () => {
    const reason = rcBypassReason.trim();
    if (reason.length < 10) return;
    setRcBypassSaving(true);
    try {
      await atsApi.bypassRateConfirmationGate(orgSlug, applicationId, reason);
      showToast('Rate Confirmation gate bypassed', 'success');
      setShowRcBypassModal(false);
      setRcBypassReason('');
      // Also close the RC modal if the user opened bypass from inside it.
      setShowRateConfirmationModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to bypass Rate Confirmation gate', 'error');
    } finally {
      setRcBypassSaving(false);
    }
  };
  const handleRevokeRcBypass = async () => {
    try {
      await atsApi.revokeRateConfirmationBypass(orgSlug, applicationId);
      showToast('Bypass revoked', 'success');
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to revoke bypass', 'error');
    }
  };

  const handleCreateEmployeeConfirm = async (payload) => {
    try {
      setCreatingEmployee(true);
      const res = await atsApi.createEmployeeFromApplication(orgSlug, applicationId, payload);
      if (res.success) {
        showToast(res.existing ? 'Linked to existing employee' : `Employee "${res.employeeName}" created!`);
        setShowCreateEmpDrawer(false);
        fetchApplication();
      }
    } catch (err) {
      const fields = err?.fieldErrors;
      if (fields && typeof fields === 'object') {
        const first = Object.entries(fields)[0];
        if (first) showToast(`${first[0]}: ${first[1]}`, 'error');
        else showToast(err.message || 'Failed to create employee', 'error');
      } else {
        showToast(err.message || 'Failed to create employee', 'error');
      }
    } finally {
      setCreatingEmployee(false);
    }
  };

  const handleToggleKanban = async () => {
    const current = application?.kanbanState || 'normal';
    const nextIdx = (KANBAN_STATES.indexOf(current) + 1) % KANBAN_STATES.length;
    const next = KANBAN_STATES[nextIdx];
    try {
      await atsApi.updateApplication(orgSlug, applicationId, { kanbanState: next });
      showToast(`Kanban state: ${KANBAN_LABELS[next]}`);
      setApplication((a) => ({ ...a, kanbanState: next }));
    } catch (err) {
      showToast(err.message || 'Failed to update kanban state', 'error');
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const formatDate = (dateStr) => formatDateUTC(dateStr) || '—';

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="p-3 sm:p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20">
          <h3 className="text-lg font-semibold text-white mb-2">Application not found</h3>
          <p className="text-dark-400 text-sm">The application may have been deleted or you don't have access.</p>
        </div>
      </div>
    );
  }

  const currentStageId = application.stageId?._id || application.stageId;
  // Resolve via stageId first; stageName is a stale denorm cache (memory
  // feedback_stage_name_stale, measured 39/2789 drift on 2026-05-20).
  const currentStageName = stages.find((s) => s._id === currentStageId)?.name
    || application.stageName
    || application.stageId?.name
    || 'Unknown';
  // 2026-05-18 PM: the Capture Offer / Offer button appears from the
  // Offer Proposal stage onwards. Match by sequence so renamed stages still
  // gate correctly — find the earliest Offer Proposal stage in the org's
  // configured stages and compare the current stage's sequence against it.
  // 2026-05-25 regression fix: the backend gate requires offer captured
  // BEFORE moving INTO Offer Proposal (requiresOffer fires on the
  // forward move attempt from HR Discussion / the prior stage). The
  // previous strict `>=` left the user trapped: they couldn't move
  // forward AND couldn't capture the offer because the button was hidden.
  // Lower the threshold by 1 so the button is reachable from the stage
  // immediately before Offer Proposal (typically HR Discussion).
  const OFFER_PROPOSAL_NAMES = new Set(['offer proposal', 'offer extended', 'offer rolled out', 'offer']);
  const offerProposalStage = stages.find((s) => OFFER_PROPOSAL_NAMES.has((s.name || '').toLowerCase().trim()));
  const currentStage = stages.find((s) => s._id === currentStageId);
  const isAtOrPastOfferProposal = !!(offerProposalStage && currentStage
    && Number(currentStage.sequence ?? 0) >= Number((offerProposalStage.sequence ?? Infinity) - 1));

  // 2026-05-20 Documents Collection gate — show the checklist card on/after
  // entry to Documents Collection (recruiter needs to track receipt and
  // gate the next forward move). Match by sequence so renamed stages still
  // trigger correctly — same convention as the Offer Proposal block above.
  const DOCS_COLLECTION_NAMES = new Set(['documents collection', 'document collection', 'documents']);
  const docsCollectionStage = stages.find((s) => DOCS_COLLECTION_NAMES.has((s.name || '').toLowerCase().trim()));
  const isAtOrPastDocsCollection = !!(docsCollectionStage && currentStage
    && Number(currentStage.sequence ?? 0) >= Number(docsCollectionStage.sequence ?? Infinity));
  const isAtDocsCollection = !!(docsCollectionStage && currentStage
    && Number(currentStage.sequence ?? 0) === Number(docsCollectionStage.sequence ?? -1));
  const requiredDocs = Array.isArray(application.requiredDocuments) ? application.requiredDocuments : [];
  // "Required" defaults to true for legacy snapshots that pre-date the
  // flag (rows snapshotted before 2026-05-20) — only explicit false makes
  // an item optional. Count + gate status are scoped to required items.
  const requiredOnly = requiredDocs.filter((d) => d.required !== false);
  // A required item only counts as received when a file is attached —
  // mirrors the server-side gate (collectStageGates 'documents' kind).
  const receivedCount = requiredOnly.filter((d) => d.receivedAt && d.attachmentId).length;
  const docsGateBypassed = !!application.documentsGate?.bypassedAt;

  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-6">
      {/* Back nav — recruiters landing here from email/list have no other escape hatch */}
      <button
        onClick={() => navigate(orgPath('/ats/applications'))}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Applications
      </button>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">
              {application.candidateName || 'Unnamed Candidate'}
            </h1>
            {application.archived && (
              <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                <Archive size={11} /> ARCHIVED
              </span>
            )}
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              appStatus === 'hired'
                ? 'bg-emerald-500/10 text-emerald-400'
                : appStatus === 'refused'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-rivvra-500/10 text-rivvra-400'
            }`}>
              {appStatus === 'hired' ? 'Hired' : appStatus === 'refused' ? 'Refused' : currentStageName}
            </span>
            <KanbanDot
              state={application.kanbanState || 'normal'}
              onClick={canEdit ? handleToggleKanban : undefined}
            />
            {isViewOnly && (
              <span
                className="text-xs bg-amber-500/10 text-amber-300 rounded-full px-2 py-0.5 border border-amber-500/30 flex items-center gap-1"
                title="You can view this application but only the assigned recruiter or an admin can edit it."
              >
                View only
              </span>
            )}
          </div>
          <p className="text-dark-400 text-sm">
            {application.jobName || application.jobId?.name || 'No position assigned'}
          </p>
        </div>

        {/* Action buttons */}
        {/* 2026-05-18 RBAC two-tier: recruiters get the daily action bar
            (move stage, refuse, hire, archive). Admin-only buttons (Offer,
            Unarchive, Create Employee, Delete kebab) are gated individually
            inside. 2026-05-18 PM: with read-all opened up, the action bar
            is hidden entirely for non-owners — they see View Only pill instead. */}
        {canRecruit && canActOnThis && (
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <>
                <MoveStageDropdown
                  stages={stages}
                  currentStageId={currentStageId}
                  isOpen={showMoveDropdown}
                  onToggle={() => setShowMoveDropdown((p) => !p)}
                  onSelect={handleMoveStage}
                  disabled={actionSaving}
                />
                {/* 2026-05-19: Send Rate Confirmation — required on every
                    employment type now that forward stage moves are gated on
                    a fully-signed envelope. Picks a Sign template tagged
                    "Rate Confirmation"; signers are auto-set from the
                    template's roles. Re-send is allowed; the application
                    records only the most recent envelope reference. */}
                {!application?.archived && (
                  <button
                    onClick={() => setShowRateConfirmationModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
                    title={application?.rateConfirmation?.envelopeId
                      ? 'Re-send the Rate & Terms Confirmation envelope to the candidate'
                      : 'Send the Rate & Terms Confirmation envelope to the candidate for signature'}
                  >
                    <FileSignature size={14} />
                    {application?.rateConfirmation?.envelopeId ? 'Re-send Rate Confirmation' : 'Send Rate Confirmation'}
                  </button>
                )}
                {/* 2026-05-22: Rate Confirmation auto-reuse badge. When the
                    server links a previously-signed envelope (same client +
                    30-day window), surface it inline so the recruiter
                    knows the candidate wasn't asked to sign again. Chip
                    links directly to the signed envelope detail page so
                    the recruiter can view / download the PDF. */}
                {application?.rateConfirmation?.reusedFromApplicationId && application?.rateConfirmation?.envelopeId && (
                  <Link
                    to={orgPath(`/sign/requests/${application.rateConfirmation.envelopeId}`)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                    title={`View the signed Rate Confirmation${application.rateConfirmation.reusedFromJobName ? ` (reused from ${application.rateConfirmation.reusedFromJobName})` : ''}${application.rateConfirmation.signedAt ? ` — signed ${formatEventDateTime(application.rateConfirmation.signedAt)}` : ''}`}
                  >
                    <Check size={12} />
                    View reused Rate Confirmation
                  </Link>
                )}
                {/* 2026-05-27 — admin RC-gate bypass badge. Shows who lifted
                    the gate and why; admins get an inline Revoke. Auto-
                    clears server-side once a signed RC is attached, so
                    this stops rendering on the next refetch. */}
                {application?.rateConfirmationGate?.bypassedAt && (
                  <span
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-300"
                    title={`Bypassed by ${application.rateConfirmationGate.bypassedByName || 'admin'} on ${formatEventDateTime(application.rateConfirmationGate.bypassedAt)} — ${application.rateConfirmationGate.reason}`}
                  >
                    <ShieldOff size={12} />
                    RC gate bypassed
                    {canBypassRcGate && (
                      <button
                        type="button"
                        onClick={handleRevokeRcBypass}
                        className="ml-1 text-amber-200 underline hover:text-white"
                      >
                        Revoke
                      </button>
                    )}
                  </span>
                )}
                {/* Offer button — 2026-05-25 role-model widening: opened
                    to atsAccess (recruiters owning the app) so the
                    person negotiating the offer can capture it without
                    pinging an admin. Backend PATCH /offer enforces
                    team-scope so a member can only edit offers on
                    their own apps. Visible from one stage before Offer
                    Proposal onwards. Label flips between "Capture
                    Offer" (no offer subdoc yet) and "Offer" (edit
                    existing). Hire stays admin-only. */}
                {canEdit && isAtOrPastOfferProposal && (
                  <button
                    onClick={() => { setEditOfferOnly(true); setShowHireModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
                    title={application?.offer?.offeredCTC
                      ? 'View, edit, or revise the captured offer'
                      : 'Capture offer details (joining date, notice, probation, etc.)'}
                  >
                    <FileSignature size={14} />
                    {application?.offer?.offeredCTC ? 'Offer' : 'Capture Offer'}
                  </button>
                )}
                <button
                  onClick={() => setShowRefuseModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                >
                  <XCircle size={14} /> Refuse
                </button>
                <button
                  onClick={() => setShowHireModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                >
                  <Award size={14} /> Hire
                </button>
              </>
            )}
            {/* 2026-05-25: gate by Employee app access, not ATS admin.
                The backend POST /:id/create-employee is atsAccess, but
                the resulting employee record lives in the Employee app
                — a recruiter without Employee access can technically
                create the record yet can't view/edit it after, which
                is a dead-end UX. Require hasAppAccess('employee') so
                only users who can actually use the resulting record
                see the button. Also keep the team-scope + non-archived
                checks so a recruiter can only create from their own
                app, and skip the !isTerminal check because Create
                Employee operates on hired (terminal) apps by design. */}
            {hasAppAccess('employee') && canActOnThis && !application?.archived && application.hireDate && !application.employeeId && (
              <button
                onClick={() => setShowCreateEmpDrawer(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
              >
                <UserPlus size={14} />
                Create Employee
              </button>
            )}
            {application.employeeId && (
              <button
                onClick={() => navigate(withFromContext(`/org/${orgSlug}/employee/${application.employeeId}`, 'ats_application', applicationId))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
              >
                <ExternalLink size={14} /> Employee
              </button>
            )}
            {(application.applicationStatus === 'refused' || application.refused) && !application.archived && (
              <button
                onClick={() => setShowUnrefuseDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                title="Restore this refused application back to ongoing"
              >
                <ArchiveRestore size={14} /> Restore
              </button>
            )}
            {application.archived ? (
              isAdmin && (
                <button
                  onClick={handleUnarchiveApp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                >
                  <ArchiveRestore size={14} /> Unarchive
                </button>
              )
            ) : (() => {
              // 2026-05-23: mirror backend APPLICATION_NOT_TERMINAL gate.
              // Non-admins can only archive applications that have reached
              // a terminal outcome (refused or hired); active rows require
              // an org admin. Button stays visible (so admins can act) but
              // is disabled with explanatory title for blocked recruiters.
              const isTerminal = !!application.refused || !!application.hireDate;
              const archiveBlocked = !isAdmin && !isTerminal;
              return (
                <button
                  onClick={handleArchiveApp}
                  disabled={archiving || archiveBlocked}
                  title={archiveBlocked ? 'Only an org admin can archive an active application. Refuse it first, or ask an admin.' : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all text-dark-300 border-transparent hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-dark-300 disabled:hover:bg-transparent disabled:hover:border-transparent"
                >
                  {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                  Archive
                </button>
              );
            })()}
            {/* 2026-05-17 health-check E.2: only render the kebab when
                there's at least one action inside. Non-admins used to see
                an empty menu with "No admin actions available" italic
                placeholder — pure noise. Now it's hidden entirely. */}
            {isOrgAdmin && (
              <div className="relative">
                <button
                  onClick={() => setShowKebab((o) => !o)}
                  className="p-1.5 text-dark-500 hover:text-dark-300 rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-rivvra-500/40"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={16} />
                </button>
                {showKebab && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowKebab(false)} />
                    <div className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-1.5rem)] bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1">
                      {/* 2026-05-27 — admin escape hatch for the Rate Confirmation
                          gate. Hidden once a bypass is already in place
                          (the revoke link sits on the chip instead). */}
                      {canBypassRcGate && !application?.rateConfirmationGate?.bypassedAt && !application?.archived && (
                        <button
                          onClick={() => { setShowKebab(false); setRcBypassReason(''); setShowRcBypassModal(true); }}
                          className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 flex items-center gap-2"
                        >
                          <ShieldOff size={12} />
                          <div className="flex-1">
                            <div className="font-medium">Bypass Rate Confirmation gate</div>
                            <div className="text-[10px] text-dark-500 mt-0.5">Lift the signed-RC requirement on this application.</div>
                          </div>
                        </button>
                      )}
                      <button
                        onClick={() => { setShowKebab(false); setShowDeleteModal(true); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 size={12} />
                        <div className="flex-1">
                          <div className="font-medium">Delete permanently</div>
                          <div className="text-[10px] text-dark-500 mt-0.5">Cannot be recovered. Use Archive instead.</div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2026-05-27 — Bypass Rate Confirmation gate (admin only). Reason
          is required (≥10 chars) and stored on rateConfirmationGate for
          audit. Server re-validates both. */}
      {showRcBypassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-1 flex items-center gap-2">
              <ShieldOff size={14} className="text-amber-300" />
              Bypass Rate Confirmation gate
            </h2>
            <p className="text-xs text-dark-400 mb-3">
              The signed-RC requirement will be lifted for <span className="text-dark-200 font-medium">{application.candidateName || 'this application'}</span>. The bypass will be cleared automatically once a signed Rate Confirmation is attached.
            </p>
            <label className="block text-xs text-dark-400 mb-1">Reason (min 10 chars)</label>
            <textarea
              value={rcBypassReason}
              onChange={(e) => setRcBypassReason(e.target.value)}
              rows={3}
              autoFocus
              className="w-full px-3 py-2 text-xs bg-dark-900 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 mb-4"
              placeholder="Why is this gate being bypassed?"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRcBypassModal(false); setRcBypassReason(''); }}
                disabled={rcBypassSaving}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBypassRcGate}
                disabled={rcBypassSaving || rcBypassReason.trim().length < 10}
                className="flex-1 px-3 py-2 text-xs text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {rcBypassSaving ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                Confirm bypass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete Application</h2>
            <p className="text-xs text-dark-400 mb-1">
              Permanently delete this application for <span className="text-dark-200 font-medium">{application.candidateName}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">
              All attachments (résumé, documents) and activity history will also be deleted. Cannot be recovered.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">Cancel</button>
              <button onClick={handleDeleteApp} disabled={deleting} className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Progression Bar (in-pipeline only) */}
      {stages.length > 0 && !isTerminal && (
        <DsStageBar
          stages={stages.map((s) => ({ id: s._id, label: s.name }))}
          value={currentStageId}
          // The current chip stays inert and moves are blocked while one is
          // in flight — clicking the current stage re-fired a no-op /stage
          // call, and double-clicks queued duplicate moves.
          interactive={canEdit && !actionSaving}
          onSelect={(id) => { if (id !== currentStageId) handleMoveStage(id); }}
        />
      )}

      {/* Body: main + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <Panel title="Candidate" icon={<User size={14} />}>
            <InlineField label="Name" field="candidateName" value={application.candidateName} editable={canEdit} onSave={saveField} required />
            <InlineField
              label="Email"
              field="email"
              value={application.email}
              type="email"
              editable={canEdit}
              onSave={saveField}
              placeholder="Add email"
              // Q5-B (2026-05-12): if the most recent email to this address
              // failed, surface a red ⚠ inline so the recruiter notices
              // before wondering why the candidate hasn't replied. The
              // server only embeds this when status === 'sent' or 'failed'
              // and sentAt is within the last 30 days, so the chip is
              // self-clearing on a fresh successful send.
              displayValue={application.email
                ? (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{application.email}</span>
                    {application.lastCandidateEmail?.status === 'failed' && (
                      <span
                        title={`Last email failed${application.lastCandidateEmail.error ? ' — ' + application.lastCandidateEmail.error : ''} (${new Date(application.lastCandidateEmail.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })})`}
                        className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 flex-shrink-0"
                      >
                        <AlertCircle size={10} /> bounce
                      </span>
                    )}
                  </span>
                )
                : undefined}
            />
            <InlineField label="Phone" field="phone" value={application.phone} type="phone" editable={canEdit} onSave={saveField} placeholder="Add phone" />
            <InlineField label="LinkedIn" field="linkedinProfile" value={application.linkedinProfile} type="url" editable={canEdit} onSave={saveField} placeholder="LinkedIn URL" />
            <InlineField
              label="Evaluation"
              field="evaluation"
              value={application.evaluation ?? 0}
              type="select"
              options={EVAL_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={application.evaluation > 0
                ? <span className="text-amber-400">{'★'.repeat(Math.max(0, Math.min(3, Number(application.evaluation) || 0)))}</span>
                : undefined}
            />
            {application.candidateId && (
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 py-2">
                <span className="text-dark-400 text-sm">Profile</span>
                <Link
                  to={withFromContext(orgPath(`/ats/candidates/${application.candidateId}`), 'ats_application', applicationId)}
                  className="text-rivvra-400 hover:text-rivvra-300 text-sm underline-offset-2 hover:underline"
                >
                  Open candidate record →
                </Link>
              </div>
            )}
          </Panel>

          <AiResumeInsights
            candidate={application._candidate}
            application={application}
            canRescore={isAdmin}
            rescoring={aiRescoring}
            onRescore={handleAiRescore}
          />

          <Panel title="Job" icon={<Briefcase size={14} />}>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Position</span>
              {application.jobPositionId ? (
                <Link
                  to={withFromContext(orgPath(`/ats/jobs/${application.jobPositionId}`), 'ats_application', applicationId)}
                  className="text-rivvra-400 hover:text-rivvra-300 text-sm underline-offset-2 hover:underline truncate"
                >
                  {application.jobName || 'View job'} <ExternalLink size={11} className="inline ml-0.5" />
                </Link>
              ) : (
                <span className="text-dark-600 text-sm">—</span>
              )}
            </div>
            <InlineField label="Department" field="jobDepartment" value={application.jobDepartment} editable={false} />
            <EmployeeLookup
              orgSlug={orgSlug}
              label="Recruiter"
              currentValue={application.recruiterId}
              currentName={application.recruiterName}
              editable={canEditPeople}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_application', applicationId)}
              onSelect={(id, name) => savePerson('recruiterId', 'recruiterName', id, name)}
            />
            {/* "Assign to me" — self-serve claim of an unassigned lead. Lets
                a recruiter pick up an HR-Team / unowned application even
                though the team-scope RBAC otherwise makes it read-only. */}
            {canClaim && (
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 pb-2">
                <span />
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-rivvra-500/40 bg-rivvra-500/10 px-3 py-1.5 text-xs font-semibold text-rivvra-200 transition-colors hover:bg-rivvra-500/20 disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  {claiming ? 'Assigning…' : 'Assign to me'}
                </button>
              </div>
            )}
            {/* Account Owner — read-only mirror of the linked Job Position.
                Edit it on the Job page and it propagates to every app. */}
            <EmployeeLookup
              orgSlug={orgSlug}
              label="Account Owner"
              currentValue={application.accountOwnerId}
              currentName={application.accountOwnerName}
              editable={false}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_application', applicationId)}
            />
            {/* Employment type is denorm from the job position and not
                directly editable here (Phase-1 / Q22, 2026-05-10).
                Edit it on the Job Position page and it propagates. */}
            <InlineField label="Employment" field="employmentType" value={application.employmentType || '—'} editable={false} />
            {/* Client Role — denorm from the linked Job Position (2026-05-11).
                Edit it on the Job page; the cascade in PUT /jobs/:id
                propagates to every linked application. */}
            <InlineField label="Client Role" field="isClientRole" value={!!application.isClientRole} type="toggle" editable={false} />
            {/* Client Name — read-only mirror of the linked Job Position.
                Edit it on the Job page and it propagates to every app.
                2026-05-17 Phase N: link to the contact when
                clientContactId is denormed from the job. Mirrors the
                Job-detail page's pattern. */}
            <InlineField
              label="Client Name"
              field="clientName"
              value={application.clientName}
              editable={false}
              displayValue={application.clientContactId && application.clientName ? (
                <Link
                  to={withFromContext(orgPath(`/contacts/${application.clientContactId}`), 'ats_application', applicationId)}
                  className="text-rivvra-300 hover:text-rivvra-200 hover:underline"
                >
                  {application.clientName}
                </Link>
              ) : undefined}
            />
          </Panel>

          <Panel title="Compensation" icon={<DollarSign size={14} />}>
            {/* One currency for both figures — expected and proposed are a
                negotiation over the same money. Blank = company currency, so
                records created before this field behave exactly as before. */}
            <InlineField
              label="Currency"
              field="compensationCurrency"
              type="select"
              value={application.compensationCurrency || ''}
              editable={canEdit}
              onSave={saveField}
              options={[
                { value: '', label: `Company default (${companyCurrency})` },
                { value: 'INR', label: 'INR — Indian Rupee' },
                { value: 'USD', label: 'USD — US Dollar' },
                { value: 'CAD', label: 'CAD — Canadian Dollar' },
                { value: 'EUR', label: 'EUR — Euro' },
                { value: 'GBP', label: 'GBP — British Pound' },
                { value: 'AED', label: 'AED — UAE Dirham' },
              ]}
            />
            <InlineField
              label="Salary Expected"
              field="salaryExpected"
              value={application.salaryExpected}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtSalary(application.salaryExpected, application.compensationCurrency) || undefined}
            />
            <InlineField
              label="Salary Proposed"
              field="salaryProposed"
              value={application.salaryProposed}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtSalary(application.salaryProposed, application.compensationCurrency) || undefined}
            />
          </Panel>

          <Panel title="Sourcing" icon={<FileText size={14} />}>
            <InlineField label="Source" field="source" value={application.source} editable={canEdit} onSave={saveField} placeholder="e.g. Naukri, Referral" />
            <InlineField label="Medium" field="medium" value={application.medium} editable={canEdit} onSave={saveField} placeholder="e.g. Online, Email" />
            <InlineField label="Degree" field="degree" value={application.degree} editable={canEdit} onSave={saveField} placeholder="e.g. B.Tech, MBA" />
            <InlineField label="Availability" field="availability" value={application.availability} editable={canEdit} onSave={saveField} placeholder="e.g. 30 days notice" />
            <InlineField label="Applied On" field="appliedOn" value={application.appliedOn} type="date" editable={canEdit} onSave={saveField} />
            <InlineField label="Notes" field="note" value={application.note} type="textarea" editable={canEdit} onSave={saveField} placeholder="Internal notes…" />
          </Panel>

          <Panel title="Skills" icon={<Award size={14} />}>
            {application.candidateId ? (
              <SkillsPicker orgSlug={orgSlug} candidateId={application.candidateId} readOnly={!canEdit} />
            ) : (
              <p className="text-dark-500 text-sm py-2">No candidate linked.</p>
            )}
          </Panel>

          {isAtDocsCollection && (
            <div id="documents-checklist-card">
              <Panel
                title="Documents Checklist"
                icon={<FileCheck size={14} />}
                action={
                  requiredDocs.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        receivedCount === requiredOnly.length
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}>
                        {receivedCount} of {requiredOnly.length} required received
                      </span>
                      {docsGateBypassed && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full border bg-dark-700 border-dark-600 text-dark-300 flex items-center gap-1"
                          title={`Gate bypassed by ${application.documentsGate?.bypassedByName || 'admin'} — ${application.documentsGate?.reason || ''}`}
                        >
                          <ShieldOff size={11} /> Gate bypassed
                        </span>
                      )}
                    </div>
                  ) : null
                }
              >
                {requiredDocs.length === 0 ? (
                  <div className="text-sm text-dark-400 py-2">
                    No required documents configured for this company.{' '}
                    {isAdmin ? (
                      <Link to={orgPath('/ats/config?tab=required_documents')} className="text-rivvra-400 hover:underline">
                        Add them under Configuration → Picklists → Required Documents
                      </Link>
                    ) : (
                      <span>Ask an admin to configure them under Configuration → Picklists → Required Documents.</span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {requiredDocs.map((doc) => {
                      const isRequired = doc.required !== false;
                      const isUploading = uploadingDoc === doc.name;
                      const hasFile = !!doc.attachmentId;
                      // For required items, receipt = a file is attached.
                      // For optional items, receipt can be a tick alone.
                      const received = isRequired ? hasFile : !!doc.receivedAt;
                      const attachmentMeta = doc.attachment || null;
                      const inputId = `doc-upload-${doc.name.replace(/\W+/g, '-')}`;
                      return (
                        <div
                          key={doc.name}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors ${
                            received
                              ? 'bg-emerald-500/5 border-emerald-500/20'
                              : 'bg-dark-900/40 border-dark-700'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            {/* Required rows: read-only indicator (file is the
                                source of truth). Optional rows: interactive
                                checkbox since recruiter can mark received
                                without a file. */}
                            {isRequired ? (
                              <div
                                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                  received
                                    ? 'bg-emerald-500 border-emerald-500'
                                    : 'border-dark-600 bg-dark-900'
                                }`}
                                aria-hidden="true"
                              >
                                {received && <Check size={11} className="text-white" />}
                              </div>
                            ) : (
                              <input
                                type="checkbox"
                                checked={received}
                                disabled={!canEdit || isUploading}
                                onChange={(e) => handleMarkDocumentReceived(doc.name, e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-dark-600 bg-dark-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 shrink-0 cursor-pointer"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm font-medium ${received ? 'text-emerald-200' : 'text-white'}`}>
                                  {doc.name}
                                </span>
                                {!isRequired && (
                                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-dark-700 border border-dark-600 text-dark-300">
                                    Optional
                                  </span>
                                )}
                              </div>
                              {received && doc.receivedByName && (
                                <div className="text-xs text-dark-400 mt-0.5">
                                  {hasFile ? 'Uploaded' : 'Marked received'} {formatEventDateTime(doc.receivedAt)} · {doc.receivedByName}
                                </div>
                              )}
                              {isRequired && !hasFile && (
                                <div className="text-xs text-dark-500 mt-0.5">
                                  Upload the file to mark as received
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {hasFile && (
                              <button
                                type="button"
                                onClick={() => setPreviewDoc({
                                  _id: doc.attachmentId,
                                  fileName: attachmentMeta?.fileName || doc.name,
                                  mimeType: attachmentMeta?.mimeType || '',
                                  url: attachmentMeta?.url || null,
                                })}
                                className="text-xs px-2 py-1 rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors"
                              >
                                View
                              </button>
                            )}
                            {canEdit && (
                              <>
                                <label
                                  htmlFor={inputId}
                                  className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                                    isUploading
                                      ? 'border-dark-600 text-dark-400 cursor-wait'
                                      : 'border-dark-600 text-dark-200 hover:bg-dark-700 cursor-pointer'
                                  }`}
                                >
                                  {isUploading
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <Upload size={12} />}
                                  {hasFile ? 'Replace' : 'Upload'}
                                </label>
                                <input
                                  id={inputId}
                                  type="file"
                                  className="hidden"
                                  disabled={isUploading}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadDocument(doc.name, f);
                                    e.target.value = '';
                                  }}
                                />
                                {hasFile && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDocumentFile(doc.name, doc.attachmentId)}
                                    className="text-xs px-2 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors"
                                    title="Remove file and unmark received"
                                  >
                                    Remove
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {isAtDocsCollection && isAdmin && !docsGateBypassed && receivedCount < requiredOnly.length && (
                      <button
                        type="button"
                        onClick={() => setShowDocumentsBypassDialog(true)}
                        className="mt-2 text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1.5"
                      >
                        <ShieldOff size={12} />
                        Force advance past Documents gate
                      </button>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          )}

          <Panel title="Attachments" icon={<FileSignature size={14} />}>
            <AttachmentsPanel orgSlug={orgSlug} applicationId={applicationId} readOnly={!canEdit} />
          </Panel>

          {/* SignRequestWidget brings its own card styling, header, list,
              and "+ Send other document" composer modal — same component
              CRM / Employee / Contact use. Wrapping it in a SectionCard
              caused two nested headers and duplicated the request list
              alongside an inline panel. 2026-05-11: the header
              "Request Signature" button was removed since this widget
              already provides an in-place entry point and the new
              "Offer" header button owns the offer-letter flow. */}
          <SignRequestWidget
            orgSlug={orgSlug}
            linkedModel="ats_application"
            linkedId={applicationId}
            prefillData={{
              name: application.candidateName || '',
              email: application.email || '',
              phone: application.phone || '',
            }}
            // 2026-05-11: Offer letters go through the Offer Details
            // modal so they bind to application.offer.* properly.
            // This widget stays for everything else (NDAs, policies,
            // employment bonds), so we relabel it to make the split
            // obvious to the recruiter.
            sectionTitle="Other Documents"
            sendButtonLabel="Send other document"
            modalTitle="Send other document"
          />

          <Panel title="Interview" icon={<Calendar size={14} />}>
            <div className="space-y-2.5">
              {/* 2026-06-26: interview rounds are now dynamic per job
                  (L1, L2, L3 … + HR), derived from the resolved pipeline
                  (stages carrying a roundKey). HR is always last. */}
              {interviewRounds.map((r) => (
                <InterviewRoundCard
                  key={r.level}
                  label={r.label}
                  level={r.level}
                  interviewField={`${r.level}Interview`}
                  resultField={`${r.level}Result`}
                  dateField={`${r.level}DateTime`}
                  feedbackField={r.feedbackField}
                  application={application}
                  canEdit={canEdit}
                  isClientRole={r.isHr ? false : application.isClientRole === true}
                  onEditSchedule={openInterviewScheduleModal}
                  onEditResult={openInterviewResultModal}
                  orgPath={orgPath}
                  applicationId={applicationId}
                />
              ))}
            </div>
            <div className="border-t border-dark-700 my-3" />
            <InlineField
              label="Hire Date"
              field="hireDate"
              value={application.hireDate}
              type="date"
              editable={canEdit}
              onSave={saveField}
            />
          </Panel>

        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Panel title="Tags" icon={<Tag size={14} />}>
            {(() => {
              // Prefer the server's name-resolved tags (Odoo-imported apps
              // store tag ObjectIds in application.tags, which rendered as
              // raw hex chips). Fall back to raw tags for legacy responses.
              const tagList = (application.tagsResolved && application.tagsResolved.length > 0)
                ? application.tagsResolved
                : (application.tags || []);
              return tagList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 py-2">
                {tagList.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 text-dark-300">
                    {typeof tag === 'string' ? tag : tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-dark-500 text-xs py-1">No tags.</p>
            );
            })()}
          </Panel>

          {appStatus === 'refused' && (
            <Panel className="border-red-500/20" title="Refused" icon={<XCircle size={14} />}>
              <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-x-3 gap-y-2 py-1">
                <span className="text-dark-400 text-sm">Reason</span>
                <span className={`text-sm ${application.refuseReason ? 'text-dark-200' : 'text-dark-500 italic'}`}>
                  {application.refuseReason || 'No reason provided'}
                </span>
                {application.refusedAtStageName && (
                  <>
                    <span className="text-dark-400 text-sm">Refused at</span>
                    <span className="text-dark-200 text-sm">{application.refusedAtStageName} stage</span>
                  </>
                )}
                {application.refusedByName && (
                  <>
                    <span className="text-dark-400 text-sm">Refused by</span>
                    <span className="text-dark-200 text-sm">{application.refusedByName}</span>
                  </>
                )}
                {application.refusedAt && (
                  <>
                    <span className="text-dark-400 text-sm">Refused on</span>
                    <span className="text-dark-200 text-sm">{formatDate(application.refusedAt)}</span>
                  </>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Pipeline" icon={<UserCheck size={14} />}>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Status</span>
              <span className="text-white text-sm capitalize">{application.applicationStatus || 'ongoing'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Kanban</span>
              <span className="text-white text-sm">{KANBAN_LABELS[application.kanbanState] || 'Normal'}</span>
            </div>
          </Panel>

          <Panel>
            <RecordMeta
              style={{ marginTop: 8 }}
              createdAt={application.createdAt}
              createdByName={application.createdByName}
              updatedAt={application.updatedAt}
              updatedByName={application.updatedByName}
            />
          </Panel>

          <Panel title="Activity" icon={<Star size={14} />}>
            <ActivityPanelV2 orgSlug={orgSlug} entityType="ats_application" entityId={applicationId} canEdit={canEdit} />
          </Panel>
        </div>
      </div>

      {/* Modals */}
      {previewDoc && (
        <DocumentPreviewModal
          filename={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          directUrl={previewDoc.url || undefined}
          fetchUrl={atsApi.getAttachmentDownloadUrl(orgSlug, previewDoc._id)}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      <RefuseModal
        show={showRefuseModal}
        onClose={() => setShowRefuseModal(false)}
        onConfirm={handleRefuse}
        reasons={refuseReasons}
        saving={actionSaving}
        application={application}
        currentStageName={currentStageName}
      />
      <ReasonPromptDialog
        open={showDocumentsBypassDialog}
        title="Force advance past Documents gate?"
        message={
          <>
            This skips the Documents Collection gate for this application — the
            recruiter will be able to move it forward without marking every
            required document as received.
            {'\n\n'}
            The reason is logged in the activity timeline for audit. Only do this
            when you've verified the documents through another channel (email,
            chat, in-person).
          </>
        }
        reasonLabel="Reason for bypassing"
        reasonPlaceholder='e.g. "documents verified offline by HR"'
        confirmLabel="Bypass gate"
        busy={actionSaving}
        onCancel={() => { if (!actionSaving) setShowDocumentsBypassDialog(false); }}
        onConfirm={handleBypassDocumentsGate}
      />
      <ReasonPromptDialog
        open={showUnrefuseDialog}
        title="Restore this refused application?"
        message={
          <>
            The candidate already received the rejection email when this application
            was refused. Restoring will <strong className="text-amber-300">not un-send</strong> it —
            reach out to the candidate separately before continuing.
            {'\n\n'}
            Stage stays where it was; status flips back to Ongoing.
          </>
        }
        reasonLabel="Reason for restoring"
        reasonPlaceholder='e.g. "candidate re-applied", "wrong refusal"'
        confirmLabel="Restore application"
        busy={unrefuseSaving}
        onCancel={() => { if (!unrefuseSaving) setShowUnrefuseDialog(false); }}
        onConfirm={handleUnrefuseConfirm}
      />
      <RateConfirmationModal
        show={showRateConfirmationModal}
        onClose={() => setShowRateConfirmationModal(false)}
        orgSlug={orgSlug}
        application={application}
        recruiterName={authUser?.name || ''}
        recruiterEmail={authUser?.email || ''}
        onSent={(msg) => { setShowRateConfirmationModal(false); fetchApplication(); if (msg) showToast(msg, 'success'); }}
        canBypass={canBypassRcGate && !application?.rateConfirmationGate?.bypassedAt}
        onBypassRequested={() => { setRcBypassReason(''); setShowRcBypassModal(true); }}
      />
      <HireModal
        show={showHireModal}
        onClose={() => { setShowHireModal(false); setEditOfferOnly(false); }}
        onConfirm={handleHire}
        saving={actionSaving}
        mode={editOfferOnly ? 'offer' : 'hire'}
        initialOffer={application?.offer || null}
        application={application}
        companies={companies}
        orgSlug={orgSlug}
        onRefresh={fetchApplication}
      />
      <CreateEmployeeDrawer
        show={showCreateEmpDrawer}
        onClose={() => setShowCreateEmpDrawer(false)}
        onConfirm={handleCreateEmployeeConfirm}
        saving={creatingEmployee}
        application={application}
        companies={companies}
        orgSlug={orgSlug}
      />
      <BackwardMoveReasonModal
        show={!!pendingBackwardMove}
        onClose={() => setPendingBackwardMove(null)}
        onConfirm={(reason) => handleMoveStage(pendingBackwardMove.stageId, { reason })}
        saving={actionSaving}
        fromStage={pendingBackwardMove?.fromStageName}
        toStage={pendingBackwardMove?.toStageName}
      />
      <AttachmentUploadModal
        show={!!pendingAttachmentMove}
        onClose={() => setPendingAttachmentMove(null)}
        onConfirm={handleAttachmentUpload}
        saving={actionSaving}
        targetStageName={pendingAttachmentMove?.targetStageName}
        missingAttachment={pendingAttachmentMove?.missingAttachment}
      />
      <AttachmentUploadModal
        show={!!pendingResumeMove}
        onClose={() => setPendingResumeMove(null)}
        onConfirm={handleResumeUpload}
        saving={actionSaving}
        targetStageName={pendingResumeMove?.targetStageName}
        missingAttachment={{ slug: 'resume', label: 'Resume', mime: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', maxSizeMb: 10 }}
      />
      <InterviewScheduleModal
        show={!!pendingInterviewMove}
        onClose={() => setPendingInterviewMove(null)}
        onConfirm={handleScheduleInterview}
        saving={actionSaving}
        level={pendingInterviewMove?.level}
        targetStageName={pendingInterviewMove?.targetStageName}
        existingSlot={pendingInterviewMove?.existingSlot}
        orgSlug={orgSlug}
        isClientRole={pendingInterviewMove?.isClientRole === true}
      />
      <InterviewResultModal
        show={!!pendingResultMove}
        onClose={() => setPendingResultMove(null)}
        onConfirm={handleCaptureResult}
        saving={actionSaving}
        level={pendingResultMove?.level}
        targetStageName={pendingResultMove?.targetStageName}
        existingResult={pendingResultMove?.existingResult}
      />
    </div>
  );
}

/* ── Interview round helper ──────────────────────────────────────────── */
// Q4-D refactor (2026-05-12): InterviewRoundCard replaces the old
// InterviewRound's three inline fields. Reads structured subdocs
// (l1Interview / l1Result + L2 + HR) and falls back to the legacy
// flat fields (l1DateTime / l1Feedback etc.) for imported records.
// All editing is funneled through the existing InterviewScheduleModal
// / InterviewResultModal — no inline writes — so there's only one
// write path and no divergence between flat fields and the subdocs.
