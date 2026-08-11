import * as React from 'react';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic tint. `brand` also gains a 1px ring. */
  tone?: 'neutral' | 'brand' | 'warn' | 'danger' | 'info';
  /** Leading status dot in the current colour. */
  dot?: boolean;
  /** Uppercase micro-label styling, for table cells and card corners. */
  uppercase?: boolean;
  children?: React.ReactNode;
}

/** Compact status pill. Pattern is bg/14, text/full, optional 1px ring. */
export declare function Chip(props: ChipProps): JSX.Element;
