import * as React from 'react';

export interface BulkAction {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  /** `primary` fills with brand; `danger` tints the label red. */
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}

export interface BulkActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Selected row count. `0` hides the bar. */
  count?: number;
  noun?: string;
  nounPlural?: string;
  onClear?: () => void;
  actions?: BulkAction[];
  /** Pin to the viewport bottom (default) or flow with the page. Fixed mode
   *  sits at z-index 80 — above app chrome, below modals and toasts. */
  fixed?: boolean;
}

/** Slides up when rows are selected: count, verbs, and a clear action. */
export declare function BulkActionBar(props: BulkActionBarProps): JSX.Element;
