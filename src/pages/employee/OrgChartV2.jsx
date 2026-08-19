import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import {
  Move, X, ZoomIn, ZoomOut, Users, Maximize2, ChevronUp,
} from 'lucide-react';
import { Button, SearchInput, Callout, EmptyState, PageSpinner } from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// This page is mostly geometry, and geometry does not get "modernised". The
// card metrics, `layoutTree`, the connector path expression, the cycle-breaking
// tree builder, the pan/zoom/fit handlers, and `reassignManager` (including its
// descendant check, the only thing stopping a manager being filed under their
// own report) are all spliced in byte-identically.
//
// Three things are deliberately not verbatim, each diffed around:
//   • the connector `stroke`, which was a hardcoded slate rgba and is now a
//     token, so the lines survive the light theme;
//   • the avatar ink. Legacy drew the initials in `avatarColors[0]` over that
//     same colour at 25% — an accent on its own tint, which is the pairing this
//     project has already measured at ~4.1 against a 4.5 floor. The hash and the
//     palette are unchanged, so an employee keeps their colour; the tint carries
//     the identity and the ink is `--fg`.
//   • `handleClick`'s unused `e` parameter, dropped (that was one of legacy's
//     three lint errors).
//
// Not triggered: reassign manager (drag-drop or move-mode click).
// ─────────────────────────────────────────────────────────────────────────────

/* ── Constants ─────────────────────────────────────────────────────────── */
const CARD_W = 200;
const CARD_H = 160;
const H_GAP = 32;    // horizontal gap between sibling cards
const V_GAP = 60;    // vertical gap between levels
const CONNECTOR_RADIUS = 8; // rounded corner radius for connector lines

const EMP_TYPE_COLORS = {
  confirmed:           { bg: '#22c55e', text: '#22c55e' },
  internal_consultant: { bg: '#3b82f6', text: '#3b82f6' },
  external_consultant: { bg: '#a855f7', text: '#a855f7' },
  intern:              { bg: '#f59e0b', text: '#f59e0b' },
  extern:              { bg: '#ec4899', text: '#ec4899' },
};

const EMP_TYPE_LABELS = {
  confirmed: 'Confirmed',
  internal_consultant: 'Int. Consultant',
  external_consultant: 'Ext. Consultant',
  intern: 'Intern',
  extern: 'Extern',
};

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  ['#f97316', '#fed7aa'], ['#3b82f6', '#bfdbfe'], ['#22c55e', '#bbf7d0'],
  ['#a855f7', '#e9d5ff'], ['#ec4899', '#fbcfe8'], ['#06b6d4', '#a5f3fc'],
  ['#f59e0b', '#fde68a'], ['#ef4444', '#fecaca'],
];
function getAvatarColor(name) {
  const hash = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/* ── Layout Engine (top-down tree) ──────────────────────────────────── */
// Returns { x, y, width, subtreeWidth } for each node
function layoutTree(roots, childrenMap, expandedNodes) {
  const positions = {};

  // Compute subtree width for each node
  function subtreeWidth(id) {
    const kids = childrenMap[id] || [];
    const expanded = expandedNodes.has(id);
    if (kids.length === 0 || !expanded) return CARD_W;
    const childWidths = kids.map(c => subtreeWidth(c._id));
    return Math.max(CARD_W, childWidths.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP);
  }

  // Position nodes recursively
  function positionNode(id, x, y) {
    const sw = subtreeWidth(id);
    const nodeX = x + sw / 2 - CARD_W / 2;
    positions[id] = { x: nodeX, y, subtreeWidth: sw };

    const kids = childrenMap[id] || [];
    const expanded = expandedNodes.has(id);
    if (kids.length > 0 && expanded) {
      let cx = x;
      const childY = y + CARD_H + V_GAP;
      kids.forEach(child => {
        const cw = subtreeWidth(child._id);
        positionNode(child._id, cx, childY);
        cx += cw + H_GAP;
      });
    }
  }

  // Position each root tree side by side
  let offsetX = 0;
  roots.forEach(r => {
    const sw = subtreeWidth(r._id);
    positionNode(r._id, offsetX, 0);
    offsetX += sw + H_GAP * 2;
  });

  // Compute total bounds
  let maxX = 0, maxY = 0;
  Object.values(positions).forEach(p => {
    maxX = Math.max(maxX, p.x + CARD_W);
    maxY = Math.max(maxY, p.y + CARD_H);
  });

  return { positions, totalWidth: maxX, totalHeight: maxY };
}

/* ── Connector Lines ─────────────────────────────────────────────────── */
function ConnectorLines({ roots, childrenMap, positions, expandedNodes }) {
  const lines = [];

  function drawConnectors(parentId) {
    const kids = (childrenMap[parentId] || []);
    if (kids.length === 0 || !expandedNodes.has(parentId)) return;
    const pp = positions[parentId];
    if (!pp) return;

    const parentCx = pp.x + CARD_W / 2;
    const parentBot = pp.y + CARD_H;
    const midY = parentBot + V_GAP / 2;

    kids.forEach(child => {
      const cp = positions[child._id];
      if (!cp) return;
      const childCx = cp.x + CARD_W / 2;
      const childTop = cp.y;

      // Draw L-shaped connector: parent bottom → mid-horizontal → child top
      lines.push(
        <path
          key={`${parentId}-${child._id}`}
          d={`M ${parentCx} ${parentBot} L ${parentCx} ${midY - (parentCx !== childCx ? CONNECTOR_RADIUS : 0)} ${
            parentCx !== childCx
              ? `Q ${parentCx} ${midY} ${parentCx + Math.sign(childCx - parentCx) * CONNECTOR_RADIUS} ${midY} L ${childCx - Math.sign(childCx - parentCx) * CONNECTOR_RADIUS} ${midY} Q ${childCx} ${midY} ${childCx} ${midY + CONNECTOR_RADIUS}`
              : ''
          } L ${childCx} ${childTop}`}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="2"
        />
      );
      drawConnectors(child._id);
    });
  }

  roots.forEach(r => drawConnectors(r._id));
  return <>{lines}</>;
}

/* ── OrgCard component ─────────────────────────────────────────────── */
function OrgCard({ emp, pos, isAdmin, movingId, onMoveStart, onMoveTarget, onDrop,
  dragOverId, onDragOver, onNavigate, childrenMap, expandedNodes, toggleExpand,
  search, justDroppedRef }) {

  const children = childrenMap[emp._id] || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(emp._id);
  const isMoving = movingId === emp._id;
  const isTarget = movingId && movingId !== emp._id;
  const isDragOver = dragOverId === emp._id;
  const typeColor = EMP_TYPE_COLORS[emp.employmentType] || EMP_TYPE_COLORS.confirmed;

  const matchesSearch = search && (
    (emp.fullName || '').toLowerCase().includes(search) ||
    (emp.designation || '').toLowerCase().includes(search) ||
    (emp.departmentName || '').toLowerCase().includes(search)
  );

  const handleClick = () => {
    if (justDroppedRef?.current) return;
    if (isTarget) {
      onMoveTarget(emp._id);
    } else if (!movingId) {
      onNavigate(emp._id);
    }
  };

  const avatarColors = getAvatarColor(emp.fullName);

  // Border + fill by state, in priority order — same order legacy used.
  const shell = isMoving
    ? { border: '2px solid var(--warn-ink)', background: 'var(--warn-soft)', transform: 'scale(1.03)' }
    : isDragOver
      ? { border: '2px solid var(--brand)', background: 'var(--brand-soft)', transform: 'scale(1.02)' }
      : isTarget
        ? { border: '2px solid color-mix(in srgb, var(--brand) 50%, transparent)', background: 'var(--surface-1)' }
        : matchesSearch
          ? { border: '2px solid color-mix(in srgb, var(--warn-ink) 55%, transparent)', background: 'var(--surface-1)' }
          : { border: '2px solid var(--line-2)', background: 'var(--surface-1)' };

  return (
    <div style={{ position: 'absolute', userSelect: 'none', left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}>
      <div
        draggable={isAdmin && !movingId}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', emp._id);
          onMoveStart(emp._id);
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          justDroppedRef.current = true;
          setTimeout(() => { justDroppedRef.current = false; }, 300);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(emp._id);
        }}
        onDragLeave={(e) => { e.stopPropagation(); onDragOver(null); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const sourceId = e.dataTransfer.getData('text/plain');
          justDroppedRef.current = true;
          setTimeout(() => { justDroppedRef.current = false; }, 300);
          if (sourceId && sourceId !== emp._id) {
            onDrop(sourceId, emp._id);
          }
        }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={emp.fullName || emp.email}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleClick(); } }}
        style={{
          position: 'relative', width: '100%', height: '100%',
          borderRadius: 'var(--r-3, 16px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 12, textAlign: 'center',
          cursor: isAdmin && !movingId ? 'grab' : 'pointer',
          transition: 'border-color 200ms, background-color 200ms, transform 200ms',
          ...shell,
        }}
      >
        {/* Avatar */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          {emp.picture ? (
            <img
              src={emp.picture}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: 54, height: 54, borderRadius: 99, objectFit: 'cover', boxShadow: '0 0 0 2px var(--line-2)' }}
            />
          ) : (
            <div
              style={{
                width: 54, height: 54, borderRadius: 99,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 0 2px var(--line-2)',
                // The employee's hashed colour still identifies them, but as the
                // tint. The ink is --fg, so the initials are legible in both
                // themes instead of accent-on-its-own-wash.
                background: `${avatarColors[0]}2E`,
                color: 'var(--fg)',
                font: "700 15px/1 'Inter', system-ui, sans-serif",
              }}
            >
              {getInitials(emp.fullName)}
            </div>
          )}
          {/* Employment-type dot */}
          <div
            title={EMP_TYPE_LABELS[emp.employmentType] || emp.employmentType}
            style={{
              position: 'absolute', bottom: -2, right: -2, width: 15, height: 15, borderRadius: 99,
              background: typeColor.bg, boxShadow: '0 0 0 2px var(--surface-1)',
            }}
          />
        </div>

        {/* Name */}
        <div style={{
          width: '100%', font: "600 12.5px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {emp.fullName || emp.email}
        </div>

        {/* Designation */}
        {emp.designation && (
          <div style={{
            width: '100%', marginTop: 2, font: "400 11px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {emp.designation}
          </div>
        )}

        {/* Department */}
        {emp.departmentName && (
          <div style={{
            maxWidth: '100%', marginTop: 6, padding: '2px 8px', borderRadius: 99,
            background: 'var(--surface-3)', font: "400 10px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {emp.departmentName}
          </div>
        )}

        {/* Expand / collapse */}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleExpand(emp._id); }}
            title={isExpanded ? 'Collapse' : `Expand (${children.length})`}
            aria-label={isExpanded ? `Collapse ${emp.fullName}` : `Expand ${emp.fullName} (${children.length})`}
            aria-expanded={isExpanded}
            style={{
              position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
              width: 28, height: 28, borderRadius: 99, zIndex: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-3)', border: '2px solid var(--line-2)',
              color: 'var(--fg-2)', font: "700 10px/1 'Inter', system-ui, sans-serif",
            }}
          >
            {isExpanded ? <ChevronUp size={12} /> : children.length}
          </button>
        )}

        {/* Admin move handle */}
        {isAdmin && !movingId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveStart(emp._id); }}
            title="Reassign manager"
            aria-label={`Reassign manager for ${emp.fullName}`}
            style={{
              position: 'absolute', top: 7, right: 7, padding: 5, borderRadius: 8, cursor: 'pointer',
              background: 'var(--surface-3)', border: 'none', color: 'var(--fg-4)',
              display: 'inline-flex',
            }}
          >
            <Move size={12} />
          </button>
        )}

        {/* Drop affordance */}
        {isTarget && (
          <div style={{
            position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
            padding: '1px 8px', borderRadius: 99, whiteSpace: 'nowrap',
            background: 'var(--brand-soft)', boxShadow: 'inset 0 0 0 1px var(--brand-line)',
            font: "500 9px/1.6 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)',
          }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main OrgChart component ────────────────────────────────────────── */
export default function OrgChartV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [movingId, setMovingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef(null);
  const justDroppedRef = useRef(false);

  const isAdmin = getAppRole('employee') === 'admin';

  const load = useCallback(async () => {
    if (!currentOrg?.slug) return;
    setLoading(true);
    try {
      const res = await employeeApi.getOrgChart(currentOrg.slug);
      setEmployees(res.employees || []);
      // Expand first 2 levels by default
      const empMap = {};
      (res.employees || []).forEach(e => { empMap[e._id] = e; });
      const rootIds = (res.employees || []).filter(e => !e.manager || !empMap[e.manager]).map(e => e._id);
      const level2 = new Set([...rootIds]);
      rootIds.forEach(rid => {
        (res.employees || []).filter(e => e.manager === rid).forEach(e => level2.add(e._id));
      });
      setExpandedNodes(level2);
    } catch (err) {
      showToast('Failed to load org chart', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.slug]);

  useEffect(() => { load(); }, [load]);

  // Build tree with cycle detection
  const { roots, childrenMap, empMap } = useMemo(() => {
    const empMap = {};
    const childrenMap = {};
    const validIds = new Set(employees.map(e => e._id));

    employees.forEach(e => { empMap[e._id] = e; childrenMap[e._id] = []; });

    const roots = [];
    employees.forEach(e => {
      if (!e.manager || e.manager === e._id || !validIds.has(e.manager)) {
        roots.push(e);
      } else {
        childrenMap[e.manager].push(e);
      }
    });

    // Find all reachable from roots
    const reachable = new Set();
    const markReachable = (id) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      (childrenMap[id] || []).forEach(c => markReachable(c._id));
    };
    roots.forEach(r => markReachable(r._id));

    // Break cycles
    while (true) {
      const unreached = employees.find(e => !reachable.has(e._id));
      if (!unreached) break;
      const visited = new Set();
      let cur = unreached._id;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        cur = empMap[cur]?.manager;
      }
      const cycleRoot = empMap[cur] || unreached;
      roots.push(cycleRoot);
      if (cycleRoot.manager && childrenMap[cycleRoot.manager]) {
        childrenMap[cycleRoot.manager] = childrenMap[cycleRoot.manager].filter(c => c._id !== cycleRoot._id);
      }
      markReachable(cycleRoot._id);
    }

    return { roots, childrenMap, empMap };
  }, [employees]);

  // Layout computation
  const { positions, totalWidth, totalHeight } = useMemo(() => {
    return layoutTree(roots, childrenMap, expandedNodes);
  }, [roots, childrenMap, expandedNodes]);

  // Center the tree on load
  useEffect(() => {
    if (totalWidth > 0 && containerRef.current) {
      const containerW = containerRef.current.clientWidth;
      const initialZoom = Math.min(1, (containerW - 80) / totalWidth);
      const z = Math.max(0.3, Math.min(1, initialZoom));
      setZoom(z);
      setPan({ x: Math.max(0, (containerW - totalWidth * z) / 2), y: 40 });
    }
  }, [totalWidth, totalHeight, employees.length]);

  const toggleExpand = useCallback((id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => setExpandedNodes(new Set(employees.map(e => e._id)));
  const collapseAll = () => {
    setExpandedNodes(new Set(roots.map(e => e._id)));
  };

  // Fit to screen
  const fitToScreen = () => {
    if (!containerRef.current || totalWidth === 0) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const zx = (cw - 80) / totalWidth;
    const zy = (ch - 80) / totalHeight;
    const z = Math.max(0.2, Math.min(1, Math.min(zx, zy)));
    setZoom(z);
    setPan({ x: (cw - totalWidth * z) / 2, y: (ch - totalHeight * z) / 2 });
  };

  // Pan & zoom handlers
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom(z => Math.max(0.15, Math.min(2, z + delta)));
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.target === e.currentTarget)) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Reassign manager
  const reassignManager = useCallback(async (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const isDescendant = (parentId, childId) => {
      const kids = childrenMap[parentId] || [];
      for (const k of kids) {
        if (k._id === childId) return true;
        if (isDescendant(k._id, childId)) return true;
      }
      return false;
    };
    if (isDescendant(sourceId, targetId)) {
      showToast('Cannot move a manager under their own report', 'error');
      return;
    }
    const sourceEmp = empMap[sourceId];
    const targetEmp = empMap[targetId];
    if (!sourceEmp || !targetEmp) return;
    try {
      await employeeApi.update(currentOrg.slug, sourceId, { manager: targetId });
      showToast(`${sourceEmp.fullName} now reports to ${targetEmp.fullName}`, 'success');
      await load();
    } catch (err) {
      showToast('Failed to reassign manager', 'error');
    }
  }, [childrenMap, empMap, currentOrg?.slug, load]);

  const handleDrop = useCallback(async (sourceId, targetId) => {
    setMovingId(null);
    setDragOverId(null);
    if (sourceId && targetId && sourceId !== targetId) {
      await reassignManager(sourceId, targetId);
    }
  }, [reassignManager]);

  const handleMoveTarget = useCallback(async (targetId) => {
    if (!movingId || movingId === targetId) { setMovingId(null); return; }
    const sourceId = movingId;
    setMovingId(null);
    await reassignManager(sourceId, targetId);
  }, [movingId, reassignManager]);

  const searchLower = search.toLowerCase();
  const totalRoots = roots.length;
  const totalManagers = Object.values(childrenMap).filter(c => c.length > 0).length;
  const movingEmp = movingId ? empMap[movingId] : null;

  // Collect all visible nodes
  const visibleNodes = useMemo(() => {
    const result = [];
    function collect(id) {
      result.push(id);
      if (expandedNodes.has(id)) {
        (childrenMap[id] || []).forEach(c => collect(c._id));
      }
    }
    roots.forEach(r => collect(r._id));
    return result;
  }, [roots, childrenMap, expandedNodes]);

  if (loading) return <PageSpinner label="Loading org chart…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 64px)' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line-2)', background: 'var(--surface-1)',
      }}>
        <div>
          <h1 style={{ font: "700 17px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>Org Chart</h1>
          <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
            {employees.length} employees &middot; {totalRoots} top-level &middot; {totalManagers} managers
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search…" width={190} aria-label="Search org chart" />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 'var(--r-2, 12px)',
            background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
          }}>
            <Button variant="ghost" size="sm" aria-label="Zoom out" title="Zoom out"
              onClick={() => setZoom(z => Math.max(0.15, z - 0.15))} iconLeft={<ZoomOut size={15} />} />
            <span style={{ width: 42, textAlign: 'center', font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="sm" aria-label="Zoom in" title="Zoom in"
              onClick={() => setZoom(z => Math.min(2, z + 0.15))} iconLeft={<ZoomIn size={15} />} />
          </div>

          <Button variant="secondary" size="sm" aria-label="Fit to screen" title="Fit to screen"
            onClick={fitToScreen} iconLeft={<Maximize2 size={15} />} />
          <Button variant="secondary" size="sm" onClick={expandAll} title="Expand all">Expand</Button>
          <Button variant="secondary" size="sm" onClick={collapseAll} title="Collapse all">Collapse</Button>
        </div>
      </div>

      {/* Move-mode banner */}
      {movingEmp && (
        <div style={{ flexShrink: 0, padding: '12px 16px 0' }}>
          <Callout tone="warn" actions={
            <Button variant="ghost" size="sm" aria-label="Cancel move"
              onClick={() => setMovingId(null)} iconLeft={<X size={15} />} />
          }>
            Moving <strong>{movingEmp.fullName}</strong> — click or drop on the new manager
          </Callout>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background: 'var(--bg)',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Dot grid */}
        <div
          style={{
            position: 'absolute', inset: 0, opacity: 0.05, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, var(--fg) 1px, transparent 1px)',
            backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {roots.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <EmptyState icon={<Users size={22} />} title="No employees found" />
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              position: 'absolute',
              width: totalWidth + 40,
              height: totalHeight + 40,
            }}
          >
            <svg
              width={totalWidth + 40}
              height={totalHeight + 40}
              style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
            >
              <ConnectorLines
                roots={roots}
                childrenMap={childrenMap}
                positions={positions}
                expandedNodes={expandedNodes}
              />
            </svg>

            {visibleNodes.map(id => {
              const emp = empMap[id];
              const pos = positions[id];
              if (!emp || !pos) return null;
              return (
                <OrgCard
                  key={id}
                  emp={emp}
                  pos={pos}
                  isAdmin={isAdmin}
                  movingId={movingId}
                  onMoveStart={setMovingId}
                  onMoveTarget={handleMoveTarget}
                  onDrop={handleDrop}
                  dragOverId={dragOverId}
                  onDragOver={setDragOverId}
                  onNavigate={(id) => navigate(orgPath(`/employee/${id}`))}
                  childrenMap={childrenMap}
                  expandedNodes={expandedNodes}
                  toggleExpand={toggleExpand}
                  search={searchLower}
                  justDroppedRef={justDroppedRef}
                />
              );
            })}
          </div>
        )}

        {/* Interaction hint */}
        {!isPanning && employees.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            padding: '5px 12px', borderRadius: 99, pointerEvents: 'none',
            background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
            font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
          }}>
            Scroll to pan · Ctrl+Scroll to zoom · Drag background to pan
          </div>
        )}
      </div>
    </div>
  );
}
