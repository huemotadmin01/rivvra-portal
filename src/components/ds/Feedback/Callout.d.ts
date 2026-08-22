import * as React from 'react';

export type CalloutTone = 'neutral' | 'brand' | 'warn' | 'danger' | 'info';

export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Semantic colour. Matches Chip's tone vocabulary. */
  tone?: CalloutTone;
  /** Leading icon, inherits the tone's ink. */
  icon?: React.ReactNode;
  /** Bolded lead-in, rendered inline before `children`. */
  title?: React.ReactNode;
  /** Right-aligned controls — a Retry button, a dismiss. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/** Full-width inline notice: tinted surface, icon, message, optional action. */
export declare function Callout(props: CalloutProps): JSX.Element;
