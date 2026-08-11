import * as React from 'react';

export interface InlineComboFieldProps {
  label: string;
  field: string;
  /** Selected option's value, or '' for none. */
  value?: string | number;
  options?: Array<{ value: string | number; label: string }>;
  editable?: boolean;
  required?: boolean;
  /** Offers a "— None —" entry. Ignored when `required`. */
  allowClear?: boolean;
  /** Read-mode label when the value isn't in `options` (e.g. a name
   *  denormalised onto the record). */
  displayValue?: React.ReactNode;
  /** Must reject to signal failure. See InlineField. */
  onSave: (field: string, newValue: string | number) => Promise<void>;
  placeholder?: string;
  warn?: string;
  labelWidth?: number;
}

/**
 * Searchable inline picker; commits on select. Same status machine and
 * pessimistic save as InlineField. Errors surface in read mode because the
 * popover has already closed. Enter commits only when the search has
 * narrowed to a single option.
 */
export declare function InlineComboField(props: InlineComboFieldProps): JSX.Element;
