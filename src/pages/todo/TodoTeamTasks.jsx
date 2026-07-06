import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import useTodoAssign from '../../hooks/useTodoAssign';
import TaskCard from '../../components/todo/TaskCard';
import TaskFormModal from '../../components/todo/TaskFormModal';
import { Loader2, Plus, Users } from 'lucide-react';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

export default function TodoTeamTasks() {
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

  const overdueCount = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate).getTime() < Date.now()
  ).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-teal-400" />
            Team Tasks
          </h1>
          <p className="text-sm text-dark-400 mt-1">
            Tasks you've assigned to your team
            {overdueCount > 0 && <span className="text-red-400"> — {overdueCount} overdue</span>}
          </p>
        </div>
        {canAssign && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Assign Task
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-dark-800">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              statusFilter === tab.key
                ? 'border-teal-500 text-white'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-dark-900 rounded-xl border border-dark-800 px-6 py-12 text-center">
          <Users className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          {canAssign ? (
            <>
              <p className="text-sm text-dark-300">No assigned tasks yet</p>
              <p className="text-xs text-dark-500 mt-1">
                Use "Assign Task" to delegate work — assignees are notified and you can track progress here.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-dark-300">Nothing here yet</p>
              <p className="text-xs text-dark-500 mt-1">
                Task assignment is available to managers and admins. Tasks assigned to you appear in All Tasks.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-dark-900 rounded-xl border border-dark-800 divide-y divide-dark-800">
          {tasks.map(task => (
            <TaskCard
              key={task._id}
              task={task}
              orgSlug={orgSlug}
              teamView
              onToggleStatus={() => handleToggleStatus(task)}
              onEdit={() => setEditingTask(task)}
              onDelete={() => handleDeleteTask(task._id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <TaskFormModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateTask}
          canAssign={canAssign}
          assignableEmployees={assignableEmployees}
        />
      )}
      {editingTask && (
        <TaskFormModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleUpdateTask}
        />
      )}
    </div>
  );
}
