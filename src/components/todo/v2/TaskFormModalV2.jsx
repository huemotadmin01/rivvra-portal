// ============================================================================
// TaskFormModalV2.jsx — To-Do create/edit dialog on ds (phase 6a)
// ============================================================================
// Copied from components/todo/TaskFormModal.jsx. Every rule about what gets
// saved is unchanged: assignment is create-only, status is edit-only, a
// reminder is never saved without a due date, and a recurrence without a due
// date keeps submit disabled.
//
// Presentation moves to ds: the hand-rolled scrim/panel becomes `Modal`, the
// dark inputs become `Field` + `Input`/`Textarea`/`Select`, and the legacy
// `ComboSelect` assignee picker becomes ds `ComboBox` — which keeps the
// substring search and swallows Enter itself, so the legacy `onKeyDown`
// guard around the picker is no longer needed.
//
// The form lives in the Modal body and the submit button in its footer, wired
// by `form="todo-task-form"` so the actions stay pinned while a long form
// scrolls.
// ============================================================================

import { useState } from 'react';
import { CheckSquare, Mail, Users, Repeat, Bell } from 'lucide-react';
import { useCompany } from '../../../context/CompanyContext';
import { Button, ComboBox, Field, Input, Modal, Select, Textarea } from '../../ds';

const FONT = "'Inter', system-ui, sans-serif";
const FORM_ID = 'todo-task-form';

const REMINDER_LABELS = { 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 1440: '1 day' };

export default function TaskFormModalV2({ task, onClose, onSave, canAssign, assignableEmployees }) {
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

  const sectionLabel = {
    font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.08em',
    color: 'var(--fg-4)', marginBottom: 10,
  };
  const hint = { font: `450 11px/1.45 ${FONT}`, color: 'var(--fg-4)', marginTop: 5 };
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      tone="brand"
      icon={<CheckSquare size={16} />}
      title={isEdit ? 'Edit Task' : 'New Task'}
      sub={isEdit ? 'Update the task and how it is scheduled.' : 'Capture what needs doing, and when.'}
      footer={
        <>
          <span style={{ flex: 1, minWidth: 0, font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>
            {summaryText()}
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={saving || !title.trim() || (!!recurrenceFreq && !dueDate)}
          >
            {saving ? 'Saving…' : isEdit ? 'Update Task' : 'Create Task'}
          </Button>
        </>
      }
    >
      {/* Source email info (read-only for AI tasks) */}
      {task?.source === 'ai' && task?.aiMeta?.emailSubject && (
        <div style={{
          marginBottom: 16, padding: '10px 12px', borderRadius: 'var(--r-2)',
          background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `500 11px/1.2 ${FONT}`, color: 'var(--fg-4)', marginBottom: 5 }}>
            <Mail size={12} />
            Source Email
          </div>
          <p style={{ font: `500 13px/1.45 ${FONT}`, color: 'var(--fg)' }}>{task.aiMeta.emailSubject}</p>
          <p style={{ font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>
            From: {task.aiMeta.emailFrom}
            {task.aiMeta.emailDate && (
              <> — {new Date(task.aiMeta.emailDate).toLocaleDateString()}</>
            )}
          </p>
        </div>
      )}

      <form id={FORM_ID} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Title" required htmlFor="todo-title">
          <Input
            id="todo-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="What needs to be done?"
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor="todo-desc">
          <Textarea
            id="todo-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Add details…"
          />
        </Field>

        {/* Schedule */}
        <section>
          <p style={sectionLabel}>Schedule</p>
          <div style={grid}>
            <Field label="Due Date" htmlFor="todo-due">
              <Input id="todo-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </Field>
            <Field label="Priority" htmlFor="todo-priority">
              <Select id="todo-priority" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </Field>
          </div>
          <div style={{ ...grid, marginTop: 12 }}>
            <div>
              <Field
                label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Repeat size={12} /> Repeat</span>}
                htmlFor="todo-repeat"
              >
                <Select id="todo-repeat" value={recurrenceFreq} onChange={e => setRecurrenceFreq(e.target.value)}>
                  <option value="">Doesn't repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </Field>
              {recurrenceFreq && !dueDate ? (
                <p style={{ ...hint, color: 'var(--warn)' }}>Set a due date — repeats are scheduled from it</p>
              ) : (
                <p style={hint}>
                  {recurrenceFreq
                    ? `A fresh copy is created ${recurrenceFreq} once this one is done or its date passes`
                    : 'This task happens once'}
                </p>
              )}
            </div>
            <div>
              <Field
                label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Bell size={12} /> Reminder</span>}
                htmlFor="todo-reminder"
              >
                <Select
                  id="todo-reminder"
                  value={reminderEnabled && dueDate ? String(reminderMinutes) : ''}
                  onChange={e => {
                    const v = e.target.value;
                    setReminderEnabled(!!v);
                    if (v) setReminderMinutes(parseInt(v));
                  }}
                  disabled={!dueDate}
                >
                  <option value="">No reminder</option>
                  <option value="15">15 minutes before due</option>
                  <option value="30">30 minutes before due</option>
                  <option value="60">1 hour before due</option>
                  <option value="1440">1 day before due</option>
                </Select>
              </Field>
              <p style={hint}>
                {dueDate ? 'Sends a notification before the due date' : 'Set a due date to enable reminders'}
              </p>
            </div>
          </div>
        </section>

        {/* Assign to (create-only, managers/admins) */}
        {showAssign && (
          <div>
            <Field
              label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Users size={12} /> Assign to</span>}
              htmlFor="todo-assignee"
            >
              <ComboBox
                id="todo-assignee"
                aria-label="Assign to"
                value={assigneeEmployeeId}
                onChange={setAssigneeEmployeeId}
                emptyLabel="Myself"
                placeholder="Search employee…"
                options={[
                  { value: '', label: 'Myself' },
                  ...assignableEmployees.map(emp => ({
                    value: emp._id,
                    label: emp.fullName || emp.email || 'Unnamed',
                    sub: emp.designation || emp.email || undefined,
                  })),
                ]}
              />
            </Field>
            <p style={hint}>
              They'll be notified in-app and by email, and the task appears in their All Tasks.
              {currentCompany?.name
                ? ` Showing ${currentCompany.name} employees with To-Do access — someone missing? Switch company in the top bar or check their app access.`
                : ' Only same-company employees with To-Do app access are listed.'}
            </p>
          </div>
        )}

        <Field label="Labels" hint="Comma-separated." htmlFor="todo-labels">
          <Input
            id="todo-labels"
            type="text"
            value={labels}
            onChange={e => setLabels(e.target.value)}
            placeholder="e.g. Client, Urgent, Internal"
          />
        </Field>

        {/* Status (edit only) */}
        {isEdit && (
          <Field label="Status" htmlFor="todo-status">
            <Select id="todo-status" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  );
}
