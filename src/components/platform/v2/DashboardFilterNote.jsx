// ============================================================================
// DashboardFilterNote — "From the dashboard: …  [Clear]" strip (2026-11-25)
// ============================================================================
//
// Every dashboard number opens its list page with the filters that number was
// counted with. Some of those filters have no chip on the list (a date range,
// "as of month-end", a lost reason), so the list says in words what is applied
// and offers one Clear. The text comes from the `report` URL param, written by
// the dashboard, plus whatever the list page adds.
//
// Helpers live in utils/dashboardLinks.js (fast-refresh needs components-only files):
//   dashboardLink(path, params)  → path?params (drops empty values)
//   useDashboardParams(keys)     → { values, report, active, clear } — reads
//                                  the given URL params once per URL change;
//                                  clear() removes them (and `report`).
// ============================================================================

import { LayoutDashboard, X } from 'lucide-react';
import { Button } from '../../ds';

export default function DashboardFilterNote({ text, onClear, style }) {
  if (!text) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14,
      padding: '8px 12px', borderRadius: 'var(--r-md, 8px)', background: 'var(--surface-2)',
      boxShadow: 'inset 0 0 0 1px var(--line)', font: "450 12.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
      ...style,
    }}>
      <LayoutDashboard size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 600, color: 'var(--fg)' }}>From the dashboard:</b> {text}</span>
      {onClear && <Button variant="ghost" size="sm" iconLeft={<X size={13} />} onClick={onClear}>Clear</Button>}
    </div>
  );
}

// A dashboard number (or row) that opens its list. Plain text look, underline
// on hover, keyboard focus ring. Zero has nothing to open — rendered as text.
const DASH_CSS = `
.dash-link { all: unset; box-sizing: border-box; cursor: pointer; border-radius: 6px; color: inherit; font: inherit; }
.dash-link:hover { text-decoration: underline; }
.dash-link:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.dash-link.dash-row { display: block; width: 100%; padding: 3px 6px; margin: -3px -6px; text-decoration: none; }
.dash-link.dash-row:hover { background: var(--surface-2); text-decoration: none; }
.dash-card { cursor: pointer; }
`;
if (typeof document !== 'undefined' && !document.getElementById('dash-link-css')) {
  const el = document.createElement('style'); el.id = 'dash-link-css'; el.textContent = DASH_CSS; document.head.appendChild(el);
}

export function DashLink({ onClick, title, row = false, children, style, disabled }) {
  if (disabled || !onClick) return <span style={style}>{children}</span>;
  return (
    <button type="button" className={`dash-link${row ? ' dash-row' : ''}`} onClick={onClick} title={title} style={style}>
      {children}
    </button>
  );
}
