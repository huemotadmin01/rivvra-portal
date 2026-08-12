// ============================================================================
// TodoTasksV2.jsx — All Tasks on ds (phase 6a)
// ============================================================================
// Copied from TodoTasks.jsx. The data flow is unchanged: the same server-side
// status/priority/sort params, the same `?status=` deep link the dashboard
// tiles land on, the same client-side search over the loaded page, and the
// same double-click guard on AI accept/dismiss.
//
// Presentation moves to ds: `Tabs` for the status strip, `SearchInput` +
// `SelectChip` for the filter row, `BulkActionBar` for the selection verbs,
// `Pagination` for the footer, and the app-layer `todo/v2/TaskCardV2` rows
// inside a flush `Panel`.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import useTodoAssign from '../../hooks/useTodoAssign';
import TaskCardV2 from '../../components/todo/v2/TaskCardV2';
import TaskFormModalV2 from '../../components/todo/v2/TaskFormModalV2';
import { CheckSquare, Plus, CheckCircle2 } from 'lucide-react';
import {
  Button, EmptyState, Pagination, PageHeader, Panel, SearchInput,
  SelectChip, Spinner, Tabs, BulkActionBar,
} from '../../components/ds';

const PAGE_SIZE = 50;

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'ai', label: 'AI Suggestions' },
];
const VALID_STATUS_KEYS = STATUS_TABS.map(t => t.key);

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Newest First' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'priority', label: 'Priority' },
];

export default function TodoTasksV2() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Deep-linkable status filter (?status=…) — dashboard tiles land here.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState(
    VALID_STATUS_KEYS.includes(urlStatus) ? urlStatus : ''
  );
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [search, setSearch] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const { canAssign, assignableEmployees } = useTodoAssign(orgSlug);

  useEffect(() => {
    if (orgSlug) loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, statusFilter, priorityFilter, sortBy, page]);

  async function loadTasks() {
    try {
      setLoading(true);
      const params = { page, limit: PAGE_SIZE, sort: sortBy };
      if (statusFilter === 'ai') {
        params.source = 'ai';
      } else if (statusFilter === 'overdue') {
        params.overdue = true;
      } else if (statusFilter) {
        params.status = statusFilter;
      }
      if (priorityFilter) params.priority = priorityFilter;

      const res = await todoApi.getTasks(orgSlug, params);
      if (res.success) {
        setTasks(res.tasks);
        setTotal(res.total);
      }
    } catch (err) {
      console.error('Load tasks error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask(taskData) {
    try {
      const res = await todoApi.createTask(orgSlug, taskData);
      if (res.success) {
        showToast('Task created', 'success');
        setShowCreateModal(false);
        loadTasks();
      }
    } catch {
      showToast('Failed to create task', 'error');
    }
  }

  async function handleUpdateTask(taskData) {
    try {
      const res = await todoApi.updateTask(orgSlug, editingTask._id, taskData);
      if (res.success) {
        showToast('Task updated', 'success');
        setEditingTask(null);
        loadTasks();
      }
    } catch {
      showToast('Failed to update task', 'error');
    }
  }

  async function handleDeleteTask(taskId) {
    try {
      await todoApi.deleteTask(orgSlug, taskId);
      showToast('Task deleted', 'success');
      loadTasks();
    } catch {
      showToast('Failed to delete task', 'error');
    }
  }

  async function handleToggleStatus(task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    try {
      await todoApi.updateTask(orgSlug, task._id, { status: newStatus });
      setTasks(prev => prev.map(t =>
        t._id === task._id ? { ...t, status: newStatus } : t
      ));
    } catch {
      showToast('Failed to update', 'error');
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
      // In the AI Suggestions tab an accepted item no longer belongs to the
      // view; elsewhere its badge changes. Reload keeps list + total honest.
      loadTasks();
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
    } catch {
      showToast('Failed to dismiss', 'error');
    } finally {
      processingSuggestionIds.current.delete(taskId);
    }
  }

  async function handleBulkMarkDone() {
    if (selectedIds.size === 0) return;
    try {
      await todoApi.bulkStatus(orgSlug, [...selectedIds], 'done');
      showToast(`${selectedIds.size} task(s) marked done`, 'success');
      setSelectedIds(new Set());
      loadTasks();
    } catch {
      showToast('Bulk update failed', 'error');
    }
  }

  function toggleSelect(taskId) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map(t => t._id)));
    }
  }

  // Client-side search filter
  const filteredTasks = search
    ? tasks.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description?.toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1120 }}>
      <PageHeader
        title="All Tasks"
        sub={`${total} total ${total === 1 ? 'task' : 'tasks'}`}
        actions={
          <Button iconLeft={<Plus size={15} />} onClick={() => setShowCreateModal(true)}>
            New Task
          </Button>
        }
        style={{ marginBottom: 14 }}
      />

      <Tabs
        tabs={STATUS_TABS}
        value={statusFilter}
        onChange={(key) => {
          setStatusFilter(key);
          setPage(1);
          setSearchParams(key ? { status: key } : {}, { replace: true });
        }}
        style={{ marginBottom: 14 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search tasks…"
          width={260}
        />
        <SelectChip
          label="Priority"
          value={priorityFilter}
          onChange={(v) => { setPriorityFilter(v); setPage(1); }}
          options={PRIORITY_OPTIONS}
        />
        <SelectChip
          label="Sort"
          value={sortBy}
          onChange={(v) => { setSortBy(v || 'createdAt'); setPage(1); }}
          options={SORT_OPTIONS}
          anyLabel="Newest First"
        />
      </div>

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState icon={<CheckSquare size={22} />} title="No tasks found">
          Create a task or adjust your filters.
        </EmptyState>
      ) : (
        <Panel flush>
          {/* Select page */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
            borderBottom: '1px solid var(--line)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={selectedIds.size === filteredTasks.length && filteredTasks.length > 0}
              onChange={toggleSelectAll}
              style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }}
            />
            <span style={{ font: "500 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Select page
            </span>
          </label>

          <div>
            {filteredTasks.map((task, i) => (
              <div key={task._id} style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
                <TaskCardV2
                  task={task}
                  orgSlug={orgSlug}
                  selected={selectedIds.has(task._id)}
                  onSelect={() => toggleSelect(task._id)}
                  onToggleStatus={() => handleToggleStatus(task)}
                  onEdit={() => setEditingTask(task)}
                  onDelete={() => handleDeleteTask(task._id)}
                  onAccept={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleAcceptAiTask(task._id) : null}
                  onDismiss={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleDismissAiTask(task._id) : null}
                  showCheckbox
                />
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', padding: '4px 10px' }}>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              noun="task"
              onPageChange={setPage}
            />
          </div>
        </Panel>
      )}

      <BulkActionBar
        count={selectedIds.size}
        noun="task"
        nounPlural="tasks"
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: 'Mark Done', icon: <CheckCircle2 size={14} />, tone: 'primary', onClick: handleBulkMarkDone },
        ]}
      />

      {/* Modals */}
      {showCreateModal && (
        <TaskFormModalV2
          onClose={() => setShowCreateModal(false)}
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
