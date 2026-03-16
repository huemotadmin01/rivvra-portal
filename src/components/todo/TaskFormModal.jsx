import { useState } from 'react';
import { X, Mail } from 'lucide-react';

export default function TaskFormModal({ task, onClose, onSave }) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
  );
  const [labels, setLabels] = useState(task?.labels?.join(', ') || '');
  const [reminderEnabled, setReminderEnabled] = useState(task?.reminder?.enabled || false);
  const [reminderMinutes, setReminderMinutes] = useState(task?.reminder?.minutesBefore || 30);
  const [status, setStatus] = useState(task?.status || 'pending');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const taskData = {
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate || null,
      labels: labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [],
      reminder: { enabled: reminderEnabled, minutesBefore: reminderMinutes },
    };

    if (isEdit) {
      taskData.status = status;
    }

    try {
      await onSave(taskData);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-dark-900 rounded-xl border border-dark-800 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-800">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Task' : 'New Task'}
          </h2>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Source email info (read-only for AI tasks) */}
        {task?.source === 'ai' && task?.aiMeta?.emailSubject && (
          <div className="mx-4 mt-4 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
            <div className="flex items-center gap-2 text-xs text-dark-400 mb-1">
              <Mail size={12} />
              Source Email
            </div>
            <p className="text-sm text-white">{task.aiMeta.emailSubject}</p>
            <p className="text-xs text-dark-400 mt-0.5">
              From: {task.aiMeta.emailFrom}
              {task.aiMeta.emailDate && (
                <> — {new Date(task.aiMeta.emailDate).toLocaleDateString()}</>
              )}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm text-dark-400 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-dark-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Add details..."
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>

          {/* Priority & Due Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-dark-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-dark-400 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-sm text-dark-400 mb-1">Labels (comma-separated)</label>
            <input
              type="text"
              value={labels}
              onChange={e => setLabels(e.target.value)}
              placeholder="e.g. Client, Urgent, Internal"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Reminder */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={e => setReminderEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-dark-600 text-teal-500 focus:ring-teal-500 bg-dark-800"
              />
              <span className="text-sm text-dark-300">Reminder</span>
            </label>
            {reminderEnabled && (
              <select
                value={reminderMinutes}
                onChange={e => setReminderMinutes(parseInt(e.target.value))}
                className="px-2 py-1 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
              >
                <option value={15}>15 min before</option>
                <option value={30}>30 min before</option>
                <option value={60}>1 hour before</option>
                <option value={1440}>1 day before</option>
              </select>
            )}
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div>
              <label className="block text-sm text-dark-400 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
              >
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
