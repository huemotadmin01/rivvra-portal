import { useState, useEffect } from 'react';
import { Loader2, FileSignature, X } from 'lucide-react';
import atsApi from '../../utils/atsApi';
import signApi from '../../utils/signApi';

const TEMPLATE_NAME = 'Candidate Rate & Terms Confirmation- Individual Contractor';

const SALARY_UNITS = [
  { value: 'per_day', label: 'per day' },
  { value: 'per_month', label: 'per month' },
  { value: 'lpa', label: 'LPA' },
  { value: 'per_year', label: 'per year' },
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD'];

/**
 * RateConfirmationModal — sends a Sign envelope using the
 * "Candidate Rate & Terms Confirmation- Individual Contractor" template,
 * with recruiter as first signer and candidate as second. Records the
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
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [templateError, setTemplateError] = useState('');

  const initialOfferCtc = application?.offer?.offeredCTC || {};
  const [candName, setCandName] = useState('');
  const [candEmail, setCandEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [unit, setUnit] = useState('per_day');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const jobTitle = application?.jobName || application?.jobPositionName || '';

  // Prefill fields each time the modal opens.
  useEffect(() => {
    if (!show) return;
    setCandName(application?.candidateName || '');
    setCandEmail(application?.email || '');
    setAmount(initialOfferCtc.amount ? String(initialOfferCtc.amount) : '');
    setCurrency(initialOfferCtc.currency || 'INR');
    setUnit(initialOfferCtc.unit || 'per_day');
    setSubject(`Rate Confirmation — ${application?.candidateName || 'Candidate'}${jobTitle ? ` · ${jobTitle}` : ''}`);
    setMessage(
      `Hi ${(application?.candidateName || '').split(/\s+/)[0] || 'there'},\n\n`
      + 'Please review and sign the rate & terms confirmation for your engagement. '
      + 'Reach out if anything needs adjustment before signing.',
    );
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, application?._id]);

  // Find the system template by name when the modal opens.
  useEffect(() => {
    if (!show || !orgSlug) return;
    let cancelled = false;
    setLoadingTemplate(true);
    setTemplateError('');
    atsApi.listSignTemplates(orgSlug)
      .then((res) => {
        if (cancelled) return;
        const templates = res?.templates || res?.signTemplates || [];
        const match = templates.find((t) => (t.name || '').trim().toLowerCase() === TEMPLATE_NAME.toLowerCase());
        if (!match) {
          setTemplateError(`Template "${TEMPLATE_NAME}" not found in Sign settings.`);
          setTemplateId('');
        } else {
          setTemplateId(String(match._id));
        }
      })
      .catch((err) => {
        if (!cancelled) setTemplateError(err?.message || 'Failed to load Sign templates');
      })
      .finally(() => { if (!cancelled) setLoadingTemplate(false); });
    return () => { cancelled = true; };
  }, [show, orgSlug]);

  if (!show) return null;

  const messageToHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const handleSend = async () => {
    setError('');
    if (!templateId) { setError(templateError || 'Template not loaded'); return; }
    if (!recruiterName?.trim() || !recruiterEmail?.trim()) {
      setError('Your recruiter profile is missing a name/email. Update your employee record first.');
      return;
    }
    if (!candName.trim() || !candEmail.trim()) {
      setError('Candidate name and email are required');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount must be greater than 0'); return; }
    if (!unit) { setError('Pick a unit'); return; }

    setSending(true);
    try {
      const reference = `Rate Confirmation — ${candName.trim()}${jobTitle ? ` · ${jobTitle}` : ''}`;
      const envelopeRes = await signApi.createRequest(orgSlug, {
        templateId,
        reference,
        subject: subject.trim() || undefined,
        message: messageToHtml(message.trim()) || undefined,
        signers: [
          { name: recruiterName.trim(), email: recruiterEmail.trim().toLowerCase(), roleName: 'Recruiter' },
          { name: candName.trim(), email: candEmail.trim().toLowerCase(), roleName: 'Candidate' },
        ],
        linkedModel: 'ats_application',
        linkedId: application._id,
      });

      const envelopeId = envelopeRes?.request?._id || envelopeRes?.request?.id;
      if (!envelopeId) throw new Error(envelopeRes?.error || 'Sign API returned no envelope id');

      await atsApi.recordRateConfirmation(orgSlug, application._id, {
        envelopeId: String(envelopeId),
        amount: amt,
        currency,
        unit,
      });

      if (typeof onSent === 'function') onSent();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send Rate Confirmation');
    } finally {
      setSending(false);
    }
  };

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
              Uses the &ldquo;{TEMPLATE_NAME}&rdquo; Sign template. You sign first, then the candidate.
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loadingTemplate && (
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <Loader2 size={14} className="animate-spin" /> Loading Sign template…
            </div>
          )}
          {templateError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {templateError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-dark-300 mb-1 block">Recruiter (signer 1)</label>
              <div className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200">
                {recruiterName || '—'}<br />
                <span className="text-xs text-dark-400">{recruiterEmail || ''}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-300 mb-1 block">Candidate (signer 2)</label>
              <input
                type="text"
                value={candName}
                onChange={(e) => setCandName(e.target.value)}
                placeholder="Candidate name"
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none mb-1"
              />
              <input
                type="email"
                value={candEmail}
                onChange={(e) => setCandEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-dark-300 mb-1 block">Amount *</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-dark-300 mb-1 block">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-2 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-300 mb-1 block">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-2 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
              >
                {SALARY_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>

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
            disabled={sending || loadingTemplate || !!templateError}
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
