import * as React from 'react';
import type { SavedView } from './SavedViews';

export interface AppliedFilter {
  id?: string | number;
  /** Field name. */
  label: string;
  /** Applied value, already formatted for display. */
  value: React.ReactNode;
}

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  search?: string;
  /** Omit to hide the search field. */
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: AppliedFilter[];
  onRemoveFilter?: (filter: AppliedFilter) => void;
  onEditFilter?: (filter: AppliedFilter) => void;
  /** Omit to hide the add-filter chip. */
  onAddFilter?: () => void;
  onClearAll?: () => void;
  /** Omit to hide the saved-views switcher. */
  views?: SavedView[];
  activeViewId?: string | number | null;
  viewsDirty?: boolean;
  onViewSelect?: (id: string | number | null) => void;
  onViewSave?: () => void;
  onViewDelete?: (id: string | number) => void;
  /** Right-aligned result count. */
  resultCount?: number;
  noun?: string;
  /** Extra controls inserted after the views switcher. */
  left?: React.ReactNode;
  /** Right-side slot — density toggle, export, primary action. */
  children?: React.ReactNode;
}

/** The list-page control strip: search, saved views, filter chips, actions. */
export declare function FilterBar(props: FilterBarProps): JSX.Element;
