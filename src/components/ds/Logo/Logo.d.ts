import * as React from 'react';

export interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** Rendered width and height in px. */
  size?: number;
  /** Accessible name. Omit for decorative use (renders aria-hidden). */
  title?: string;
}

/** The Rivvra spiral mark, stroked with the brand gradient. */
export declare function Logo(props: LogoProps): JSX.Element;

export interface LogoLockupProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Mark size in px; the wordmark scales from it. */
  size?: number;
}

/** Spiral + "Rivvra" wordmark at the correct gap, weight and tracking. */
export declare function LogoLockup(props: LogoLockupProps): JSX.Element;
