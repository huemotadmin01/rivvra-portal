// ============================================================================
// TodoTasksV2.jsx — Tasks: one screen for my work, what I assigned, my team
// ============================================================================
// 2026-11-19 rework (manager feedback: "multiple navigation issues to check
// tasks assigned to my subordinates and even tracking my own task from a
// single screen"). Before, a manager needed three pages — Dashboard, All
// Tasks, Team Tasks — and still could not see a subordinate's tasks unless
// they themselves had assigned them.
//
// Now one page, three views picked by the cards at the top:
//   • My tasks        — my list (made by me + assigned to me), "From" filter.
//   • Assigned by me  — what I delegated (the old Team Tasks), per person.
//   • My team         — every task of everyone in my reporting line, with a
//                       People table (open / overdue / in progress / done 7d).
//                       Read-only unless I assigned the task (owner's rule).
// View, person and status live in the URL so a link or Back lands on the
// same list. Search runs on the server (it used to filter only the 50 rows
// on screen). Default status is "Open" — done tasks were burying live work.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import useTodoAssign from '../../hooks/useTodoAssign';
import TaskCardV2 from '../../components/todo/v2/TaskCardV2';
import TaskFormModalV2 from '../../components/todo/v2/TaskFormModalV2';
import { CheckSquare, Plus, CheckCircle2, User, Send, Users, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Button, Callout, ConfirmDialog, EmptyState, Pagination, PageHeader, Panel, SearchInput,
  SelectChip, Spinner, Tabs, BulkActionBar,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";
const PAGE_SIZE = 50;
const VIEWS = ['mine', 'assigned', 'team'];

const STATUS_TABS_ALL = [
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'pending', label: 'Not started' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
  { key: 'ai', label: 'AI suggestions', mineOnly: true },
];
// Old links used ?status= with '' for All; keep them working.
const STATUS_ALIASES = { '': 'open' };

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const SORT_OPTIONS = [
  { value: 'dueDate', label: 'Due date' },
  { value: 'createdAt', label: 'Newest first' },
  { value: 'priority', label: 'Priority' },
];

const ORIGIN_OPTIONS = [
  { value: 'self', label: 'Added by me' },
  { value: 'assigned', label: 'Assigned to me' },
];

export default function TodoTasksV2() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL state ────────────────────────────────────────────────────────
  const view = VIEWS.includes(searchParams.get('view')) ? searchParams.get('view') : 'mine';
  const person = view === 'mine' ? '' : (searchParams.get('person') || '');
  const rawStatus = searchParams.get('status');
  const statusKey = (() => {
    const s = rawStatus == null ? 'open' : (STATUS_ALIASES[rawStatus] ?? rawStatus);
    const ok = STATUS_TABS_ALL.some(t => t.key === s && (!t.mineOnly || view === 'mine'));
    return ok ? s : 'open';
  })();

  function patchParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null) next.delete(k); else next.set(k, v);
    }
    // Drop a stale ?draft= hand-off once anything else changes.
    next.delete('draft');
    setSearchParams(next, { replace: true });
  }

  // ── Local filters ────────────────────────────────────────────────────
  const [priorityFilter, setPriorityFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [sortBy, setSortBy] = useState('dueDate');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  // Any filter change starts again at page 1.
  useEffect(() => { setPage(1); }, [view, person, statusKey, priorityFilter, originFilter, sortBy, debouncedSearch]);

  // ── Data ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  // The counts take ~1 s on a cold load; without them the view cards and
  // People table popped in late and shoved the list down (seen live
  // 2026-11-19). Draw from this viewer's last counts, then refresh.
  const cacheKey = orgSlug ? `rivvra_todo_overview:${orgSlug}` : null;
  const [overview, setOverview] = useState(() => {
    if (!cacheKey) return null;
    try { return JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch { return null; }
  });
  const reqSeq = useRef(0);

  const loadOverview = useCallback(() => {
    if (!orgSlug) return;
    todoApi.getOverview(orgSlug)
      .then(res => {
        if (!res?.success) return;
        setOverview(res);
        try { sessionStorage.setItem(`rivvra_todo_overview:${orgSlug}`, JSON.stringify(res)); } catch { /* storage off */ }
      })
      .catch(() => { /* cards fall back to no counts */ });
  }, [orgSlug]);

  const loadTasks = useCallback(async () => {
    if (!orgSlug) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setLoadError('');
    const params = { view, page, limit: PAGE_SIZE, sort: sortBy };
    if (statusKey === 'ai') params.source = 'ai';
    else if (statusKey === 'overdue') params.overdue = true;
    else if (statusKey !== 'all') params.status = statusKey;
    if (priorityFilter) params.priority = priorityFilter;
    if (person) params.person = person;
    if (view === 'mine' && originFilter) params.origin = originFilter;
    if (debouncedSearch) params.q = debouncedSearch;
    try {
      const res = await todoApi.getTasks(orgSlug, params);
      if (seq !== reqSeq.current) return; // a newer request owns the screen
      if (!res?.success) throw new Error(res?.error || 'Could not load tasks');
      setTasks(res.tasks || []);
      setTotal(res.total || 0);
    } catch (err) {
      if (seq !== reqSeq.current) return;
      // A failed load used to fall through to "No tasks found".
      setLoadError(err?.message || 'Could not load tasks');
      setTasks([]);
      setTotal(0);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [orgSlug, view, page, sortBy, statusKey, priorityFilter, person, originFilter, debouncedSearch]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  const refresh = () => { loadTasks(); loadOverview(); };

  // ── Modals ───────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draftInitial, setDraftInitial] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const { canAssign: canAssignCtx, assignableEmployees } = useTodoAssign(orgSlug);
  // Either source is enough to label the button and show "Assigned by me"
  // while the other is still loading.
  const canAssign = canAssignCtx || !!overview?.canAssign;

  // Ask Rivvra draft hand-off (?draft=<key> → sessionStorage): open the
  // create modal prefilled; the key is consumed so a reload does not re-open.
  useEffect(() => {
    const key = searchParams.get('draft');
    if (!key) return;
    let draft = null;
    try {
      const raw = sessionStorage.getItem(`rivvra_assistant_draft:${key}`);
      if (raw) draft = JSON.parse(raw);
      sessionStorage.removeItem(`rivvra_assistant_draft:${key}`);
    } catch { /* ignore */ }
    if (draft?.kind !== 'todo.task') return;
    setDraftInitial(draft.payload || null);
    setShowCreateModal(true);
  }, [searchParams]);

  // Selection belongs to one list.
  useEffect(() => { setSelectedIds(new Set()); }, [view, person, statusKey, page, debouncedSearch]);

  // ── Actions ──────────────────────────────────────────────────────────
  async function handleCreateTask(taskData) {
    try {
      const res = await todoApi.createTask(orgSlug, taskData);
      if (res.success) {
        showToast(taskData.assigneeEmployeeId ? 'Task assigned' : 'Task created', 'success');
        setShowCreateModal(false);
        setDraftInitial(null);
        refresh();
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create task', 'error');
    }
  }

  async function handleUpdateTask(taskData) {
    try {
      const res = await todoApi.updateTask(orgSlug, editingTask._id, taskData);
      if (res.success) {
        showToast('Task updated', 'success');
        setEditingTask(null);
        refresh();
      }
    } catch (err) {
      showToast(err?.message || 'Failed to update task', 'error');
    }
  }

  async function confirmDelete() {
    if (!deletingTask) return;
    setDeleteBusy(true);
    try {
      await todoApi.deleteTask(orgSlug, deletingTask._id);
      showToast('Task deleted', 'success');
      setDeletingTask(null);
      refresh();
    } catch (err) {
      showToast(err?.message || 'Failed to delete task', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleToggleStatus(task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    try {
      await todoApi.updateTask(orgSlug, task._id, { status: newStatus });
      // Reload rather than patch in place: on a status tab the row no longer
      // belongs, the counts must move, and a repeating task's next copy has to appear.
      showToast(newStatus === 'done' ? (task.recurrence?.freq && !task.recurrence.ended ? 'Done — next copy scheduled' : 'Marked done') : 'Reopened', 'success');
      refresh();
    } catch (err) {
      showToast(err?.message || 'Failed to update', 'error');
    }
  }

  async function handleSetStatus(task, status) {
    try {
      await todoApi.updateTask(orgSlug, task._id, { status });
      showToast(status === 'in-progress' ? 'Marked in progress' : 'Moved back to not started', 'success');
      refresh();
    } catch (err) {
      showToast(err?.message || 'Failed to update', 'error');
    }
  }

  // Stop a repeating task. Two plain questions: stop the repeat at all, then
  // whether this copy is finished too (the usual case — "the project is over").
  async function handleEndSeries(task) {
    if (!window.confirm(`Stop repeating "${task.title}"?\n\nNo new copies will be created, and any other open copies of it will be closed.`)) return;
    const completeCurrent = task.status !== 'done'
      && window.confirm('Is this one done as well?\n\nOK = mark it done.  Cancel = keep it open as a one-time task.');
    try {
      const res = await todoApi.endSeries(orgSlug, task._id, completeCurrent);
      if (!res?.success) throw new Error(res?.error || 'Failed');
      showToast(res.closedCopies ? `Repeat stopped — ${res.closedCopies} other open copy(ies) closed` : 'Repeat stopped', 'success');
      refresh();
    } catch (err) {
      showToast(err.message || 'Could not stop the repeat', 'error');
    }
  }

  // Guard against double-clicks / accept-then-dismiss races on a suggestion.
  const processingSuggestionIds = useRef(new Set());

  async function handleAcceptAiTask(taskId) {
    if (processingSuggestionIds.current.has(taskId)) return;
    processingSuggestionIds.current.add(taskId);
    try {
      await todoApi.acceptAiTask(orgSlug, taskId);
      showToast('Task accepted', 'success');
      refresh();
    } catch {
      showToast('Failed to accept', 'error');
    } finally {
      processingSuggestionIds.current.delete(taskId);
    }
  }

  async function handleDismissAiTask(taskId) {
    if (processingSuggestionIds.current.has(taskId)) return;
    processingSuggestionIds.current.add(taskId);
    try {
      await todoApi.dismissAiTask(orgSlug, taskId);
      setTasks(prev => prev.filter(t => t._id !== taskId));
      setTotal(prev => Math.max(0, (prev || 0) - 1));
    } catch {
      showToast('Failed to dismiss', 'error');
    } finally {
      processingSuggestionIds.current.delete(taskId);
    }
  }

  async function handleBulkMarkDone() {
    if (selectedIds.size === 0) return;
    try {
      const res = await todoApi.bulkStatus(orgSlug, [...selectedIds], 'done');
      showToast(`${res?.modifiedCount ?? selectedIds.size} task(s) marked done`, 'success');
      setSelectedIds(new Set());
      refresh();
    } catch {
      showToast('Bulk update failed', 'error');
    }
  }

  // Bulk "mark done" is an owner action (the server only touches my own
  // rows), so it exists on My tasks only.
  const canBulk = view === 'mine' && statusKey !== 'ai';
  function toggleSelect(taskId) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === tasks.length ? new Set() : new Set(tasks.map(t => t._id)));
  }

  // ── View cards ───────────────────────────────────────────────────────
  const mine = overview?.mine;
  const assigned = overview?.assigned;
  const team = overview?.team;
  const showAssigned = !!(canAssign || assigned?.total);
  const showTeam = !!team?.size;
  const cards = [
    {
      key: 'mine', label: 'My tasks', icon: User,
      open: mine?.open, overdue: mine?.overdue,
      sub: mine ? `${mine.dueToday ? `${mine.dueToday} due today · ` : ''}${mine.assignedToMeOpen} assigned to me` : '',
    },
    showAssigned && {
      key: 'assigned', label: 'Assigned by me', icon: Send,
      open: assigned?.open, overdue: assigned?.overdue,
      sub: assigned ? `${assigned.people?.length || 0} ${assigned.people?.length === 1 ? 'person' : 'people'} · ${assigned.doneWeek} done this week` : '',
    },
    showTeam && {
      key: 'team', label: 'My team', icon: Users,
      open: team?.open, overdue: team?.overdue,
      sub: team ? `${team.size} ${team.size === 1 ? 'person' : 'people'} · ${team.doneWeek} done this week` : '',
    },
  ].filter(Boolean);

  // People for the current view (person filter + People table).
  const people = view === 'team' ? (team?.people || []) : view === 'assigned' ? (assigned?.people || []) : [];
  const personName = people.find(p => p.userId === person)?.name;

  const statusTabs = STATUS_TABS_ALL.filter(t => !t.mineOnly || view === 'mine');
  const viewTitle = { mine: 'My tasks', assigned: 'Tasks I assigned', team: 'My team’s tasks' }[view];
  const filtersActive = !!(debouncedSearch || priorityFilter || originFilter || person);

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180 }}>
      <PageHeader
        title="Tasks"
        sub={view === 'team'
          ? 'Everyone in your reporting line. You can change a task only if you assigned it.'
          : view === 'assigned'
            ? 'Work you have given to other people.'
            : 'Tasks you added and tasks assigned to you.'}
        actions={
          <Button iconLeft={<Plus size={15} />} onClick={() => setShowCreateModal(true)}>
            {canAssign ? 'New / assign task' : 'New task'}
          </Button>
        }
        style={{ marginBottom: 14 }}
      />

      {/* View cards — what to look at, with the numbers that matter. */}
      {cards.length > 1 && (
        <div role="tablist" aria-label="Whose tasks" style={{
          display: 'grid', gap: 10, marginBottom: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {cards.map(c => (
            <ViewCard
              key={c.key}
              card={c}
              active={view === c.key}
              onClick={() => patchParams({ view: c.key === 'mine' ? '' : c.key, person: '', status: '' })}
            />
          ))}
        </div>
      )}

      {/* People — who is behind the numbers (team / assigned views). */}
      {view !== 'mine' && people.length > 0 && (
        <PeopleTable
          people={people}
          view={view}
          selected={person}
          onSelect={(uid) => patchParams({ person: uid === person ? '' : uid })}
        />
      )}

      <Tabs
        tabs={statusTabs}
        value={statusKey}
        onChange={(key) => patchParams({ status: key === 'open' ? '' : key })}
        style={{ marginBottom: 12 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={view === 'mine' ? 'Search tasks…' : 'Search tasks or people…'}
          width={260}
        />
        {view !== 'mine' && people.length > 0 && (
          <SelectChip
            label="Person"
            value={person}
            onChange={(v) => patchParams({ person: v })}
            options={people.map(p => ({ value: p.userId, label: p.name }))}
            anyLabel="Everyone"
          />
        )}
        {view === 'mine' && (
          <SelectChip label="From" value={originFilter} onChange={setOriginFilter} options={ORIGIN_OPTIONS} anyLabel="Anyone" />
        )}
        <SelectChip label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={PRIORITY_OPTIONS} />
        {/* The default sort is not a filter — keep the chip in its resting state for it. */}
        <SelectChip
          label="Sort"
          value={sortBy === 'dueDate' ? '' : sortBy}
          onChange={(v) => setSortBy(v || 'dueDate')}
          options={SORT_OPTIONS.filter(o => o.value !== 'dueDate')}
          anyLabel="Due date"
        />
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<X size={13} />}
            onClick={() => { setSearch(''); setPriorityFilter(''); setOriginFilter(''); patchParams({ person: '' }); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {loadError && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">
            {loadError}{' '}
            <Button variant="ghost" size="sm" onClick={refresh}>Retry</Button>
          </Callout>
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : loadError ? null : tasks.length === 0 ? (
        <EmptyState icon={<CheckSquare size={22} />} title={emptyTitle(view, statusKey, filtersActive)}>
          {filtersActive
            ? 'Nothing matches these filters — clear them to see everything.'
            : view === 'assigned'
              ? 'Use “New / assign task” and pick a person to delegate work. You can follow it here.'
              : view === 'team'
                ? 'No tasks in this list for your team.'
                : 'Add a task, or switch the tab above.'}
        </EmptyState>
      ) : (
        <Panel flush style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
            borderBottom: '1px solid var(--line)', font: `500 11.5px/1.3 ${FONT}`, color: 'var(--fg-4)',
          }}>
            {canBulk && (
              <input
                type="checkbox"
                aria-label="Select page"
                checked={selectedIds.size === tasks.length && tasks.length > 0}
                onChange={toggleSelectAll}
                style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }}
              />
            )}
            <span>
              {viewTitle}{personName ? ` · ${personName}` : ''} — {total} {total === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          {tasks.map((task, i) => (
            <div key={task._id} style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
              <TaskCardV2
                task={task}
                orgSlug={orgSlug}
                showOwner={view !== 'mine'}
                selected={selectedIds.has(task._id)}
                onSelect={() => toggleSelect(task._id)}
                showCheckbox={canBulk}
                onToggleStatus={() => handleToggleStatus(task)}
                onEdit={() => setEditingTask(task)}
                onDelete={() => setDeletingTask(task)}
                onEndSeries={() => handleEndSeries(task)}
                onSetStatus={(st) => handleSetStatus(task, st)}
                onAccept={task.source === 'ai' && !task.aiMeta?.accepted && view === 'mine' ? () => handleAcceptAiTask(task._id) : null}
                onDismiss={task.source === 'ai' && !task.aiMeta?.accepted && view === 'mine' ? () => handleDismissAiTask(task._id) : null}
              />
            </div>
          ))}

          {total > PAGE_SIZE && (
            <div style={{ borderTop: '1px solid var(--line)', padding: '4px 10px' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} noun="task" onPageChange={setPage} />
            </div>
          )}
        </Panel>
      )}

      {canBulk && (
        <BulkActionBar
          count={selectedIds.size}
          noun="task"
          nounPlural="tasks"
          onClear={() => setSelectedIds(new Set())}
          actions={[
            { label: 'Mark Done', icon: <CheckCircle2 size={14} />, tone: 'primary', onClick: handleBulkMarkDone },
          ]}
        />
      )}

      <ConfirmDialog
        open={!!deletingTask}
        title="Delete this task?"
        message={deletingTask ? `“${deletingTask.title}” will be removed${deletingTask.access === 'assigner' ? ` from ${deletingTask.ownerName || 'their'} list too` : ''}. This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onCancel={() => setDeletingTask(null)}
        onConfirm={confirmDelete}
      />

      {showCreateModal && (
        <TaskFormModalV2
          initial={draftInitial}
          onClose={() => { setShowCreateModal(false); setDraftInitial(null); }}
          onSave={handleCreateTask}
          canAssign={canAssign}
          assignableEmployees={assignableEmployees}
        />
      )}
      {editingTask && (
        <TaskFormModalV2
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleUpdateTask}
        />
      )}
    </div>
  );
}

function emptyTitle(view, statusKey, filtersActive) {
  if (filtersActive) return 'No matching tasks';
  if (statusKey === 'overdue') return 'Nothing overdue';
  if (statusKey === 'open') return view === 'mine' ? 'You’re all caught up' : 'No open tasks';
  return 'No tasks here';
}

function ViewCard({ card, active, onClick }) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 'var(--r-3)',
        border: 'none', background: active ? 'var(--brand-soft)' : 'var(--surface-1)',
        boxShadow: active ? '0 0 0 1.5px var(--brand)' : '0 0 0 1px var(--line)',
        display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, font: `600 12.5px/1.2 ${FONT}`, color: active ? 'var(--brand-ink)' : 'var(--fg-2)' }}>
        <Icon size={14} /> {card.label}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ font: `650 20px/1 ${FONT}`, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {card.open ?? '–'}
          <span style={{ font: `500 11.5px/1 ${FONT}`, color: 'var(--fg-4)', marginLeft: 5 }}>open</span>
        </span>
        {card.overdue > 0 && (
          <span style={{ font: `600 12px/1 ${FONT}`, color: 'var(--danger)' }}>{card.overdue} overdue</span>
        )}
      </span>
      {card.sub && <span style={{ font: `450 11.5px/1.3 ${FONT}`, color: 'var(--fg-4)' }}>{card.sub}</span>}
    </button>
  );
}

const PEOPLE_PREVIEW = 6;

function PeopleTable({ people, view, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  // Who needs a look first: most overdue, then most open. People with
  // nothing open and nothing done this week go last.
  const sorted = [...people].sort((a, b) =>
    b.overdue - a.overdue || b.open - a.open || b.doneWeek - a.doneWeek || a.name.localeCompare(b.name));
  const shown = expanded ? sorted : sorted.slice(0, PEOPLE_PREVIEW);
  const th = {
    textAlign: 'right', padding: '7px 10px', font: `600 10px/1 ${FONT}`, color: 'var(--fg-4)',
    textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
  };
  const td = { textAlign: 'right', padding: '7px 10px', font: `500 12.5px/1.3 ${FONT}`, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-2)' };
  return (
    <Panel
      flush
      title={view === 'team' ? 'People in your team' : 'People you assigned work to'}
      icon={<Users size={14} />}
      style={{ marginBottom: 16 }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Person</th>
              <th style={th}>Open</th>
              <th style={th}>Overdue</th>
              <th style={th}>In progress</th>
              <th style={th}>Due in 7 days</th>
              <th style={th}>Done this week</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(p => {
              const on = p.userId === selected;
              return (
                <tr
                  key={p.userId}
                  onClick={() => onSelect(p.userId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.userId); } }}
                  tabIndex={0}
                  aria-selected={on}
                  title={on ? 'Show everyone' : `Show ${p.name}'s tasks`}
                  style={{ cursor: 'pointer', background: on ? 'var(--brand-soft)' : undefined, borderTop: '1px solid var(--line)' }}
                >
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{ font: `550 12.5px/1.3 ${FONT}`, color: on ? 'var(--brand-ink)' : 'var(--fg)' }}>{p.name}</span>
                    {(p.designation || (p.depth > 1 && p.managerName)) && (
                      <span style={{ display: 'block', font: `450 11px/1.3 ${FONT}`, color: 'var(--fg-4)' }}>
                        {[p.designation, p.depth > 1 && p.managerName ? `reports to ${p.managerName}` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td style={td}>{p.open || <span style={{ color: 'var(--fg-4)' }}>0</span>}</td>
                  <td style={{ ...td, color: p.overdue ? 'var(--danger)' : 'var(--fg-4)', fontWeight: p.overdue ? 650 : 500 }}>{p.overdue}</td>
                  <td style={{ ...td, color: p.inProgress ? 'var(--fg-2)' : 'var(--fg-4)' }}>{p.inProgress}</td>
                  <td style={{ ...td, color: p.dueWeek ? 'var(--fg-2)' : 'var(--fg-4)' }}>{p.dueWeek}</td>
                  <td style={{ ...td, color: p.doneWeek ? 'var(--brand-ink)' : 'var(--fg-4)' }}>{p.doneWeek}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > PEOPLE_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center',
            padding: '8px 10px', border: 'none', borderTop: '1px solid var(--line)', background: 'transparent',
            cursor: 'pointer', font: `550 12px/1 ${FONT}`, color: 'var(--brand-ink)',
          }}
        >
          {expanded ? <><ChevronUp size={13} /> Show fewer</> : <><ChevronDown size={13} /> Show all {sorted.length} people</>}
        </button>
      )}
    </Panel>
  );
}
