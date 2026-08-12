import * as React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Show the danger ring. Pair with `Field`'s `error`. */
  invalid?: boolean;
  /** `<option>` elements. */
  children?: React.ReactNode;
}

/**
 * Form-height native select, sized to match `Input`. Use `InlineSelect` for
 * toolbars and filter strips, and `ComboBox` when the option list is long
 * enough to need searching.
 */
export declare function Select(props: SelectProps): JSX.Element;
