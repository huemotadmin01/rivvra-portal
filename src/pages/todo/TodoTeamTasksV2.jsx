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
import { Button, EmptyState, PageHeader, Panel, Spinner, Tabs } from '../../components/ds';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

export default function TodoTeamTasksV2() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
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
      const res = await todoApi.getTeamTasks(orgSlug, { status: statusFilter });
      if (res.success) setTasks(res.tasks || []);
    } catch (err) {
      console.error('Team tasks load error:', err);
    } finally {
      setLoading(false);
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

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : tasks.length === 0 ? (
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
              />
            </div>
          ))}
        </Panel>
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
