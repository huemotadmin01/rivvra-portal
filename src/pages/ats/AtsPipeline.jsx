import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Search, Loader2, GripVertical, ChevronDown,
  Star, X, Calendar, User, Mail, Briefcase,
} from 'lucide-react';

/* ── Inline FilterChip component ───────────────────────────────────────
 * Local-state filter chip used only by the Pipeline page (other ATS
 * lists use the URL-driven FilterChip from components/shared/FilterBar).
 *
 * 2026-05-13: added inline search input that auto-shows when there are
 * more than 5 options. The Pipeline's Recruiter dropdown was unscrollable
 * for Huemot's 40+ employees. */
function FilterChip({ label, value, options, isOpen, onToggle, onSelect }) {
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption && value ? selectedOption.label : label;
  const [query, setQuery] = useState('');
  // The first option in Pipeline is always the "All X" reset row; show
  // it regardless of search query so users can clear without deleting
  // characters. The rest filter case-insensitively against the label.
  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const head = options[0] && !options[0].value ? [options[0]] : [];
    const rest = options.slice(head.length).filter((o) =>
      String(o.label || '').toLowerCase().includes(q),
    );
    return [...head, ...rest];
  })();
  const isSearchable = options.length > 5;

  // Reset the query whenever the dropdown closes.
  useEffect(() => { if (!isOpen) setQuery(''); }, [isOpen]);

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
            : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200'
        }`}
      >
        {displayLabel}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute left-0 top-full mt-1.5 min-w-[220px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl z-20 flex flex-col max-h-72 overflow-hidden">
            {isSearchable && (
              <div className="p-2 border-b border-dark-700 shrink-0">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
                />
              </div>
            )}
            <div className="overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-dark-500">No matches</div>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      opt.value === value
                        ? 'bg-rivvra-500/10 text-rivvra-400'
                        : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Evaluation Stars ─────────────────────────────────────────────────── */
function EvalStars({ value = 0, max = 3, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i + 1 === value ? 0 : i + 1)}
          className={`transition-colors ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <Star
            size={14}
            className={i < value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
          />
        </button>
      ))}
    </div>
  );
}

/* ── Kanban Card (draggable) ──────────────────────────────────────────── */
// 2026-05-17 health-check E.1: wrap card + column in React.memo. With N
// stages × M cards each parent state change (filter, search, drag) used to
// re-render every card and re-run dnd-kit's useSortable. Memo cuts the work
// to only the card whose props actually changed.
function KanbanCardInner({ application, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-dark-800 rounded-lg p-3 border border-dark-700 hover:border-dark-600 cursor-grab active:cursor-grabbing transition-colors group ${
        isDragging ? 'opacity-50' : ''
      }`}
      onClick={(e) => {
        // Don't navigate when dragging
        if (!isDragging) onClick?.(application);
      }}
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          role="button"
          aria-label="Drag to reorder"
          tabIndex={-1}
          className="mt-0.5 text-dark-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate flex items-center gap-1.5">
            {application.candidateName || 'Unnamed'}
            {application.kanbanState === 'done' && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0"
                aria-label="Done"
                title="Done"
              >
                <span className="sr-only">Done</span>
              </span>
            )}
            {application.kanbanState === 'blocked' && (
              <span
                className="w-2 h-2 rounded-full bg-red-400 inline-block flex-shrink-0"
                aria-label="Blocked"
                title="Blocked"
              >
                <span className="sr-only">Blocked</span>
              </span>
            )}
          </p>
          {application.jobName && (
            <p className="text-dark-400 text-xs truncate mt-0.5">
              {application.jobName}
            </p>
          )}
          {application.candidateEmail && (
            <div className="flex items-center gap-1 mt-1">
              <Mail size={10} className="text-dark-500" />
              <p className="text-dark-500 text-xs truncate">{application.candidateEmail}</p>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <EvalStars value={application.evaluation || 0} />
            <div className="flex items-center gap-2">
              {application.recruiterName && (
                <div className="flex items-center gap-1">
                  <User size={10} className="text-dark-500" />
                  <span className="text-dark-500 text-xs truncate max-w-[60px]">
                    {application.recruiterName}
                  </span>
                </div>
              )}
              {application.appliedOn && (
                <div className="flex items-center gap-1">
                  <Calendar size={10} className="text-dark-500" />
                  <span className="text-dark-500 text-xs">{formatDate(application.appliedOn)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 2026-05-17 health-check E.1: memoize. Card re-renders only when its
// own application or onClick reference changes — drag of any sibling no
// longer trips a sortable-rehydrate on every other card.
const KanbanCard = memo(KanbanCardInner);

/* ── Kanban Card Overlay (shown while dragging) ───────────────────────── */
function KanbanCardOverlay({ application }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-dark-800 rounded-lg p-3 border border-rivvra-500/40 shadow-lg shadow-rivvra-500/10 w-[268px]">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-dark-600 flex-shrink-0">
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {application.candidateName || 'Unnamed'}
          </p>
          {application.jobName && (
            <p className="text-dark-400 text-xs truncate mt-0.5">{application.jobName}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <EvalStars value={application.evaluation || 0} />
            {application.appliedOn && (
              <span className="text-dark-500 text-xs">{formatDate(application.appliedOn)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Kanban Column ────────────────────────────────────────────────────── */
// 2026-05-17 health-check E.1: memoized below. Re-renders only when its
// stage/applications array identity changes — sibling-column drag activity
// no longer ripples through every column.
function KanbanColumnInner({ stage, applications, totalCount, onCardClick, onLoadMore, isLoadingMore }) {
  const ids = applications.map((a) => a._id);
  const hasMore = totalCount > applications.length;
  // Register the column itself as a droppable — without this, dropping on
  // an EMPTY column resolved `over` to null (only cards were droppable via
  // SortableContext) and the drag silently snapped back. The `col:` prefix
  // keeps the id namespace distinct from card ids; handleDragEnd strips it.
  const { setNodeRef } = useDroppable({ id: `col:${stage._id}` });

  return (
    <div className="bg-dark-900/50 rounded-lg min-w-[300px] max-w-[300px] flex flex-col max-h-[calc(100vh-220px)]">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-dark-700/50">
        <h3 className="text-white font-semibold text-sm truncate">{stage.name}</h3>
        <span className="bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 text-xs font-medium">
          {totalCount}
        </span>
      </div>

      {/* Droppable card list */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {applications.map((app) => (
            <KanbanCard key={app._id} application={app} onClick={onCardClick} />
          ))}
        </SortableContext>

        {applications.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-dark-500 text-xs">No applications</p>
          </div>
        )}

        {hasMore && (
          <button
            onClick={() => onLoadMore?.(stage._id)}
            disabled={isLoadingMore}
            className="w-full py-2 text-xs text-dark-400 hover:text-rivvra-400 transition-colors rounded-lg hover:bg-dark-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore
              ? 'Loading…'
              : `Load more (${totalCount - applications.length} remaining)`}
          </button>
        )}
      </div>
    </div>
  );
}
const KanbanColumn = memo(KanbanColumnInner);

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsPipeline() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [openFilter, setOpenFilter] = useState(null);

  // Dropdown data
  // 2026-07-18 audit D8: dead `stages` state removed — the kanban payload
  // itself carries the resolved (job-aware) columns; nothing consumed it.
  const [jobs, setJobs] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  // 2026-07-18 audit D6: per-column in-flight map so a double-click on
  // "Load more" can't fire two overlapping offset fetches and append
  // duplicate cards.
  const [loadingMore, setLoadingMore] = useState({});

  const debounceRef = useRef(null);
  // Mirror of `search` readable inside fetchKanban without being a dep —
  // with `search` in the deps, every keystroke recreated the callback and
  // the useEffect below fired an IMMEDIATE fetch alongside the debounced
  // one (2 kanban aggregations per keystroke). Same class as F-P2-4.
  const searchRef = useRef('');
  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  // DnD sensors
  // KeyboardSensor added 2026-05-25 health-check F-P2-2 so stage moves
  // are keyboard-accessible: Tab to focus a card, Space to lift, arrow
  // keys to move between columns, Space again to drop.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Fetch kanban data ──────────────────────────────────────────────────
  const fetchKanban = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    // 2026-05-17 health-check D.1: keep prior kanban visible while
    // refetching — search-debounced typing no longer blanks every column
    // mid-keystroke. Dedup via _requestKey auto-aborts stale fetches.
    setLoading(true);
    // 2026-05-19: aborted-flag so finally skips setLoading(false) when
    // cancelled by a newer fetch.
    let aborted = false;
    try {
      const res = await atsApi.getKanban(orgSlug, {
        search: params.search !== undefined ? params.search : searchRef.current,
        jobId: params.jobId !== undefined ? params.jobId : jobFilter,
        recruiter: params.recruiter !== undefined ? params.recruiter : recruiterFilter,
        _requestKey: 'ats:kanban',
      });
      if (res.success) {
        setColumns(res.kanban || []);
      }
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      console.error('Failed to load pipeline:', err);
      showToast('Failed to load pipeline', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, jobFilter, recruiterFilter, showToast]);

  // ── Fetch dropdown data ────────────────────────────────────────────────
  const fetchDropdowns = useCallback(async () => {
    if (!orgSlug) return;
    // 2026-07-18 audit D7: do NOT clear jobs/recruiters here — blanking
    // them on every refetch (e.g. jobFilter change) made the selected
    // job/recruiter chip label flicker back to the generic placeholder
    // until the round-trip finished. Stale options during a refetch are
    // harmless; success below replaces them.
    try {
      const [jobsRes, recruitersRes] = await Promise.all([
        atsApi.listJobs(orgSlug, { limit: 200 }),
        atsApi.listRecruiters(orgSlug),
      ]);
      if (jobsRes.success) setJobs(jobsRes.jobs || []);
      if (recruitersRes.success) setRecruiters(recruitersRes.recruiters || recruitersRes.members || []);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchKanban(); }, [fetchKanban]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    searchRef.current = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchKanban({ search: value });
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFilterSelect = (setter, key) => (val) => {
    setter(val);
    setOpenFilter(null);
    // 2026-05-25 F-P2-4: do NOT call fetchKanban directly here. The
    // setter triggers a re-render which re-creates the fetchKanban
    // callback (its deps include jobFilter/recruiterFilter) and the
    // useEffect at L420 re-fires it with the new value. Calling here
    // too produced two fetches per filter click.
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

  // Build filter options
  const jobOptions = [
    { value: '', label: 'All Positions' },
    ...jobs.map((j) => ({ value: j._id, label: j.name })),
  ];

  const recruiterOptions = [
    { value: '', label: 'All Recruiters' },
    ...recruiters.map((r) => ({ value: r._id, label: r.name })),
  ];

  // ── Drag handlers ──────────────────────────────────────────────────────
  const findAppInColumns = (appId) => {
    for (const col of columns) {
      const app = (col.applications || []).find((a) => a._id === appId);
      if (app) return { app, stageId: col.stage?._id || col._id };
    }
    return null;
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const found = findAppInColumns(active.id);
    if (found) setActiveCard(found.app);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over || !active) return;

    const sourceInfo = findAppInColumns(active.id);
    if (!sourceInfo) return;

    // Determine the target stage: if dropped on another card, find its column
    // If dropped on a column droppable, use that stage
    let targetStageId = null;

    // Check if "over" is a card in another column
    const overInfo = findAppInColumns(over.id);
    if (overInfo) {
      targetStageId = overInfo.stageId;
    } else {
      // Column droppable — id is `col:<stageId>` (see KanbanColumnInner).
      const overId = String(over.id);
      targetStageId = overId.startsWith('col:') ? overId.slice(4) : overId;
    }

    if (!targetStageId || targetStageId === sourceInfo.stageId) return;

    // Optimistic update: move card in local state
    const prevColumns = [...columns];
    setColumns((prev) =>
      prev.map((col) => {
        const colStageId = col.stage?._id || col._id;
        if (colStageId === sourceInfo.stageId) {
          return {
            ...col,
            applications: (col.applications || []).filter((a) => a._id !== active.id),
            totalCount: (col.totalCount || 0) - 1,
          };
        }
        if (colStageId === targetStageId) {
          return {
            ...col,
            applications: [...(col.applications || []), sourceInfo.app],
            totalCount: (col.totalCount || 0) + 1,
          };
        }
        return col;
      })
    );

    try {
      await atsApi.moveStage(orgSlug, active.id, targetStageId);
      showToast('Application moved');
    } catch (err) {
      // Revert on error
      setColumns(prevColumns);
      showToast(err.message || 'Failed to move application', 'error');
    }
  };

  const handleDragCancel = () => {
    setActiveCard(null);
  };

  // Navigate to application detail
  const handleCardClick = (application) => {
    navigate(orgPath(`/ats/applications/${application._id}`));
  };

  // Load more for a column
  const handleLoadMore = async (stageId) => {
    if (!orgSlug) return;
    // D6: ignore clicks while this column's page fetch is in flight —
    // a double-click used to fire two identical offset requests and
    // append the same page of cards twice.
    if (loadingMore[stageId]) return;
    const col = columns.find((c) => (c.stage?._id || c._id) === stageId);
    if (!col) return;
    const currentCount = (col.applications || []).length;
    setLoadingMore((prev) => ({ ...prev, [stageId]: true }));

    try {
      const res = await atsApi.getKanban(orgSlug, {
        search,
        jobId: jobFilter,
        recruiter: recruiterFilter,
        stageId,
        offset: currentCount,
      });
      if (res.success && res.kanban) {
        const stageData = res.kanban.find((s) => (s.stage?._id || s._id) === stageId);
        if (stageData) {
          setColumns((prev) =>
            prev.map((c) => {
              const cId = c.stage?._id || c._id;
              if (cId === stageId) {
                return {
                  ...c,
                  applications: [...(c.applications || []), ...(stageData.applications || [])],
                };
              }
              return c;
            })
          );
        }
      }
    } catch (err) {
      showToast('Failed to load more applications', 'error');
    } finally {
      setLoadingMore((prev) => ({ ...prev, [stageId]: false }));
    }
  };

  // Collect all application IDs for DndContext
  const allAppIds = columns.flatMap((col) => (col.applications || []).map((a) => a._id));

  return (
    <div className="p-6 md:p-8 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline</h1>
          <p className="text-dark-400 text-sm mt-1">
            Drag and drop candidates across stages
          </p>
        </div>
        {/* New Application creation isn't surfaced on the Pipeline page
            since 2026-05-10. Applications are created from the Job
            Position detail page (gated to open/on_hold jobs) — same
            funnel rule as the All Applications list. */}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-field w-full pl-9 text-sm"
            aria-label="Search candidates"
          />
        </div>
        <FilterChip
          label="Job Position"
          value={jobFilter}
          options={jobOptions}
          isOpen={openFilter === 'job'}
          onToggle={() => toggleFilter('job')}
          onSelect={handleFilterSelect(setJobFilter, 'jobId')}
        />
        <FilterChip
          label="Recruiter"
          value={recruiterFilter}
          options={recruiterOptions}
          isOpen={openFilter === 'recruiter'}
          onToggle={() => toggleFilter('recruiter')}
          onSelect={handleFilterSelect(setRecruiterFilter, 'recruiter')}
        />
      </div>

      {/* Kanban board */}
      {/* 2026-07-18 audit D5: only show the full-page spinner when there is
          no prior board to keep on screen — refetches (filter change,
          debounced search) keep the current columns visible instead of
          blanking to a spinner (mirrors AtsDashboard's `loading && !data`). */}
      {loading && columns.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : columns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No stages configured</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            Set up pipeline stages in ATS Settings to start tracking candidates.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {columns.map((col) => {
              const stageId = col.stage?._id || col._id;
              const stageName = col.stage?.name || col.name || 'Unknown';
              return (
                <KanbanColumn
                  key={stageId}
                  stage={{ _id: stageId, name: stageName }}
                  applications={col.applications || []}
                  totalCount={col.totalCount || (col.applications || []).length}
                  onCardClick={handleCardClick}
                  onLoadMore={handleLoadMore}
                  isLoadingMore={!!loadingMore[stageId]}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeCard ? <KanbanCardOverlay application={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      )}

    </div>
  );
}
