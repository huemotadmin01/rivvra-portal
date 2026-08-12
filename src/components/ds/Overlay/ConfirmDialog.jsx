import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from '../Button/Button';

/**
 * ConfirmDialog — the "are you sure?" dialog, on `Modal`.
 *
 * Prop-compatible with `shared/ConfirmDialog` so migrating a call site is an
 * import swap, with one deliberate difference:
 *
 * **Enter confirms only when `danger` is false.** The legacy dialog bound
 * Enter to confirm unconditionally, so a stray keypress with a delete
 * confirmation open destroyed the record — and these dialogs open from a
 * click, meaning Enter is frequently still held from whatever the user was
 * typing. Destructive confirmations require the button. Escape always
 * cancels, in both variants.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (busy) return;
      if (e.key === 'Escape') onCancel?.();
      if (e.key === 'Enter' && !danger) onConfirm?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, busy, danger, onCancel, onConfirm]);

  return (
    <Modal
      open={open}
      // Non-dismissible while the action is in flight — closing the dialog
      // would hide the outcome of a request already on the wire.
      onClose={busy ? undefined : onCancel}
      size="sm"
      tone={danger ? 'danger' : 'brand'}
      icon={danger ? <AlertTriangle size={16} /> : null}
      title={title}
      footer={(
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      )}
    >
      {message && (
        <div style={{
          font: "450 13px/1.6 'Inter', system-ui, sans-serif",
          color: 'var(--fg-2, #c3ccd6)', whiteSpace: 'pre-wrap',
        }}>
          {message}
        </div>
      )}
    </Modal>
  );
}
