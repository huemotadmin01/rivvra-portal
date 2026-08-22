import * as React from 'react';

export interface EditableHeadingProps {
  value?: string;
  /** False renders a plain heading with no edit affordance. */
  editable?: boolean;
  /**
   * Commits the new title. MUST reject to signal failure — the input then
   * stays open with the user's text and an inline error.
   */
  onSave: (next: string) => Promise<void>;
  /** Shown italic-muted when `value` is empty. */
  placeholder?: string;
  /** Open in edit mode on mount when there is no value yet (create flows). */
  autoEdit?: boolean;
  /** Runs on the committed string before it reaches `onSave`. */
  transform?: (committed: string) => string;
  /** Heading font size in px. Default 22. */
  size?: number;
}

/**
 * Click-to-edit record title. Enter commits, Escape reverts, blur commits.
 * Save is PESSIMISTIC (see InlineField): a failed save keeps the editor open
 * rather than discarding a name the user may not be able to retype.
 * Committing an unchanged or whitespace-only value never calls `onSave`.
 */
export declare function EditableHeading(props: EditableHeadingProps): JSX.Element;
