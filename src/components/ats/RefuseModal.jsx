import { useState, useEffect } from 'react';
import {
  Loader2, X, ChevronDown, Search, Check,
  XCircle, Mail, AlertCircle, Users,
} from 'lucide-react';

function ReasonCombobox({ reasons, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = reasons.find((r) => (r._id || r) === value);
  const filtered = query
    ? reasons.filter((r) => (r.name || r).toLowerCase().includes(query.toLowerCase()))
    : reasons;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!e.target.closest?.('[data-reason-combo]')) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" data-reason-combo>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
          open
            ? 'bg-dark-900 border-rivvra-500/60'
            : 'bg-dark-900 border-dark-600 hover:border-dark-500'
        } ${selected ? 'text-white' : 'text-dark-400'}`}
      >
        <span className="truncate">{selected ? (selected.name || selected) : 'Select a reason…'}</span>
        <ChevronDown size={16} className={`text-dark-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-700">
            <Search size={14} className="text-dark-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reasons…"
              className="flex-1 bg-transparent text-sm text-white placeholder-dark-500 focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-dark-500">No matching reasons</div>
            ) : (
              filtered.map((r) => {
                const id = r._id || r;
                const name = r.name || r;
                const active = id === value;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onChange(id); setOpen(false); setQuery(''); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                      active ? 'bg-rivvra-500/10 text-rivvra-300' : 'text-dark-200 hover:bg-dark-700'
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    {active && <Check size={14} className="text-rivvra-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Refuse modal — supports two modes.
 *
 *   mode="single" (default): pass `application` + `currentStageName`.
 *     Shows candidate / job / stage summary. onConfirm receives
 *     { refuseReasonId, sendEmail }.
 *
 *   mode="bulk": pass `applications` (array). Summary shows the count
 *     and a preview of the first few candidate names. The email toggle
 *     applies to every selected application (server iterates and fires
 *     per-app rejection emails).
 */
export default function RefuseModal({
  show,
  onClose,
  onConfirm,
  reasons,
  saving,
  mode = 'single',
  application,
  currentStageName,
  applications,
}) {
  const [reasonId, setReasonId] = useState('');
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    if (show) {
      setReasonId('');
      setSendEmail(true);
    }
  }, [show]);

  if (!show) return null;

  const isBulk = mode === 'bulk';
  const bulkApps = applications || [];
  const bulkCount = bulkApps.length;
  const candidatesWithEmail = isBulk
    ? bulkApps.filter((a) => !!a?.email).length
    : (application?.email ? 1 : 0);

  const canConfirm = !!reasonId && !saving && (isBulk ? bulkCount > 0 : true);

  // Build header / summary content per mode
  let titleNode;
  let subtitleNode;
  let summaryNode;

  if (isBulk) {
    const previewNames = bulkApps
      .slice(0, 5)
      .map((a) => a?.candidateName || a?.partnerName || 'Unnamed')
      .join(', ');
    const more = bulkCount > 5 ? ` +${bulkCount - 5} more` : '';
    titleNode = `Refuse ${bulkCount} application${bulkCount === 1 ? '' : 's'}`;
    subtitleNode = 'Already-hired, already-refused, and archived applications in your selection are skipped automatically.';
    summaryNode = (
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <span className="text-dark-400">Selected</span>
        <span className="text-white font-medium">{bulkCount} application{bulkCount === 1 ? '' : 's'}</span>
        <span className="text-dark-400">Candidates</span>
        <span className="text-dark-200 break-words">{previewNames}{more}</span>
      </div>
    );
  } else {
    const candidateName = application?.candidateName || application?.partnerName || 'Unnamed Candidate';
    const jobName = application?.jobName || application?.jobPositionName || application?.jobId?.name || '—';
    titleNode = 'Refuse Application';
    subtitleNode = 'This terminates the application. You can restore it later from admin tools.';
    summaryNode = (
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <span className="text-dark-400">Candidate</span>
        <span className="text-white font-medium truncate">{candidateName}</span>
        <span className="text-dark-400">Job</span>
        <span className="text-dark-200 truncate">{jobName}</span>
        <span className="text-dark-400">Current stage</span>
        <span className="text-dark-200">{currentStageName || '—'}</span>
      </div>
    );
  }

  const emailMeta = isBulk
    ? candidatesWithEmail === 0
      ? 'None of the selected candidates have an email on file — nothing will be sent.'
      : candidatesWithEmail === bulkCount
        ? `One ats_refused email per candidate will be sent (${candidatesWithEmail} total).`
        : `${candidatesWithEmail} of ${bulkCount} selected candidates have an email on file. Only those will be notified.`
    : application?.email
      ? <>Email will be sent to <span className="text-dark-200">{application.email}</span> using the <span className="text-dark-200">ats_refused</span> template.</>
      : 'No email on file — nothing will be sent regardless of this setting.';

  const emailToggleDisabled = isBulk ? candidatesWithEmail === 0 : !application?.email;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refuse-modal-title"
        className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-lg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-dark-700 rounded-t-xl">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
              {isBulk ? <Users size={18} className="text-red-400" /> : <XCircle size={18} className="text-red-400" />}
            </div>
            <div>
              <h3 id="refuse-modal-title" className="text-base font-semibold text-white">{titleNode}</h3>
              <p className="text-xs text-dark-400 mt-0.5">{subtitleNode}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-dark-400 hover:text-white transition-colors -mt-1">
            <X size={18} />
          </button>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-dark-900/40 border-b border-dark-700">
          {summaryNode}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1.5">
              Reason for refusal <span className="text-red-400">*</span>
            </label>
            <ReasonCombobox
              reasons={reasons}
              value={reasonId}
              onChange={setReasonId}
              disabled={saving}
            />
            <p className="mt-1.5 text-xs text-dark-500">
              Missing a reason? Add it under Configuration → Picklists → Refuse Reasons.
            </p>
          </div>

          <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
            emailToggleDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
          } ${
            sendEmail && !emailToggleDisabled
              ? 'bg-rivvra-500/5 border-rivvra-500/30'
              : 'bg-dark-900/40 border-dark-700 hover:border-dark-600'
          }`}>
            <input
              type="checkbox"
              checked={sendEmail && !emailToggleDisabled}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={saving || emailToggleDisabled}
              className="mt-0.5 w-4 h-4 rounded border-dark-600 bg-dark-900 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Mail size={14} className={sendEmail && !emailToggleDisabled ? 'text-rivvra-300' : 'text-dark-400'} />
                <span className="text-sm font-medium text-white">
                  {isBulk ? 'Send rejection emails to candidates' : 'Send rejection email to candidate'}
                </span>
              </div>
              <p className="text-xs text-dark-400 mt-0.5 break-words">{emailMeta}</p>
              {!sendEmail && !emailToggleDisabled && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>Silent refusal — {isBulk ? 'no candidates will be notified' : 'the candidate will not be notified'}.</span>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-dark-900/40 border-t border-dark-700 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-dark-200 hover:bg-dark-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({
              refuseReasonId: reasonId,
              sendEmail: sendEmail && !emailToggleDisabled,
            })}
            disabled={!canConfirm}
            className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-red-500/30 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <XCircle size={14} />
            {isBulk ? `Refuse ${bulkCount}` : 'Refuse Application'}
          </button>
        </div>
      </div>
    </div>
  );
}
