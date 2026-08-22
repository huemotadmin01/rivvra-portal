import * as React from 'react';

export interface ConfirmDialogProps {
  open?: boolean;
  title?: React.ReactNode;
  /** Body copy. Name the consequence, not the action. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling, and Enter no longer confirms. */
  danger?: boolean;
  /** Action in flight: buttons disable and the dialog stops dismissing. */
  busy?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void | Promise<void>;
}

/**
 * Confirmation dialog on `Modal`. Prop-compatible with the legacy
 * `shared/ConfirmDialog`, with one deliberate difference: **Enter confirms
 * only when `danger` is false** — the legacy dialog let a stray keypress
 * destroy a record. Escape always cancels.
 */
export declare function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;
