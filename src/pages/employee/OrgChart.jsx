import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import {
  Loader2, ChevronDown, ChevronRight, GripVertical,
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
function TreeNode({ emp, childrenMap, level, isAdmin, onDragStart, onDragOver, onDrop, dragTarget, expandedNodes, toggleExpand, onNavigate, search }) {
  const children = childrenMap[emp._id] || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(emp._id);
  const isDragOver = dragTarget === emp._id;
  const nodeRef = useRef(null);

  const matchesSearch = search && (
    (emp.fullName || '').toLowerCase().includes(search) ||
    (emp.designation || '').toLowerCase().includes(search) ||
    (emp.departmentName || '').toLowerCase().includes(search)
  );

  return (
    <div className="org-tree-node">
      {/* The node card */}
      <div
        ref={nodeRef}
        draggable={isAdmin}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', emp._id); onDragStart(emp._id); }}
        onDragOver={(e) => { e.preventDefault(); onDragOver(emp._id); }}
        onDragLeave={() => onDragOver(null)}
        onDrop={(e) => { e.preventDefault(); onDrop(emp._id); }}
        className={`
          group relative flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all
          ${isDragOver
            ? 'border-rivvra-500 bg-rivvra-500/10 ring-1 ring-rivvra-500/30'
            : matchesSearch
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-dark-700 bg-dark-800 hover:border-dark-600'
          }
          ${isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
        `}
        style={{ marginLeft: level * 32 }}
        onClick={() => onNavigate(emp._id)}
      >
        {/* Drag handle for admins */}
        {isAdmin && (
          <GripVertical size={14} className="text-dark-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        )}

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
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1 relative">
          {/* Vertical connector line */}
          <div className="absolute left-[calc(var(--indent)+28px)] top-0 bottom-2 w-px bg-dark-700" style={{ '--indent': `${level * 32}px` }} />
          {children.map(child => (
            <TreeNode
              key={child._id}
              emp={child}
              childrenMap={childrenMap}
              level={level + 1}
              isAdmin={isAdmin}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragTarget={dragTarget}
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
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);

  const isAdmin = getAppRole('employee') === 'admin';

  const load = useCallback(async () => {
    if (!currentOrg?.slug) return;
    setLoading(true);
    try {
      const res = await employeeApi.getOrgChart(currentOrg.slug);
      setEmployees(res.employees || []);
      // Auto-expand root nodes
      const roots = (res.employees || []).filter(e => !e.manager);
      setExpandedNodes(new Set(roots.map(e => e._id)));
    } catch (err) {
      showToast('Failed to load org chart', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.slug]);

  useEffect(() => { load(); }, [load]);

  // Build tree structure
  const { roots, childrenMap, empMap } = (() => {
    const empMap = {};
    const childrenMap = {};
    const validIds = new Set(employees.map(e => e._id));

    employees.forEach(e => { empMap[e._id] = e; childrenMap[e._id] = []; });

    const roots = [];
    employees.forEach(e => {
      if (e.manager && validIds.has(e.manager)) {
        childrenMap[e.manager].push(e);
      } else {
        roots.push(e);
      }
    });

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

  // Drag-and-drop handler (reassign manager)
  const handleDrop = useCallback(async (targetId) => {
    if (!dragSource || dragSource === targetId) { setDragSource(null); setDragTarget(null); return; }

    // Prevent dropping a parent onto its own descendant (would create cycle)
    const isDescendant = (parentId, childId) => {
      const kids = childrenMap[parentId] || [];
      for (const k of kids) {
        if (k._id === childId) return true;
        if (isDescendant(k._id, childId)) return true;
      }
      return false;
    };

    if (isDescendant(dragSource, targetId)) {
      showToast('Cannot move a manager under their own report', 'error');
      setDragSource(null);
      setDragTarget(null);
      return;
    }

    const sourceEmp = empMap[dragSource];
    const targetEmp = empMap[targetId];
    if (!sourceEmp || !targetEmp) { setDragSource(null); setDragTarget(null); return; }

    try {
      await employeeApi.update(currentOrg.slug, dragSource, { manager: targetId });
      showToast(`${sourceEmp.fullName} now reports to ${targetEmp.fullName}`, 'success');
      // Update local state
      setEmployees(prev => prev.map(e => e._id === dragSource ? { ...e, manager: targetId } : e));
      // Expand target so user sees the change
      setExpandedNodes(prev => new Set([...prev, targetId]));
    } catch (err) {
      showToast('Failed to reassign manager', 'error');
    }

    setDragSource(null);
    setDragTarget(null);
  }, [dragSource, childrenMap, empMap, currentOrg?.slug]);

  const searchLower = search.toLowerCase();

  // Stats
  const totalRoots = roots.length;
  const totalWithReports = Object.values(childrenMap).filter(c => c.length > 0).length;

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
          {/* Search */}
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
          {/* Expand / Collapse */}
          <button onClick={expandAll} className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Expand all">
            <ZoomIn size={16} />
          </button>
          <button onClick={collapseAll} className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700 rounded-lg" title="Collapse all">
            <ZoomOut size={16} />
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-4 px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-xs text-dark-400">
          Drag and drop employees to reassign their manager.
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
              onDragStart={setDragSource}
              onDragOver={setDragTarget}
              onDrop={handleDrop}
              dragTarget={dragTarget}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              onNavigate={(id) => navigate(`${orgPath}/employee/${id}`)}
              search={searchLower}
            />
          ))
        )}
      </div>
    </div>
  );
}
