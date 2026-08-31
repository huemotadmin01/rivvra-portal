import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import atsApi from '../../utils/atsApi';
import signApi from '../../utils/signApi';
import employeeApi from '../../utils/employeeApi';
import { withFromContext } from '../../utils/entityDescribe';
import { getEmploymentTypeMeta, SALARY_UNIT_INPUT } from '../../utils/atsEmploymentTypes';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import ReasonPromptDialog from '../../components/shared/ReasonPromptDialog';
import {
  AlertCircle, Archive, Building2, Calendar, ChevronDown, FileSignature, FileText,
  Hash, IdCard, Loader2, Mail, MessageSquare, PenTool, Upload, User, UserPlus, X,
} from 'lucide-react';

/**
 * Modals, drawers and small pieces belonging to the ATS Application detail
 * page. Lifted out of AtsApplicationDetail.jsx verbatim — no behaviour
 * changes — so the legacy page and its v2 replacement can share one copy
 * instead of the v2 migration duplicating ~2,000 lines of hire, offer and
 * interview flow.
 *
 * Everything here is still legacy-styled (Tailwind, dark-only). That is
 * deliberate: this module carries the offer/hire/rate-confirmation surfaces,
 * which touch salary figures and signature sending, and those migrate in
 * their own reviewed pass rather than riding along with a layout change.
 *
 * Real EVENT timestamps (sent-at, signed-at, received-at) are true moments in
 * time — render them in the viewer's local timezone. formatDateUTC is only for
 * date-only fields (joiningDate, appliedOn, hireDate) where UTC-normalizing
 * avoids an off-by-one day; using it on an event stamp shows the prior day for
 * IST viewers late at night. Viewer-locale (undefined) keeps ATS date style.
 */
export function formatEventDateTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return String(d); }
}

/* ── Kanban State Dot ─────────────────────────────────────────────────── */
export const KANBAN_STATES = ['normal', 'done', 'blocked'];
export const KANBAN_COLORS = { normal: 'bg-gray-400', done: 'bg-emerald-400', blocked: 'bg-red-400' };
export const KANBAN_LABELS = { normal: 'Normal', done: 'Done', blocked: 'Blocked' };

export function KanbanDot({ state = 'normal', onClick }) {
  const color = KANBAN_COLORS[state] || KANBAN_COLORS.normal;
  const label = KANBAN_LABELS[state] || 'Normal';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Kanban: ${label} (click to toggle)`}
      className="group relative flex items-center"
    >
      <span className={`inline-block w-3 h-3 rounded-full ${color} transition-colors ring-2 ring-dark-800 group-hover:ring-dark-600`} />
      <span className="ml-1.5 text-xs text-dark-400 hidden sm:inline">{label}</span>
    </button>
  );
}

/* ── Stage Progression Bar ────────────────────────────────────────────── */
export function StageBar({ stages, currentStageId, onStageClick, disabled = false }) {
  const currentIdx = stages.findIndex((s) => s._id === currentStageId);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((stage, idx) => {
        const isCurrent = idx === currentIdx;
        let cls = 'bg-dark-700 text-dark-400';
        if (idx < currentIdx) cls = 'bg-emerald-500/20 text-emerald-400';
        if (isCurrent) cls = 'bg-rivvra-500 text-white';
        // Chips are inert while a move is in flight (disabled) and the
        // current-stage chip is never clickable — clicking it re-fired a
        // no-op /stage call and double-clicks queued duplicate moves.
        const inert = disabled || isCurrent;
        return (
          <button
            key={stage._id}
            disabled={inert}
            onClick={() => { if (!inert) onStageClick?.(stage._id); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              disabled ? 'opacity-60 cursor-not-allowed' : isCurrent ? 'cursor-default' : 'hover:opacity-80'
            } ${cls}`}
          >
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}

/* ── Refuse Modal moved to ../../components/ats/RefuseModal.jsx ───────── */

/* ── Offer / Hire Modal (P0.1, 2026-05-10; mode-prop added 2026-05-10 v2) ──
 * Two-step Hire flow per Q4-B + Q9 contract:
 *   Step 1 (this modal): captures offer-acceptance data so the resulting
 *                        Application.offer subdoc isn't empty (bug B1).
 *   Step 2 (CreateEmployeeDrawer): HR-side fields when promoting to Employee.
 *
 * P0.2 (2026-05-10) reuses this modal in 'offer' mode for the Offer
 * Proposal / Offer Signed stage gates: same form, but the submit
 * button calls /offer instead of /hire and labels the action
 * accordingly. The parent's onConfirm decides which API to hit.
 *
 * Props:
 *   mode             'hire' (default) | 'offer'
 *   targetStageName  optional, shown in the header for offer mode
 *                    so the user knows which gate they're satisfying
 *   requireSignedDoc when true, makes signedOfferDocId required (used
 *                    by the Offer Signed gate)
 *   initialOffer     prefill the form from an existing application.offer
 *
 * signedOfferDocId is intentionally optional unless requireSignedDoc=true
 * (Q9.2-C) — many IN contract hires don't have a signed PDF day-1; we
 * surface a soft warning after submit instead of hard-blocking on /hire.
 */
export function HireModal({ show, onClose, onConfirm, saving, mode = 'hire', initialOffer = null, application = null, companies = [], orgSlug = null, onRefresh = null }) {
  // Phase-1 / Q21+Q22 (2026-05-10): the salary input adapts to the
  // application's employment type. Contract → "Day rate" + per_day unit;
  // Full-Time / Internal Consultant → "Annual CTC (LPA)" + lpa unit.
  // Falls back to LPA for legacy applications without a picklist value.
  // 2026-08-31 employment-type audit: when the application's own type is
  // blank (legacy rows born before the create route derived it from the
  // job), fall back to the linked JOB's type — the detail pages merge it
  // onto the application as `jobEmploymentType` from the GET response.
  // Only the label/unit config choice changes; save/compute logic is
  // untouched.
  const effectiveEmploymentType = application?.employmentType || application?.jobEmploymentType || null;
  const empMeta = getEmploymentTypeMeta(effectiveEmploymentType);
  const salaryUnit = empMeta.salaryUnit;
  const salaryLabel = empMeta.salaryLabel;
  const salaryInputCfg = SALARY_UNIT_INPUT[salaryUnit] || SALARY_UNIT_INPUT.lpa;

  // 2026-07-18: the progressive offerLevel gate ('salary' / 'signed'
  // variants) was removed with the dead pendingStageMove path — both
  // remaining entry points (header Offer button, Hire button) always
  // capture the full offer, with the signed doc optional (soft warning).

  // 2026-05-18: detect applications that arrived at Offer Signed via an
  // external flow (Odoo import, manual stage move with no Rivvra envelope).
  // By the time an app is at this stage, the signature is — by definition —
  // already done. Showing a "pick a template / send for signature" form
  // here was confusing recruiters into thinking they had to start a fresh
  // envelope before hitting Hire. Mirrors the API's OFFER_SIGNED_STAGE_NAMES
  // set (ats.js). Keep the lists in sync.
  const OFFER_SIGNED_STAGE_NAMES = new Set(['offer signed', 'offer accepted']);
  const currentStageNorm = String(application?.stageName || '').trim().toLowerCase();
  const alreadyAtOfferSigned = OFFER_SIGNED_STAGE_NAMES.has(currentStageNorm);

  // Phase-1 / Q11+Q12 (2026-05-10): Sign integration. The offer letter
  // is sent for e-signature via the existing Sign module. Director slot
  // pre-fills from the application's internal-company signatory metadata
  // (companies.signatoryName / signatoryEmail seeded for Huemot Pvt Ltd
  // IN). Candidate slot pre-fills from the application. Templates load
  // lazily on modal open from Sign's GET /templates (no extra filter,
  // per Q17-A1).
  const [signTemplates, setSignTemplates] = useState([]);
  const [signLoading, setSignLoading] = useState(false);
  const [signError, setSignError] = useState('');
  // 2026-05-17 health-check D.2: two-stage confirm for envelope disconnect.
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  // One outstanding offer per application (2026-07-28). Set from the server's
  // 409 OFFER_ALREADY_OUTSTANDING when an offer envelope is still awaiting
  // signature — including one orphaned by an older Disconnect, which clears
  // application.offer.signEnvelopeId but left the envelope live and signable.
  // In that case the picker is showing and only the server knows.
  const [outstandingEnvelope, setOutstandingEnvelope] = useState(null);
  const [reminding, setReminding] = useState(false);
  const [cancellingEnv, setCancellingEnv] = useState(false);
  const [signTemplateId, setSignTemplateId] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [directorEmail, setDirectorEmail] = useState('');
  const [candSignName, setCandSignName] = useState('');
  const [candSignEmail, setCandSignEmail] = useState('');
  const [sendingEnv, setSendingEnv] = useState(false);
  // Revise-signed-offer ReasonPromptDialog state. Replaces an earlier
  // window.prompt + window.alert chain that looked out of place
  // against the rest of the modern modal chrome.
  const [showReviseDialog, setShowReviseDialog] = useState(false);
  const [reviseSaving, setReviseSaving] = useState(false);
  // Bumping this nonce re-fires the template-load effect. The previous
  // Retry handler reset signTemplates to [] which kept the length at 0
  // (unchanged dep) — so clicking Retry after a failed fetch silently
  // did nothing. Now Retry increments the nonce, which is a dep.
  const [signFetchNonce, setSignFetchNonce] = useState(0);
  // Pre-filled subject + body for the Sign email so the recruiter
  // doesn't have to retype candidate name, rate, title, joining date.
  const [signSubject, setSignSubject] = useState('');
  const [signMessage, setSignMessage] = useState('');

  // Resolve the application's internal company so we can read the seeded
  // signatory metadata. The companies array comes from CompanyContext.
  const appCompany = (application?.companyId && Array.isArray(companies))
    ? companies.find((c) => String(c._id) === String(application.companyId))
    : null;
  const seededDirectorName = appCompany?.signatoryName || '';
  const seededDirectorEmail = appCompany?.signatoryEmail || '';

  // Lazy-load Sign templates when the modal opens. Cached for the
  // lifetime of the modal instance so re-opens don't refetch.
  //
  // Bug fix 2026-05-10 #2: do NOT depend on signLoading in this effect.
  // The original wrote setSignLoading(true) which mutated the dep,
  // re-fired the effect, cancelled the in-flight promise, and the
  // .finally guarded `if (!cancelled) setSignLoading(false)` never
  // ran — leaving the dropdown stuck on "Loading templates..." forever.
  // We also always clear the loading flag in finally now (cancellation
  // affects state-write, not loading-state cleanup).
  useEffect(() => {
    if (!show || !orgSlug) return;
    if (signTemplates.length > 0 && signFetchNonce === 0) return;
    let cancelled = false;
    setSignLoading(true);
    setSignError('');
    atsApi.listSignTemplates(orgSlug)
      .then((res) => {
        if (cancelled) return;
        setSignTemplates(Array.isArray(res?.templates) ? res.templates : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setSignError(err?.message || 'Failed to load Sign templates');
      })
      .finally(() => { setSignLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, orgSlug, signFetchNonce]);

  // Manual retry — bumps the fetch nonce so the lazy-load effect refires
  // even when signTemplates is already [] (the previous "set to []" reset
  // was a no-op when length was already 0).
  const handleRetryLoadTemplates = () => {
    setSignError('');
    setSignFetchNonce((n) => n + 1);
  };

  // Reset Sign-section state every time the modal opens so a fresh
  // open after a previous send doesn't carry stale data. signedOfferDocId
  // itself is reset by the existing initialOffer effect below.
  useEffect(() => {
    if (!show) return;
    setSignTemplateId('');
    setDirectorName(seededDirectorName);
    setDirectorEmail(seededDirectorEmail);
    setCandSignName(application?.candidateName || '');
    setCandSignEmail(application?.email || '');
    setSendingEnv(false);
    setSignError('');
  }, [show, seededDirectorName, seededDirectorEmail, application?.candidateName, application?.email]);

  // Local-TZ YYYY-MM-DD used as the joining-date default and to detect a
  // stale (past) prefill for the passive amber note below. There is
  // deliberately NO hard past-date block — it was declined; the note just
  // warns because the date prints on the welcome email. Using
  // new Date().toISOString() was UTC-based, which marked today as past for
  // users west of UTC and yesterday-selectable for users east of UTC.
  const ymdLocal = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  // 2026-05-17 health-check G.2: useMemo so `today` isn't recomputed every
  // render (it's a useEffect dep below — identity churn re-initialised
  // state on every parent re-render). 2026-07-18: keyed on `show` instead
  // of memoised once — a page left mounted past midnight otherwise pinned
  // `today` (and the stale-prefill note) to yesterday. Still stable for the
  // whole time the modal is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => ymdLocal(new Date()), [show]);
  const initJoining = initialOffer?.joiningDate
    ? new Date(initialOffer.joiningDate).toISOString().slice(0, 10)
    : today;
  const [joiningDate, setJoiningDate] = useState(initJoining);
  const [currency, setCurrency] = useState(initialOffer?.offeredCTC?.currency || 'INR');
  const [amount, setAmount] = useState(initialOffer?.offeredCTC?.amount ? String(initialOffer.offeredCTC.amount) : '');
  const [noticePeriodDays, setNoticePeriodDays] = useState(initialOffer?.noticePeriodDays != null ? String(initialOffer.noticePeriodDays) : '30');
  const [probationMonths, setProbationMonths] = useState(initialOffer?.probationMonths != null ? String(initialOffer.probationMonths) : '6');
  const [signedOfferDocId, setSignedOfferDocId] = useState(initialOffer?.signedOfferDocId || '');
  const [errors, setErrors] = useState({});

  // Re-prefill ONLY when the modal opens. `initialOffer` gets a fresh object
  // identity on every parent fetchApplication (Send-for-signature and
  // Disconnect both call onRefresh) — having it as an effect dep wiped the
  // recruiter's un-submitted edits mid-modal. Read the latest value via a
  // ref instead.
  const initialOfferRef = useRef(initialOffer);
  initialOfferRef.current = initialOffer;
  useEffect(() => {
    if (show) {
      const io = initialOfferRef.current;
      setJoiningDate(io?.joiningDate ? new Date(io.joiningDate).toISOString().slice(0, 10) : today);
      setCurrency(io?.offeredCTC?.currency || 'INR');
      setAmount(io?.offeredCTC?.amount ? String(io.offeredCTC.amount) : '');
      setNoticePeriodDays(io?.noticePeriodDays != null ? String(io.noticePeriodDays) : '30');
      setProbationMonths(io?.probationMonths != null ? String(io.probationMonths) : '6');
      setSignedOfferDocId(io?.signedOfferDocId || '');
      setErrors({});
    }
  }, [show, today]);
  // Keep the signed-doc gate live while open: when the candidate countersigns
  // and a refresh delivers signedOfferDocId, reflect it without touching the
  // recruiter's other in-progress fields (primitive dep — no identity churn).
  useEffect(() => {
    if (show && initialOffer?.signedOfferDocId) {
      setSignedOfferDocId(initialOffer.signedOfferDocId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, initialOffer?.signedOfferDocId]);

  // Pre-fill subject + body for the Sign email from offer details so
  // the recruiter doesn't retype candidate name, rate, title, joining
  // date. Recomputes whenever any source value changes — unless the
  // recruiter has typed into the field themselves (tracked via the
  // *Dirty flags).
  const [signSubjectDirty, setSignSubjectDirty] = useState(false);
  const [signMessageDirty, setSignMessageDirty] = useState(false);
  // The canonical job-title field on an ATS application is `jobName`
  // (jobPositionName / jobTitle were stale names — they aren't populated,
  // which is why the previous subject came out as "Offer Letter — test01"
  // with no role).
  const jobTitle = application?.jobName || application?.jobPositionName || application?.jobTitle || '';
  const orgCompanyName = appCompany?.name || '';
  const formatRate = () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return '';
    const formatted = amt.toLocaleString('en-IN');
    const unitLabel = salaryUnit === 'per_day' ? 'per day'
      : salaryUnit === 'per_month' ? 'per month'
      : salaryUnit === 'lpa' ? 'LPA'
      : salaryUnit === 'per_year' ? 'per year'
      : '';
    return `${currency} ${formatted}${unitLabel ? ` ${unitLabel}` : ''}`;
  };
  const formatJoining = () => {
    if (!joiningDate || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) return '';
    const [y, m, d] = joiningDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  };
  const firstName = (full) => {
    const cand = (full || '').trim();
    if (!cand) return '';
    return cand.split(/\s+/)[0];
  };
  const defaultSubject = () => {
    const cand = (candSignName || application?.candidateName || 'Candidate').trim();
    return jobTitle
      ? `Offer Letter — ${cand} · ${jobTitle}`
      : `Offer Letter — ${cand}`;
  };
  // Plain-text message — readable in the textarea. Converted to HTML
  // (<br> for newlines) when actually sent so the styled email <p>
  // wrapper in the Sign template renders the line breaks.
  const defaultMessage = () => {
    const fn = firstName(candSignName || application?.candidateName) || 'there';
    const role = jobTitle ? ` for the ${jobTitle} role` : '';
    const at = orgCompanyName ? ` at ${orgCompanyName}` : '';
    const rate = formatRate();
    const join = formatJoining();
    const np = Number(noticePeriodDays);
    const pm = Number(probationMonths);
    const terms = [];
    if (rate) terms.push(`Compensation: ${rate}`);
    if (join) terms.push(`Joining date: ${join}`);
    if (Number.isFinite(np) && np >= 0) terms.push(`Notice period: ${np} days`);
    if (Number.isFinite(pm) && pm > 0) terms.push(`Probation: ${pm} months`);
    const termsBlock = terms.length ? `\n\n${terms.join('\n')}` : '';
    return (
      `Hi ${fn},\n\n`
      + `We're delighted to extend an offer${role}${at}.`
      + termsBlock
      + `\n\nPlease review the offer letter and sign at your earliest convenience. Reach out if you have any questions — looking forward to having you on the team.`
    );
  };
  // Convert recruiter-edited plain text to HTML for the Sign email.
  // Escape HTML so candidate-supplied names can't accidentally produce
  // markup, then turn newlines into <br>.
  const messageToHtml = (text) => {
    const escaped = String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(/\n/g, '<br>');
  };
  useEffect(() => {
    if (!show) return;
    if (!signSubjectDirty) setSignSubject(defaultSubject());
    if (!signMessageDirty) setSignMessage(defaultMessage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, candSignName, application?.candidateName, jobTitle, orgCompanyName, amount, currency, salaryUnit, joiningDate, noticePeriodDays, probationMonths]);

  useEffect(() => {
    if (!show) return;
    setSignSubjectDirty(false);
    setSignMessageDirty(false);
    // Re-discovered on each send attempt; a stale one would wrongly hide the
    // picker after the recruiter cancels the outstanding envelope elsewhere.
    setOutstandingEnvelope(null);
    setDisconnectConfirm(false);
  }, [show]);

  if (!show) return null;

  // Phase-1 / Q11+Q12 (2026-05-10): create the Sign envelope using the
  // existing single-doc /sign/requests endpoint with linkedModel set to
  // 'ats_application' so the Sign completion handler back-links the
  // request id to application.offer.signedOfferDocId. Director signs
  // first (order=1), then candidate (order=2) per Huemot's offer flow.
  const handleSendForSignature = async () => {
    setSignError('');
    if (!signTemplateId) { setSignError('Pick a template'); return; }
    if (!directorName.trim() || !directorEmail.trim()) { setSignError('Director name and email are required'); return; }
    if (!candSignName.trim() || !candSignEmail.trim()) { setSignError('Candidate name and email are required'); return; }
    if (!application?._id) { setSignError('Application not loaded'); return; }
    setSendingEnv(true);
    try {
      const tmpl = signTemplates.find((t) => String(t._id) === String(signTemplateId));
      const subjectForSend = (signSubject || defaultSubject()).trim();
      const messageTextForSend = (signMessage || defaultMessage()).trim();
      const messageHtmlForSend = messageToHtml(messageTextForSend);
      const res = await atsApi.createOfferSignRequest(orgSlug, application._id, {
        templateId: signTemplateId,
        reference: `Offer — ${application.candidateName || 'Candidate'} · ${jobTitle}`.replace(/\s+·\s+$/, '').trim(),
        subject: subjectForSend || undefined,
        message: messageHtmlForSend || undefined,
        signers: [
          { name: directorName.trim(), email: directorEmail.trim().toLowerCase(), roleName: 'Director' },
          { name: candSignName.trim(), email: candSignEmail.trim().toLowerCase(), roleName: 'Candidate' },
        ],
      });
      const newId = res?.request?._id || res?.request?.id || '';
      if (!newId) throw new Error('Sign API returned no request id');
      // Q24-A (2026-05-10): we DO NOT set signedOfferDocId on creation
      // anymore — that field is reserved for the Sign completion
      // back-link, so the Offer Signed gate can't be satisfied
      // prematurely. The envelope id lands in
      // application.offer.signEnvelopeId via the Sign-side back-link.
      // Trigger a parent refetch so the new state shows up.
      setSignError('');
      if (typeof onRefresh === 'function') {
        try { await onRefresh(); } catch { /* ignore */ }
      }
    } catch (err) {
      // Server refused because an offer is already out for signature. Steer to
      // the reminder flow rather than showing a dead-end error — the recruiter
      // usually wants to nudge the candidate, not issue a second letter.
      if (err?.code === 'OFFER_ALREADY_OUTSTANDING' && err?.envelopeId) {
        setOutstandingEnvelope({
          id: String(err.envelopeId),
          state: err.envelopeState || 'sent',
          sentAt: err.envelopeSentAt || null,
        });
        setSignError('');
        return;
      }
      const fields = err?.fieldErrors;
      const msg = fields ? Object.entries(fields)[0]?.join(': ') : null;
      setSignError(msg || err?.message || 'Failed to send for signature');
    } finally {
      setSendingEnv(false);
    }
  };

  // Nudge the signers on the envelope that is already out, instead of
  // creating a second one. Mirrors RateConfirmationModal.handleRemind —
  // the endpoint enforces a 10-minute per-signer cooldown and reports
  // reminded:0 when everyone is still inside it.
  const handleRemindOffer = async (envelopeId) => {
    if (!envelopeId) return;
    setSignError('');
    setReminding(true);
    try {
      const res = await signApi.remindSigners(orgSlug, envelopeId);
      if (!res || res.reminded === 0) {
        setSignError(res?.message || 'Reminder already sent recently — try again in a few minutes.');
        return;
      }
      setSignError('');
      if (typeof onRefresh === 'function') {
        try { await onRefresh(); } catch { /* ignore */ }
      }
      setOutstandingEnvelope(null);
    } catch (err) {
      setSignError(err?.message || 'Failed to send reminder');
    } finally {
      setReminding(false);
    }
  };

  // Explicit opt-in to replace the outstanding offer: cancel it (candidate's
  // link stops working), then return to the picker so a new one can be sent.
  const handleCancelOutstanding = async (envelopeId) => {
    if (!envelopeId) return;
    setSignError('');
    setCancellingEnv(true);
    try {
      await signApi.cancelRequest(orgSlug, envelopeId);
      setOutstandingEnvelope(null);
      if (typeof onRefresh === 'function') {
        try { await onRefresh(); } catch { /* ignore */ }
      }
    } catch (err) {
      setSignError(err?.message || 'Failed to cancel the outstanding offer');
    } finally {
      setCancellingEnv(false);
    }
  };

  const isOfferMode = mode === 'offer';
  const headerTitle = isOfferMode ? 'Offer Details' : 'Confirm Hire';
  const headerSub = isOfferMode
    ? 'Capture offer details'
    : 'Capture offer details before marking as hired';
  const submitLabel = isOfferMode ? 'Save Offer Details' : 'Confirm Hire';
  const submitClass = isOfferMode
    ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30'
    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';

  // Drives the ReasonPromptDialog opened by the Revise button on a
  // fully signed offer. On success, we just refresh — the parent
  // refetch causes the HireModal to re-prefill from the cleared
  // signedOfferDocId / regressed stage, so the user lands back in the
  // Sign-picker state with the prior terms ready to edit.
  const handleReviseConfirm = async (reason) => {
    if (!application?._id) return;
    setReviseSaving(true);
    try {
      await atsApi.reviseOffer(orgSlug, application._id, reason);
      setShowReviseDialog(false);
      if (typeof onRefresh === 'function') {
        try { await onRefresh(); } catch { /* ignore */ }
      }
    } catch (err) {
      setSignError(err?.message || 'Failed to revise offer');
      setShowReviseDialog(false);
    } finally {
      setReviseSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    // Salary block — required at every level (Offer Proposal, Hire).
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) errs.amount = 'Must be > 0';

    if (!joiningDate || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) errs.joiningDate = 'Required';
    const np = Number(noticePeriodDays);
    if (!Number.isFinite(np) || np < 0) errs.noticePeriodDays = '0 or more';
    const pm = Number(probationMonths);
    if (!Number.isFinite(pm) || pm < 0) errs.probationMonths = '0 or more';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onConfirm({
      offer: {
        offeredCTC: { currency, amount: amt, unit: salaryUnit },
        joiningDate,
        noticePeriodDays: Number(noticePeriodDays),
        probationMonths: Number(probationMonths),
        signedOfferDocId: signedOfferDocId.trim() || null,
      },
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (saving) return; onClose(); } }}
    >
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
        className="bg-dark-800 rounded-2xl border border-dark-700 shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-dark-700/80 bg-gradient-to-b from-dark-800 to-dark-800/70">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isOfferMode ? 'bg-blue-500/10 text-blue-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
              <FileSignature size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white leading-tight">{headerTitle}</h3>
              <p className="text-xs text-dark-400 mt-0.5">{headerSub}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors flex-shrink-0 -mr-1"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
        <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">Offer terms</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-dark-300 mb-1">Joining date <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="input-field"
                required
              />
              {errors.joiningDate && <p className="text-xs text-red-400 mt-1">{errors.joiningDate}</p>}
              {/* Passive note (not a block — a hard past-date guard was
                  intentionally declined): the joining date prefills from a
                  possibly-stale prior offer capture and prints verbatim on the
                  welcome email, so flag when it's already in the past. */}
              {initialOffer?.joiningDate && joiningDate && joiningDate < today && (
                <p className="text-xs text-amber-400 mt-1 flex items-start gap-1">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>Joining date is from the earlier offer capture — confirm before hiring; it prints on the welcome email.</span>
                </p>
              )}
            </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-field">
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="AED">AED</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              {salaryLabel} <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={salaryInputCfg.placeholder}
              className="input-field"
              required
            />
            <p className="text-[11px] text-dark-500 mt-1">{salaryInputCfg.helper}{application?.employmentType ? ` · matches ${application.employmentType} job type` : (effectiveEmploymentType ? ` · derived from ${effectiveEmploymentType} job` : '')}</p>
            {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
          </div>

            <>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Notice period (days) <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={noticePeriodDays}
                  onChange={(e) => setNoticePeriodDays(e.target.value)}
                  className="input-field"
                />
                {errors.noticePeriodDays && <p className="text-xs text-red-400 mt-1">{errors.noticePeriodDays}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Probation (months)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={probationMonths}
                  onChange={(e) => setProbationMonths(e.target.value)}
                  className="input-field"
                />
                {errors.probationMonths && <p className="text-xs text-red-400 mt-1">{errors.probationMonths}</p>}
              </div>
            </>

          <div className="col-span-2 pt-3 mt-1 border-t border-dark-700/60">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">Offer signature</div>
              <div className="text-[11px] text-dark-500">Optional</div>
            </div>

            {alreadyAtOfferSigned && !signedOfferDocId && !application?.offer?.signEnvelopeId ? (
              /* State 0: app reached Offer Signed via an external flow
                 (Odoo import, manual stage move) with no Rivvra envelope
                 attached. By definition the signature is already done —
                 don't prompt for a fresh envelope. Surface this as a
                 read-only info card so the recruiter knows the section
                 is intentionally skipped, not broken. */
              <div className="rounded-md border border-dark-700 bg-dark-900/40 p-3">
                <div className="text-sm text-dark-200 font-medium flex items-center gap-1.5">
                  <FileSignature size={14} /> Signed before reaching Rivvra
                </div>
                <p className="text-[11px] text-dark-400 mt-1 leading-relaxed">
                  This application is already at <span className="text-dark-200">{application?.stageName}</span>, so the offer was signed before it was tracked in Rivvra (imported / manual move). No new envelope is needed — proceed to Hire.
                </p>
              </div>
            ) : signedOfferDocId ? (
              /* State 1: envelope completed — back-link wrote signedOfferDocId */
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-emerald-300 font-medium flex items-center gap-1.5">
                      <FileSignature size={14} /> Signed by all parties
                    </div>
                    <div className="text-xs text-dark-400 mt-0.5 font-mono truncate">{signedOfferDocId}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { if (application?._id) setShowReviseDialog(true); }}
                      className="text-xs text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded px-2 py-1 transition-colors"
                      title="Archive this signed offer and start a new revision (e.g. rate renegotiation)"
                    >
                      Revise
                    </button>
                  </div>
                </div>
                {signError && <p className="text-[11px] text-red-400 mt-2">{signError}</p>}
              </div>
            ) : application?.offer?.signEnvelopeId ? (
              /* State 2: envelope sent, awaiting completion (Q24-A 2026-05-10) */
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-amber-300 font-medium flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" /> Envelope sent · awaiting signatures
                    </div>
                    <div className="text-xs text-dark-400 mt-0.5 font-mono truncate">{application.offer.signEnvelopeId}</div>
                    {application.offer.signEnvelopeSentAt && (
                      <div className="text-[11px] text-dark-500 mt-0.5">
                        Sent {formatEventDateTime(application.offer.signEnvelopeSentAt)}
                      </div>
                    )}
                  </div>
                  {/* 2026-05-17 health-check D.2: window.confirm replaced
                      with an inline two-stage button. Nesting a second
                      modal inside HireModal would have layered-z + focus
                      conflicts; the two-stage pattern keeps the diff
                      small and the destructive action behind a clear
                      second click. */}
                  {disconnectConfirm ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!application?._id) return;
                          setDisconnectConfirm(false);
                          try {
                            await atsApi.disconnectOfferEnvelope(orgSlug, application._id);
                            if (typeof onRefresh === 'function') {
                              try { await onRefresh(); } catch { /* ignore */ }
                            }
                          } catch (err) {
                            setSignError(err?.message || 'Failed to disconnect envelope');
                          }
                        }}
                        className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors"
                      >
                        Cancel offer &amp; disconnect
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirm(false)}
                        className="text-xs text-dark-400 hover:text-white px-2 py-1 transition-colors"
                      >
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Reminder-first (2026-07-28): nudging the existing
                          signers is almost always what's wanted, and it used
                          to be reachable only from the Sign module — so
                          recruiters disconnected and re-sent instead, leaving
                          a live envelope behind and the candidate holding two
                          offer letters. */}
                      <button
                        type="button"
                        disabled={reminding}
                        onClick={() => handleRemindOffer(application.offer.signEnvelopeId)}
                        title="Email the pending signers a reminder about this offer. Does not create a new envelope."
                        className="text-xs text-blue-300 hover:text-blue-200 border border-blue-500/30 rounded px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {reminding ? 'Sending…' : 'Send reminder'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirm(true)}
                        title="Cancels this offer envelope so it can no longer be signed, then unlinks it from the application."
                        className="text-xs text-dark-400 hover:text-white px-2 py-1 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-dark-500 mt-2">
                  Once both Director and Candidate sign in the Sign module, this offer will mark itself as signed automatically and the Offer Signed stage gate will pass.
                </p>
                {disconnectConfirm && (
                  <p className="text-[11px] text-amber-300/90 mt-2">
                    Disconnecting cancels the envelope — the candidate&apos;s signing link stops working and any pending signers are marked cancelled. Only a new offer can be signed after this.
                  </p>
                )}
                {signError && <p className="text-[11px] text-red-400 mt-2">{signError}</p>}
              </div>
            ) : outstandingEnvelope ? (
              /* State 2b (2026-07-28): the application has no back-link, but
                 the server says an offer envelope is still out for signature —
                 an orphan from an older Disconnect, which unlinked without
                 cancelling. Reminder-first, same as RateConfirmationModal:
                 replacing it is an explicit, clearly-labelled opt-in. */
              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <Mail size={16} className="mt-0.5 shrink-0 text-blue-300" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-blue-200">An offer letter is already out for signature.</div>
                    <div className="text-xs text-blue-200/80 mt-0.5">
                      The candidate has already received an offer that is still awaiting signature. Send a reminder instead of issuing a second letter — two live offers means two signable documents.
                    </div>
                    <div className="text-[11px] text-dark-400 mt-1.5 font-mono truncate">{outstandingEnvelope.id}</div>
                    {outstandingEnvelope.sentAt && (
                      <div className="text-[11px] text-dark-500">Sent {formatEventDateTime(outstandingEnvelope.sentAt)}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={reminding || cancellingEnv}
                    onClick={() => handleRemindOffer(outstandingEnvelope.id)}
                    className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {reminding ? 'Sending…' : 'Send reminder'}
                  </button>
                  <button
                    type="button"
                    disabled={reminding || cancellingEnv}
                    onClick={() => handleCancelOutstanding(outstandingEnvelope.id)}
                    title="Cancels the outstanding offer so it can no longer be signed, then lets you send a new one."
                    className="text-xs text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {cancellingEnv ? 'Cancelling…' : 'Terms changed? Cancel it and send a new offer'}
                  </button>
                </div>
                {signError && <p className="text-[11px] text-red-400">{signError}</p>}
              </div>
            ) : (
              /* No envelope yet — render the Sign picker + signer slots */
              <div className="rounded-md border border-dark-700 bg-dark-900/40 p-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-dark-400">Sign template</label>
                    {(signError || (!signLoading && signTemplates.length === 0)) && (
                      <button
                        type="button"
                        onClick={handleRetryLoadTemplates}
                        className="text-[11px] text-rivvra-300 hover:text-rivvra-200 underline-offset-2 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                  <select
                    value={signTemplateId}
                    onChange={(e) => setSignTemplateId(e.target.value)}
                    disabled={signLoading || sendingEnv || signTemplates.length === 0}
                    className="input-field"
                  >
                    <option value="">
                      {signLoading
                        ? 'Loading templates…'
                        : signError
                          ? 'Failed to load — click Retry'
                          : signTemplates.length === 0
                            ? 'No Sign templates available'
                            : 'Pick an offer template…'}
                    </option>
                    {signTemplates.map((t) => (
                      <option key={t._id} value={String(t._id)}>{t.name}</option>
                    ))}
                  </select>
                  {signError && <p className="text-[11px] text-red-400 mt-1">{signError}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-dark-400 mb-1">Director (signs first)</label>
                    <input
                      type="text"
                      value={directorName}
                      onChange={(e) => setDirectorName(e.target.value)}
                      placeholder="Director name"
                      className="input-field text-sm mb-1.5"
                      disabled={sendingEnv}
                    />
                    <input
                      type="email"
                      value={directorEmail}
                      onChange={(e) => setDirectorEmail(e.target.value)}
                      placeholder="director@company.com"
                      className="input-field text-sm"
                      disabled={sendingEnv}
                    />
                    {!seededDirectorName && !directorName && (
                      <p className="text-[11px] text-amber-400/80 mt-1">No default signatory configured for this company.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-400 mb-1">Candidate (signs after)</label>
                    <input
                      type="text"
                      value={candSignName}
                      onChange={(e) => setCandSignName(e.target.value)}
                      placeholder="Candidate name"
                      className="input-field text-sm mb-1.5"
                      disabled={sendingEnv}
                    />
                    <input
                      type="email"
                      value={candSignEmail}
                      onChange={(e) => setCandSignEmail(e.target.value)}
                      placeholder="candidate@example.com"
                      className="input-field text-sm"
                      disabled={sendingEnv}
                    />
                  </div>
                </div>

                <div className="border-t border-dark-700/70 pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-dark-400">Email subject</label>
                    {(signSubjectDirty || signMessageDirty) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSignSubject(defaultSubject());
                          setSignMessage(defaultMessage());
                          setSignSubjectDirty(false);
                          setSignMessageDirty(false);
                        }}
                        className="text-[11px] text-rivvra-300 hover:text-rivvra-200 underline-offset-2 hover:underline"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={signSubject}
                    onChange={(e) => { setSignSubject(e.target.value); setSignSubjectDirty(true); }}
                    className="input-field text-sm mb-2"
                    disabled={sendingEnv}
                    placeholder="Offer Letter — Candidate · Role"
                  />
                  <label className="block text-xs font-medium text-dark-400 mb-1">Email message</label>
                  <textarea
                    value={signMessage}
                    onChange={(e) => { setSignMessage(e.target.value); setSignMessageDirty(true); }}
                    rows={8}
                    disabled={sendingEnv}
                    className="input-field text-sm resize-y"
                  />
                  <p className="text-[11px] text-dark-500 mt-1">Pre-filled from candidate name, role, company, compensation, joining date, notice and probation. Edits stick. Line breaks are preserved in the email.</p>
                </div>

                {signError && <p className="text-xs text-red-400">{signError}</p>}

                <button
                  type="button"
                  onClick={handleSendForSignature}
                  disabled={sendingEnv || signLoading || !signTemplateId}
                  className="w-full flex items-center justify-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {sendingEnv ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
                  Send for signature
                </button>

                <details className="text-[11px] text-dark-500">
                  <summary className="cursor-pointer hover:text-dark-300 select-none">Have an existing envelope or signed PDF id? Link it manually</summary>
                  <div className="mt-2 pl-1">
                    <input
                      type="text"
                      value={signedOfferDocId}
                      onChange={(e) => setSignedOfferDocId(e.target.value)}
                      placeholder="Paste the Sign envelope id or attachment id"
                      className="input-field text-sm"
                    />
                    <p className="text-[11px] text-dark-500 mt-1">
                      Use this when the offer was signed offline and uploaded as a document, or when a Sign envelope was already created outside this flow.
                    </p>
                  </div>
                </details>
              </div>
            )}
            {!signedOfferDocId && (
              <p className="text-xs text-dark-500 mt-1.5">If blank, the application will show a "signed offer missing" warning until added.</p>
            )}
          </div>
        </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-dark-700/80 bg-dark-800/95">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className={`flex-1 flex items-center justify-center gap-2 ${submitClass} rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50`}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
      <ReasonPromptDialog
        open={showReviseDialog}
        title="Revise this signed offer?"
        message={
          <>
            The current terms + signed PDF will be archived under
            <span className="text-dark-200"> offer.previousVersions</span>, the back-link cleared,
            and the stage moved back to <span className="text-dark-200">Offer Proposal</span> so
            you can edit terms and re-send.
            {'\n\n'}
            This does <strong className="text-amber-300">not</strong> recall the signed agreement —
            it just lets you supersede it with a new version.
          </>
        }
        reasonLabel="Reason for revising"
        reasonPlaceholder='e.g. "Rate renegotiation", "Joining date changed"'
        confirmLabel="Revise offer"
        danger
        busy={reviseSaving}
        onCancel={() => { if (!reviseSaving) setShowReviseDialog(false); }}
        onConfirm={handleReviseConfirm}
      />
    </div>
  );
}

/* ── Create Employee Drawer (P0.1, 2026-05-10; redesigned 2026-05-10 v2) ─
 * Step 2 of the Hire flow. Pre-fills from application + offer subdoc.
 * v2 fixes:
 *   - EmployeeLookup variant changed from 'row' (which renders an inner
 *     "Manager" label that duplicates the outer "Reporting manager" label)
 *     to 'inline' (just the value cell, label-less).
 *   - EmployeeLookup onSelect signature is (id, name) — not (employee
 *     object). The original v1 code passed `(emp) => emp._id` which was
 *     reading _id off of a string and silently storing nothing, leaving
 *     the form un-submittable. Caught while user-testing on Vinay Belsare.
 *   - Modal widened (max-w-3xl) so dropdown overflow no longer obscures
 *     adjacent fields. Sticky footer keeps the action buttons visible
 *     when fields scroll on shorter viewports.
 *   - Sectioned visual hierarchy (Identity / Placement / Engagement)
 *     via tinted card surfaces with section icons.
 */
export function FormSection({ icon: Icon, title, hint, children }) {
  return (
    <div className="rounded-lg border border-dark-700/70 bg-dark-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-rivvra-500/10 text-rivvra-300">
          <Icon size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-dark-200">{title}</h4>
          {hint && <p className="text-[11px] text-dark-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function FieldLabel({ children, required, hint }) {
  return (
    <label className="block mb-1.5">
      <span className="text-xs font-medium text-dark-300">
        {children}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[11px] text-dark-500 ml-2">{hint}</span>}
    </label>
  );
}

export function CreateEmployeeDrawer({ show, onClose, onConfirm, saving, application, companies, orgSlug }) {
  const personalEmail = application?.email || '';
  // The employee must be filed under the SAME internal company as the
  // application, otherwise the "Employee" button (which fetches under the
  // active-company header = the application's company) 404s and the detail
  // page shows "belongs to a different company". Default to the application's
  // company; only fall back to the first company when the app has none or its
  // company isn't in the current list. HR can still override via the dropdown.
  const appCompanyId = application?.companyId ? String(application.companyId) : '';
  const defaultCompanyId =
    (appCompanyId && Array.isArray(companies) && companies.some((c) => String(c._id) === appCompanyId))
      ? appCompanyId
      : (companies && companies[0] ? String(companies[0]._id) : '');
  // Strip a trailing requisition suffix like " - 1R" / " - CM" from the
  // job position name so the default Designation reads cleanly. HR can
  // still edit if our heuristic is wrong (B4 mitigation).
  const rawJobName = application?.jobPositionName || '';
  const defaultDesignation = rawJobName.replace(/\s+-\s+[A-Za-z0-9]{1,4}\s*$/, '').trim() || rawJobName;

  const [workEmail, setWorkEmail] = useState('');
  const [managerId, setManagerId] = useState('');
  const [managerName, setManagerName] = useState('');
  const [internalCompanyId, setInternalCompanyId] = useState(defaultCompanyId);
  const [billable, setBillable] = useState(false);
  const [designation, setDesignation] = useState(defaultDesignation);
  const [department, setDepartment] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [employeeCode, setEmployeeCode] = useState('');
  const [errors, setErrors] = useState({});

  // 2026-05-13: load active departments so HR picks from the canonical
  // picklist. Previously this was a free-text input; a typo wrote a
  // dangling name into employee.department (which the employee module
  // expects to be a departments _id ref).
  useEffect(() => {
    if (!show || !orgSlug) return;
    let cancelled = false;
    employeeApi.listDepartments(orgSlug)
      .then((res) => {
        if (cancelled) return;
        const opts = (res?.departments || [])
          .filter((d) => d.isActive !== false)
          .map((d) => ({ value: d.name, label: d.name }));
        setDepartmentOptions(opts);
      })
      .catch(() => { if (!cancelled) setDepartmentOptions([]); });
    return () => { cancelled = true; };
  }, [show, orgSlug]);

  // Pre-fill department from the job's department if it matches an
  // active picklist entry; otherwise leave blank (HR must pick).
  const jobDepartmentName = application?.jobDepartment || '';

  useEffect(() => {
    if (show) {
      setWorkEmail('');
      setManagerId('');
      setManagerName('');
      setInternalCompanyId(defaultCompanyId);
      setBillable(false);
      setDesignation(defaultDesignation);
      setDepartment('');
      setEmployeeCode('');
      setErrors({});
    }
  }, [show, defaultCompanyId, defaultDesignation]);

  // Apply the job-department prefill only once the picklist has loaded
  // so we don't pre-select a name that isn't in the list.
  useEffect(() => {
    if (!show || !jobDepartmentName || departmentOptions.length === 0) return;
    if (departmentOptions.some((o) => o.value === jobDepartmentName)) {
      setDepartment((curr) => curr || jobDepartmentName);
    }
  }, [show, jobDepartmentName, departmentOptions]);

  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!workEmail.trim()) errs.workEmail = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail.trim())) errs.workEmail = 'Invalid email';
    if (!managerId) errs.managerId = 'Pick a reporting manager';
    if (!internalCompanyId) errs.internalCompanyId = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onConfirm({
      workEmail: workEmail.trim(),
      managerId,
      internalCompanyId,
      billable,
      designation: designation.trim() || null,
      department: department.trim() || null,
      employeeCode: employeeCode.trim() || null,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (saving) return; onClose(); } }}
    >
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
        className="bg-dark-850 rounded-2xl border border-dark-700 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-dark-700/70 bg-gradient-to-b from-purple-500/[0.04] to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/15 text-purple-300 flex-shrink-0">
              <UserPlus size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white">Create Employee</h3>
              <p className="text-xs text-dark-400 mt-0.5 truncate">
                From application <span className="text-dark-200 font-medium">{application?.candidateName || 'Candidate'}</span>
                {personalEmail && <> · <span className="font-mono">{personalEmail}</span></>}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-dark-400 hover:text-white transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Identity */}
          <FormSection icon={Mail} title="Identity" hint="How this employee will sign in and be addressed">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <FieldLabel required>Work email</FieldLabel>
                <input
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="firstname.lastname@huemot.com"
                  className="input-field"
                  required
                />
                {errors.workEmail && <p className="text-xs text-red-400 mt-1">{errors.workEmail}</p>}
                {personalEmail && (
                  <p className="text-[11px] text-dark-500 mt-1.5 flex items-center gap-1.5">
                    <IdCard size={11} /> Personal email <span className="font-mono text-dark-400">{personalEmail}</span> will be kept as Private Email.
                  </p>
                )}
              </div>

              <div className="col-span-2 sm:col-span-1">
                <FieldLabel hint="auto-generated if blank">Employee code</FieldLabel>
                <div className="relative">
                  <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
                  <input
                    type="text"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="e.g. 11332247"
                    className="input-field pl-8"
                  />
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 flex items-end">
                <label htmlFor="billable-toggle" className="flex items-center gap-2.5 cursor-pointer w-full px-3 py-2 rounded-md bg-dark-800/60 border border-dark-700 hover:border-dark-600 transition-colors">
                  <input
                    id="billable-toggle"
                    type="checkbox"
                    checked={billable}
                    onChange={(e) => setBillable(e.target.checked)}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-900 accent-rivvra-500"
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-dark-200 font-medium">Billable</div>
                    <div className="text-[11px] text-dark-500">Contractor / consultant</div>
                  </div>
                </label>
              </div>
            </div>
          </FormSection>

          {/* Org placement */}
          <FormSection icon={Building2} title="Org placement" hint="Where this person sits in the org">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel required>Reporting manager</FieldLabel>
                <div className="rounded-md border border-dark-700 bg-dark-900/60 px-2.5 py-1.5 hover:border-dark-600 focus-within:border-rivvra-500 transition-colors">
                  <EmployeeLookup
                    orgSlug={orgSlug}
                    currentValue={managerId}
                    currentName={managerName}
                    onSelect={(id, name) => { setManagerId(id || ''); setManagerName(name || ''); }}
                    editable
                    variant="inline"
                    placeholder="Search employees by name…"
                    allowClear
                  />
                </div>
                {errors.managerId && <p className="text-xs text-red-400 mt-1">{errors.managerId}</p>}
              </div>

              <div className="col-span-2 sm:col-span-1">
                <FieldLabel required>Internal company</FieldLabel>
                <select
                  value={internalCompanyId}
                  onChange={(e) => setInternalCompanyId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select…</option>
                  {(companies || []).map((c) => (
                    <option key={c._id} value={String(c._id)}>{c.name || c.code || String(c._id)}</option>
                  ))}
                </select>
                {errors.internalCompanyId && <p className="text-xs text-red-400 mt-1">{errors.internalCompanyId}</p>}
              </div>

              <div className="col-span-2 sm:col-span-1">
                <FieldLabel hint="from the job, editable">Designation</FieldLabel>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. SOC2 Compliance Analyst"
                  className="input-field"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <FieldLabel hint={departmentOptions.length ? 'inherits from job if available' : 'No departments — add one in Employee → Departments'}>Department</FieldLabel>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="input-field"
                  disabled={departmentOptions.length === 0}
                >
                  <option value="">— Unassigned —</option>
                  {departmentOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.department && <p className="text-xs text-red-400 mt-1">{errors.department}</p>}
              </div>
            </div>
          </FormSection>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-dark-700/70 bg-dark-900/30">
          <button
            type="button"
            onClick={onClose}
            className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 sm:min-w-[160px]"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Create Employee
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Backward Move Reason Modal (Phase-1 / Q13, 2026-05-10) ───────────────
 * Fires when the API rejects a backward stage move with
 * requiresBackwardReason: true. Captures a free-text reason that lands
 * in stageHistory[].reason for audit. Quick-pick chips speed up the
 * common cases; a custom reason is always available.
 */
const BACKWARD_REASON_QUICK_PICKS = [
  'Candidate failed evaluation — re-test required',
  'Salary mismatch — renegotiating',
  'BGV / reference flagged — pause',
  'Candidate withdrew interim',
  'Wrong stage selected by mistake',
];

export function BackwardMoveReasonModal({ show, onClose, onConfirm, saving, fromStage, toStage }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (show) setReason(''); }, [show]);
  if (!show) return null;
  const submit = (e) => {
    e?.preventDefault?.();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  };
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (saving) return; onClose(); } }}
    >
      <form role="dialog" aria-modal="true" onSubmit={submit} className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Reason for moving back</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {fromStage && toStage
                ? <>Stepping back from <span className="text-dark-200">{fromStage}</span> to <span className="text-dark-200">{toStage}</span></>
                : 'Backward stage moves require an audit reason'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {BACKWARD_REASON_QUICK_PICKS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                reason === r
                  ? 'bg-rivvra-500/20 border-rivvra-500/50 text-rivvra-200'
                  : 'bg-dark-900/60 border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Or type a custom reason…"
          className="input-field resize-y w-full"
          required
        />
        <div className="flex items-center gap-3 mt-4">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Move back
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Attachment Upload Modal (Phase-1 / Q14+Q15, 2026-05-10) ──────────────
 * Fires when the API rejects a stage move with requiresAttachment: true.
 * The error response carries `missingAttachments: [{ slug, label, mime,
 * maxSizeMb }, ...]` — one item per missing kind. v1 handles a single
 * required attachment per stage (which is all Huemot needs day-1); the
 * UX naturally extends to multiple by stacking modals.
 *
 * On upload: POSTs to /attachments with the right kind slug, then the
 * parent re-fires the original stage transition.
 */
export function AttachmentUploadModal({ show, onClose, onConfirm, saving, targetStageName, missingAttachment }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (show) { setFile(null); setError(''); } }, [show]);
  if (!show || !missingAttachment) return null;

  const acceptAttr = missingAttachment.mime === 'image/*' ? 'image/*'
    : missingAttachment.mime === 'application/pdf' ? '.pdf,application/pdf'
    : missingAttachment.mime || undefined;
  // Default to the platform-wide 10 MB ceiling when the kind doesn't set
  // its own limit — a null maxSizeMb used to disable the guard entirely
  // and let oversized files bounce off the server's 413 instead.
  const maxSizeMb = missingAttachment.maxSizeMb || 10;
  const maxBytes = maxSizeMb * 1024 * 1024;
  // Friendly type labels — showing the raw MIME string ("application/
  // vnd.openxmlformats-officedocument…") read like an error to recruiters.
  const MIME_LABELS = {
    'image/*': 'Images',
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  };
  const typeLabel = missingAttachment.mime
    ? missingAttachment.mime.split(',')
      .map((m) => MIME_LABELS[m.trim()] || (m.trim().split('/').pop() || m.trim()).toUpperCase())
      .join(', ')
    : 'Any file type';

  const handleFile = (f) => {
    if (!f) { setFile(null); return; }
    if (f.size > maxBytes) {
      setError(`File is larger than ${maxSizeMb} MB`);
      setFile(null);
      return;
    }
    setError('');
    setFile(f);
  };

  const submit = (e) => {
    e?.preventDefault?.();
    if (!file) { setError('Pick a file to upload'); return; }
    onConfirm(file);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (saving) return; onClose(); } }}
    >
      <form role="dialog" aria-modal="true" onSubmit={submit} className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Upload required document</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {targetStageName
                ? <>Required to move to <span className="text-dark-200">{targetStageName}</span>:</>
                : 'Required to advance:'}
              {' '}<span className="text-rivvra-300">{missingAttachment.label}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors flex-shrink-0"><X size={20} /></button>
        </div>

        <label className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          file ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-dark-600 bg-dark-900/40 hover:border-dark-500'
        }`}>
          <input
            type="file"
            accept={acceptAttr}
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          {file ? (
            <div>
              <FileText size={20} className="mx-auto text-emerald-400 mb-1.5" />
              <div className="text-sm text-white font-medium">{file.name}</div>
              <div className="text-xs text-dark-400 mt-0.5">
                {(file.size / 1024 / 1024).toFixed(2)} MB · click to choose a different file
              </div>
            </div>
          ) : (
            <div>
              <UserPlus size={20} className="mx-auto text-dark-500 mb-1.5" />
              <div className="text-sm text-dark-300">Click or drag a file here</div>
              <div className="text-xs text-dark-500 mt-1">
                {typeLabel} · max {maxSizeMb} MB
              </div>
            </div>
          )}
        </label>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <div className="flex items-center gap-3 mt-5">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={saving || !file}
            className="flex-1 flex items-center justify-center gap-2 bg-rivvra-500/15 hover:bg-rivvra-500/25 text-rivvra-300 border border-rivvra-500/40 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Upload &amp; advance
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Interview Schedule Modal (Phase-1 / Q26, 2026-05-11) ────────────────
 * Fires when the API rejects a stage move with requiresInterview: true.
 * Captures: datetime, interviewer (EmployeeLookup), mode (Phone / Video
 * / In-person), meeting link (required when mode=Video), duration. The
 * /interview endpoint also mirrors the datetime onto the legacy
 * application.l1DateTime / l2DateTime / hrDateTime fields so the
 * existing candidate-ICS side-effect on PUT /applications keeps firing.
 */
export const INTERVIEW_LEVEL_LABEL = { l1: 'L1 Interview', l2: 'L2 Interview', hr: 'HR Discussion' };

export function InterviewScheduleModal({ show, onClose, onConfirm, saving, level, targetStageName, existingSlot, orgSlug, isClientRole = false }) {
  const [datetime, setDatetime] = useState('');
  const [interviewerId, setInterviewerId] = useState('');
  const [interviewerName, setInterviewerName] = useState('');
  const [mode, setMode] = useState('Video');
  const [meetingLink, setMeetingLink] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!show) return;
    // Pre-fill from any partial slot the API echoed back. Datetime
    // needs to be in 'YYYY-MM-DDTHH:mm' for <input type=datetime-local>.
    const dt = existingSlot?.datetime ? new Date(existingSlot.datetime) : null;
    setDatetime(dt && !isNaN(dt.getTime()) ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
    setInterviewerId(existingSlot?.interviewerId || '');
    setInterviewerName(existingSlot?.interviewerName || '');
    setMode(existingSlot?.mode || 'Video');
    setMeetingLink(existingSlot?.meetingLink || '');
    setDurationMinutes(existingSlot?.durationMinutes ? String(existingSlot.durationMinutes) : '60');
    setErrors({});
  }, [show, existingSlot]);

  if (!show) return null;
  const levelLabel = INTERVIEW_LEVEL_LABEL[level] || 'Interview';

  const submit = (e) => {
    e?.preventDefault?.();
    const errs = {};
    if (!datetime) errs.datetime = 'Required';
    // 2026-05-11 carve-out: client roles skip interviewer + meeting-link
    // checks because the client schedules directly with the consultant.
    if (!isClientRole && !interviewerId) errs.interviewerId = 'Pick an interviewer';
    if (!mode) errs.mode = 'Required';
    if (!isClientRole && mode === 'Video' && !meetingLink.trim()) errs.meetingLink = 'Meeting link is required for Video';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onConfirm({
      datetime: new Date(datetime).toISOString(),
      interviewerId,
      interviewerName,
      mode,
      meetingLink: meetingLink.trim() || null,
      durationMinutes: Number(durationMinutes) || 60,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (saving) return; onClose(); } }}
    >
      <form role="dialog" aria-modal="true" onSubmit={submit} className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Schedule {levelLabel}</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {targetStageName
                ? <>Required to move to <span className="text-dark-200">{targetStageName}</span></>
                : 'Capture interview details'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors flex-shrink-0"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-dark-300 mb-1">When <span className="text-red-400">*</span></label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              className="input-field"
              required
            />
            {errors.datetime && <p className="text-xs text-red-400 mt-1">{errors.datetime}</p>}
          </div>

          {isClientRole && (
            <div className="col-span-2 -mb-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <p className="text-[11px] text-blue-300">
                Client role — interviewer and meeting link are optional. The client schedules the meeting directly with the consultant.
              </p>
            </div>
          )}

          <div className="col-span-2">
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Interviewer {isClientRole
                ? <span className="text-dark-500 font-normal">(optional)</span>
                : <span className="text-red-400">*</span>}
            </label>
            <div className="rounded-md border border-dark-700 bg-dark-900/60 px-2.5 py-1.5 hover:border-dark-600 focus-within:border-rivvra-500 transition-colors">
              <EmployeeLookup
                orgSlug={orgSlug}
                currentValue={interviewerId}
                currentName={interviewerName}
                onSelect={(id, name) => { setInterviewerId(id || ''); setInterviewerName(name || ''); }}
                editable
                variant="inline"
                placeholder="Search employees by name…"
                allowClear
              />
            </div>
            {errors.interviewerId && <p className="text-xs text-red-400 mt-1">{errors.interviewerId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Mode <span className="text-red-400">*</span></label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="input-field" required>
              <option value="Video">Video</option>
              <option value="Phone">Phone</option>
              <option value="In-person">In-person</option>
            </select>
            {errors.mode && <p className="text-xs text-red-400 mt-1">{errors.mode}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min="15"
              step="15"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="input-field"
            />
          </div>

          {mode === 'Video' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Meeting link {isClientRole
                  ? <span className="text-dark-500 font-normal">(optional)</span>
                  : <span className="text-red-400">*</span>}
              </label>
              <input
                type="url"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="input-field"
                required={!isClientRole}
              />
              {errors.meetingLink && <p className="text-xs text-red-400 mt-1">{errors.meetingLink}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />}
            Schedule &amp; advance
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Interview Result Modal (Phase-1 / Q28+Q29+Q30, 2026-05-11) ──────────
 * Fires when the API rejects a forward move out of an interview stage
 * with requiresInterviewResult. Captures the recommendation
 * (Proceed/Hold/Reject) + free-text notes (Q28-D shape — scorecard
 * deferred to a future phase).
 *
 * Reject path is handled separately by the parent (Q29-B): instead of
 * opening this modal, the parent surfaces a "Refuse this candidate?"
 * confirm that opens the existing Refuse modal. So the recommendation
 * picker here only really shows Proceed / Hold options as the
 * "common" path; Reject is still selectable for completeness but
 * picking it then saving will save the result and the user must
 * explicitly Refuse the application (consistent with Q29-B).
 */
export function InterviewResultModal({ show, onClose, onConfirm, saving, level, targetStageName, existingResult }) {
  const [recommendation, setRecommendation] = useState('Proceed');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!show) return;
    setRecommendation(existingResult?.recommendation || 'Proceed');
    setNotes(existingResult?.notes || '');
    setErrors({});
  }, [show, existingResult]);

  if (!show) return null;
  const levelLabel = INTERVIEW_LEVEL_LABEL[level] || 'Interview';
  const isHoldChange = existingResult?.recommendation === 'Awaited';

  const submit = (e) => {
    e?.preventDefault?.();
    const errs = {};
    if (!recommendation || !['Proceed', 'Awaited', 'Reject'].includes(recommendation)) {
      errs.recommendation = 'Pick one';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onConfirm({ recommendation, notes: notes.trim() });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { if (saving) return; onClose(); } }}
    >
      <form role="dialog" aria-modal="true" onSubmit={submit} className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{levelLabel} Result</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {isHoldChange
                ? <>Currently <span className="text-amber-300">Awaited</span> — change to Proceed (or Reject) to advance to <span className="text-dark-200">{targetStageName}</span></>
                : targetStageName
                  ? <>Required to move to <span className="text-dark-200">{targetStageName}</span></>
                  : 'Capture the interview outcome'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors flex-shrink-0"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label id="interview-rec-label" className="block text-sm font-medium text-dark-300 mb-2">Recommendation <span className="text-red-400">*</span></label>
            {/* 2026-05-17 health-check E.1: three mutually-exclusive
                buttons get role=radiogroup so screen readers announce
                "1 of 3" and arrow keys work as expected. */}
            <div role="radiogroup" aria-labelledby="interview-rec-label" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                // 2026-05-17 health-check P0: explicit class strings instead
                // of `bg-${tone}-500/15` template literals. Tailwind's JIT
                // can only safelist class names it can see at build time;
                // dynamic templates silently produce un-styled buttons in
                // the production build (selected state didn't highlight).
                { val: 'Proceed', selected: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200', hint: 'Advance to next stage' },
                { val: 'Awaited', selected: 'bg-amber-500/15 border-amber-500/50 text-amber-200',       hint: 'Pause — undecided' },
                { val: 'Reject',  selected: 'bg-red-500/15 border-red-500/50 text-red-200',             hint: 'Decline — refuse' },
              ].map(({ val, selected, hint }) => (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={recommendation === val}
                  onClick={() => setRecommendation(val)}
                  className={`flex flex-col items-start text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    recommendation === val
                      ? selected
                      : 'bg-dark-900/40 border-dark-700 text-dark-300 hover:border-dark-600'
                  }`}
                >
                  <span className="text-sm font-semibold">{val}</span>
                  <span className="text-[11px] text-dark-500 mt-0.5">{hint}</span>
                </button>
              ))}
            </div>
            {errors.recommendation && <p className="text-xs text-red-400 mt-1">{errors.recommendation}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Notes <span className="text-dark-500 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Why? Anything HR / Offer-stage should know — strengths, gaps, salary signals…"
              className="input-field resize-y w-full"
            />
          </div>

          {recommendation === 'Reject' && (
            <p className="text-[11px] text-amber-400/80">
              Saving as Reject just records the result — it doesn't terminate the application. Use the Refuse button after to refuse the candidate.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />}
            Save result
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Move-to-Stage Dropdown ───────────────────────────────────────────── */
export function MoveStageDropdown({ stages, currentStageId, isOpen, onToggle, onSelect, disabled = false }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Move to...
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-1.5 min-w-[180px] max-w-[calc(100vw-1.5rem)] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20 max-h-60 overflow-y-auto">
            {stages.filter((s) => s._id !== currentStageId).map((s) => (
              <button
                key={s._id}
                disabled={disabled}
                onClick={() => { if (!disabled) onSelect(s._id); }}
                className="w-full text-left px-3 py-2 text-sm text-dark-300 hover:bg-dark-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Result options for interview rounds ─────────────────────────────── */
const RESULT_OPTIONS = [
  { value: 'awaited', label: 'Awaited' },
  { value: 'selected', label: 'Selected' },
  { value: 'rejected', label: 'Rejected' },
];

export const EVAL_OPTIONS = [
  { value: 0, label: 'No rating' },
  { value: 1, label: '★ Good' },
  { value: 2, label: '★★ Very good' },
  { value: 3, label: '★★★ Excellent' },
];

/* ── Main component ──────────────────────────────────────────────────── */

export function InterviewRoundCard({
  label,
  level,                 // 'l1' | 'l2' | 'hr'
  interviewField,        // 'l1Interview' | 'l2Interview' | 'hrInterview'
  resultField,           // 'l1Result' | 'l2Result' | 'hrResult'
  dateField,             // 'l1DateTime' | ... (legacy fallback)
  feedbackField,         // 'l1Feedback' | ... (legacy fallback)
  application,
  canEdit,
  isClientRole = false,
  onEditSchedule,        // (level, existingSlot, isClientRole) => void
  onEditResult,          // (level, existingResult) => void
  // 2026-05-17 Phase N: orgPath passed from parent so we can build the
  // /employee/:id link for the interviewer when the slot has an id.
  orgPath,
  // 2026-05-25 regression fix: applicationId was being referenced from
  // closure but InterviewRoundCard is a module-level function so the
  // reference threw "applicationId is not defined" when the
  // interviewer-id Link was rendered. Pass it explicitly.
  applicationId,
}) {
  const slot = application[interviewField];
  const isSlotObject = slot != null && typeof slot === 'object';

  const rawResult = application[resultField];
  const isResultSubdoc = rawResult != null && typeof rawResult === 'object';
  const resultRecommendation = isResultSubdoc ? (rawResult.recommendation || '') : (rawResult || '');
  const resultNotes = isResultSubdoc ? (rawResult.notes || '') : '';

  // Datetime resolution: prefer the structured subdoc, fall back to the
  // legacy flat field that imports populate.
  const datetimeRaw = isSlotObject ? slot.datetime : application[dateField];
  const datetimeFormatted = (() => {
    if (!datetimeRaw) return '';
    const d = new Date(datetimeRaw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  })();

  const interviewerName = isSlotObject ? (slot.interviewerName || '') : '';
  // 2026-05-17 Phase N: surface interviewerId so we can link to /employee.
  const interviewerId = isSlotObject ? (slot.interviewerId || '') : '';
  const mode = isSlotObject ? (slot.mode || '') : '';
  const meetingLink = isSlotObject ? (slot.meetingLink || '') : '';
  const durationMin = isSlotObject ? (slot.durationMinutes || null) : null;

  // Feedback fallback to legacy free-text field for imported records.
  const feedbackText = resultNotes
    || application[feedbackField]
    || '';

  // What state is this round in? Drives the Edit-button behaviour and
  // the chips shown.
  const hasSchedule = !!datetimeRaw;
  const hasResult = !!resultRecommendation;
  const isUnscheduled = !hasSchedule && !hasResult && !feedbackText;

  // Result chip color + label.
  const resultChip = (() => {
    if (!resultRecommendation) return null;
    const r = String(resultRecommendation).toLowerCase();
    const tone = r === 'proceed' || r === 'selected' ? 'emerald'
      : r === 'reject' || r === 'rejected' ? 'red'
      : r === 'awaited' || r === 'hold' ? 'amber'
      : 'sky';
    const cls = {
      emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      red:     'bg-red-500/10 text-red-300 border-red-500/30',
      amber:   'bg-amber-500/10 text-amber-300 border-amber-500/30',
      sky:     'bg-sky-500/10 text-sky-300 border-sky-500/30',
    }[tone];
    return (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
        {resultRecommendation}
      </span>
    );
  })();

  // Edit-button label + handler. When unscheduled → schedule modal.
  // When scheduled but no result → result modal. When both → menu
  // would be ideal but a single button that opens the result modal
  // is what recruiters reach for most often; "Reschedule" stays as
  // a smaller affordance below.
  const primaryEditAction = (() => {
    if (!canEdit) return null;
    if (!hasSchedule) {
      return {
        label: 'Schedule',
        onClick: () => onEditSchedule?.(level, slot || null, isClientRole),
      };
    }
    if (!hasResult) {
      return {
        label: 'Capture result',
        onClick: () => onEditResult?.(level, isResultSubdoc ? rawResult : null),
      };
    }
    return {
      label: 'Edit result',
      onClick: () => onEditResult?.(level, isResultSubdoc ? rawResult : null),
    };
  })();

  return (
    <div className="bg-dark-900/40 border border-dark-700/70 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
            {label} Interview
          </h4>
          {resultChip}
        </div>
        {primaryEditAction && (
          <button
            type="button"
            onClick={primaryEditAction.onClick}
            className="text-xs text-rivvra-300 hover:text-rivvra-200 border border-rivvra-500/30 rounded px-2 py-0.5 transition-colors"
          >
            {primaryEditAction.label}
          </button>
        )}
      </div>

      {isUnscheduled ? (
        <p className="text-dark-500 text-xs">Not scheduled.</p>
      ) : (
        <div className="space-y-1.5 text-xs">
          {datetimeFormatted ? (
            <div className="flex items-start gap-2">
              <Calendar size={12} className="text-dark-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-dark-200">{datetimeFormatted}</span>
                {durationMin ? <span className="text-dark-500"> · {durationMin} min</span> : null}
              </div>
            </div>
          ) : null}
          {interviewerName ? (
            <div className="flex items-start gap-2">
              <User size={12} className="text-dark-500 mt-0.5 flex-shrink-0" />
              {/* 2026-05-17 Phase N: Link to /employee when slot carries
                  interviewerId. Falls back to plain text when migrated
                  records have only the name. */}
              {interviewerId && orgPath ? (
                <Link
                  to={withFromContext(orgPath(`/employee/${interviewerId}`), 'ats_application', applicationId)}
                  className="text-dark-200 truncate hover:text-rivvra-300 hover:underline"
                >
                  {interviewerName}
                </Link>
              ) : (
                <span className="text-dark-200 truncate">{interviewerName}</span>
              )}
            </div>
          ) : null}
          {mode || meetingLink ? (
            <div className="flex items-start gap-2">
              <span className="w-3 flex-shrink-0" aria-hidden />
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                {mode ? <span className="text-[10px] uppercase tracking-wider text-dark-500 bg-dark-800 px-1.5 py-0.5 rounded">{mode}</span> : null}
                {meetingLink ? (
                  <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="text-rivvra-400 hover:text-rivvra-300 underline-offset-2 hover:underline truncate">
                    Join meeting
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
          {feedbackText ? (
            <div className="flex items-start gap-2 pt-1">
              <MessageSquare size={12} className="text-dark-500 mt-0.5 flex-shrink-0" />
              <p className="text-dark-300 whitespace-pre-wrap leading-relaxed">{feedbackText}</p>
            </div>
          ) : null}
          {hasSchedule && canEdit && (
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => onEditSchedule?.(level, slot || null, isClientRole)}
                className="text-[11px] text-dark-400 hover:text-dark-200 transition-colors"
              >
                Reschedule
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
