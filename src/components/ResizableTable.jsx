import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * ResizableTable — generic list table with drag-resize columns and optional
 * sticky-left / sticky-right columns. Column widths persist in localStorage
 * keyed by `storageKey`.
 *
 * Each column:
 *   - key         : unique string id (used for storage + React key)
 *   - label       : header text (used unless headerRender overrides)
 *   - width       : default width in px
 *   - minWidth    : minimum drag width in px (default 60)
 *   - sticky      : 'left' | 'right' — pins the column at that edge while the
 *                    body scrolls horizontally
 *   - align       : 'left' | 'right' | 'center'  (text alignment, default 'left')
 *   - headerRender: () => ReactNode   (optional — overrides label, e.g. for SortHeader)
 *   - render      : (row) => ReactNode (cell renderer — falls back to row[key])
 *
 * Props:
 *   - columns     : column config array (above)
 *   - rows        : data rows
 *   - rowKey      : (row) => string  (key extractor)
 *   - storageKey  : string           (localStorage key for persisted widths)
 *   - onRowClick  : (row) => void
 *   - emptyMessage: string           (rendered when rows is empty)
 *   - footer      : optional ReactNode rendered below the table (e.g. pagination)
 */
export default function ResizableTable({
  columns,
  rows,
  rowKey,
  storageKey,
  onRowClick,
  emptyMessage = 'No records',
  footer,
}) {
  const defaults = useMemo(() => Object.fromEntries(columns.map(c => [c.key, c.width])), [columns]);
  const [widths, setWidths] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = { ...defaults };
        for (const k of Object.keys(parsed)) {
          if (k in defaults && Number.isFinite(parsed[k])) merged[k] = parsed[k];
        }
        return merged;
      }
    } catch { /* ignore parse errors, fall through to defaults */ }
    return defaults;
  });

  // Persist on change (skip first run when widths == defaults)
  useEffect(() => {
    try {
      const isDefault = columns.every(c => widths[c.key] === defaults[c.key]);
      if (isDefault) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(widths));
      }
    } catch { /* localStorage may be unavailable */ }
  }, [widths, columns, defaults, storageKey]);

  const isCustomized = useMemo(
    () => columns.some(c => widths[c.key] !== defaults[c.key]),
    [columns, widths, defaults]
  );

  const resetWidths = () => setWidths(defaults);

  // Drag-resize machinery
  const dragState = useRef(null);
  const onMouseDownHandle = useCallback((e, key, minWidth) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      key,
      startX: e.clientX,
      startWidth: widths[key],
      minWidth: Math.max(40, minWidth || 60),
    };
    const onMove = (ev) => {
      const s = dragState.current;
      if (!s) return;
      const delta = ev.clientX - s.startX;
      const next = Math.max(s.minWidth, s.startWidth + delta);
      setWidths(prev => prev[s.key] === next ? prev : { ...prev, [s.key]: next });
    };
    const onUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [widths]);

  const totalWidth = columns.reduce((sum, c) => sum + (widths[c.key] || c.width), 0);
  const stickyLeftOffset = (key) => {
    let offset = 0;
    for (const c of columns) {
      if (c.key === key) return offset;
      if (c.sticky === 'left') offset += widths[c.key];
    }
    return offset;
  };
  const stickyRightOffset = (key) => {
    let offset = 0;
    const reversed = [...columns].reverse();
    for (const c of reversed) {
      if (c.key === key) return offset;
      if (c.sticky === 'right') offset += widths[c.key];
    }
    return offset;
  };

  const cellAlignClass = (align) => align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
      {isCustomized && (
        <div className="flex justify-end px-4 py-2 border-b border-dark-700/50">
          <button
            onClick={resetWidths}
            className="text-[11px] text-dark-400 hover:text-white transition-colors"
          >
            Reset columns
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-sm" style={{ width: totalWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {columns.map(c => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-dark-700">
              {columns.map(c => {
                const stickyStyle = c.sticky === 'left'
                  ? { position: 'sticky', left: stickyLeftOffset(c.key), zIndex: 3, background: 'rgb(31 31 35)' }
                  : c.sticky === 'right'
                    ? { position: 'sticky', right: stickyRightOffset(c.key), zIndex: 3, background: 'rgb(31 31 35)' }
                    : {};
                return (
                  <th
                    key={c.key}
                    className={`relative px-4 py-3 ${cellAlignClass(c.align)}`}
                    style={stickyStyle}
                  >
                    {c.headerRender ? c.headerRender() : (
                      <span className="text-xs font-medium text-dark-400 uppercase tracking-wider">{c.label}</span>
                    )}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => onMouseDownHandle(e, c.key, c.minWidth)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-rivvra-500/40 active:bg-rivvra-500/60 transition-colors"
                      title="Drag to resize"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-dark-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : rows.map(row => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-dark-700/50 ${onRowClick ? 'hover:bg-dark-800/50 cursor-pointer' : ''} transition-colors group`}
              >
                {columns.map(c => {
                  const stickyStyle = c.sticky === 'left'
                    ? { position: 'sticky', left: stickyLeftOffset(c.key), zIndex: 1, background: 'rgb(24 24 28)' }
                    : c.sticky === 'right'
                      ? { position: 'sticky', right: stickyRightOffset(c.key), zIndex: 1, background: 'rgb(24 24 28)' }
                      : {};
                  return (
                    <td
                      key={c.key}
                      className={`px-4 py-3 truncate ${cellAlignClass(c.align)}`}
                      style={stickyStyle}
                    >
                      {c.render ? c.render(row) : (row[c.key] ?? '-')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {footer}
    </div>
  );
}
