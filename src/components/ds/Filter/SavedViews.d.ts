import * as React from 'react';

export interface SavedView {
  id: string | number;
  name: string;
  /** Optional record count shown right-aligned. */
  count?: number;
  /** Marks the view as shared with the team. */
  shared?: boolean;
}

export interface SavedViewsProps extends React.HTMLAttributes<HTMLDivElement> {
  views?: SavedView[];
  /** `null` selects the built-in "All records" view. */
  activeId?: string | number | null;
  /** Shows the amber unsaved-changes marker. */
  dirty?: boolean;
  onSelect?: (id: string | number | null) => void;
  /** Omit to hide the save item. */
  onSave?: () => void;
  /** Omit to hide per-view delete. */
  onDelete?: (id: string | number) => void;
}

/** Saved-view switcher: named filter sets, unsaved marker, save and delete. */
export declare function SavedViews(props: SavedViewsProps): JSX.Element;
