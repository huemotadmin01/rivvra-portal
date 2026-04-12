import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import {
  Loader2, Move, X, Search, ZoomIn, ZoomOut, Users, Maximize2,
  ChevronUp,
} from 'lucide-react';

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
          stroke="rgba(100,116,139,0.35)"
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

  const handleClick = (e) => {
    if (justDroppedRef?.current) return;
    if (isTarget) {
      onMoveTarget(emp._id);
    } else if (!movingId) {
      onNavigate(emp._id);
    }
  };

  const avatarColors = getAvatarColor(emp.fullName);

  return (
    <div
      className="absolute select-none"
      style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
    >
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
        className={`
          group relative w-full h-full rounded-2xl border-2 transition-all duration-200 flex flex-col items-center justify-center p-3
          ${isMoving
            ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-[1.03]'
            : isDragOver
              ? 'border-rivvra-500 bg-rivvra-500/10 shadow-lg shadow-rivvra-500/10 scale-[1.02]'
              : isTarget
                ? 'border-rivvra-500/50 bg-dark-800/90 hover:border-rivvra-500 hover:bg-rivvra-500/5 cursor-pointer'
                : matchesSearch
                  ? 'border-amber-500/50 bg-dark-800/90 shadow-md shadow-amber-500/5'
                  : 'border-dark-700/80 bg-dark-800/90 hover:border-dark-500 hover:shadow-md cursor-pointer'
          }
          ${isAdmin && !movingId ? 'cursor-grab active:cursor-grabbing' : ''}
          backdrop-blur-sm
        `}
      >
        {/* Profile picture */}
        <div className="relative mb-2">
          {emp.picture ? (
            <img
              src={emp.picture}
              alt=""
              className="w-14 h-14 rounded-full object-cover ring-2 ring-dark-600"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center ring-2 ring-dark-600"
              style={{ background: `${avatarColors[0]}25`, color: avatarColors[0] }}
            >
              <span className="text-base font-bold">{getInitials(emp.fullName)}</span>
            </div>
          )}
          {/* Online dot or type indicator */}
          <div
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-dark-800"
            style={{ background: typeColor.bg }}
            title={EMP_TYPE_LABELS[emp.employmentType] || emp.employmentType}
          />
        </div>

        {/* Name */}
        <div className="text-sm font-semibold text-white text-center truncate w-full leading-tight">
          {emp.fullName || emp.email}
        </div>

        {/* Designation */}
        {emp.designation && (
          <div className="text-[11px] text-dark-400 text-center truncate w-full mt-0.5 leading-tight">
            {emp.designation}
          </div>
        )}

        {/* Department badge */}
        {emp.departmentName && (
          <div className="mt-1.5 px-2 py-0.5 rounded-full bg-dark-700/60 border border-dark-600/50 text-[10px] text-dark-300 truncate max-w-full">
            {emp.departmentName}
          </div>
        )}

        {/* Expand/Collapse children button */}
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(emp._id); }}
            className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-dark-700 border-2 border-dark-600 flex items-center justify-center hover:bg-dark-600 hover:border-dark-500 transition-colors z-10 text-dark-300 hover:text-white"
            title={isExpanded ? 'Collapse' : `Expand (${children.length})`}
          >
            {isExpanded ? <ChevronUp size={12} /> : (
              <span className="text-[10px] font-bold">{children.length}</span>
            )}
          </button>
        )}

        {/* Admin move button */}
        {isAdmin && !movingId && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveStart(emp._id); }}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-dark-700/80 text-dark-400 hover:text-rivvra-400 hover:bg-dark-600/80 transition-all"
            title="Reassign manager"
          >
            <Move size={12} />
          </button>
        )}

        {/* Assign indicator */}
        {isTarget && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-rivvra-500/20 border border-rivvra-500/40 text-[9px] text-rivvra-400 font-medium whitespace-nowrap">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main OrgChart component ────────────────────────────────────────── */
export default function OrgChart() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-rivvra-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700 bg-dark-900/80 backdrop-blur-sm flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-white">Org Chart</h1>
          <p className="text-sm text-dark-400 mt-0.5">
            {employees.length} employees &middot; {totalRoots} top-level &middot; {totalManagers} managers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-48"
              placeholder="Search..."
            />
          </div>
          <div className="flex items-center gap-1 bg-dark-800 border border-dark-700 rounded-lg px-1">
            <button onClick={() => setZoom(z => Math.max(0.15, z - 0.15))} className="p-1.5 text-dark-400 hover:text-white" title="Zoom out">
              <ZoomOut size={15} />
            </button>
            <span className="text-xs text-dark-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="p-1.5 text-dark-400 hover:text-white" title="Zoom in">
              <ZoomIn size={15} />
            </button>
          </div>
          <button onClick={fitToScreen} className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Fit to screen">
            <Maximize2 size={15} />
          </button>
          <button onClick={expandAll} className="px-2.5 py-1.5 text-xs text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Expand all">
            Expand
          </button>
          <button onClick={collapseAll} className="px-2.5 py-1.5 text-xs text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Collapse all">
            Collapse
          </button>
        </div>
      </div>

      {/* Move mode banner */}
      {movingEmp && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-amber-300">
            Moving <strong>{movingEmp.fullName}</strong> — click or drop on the new manager
          </span>
          <button onClick={() => setMovingId(null)} className="text-dark-400 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-dark-950"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)`,
            backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {roots.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users size={48} className="mx-auto text-dark-600 mb-3" />
              <p className="text-dark-400 font-medium">No employees found</p>
            </div>
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
            {/* SVG connector lines */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={totalWidth + 40}
              height={totalHeight + 40}
              style={{ overflow: 'visible' }}
            >
              <ConnectorLines
                roots={roots}
                childrenMap={childrenMap}
                positions={positions}
                expandedNodes={expandedNodes}
              />
            </svg>

            {/* Cards */}
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

        {/* Zoom hint */}
        {!isPanning && employees.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-dark-800/80 border border-dark-700/50 text-[11px] text-dark-500 backdrop-blur-sm pointer-events-none">
            Scroll to pan · Ctrl+Scroll to zoom · Drag background to pan
          </div>
        )}
      </div>
    </div>
  );
}
