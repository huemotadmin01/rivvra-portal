import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, FileSignature, X, Lock, AlertTriangle, ArrowRight, Tag,
  Mail, Clock, ExternalLink, Settings, CheckCircle2, XCircle,
} from 'lucide-react';
import atsApi from '../../utils/atsApi';
import signApi from '../../utils/signApi';

const TAG_REGEX = /rate\s*confirmation/i;
// Roles whose name implies "the company side" — slot becomes read-only and is
// auto-filled from the logged-in recruiter's profile.
const RECRUITER_ROLE_REGEX = /recruit|director|signatory|company|employer|consultant\s*company/i;
// Roles whose name implies "the person being engaged" — slot pre-fills from
// the application's candidate fields but stays editable.
const CANDIDATE_ROLE_REGEX = /candidate|contractor|consultant|individual/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATE_STYLE = {
  draft: { label: 'Draft', cls: 'bg-dark-700/60 text-dark-200 border-dark-600' },
  sent: { label: 'Awaiting signatures', cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  signed: { label: 'Signed', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  completed: { label: 'Signed', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  refused: { label: 'Declined', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-dark-700/60 text-dark-300 border-dark-600' },
  expired: { label: 'Expired', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
};

function classifyRole(roleName) {
  const n = String(roleName || '');
  if (RECRUITER_ROLE_REGEX.test(n)) return 'recruiter';
  if (CANDIDATE_ROLE_REGEX.test(n)) return 'candidate';
  return 'other';
}

function buildDefaultSubject(candidateName, jobTitle) {
  const name = candidateName?.trim() || 'Candidate';
  return `Rate Confirmation — ${name}${jobTitle ? ` · ${jobTitle}` : ''}`;
}

function buildDefaultMessage(candidateName) {
  const first = (candidateName || '').trim().split(/\s+/)[0] || 'there';
  return `Hi ${first},\n\nPlease review and sign the rate & terms confirmation for your engagement. Reach out if anything needs adjustment before signing.`;
}

function formatDateTime(d) {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
  } catch { return String(d); }
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-9 bg-dark-800/60 rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="h-24 bg-dark-800/60 rounded-lg animate-pulse" />
        <div className="h-24 bg-dark-800/60 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

/**
 * RateConfirmationModal — picks a Sign template tagged "Rate Confirmation"
 * and sends an envelope with one signer per template role. Records the
 * envelope id back onto the application via /ats/applications/:id/rate-confirmation.
 *
 * Visibility / gating is enforced by the caller — this component assumes
 * the application is an External Consultant client-role record.
 */
export default function RateConfirmationModal({
  show, onClose, onSent,
  orgSlug, application,
  recruiterName, recruiterEmail,
  // 2026-05-27 — admin-only escape hatch. When canBypass is true the modal
  // shows a small "Bypass instead" affordance in the header; clicking it
  // closes this modal and asks the parent to open its reason prompt.
  canBypass = false,
  onBypassRequested,
}) {
  const isResend = !!application?.rateConfirmation?.envelopeId;

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [rolesById, setRolesById] = useState({});
  const [templateId, setTemplateId] = useState('');

  // signerSlots: ordered list of { roleId, roleName, kind, name, email }
  const [signerSlots, setSignerSlots] = useState([]);
  // Preserve user edits across template switches, keyed by roleId.
  const userEditsRef = useRef({});

  const [subject, setSubject] = useState('');
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [messageDirty, setMessageDirty] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Re-send mode: prior envelope info (state, sent date, signers).
  const [priorEnvelope, setPriorEnvelope] = useState(null);
  const [priorLoading, setPriorLoading] = useState(false);
  // Re-send UX (2026-06-30): when the prior envelope is still out for
  // signature, the default action is a reminder on the SAME envelope (no new
  // document, no duplicate email). Creating a brand-new envelope is gated
  // behind an explicit opt-in (forceNew) so recruiters stop spamming
  // candidates. A signed prior requires a separate confirm before replacement.
  const [forceNew, setForceNew] = useState(false);
  const [confirmReplaceSigned, setConfirmReplaceSigned] = useState(false);
  const [reminding, setReminding] = useState(false);

  const jobTitle = application?.jobName || application?.jobPositionName || '';

  // ── Filter templates by the "Rate Confirmation" tag ──────────────────
  // Surface the "Individual Contractor" template first since it's the
  // most-frequently-used rate-confirmation flow.
  const rateTemplates = useMemo(() => {
    const matched = templates.filter((t) =>
      Array.isArray(t.tags) && t.tags.some((tag) => TAG_REGEX.test(tag?.name || ''))
    );
    return matched.slice().sort((a, b) => {
      const ai = /individual\s*contractor/i.test(a?.name || '') ? 0 : 1;
      const bi = /individual\s*contractor/i.test(b?.name || '') ? 0 : 1;
      return ai - bi;
    });
  }, [templates]);

  const selectedTemplate = useMemo(
    () => rateTemplates.find((t) => String(t._id) === templateId),
    [rateTemplates, templateId],
  );

  // Ordered, unique roles from the selected template.
  //
  // Order resolution priority:
  //   1. template.signingOrder (set in the Sign template editor) — wins,
  //      including for future templates that author signing order explicitly.
  //   2. Fallback: recruiter-shaped roles first, candidate-shaped second,
  //      anything else last. Keeps templates without an explicit order
  //      behaving the way the Rate Confirmation flow needs by default.
  const orderedRoles = useMemo(() => {
    if (!selectedTemplate) return [];
    const seen = new Set();
    const raw = [];
    for (const item of (selectedTemplate.signItems || [])) {
      const rid = item?.roleId ? String(item.roleId) : '';
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      const role = rolesById[rid];
      raw.push({ roleId: rid, roleName: role?.name || 'Signer' });
    }
    const declared = Array.isArray(selectedTemplate.signingOrder)
      ? selectedTemplate.signingOrder.map((id) => String(id)).filter(Boolean)
      : [];
    if (declared.length > 0) {
      const idxIn = (rid) => {
        const i = declared.indexOf(String(rid));
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      return raw
        .map((r, idx) => ({ ...r, _idx: idx, _w: idxIn(r.roleId) }))
        .sort((a, b) => (a._w - b._w) || (a._idx - b._idx))
        .map(({ _idx, _w, ...rest }) => rest); // eslint-disable-line no-unused-vars
    }
    const kindWeight = (name) => {
      if (RECRUITER_ROLE_REGEX.test(name)) return 0;
      if (CANDIDATE_ROLE_REGEX.test(name)) return 1;
      return 2;
    };
    return raw
      .map((r, idx) => ({ ...r, _idx: idx, _w: kindWeight(r.roleName) }))
      .sort((a, b) => (a._w - b._w) || (a._idx - b._idx))
      .map(({ _idx, _w, ...rest }) => rest); // eslint-disable-line no-unused-vars
  }, [selectedTemplate, rolesById]);

  // ── Reset when the modal opens for a different application ───────────
  useEffect(() => {
    if (!show) return;
    setSubject(buildDefaultSubject(application?.candidateName, jobTitle));
    setSubjectDirty(false);
    setMessage(buildDefaultMessage(application?.candidateName));
    setMessageDirty(false);
    setError('');
    setSubmitAttempted(false);
    userEditsRef.current = {};
    setPriorEnvelope(null);
    setForceNew(false);
    setConfirmReplaceSigned(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, application?._id]);

  // ── Load templates + roles ──────────────────────────────────────────
  useEffect(() => {
    if (!show || !orgSlug) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([
      atsApi.listSignTemplates(orgSlug),
      signApi.listRoles(orgSlug),
    ])
      .then(([tplRes, roleRes]) => {
        if (cancelled) return;
        const tpls = tplRes?.templates || tplRes?.signTemplates || [];
        const roles = roleRes?.roles || roleRes?.signRoles || [];
        const map = {};
        for (const r of roles) map[String(r._id)] = r;
        setTemplates(tpls);
        setRolesById(map);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'Failed to load Sign templates');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [show, orgSlug]);

  // ── Re-send: fetch prior envelope state to display in the banner ─────
  useEffect(() => {
    if (!show || !isResend || !orgSlug) return;
    const envelopeId = application?.rateConfirmation?.envelopeId;
    if (!envelopeId) return;
    let cancelled = false;
    setPriorLoading(true);
    signApi.getRequest(orgSlug, envelopeId)
      .then((res) => {
        if (cancelled) return;
        setPriorEnvelope(res?.request || res?.signRequest || null);
      })
      .catch(() => { /* non-fatal — banner falls back to rateConfirmation metadata */ })
      .finally(() => { if (!cancelled) setPriorLoading(false); });
    return () => { cancelled = true; };
  }, [show, isResend, orgSlug, application?.rateConfirmation?.envelopeId]);

  // ── Auto-select template: keep current if still valid, else first match ─
  useEffect(() => {
    if (loading) return;
    if (rateTemplates.length === 0) {
      setTemplateId('');
      return;
    }
    if (templateId && rateTemplates.some((t) => String(t._id) === templateId)) return;
    setTemplateId(String(rateTemplates[0]._id));
  }, [loading, rateTemplates, templateId]);

  // ── Build signer slots whenever roles/template change, preserving edits ─
  useEffect(() => {
    if (!selectedTemplate) { setSignerSlots([]); return; }
    const next = orderedRoles.map((r) => {
      const kind = classifyRole(r.roleName);
      const edit = userEditsRef.current[r.roleId];
      if (edit) {
        return { roleId: r.roleId, roleName: r.roleName, kind, name: edit.name, email: edit.email };
      }
      if (kind === 'recruiter') {
        return {
          roleId: r.roleId, roleName: r.roleName, kind,
          name: recruiterName || '', email: recruiterEmail || '',
        };
      }
      if (kind === 'candidate') {
        return {
          roleId: r.roleId, roleName: r.roleName, kind,
          name: application?.candidateName || '', email: application?.email || '',
        };
      }
      return { roleId: r.roleId, roleName: r.roleName, kind, name: '', email: '' };
    });
    setSignerSlots(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?._id, orderedRoles, recruiterName, recruiterEmail, application?._id]);

  // ── Subject auto-syncs with the candidate slot until the user edits it ─
  useEffect(() => {
    if (subjectDirty) return;
    const candSlot = signerSlots.find((s) => s.kind === 'candidate');
    const candName = candSlot?.name || application?.candidateName || '';
    setSubject(buildDefaultSubject(candName, jobTitle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerSlots, subjectDirty, jobTitle]);

  // ── Same idea for message ──────────────────────────────────────────
  useEffect(() => {
    if (messageDirty) return;
    const candSlot = signerSlots.find((s) => s.kind === 'candidate');
    const candName = candSlot?.name || application?.candidateName || '';
    setMessage(buildDefaultMessage(candName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerSlots, messageDirty]);

  // ── Dismissal gating (2026-07-18) ─────────────────────────────────
  // The modal must not be dismissable mid-send/mid-remind — closing while
  // the envelope create was in flight orphaned the recruiter from the
  // success/failure outcome. Escape closes it when idle. Read busy via a
  // ref so the keydown listener doesn't re-bind on every state flip.
  const busyRef = useRef(false);
  busyRef.current = sending || reminding;
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busyRef.current) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) return null;

  const busy = sending || reminding;
  const handleDismiss = () => { if (!busy) onClose?.(); };

  // ── Derived UI state ──────────────────────────────────────────────
  const showTemplatePicker = rateTemplates.length > 1;
  const noTemplatesError = !loading && !loadError && rateTemplates.length === 0;

  // Per-slot validity. Two flavours:
  //   - "live" errors: bad email format the user has already typed
  //   - "submit" errors: empty fields, only surfaced after Send is clicked
  const slotLiveErrors = signerSlots.map((slot) => {
    const errs = {};
    if (slot.email?.trim() && !EMAIL_REGEX.test(slot.email.trim())) {
      errs.email = 'Invalid email';
    }
    return errs;
  });
  const slotSubmitErrors = signerSlots.map((slot) => {
    const errs = {};
    if (slot.kind === 'recruiter' && (!slot.name?.trim() || !slot.email?.trim())) {
      errs.recruiter = 'Your recruiter profile is missing a name/email. Update your employee record first.';
    }
    if (!slot.name?.trim()) errs.name = 'Name required';
    if (!slot.email?.trim()) errs.email = 'Email required';
    return errs;
  });
  const recruiterMissing = slotSubmitErrors.some((e) => e.recruiter);
  const hasBlockingError = slotLiveErrors.some((e) => Object.keys(e).length > 0)
    || slotSubmitErrors.some((e) => Object.keys(e).length > 0);

  // Send button intentionally stays clickable when there are only empty-field
  // errors — clicking surfaces the inline messages instead of leaving the
  // user wondering why the button is dead.
  const sendDisabled = sending || loading || !!loadError || !templateId
    || signerSlots.length === 0;

  // ── Handlers ──────────────────────────────────────────────────────
  const messageToHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const updateSlot = (idx, patch) => {
    setSignerSlots((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, ...patch };
      // Persist user edits so switching templates doesn't drop them.
      if (s.kind !== 'recruiter') {
        userEditsRef.current[s.roleId] = { name: updated.name, email: updated.email };
      }
      return updated;
    }));
  };

  // Send a reminder on the EXISTING envelope (no new document / email storm).
  const handleRemind = async () => {
    const envelopeId = application?.rateConfirmation?.envelopeId;
    if (!envelopeId) return;
    setError('');
    setReminding(true);
    try {
      const res = await signApi.remindSigners(orgSlug, envelopeId);
      // The remind endpoint returns success:true with reminded:0 and a cooldown
      // message when every signer is still within the 10-min cooldown. Don't
      // report a false "reminder sent" in that case — surface the reason and
      // leave the modal open so the recruiter can retry later.
      if (!res || res.reminded === 0) {
        setError(res?.message || 'Reminder already sent recently — try again in a few minutes.');
        return;
      }
      if (typeof onSent === 'function') onSent('Reminder sent on the existing Rate Confirmation');
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send reminder');
    } finally {
      setReminding(false);
    }
  };

  const handleSend = async () => {
    setError('');
    setSubmitAttempted(true);
    if (!templateId || !selectedTemplate) { setError(loadError || 'Pick a template'); return; }
    if (signerSlots.length === 0) { setError('Template has no signer roles configured'); return; }
    if (hasBlockingError) { setError('Fix the highlighted signer fields and try again'); return; }

    setSending(true);
    try {
      const candidateSlot = signerSlots.find((s) => s.kind === 'candidate');
      const candName = candidateSlot?.name || application?.candidateName || 'Candidate';
      const reference = `Rate Confirmation — ${candName}${jobTitle ? ` · ${jobTitle}` : ''}`;

      const envelopeRes = await signApi.createRequest(orgSlug, {
        templateId,
        reference,
        subject: subject.trim() || undefined,
        message: messageToHtml(message.trim()) || undefined,
        signers: signerSlots.map((s) => ({
          name: s.name.trim(),
          email: s.email.trim().toLowerCase(),
          roleName: s.roleName,
        })),
        linkedModel: 'ats_application',
        linkedId: application._id,
        // Explicitly NOT 'offer' — keeps a signed Rate Confirmation from
        // mirroring into application.offer.* (phantom "Signed by all parties").
        linkedSubtype: 'rate_confirmation',
      });

      const envelopeId = envelopeRes?.request?._id || envelopeRes?.request?.id;
      if (!envelopeId) throw new Error(envelopeRes?.error || 'Sign API returned no envelope id');

      await atsApi.recordRateConfirmation(orgSlug, application._id, {
        envelopeId: String(envelopeId),
      });

      if (typeof onSent === 'function') onSent('Rate Confirmation sent for signature');
      onClose();
    } catch (err) {
      // Self-heal the back-link. Two failure modes can leave the envelope
      // created+emailed but unlinked to the application (no envelopeId on the
      // record), which strands the recruiter — they can neither remind nor
      // resend for the cooldown window:
      //   1. createRequest succeeded but recordRateConfirmation threw.
      //   2. A retry hit the 409 RATE_CONFIRMATION_RECENTLY_SENT backstop.
      // Both paths carry the existing envelopeId on the thrown error (api.js
      // copies the response envelope keys onto the Error). If we have one,
      // record it against the application so the reminder flow lights up.
      const healEnvelopeId = err?.envelopeId;
      if (
        healEnvelopeId &&
        (err?.code === 'RATE_CONFIRMATION_RECENTLY_SENT' || /already out for signature/i.test(err?.message || ''))
      ) {
        try {
          await atsApi.recordRateConfirmation(orgSlug, application._id, {
            envelopeId: String(healEnvelopeId),
          });
          if (typeof onSent === 'function') onSent('Rate Confirmation is already out for signature — linked to this application');
          onClose();
          return;
        } catch { /* fall through to the cooldown message below */ }
      }
      // Server cooldown backstop (409): an active RC envelope already exists.
      // Surface it and steer the recruiter to the reminder action.
      if (err?.code === 'RATE_CONFIRMATION_RECENTLY_SENT' || /already out for signature/i.test(err?.message || '')) {
        setForceNew(false);
        setError(err?.message || 'A Rate Confirmation is already out for signature — send a reminder instead.');
      } else {
        setError(err?.message || 'Failed to send Rate Confirmation');
      }
    } finally {
      setSending(false);
    }
  };

  // ── Re-send branching ────────────────────────────────────────────────
  // priorActive = the prior envelope is still out for signature (not in a
  // terminal state). In that case we default to the reminder flow and hide
  // the new-envelope form until the recruiter explicitly opts in (forceNew).
  const PRIOR_TERMINAL = ['signed', 'completed', 'refused', 'cancelled', 'expired', 'declined', 'voided'];
  const priorState = priorEnvelope?.state || null;
  const priorActive = isResend && !priorLoading && !!priorEnvelope && !PRIOR_TERMINAL.includes(priorState);
  const priorSigned = priorState === 'signed' || priorState === 'completed';
  const showReminderOnly = priorActive && !forceNew;
  // Hide the new-envelope form while still resolving the prior envelope's
  // state, so it doesn't flash in before we know a reminder is the right call.
  const showForm = !showReminderOnly && !(isResend && priorLoading);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleDismiss}>
      <div
        className="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-dark-800 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20">
              <FileSignature size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isResend ? 'Re-send Rate Confirmation' : 'Send Rate Confirmation'}
              </h2>
              <p className="text-xs text-dark-400 mt-0.5">
                Sends a Sign envelope from a template tagged &ldquo;Rate Confirmation&rdquo;.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 2026-05-27 — admin escape hatch surfaced inside the modal
                because the gate error auto-opens this view; without it an
                admin would have to close and dig into the kebab. Closes
                this modal and delegates the reason prompt to the parent. */}
            {canBypass && (
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (busy) return; onClose?.(); onBypassRequested?.(); }}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Lift the signed-RC requirement on this application"
              >
                Bypass instead
              </button>
            )}
            <button
              onClick={handleDismiss}
              disabled={busy}
              className="text-dark-400 hover:text-white p-1 rounded-md hover:bg-dark-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Re-send banner */}
          {isResend && (
            <PriorEnvelopeBanner
              orgSlug={orgSlug}
              envelopeId={application?.rateConfirmation?.envelopeId}
              fallbackSentAt={application?.rateConfirmation?.sentAt}
              fallbackSentByName={application?.rateConfirmation?.sentByName}
              loading={priorLoading}
              envelope={priorEnvelope}
            />
          )}

          {/* Reminder-first: the prior envelope is still out for signature.
              Default to a reminder (no new envelope, no duplicate email);
              creating a new one is an explicit opt-in below. */}
          {showReminderOnly && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-blue-200 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <Mail size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">This Rate Confirmation is still awaiting signature.</div>
                  <div className="text-blue-200/80 mt-0.5">
                    The candidate already received it. Send a reminder on the existing envelope instead of creating a new one — a new envelope would email them again and re-start the signing.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setForceNew(true); setError(''); }}
                className="text-xs text-dark-400 hover:text-amber-300 underline decoration-dotted underline-offset-2"
              >
                Terms changed? Send a new confirmation instead →
              </button>
            </div>
          )}

          {/* Warn before re-sending after a prior signed envelope.
              Sending again replaces the active envelope reference and re-blocks
              every forward stage move until the new one is fully signed. */}
          {showForm && priorSigned && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">The previous Rate Confirmation is already fully signed.</div>
                  <div className="text-amber-200/80 mt-0.5">
                    Sending a new one replaces the active envelope. Forward stage moves on this application will be blocked again until the new envelope is signed by both parties.
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-200/90 cursor-pointer pl-1">
                <input
                  type="checkbox"
                  checked={confirmReplaceSigned}
                  onChange={(e) => setConfirmReplaceSigned(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-amber-500/40 bg-dark-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                />
                I understand this replaces the signed confirmation and re-blocks stage moves.
              </label>
            </div>
          )}

          {/* Opted into a new envelope while one is still pending. */}
          {showForm && priorActive && forceNew && (
            <div className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="text-amber-200/90">
                You're creating a <span className="font-medium">new</span> envelope. The candidate will be emailed again and the pending one is replaced. Use this only if the rate/terms changed.
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && <Skeleton />}

          {/* Load error */}
          {loadError && (
            <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>{loadError}</div>
            </div>
          )}

          {/* Empty state — no Rate-Confirmation-tagged templates */}
          {noTemplatesError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-300 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-200">No Sign template tagged &ldquo;Rate Confirmation&rdquo;</p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    Tag at least one Sign template with a tag named &ldquo;Rate Confirmation&rdquo; in Sign settings, then come back here.
                  </p>
                  <Link
                    to={`/org/${orgSlug}/sign/config`}
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30"
                  >
                    <Settings size={12} /> Open Sign settings <ExternalLink size={11} />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Template picker + tag/role preview */}
          {showForm && !loading && !loadError && rateTemplates.length > 0 && (
            <div className="space-y-2">
              {showTemplatePicker && (
                <div>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">Sign template</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    disabled={sending}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                  >
                    {rateTemplates.map((t) => (
                      <option key={t._id} value={String(t._id)}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {!showTemplatePicker && selectedTemplate && (
                <div className="text-xs text-dark-400">
                  Template <span className="text-dark-100">{selectedTemplate.name}</span>
                </div>
              )}
              {selectedTemplate && (
                <TemplatePreviewRow template={selectedTemplate} roles={orderedRoles} />
              )}
            </div>
          )}

          {/* Recruiter-missing warning */}
          {recruiterMissing && (
            <div className="flex items-start gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>Your recruiter profile is missing a name or email. Update your employee record before sending.</div>
            </div>
          )}

          {/* Signer cards */}
          {showForm && signerSlots.length > 0 && (
            <div>
              <div className="text-xs font-medium text-dark-300 mb-2">Signing order</div>
              <div className="space-y-2">
                {signerSlots.map((slot, idx) => (
                  <SignerCard
                    key={`${slot.roleId}-${idx}`}
                    index={idx}
                    total={signerSlots.length}
                    slot={slot}
                    errors={{
                      ...slotLiveErrors[idx],
                      ...(submitAttempted ? slotSubmitErrors[idx] : {}),
                    }}
                    onChange={(patch) => updateSlot(idx, patch)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Subject + message */}
          {showForm && signerSlots.length > 0 && (
            <>
              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setSubjectDirty(true); }}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); setMessageDirty(true); }}
                  rows={4}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none resize-y"
                />
              </div>
            </>
          )}

          {/* Send error */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900/95 backdrop-blur">
          <button
            onClick={onClose}
            disabled={sending || reminding}
            className="px-4 py-2 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50"
          >
            Cancel
          </button>
          {showReminderOnly ? (
            <button
              onClick={handleRemind}
              disabled={reminding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {reminding ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {reminding ? 'Sending reminder…' : 'Send reminder'}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={sendDisabled || (priorSigned && !confirmReplaceSigned)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
              {sending ? 'Sending…' : (isResend ? 'Send new for signature' : 'Send for signature')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function PriorEnvelopeBanner({ orgSlug, envelopeId, fallbackSentAt, fallbackSentByName, loading, envelope }) {
  const state = envelope?.state || 'sent';
  const style = STATE_STYLE[state] || STATE_STYLE.sent;
  const sentAt = envelope?.sentAt || envelope?.createdAt || fallbackSentAt;
  const sentBy = envelope?.createdByName || fallbackSentByName;
  const signers = Array.isArray(envelope?.signers) ? envelope.signers : [];
  const nextPending = signers.find((s) => s.state === 'sent' || s.state === 'pending');

  return (
    <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${style.cls}`}>
            {state === 'signed' || state === 'completed' ? <CheckCircle2 size={11} /> : null}
            {state === 'refused' ? <XCircle size={11} /> : null}
            {style.label}
          </span>
          <span className="text-xs text-dark-400">
            {loading ? 'Loading envelope…' : (
              <>
                {sentAt && <>Sent <Clock size={11} className="inline mb-0.5" /> {formatDateTime(sentAt)}</>}
                {sentBy && <span className="text-dark-500"> · by {sentBy}</span>}
              </>
            )}
          </span>
        </div>
        {envelopeId && (
          <Link
            to={`/org/${orgSlug}/sign/requests/${envelopeId}`}
            className="text-xs text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
          >
            View envelope <ExternalLink size={11} />
          </Link>
        )}
      </div>
      {nextPending && (
        <div className="text-[11px] text-dark-400 mt-2 flex items-center gap-1">
          <Mail size={11} /> Waiting on <span className="text-dark-200">{nextPending.name || nextPending.email}</span>
        </div>
      )}
    </div>
  );
}

function TemplatePreviewRow({ template, roles }) {
  const tag = (template.tags || []).find((t) => TAG_REGEX.test(t?.name || ''));
  return (
    <div className="flex items-center gap-2 text-[11px] text-dark-400 flex-wrap">
      {tag && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
          <Tag size={10} /> {tag.name}
        </span>
      )}
      {roles.length > 0 && (
        <span className="inline-flex items-center gap-1">
          {roles.map((r, i) => (
            <span key={r.roleId} className="inline-flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded-md bg-dark-800 border border-dark-700 text-dark-200">{r.roleName}</span>
              {i < roles.length - 1 && <ArrowRight size={10} className="text-dark-500" />}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function SignerCard({ index, total, slot, errors, onChange }) {
  const isRecruiter = slot.kind === 'recruiter';
  const emailInvalid = !!errors.email;
  const nameInvalid = !!errors.name;
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-800/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-200 text-[11px] font-semibold">
            {index + 1}
          </span>
          <span className="text-sm text-dark-100 font-medium">{slot.roleName}</span>
          <span className="text-[10px] text-dark-500">signer {index + 1} of {total}</span>
        </div>
        {isRecruiter && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-dark-800 text-dark-300 border border-dark-700">
            <Lock size={10} /> auto
          </span>
        )}
      </div>

      {isRecruiter ? (
        <div className="px-3 py-2 bg-dark-900/60 border border-dark-700 rounded-lg text-sm">
          <div className="text-dark-100">{slot.name || <span className="text-amber-300">— missing name —</span>}</div>
          <div className="text-xs text-dark-400">{slot.email || <span className="text-amber-300">— missing email —</span>}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <input
              type="text"
              value={slot.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={`${slot.roleName} name`}
              className={`w-full px-3 py-2 bg-dark-900/60 border rounded-lg text-sm text-white focus:outline-none ${
                nameInvalid ? 'border-red-500/60 focus:border-red-400' : 'border-dark-700 focus:border-rivvra-500'
              }`}
            />
            {nameInvalid && <p className="text-[11px] text-red-400 mt-1">{errors.name}</p>}
          </div>
          <div>
            <input
              type="email"
              value={slot.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="email@example.com"
              className={`w-full px-3 py-2 bg-dark-900/60 border rounded-lg text-sm text-white focus:outline-none ${
                emailInvalid ? 'border-red-500/60 focus:border-red-400' : 'border-dark-700 focus:border-rivvra-500'
              }`}
            />
            {emailInvalid && <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
