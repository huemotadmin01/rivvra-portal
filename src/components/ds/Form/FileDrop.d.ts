import * as React from 'react';

export interface FileDropProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Receives the chosen `File` — or a `File[]` when `multiple`. */
  onSelect?: (file: File | File[]) => void;
  /** Browse-dialog filter, e.g. `.pdf,application/pdf`. Drops bypass it. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Show the "has a file" accent. The caller decides what filled means. */
  filled?: boolean;
  /** Zone contents — prompt copy, or the selected file's summary. */
  children?: React.ReactNode;
}

/**
 * Drag-and-drop file target with click-to-browse. Presentational: it owns the
 * drag highlight and hidden input, and never validates — type and size rules
 * belong to the caller, since their error copy is domain copy.
 */
export declare function FileDrop(props: FileDropProps): JSX.Element;
