import * as React from 'react';

export interface RadioCardOption {
  value: string | number;
  label: React.ReactNode;
  /** The one line explaining what choosing this option means. Rendered inside
   *  the card, so it is part of the option's accessible name. */
  hint?: React.ReactNode;
  /** Leading glyph, usually a 14px lucide icon. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Selected option's value. Controlled. */
  value?: string | number;
  onChange?: (next: string | number) => void;
  options?: RadioCardOption[];
  /** Disables the whole group. */
  disabled?: boolean;
  /** Fixed column count. Omit to auto-fit at a 190px minimum. */
  columns?: number;
}

/**
 * Single-select where the options need explaining — the choice changes what
 * the rest of the form means, so every option and its `hint` stay on screen.
 * Use `Select` or `ComboBox` when the user already knows which value they want.
 *
 * A real radiogroup: one tab stop, arrow keys move the selection (skipping
 * disabled options and wrapping), and each card is announced with its hint.
 */
export declare function RadioCards(props: RadioCardsProps): JSX.Element;
