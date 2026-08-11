import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Glyph shown in the tinted tile above the heading. */
  icon?: React.ReactNode;
  /** Tints the icon tile. Use `danger` for errors, `warn` for no-access. */
  tone?: 'neutral' | 'brand' | 'warn' | 'danger' | 'info';
  title?: React.ReactNode;
  /** Explanatory line. Say what to do next, not just what went wrong. */
  children?: React.ReactNode;
  /** Buttons rendered under the copy. */
  actions?: React.ReactNode;
  /** Tighter padding, for use inside a panel rather than a full page. */
  compact?: boolean;
}

/** Centred placeholder for empty, filtered, error, and no-access views. */
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
