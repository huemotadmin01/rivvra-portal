import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived from the first two words. */
  name?: string;
  /** Override the derived initials. */
  initials?: string;
  /** 24 / 32 / 48px. */
  size?: 'sm' | 'md' | 'lg';
  /** Soft brand halo, for the signed-in user. */
  ring?: boolean;
  /** Photo URL. Replaces the initials fill. */
  src?: string;
}

/** Initials circle with the brand gradient fill. */
export declare function Avatar(props: AvatarProps): JSX.Element;
