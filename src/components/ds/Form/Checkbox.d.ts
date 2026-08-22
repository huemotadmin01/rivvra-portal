import * as React from 'react';

export interface CheckboxProps {
  checked?: boolean;
  /** Renders the dash instead of the tick. Wins over `checked`. */
  indeterminate?: boolean;
  /** Fired with the next value. */
  onChange?: (next: boolean) => void;
  /** Accessible name — required, since the control draws no visible label. */
  label?: string;
  /** Dims the control and ignores click, Space and Enter. */
  disabled?: boolean;
}

/**
 * The small square with a tick. A `span[role=checkbox]` rather than an
 * `<input>` — the tick is drawn, so a native control would only be hidden
 * beneath it. Space and Enter both toggle.
 *
 * Clicks are stopped from propagating, so a checkbox inside a clickable
 * `DataTable` row selects without also opening the row.
 */
export declare function Checkbox(props: CheckboxProps): JSX.Element;
