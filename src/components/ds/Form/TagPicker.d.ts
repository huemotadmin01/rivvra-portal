import * as React from 'react';

export interface TagOption {
  value: string;
  label: string;
}

export interface TagPickerProps {
  /** Assigned tag ids. */
  value?: string[];
  /** The full assignable vocabulary; also supplies the chip labels. */
  options?: TagOption[];
  /** Receives the complete next id array, not a delta. */
  onChange?: (nextIds: string[]) => void;
  /** False hides the remove buttons and the "Add tag" trigger. */
  editable?: boolean;
  /** Read-mode text when nothing is assigned. Default "No tags assigned". */
  emptyLabel?: string;
  placeholder?: string;
}

/**
 * Assigned-tags row: removable chips plus a searchable "Add tag" popover
 * listing everything not yet applied.
 *
 * `onChange` is fire-and-forget — it does NOT await the caller's save, so a
 * failed write must be reverted by the caller. Ids missing from `options`
 * render as the raw id rather than blank.
 */
export declare function TagPicker(props: TagPickerProps): JSX.Element;
