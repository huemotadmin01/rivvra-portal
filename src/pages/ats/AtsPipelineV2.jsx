import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
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
  Button,
  KanbanBoard as DsKanbanBoard,
  KanbanCard as DsKanbanCard,
  KanbanCardOverlay as DsKanbanCardOverlay,
  KanbanColumn as DsKanbanColumn,
  RatingStars,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

/* ============================================================================
 * AtsPipelineV2 — ATS kanban on ds (phase 8)
 * ============================================================================
 * Byte-identical copy with only the leaf presentational components rewritten.
 * The main component body is untouched, and that is the point: every stage
 * GATE lives there.
 *
 *   - `canDragCard` — admins move any card, everyone else only their own
 *     (recruiterId === myEmployeeId). It feeds useSortable's `disabled`, so a
 *     colleague's card cannot be lifted at all.
 *   - `handleDragEnd`'s three-way error cascade — (a) requiresBackwardReason
 *     prompts for an audit reason and retries in place, (b) the nine gate
 *     flags (resume / attachment / interview / interviewResult / sequential /
 *     hire / offer / documents / rateConfirmation, plus RATE_CONFIRMATION_*
 *     codes) revert, explain, and route to the detail page where the wizard
 *     lives, (c) anything else reverts with the raw message.
 *
 * Parity on WHICH drops are refused is therefore proven by diff rather than
 * by trying to manufacture nine broken application states on staging — the
 * diff covers all nine at once and cannot miss one.
 * ========================================================================== */
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
          <div className="absolute left-0 top-full mt-1.5 min-w-[220px] max-w-[calc(100vw-1.5rem)] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl z-20 flex flex-col max-h-72 overflow-hidden">
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
function KanbanCardInner({ application, onClick, canDrag = true }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application._id, disabled: !canDrag });

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
    <DsKanbanCard
      dragRef={setNodeRef}
      style={style}
      isDragging={isDragging}
      draggable={canDrag}
      onClick={() => {
        // Don't navigate when dragging
        if (!isDragging) onClick?.(application);
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Drag handle. Non-owned cards (not the assigned recruiter, caller
            not an ATS admin) are read-only here: stage writes are team-scoped
            server-side and would 404, so we drop the drag listeners rather
            than let the card snap back. 2026-07-22 audit fix #4/#5:
            {...attributes} sets tabIndex:0 for the KeyboardSensor — do NOT
            override it back to -1 or keyboard drag can never activate. */}
        {canDrag ? (
          <div
            {...attributes}
            {...listeners}
            role="button"
            aria-label="Drag to reorder"
            style={{ marginTop: 1, flexShrink: 0, color: 'var(--fg-faint)' }}
          >
            <GripVertical size={14} />
          </div>
        ) : (
          <div
            aria-hidden="true"
            title="Only the assigned recruiter or an admin can move this application."
            style={{ marginTop: 1, flexShrink: 0, color: 'var(--fg-faint)', opacity: 0.4, cursor: 'not-allowed' }}
          >
            <GripVertical size={14} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            display: 'flex', alignItems: 'center', gap: 6,
            font: `550 12.5px/1.4 ${FONT}`, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {application.candidateName || 'Unnamed'}
            {application.kanbanState === 'done' && (
              <span
                style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--brand)', flexShrink: 0 }}
                aria-label="Done"
                title="Done"
              />
            )}
            {application.kanbanState === 'blocked' && (
              <span
                style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--danger)', flexShrink: 0 }}
                aria-label="Blocked"
                title="Blocked"
              />
            )}
          </p>
          {application.jobName && (
            <p style={{
              font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {application.jobName}
            </p>
          )}
          {application.candidateEmail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, minWidth: 0 }}>
              <Mail size={10} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              <p style={{
                font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {application.candidateEmail}
              </p>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            <RatingStars value={application.evaluation || 0} label="Evaluation" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {application.recruiterName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <User size={10} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                  <span style={{
                    font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)', maxWidth: 60,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {application.recruiterName}
                  </span>
                </div>
              )}
              {application.appliedOn && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={10} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                  <span style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>
                    {formatDate(application.appliedOn)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DsKanbanCard>
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
    <DsKanbanCardOverlay width={268}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ marginTop: 1, flexShrink: 0, color: 'var(--fg-faint)' }}>
          <GripVertical size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            font: `550 12.5px/1.4 ${FONT}`, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {application.candidateName || 'Unnamed'}
          </p>
          {application.jobName && (
            <p style={{
              font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {application.jobName}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            <RatingStars value={application.evaluation || 0} label="Evaluation" />
            {application.appliedOn && (
              <span style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>
                {formatDate(application.appliedOn)}
              </span>
            )}
          </div>
        </div>
      </div>
    </DsKanbanCardOverlay>
  );
}

function KanbanColumnInner({ stage, applications, totalCount, onCardClick, onLoadMore, isLoadingMore, canDragCard }) {
  const ids = applications.map((a) => a._id);
  const hasMore = totalCount > applications.length;
  // Register the column itself as a droppable — without this, dropping on
  // an EMPTY column resolved `over` to null (only cards were droppable via
  // SortableContext) and the drag silently snapped back. The `col:` prefix
  // keeps the id namespace distinct from card ids; handleDragEnd strips it.
  const { setNodeRef } = useDroppable({ id: `col:${stage._id}` });

  return (
    <DsKanbanColumn
      title={stage.name}
      count={totalCount}
      // dropTarget="body" keeps ATS's original wiring — only the card list
      // accepts the drop, which is exactly why the id above needs the
      // `col:` prefix.
      dropTarget="body"
      dropRef={setNodeRef}
      maxHeight="calc(100dvh - 220px)"
      isEmpty={applications.length === 0}
      emptyLabel="No applications"
      footer={hasMore && (
        <Button
          variant="ghost"
          size="sm"
          block
          onClick={() => onLoadMore?.(stage._id)}
          disabled={isLoadingMore}
        >
          {isLoadingMore
            ? 'Loading…'
            : `Load more (${totalCount - applications.length} remaining)`}
        </Button>
      )}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {applications.map((app) => (
          <KanbanCard
            key={app._id}
            application={app}
            onClick={onCardClick}
            canDrag={canDragCard ? canDragCard(app) : true}
          />
        ))}
      </SortableContext>
    </DsKanbanColumn>
  );
}
const KanbanColumn = memo(KanbanColumnInner);

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsPipelineV2() {
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

  // 2026-07-22 audit fix #4: the board reads all org apps (readAll) but stage
  // writes are team-scoped — dragging a colleague's card 404s ("Application
  // not found"). Resolve the caller's employee id so non-owned cards can be
  // rendered non-draggable up front (same getMyProfile pattern as
  // AtsApplications.jsx).
  const [myEmployeeId, setMyEmployeeId] = useState(null);
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.getMyProfile(orgSlug)
      .then((res) => { if (res?.success && res.employee) setMyEmployeeId(res.employee._id); })
      .catch(() => {});
  }, [orgSlug]);
  // Admins can move any card; everyone else only the applications they own.
  // useCallback so the memoized KanbanColumn doesn't re-render every parent
  // state change (identity is stable across drags/filters).
  const canDragCard = useCallback(
    (app) => isAdmin || (!!app?.recruiterId && !!myEmployeeId && String(app.recruiterId) === String(myEmployeeId)),
    [isAdmin, myEmployeeId],
  );

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
      // 2026-07-22 audit fix #3: the server /stage endpoint enforces the same
      // gates as the detail-page wizard and 400s on unmet ones. The board
      // can't run those wizards, so classify the error instead of dumping a
      // raw toast + snap-back.

      // (a) Backward move needs an audit reason. Collect it with a prompt and
      //     retry in place — keep the optimistic move on success. (The detail
      //     page uses a proper BackwardMoveReasonModal; a prompt is the
      //     lightweight board equivalent.)
      if (err?.requiresBackwardReason) {
        const from = err.currentStageName || sourceInfo.app?.stageName || 'current stage';
        const to = err.targetStageName || 'the earlier stage';
        const reason = window.prompt(`Moving ${from} → ${to} back a stage requires a reason (recorded in the history):`);
        if (reason && reason.trim()) {
          try {
            await atsApi.moveStage(orgSlug, active.id, targetStageId, { reason: reason.trim() });
            showToast('Application moved');
            return;
          } catch (retryErr) {
            setColumns(prevColumns);
            showToast(retryErr?.message || 'Failed to move application', 'error');
            return;
          }
        }
        // Cancelled / blank — abandon the move.
        setColumns(prevColumns);
        return;
      }

      // (b) Gate failures (resume / documents / offer / RC / interview /
      //     sequential / hire). These need the stage-transition wizard, which
      //     only lives on the detail page — revert, explain, and offer to jump
      //     there. The toast is click-to-dismiss and the navigate lands the
      //     user on the wizard's own affordances.
      const isGateFailure = err?.requiresResume || err?.requiresAttachment
        || err?.requiresInterview || err?.requiresInterviewResult
        || err?.requiresSequentialMove || err?.requiresHire
        || err?.requiresOffer || err?.requiresDocuments || err?.requiresRateConfirmation
        || (typeof err?.code === 'string' && err.code.startsWith('RATE_CONFIRMATION_'));
      if (isGateFailure) {
        setColumns(prevColumns);
        showToast(`${err.message || 'This move needs extra steps'} — opening the application to continue…`, 'warning');
        navigate(orgPath(`/ats/applications/${active.id}`));
        return;
      }

      // (c) Everything else (incl. the 404 a colleague's card would throw if
      //     it slipped past the non-draggable guard) → revert + raw message.
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
    <div className="p-3 sm:p-6 md:p-8 flex flex-col h-full">
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
          <DsKanbanBoard style={{ flex: 1 }}>
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
                  canDragCard={canDragCard}
                />
              );
            })}
          </DsKanbanBoard>

          <DragOverlay>
            {activeCard ? <KanbanCardOverlay application={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      )}

    </div>
  );
}
