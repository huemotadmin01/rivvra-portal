import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/formatCurrency';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import ActivityPanel from '../../components/shared/ActivityPanel';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import SkillsPicker from '../../components/ats/SkillsPicker';
import AttachmentsPanel from '../../components/ats/AttachmentsPanel';
import InlineField from '../../components/shared/InlineField';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import RecordMeta from '../../components/shared/RecordMeta';
import ReasonPromptDialog from '../../components/shared/ReasonPromptDialog';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, Star, X, ChevronDown, ChevronLeft,
  User, Briefcase, FileText, Tag, Calendar,
  XCircle, Award,
  ExternalLink,
  PenTool, FileSignature, UserPlus, UserCheck,
  DollarSign, Mail, Building2, Hash, IdCard,
  Archive, ArchiveRestore, MoreHorizontal, Trash2,
  MessageSquare, AlertCircle,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import { getEmploymentTypeMeta, SALARY_UNIT_INPUT } from '../../utils/atsEmploymentTypes';

/* ── Kanban State Dot ─────────────────────────────────────────────────── */
const KANBAN_STATES = ['normal', 'done', 'blocked'];
const KANBAN_COLORS = { normal: 'bg-gray-400', done: 'bg-emerald-400', blocked: 'bg-red-400' };
const KANBAN_LABELS = { normal: 'Normal', done: 'Done', blocked: 'Blocked' };

function KanbanDot({ state = 'normal', onClick }) {
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
function StageBar({ stages, currentStageId, onStageClick }) {
  const currentIdx = stages.findIndex((s) => s._id === currentStageId);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((stage, idx) => {
        let cls = 'bg-dark-700 text-dark-400';
        if (idx < currentIdx) cls = 'bg-emerald-500/20 text-emerald-400';
        if (idx === currentIdx) cls = 'bg-rivvra-500 text-white';
        return (
          <button
            key={stage._id}
            onClick={() => onStageClick?.(stage._id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all hover:opacity-80 ${cls}`}
          >
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}

/* ── Refuse Modal ─────────────────────────────────────────────────────── */
function RefuseModal({ show, onClose, onConfirm, reasons, saving }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (show) setReason(''); }, [show]);
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Refuse Application</h3>
          <button onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Reason for refusal</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="input-field">
              <option value="">Select reason...</option>
              {reasons.map((r) => (
                <option key={r._id || r} value={r.name || r}>{r.name || r}</option>
              ))}
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
            <button onClick={() => onConfirm(reason)} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              {saving && <Loader2 size={16} className="animate-spin" />}
              Refuse Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
function HireModal({ show, onClose, onConfirm, saving, mode = 'hire', targetStageName, requireSignedDoc = false, initialOffer = null, application = null, companies = [], orgSlug = null, offerLevel = 'full', onRefresh = null }) {
  // Phase-1 / Q21+Q22 (2026-05-10): the salary input adapts to the
  // application's employment type. Contract → "Day rate" + per_day unit;
  // Full-Time / Internal Consultant → "Annual CTC (LPA)" + lpa unit.
  // Falls back to LPA for legacy applications without a picklist value.
  const empMeta = getEmploymentTypeMeta(application?.employmentType);
  const salaryUnit = empMeta.salaryUnit;
  const salaryLabel = empMeta.salaryLabel;
  const salaryInputCfg = SALARY_UNIT_INPUT[salaryUnit] || SALARY_UNIT_INPUT.lpa;

  // Phase-1 / Q23 (2026-05-10): progressive offer gate. Only the salary
  // block is required at the L1 Interview gate (offerLevel='salary');
  // joining date / notice / probation become required at Offer Proposal
  // (offerLevel='full'); signed-doc is required at Offer Signed
  // (offerLevel='signed') and at the Hire button. The Hire button passes
  // mode='hire' which always requires the full offer.
  const fullOfferRequired = mode === 'hire' || offerLevel !== 'salary';
  const signedDocRequiredEffective = (mode === 'offer' && offerLevel === 'signed') || requireSignedDoc;

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

  // Local-TZ YYYY-MM-DD so the `min` on the date input and the
  // "cannot be in the past" guard agree with what the recruiter sees
  // in their browser. Using new Date().toISOString() was UTC-based,
  // which marked today as past for users west of UTC and let users
  // east of UTC pick yesterday.
  const ymdLocal = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  // 2026-05-17 health-check G.2: useMemo. `today` was recomputed every
  // render and used as a useEffect dep below, causing a fresh state
  // re-init on every parent re-render. Memo gives stable identity for
  // the lifetime of the modal mount.
  const today = useMemo(() => ymdLocal(new Date()), []);
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

  useEffect(() => {
    if (show) {
      // Re-prefill on every open. Falls back to defaults when no initialOffer.
      setJoiningDate(initialOffer?.joiningDate ? new Date(initialOffer.joiningDate).toISOString().slice(0, 10) : today);
      setCurrency(initialOffer?.offeredCTC?.currency || 'INR');
      setAmount(initialOffer?.offeredCTC?.amount ? String(initialOffer.offeredCTC.amount) : '');
      setNoticePeriodDays(initialOffer?.noticePeriodDays != null ? String(initialOffer.noticePeriodDays) : '30');
      setProbationMonths(initialOffer?.probationMonths != null ? String(initialOffer.probationMonths) : '6');
      setSignedOfferDocId(initialOffer?.signedOfferDocId || '');
      setErrors({});
    }
  }, [show, today, initialOffer]);

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
    if (fullOfferRequired && Number.isFinite(np) && np >= 0) terms.push(`Notice period: ${np} days`);
    if (fullOfferRequired && Number.isFinite(pm) && pm > 0) terms.push(`Probation: ${pm} months`);
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
  }, [show, candSignName, application?.candidateName, jobTitle, orgCompanyName, amount, currency, salaryUnit, joiningDate, noticePeriodDays, probationMonths, fullOfferRequired]);

  useEffect(() => {
    if (!show) return;
    setSignSubjectDirty(false);
    setSignMessageDirty(false);
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
      const fields = err?.fieldErrors;
      const msg = fields ? Object.entries(fields)[0]?.join(': ') : null;
      setSignError(msg || err?.message || 'Failed to send for signature');
    } finally {
      setSendingEnv(false);
    }
  };

  const isOfferMode = mode === 'offer';
  const isSalaryOnlyMode = isOfferMode && offerLevel === 'salary';
  const headerTitle = isSalaryOnlyMode
    ? 'Salary Proposed'
    : (isOfferMode ? 'Offer Details' : 'Confirm Hire');
  const headerSub = isSalaryOnlyMode
    ? (targetStageName ? `Capture salary proposed to move to ${targetStageName}` : 'Capture salary proposed')
    : isOfferMode
      ? (targetStageName ? `Capture offer details to move to ${targetStageName}` : 'Capture offer details')
      : 'Capture offer details before marking as hired';
  // Phase-1 / Q23 (2026-05-10): the L1-gate variant of the modal is a
  // "Salary Proposed" capture, not a full offer. Title and submit
  // label adapt accordingly.
  const submitLabel = isSalaryOnlyMode ? 'Save Salary Proposed' : (isOfferMode ? 'Save Offer Details' : 'Confirm Hire');
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
    // Salary block — required at every level (L1 gate, Offer Proposal, Hire).
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) errs.amount = 'Must be > 0';

    // Joining date / notice / probation only required when fullOfferRequired.
    if (fullOfferRequired) {
      if (!joiningDate || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) errs.joiningDate = 'Required';
      else if (joiningDate < today) errs.joiningDate = 'Cannot be in the past';
      const np = Number(noticePeriodDays);
      if (!Number.isFinite(np) || np < 0) errs.noticePeriodDays = '0 or more';
      const pm = Number(probationMonths);
      if (!Number.isFinite(pm) || pm < 0) errs.probationMonths = '0 or more';
    }
    if (signedDocRequiredEffective && !signedOfferDocId.trim()) {
      errs.signedOfferDocId = 'Signed offer document is required for this stage';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onConfirm({
      offer: {
        // Salary always sent; other fields only when the user filled them
        // (lets the L1-gate save just-the-salary without overwriting any
        // joiningDate/notice/probation that may already exist on the
        // application's offer subdoc — /offer endpoint handles partial).
        offeredCTC: { currency, amount: amt, unit: salaryUnit },
        ...(fullOfferRequired ? {
          joiningDate,
          noticePeriodDays: Number(noticePeriodDays),
          probationMonths: Number(probationMonths),
          signedOfferDocId: signedOfferDocId.trim() || null,
        } : {}),
      },
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
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
        {fullOfferRequired && (
          <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">Offer terms</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {fullOfferRequired && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-dark-300 mb-1">Joining date <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                min={today}
                className="input-field"
                required
              />
              {errors.joiningDate && <p className="text-xs text-red-400 mt-1">{errors.joiningDate}</p>}
            </div>
          )}

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
            <p className="text-[11px] text-dark-500 mt-1">{salaryInputCfg.helper}{application?.employmentType ? ` · matches ${application.employmentType} job type` : ''}</p>
            {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
          </div>

          {fullOfferRequired && (
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
          )}

          {fullOfferRequired && (
          <div className="col-span-2 pt-3 mt-1 border-t border-dark-700/60">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">Offer signature</div>
              <div className="text-[11px] text-dark-500">
                {signedDocRequiredEffective
                  ? <span className="text-red-400">Required</span>
                  : 'Optional'}
              </div>
            </div>

            {signedOfferDocId ? (
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
                        Sent {formatDateUTC(application.offer.signEnvelopeSentAt)}
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
                        Confirm disconnect
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirm(false)}
                        className="text-xs text-dark-400 hover:text-white px-2 py-1 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDisconnectConfirm(true)}
                      title="Disconnects the envelope from the offer. The Sign request itself isn't cancelled — cancel it from the Sign module separately if needed."
                      className="text-xs text-dark-400 hover:text-white px-2 py-1 transition-colors flex-shrink-0"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-dark-500 mt-2">
                  Once both Director and Candidate sign in the Sign module, this offer will mark itself as signed automatically and the Offer Signed stage gate will pass.
                </p>
                {signError && <p className="text-[11px] text-red-400 mt-2">{signError}</p>}
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

                <div className="grid grid-cols-2 gap-3">
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
                {errors.signedOfferDocId && !signError && <p className="text-xs text-red-400">{errors.signedOfferDocId}</p>}

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
            {!signedDocRequiredEffective && !signedOfferDocId && (
              <p className="text-xs text-dark-500 mt-1.5">If blank, the application will show a "signed offer missing" warning until added.</p>
            )}
          </div>
          )}
          {isSalaryOnlyMode && (
            <div className="col-span-2 rounded-md border border-dark-700 bg-dark-900/40 p-2.5">
              <p className="text-[11px] text-dark-400">
                Just the salary is needed at this stage. Joining date, notice period and offer signature will be captured later when moving to <span className="text-dark-200">Offer Proposal</span>.
              </p>
            </div>
          )}
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
function FormSection({ icon: Icon, title, hint, children }) {
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

function FieldLabel({ children, required, hint }) {
  return (
    <label className="block mb-1.5">
      <span className="text-xs font-medium text-dark-300">
        {children}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[11px] text-dark-500 ml-2">{hint}</span>}
    </label>
  );
}

function CreateEmployeeDrawer({ show, onClose, onConfirm, saving, application, companies, orgSlug }) {
  const personalEmail = application?.email || '';
  const defaultCompanyId = companies && companies[0] ? String(companies[0]._id) : '';
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            className="flex items-center justify-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 min-w-[160px]"
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

function BackwardMoveReasonModal({ show, onClose, onConfirm, saving, fromStage, toStage }) {
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
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
function AttachmentUploadModal({ show, onClose, onConfirm, saving, targetStageName, missingAttachment }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (show) { setFile(null); setError(''); } }, [show]);
  if (!show || !missingAttachment) return null;

  const acceptAttr = missingAttachment.mime === 'image/*' ? 'image/*'
    : missingAttachment.mime === 'application/pdf' ? '.pdf,application/pdf'
    : missingAttachment.mime || undefined;
  const maxBytes = missingAttachment.maxSizeMb ? missingAttachment.maxSizeMb * 1024 * 1024 : null;

  const handleFile = (f) => {
    if (!f) { setFile(null); return; }
    if (maxBytes && f.size > maxBytes) {
      setError(`File is larger than ${missingAttachment.maxSizeMb} MB`);
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
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
                {missingAttachment.mime || 'Any type'}
                {missingAttachment.maxSizeMb ? ` · max ${missingAttachment.maxSizeMb} MB` : ''}
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
const INTERVIEW_LEVEL_LABEL = { l1: 'L1 Interview', l2: 'L2 Interview', hr: 'HR Discussion' };

function InterviewScheduleModal({ show, onClose, onConfirm, saving, level, targetStageName, existingSlot, orgSlug, isClientRole = false }) {
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
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

        <div className="grid grid-cols-2 gap-4">
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
function InterviewResultModal({ show, onClose, onConfirm, saving, level, targetStageName, existingResult }) {
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
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
            <div role="radiogroup" aria-labelledby="interview-rec-label" className="grid grid-cols-3 gap-2">
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
function MoveStageDropdown({ stages, currentStageId, isOpen, onToggle, onSelect }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200"
      >
        Move to...
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-1.5 min-w-[180px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20 max-h-60 overflow-y-auto">
            {stages.filter((s) => s._id !== currentStageId).map((s) => (
              <button
                key={s._id}
                onClick={() => onSelect(s._id)}
                className="w-full text-left px-3 py-2 text-sm text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
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

const EVAL_OPTIONS = [
  { value: 0, label: 'No rating' },
  { value: 1, label: '★ Good' },
  { value: 2, label: '★★ Very good' },
  { value: 3, label: '★★★ Excellent' },
];

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsApplicationDetail() {
  const { applicationId } = useParams();
  const { currentOrg, getAppRole, isOrgAdmin } = useOrg();
  const { currentCompany, companies } = useCompany();
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
  const fmtSalary = (v) =>
    v == null || v === '' || Number(v) === 0 ? null : formatCurrency(v, companyCurrency);

  const [application, setApplication] = useState(null);
  usePageTitle(application?.candidateName);
  const [loading, setLoading] = useState(true);

  // Dropdown data
  const [stages, setStages] = useState([]);
  const [refuseReasons, setRefuseReasons] = useState([]);
  const [recruiters, setRecruiters] = useState([]);

  // Modal / action UI state
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  // editOfferOnly: opens the HireModal in 'offer' mode without any
  // pending stage move — used by the header "Offer" button so the
  // recruiter can view / edit / Revise the offer (including
  // already-signed ones) without having to drag the chip past a gate.
  const [editOfferOnly, setEditOfferOnly] = useState(false);
  // P0.2 (2026-05-10): when a stage transition into Offer Proposal /
  // Offer Signed is rejected by the API gate, we open the same HireModal
  // in 'offer' mode so the recruiter can capture the data and we then
  // re-fire the original transition. `pendingStageMove` carries the
  // target stage so the success handler knows what to retry.
  //   { stageId, stageName, requireSignedDoc } | null
  const [pendingStageMove, setPendingStageMove] = useState(null);
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
  const [actionSaving, setActionSaving] = useState(false);
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;
  // Canonical status field on ats_applications is `applicationStatus`
  // ('ongoing' | 'hired' | 'refused'). Tolerate the legacy `status` alias
  // in case any caller still emits it, but prefer the canonical one.
  const appStatus = application?.applicationStatus || application?.status;
  const isTerminal = appStatus === 'hired' || appStatus === 'refused';
  const canEdit = isAdmin && !application?.archived && !isTerminal;
  // People fields stay editable on `refused` apps too — only `hired` locks
  // them, since changing the recruiter on a closed-loss record is a normal
  // attribution correction. Mirrors the user request 2026-05-10.
  const canEditPeople = isAdmin && !application?.archived && appStatus !== 'hired';

  // ── Fetch application ─────────────────────────────────────────────────
  const fetchApplication = useCallback(async () => {
    if (!orgSlug || !applicationId) return;
    setLoading(true);
    try {
      const res = await atsApi.getApplication(orgSlug, applicationId);
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
        };
        setApplication(merged);
      }
    } catch (err) {
      console.error('Failed to load application:', err);
      showToast('Failed to load application', 'error');
    } finally {
      setLoading(false);
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
      fetchApplication();
    } catch (err) {
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
        showToast('Click the Offer button (top right) to capture the offer details first.', 'warning');
        return;
      }
      if (err?.requiresHire) {
        showToast('Click the Hire button (top right) to capture offer details and mark as hired.', 'warning');
        return;
      }
      showToast(err.message || 'Failed to move stage', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  const handleRefuse = async (reason) => {
    try {
      setActionSaving(true);
      await atsApi.refuseApplication(orgSlug, applicationId, { reason });
      showToast('Application refused');
      setShowRefuseModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to refuse application', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // P0.1+P0.2 (2026-05-10): single submit handler for the HireModal,
  // which now operates in two modes. When pendingStageMove is set, the
  // modal is being shown to satisfy a stage gate (Offer Proposal /
  // Offer Signed) — save via /offer then re-fire the original stage
  // transition. Otherwise it's the Hire flow — call /hire as before.
  const handleHire = async (payload) => {
    const isOfferOnly = !!pendingStageMove || editOfferOnly;
    try {
      setActionSaving(true);
      if (isOfferOnly) {
        const res = await atsApi.updateOffer(orgSlug, applicationId, payload);
        const warns = Array.isArray(res?.warnings) ? res.warnings : [];
        if (warns.includes('signed_offer_missing') && !pendingStageMove?.requireSignedDoc) {
          showToast('Offer details saved — signed offer still missing.', 'warning');
        } else {
          showToast('Offer details saved');
        }
        // Retry the original stage transition only when this save was
        // triggered by a stage gate. The standalone "Offer" entry
        // point (editOfferOnly) just saves and closes.
        const targetId = pendingStageMove?.stageId || null;
        setPendingStageMove(null);
        setEditOfferOnly(false);
        setShowHireModal(false);
        if (targetId) {
          // 2026-05-12: route the retry through handleMoveStage so a
          // subsequent gate failure opens the next modal automatically
          // instead of dead-ending in a toast. Was: atsApi.moveStage
          // direct → 400 with requiresInterview just rendered as a
          // generic toast, recruiter had to click Move again.
          await handleMoveStage(targetId);
        }
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
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20">
          <h3 className="text-lg font-semibold text-white mb-2">Application not found</h3>
          <p className="text-dark-400 text-sm">The application may have been deleted or you don't have access.</p>
        </div>
      </div>
    );
  }

  const currentStageId = application.stageId?._id || application.stageId;
  const currentStageName = application.stageName || application.stageId?.name || 'Unknown';

  return (
    <div className="p-6 md:p-8 space-y-6">
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
          </div>
          <p className="text-dark-400 text-sm">
            {application.jobName || application.jobId?.name || 'No position assigned'}
          </p>
        </div>

        {/* Action buttons */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <>
                <MoveStageDropdown
                  stages={stages}
                  currentStageId={currentStageId}
                  isOpen={showMoveDropdown}
                  onToggle={() => setShowMoveDropdown((p) => !p)}
                  onSelect={handleMoveStage}
                />
                {application?.offer?.offeredCTC && (
                  <button
                    onClick={() => { setEditOfferOnly(true); setShowHireModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
                    title="View, edit, or revise the captured offer"
                  >
                    <FileSignature size={14} /> Offer
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
            {application.hireDate && !application.employeeId && (
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
                onClick={() => navigate(`/org/${orgSlug}/employee/${application.employeeId}`)}
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
              <button
                onClick={handleUnarchiveApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
              >
                <ArchiveRestore size={14} /> Unarchive
              </button>
            ) : (
              <button
                onClick={handleArchiveApp}
                disabled={archiving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all text-dark-300 border-transparent hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30 disabled:opacity-50"
              >
                {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                Archive
              </button>
            )}
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
                    <div className="absolute right-0 top-full mt-1 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1">
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
        <StageBar
          stages={stages}
          currentStageId={currentStageId}
          onStageClick={canEdit ? handleMoveStage : undefined}
        />
      )}

      {/* Body: main + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Candidate" icon={User}>
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
                ? <span className="text-amber-400">{'★'.repeat(application.evaluation)}</span>
                : undefined}
            />
            {application.candidateId && (
              <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                <span className="text-dark-400 text-sm">Profile</span>
                <Link
                  to={orgPath(`/ats/candidates/${application.candidateId}`)}
                  className="text-rivvra-400 hover:text-rivvra-300 text-sm underline-offset-2 hover:underline"
                >
                  Open candidate record →
                </Link>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Job" icon={Briefcase}>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Position</span>
              {application.jobPositionId ? (
                <Link
                  to={orgPath(`/ats/jobs/${application.jobPositionId}`)}
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
              linkTo={(id) => orgPath(`/employee/${id}`)}
              onSelect={(id, name) => savePerson('recruiterId', 'recruiterName', id, name)}
            />
            {/* Account Owner — read-only mirror of the linked Job Position.
                Edit it on the Job page and it propagates to every app. */}
            <EmployeeLookup
              orgSlug={orgSlug}
              label="Account Owner"
              currentValue={application.accountOwnerId}
              currentName={application.accountOwnerName}
              editable={false}
              linkTo={(id) => orgPath(`/employee/${id}`)}
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
                Edit it on the Job page and it propagates to every app. */}
            <InlineField
              label="Client Name"
              field="clientName"
              value={application.clientName}
              editable={false}
            />
          </SectionCard>

          <SectionCard title="Compensation" icon={DollarSign}>
            <InlineField
              label="Salary Expected"
              field="salaryExpected"
              value={application.salaryExpected}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtSalary(application.salaryExpected) || undefined}
            />
            <InlineField
              label="Salary Proposed"
              field="salaryProposed"
              value={application.salaryProposed}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtSalary(application.salaryProposed) || undefined}
            />
          </SectionCard>

          <SectionCard title="Sourcing" icon={FileText}>
            <InlineField label="Source" field="source" value={application.source} editable={canEdit} onSave={saveField} placeholder="e.g. Naukri, Referral" />
            <InlineField label="Medium" field="medium" value={application.medium} editable={canEdit} onSave={saveField} placeholder="e.g. Online, Email" />
            <InlineField label="Degree" field="degree" value={application.degree} editable={canEdit} onSave={saveField} placeholder="e.g. B.Tech, MBA" />
            <InlineField label="Availability" field="availability" value={application.availability} editable={canEdit} onSave={saveField} placeholder="e.g. 30 days notice" />
            <InlineField label="Applied On" field="appliedOn" value={application.appliedOn} type="date" editable={canEdit} onSave={saveField} />
            <InlineField label="Notes" field="note" value={application.note} type="textarea" editable={canEdit} onSave={saveField} placeholder="Internal notes…" />
          </SectionCard>

          <SectionCard title="Skills" icon={Award}>
            {application.candidateId ? (
              <SkillsPicker orgSlug={orgSlug} candidateId={application.candidateId} readOnly={!isAdmin} />
            ) : (
              <p className="text-dark-500 text-sm py-2">No candidate linked.</p>
            )}
          </SectionCard>

          <SectionCard title="Attachments" icon={FileSignature}>
            <AttachmentsPanel orgSlug={orgSlug} applicationId={applicationId} readOnly={!isAdmin} />
          </SectionCard>

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

          <SectionCard title="Interview" icon={Calendar}>
            <div className="space-y-2.5">
              <InterviewRoundCard
                label="L1"
                level="l1"
                interviewField="l1Interview"
                resultField="l1Result"
                dateField="l1DateTime"
                feedbackField="l1Feedback"
                application={application}
                canEdit={canEdit}
                isClientRole={application.isClientRole === true}
                onEditSchedule={openInterviewScheduleModal}
                onEditResult={openInterviewResultModal}
              />
              <InterviewRoundCard
                label="L2"
                level="l2"
                interviewField="l2Interview"
                resultField="l2Result"
                dateField="l2DateTime"
                feedbackField="l2Feedback"
                application={application}
                canEdit={canEdit}
                isClientRole={application.isClientRole === true}
                onEditSchedule={openInterviewScheduleModal}
                onEditResult={openInterviewResultModal}
              />
              <InterviewRoundCard
                label="HR"
                level="hr"
                interviewField="hrInterview"
                resultField="hrResult"
                dateField="hrDateTime"
                feedbackField="hrRoundFeedback"
                application={application}
                canEdit={canEdit}
                isClientRole={false}
                onEditSchedule={openInterviewScheduleModal}
                onEditResult={openInterviewResultModal}
              />
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
          </SectionCard>

        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <SectionCard title="Tags" icon={Tag}>
            {(application.tags && application.tags.length > 0) ? (
              <div className="flex flex-wrap gap-1.5 py-2">
                {application.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 text-dark-300">
                    {typeof tag === 'string' ? tag : tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-dark-500 text-xs py-1">No tags.</p>
            )}
          </SectionCard>

          {appStatus === 'refused' && (
            <SectionCard className="border-red-500/20" title="Refused" icon={XCircle}>
              <p className="text-dark-300 text-sm py-1">
                {application.refuseReason || 'No reason provided'}
              </p>
              {application.refusedAt && (
                <p className="text-dark-500 text-xs mt-2">
                  Refused on {formatDate(application.refusedAt)}
                </p>
              )}
            </SectionCard>
          )}

          <SectionCard title="Pipeline" icon={UserCheck}>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Status</span>
              <span className="text-white text-sm capitalize">{application.applicationStatus || 'ongoing'}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Kanban</span>
              <span className="text-white text-sm">{KANBAN_LABELS[application.kanbanState] || 'Normal'}</span>
            </div>
          </SectionCard>

          <SectionCard>
            <RecordMeta
              createdAt={application.createdAt}
              createdByName={application.createdByName}
              updatedAt={application.updatedAt}
              updatedByName={application.updatedByName}
            />
          </SectionCard>

          <SectionCard title="Activity" icon={Star}>
            <ActivityPanel orgSlug={orgSlug} entityType="ats_application" entityId={applicationId} />
          </SectionCard>
        </div>
      </div>

      {/* Modals */}
      <RefuseModal
        show={showRefuseModal}
        onClose={() => setShowRefuseModal(false)}
        onConfirm={handleRefuse}
        reasons={refuseReasons}
        saving={actionSaving}
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
      <HireModal
        show={showHireModal}
        onClose={() => { setShowHireModal(false); setPendingStageMove(null); setEditOfferOnly(false); }}
        onConfirm={handleHire}
        saving={actionSaving}
        mode={(pendingStageMove || editOfferOnly) ? 'offer' : 'hire'}
        targetStageName={pendingStageMove?.stageName}
        requireSignedDoc={pendingStageMove?.requireSignedDoc === true}
        offerLevel={pendingStageMove?.offerLevel || 'full'}
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
function InterviewRoundCard({
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
    return d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  })();

  const interviewerName = isSlotObject ? (slot.interviewerName || '') : '';
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
              <span className="text-dark-200 truncate">{interviewerName}</span>
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
