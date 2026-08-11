import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. `primary` is the Rivvra green CTA. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Control height: 30 / 38 / 44px. */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to fill the container width. */
  block?: boolean;
  disabled?: boolean;
  /** Node rendered before the label (usually a 14–16px icon). */
  iconLeft?: React.ReactNode;
  /** Node rendered after the label (usually an arrow). */
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

/** Primary action control. Reads brand + surface tokens, so it themes automatically. */
export declare function Button(props: ButtonProps): JSX.Element;
