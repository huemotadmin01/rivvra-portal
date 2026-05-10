import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/formatCurrency';
import atsApi from '../../utils/atsApi';
import ActivityPanel from '../../components/shared/ActivityPanel';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import SkillsPicker from '../../components/ats/SkillsPicker';
import AttachmentsPanel from '../../components/ats/AttachmentsPanel';
import InlineField from '../../components/shared/InlineField';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import RecordMeta from '../../components/shared/RecordMeta';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, Star, X, ChevronDown,
  User, Briefcase, FileText, Tag, Calendar,
  XCircle, Award,
  ExternalLink,
  PenTool, FileSignature, UserPlus, UserCheck,
  DollarSign, Mail, Building2, Hash, IdCard,
  Archive, ArchiveRestore, MoreHorizontal, Trash2,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';

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
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
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
function HireModal({ show, onClose, onConfirm, saving, mode = 'hire', targetStageName, requireSignedDoc = false, initialOffer = null, application = null, companies = [], orgSlug = null }) {
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
  const [signTemplateId, setSignTemplateId] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [directorEmail, setDirectorEmail] = useState('');
  const [candSignName, setCandSignName] = useState('');
  const [candSignEmail, setCandSignEmail] = useState('');
  const [sendingEnv, setSendingEnv] = useState(false);

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
    if (!show || !orgSlug || signTemplates.length > 0) return;
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
  }, [show, orgSlug, signTemplates.length]);

  // Manual retry — clears state so the lazy-load effect re-fires.
  const handleRetryLoadTemplates = () => {
    setSignTemplates([]);
    setSignError('');
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

  const today = new Date().toISOString().slice(0, 10);
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
      const res = await atsApi.createOfferSignRequest(orgSlug, application._id, {
        templateId: signTemplateId,
        reference: `Offer — ${application.candidateName || 'Candidate'} · ${application.jobPositionName || ''}`.trim(),
        signers: [
          { name: directorName.trim(), email: directorEmail.trim().toLowerCase(), roleName: 'Director' },
          { name: candSignName.trim(), email: candSignEmail.trim().toLowerCase(), roleName: 'Candidate' },
        ],
      });
      const newId = res?.request?._id || res?.request?.id || '';
      if (!newId) throw new Error('Sign API returned no request id');
      setSignedOfferDocId(String(newId));
      setSignError('');
    } catch (err) {
      const fields = err?.fieldErrors;
      const msg = fields ? Object.entries(fields)[0]?.join(': ') : null;
      setSignError(msg || err?.message || 'Failed to send for signature');
    } finally {
      setSendingEnv(false);
    }
  };

  const isOfferMode = mode === 'offer';
  const headerTitle = isOfferMode ? 'Offer Details' : 'Confirm Hire';
  const headerSub = isOfferMode
    ? (targetStageName ? `Capture offer details to move to ${targetStageName}` : 'Capture offer details')
    : 'Capture offer details before marking as hired';
  const submitLabel = isOfferMode ? 'Save Offer Details' : 'Confirm Hire';
  const submitClass = isOfferMode
    ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30'
    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  const signedDocRequired = isOfferMode && requireSignedDoc;

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    const jd = new Date(joiningDate);
    if (!joiningDate || isNaN(jd.getTime())) errs.joiningDate = 'Required';
    else if (jd < todayMidnight) errs.joiningDate = 'Cannot be in the past';
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) errs.amount = 'Must be > 0';
    const np = Number(noticePeriodDays);
    if (!Number.isFinite(np) || np < 0) errs.noticePeriodDays = '0 or more';
    const pm = Number(probationMonths);
    if (!Number.isFinite(pm) || pm < 0) errs.probationMonths = '0 or more';
    if (signedDocRequired && !signedOfferDocId.trim()) {
      errs.signedOfferDocId = 'Signed offer document is required for this stage';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onConfirm({
      offer: {
        joiningDate,
        offeredCTC: { currency, amount: amt },
        noticePeriodDays: np,
        probationMonths: pm,
        signedOfferDocId: signedOfferDocId.trim() || null,
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
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-white">{headerTitle}</h3>
            <p className="text-xs text-dark-400 mt-0.5">{headerSub}</p>
          </div>
          <button type="button" onClick={onClose} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <label className="block text-sm font-medium text-dark-300 mb-1">Offered CTC (annual) <span className="text-red-400">*</span></label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1200000"
              className="input-field"
              required
            />
            {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
          </div>

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

          <div className="col-span-2">
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Offer signature {signedDocRequired
                ? <span className="text-red-400">*</span>
                : <span className="text-dark-500 font-normal">(optional)</span>
              }
            </label>

            {signedOfferDocId ? (
              /* Envelope already linked — show summary + disconnect option */
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-emerald-300 font-medium flex items-center gap-1.5">
                      <FileSignature size={14} /> Offer envelope linked
                    </div>
                    <div className="text-xs text-dark-400 mt-0.5 font-mono truncate">{signedOfferDocId}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignedOfferDocId('')}
                    className="text-xs text-dark-400 hover:text-white px-2 py-1 transition-colors flex-shrink-0"
                  >
                    Disconnect
                  </button>
                </div>
                <p className="text-[11px] text-dark-500 mt-2">
                  When all signers complete the envelope, this application's offer will be marked as signed automatically.
                </p>
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
            {!signedDocRequired && !signedOfferDocId && (
              <p className="text-xs text-dark-500 mt-1.5">If blank, the application will show a "signed offer missing" warning until added.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className={`flex-1 flex items-center justify-center gap-2 ${submitClass} rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50`}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
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
  const [employeeCode, setEmployeeCode] = useState('');
  const [errors, setErrors] = useState({});

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
                <FieldLabel hint="inherits from job if blank">Department</FieldLabel>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. IT, Recruitment, Sales"
                  className="input-field"
                />
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
          <button type="button" onClick={onClose} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
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
          <button type="button" onClick={onClose} className="text-dark-400 hover:text-white transition-colors flex-shrink-0"><X size={20} /></button>
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
      // P0.2 hard-gate handling. When the API blocks a transition into
      // Offer Proposal / Offer Signed because the offer subdoc is
      // missing fields, open the HireModal in 'offer' mode pre-filled
      // with whatever offer data already exists. The modal's submit
      // flow saves the offer via /offer, then we re-fire this same
      // stage transition. When blocked because the user clicked the
      // Hired chip directly, point them at the Hire button instead.
      if (err?.requiresOffer) {
        const stage = stages.find((s) => s._id === stageId);
        setPendingStageMove({
          stageId,
          stageName: err.targetStageName || stage?.name || 'next stage',
          requireSignedDoc: err.requiresSignedDoc === true,
        });
        setShowHireModal(true);
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
    const isOfferOnly = !!pendingStageMove;
    try {
      setActionSaving(true);
      if (isOfferOnly) {
        const res = await atsApi.updateOffer(orgSlug, applicationId, payload);
        const warns = Array.isArray(res?.warnings) ? res.warnings : [];
        if (warns.includes('signed_offer_missing') && !pendingStageMove.requireSignedDoc) {
          showToast('Offer details saved — signed offer still missing.', 'warning');
        } else {
          showToast('Offer details saved');
        }
        // Retry the original stage transition that triggered this modal.
        const targetId = pendingStageMove.stageId;
        setPendingStageMove(null);
        setShowHireModal(false);
        try {
          await atsApi.moveStage(orgSlug, applicationId, targetId);
          showToast('Stage updated');
        } catch (retryErr) {
          // Should be rare — gate just passed. Surface anything left.
          showToast(retryErr.message || 'Stage move failed after saving offer', 'error');
        }
        fetchApplication();
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
      try {
        await atsApi.moveStage(orgSlug, applicationId, stageId);
        showToast('Stage updated');
      } catch (retryErr) {
        // Should be rare — gate just passed. If a different gate now
        // trips (e.g. Offer Proposal also needs the offer subdoc),
        // the original handleMoveStage error-routing logic catches
        // it and opens the right modal next.
        showToast(retryErr.message || 'Stage move failed after upload', 'error');
      }
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
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
                <button
                  onClick={() => navigate(orgPath('/sign/requests?create=true&linkedModel=ats_application&linkedId=' + applicationId))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20"
                >
                  <PenTool size={14} /> Request Signature
                </button>
                <MoveStageDropdown
                  stages={stages}
                  currentStageId={currentStageId}
                  isOpen={showMoveDropdown}
                  onToggle={() => setShowMoveDropdown((p) => !p)}
                  onSelect={handleMoveStage}
                />
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
            <div className="relative">
              <button
                onClick={() => setShowKebab((o) => !o)}
                className="p-1.5 text-dark-500 hover:text-dark-300 rounded-lg hover:bg-dark-800"
                aria-label="More actions"
              >
                <MoreHorizontal size={16} />
              </button>
              {showKebab && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowKebab(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1">
                    {isOrgAdmin ? (
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
                    ) : (
                      <div className="px-3 py-2 text-[11px] text-dark-500 italic">No admin actions available.</div>
                    )}
                  </div>
                </>
              )}
            </div>
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
            <InlineField label="Email" field="email" value={application.email} type="email" editable={canEdit} onSave={saveField} placeholder="Add email" />
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
            <InlineField label="Employment" field="employmentType" value={application.employmentType} editable={canEdit} onSave={saveField} placeholder="e.g. Permanent, Contract" />
            <InlineField label="Client Role" field="isClientRole" value={!!application.isClientRole} type="toggle" editable={canEdit} onSave={saveField} />
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
              and "+ Send for Signature" composer modal — same component
              CRM / Employee / Contact use. Wrapping it in a SectionCard
              caused two nested headers and duplicated the request list
              alongside an inline panel. The header "Request Signature"
              button stays as a quick entry point to /sign/requests. */}
          <SignRequestWidget
            orgSlug={orgSlug}
            linkedModel="ats_application"
            linkedId={applicationId}
            prefillData={{
              name: application.candidateName || '',
              email: application.email || '',
              phone: application.phone || '',
            }}
          />

          <SectionCard title="Interview" icon={Calendar}>
            <InterviewRound
              label="L1"
              resultField="l1Result"
              dateField="l1DateTime"
              feedbackField="l1Feedback"
              application={application}
              canEdit={canEdit}
              saveField={saveField}
            />
            <div className="border-t border-dark-700 my-3" />
            <InterviewRound
              label="L2"
              resultField="l2Result"
              dateField="l2DateTime"
              feedbackField="l2Feedback"
              application={application}
              canEdit={canEdit}
              saveField={saveField}
            />
            <div className="border-t border-dark-700 my-3" />
            <InterviewRound
              label="HR"
              resultField="hrResult"
              dateField="hrDateTime"
              feedbackField="hrRoundFeedback"
              application={application}
              canEdit={canEdit}
              saveField={saveField}
            />
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
      <HireModal
        show={showHireModal}
        onClose={() => { setShowHireModal(false); setPendingStageMove(null); }}
        onConfirm={handleHire}
        saving={actionSaving}
        mode={pendingStageMove ? 'offer' : 'hire'}
        targetStageName={pendingStageMove?.stageName}
        requireSignedDoc={pendingStageMove?.requireSignedDoc === true}
        initialOffer={application?.offer || null}
        application={application}
        companies={companies}
        orgSlug={orgSlug}
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
    </div>
  );
}

/* ── Interview round helper ──────────────────────────────────────────── */
function InterviewRound({ label, resultField, dateField, feedbackField, application, canEdit, saveField }) {
  const isEmpty = (v) => v == null || v === '' || (typeof v === 'string' && v.trim() === '');
  const hasAny = !isEmpty(application[resultField])
    || !isEmpty(application[dateField])
    || !isEmpty(application[feedbackField]);

  // Collapsed-by-default when nothing's been filled in. Imported records
  // come in with all three fields blank for L1 / L2 / HR, which used to
  // render 9 empty "—" rows on every application detail. Now we show a
  // single "Not scheduled" line per round, with an "Add details" toggle
  // for admins.
  const [expanded, setExpanded] = useState(hasAny);
  const showFields = hasAny || expanded;

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-1">
        <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
          {label} Interview
        </h4>
        {!hasAny && canEdit && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-rivvra-400 hover:text-rivvra-300"
          >
            {expanded ? 'Collapse' : '+ Add details'}
          </button>
        )}
      </div>
      {!showFields && (
        <p className="text-dark-500 text-xs px-1 pb-2">Not scheduled.</p>
      )}
      {showFields && <>
      <InlineField
        label="Result"
        field={resultField}
        value={application[resultField]}
        type="select"
        options={RESULT_OPTIONS}
        editable={canEdit}
        onSave={saveField}
      />
      <InlineField
        label="Date & Time"
        field={dateField}
        value={application[dateField]}
        type="datetime-local"
        editable={canEdit}
        onSave={saveField}
      />
      <InlineField
        label="Feedback"
        field={feedbackField}
        value={application[feedbackField]}
        type="textarea"
        editable={canEdit}
        onSave={saveField}
        placeholder="Add feedback notes…"
      />
      </>}
    </div>
  );
}
