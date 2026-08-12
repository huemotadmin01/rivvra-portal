import * as React from 'react';

export interface ComboBoxOption {
  value: string | number;
  label: string;
  /** Secondary line under the label — designation, email, whatever disambiguates.
   *  Also searched. */
  sub?: string;
}

export interface ComboBoxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'style'> {
  /** Selected option's value, or '' for none. Controlled. */
  value?: string | number;
  /** Fires with the next value. Nothing is persisted — the caller owns the state. */
  onChange?: (next: string | number) => void;
  /**
   * Server-search hook, debounced 250ms and fired only while the popover is
   * open (including once with `''` on open, which resets the list). Wire it
   * when the option universe is larger than one page — without it the caller
   * pre-loads a capped list and the tail silently disappears from the picker.
   * The local filter still runs over whatever comes back.
   */
  onSearch?: (query: string) => void;
  options?: ComboBoxOption[];
  /** Placeholder inside the popover's search box. */
  placeholder?: string;
  /** Trigger text when nothing is selected. Default "Select…". */
  emptyLabel?: string;
  disabled?: boolean;
  /** Show the danger ring. Pair with `Field`'s `error`. */
  invalid?: boolean;
  /** Wire to a `Field`'s `htmlFor`. A `<label for>` does not name a `<button>`
   *  in practice, so pass `aria-label` as well — it lands on the trigger. */
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Always-visible searchable single-select for forms — the plain-control member
 * of the picker family (`InlineComboField` commits on select in a detail row,
 * `EntityLookup` searches asynchronously).
 *
 * Enter inside the search box is always swallowed, so a ComboBox inside a
 * `<form>` never submits it by accident; it commits only when the search has
 * narrowed to exactly one option.
 */
export declare function ComboBox(props: ComboBoxProps): JSX.Element;
