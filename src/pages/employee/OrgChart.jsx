import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import {
  Loader2, ChevronDown, ChevronRight, Move, X,
  Search, ZoomIn, ZoomOut, Users,
} from 'lucide-react';

const EMP_TYPE_COLORS = {
  confirmed: 'bg-green-500/15 text-green-400 border-green-500/30',
  internal_consultant: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  external_consultant: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  intern: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  extern: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
};

const EMP_TYPE_LABELS = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal Consultant',
  external_consultant: 'External Consultant',
  intern: 'Intern',
  extern: 'Extern',
};

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
  const colors = [
    'bg-orange-500/20 text-orange-400',
    'bg-blue-500/20 text-blue-400',
    'bg-green-500/20 text-green-400',
    'bg-purple-500/20 text-purple-400',
    'bg-pink-500/20 text-pink-400',
    'bg-cyan-500/20 text-cyan-400',
    'bg-amber-500/20 text-amber-400',
    'bg-red-500/20 text-red-400',
  ];
  const hash = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/* ── Tree Node component ─────────────────────────────────────────────── */
function TreeNode({ emp, childrenMap, level, isAdmin, movingId, onMoveStart, onMoveTarget, expandedNodes, toggleExpand, onNavigate, search }) {
  const children = childrenMap[emp._id] || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(emp._id);
  const isMoving = movingId === emp._id;
  const isTarget = movingId && movingId !== emp._id;

  const matchesSearch = search && (
    (emp.fullName || '').toLowerCase().includes(search) ||
    (emp.designation || '').toLowerCase().includes(search) ||
    (emp.departmentName || '').toLowerCase().includes(search)
  );

  const handleCardClick = () => {
    if (isTarget) {
      // Click = assign as new manager
      onMoveTarget(emp._id);
    } else if (!movingId) {
      onNavigate(emp._id);
    }
  };

  return (
    <div className="org-tree-node">
      {/* The node card */}
      <div
        className={`
          group relative flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all
          ${isMoving
            ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
            : isTarget
              ? 'border-rivvra-500/50 bg-dark-800 hover:border-rivvra-500 hover:bg-rivvra-500/10 cursor-pointer'
              : matchesSearch
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-dark-700 bg-dark-800 hover:border-dark-600 cursor-pointer'
          }
        `}
        style={{ marginLeft: level * 32 }}
        onClick={handleCardClick}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleExpand(emp._id); }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center"
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown size={14} className="text-dark-400" />
              : <ChevronRight size={14} className="text-dark-400" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-dark-600" />
          )}
        </button>

        {/* Avatar */}
        {emp.picture ? (
          <img src={emp.picture} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
        ) : (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColor(emp.fullName)}`}>
            <span className="text-xs font-bold">{getInitials(emp.fullName)}</span>
          </div>
        )}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{emp.fullName || emp.email}</span>
            {hasChildren && (
              <span className="text-[10px] text-dark-500 flex items-center gap-0.5">
                <Users size={10} /> {children.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {emp.designation && (
              <span className="text-xs text-dark-400 truncate max-w-[200px]">{emp.designation}</span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {emp.departmentName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-dark-300 border border-dark-600">
              {emp.departmentName}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${EMP_TYPE_COLORS[emp.employmentType] || EMP_TYPE_COLORS.confirmed}`}>
            {EMP_TYPE_LABELS[emp.employmentType] || emp.employmentType}
          </span>
        </div>

        {/* Move button (admin only) */}
        {isAdmin && !movingId && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveStart(emp._id); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-dark-500 hover:text-rivvra-400 transition-all"
            title="Reassign manager"
          >
            <Move size={14} />
          </button>
        )}

        {/* "Assign here" indicator when in move mode */}
        {isTarget && (
          <span className="text-[10px] text-rivvra-400 font-medium flex-shrink-0">Click to assign</span>
        )}

        {/* "Moving..." indicator */}
        {isMoving && (
          <span className="text-[10px] text-amber-400 font-medium flex-shrink-0">Moving...</span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1 relative">
          <div className="absolute left-[calc(var(--indent)+28px)] top-0 bottom-2 w-px bg-dark-700" style={{ '--indent': `${level * 32}px` }} />
          {children.map(child => (
            <TreeNode
              key={child._id}
              emp={child}
              childrenMap={childrenMap}
              level={level + 1}
              isAdmin={isAdmin}
              movingId={movingId}
              onMoveStart={onMoveStart}
              onMoveTarget={onMoveTarget}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              onNavigate={onNavigate}
              search={search}
            />
          ))}
        </div>
      )}
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
  const [movingId, setMovingId] = useState(null); // employee being moved

  const isAdmin = getAppRole('employee') === 'admin';

  const load = useCallback(async () => {
    if (!currentOrg?.slug) return;
    setLoading(true);
    try {
      const res = await employeeApi.getOrgChart(currentOrg.slug);
      setEmployees(res.employees || []);
      const roots = (res.employees || []).filter(e => !e.manager);
      setExpandedNodes(new Set(roots.map(e => e._id)));
    } catch (err) {
      showToast('Failed to load org chart', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.slug]);

  useEffect(() => { load(); }, [load]);

  // Build tree structure with cycle detection
  const { roots, childrenMap, empMap } = (() => {
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

    // For unreachable employees (in cycles), find each cycle and break it
    // by promoting exactly one member per cycle as root
    while (true) {
      const unreached = employees.find(e => !reachable.has(e._id));
      if (!unreached) break;

      // Walk the manager chain from this employee to find the cycle
      const visited = new Set();
      let cur = unreached._id;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        cur = empMap[cur]?.manager;
      }
      // `cur` is now the start of the cycle — promote it as root
      const cycleRoot = empMap[cur] || unreached;
      roots.push(cycleRoot);
      // Remove cycleRoot from its parent's children
      if (cycleRoot.manager && childrenMap[cycleRoot.manager]) {
        childrenMap[cycleRoot.manager] = childrenMap[cycleRoot.manager].filter(c => c._id !== cycleRoot._id);
      }
      // Mark everything reachable from this new root
      markReachable(cycleRoot._id);
    }

    return { roots, childrenMap, empMap };
  })();

  const toggleExpand = useCallback((id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => setExpandedNodes(new Set(employees.map(e => e._id)));
  const collapseAll = () => setExpandedNodes(new Set(roots.map(e => e._id)));

  // Click-to-move: select target manager
  const handleMoveTarget = useCallback(async (targetId) => {
    if (!movingId || movingId === targetId) { setMovingId(null); return; }

    // Prevent moving a parent under its own descendant
    const isDescendant = (parentId, childId) => {
      const kids = childrenMap[parentId] || [];
      for (const k of kids) {
        if (k._id === childId) return true;
        if (isDescendant(k._id, childId)) return true;
      }
      return false;
    };

    if (isDescendant(movingId, targetId)) {
      showToast('Cannot move a manager under their own report', 'error');
      setMovingId(null);
      return;
    }

    const sourceEmp = empMap[movingId];
    const targetEmp = empMap[targetId];
    if (!sourceEmp || !targetEmp) { setMovingId(null); return; }

    try {
      await employeeApi.update(currentOrg.slug, movingId, { manager: targetId });
      showToast(`${sourceEmp.fullName} now reports to ${targetEmp.fullName}`, 'success');
      // Reload from server to get fresh data
      await load();
    } catch (err) {
      showToast('Failed to reassign manager', 'error');
    }

    setMovingId(null);
  }, [movingId, childrenMap, empMap, currentOrg?.slug, load]);

  const searchLower = search.toLowerCase();
  const totalRoots = roots.length;
  const totalWithReports = Object.values(childrenMap).filter(c => c.length > 0).length;
  const movingEmp = movingId ? empMap[movingId] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-rivvra-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Org Chart</h1>
          <p className="text-sm text-dark-400 mt-1">
            {employees.length} employees &middot; {totalRoots} top-level &middot; {totalWithReports} managers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-56"
              placeholder="Search employees..."
            />
          </div>
          <button onClick={expandAll} className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Expand all">
            <ZoomIn size={16} />
          </button>
          <button onClick={collapseAll} className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Collapse all">
            <ZoomOut size={16} />
          </button>
        </div>
      </div>

      {/* Move mode banner */}
      {movingEmp && (
        <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
          <span className="text-sm text-amber-300">
            Moving <strong>{movingEmp.fullName}</strong> — click on the new manager to reassign
          </span>
          <button onClick={() => setMovingId(null)} className="text-dark-400 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {isAdmin && !movingId && (
        <div className="mb-4 px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-xs text-dark-400">
          Hover on an employee and click the <Move size={12} className="inline" /> icon to reassign their manager.
        </div>
      )}

      {/* Tree */}
      <div className="space-y-1">
        {roots.length === 0 ? (
          <div className="text-center py-16">
            <Users size={40} className="mx-auto text-dark-600 mb-3" />
            <p className="text-dark-400 font-medium">No employees found</p>
          </div>
        ) : (
          roots.map(emp => (
            <TreeNode
              key={emp._id}
              emp={emp}
              childrenMap={childrenMap}
              level={0}
              isAdmin={isAdmin}
              movingId={movingId}
              onMoveStart={setMovingId}
              onMoveTarget={handleMoveTarget}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              onNavigate={(id) => navigate(orgPath(`/employee/${id}`))}
              search={searchLower}
            />
          ))
        )}
      </div>
    </div>
  );
}
