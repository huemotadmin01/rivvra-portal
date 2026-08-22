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
  Button,
  KanbanBoard as DsKanbanBoard,
  KanbanCard as DsKanbanCard,
  KanbanCardOverlay as DsKanbanCardOverlay,
  KanbanColumn as DsKanbanColumn,
  RatingStars,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

/* ============================================================================
 * CrmPipelineV2 — CRM kanban on ds (phase 8)
 * ============================================================================
 * Byte-identical copy with only presentation rewritten. The dnd-kit wiring —
 * sensors, DndContext, handleDragEnd and the optimistic stage move with its
 * revert — stays in this page on purpose: ds/Kanban is presentational and
 * takes setNodeRef / listeners / isOver from the caller, the same split the
 * filter controls use for URL binding.
 *
 * Two behaviours preserved verbatim:
 *   - `Number(opp.expectedRevenue) > 0` as the render gate. The older
 *     truthiness check let the string "0" through and painted a deal as
 *     worth zero rupees rather than having no captured value.
 *   - the `(unspecified)` currency form, which drops the ₹ and prefixes
 *     "~ ". It differs from the one on CrmDashboard, and both are copied
 *     rather than reconciled.
 *
 * The local EvalStars is gone — see ds/RatingStars for why the two copies
 * had to be merged rather than either one adopted.
 * ========================================================================== */
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
function KanbanCard({ opp, currency, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp._id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <DsKanbanCard
      dragRef={setNodeRef}
      style={style}
      isDragging={isDragging}
      dragProps={{ ...attributes, ...listeners }}
      onClick={() => onClick(opp)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            font: `550 12.5px/1.4 ${FONT}`, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {opp.name}
          </p>
          {opp.companyName && (
            <p style={{
              display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
              font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)',
            }}>
              <Building2 size={10} /> {opp.companyName}
            </p>
          )}
        </div>
        <GripVertical size={14} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />
      </div>

      {opp.expectedRole && (
        <p style={{
          font: `450 11px/1.4 ${FONT}`, color: 'var(--brand-ink)', marginTop: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {opp.expectedRole}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Treat 0 / "0" / null / undefined uniformly as "unset". The
              old `opp.expectedRevenue &&` check let string "0" through
              and rendered a bare "0" with the rupee icon — looked like
              a deal worth zero rupees rather than a deal with no
              captured value. Mirrors the salary 0-as-unset rule on
              AtsApplicationDetail and the Expected Revenue em-dash on
              CrmOpportunityDetail. */}
          {Number(opp.expectedRevenue) > 0 && (
            <span style={{ font: `500 11px/1.4 ${FONT}`, color: 'var(--warn-ink)' }}>
              {formatMoney(opp.expectedRevenue, opp.currency || currency)}
            </span>
          )}
          <RatingStars value={opp.evaluation || 0} size={10} label="Evaluation" />
        </div>
        {opp.salespersonName && (
          <span style={{
            font: `450 10px/1.4 ${FONT}`, color: 'var(--fg-4)', maxWidth: 80,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {opp.salespersonName?.split(' ')[0]}
          </span>
        )}
      </div>

      {opp.isConverted && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
          padding: '1px 6px', borderRadius: 'var(--r-1)', width: 'fit-content',
          background: 'var(--brand-soft)', color: 'var(--brand-ink)',
          font: `500 10px/1.5 ${FONT}`,
        }}>
          <Trophy size={9} /> Converted
        </div>
      )}
    </DsKanbanCard>
  );
}

// ── Kanban Card Overlay (while dragging) ─────────────────────────────────
function KanbanCardOverlay({ opp }) {
  return (
    <DsKanbanCardOverlay>
      <p style={{
        font: `550 12.5px/1.4 ${FONT}`, color: 'var(--fg)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {opp.name}
      </p>
      {opp.companyName && (
        <p style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>
          {opp.companyName}
        </p>
      )}
    </DsKanbanCardOverlay>
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
    <DsKanbanColumn
      title={stage.name}
      count={totalCount}
      // dropTarget="column" keeps CRM's original behaviour: the whole
      // column, header included, accepts a drop. ATS registers only its
      // body, which is why its droppable id needs a `col:` prefix.
      dropTarget="column"
      dropRef={setDropRef}
      isOver={isOver}
      isEmpty={opportunities.length === 0}
      emptyLabel="No opportunities"
      meta={nonZeroRevenue.length > 0 && (
        <div style={{ marginTop: 2 }}>
          {nonZeroRevenue.map((r, i) => (
            <p
              key={`${r.currency}-${i}`}
              title={r.currency === '(unspecified)' ? 'No currency on record' : r.currency}
              style={{ font: `450 10px/1.4 ${FONT}`, color: 'var(--brand-ink)' }}
            >
              {r.currency === '(unspecified)'
                ? `~ ${formatMoney(r.total, 'INR').replace(/^₹/, '')}`
                : formatMoney(r.total, r.currency)}
            </p>
          ))}
        </div>
      )}
      footer={totalCount > opportunities.length && (
        <Button
          variant="ghost"
          size="sm"
          block
          onClick={() => onLoadMore?.(stage._id)}
        >
          Load more ({totalCount - opportunities.length} remaining)
        </Button>
      )}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {opportunities.map(opp => (
          <KanbanCard key={opp._id} opp={opp} currency={currency} onClick={onCardClick} />
        ))}
      </SortableContext>
    </DsKanbanColumn>
  );
}

// ── Create Opportunity Modal ─────────────────────────────────────────────
// CreateModal removed — creation now routes to /crm/opportunities/new


// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function CrmPipelineV2() {
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
    <div className="p-3 sm:p-6 md:p-8 flex flex-col h-full">
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
          <DsKanbanBoard style={{ flex: 1 }}>
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
          </DsKanbanBoard>
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
