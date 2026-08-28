import { useState, useRef, useCallback, useMemo } from 'react';
import { Checkbox as Check } from '../Form/Checkbox';

const DENSITY = {
  comfortable: { pad: '11px 14px', font: '450 13.5px/1.45', head: '9px 14px', h: 44 },
  compact:     { pad: '6px 12px',  font: '450 13px/1.4',    head: '7px 12px', h: 32 },
};

function SortGlyph({ state }) {
  const d = state === 'asc' ? 'M12 19V5M5 12l7-7 7 7' : state === 'desc' ? 'M12 5v14M19 12l-7 7-7-7' : 'M7 15l5 5 5-5M7 9l5-5 5 5';
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: state ? 1 : 0.34, flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}


/**
 * The list surface the whole product is built on: sticky header, three-state
 * sort, drag-resizable columns, row selection, two densities, loading and
 * empty states.
 */
export function DataTable({
  columns = [],
  rows = [],
  rowKey = 'id',
  density = 'comfortable',
  sort = null,
  onSortChange,
  selectable = false,
  selected = [],
  onSelectedChange,
  resizable = true,
  stickyHeader = true,
  stickyTop = 0,
  loading = false,
  loadingRows = 6,
  empty = null,
  totals = null,
  onRowClick,
  rowHref,
  children,
  style,
  ...rest
}) {
  const d = DENSITY[density] || DENSITY.comfortable;
  const [widths, setWidths] = useState({});
  const drag = useRef(null);

  const keyOf = useCallback((row, i) => (typeof rowKey === 'function' ? rowKey(row, i) : row?.[rowKey] ?? i), [rowKey]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const allOn = rows.length > 0 && rows.every((r, i) => selSet.has(keyOf(r, i)));
  const someOn = !allOn && rows.some((r, i) => selSet.has(keyOf(r, i)));

  const toggleAll = (on) => onSelectedChange?.(on ? rows.map(keyOf) : []);
  const toggleRow = (k, on) => {
    const next = new Set(selSet);
    if (on) next.add(k); else next.delete(k);
    onSelectedChange?.([...next]);
  };

  const cycleSort = (col) => {
    if (!col.sortable || !onSortChange) return;
    const cur = sort?.key === col.key ? sort.dir : null;
    onSortChange(cur === null ? { key: col.key, dir: 'asc' } : cur === 'asc' ? { key: col.key, dir: 'desc' } : null);
  };

  const startResize = (e, key, th) => {
    e.preventDefault(); e.stopPropagation();
    drag.current = { key, x: e.clientX, w: th.getBoundingClientRect().width };
    const move = (ev) => {
      if (!drag.current) return;
      const w = Math.max(64, drag.current.w + (ev.clientX - drag.current.x));
      setWidths((p) => ({ ...p, [drag.current.key]: w }));
    };
    const up = () => { drag.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
  };

  const headCell = {
    font: "600 10.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--fg-4, #828e9f)', padding: d.head, textAlign: 'left', whiteSpace: 'nowrap',
    background: 'var(--surface-2, #141b24)', borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
    position: stickyHeader ? 'sticky' : 'static', top: stickyHeader ? stickyTop : 'auto', zIndex: 2, userSelect: 'none',
  };

  const footCell = {
    padding: d.pad, font: d.font, fontWeight: 650, color: 'var(--fg, #eef2f6)',
    background: 'var(--surface-2, #141b24)', borderTop: '1px solid var(--line-2, rgba(255,255,255,.11))',
    whiteSpace: 'nowrap', verticalAlign: 'middle',
  };

  const showEmpty = !loading && rows.length === 0 && !children;

  return (
    <div
      style={{
        border: '1px solid var(--line, rgba(255,255,255,.07))', borderRadius: 'var(--r-3, 14px)',
        background: 'var(--surface-1, #0e131a)', overflow: 'hidden', ...style,
      }}
      {...rest}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: resizable ? 'fixed' : 'auto' }}>
          <colgroup>
            {selectable && <col style={{ width: 40 }} />}
            {columns.map((c) => <col key={c.key} style={{ width: widths[c.key] ?? c.width ?? 'auto' }} />)}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th style={{ ...headCell, padding: d.head, width: 40 }}>
                  <Check checked={allOn} indeterminate={someOn} onChange={toggleAll} label="Select all rows" />
                </th>
              )}
              {columns.map((c, ci) => {
                const state = sort?.key === c.key ? sort.dir : null;
                return (
                  <th key={c.key} style={{ ...headCell, textAlign: c.align || 'left', position: 'relative' }} ref={undefined} aria-sort={state ? (state === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start', width: '100%' }}>
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={(e) => { cycleSort(c); e.currentTarget.blur(); }}
                          // Same ~11px-tall sort control as ds SortableHeader —
                          // `hit-24` gives it a 24x24 tap target inside the
                          // head cell's existing padding.
                          className="hit-24"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, font: 'inherit', position: 'relative', letterSpacing: 'inherit', textTransform: 'inherit', color: state ? 'var(--brand, #22c55e)' : 'inherit' }}
                        >
                          {c.header}
                          <SortGlyph state={state} />
                        </button>
                      ) : c.header}
                    </span>
                    {resizable && ci < columns.length - 1 && (
                      <span
                        onMouseDown={(e) => startResize(e, c.key, e.currentTarget.parentElement)}
                        style={{ position: 'absolute', top: 0, right: 0, width: 7, height: '100%', cursor: 'col-resize', zIndex: 3 }}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {selectable && <td style={{ padding: d.pad, borderBottom: '1px solid var(--line, rgba(255,255,255,.07))' }} />}
                {columns.map((c, j) => (
                  <td key={c.key} style={{ padding: d.pad, borderBottom: '1px solid var(--line, rgba(255,255,255,.07))' }}>
                    <span style={{ display: 'block', height: 9, borderRadius: 5, background: 'var(--surface-3, #1c242f)', width: `${[70, 46, 58, 38, 52][j % 5]}%`, opacity: 1 - i * 0.1, animation: 'rv-pulse 1.4s var(--e-std, ease) infinite' }} />
                  </td>
                ))}
              </tr>
            ))}

            {!loading && children}

            {!loading && !children && rows.map((row, i) => {
              const k = keyOf(row, i);
              const on = selSet.has(k);
              const clickable = !!(onRowClick || rowHref);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row, i) : rowHref ? () => { window.location.href = rowHref(row, i); } : undefined}
                  style={{
                    cursor: clickable ? 'pointer' : 'default',
                    background: on ? 'var(--brand-soft, rgba(34,197,94,.13))' : 'transparent',
                    transition: 'background 110ms var(--e-out, ease)',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  {selectable && (
                    <td style={{ padding: d.pad, borderBottom: '1px solid var(--line, rgba(255,255,255,.07))', verticalAlign: 'middle' }}>
                      <Check checked={on} onChange={(v) => toggleRow(k, v)} label="Select row" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        padding: d.pad, font: d.font, color: c.muted ? 'var(--fg-3, #98a4b2)' : 'var(--fg-2, #bac4d0)',
                        textAlign: c.align || 'left', borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
                        verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: c.wrap ? 'normal' : 'nowrap',
                        fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : 'normal',
                      }}
                    >
                      {c.render ? c.render(row, i) : row?.[c.key] ?? <span style={{ color: 'var(--fg-4, #828e9f)' }}>—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {/* Totals row. Every money report in the product ends in one, and a
              <tfoot> is the only correct place for it: it stays attached to
              the table for screen readers and for print, and it does not join
              the sortable row set. Cells are keyed by COLUMN key rather than
              positionally so a column reorder cannot silently move a total
              under the wrong header — the failure that would matter most on
              an aging or tax report. */}
          {!loading && totals && (
            <tfoot>
              <tr>
                {selectable && <td style={footCell} />}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      ...footCell,
                      textAlign: c.align || 'left',
                      fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : 'normal',
                    }}
                  >
                    {totals[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {showEmpty && <div style={{ padding: '48px 24px' }}>{empty}</div>}
      <style>{'@keyframes rv-pulse{0%,100%{opacity:.5}50%{opacity:.85}}'}</style>
    </div>
  );
}
