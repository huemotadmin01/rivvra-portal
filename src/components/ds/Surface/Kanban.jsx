/**
 * Kanban — board, column, card and drag overlay.
 *
 * PRESENTATIONAL ONLY, and deliberately so. These components do not import
 * dnd-kit and know nothing about dragging: the caller runs `useSortable` /
 * `useDroppable` and hands the results down as `dragRef`, `dragProps`,
 * `style`, `isDragging`, `dropRef` and `isOver`.
 *
 * That is the same split the filter controls already use — `ds/` components
 * are *controlled* and the URL binding lives in `listkit` — applied to drag
 * instead of routing. It keeps `ds/` free of a behavioural dependency, lets a
 * board render read-only with no DnD at all, and means swapping dnd-kit later
 * touches two pages rather than the design system.
 *
 * Card CONTENT is domain vocabulary (an opportunity, an application), so it
 * stays in the page and arrives as children. These own the surface only.
 */

const FONT = "'Inter', system-ui, sans-serif";

/** Horizontally scrolling row of columns. */
export function KanbanBoard({ children, style, ...rest }) {
  return (
    <div
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * One column: header, scrollable body, optional footer.
 *
 * `dropTarget` decides which element carries `dropRef`. Both boards in this
 * codebase were written differently and both work, so it is a prop rather
 * than a house rule:
 *   - 'body'   — only the card list accepts a drop (ATS). Needs the caller's
 *                droppable id to be namespaced, or an empty column resolves
 *                `over` to null and the drag snaps back.
 *   - 'column' — the whole column, header included, accepts a drop (CRM).
 */
export function KanbanColumn({
  title,
  count,
  meta,
  footer,
  dropRef,
  dropTarget = 'body',
  isOver = false,
  maxHeight = 'calc(100dvh - 260px)',
  emptyLabel,
  isEmpty = false,
  children,
  style,
  ...rest
}) {
  const onColumn = dropTarget === 'column';
  return (
    <div
      ref={onColumn ? dropRef : undefined}
      style={{
        flexShrink: 0, minWidth: 280, maxWidth: 300, maxHeight,
        display: 'flex', flexDirection: 'column',
        borderRadius: 'var(--r-2)',
        background: 'var(--surface-1)',
        boxShadow: isOver
          ? '0 0 0 1px var(--brand-line), 0 0 0 3px var(--brand-soft)'
          : '0 0 0 1px var(--line)',
        transition: 'box-shadow 180ms var(--e-out, ease)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{
            font: `600 12px/1.3 ${FONT}`, color: 'var(--fg)', minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </h3>
          {count != null && (
            <span style={{
              flexShrink: 0, padding: '1px 8px', borderRadius: 999,
              background: 'var(--surface-3)', color: 'var(--fg-3)',
              font: `600 10.5px/1.5 ${FONT}`, fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          )}
        </div>
        {meta}
      </div>

      <div
        ref={onColumn ? undefined : dropRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {children}
        {isEmpty && emptyLabel && (
          <p style={{
            padding: '28px 0', textAlign: 'center',
            font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)',
          }}>
            {emptyLabel}
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}

/**
 * A draggable card surface.
 *
 * `dragProps` is where the caller spreads dnd-kit's `attributes` and
 * `listeners`. `draggable` only controls the cursor — whether a card can
 * actually move is the caller's business, since that is a permission
 * question, not a presentational one.
 */
export function KanbanCard({
  dragRef,
  dragProps,
  style,
  isDragging = false,
  draggable = true,
  onClick,
  children,
  ...rest
}) {
  return (
    <div
      ref={dragRef}
      onClick={onClick}
      style={{
        padding: 10, borderRadius: 'var(--r-2)',
        background: 'var(--surface-2)',
        boxShadow: '0 0 0 1px var(--line)',
        cursor: draggable ? 'grab' : (onClick ? 'pointer' : 'default'),
        opacity: isDragging ? 0.4 : 1,
        ...style,
      }}
      {...dragProps}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The floating preview rendered inside dnd-kit's DragOverlay. */
export function KanbanCardOverlay({ width = 280, children, style, ...rest }) {
  return (
    <div
      style={{
        width, padding: 10, borderRadius: 'var(--r-2)',
        background: 'var(--surface-2)',
        boxShadow: '0 0 0 1px var(--brand-line), var(--sh-3)',
        cursor: 'grabbing',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
