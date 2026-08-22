import * as React from 'react';

export interface SelectChipOption { value: string | number; label: string }

export interface SelectChipProps {
  /** Field name shown before the value, e.g. "Stage". */
  label: string;
  /** Selected option value; '' means cleared. Controlled. */
  value?: string | number;
  /** Fires with the next value, or '' when cleared / re-clicked. */
  onChange?: (next: string | number) => void;
  options?: SelectChipOption[];
  /** Shown inside the popover when `options` is empty. */
  placeholder?: string;
  /** Text shown as the value when nothing is selected. Default "Any". */
  anyLabel?: string;
}

/** Single-select filter chip with a popover menu. */
export declare function SelectChip(props: SelectChipProps): JSX.Element;
