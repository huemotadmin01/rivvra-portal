import { useState } from 'react';
import { X, Mail, Users, Repeat, Bell } from 'lucide-react';
import { useCompany } from '../../context/CompanyContext';
import ComboSelect from '../ComboSelect';

const REMINDER_LABELS = { 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 1440: '1 day' };

// Employee → picker label; email fallback so a missing fullName never
// renders a blank row.
function employeeLabel(emp) {
  const name = emp.fullName || emp.email || 'Unnamed';
  return emp.designation ? `${name} — ${emp.designation}` : name;
}

export default function TaskFormModal({ task, onClose, onSave, canAssign, assignableEmployees }) {
  const isEdit = !!task;
  const { currentCompany } = useCompany();
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
  const [recurrenceFreq, setRecurrenceFreq] = useState(task?.recurrence?.freq || '');
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState('');
  const [saving, setSaving] = useState(false);

  // Assignment is create-only (reassign by deleting and recreating)
  const showAssign = !isEdit && canAssign && assignableEmployees?.length > 0;

  // Plain-language recap so nobody has to guess how repeat/reminder/assignment
  // combine — shown live above the submit button.
  function summaryText() {
    const parts = [];
    parts.push(recurrenceFreq ? `Repeats ${recurrenceFreq}` : 'One-time task');
    if (dueDate) {
      const d = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      parts.push(`${recurrenceFreq ? 'first one ' : ''}due ${d}`);
    }
    if (reminderEnabled && dueDate) parts.push(`reminder ${REMINDER_LABELS[reminderMinutes] || ''} before due`);
    if (showAssign) {
      const emp = assignableEmployees.find(e => e._id === assigneeEmployeeId);
      parts.push(assigneeEmployeeId ? `assigned to ${emp?.fullName || emp?.email || 'employee'}` : 'for myself');
    }
    return parts.join(' · ');
  }

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
      // A reminder can only fire relative to a due date — never save one without.
      reminder: { enabled: reminderEnabled && !!dueDate, minutesBefore: reminderMinutes },
      recurrence: recurrenceFreq ? { freq: recurrenceFreq } : null,
    };

    if (isEdit) {
      taskData.status = status;
    } else if (assigneeEmployeeId) {
      taskData.assigneeEmployeeId = assigneeEmployeeId;
    }

    try {
      await onSave(taskData);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
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

          {/* Schedule */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-500 mb-2">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-dark-400 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
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
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="flex items-center gap-1 text-sm text-dark-400 mb-1">
                  <Repeat size={12} /> Repeat
                </label>
                <select
                  value={recurrenceFreq}
                  onChange={e => setRecurrenceFreq(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
                >
                  <option value="">Doesn't repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                {recurrenceFreq && !dueDate ? (
                  <p className="text-[10px] text-amber-400 mt-1">Set a due date — repeats are scheduled from it</p>
                ) : (
                  <p className="text-[10px] text-dark-500 mt-1">
                    {recurrenceFreq
                      ? `A fresh copy is created ${recurrenceFreq} once this one is done or its date passes`
                      : 'This task happens once'}
                  </p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-1 text-sm text-dark-400 mb-1">
                  <Bell size={12} /> Reminder
                </label>
                <select
                  value={reminderEnabled && dueDate ? String(reminderMinutes) : ''}
                  onChange={e => {
                    const v = e.target.value;
                    setReminderEnabled(!!v);
                    if (v) setReminderMinutes(parseInt(v));
                  }}
                  disabled={!dueDate}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500 disabled:opacity-50"
                >
                  <option value="">No reminder</option>
                  <option value="15">15 minutes before due</option>
                  <option value="30">30 minutes before due</option>
                  <option value="60">1 hour before due</option>
                  <option value="1440">1 day before due</option>
                </select>
                <p className="text-[10px] text-dark-500 mt-1">
                  {dueDate ? 'Sends a notification before the due date' : 'Set a due date to enable reminders'}
                </p>
              </div>
            </div>
          </div>

          {/* Assign to (create-only, managers/admins) */}
          {showAssign && (
            <div
              // ComboSelect is a text input inside this <form> — Enter while
              // searching must not submit the task prematurely.
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
            >
              <label className="flex items-center gap-1 text-sm text-dark-400 mb-1">
                <Users size={12} /> Assign to
              </label>
              <ComboSelect
                value={assigneeEmployeeId}
                displayValue={
                  assigneeEmployeeId
                    ? employeeLabel(assignableEmployees.find(e => e._id === assigneeEmployeeId) || {})
                    : 'Myself'
                }
                options={[
                  { _id: '', name: 'Myself' },
                  ...assignableEmployees.map(emp => ({ _id: emp._id, name: employeeLabel(emp) })),
                ]}
                onChange={(id) => setAssigneeEmployeeId(id)}
                disableCreate
                placeholder="Search employee..."
              />
              <p className="text-[10px] text-dark-500 mt-1">
                They'll be notified in-app and by email, and the task appears in their All Tasks.
                {currentCompany?.name
                  ? ` Showing ${currentCompany.name} employees with To-Do access — someone missing? Switch company in the top bar or check their app access.`
                  : ' Only same-company employees with To-Do app access are listed.'}
              </p>
            </div>
          )}

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

          {/* Plain-language recap */}
          <div className="text-xs text-dark-300 bg-dark-800/50 border border-dark-700/60 rounded-lg px-3 py-2">
            {summaryText()}
          </div>

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
              disabled={saving || !title.trim() || (!!recurrenceFreq && !dueDate)}
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
