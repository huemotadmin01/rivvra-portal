import * as React from 'react';

export interface ModalProps {
  open?: boolean;
  /** Also wired to Escape and the scrim. Omit to make the dialog non-dismissible. */
  onClose?: () => void;
  /** Max width: 400 / 540 / 760px. */
  size?: 'sm' | 'md' | 'lg';
  /** Tints the icon tile. Use `danger` for destructive confirmations. */
  tone?: 'neutral' | 'brand' | 'warn' | 'danger';
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** Supporting line. For confirmations, name the consequence here. */
  sub?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer row — usually a spacer then cancel + confirm. */
  footer?: React.ReactNode;
}

/** Centred dialog. Keep it to confirmations and short create flows. */
export declare function Modal(props: ModalProps): JSX.Element | null;

export interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  /** Leading node in the header, typically an `Avatar`. */
  avatar?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Max width in px. Defaults to 468. */
  width?: number;
}

/** Right-edge side sheet. Inspect a record without losing the list behind it. */
export declare function Drawer(props: DrawerProps): JSX.Element | null;
