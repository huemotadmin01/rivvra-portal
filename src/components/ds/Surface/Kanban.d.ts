import * as React from 'react';

export interface KanbanBoardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/** Horizontally scrolling row of columns. */
export declare function KanbanBoard(props: KanbanBoardProps): JSX.Element;

export interface KanbanColumnProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  /** Total in this column — the badge. Note this is usually the SERVER total,
   *  not `children.length`, when the column pages. */
  count?: number | null;
  /** Extra header lines under the title — per-currency totals, SLA, etc. */
  meta?: React.ReactNode;
  /** Rendered after the cards, inside the scroll area. Use for "Load more". */
  footer?: React.ReactNode;
  /** `setNodeRef` from the caller's `useDroppable`. */
  dropRef?: React.Ref<HTMLDivElement>;
  /**
   * Which element accepts the drop. `'body'` (default) makes only the card
   * list droppable — the caller's droppable id must then be namespaced, or an
   * empty column resolves `over` to null and the drag snaps back. `'column'`
   * makes the whole column, header included, a drop target.
   */
  dropTarget?: 'body' | 'column';
  /** `isOver` from the caller's `useDroppable` — draws the drop ring. */
  isOver?: boolean;
  /** CSS max-height. Default `calc(100dvh - 260px)`. A percentage will not
   *  work here: it only resolves against a parent with a fixed height. */
  maxHeight?: number | string;
  emptyLabel?: React.ReactNode;
  isEmpty?: boolean;
  children?: React.ReactNode;
}

/** One column: header, scrollable body, optional footer. */
export declare function KanbanColumn(props: KanbanColumnProps): JSX.Element;

export interface KanbanCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `setNodeRef` from the caller's `useSortable`. */
  dragRef?: React.Ref<HTMLDivElement>;
  /** Spread the caller's `attributes` and `listeners` in here. */
  dragProps?: Record<string, unknown>;
  isDragging?: boolean;
  /** Cursor only. Whether the card may actually move is a permission
   *  question and stays with the caller. */
  draggable?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
}

/**
 * A draggable card surface. Card CONTENT is domain vocabulary and stays in the
 * page — this owns the surface only.
 */
export declare function KanbanCard(props: KanbanCardProps): JSX.Element;

export interface KanbanCardOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Match the column width so the preview doesn't jump. Default 280. */
  width?: number;
  children?: React.ReactNode;
}

/** The floating preview rendered inside dnd-kit's `DragOverlay`. */
export declare function KanbanCardOverlay(props: KanbanCardOverlayProps): JSX.Element;
