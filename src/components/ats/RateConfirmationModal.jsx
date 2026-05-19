import { useState, useEffect, useMemo } from 'react';
import { Loader2, FileSignature, X } from 'lucide-react';
import atsApi from '../../utils/atsApi';
import signApi from '../../utils/signApi';

const TAG_REGEX = /rate\s*confirmation/i;
// Role names matching this regex get prefilled with the logged-in recruiter's
// identity (read-only). Anything else is treated as a candidate-style slot.
const RECRUITER_ROLE_REGEX = /recruit|director|signatory|company|employer|consultant\s*company/i;
const CANDIDATE_ROLE_REGEX = /candidate|contractor|consultant|individual/i;

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
}) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [rolesById, setRolesById] = useState({});
  const [templateId, setTemplateId] = useState('');
  // signerSlots: [{ roleId, roleName, kind: 'recruiter'|'candidate'|'other', name, email }]
  const [signerSlots, setSignerSlots] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const jobTitle = application?.jobName || application?.jobPositionName || '';

  // Filter templates whose tags include something matching /rate confirmation/i.
  const rateTemplates = useMemo(() => templates.filter((t) =>
    Array.isArray(t.tags) && t.tags.some((tag) => TAG_REGEX.test(tag?.name || ''))
  ), [templates]);

  // Derive ordered, unique roles from a template's signItems.
  const rolesForTemplate = (tmpl) => {
    if (!tmpl) return [];
    const seen = new Set();
    const out = [];
    for (const item of (tmpl.signItems || [])) {
      const rid = item?.roleId ? String(item.roleId) : '';
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      const role = rolesById[rid];
      out.push({ roleId: rid, roleName: role?.name || 'Signer', sequence: role?.sequence ?? 0 });
    }
    // Stable: keep first-encountered order from signItems; ignore sequence to
    // match how the Sign signer-ordering UI displays placements left-to-right.
    return out;
  };

  // Build initial signerSlots for a given template + role lookup.
  const buildSlotsForTemplate = (tmpl) => {
    const roles = rolesForTemplate(tmpl);
    return roles.map((r) => {
      let kind = 'other';
      let name = '';
      let email = '';
      if (RECRUITER_ROLE_REGEX.test(r.roleName)) {
        kind = 'recruiter';
        name = recruiterName || '';
        email = recruiterEmail || '';
      } else if (CANDIDATE_ROLE_REGEX.test(r.roleName)) {
        kind = 'candidate';
        name = application?.candidateName || '';
        email = application?.email || '';
      }
      return { roleId: r.roleId, roleName: r.roleName, kind, name, email };
    });
  };

  // Reset transient state and prefill subject/message each time the modal opens.
  useEffect(() => {
    if (!show) return;
    setSubject(`Rate Confirmation — ${application?.candidateName || 'Candidate'}${jobTitle ? ` · ${jobTitle}` : ''}`);
    setMessage(
      `Hi ${(application?.candidateName || '').split(/\s+/)[0] || 'there'},\n\n`
      + 'Please review and sign the rate & terms confirmation for your engagement. '
      + 'Reach out if anything needs adjustment before signing.',
    );
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, application?._id]);

  // Load templates + roles in parallel when the modal opens.
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

  // Auto-select when exactly one template matches; clear when none.
  useEffect(() => {
    if (loading) return;
    if (rateTemplates.length === 0) {
      setTemplateId('');
      setSignerSlots([]);
      return;
    }
    // If current selection is still valid, keep it.
    if (templateId && rateTemplates.some((t) => String(t._id) === templateId)) return;
    const first = rateTemplates[0];
    setTemplateId(String(first._id));
  }, [loading, rateTemplates, templateId]);

  // Rebuild signer slots whenever the chosen template (or roles map) changes.
  useEffect(() => {
    if (!templateId) { setSignerSlots([]); return; }
    const tmpl = rateTemplates.find((t) => String(t._id) === templateId);
    setSignerSlots(buildSlotsForTemplate(tmpl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, rolesById, recruiterName, recruiterEmail, application?._id]);

  if (!show) return null;

  const selectedTemplate = rateTemplates.find((t) => String(t._id) === templateId);
  const showTemplatePicker = rateTemplates.length > 1;
  const noTemplatesError = !loading && !loadError && rateTemplates.length === 0
    ? 'No Sign template tagged "Rate Confirmation" was found. Tag a template in Sign settings first.'
    : '';

  const messageToHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const updateSlot = (idx, patch) => {
    setSignerSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleSend = async () => {
    setError('');
    if (!templateId || !selectedTemplate) { setError(noTemplatesError || loadError || 'Pick a template'); return; }
    if (signerSlots.length === 0) { setError('Template has no signer roles configured'); return; }

    for (const slot of signerSlots) {
      if (!slot.name?.trim() || !slot.email?.trim()) {
        setError(`${slot.roleName}: name and email are required`);
        return;
      }
    }

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
      });

      const envelopeId = envelopeRes?.request?._id || envelopeRes?.request?.id;
      if (!envelopeId) throw new Error(envelopeRes?.error || 'Sign API returned no envelope id');

      await atsApi.recordRateConfirmation(orgSlug, application._id, {
        envelopeId: String(envelopeId),
      });

      if (typeof onSent === 'function') onSent();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send Rate Confirmation');
    } finally {
      setSending(false);
    }
  };

  const sendDisabled = sending || loading || !!loadError || !templateId || signerSlots.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-900 border border-dark-700 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-dark-800">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileSignature size={18} className="text-blue-400" />
              {application?.rateConfirmation?.envelopeId ? 'Re-send Rate Confirmation' : 'Send Rate Confirmation'}
            </h2>
            <p className="text-xs text-dark-400 mt-1">
              Uses a Sign template tagged &ldquo;Rate Confirmation&rdquo;. Signers are auto-set from the template&rsquo;s roles.
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <Loader2 size={14} className="animate-spin" /> Loading Sign templates…
            </div>
          )}
          {loadError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {loadError}
            </div>
          )}
          {noTemplatesError && (
            <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              {noTemplatesError}
            </div>
          )}

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
              Template: <span className="text-dark-200">{selectedTemplate.name}</span>
            </div>
          )}

          {signerSlots.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {signerSlots.map((slot, idx) => (
                <div key={`${slot.roleId}-${idx}`}>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">
                    {slot.roleName} (signer {idx + 1})
                  </label>
                  {slot.kind === 'recruiter' ? (
                    <div className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200">
                      {slot.name || '—'}<br />
                      <span className="text-xs text-dark-400">{slot.email || ''}</span>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={slot.name}
                        onChange={(e) => updateSlot(idx, { name: e.target.value })}
                        placeholder={`${slot.roleName} name`}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none mb-1"
                      />
                      <input
                        type="email"
                        value={slot.email}
                        onChange={(e) => updateSlot(idx, { email: e.target.value })}
                        placeholder="email@example.com"
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-dark-300 mb-1 block">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-dark-300 mb-1 block">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none resize-y"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-800">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sendDisabled}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
            {sending ? 'Sending…' : (application?.rateConfirmation?.envelopeId ? 'Re-send' : 'Send for signature')}
          </button>
        </div>
      </div>
    </div>
  );
}
