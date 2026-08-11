import * as React from 'react';

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Sets the glyph and tint: check / alert / cross. */
  tone?: 'brand' | 'warn' | 'danger';
  title?: React.ReactNode;
  /** Second line — the detail the title omits. */
  children?: React.ReactNode;
  /** Omit to make the toast non-dismissible. */
  onDismiss?: () => void;
}

/** Single notification. Render inside `ToastStack`. */
export declare function Toast(props: ToastProps): JSX.Element;

export interface ToastStackProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/** Fixed bottom-right column for `Toast` children. */
export declare function ToastStack(props: ToastStackProps): JSX.Element;
