import * as React from 'react';

export type InlineFieldType =
  | 'text' | 'email' | 'phone' | 'url' | 'number'
  | 'date' | 'datetime-local'
  | 'select' | 'toggle' | 'masked' | 'textarea';

export interface InlineFieldProps {
  label: string;
  /** Key handed back to `onSave`; may be a dotted path ("bankDetails.pan"). */
  field: string;
  value?: unknown;
  type?: InlineFieldType;
  /** False renders static text with no edit affordance. Permission-aware
   *  callers should pass the same predicate the server enforces. */
  editable?: boolean;
  /** Blocks commit when cleared, showing "<label> is required". */
  required?: boolean;
  /** type='select' options. */
  options?: Array<{ value: string | number; label: string }>;
  /** Overrides read-mode rendering entirely. */
  displayValue?: React.ReactNode;
  /** Masks the value in read mode only (bank accounts, PAN). */
  maskFn?: (value: unknown) => React.ReactNode;
  /**
   * Commits the change. MUST reject to signal failure — a resolved promise
   * puts the field in the "saved" state. The parent is responsible for
   * feeding the new value back down via `value`.
   */
  onSave: (field: string, newValue: unknown) => Promise<void>;
  placeholder?: string;
  /** Non-blocking amber hint under the value (format nudges). */
  warn?: string;
  maxLength?: number;
  /** Applied to each keystroke while editing (e.g. uppercase). */
  transform?: (raw: string) => string;
  /** Label column width in px. Default 140. */
  labelWidth?: number;
}

/**
 * Click-to-edit field. Enter commits (except textarea), Escape cancels,
 * blur commits.
 *
 * Save is PESSIMISTIC, not optimistic: the editor stays open with the user's
 * text through `saving`, and on failure offers retry rather than reverting.
 * Committing an unchanged value never calls `onSave` (dates compared as
 * YYYY-MM-DD, since the API returns full ISO strings).
 */
export declare function InlineField(props: InlineFieldProps): JSX.Element;
