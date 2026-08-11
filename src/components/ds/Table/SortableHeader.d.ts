import * as React from 'react';
import type { SortState } from './DataTable';

export interface SortableHeaderProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** This column's sort key. */
  column: string;
  /** Current table sort; `null` when unsorted. */
  sort?: SortState | null;
  onSortChange?: (next: SortState | null) => void;
  align?: 'left' | 'center' | 'right';
  children?: React.ReactNode;
}

/** Standalone sortable `<th>` for hand-built tables. Cycle: asc → desc → cleared. */
export declare function SortableHeader(props: SortableHeaderProps): JSX.Element;
