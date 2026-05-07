import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import TaskCard from '../../components/todo/TaskCard';
import TaskFormModal from '../../components/todo/TaskFormModal';
import {
  Loader2, Plus, Search, Filter, CheckSquare, Trash2, CheckCircle2,
} from 'lucide-react';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
  { key: 'ai', label: 'AI Suggestions' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Newest First' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'priority', label: 'Priority' },
];

export default function TodoTasks() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [search, setSearch] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (orgSlug) loadTasks();
  }, [orgSlug, statusFilter, priorityFilter, sortBy, page]);

  async function loadTasks() {
    try {
      setLoading(true);
      const params = { page, limit: 50, sort: sortBy };
      if (statusFilter === 'ai') {
        params.source = 'ai';
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

  async function handleAcceptAiTask(taskId) {
    try {
      await todoApi.acceptAiTask(orgSlug, taskId);
      showToast('Task accepted', 'success');
      setTasks(prev => prev.map(t =>
        t._id === taskId ? { ...t, aiMeta: { ...t.aiMeta, accepted: true } } : t
      ));
    } catch {
      showToast('Failed to accept', 'error');
    }
  }

  async function handleDismissAiTask(taskId) {
    try {
      await todoApi.dismissAiTask(orgSlug, taskId);
      setTasks(prev => prev.filter(t => t._id !== taskId));
    } catch {
      showToast('Failed to dismiss', 'error');
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

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">All Tasks</h1>
          <p className="text-dark-400 mt-1">{total} total tasks</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 mb-4 border-b border-dark-800">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-dark-400 hover:text-dark-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Filters Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            showFilters || priorityFilter
              ? 'border-teal-500 text-teal-400 bg-teal-500/10'
              : 'border-dark-700 text-dark-400 hover:text-dark-300'
          }`}
        >
          <Filter size={16} />
          Filters
        </button>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-dark-400">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkMarkDone}
              className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
            >
              <CheckCircle2 size={14} />
              Mark Done
            </button>
          </div>
        )}
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-dark-900 rounded-lg border border-dark-800">
          <select
            value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
            className="bg-dark-800 border border-dark-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500"
          >
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-dark-800 border border-dark-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-dark-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-dark-900 rounded-xl border border-dark-800">
          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center text-dark-500">
              <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">No tasks found</p>
              <p className="text-sm mt-1">Create a task or adjust your filters</p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-dark-800">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredTasks.length && filteredTasks.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-dark-600 text-teal-500 focus:ring-teal-500 bg-dark-800"
                />
                <span className="text-xs text-dark-500">Select all</span>
              </div>
              <div className="divide-y divide-dark-800">
                {filteredTasks.map(task => (
                  <TaskCard
                    key={task._id}
                    task={task}
                    selected={selectedIds.has(task._id)}
                    onSelect={() => toggleSelect(task._id)}
                    onToggleStatus={() => handleToggleStatus(task)}
                    onEdit={() => setEditingTask(task)}
                    onDelete={() => handleDeleteTask(task._id)}
                    onAccept={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleAcceptAiTask(task._id) : null}
                    onDismiss={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleDismissAiTask(task._id) : null}
                    showCheckbox
                  />
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-dark-800">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm text-dark-400 hover:text-white disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-sm text-dark-400">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm text-dark-400 hover:text-white disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <TaskFormModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateTask}
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
