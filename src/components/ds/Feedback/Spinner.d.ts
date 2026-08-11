import * as React from 'react';

export interface SpinnerProps {
  size?: number;
  color?: string;
  label?: string;
  style?: React.CSSProperties;
}
/** Indeterminate spinner for buttons and toolbars. */
export declare function Spinner(props: SpinnerProps): JSX.Element;

/** Centered spinner sized for a route-level Suspense fallback. */
export declare function PageSpinner(props: { minHeight?: number | string; label?: string }): JSX.Element;
