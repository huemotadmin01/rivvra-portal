import { useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * ConfirmDialog — styled replacement for window.confirm().
 *
 * Render conditionally on a `confirm` state. Drop-in pattern:
 *   const [confirm, setConfirm] = useState(null);
 *   ...
 *   <ConfirmDialog
 *     open={!!confirm}
 *     {...confirm}
 *     onCancel={() => setConfirm(null)}
 *     onConfirm={async () => { await confirm.action(); setConfirm(null); }}
 *   />
 *
 * Props:
 *  open         — whether the dialog is shown
 *  title        — heading
 *  message      — body text (string or ReactNode)
 *  confirmLabel — primary button text (default "Confirm")
 *  cancelLabel  — cancel button text (default "Cancel")
 *  danger       — render destructive style (red) on the confirm button
 *  primary      — render primary style (fuchsia) on the confirm button
 *  busy         — disable buttons + show spinner while an action is running
 *  onCancel     — close handler
 *  onConfirm    — confirm handler; can be async
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  primary = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  // Esc closes; Enter confirms (when not busy).
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (busy) return;
      if (e.key === 'Escape') onCancel?.();
      if (e.key === 'Enter') onConfirm?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  const cls = danger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : primary
      ? 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white'
      : 'bg-rivvra-500 hover:bg-rivvra-600 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-800 rounded-xl shadow-2xl">
        <div className="p-5 border-b border-dark-800 flex items-start gap-3">
          {danger && (
            <div className="p-2 rounded-lg bg-red-950 text-red-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
          )}
          <h3 className="text-base font-semibold text-white pt-0.5">{title}</h3>
        </div>
        <div className="p-5">
          <div className="text-sm text-dark-300 whitespace-pre-wrap">
            {message}
          </div>
        </div>
        <div className="p-5 border-t border-dark-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-800 hover:bg-dark-700 text-dark-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 ${cls}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
