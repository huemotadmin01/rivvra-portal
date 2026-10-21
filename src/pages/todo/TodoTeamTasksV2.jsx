// ============================================================================
// TodoTeamTasksV2.jsx — Team Tasks on ds (phase 6a)
// ============================================================================
// Copied from TodoTeamTasks.jsx. Unchanged: the server-side status filter, the
// `canAssign` gate on the Assign Task button and the two different empty
// states behind it, and the overdue boundary (due DATE passed, matching
// TaskCard's "Xd overdue" chips and the server's overdue filter).
//
// Presentation moves to ds: `Tabs` for the status strip, a flush `Panel` of
// `todo/v2/TaskCardV2` rows, `EmptyState` for the two no-rows cases.
// ============================================================================

import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import useTodoAssign from '../../hooks/useTodoAssign';
import TaskCardV2 from '../../components/todo/v2/TaskCardV2';
import TaskFormModalV2 from '../../components/todo/v2/TaskFormModalV2';
import { Plus, Users } from 'lucide-react';
import { Button, Callout, EmptyState, PageHeader, Panel, Spinner, Tabs } from '../../components/ds';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

// One screenful plus headroom; the server caps `limit` at 200.
const PAGE_SIZE = 100;

export default function TodoTeamTasksV2() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  // The list used to stop at 200 with nothing saying so, and a failed load
  // fell through to "No assigned tasks yet" — the same wrong answer as an
  // empty list. One assigner is already past the old ceiling.
  const [pagination, setPagination] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const { canAssign, assignableEmployees } = useTodoAssign(orgSlug);

  useEffect(() => {
    if (orgSlug) loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, statusFilter]);

  async function loadTasks() {
    try {
      setLoading(true);
      setLoadError('');
      const res = await todoApi.getTeamTasks(orgSlug, { status: statusFilter, page: 1, limit: PAGE_SIZE });
      if (res.success) {
        setTasks(res.tasks || []);
        setPagination(res.pagination || null);
      } else {
        setLoadError(res.error || 'Could not load team tasks.');
      }
    } catch (err) {
      console.error('Team tasks load error:', err);
      setLoadError(err?.message || 'Could not load team tasks.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!pagination?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await todoApi.getTeamTasks(orgSlug, {
        status: statusFilter, page: pagination.page + 1, limit: pagination.limit || PAGE_SIZE,
      });
      if (res.success) {
        // A task assigned while paging shifts every later row down one, so
        // dedupe rather than risk showing the same card twice.
        setTasks((prev) => {
          const seen = new Set(prev.map((t) => t._id));
          return [...prev, ...(res.tasks || []).filter((t) => !seen.has(t._id))];
        });
        setPagination(res.pagination || null);
      }
    } catch (err) {
      console.error('Team tasks load-more error:', err);
      showToast(err?.message || 'Could not load more tasks', 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreateTask(taskData) {
    try {
      const res = await todoApi.createTask(orgSlug, taskData);
      if (res.success) {
        showToast(taskData.assigneeEmployeeId ? 'Task assigned' : 'Task created', 'success');
        setShowCreateModal(false);
        loadTasks();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create task', 'error');
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
    } catch (err) {
      showToast(err.message || 'Failed to update task', 'error');
    }
  }

  async function handleToggleStatus(task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    try {
      await todoApi.updateTask(orgSlug, task._id, { status: newStatus });
      loadTasks();
    } catch (err) {
      showToast(err.message || 'Failed to update task', 'error');
    }
  }

  async function handleSetStatus(task, status) {
    try {
      await todoApi.updateTask(orgSlug, task._id, { status });
      showToast(status === 'in-progress' ? 'Marked in progress' : 'Moved back to pending', 'success');
      loadTasks();
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
      loadTasks();
    } catch (err) {
      showToast(err.message || 'Could not stop the repeat', 'error');
    }
  }

  async function handleDeleteTask(id) {
    try {
      const res = await todoApi.deleteTask(orgSlug, id);
      if (res.success) {
        showToast('Task deleted', 'success');
        setTasks(prev => prev.filter(t => t._id !== id));
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete task', 'error');
    }
  }

  // Overdue = due DATE has passed (same boundary as TaskCard's "Xd overdue"
  // chips and the server's overdue filter) — not raw timestamp comparison.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdueCount = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < startOfToday
  ).length;

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 940 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} style={{ color: 'var(--brand)' }} />
            Team Tasks
          </span>
        }
        sub={
          <>
            Tasks you've assigned to your team
            {overdueCount > 0 && <span style={{ color: 'var(--danger)' }}> — {overdueCount} overdue</span>}
          </>
        }
        actions={canAssign && (
          <Button iconLeft={<Plus size={15} />} onClick={() => setShowCreateModal(true)}>
            Assign Task
          </Button>
        )}
        style={{ marginBottom: 14 }}
      />

      <Tabs tabs={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} style={{ marginBottom: 14 }} />

      {loadError && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">
            {loadError}{' '}
            <Button variant="ghost" size="sm" onClick={loadTasks}>Retry</Button>
          </Callout>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : loadError ? null : tasks.length === 0 ? (
        canAssign ? (
          <EmptyState icon={<Users size={22} />} title="No assigned tasks yet">
            Use "Assign Task" to delegate work — assignees are notified and you can track progress here.
          </EmptyState>
        ) : (
          <EmptyState icon={<Users size={22} />} title="Nothing here yet">
            Task assignment is available to managers and admins. Tasks assigned to you appear in All Tasks.
          </EmptyState>
        )
      ) : (
        <Panel flush>
          {tasks.map((task, i) => (
            <div key={task._id} style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
              <TaskCardV2
                task={task}
                orgSlug={orgSlug}
                teamView
                onToggleStatus={() => handleToggleStatus(task)}
                onEdit={() => setEditingTask(task)}
                onDelete={() => handleDeleteTask(task._id)}
                onEndSeries={() => handleEndSeries(task)}
                onSetStatus={(st) => handleSetStatus(task, st)}
              />
            </div>
          ))}
        </Panel>
      )}

      {/* The overdue chip above counts the tasks in memory, so say plainly
          when that is not all of them rather than quietly understating. */}
      {pagination && pagination.total > tasks.length && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, flexWrap: 'wrap', padding: '14px 12px',
        }}>
          <span style={{ font: '400 12px/1.4 var(--font)', color: 'var(--fg-4)' }}>
            Showing {tasks.length} of {pagination.total} assigned tasks — counts above cover these only
          </span>
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore || !pagination.hasMore}>
            {loadingMore ? 'Loading…' : `Load ${Math.min(pagination.limit || PAGE_SIZE, pagination.total - tasks.length)} more`}
          </Button>
        </div>
      )}

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
