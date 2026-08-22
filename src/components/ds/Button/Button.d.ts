import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. `primary` is the Rivvra green CTA; `danger` is the same
   *  weight in the danger fill, for the confirm button on a destructive
   *  dialog. Do not use `primary` for anything that deletes. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
  /** Element to render. Use `"a"` only when the action is real navigation that
   *  should keep link behaviour (middle-click, open in new tab). */
  as?: 'button' | 'a';
  /** Only meaningful with `as="a"`. */
  href?: string;
}

/** Primary action control. Reads brand + surface tokens, so it themes automatically. */
export declare function Button(props: ButtonProps): JSX.Element;
