import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, X } from 'lucide-react';

/**
 * ReasonPromptDialog — styled replacement for window.confirm() +
 * window.prompt() chains. Use whenever an action needs a required
 * free-text reason in addition to confirmation (Restore refused
 * application, Revise signed offer, etc.).
 *
 * Esc closes; Cmd/Ctrl+Enter submits when not busy.
 *
 * Props:
 *  open           — whether the dialog is shown
 *  title          — heading
 *  message        — body / warning (string or ReactNode), shown above the input
 *  reasonLabel    — label above the textarea (default "Reason")
 *  reasonPlaceholder — placeholder for the textarea
 *  confirmLabel   — primary button text (default "Confirm")
 *  cancelLabel    — cancel button text (default "Cancel")
 *  danger         — destructive style (red); otherwise emerald-confirm
 *  busy           — disable inputs + show spinner during async confirm
 *  maxLength      — input maxLength (default 500, matches API)
 *  onCancel       — close handler
 *  onConfirm      — async handler called with the trimmed reason
 */
export default function ReasonPromptDialog({
  open,
  title,
  message,
  reasonLabel = 'Reason',
  reasonPlaceholder = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  maxLength = 500,
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  // Reset on each open so an old reason doesn't leak between calls.
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (busy) return;
      if (e.key === 'Escape') onCancel?.();
      // Cmd/Ctrl+Enter submits — plain Enter inserts a newline so
      // recruiters can write multi-line reasons.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, reason, onCancel]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A reason is required.');
      return;
    }
    if (trimmed.length > maxLength) {
      setError(`Keep it under ${maxLength} characters.`);
      return;
    }
    setError('');
    await onConfirm?.(trimmed);
  };

  const cls = danger
    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30'
    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}
    >
      <div className="w-full max-w-lg bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-dark-700/80 flex items-start gap-3">
          {danger && (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500/10 text-red-300">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => !busy && onCancel?.()}
            disabled={busy}
            className="text-dark-400 hover:text-white transition-colors flex-shrink-0 -mr-1 disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {message && (
            <div className="text-sm text-dark-300 whitespace-pre-wrap leading-relaxed">
              {message}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">
              {reasonLabel} <span className="text-red-400">*</span>
            </label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (error) setError(''); }}
              placeholder={reasonPlaceholder}
              rows={3}
              maxLength={maxLength + 50}
              disabled={busy}
              className="input-field w-full text-sm resize-y"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-red-400">{error || ' '}</span>
              <span className="text-[11px] text-dark-500">{reason.length}/{maxLength}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-dark-700/80 bg-dark-800/95">
          <button
            type="button"
            onClick={() => !busy && onCancel?.()}
            disabled={busy}
            className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !reason.trim()}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${cls}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
