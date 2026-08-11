import * as React from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string; dir: SortDir }

export interface Column<Row = any> {
  /** Unique key; also the default row-value lookup. */
  key: string;
  /** Header label. */
  header: React.ReactNode;
  /** Fixed starting width in px (columns stay drag-resizable). */
  width?: number;
  align?: 'left' | 'center' | 'right';
  /** Enables the three-state sort cycle on this header. */
  sortable?: boolean;
  /** Dim the cell text one tier. */
  muted?: boolean;
  /** Allow wrapping instead of truncating. */
  wrap?: boolean;
  /** Custom cell renderer. Falls back to `row[key]`, then an em-dash. */
  render?: (row: Row, index: number) => React.ReactNode;
}

export interface DataTableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  columns: Column<Row>[];
  rows?: Row[];
  /** Row identity — property name or getter. Default `'id'`. */
  rowKey?: string | ((row: Row, index: number) => string | number);
  density?: 'comfortable' | 'compact';
  /** Controlled sort. `null` = server default order. */
  sort?: SortState | null;
  /** Fires with the next state in the asc → desc → null cycle. */
  onSortChange?: (next: SortState | null) => void;
  selectable?: boolean;
  selected?: (string | number)[];
  onSelectedChange?: (keys: (string | number)[]) => void;
  /** Drag handles on header edges. Default true. */
  resizable?: boolean;
  stickyHeader?: boolean;
  /** Offset for the sticky header when it sits below other sticky chrome. */
  stickyTop?: number;
  loading?: boolean;
  loadingRows?: number;
  /** Rendered when there are no rows — pass an `EmptyState`. */
  empty?: React.ReactNode;
  onRowClick?: (row: Row, index: number) => void;
  rowHref?: (row: Row, index: number) => string;
  /** Custom `<tbody>` content — use for grouped tables with `GroupedHeader`. */
  children?: React.ReactNode;
}

/**
 * The list surface the whole product is built on: sticky header, three-state
 * sort, drag-resizable columns, row selection, two densities, loading and
 * empty states.
 */
export declare function DataTable<Row = any>(props: DataTableProps<Row>): JSX.Element;
