import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { formatMoney } from '../../utils/currency';
import FilterBar, {
  FilterChip, MoreFiltersPopover, useFilterParams,
} from '../../components/shared/FilterBar';
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Star, Building2,
  Trophy, GripVertical, Loader2, Briefcase,
} from 'lucide-react';

const REQUIREMENT_TYPE_OPTIONS = [
  { value: 'Staff Augmentation', label: 'Staff Augmentation' },
  { value: 'Project Based', label: 'Project Based' },
  { value: 'Full-time Hire', label: 'Full-time Hire' },
];

const PIPELINE_FILTER_KEYS = ['search', 'salespersonId', 'source', 'requirementType', 'tagId', 'mine'];
const PIPELINE_MORE_KEYS = ['tagId'];

// ── Star Rating ──────────────────────────────────────────────────────────
// 2026-05-14: only render the click affordance + handler when an
// onChange is wired. KanbanCard passes the stars as a read-only summary;
// the old version showed `cursor-pointer` and ate clicks that did
// nothing, which made users think the rating was editable from Kanban.
function EvalStars({ value = 0, onChange, size = 14 }) {
  const interactive = typeof onChange === 'function';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <Star
          key={i}
          size={size}
          className={`transition-colors ${interactive ? 'cursor-pointer' : ''} ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}`}
          onClick={interactive ? (e => { e.stopPropagation(); onChange(i === value ? 0 : i); }) : undefined}
        />
      ))}
    </div>
  );
}

// ── Kanban Card ──────────────────────────────────────────────────────────
// 2026-05-14: drag handle promoted to the whole card (matches ATS
// Pipeline). The old grip-on-hover affordance required the user to
// find a 14px target before the card became draggable; now any card
// surface accepts the drag. Click-to-navigate is preserved because
// dnd-kit's activation constraint (distance: 5) lets a plain click
// through without firing a drag.
function KanbanCard({ opp, currency, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(opp)}
      {...attributes}
      {...listeners}
      className="bg-dark-800 border border-dark-700 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-dark-500 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-100 truncate">{opp.name}</p>
          {opp.companyName && (
            <p className="text-xs text-dark-400 flex items-center gap-1 mt-0.5">
              <Building2 size={10} /> {opp.companyName}
            </p>
          )}
        </div>
        <div className="text-dark-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <GripVertical size={14} />
        </div>
      </div>

      {opp.expectedRole && (
        <p className="text-xs text-emerald-400 mt-1.5 truncate">{opp.expectedRole}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {/* Treat 0 / "0" / null / undefined uniformly as "unset". The
              old `opp.expectedRevenue &&` check let string "0" through
              and rendered a bare "0" with the rupee icon — looked like
              a deal worth zero rupees rather than a deal with no
              captured value. Mirrors the salary 0-as-unset rule on
              AtsApplicationDetail and the Expected Revenue em-dash on
              CrmOpportunityDetail. */}
          {Number(opp.expectedRevenue) > 0 && (
            <span className="text-xs text-amber-400">
              {formatMoney(opp.expectedRevenue, opp.currency || currency)}
            </span>
          )}
          <EvalStars value={opp.evaluation || 0} size={10} />
        </div>
        {opp.salespersonName && (
          <span className="text-[10px] text-dark-500 truncate max-w-[80px]">{opp.salespersonName?.split(' ')[0]}</span>
        )}
      </div>

      {opp.isConverted && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 rounded px-1.5 py-0.5 w-fit">
          <Trophy size={9} /> Converted
        </div>
      )}
    </div>
  );
}

// ── Kanban Card Overlay (while dragging) ─────────────────────────────────
function KanbanCardOverlay({ opp }) {
  return (
    <div className="bg-dark-800 border border-rivvra-500/50 rounded-lg p-3 shadow-xl w-[280px]">
      <p className="text-sm font-medium text-dark-100 truncate">{opp.name}</p>
      {opp.companyName && <p className="text-xs text-dark-400 mt-0.5">{opp.companyName}</p>}
    </div>
  );
}

// ── Kanban Column ────────────────────────────────────────────────────────
// 2026-05-14: layout parity with ATS Pipeline. Viewport-anchored
// max-h fixes the missing vertical scroll — the old `max-h-full` never
// constrained because `100%` only resolves against a parent with a
// fixed height, and the flex-1 wrapper above this column doesn't have
// one. calc(100vh-260px) leaves room for the platform header + page
// header + filter bar. Width bumped to 300px to match ATS so the cards
// breathe a little more.
function KanbanColumn({ stage, opportunities, totalCount, revenueByCurrency, currency, onCardClick, onLoadMore }) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: stage._id });
  const items = opportunities.map(o => o._id);
  // 2026-05-17 CRM-B: per-currency revenue. Filter zero-totals so
  // we don't paint "₹0" lines on stages whose only currency is empty.
  const nonZeroRevenue = (revenueByCurrency || []).filter((r) => (r.total || 0) > 0);
  return (
    <div
      ref={setDropRef}
      className={`flex-shrink-0 min-w-[300px] max-w-[300px] flex flex-col max-h-[calc(100vh-260px)] ${isOver ? 'ring-1 ring-rivvra-500/40 rounded-lg' : ''}`}
    >
      <div className="bg-dark-850 border border-dark-700 rounded-t-lg px-3 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-dark-200 uppercase tracking-wider truncate">{stage.name}</h3>
          <span className="text-[10px] bg-dark-700 text-dark-400 rounded-full px-2 py-0.5 font-medium flex-shrink-0">{totalCount}</span>
        </div>
        {nonZeroRevenue.length > 0 && (
          <div className="mt-0.5 space-y-0">
            {nonZeroRevenue.map((r, i) => (
              <p key={`${r.currency}-${i}`} className="text-[10px] text-emerald-400 leading-tight" title={r.currency === '(unspecified)' ? 'No currency on record' : r.currency}>
                {r.currency === '(unspecified)'
                  ? `~ ${formatMoney(r.total, 'INR').replace(/^₹/, '')}`
                  : formatMoney(r.total, r.currency)}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto bg-dark-900/50 border-x border-b border-dark-700 rounded-b-lg p-2 space-y-2">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {opportunities.map(opp => (
            <KanbanCard key={opp._id} opp={opp} currency={currency} onClick={onCardClick} />
          ))}
        </SortableContext>
        {opportunities.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-dark-500 text-xs">No opportunities</p>
          </div>
        )}
        {totalCount > opportunities.length && (
          <button
            onClick={() => onLoadMore?.(stage._id)}
            className="w-full py-2 text-xs text-dark-400 hover:text-rivvra-400 transition-colors rounded-lg hover:bg-dark-800"
          >
            Load more ({totalCount - opportunities.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

// ── Create Opportunity Modal ─────────────────────────────────────────────
// CreateModal removed — creation now routes to /crm/opportunities/new


// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function CrmPipeline() {
  const { orgSlug: slug } = useOrg();
  const { currentCompany } = useCompany();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const filterParams = useFilterParams(PIPELINE_FILTER_KEYS);

  const [kanban, setKanban] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salespersons, setSalespersons] = useState([]);
  const [sources, setSources] = useState([]);
  const [tags, setTags] = useState([]);
  // showCreate / CreateModal removed — creation now routes to /crm/opportunities/new
  const [activeId, setActiveId] = useState(null);
  const [activeOpp, setActiveOpp] = useState(null);
  // 2026-05-14: in-flight guard for stage moves. Without this, a second
  // drag landing while the first move's Won-conversion refetch is still
  // pending would interleave optimistic state with the refetch and the
  // card would flicker into a wrong column. Ref instead of state so the
  // gate evaluates immediately without waiting for a re-render.
  const movingRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchKanban = useCallback(async () => {
    // 2026-05-17 CRM-D: keep prior kanban visible while refetching.
    // setKanban([]) used to wipe the board on every keystroke past
    // the search debounce. _requestKey dedup auto-aborts stale
    // requests so race-late responses can't overwrite a newer fetch.
    setLoading(true);
    // 2026-05-19: aborted-flag so finally skips setLoading(false) when
    // cancelled by a newer fetch.
    let aborted = false;
    try {
      const res = await crmApi.getKanban(slug, {
        ...filterParams,
        _requestKey: 'crm:kanban',
      });
      if (res.success) setKanban(res.kanban || []);
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      addToast('Failed to load pipeline', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id, JSON.stringify(filterParams)]);

  useEffect(() => { fetchKanban(); }, [fetchKanban]);

  useEffect(() => {
    if (!slug) return;
    crmApi.listSalespersons(slug).then(res => { if (res.success) setSalespersons(res.salespersons || []); }).catch(() => {});
    crmApi.listSources(slug).then(res => { if (res.success) setSources(res.sources || []); }).catch(() => {});
    crmApi.listTags(slug).then(res => { if (res.success) setTags(res.tags || []); }).catch(() => {});
  }, [slug]);

  // ── DnD handlers ──
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    for (const col of kanban) {
      const found = col.opportunities.find(o => o._id === event.active.id);
      if (found) { setActiveOpp(found); break; }
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOpp(null);
    if (!over || active.id === over.id) return;
    // Drop the move if another one is still in flight — the refetch
    // from the in-flight call would clobber this optimistic update
    // anyway, and silently failing is worse than telling the user.
    if (movingRef.current) {
      addToast('Hold on — finishing the last move first.', 'info');
      return;
    }

    // Find destination stage
    let destStageId = null;
    for (const col of kanban) {
      if (col.stage._id === over.id || col.opportunities.some(o => o._id === over.id)) {
        destStageId = col.stage._id;
        break;
      }
    }
    // Also check if dropped on stage header
    if (!destStageId) {
      const stageCol = kanban.find(c => c.stage._id === over.id);
      if (stageCol) destStageId = stageCol.stage._id;
    }

    if (!destStageId) return;

    // Find source
    let sourceStageId = null;
    for (const col of kanban) {
      if (col.opportunities.some(o => o._id === active.id)) {
        sourceStageId = col.stage._id;
        break;
      }
    }

    if (sourceStageId === destStageId) return;

    // Optimistic update
    setKanban(prev => {
      const next = prev.map(col => ({
        ...col,
        opportunities: col.opportunities.filter(o => o._id !== active.id),
        totalCount: col.stage._id === sourceStageId ? col.totalCount - 1 : col.totalCount,
      }));
      const oppToMove = prev.flatMap(c => c.opportunities).find(o => o._id === active.id);
      if (oppToMove) {
        const destCol = next.find(c => c.stage._id === destStageId);
        if (destCol) {
          destCol.opportunities.unshift({ ...oppToMove, stageId: destStageId });
          destCol.totalCount++;
        }
      }
      return next;
    });

    movingRef.current = true;
    try {
      const res = await crmApi.moveStage(slug, active.id, destStageId);
      if (res.jobCreated) {
        await fetchKanban();
        addToast(`Won! Job Position "${res.jobCreated.jobName}" created in ATS`, 'success');
      } else if (res.isWonStage) {
        addToast('Opportunity marked as Won!', 'success');
      }
    } catch {
      addToast('Failed to move', 'error');
      await fetchKanban();
    } finally {
      movingRef.current = false;
    }
  };

  const handleCardClick = (opp) => {
    navigate(`/org/${slug}/crm/opportunities/${opp._id}`);
  };

  // 2026-05-14: load-more for stages with >20 deals. Mirrors the ATS
  // Pipeline pattern — request kanban scoped to one stage with an
  // offset, then append the returned cards to that column's array.
  // Filters are forwarded unchanged so the loaded batch matches the
  // visible filter chain.
  const handleLoadMore = async (stageId) => {
    if (!slug) return;
    const col = kanban.find(c => c.stage?._id === stageId);
    if (!col) return;
    const currentCount = (col.opportunities || []).length;
    try {
      const res = await crmApi.getKanban(slug, { ...filterParams, stageId, offset: currentCount });
      if (!res?.success) return;
      const more = (res.kanban || []).find(s => s.stage?._id === stageId);
      if (!more) return;
      setKanban(prev => prev.map(c => {
        if (c.stage?._id !== stageId) return c;
        return { ...c, opportunities: [...(c.opportunities || []), ...(more.opportunities || [])] };
      }));
    } catch {
      addToast('Failed to load more deals', 'error');
    }
  };

  const stages = kanban.map(c => c.stage);

  if (!slug || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-dark-400 animate-spin" />
      </div>
    );
  }

  // 2026-05-14: parity with ATS Pipeline. Outer padding, subtitle, and
  // a no-stages empty state were missing.
  const visibleColumns = kanban.filter(col => !col.stage?.isWonStage);

  return (
    <div className="p-6 md:p-8 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline</h1>
          <p className="text-dark-400 text-sm mt-1">Drag and drop deals across stages</p>
        </div>
        <button
          onClick={() => navigate(`/org/${slug}/crm/opportunities/new`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors flex-shrink-0"
        >
          <Plus size={14} /> New Opportunity
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <FilterBar searchPlaceholder="Search pipeline…">
          <FilterChip type="boolean" paramKey="mine" label="My deals" />
          <FilterChip
            type="select"
            paramKey="salespersonId"
            label="Salesperson"
            options={salespersons.map(s => ({ value: s._id, label: s.name || 'Unknown' }))}
          />
          <FilterChip
            type="select"
            paramKey="source"
            label="Source"
            options={sources.map(s => ({ value: s, label: s }))}
          />
          <FilterChip
            type="select"
            paramKey="requirementType"
            label="Requirement"
            options={REQUIREMENT_TYPE_OPTIONS}
          />
          <MoreFiltersPopover paramKeys={PIPELINE_MORE_KEYS}>
            <FilterChip
              type="select"
              paramKey="tagId"
              label="Tag"
              options={tags.map(t => ({ value: t._id, label: t.name }))}
            />
          </MoreFiltersPopover>
        </FilterBar>
      </div>

      {/* Kanban Board — no-stages empty state mirrors ATS so a fresh
          tenant with no pipeline yet isn't dropped onto a blank screen. */}
      {visibleColumns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No stages configured</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            Set up pipeline stages in CRM Configuration to start tracking deals.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {visibleColumns.map(col => (
              <SortableContext key={col.stage._id} items={[col.stage._id]}>
                <KanbanColumn
                  stage={col.stage}
                  opportunities={col.opportunities}
                  totalCount={col.totalCount}
                  revenueByCurrency={col.revenueByCurrency}
                  currency={currentCompany?.currency || 'INR'}
                  onCardClick={handleCardClick}
                  onLoadMore={handleLoadMore}
                />
              </SortableContext>
            ))}
          </div>
          <DragOverlay>
            {activeOpp && <KanbanCardOverlay opp={activeOpp} />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create modal */}
      {/* New-opportunity creation now lives at /crm/opportunities/new */}
    </div>
  );
}
