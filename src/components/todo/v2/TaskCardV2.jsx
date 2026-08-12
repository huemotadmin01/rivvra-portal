// ============================================================================
// TaskCardV2.jsx — To-Do task row on ds (phase 6a)
// ============================================================================
// Copied from components/todo/TaskCard.jsx. The data flow is unchanged: the
// same guide optimistic-update-then-revert, the same `lockedForAssignee`
// gating, the same overdue boundary. Only presentation moves — dark Tailwind
// utilities become ds primitives and semantic tokens.
//
// App-layer, not a ds primitive: it knows what a task, an AI suggestion and a
// delegated assignment are. Built only from ds, the same layering as
// shared/v2/ActivityPanelV2.
//
// One deliberate behaviour change: the row actions no longer fade in on hover.
// The legacy rule was `sm:opacity-0 sm:group-hover:opacity-100`, which inline
// styles cannot express without a JS hover flag, and which the mobile pass had
// already overridden below `sm`. They now render at `--fg-4` at all widths.
// ============================================================================

import { useState, useEffect } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Sparkles, Pencil, Trash2,
  Check, X, Mail, Wand2, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Repeat, UserCheck, ArrowRight,
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import todoApi from '../../../utils/todoApi';
import { Chip } from '../../ds';

const FONT = "'Inter', system-ui, sans-serif";

const PRIORITY_TONES = { high: 'danger', medium: 'warn', low: 'info' };

const STATUS_ICONS = {
  pending: Circle,
  'in-progress': Clock,
  done: CheckCircle2,
};

const iconBtn = {
  width: 28, height: 28, display: 'grid', placeItems: 'center', flexShrink: 0,
  border: 'none', background: 'transparent', borderRadius: 'var(--r-1)',
  color: 'var(--fg-4)', cursor: 'pointer',
};

function formatDate(d) {
  if (!d) return null;
  const date = new Date(d);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  if (days === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

export default function TaskCardV2({
  task,
  orgSlug,
  selected,
  onSelect,
  onToggleStatus,
  onEdit,
  onDelete,
  onAccept,
  onDismiss,
  showCheckbox,
  teamView,
}) {
  const { showToast } = useToast();
  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const dueInfo = formatDate(task.dueDate);
  const isAiSuggestion = task.source === 'ai' && !task.aiMeta?.accepted;
  const isDone = task.status === 'done';

  // AI guide ("Guide me" coach) — kept in local state so generating/toggling
  // steps doesn't force a full list reload.
  const [guide, setGuide] = useState(task.guide || null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  useEffect(() => { setGuide(task.guide || null); }, [task.guide]);

  // The guide belongs to the task owner — in the assigner's team view it is
  // read-only (generate/toggle routes are owner-scoped).
  const canGuide = !!orgSlug && !isAiSuggestion && !teamView;
  const guideDone = guide?.steps?.filter(s => s.done).length || 0;

  // Delegated task in the assignee's list: content edits/deletes belong to the
  // assigner (server enforces; hide the buttons so users don't hit 403s).
  // `teamView` renders the assigner's perspective (Team Tasks tab).
  const isDelegated = task.assignedByUserId && task.assignedByUserId !== task.userId;
  const lockedForAssignee = isDelegated && !teamView;

  async function handleGenerateGuide(regenerate = false) {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await todoApi.generateGuide(orgSlug, task._id, regenerate);
      if (res.success && res.guide) {
        setGuide(res.guide);
        setGuideOpen(true);
      }
    } catch (err) {
      showToast(err.message || 'Could not generate a guide right now', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function handleToggleStep(index) {
    const newDone = !guide.steps[index].done;
    // Optimistic update; revert + toast if the server rejects it.
    setGuide(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? { ...s, done: newDone } : s)),
    }));
    todoApi.toggleGuideStep(orgSlug, task._id, index, newDone).catch(() => {
      setGuide(prev => ({
        ...prev,
        steps: prev.steps.map((s, i) => (i === index ? { ...s, done: !newDone } : s)),
      }));
      showToast('Could not save the step — please try again', 'error');
    });
  }

  // A done row is de-emphasised by muting the *title* (strikethrough, --fg-4)
  // rather than by dimming the whole row. The legacy card used `opacity-60` on
  // the container, which multiplies down through every descendant: measured in
  // light theme, a priority chip inside a done row came out at 2.39 against a
  // 4.5 floor, and the AI-guide link at 2.55. Opacity is not a colour, so no
  // palette remap can reach it — the dimming itself has to go.
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px',
    }}>
      {/* Select checkbox */}
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected || false}
          onChange={onSelect}
          aria-label={`Select ${task.title}`}
          style={{ marginTop: 4, width: 15, height: 15, flexShrink: 0, accentColor: 'var(--brand)', cursor: 'pointer' }}
        />
      )}

      {/* Status toggle */}
      <button
        type="button"
        onClick={onToggleStatus}
        aria-label={isDone ? 'Mark as pending' : 'Mark as done'}
        style={{
          ...iconBtn, width: 22, height: 22, marginTop: 1,
          color: isDone ? 'var(--brand)' : 'var(--fg-4)',
        }}
      >
        <StatusIcon size={19} />
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{
            font: `550 13px/1.45 ${FONT}`, minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere',
            color: isDone ? 'var(--fg-4)' : 'var(--fg)',
            textDecoration: isDone ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>

          {/* Priority badge */}
          <Chip tone={PRIORITY_TONES[task.priority] || 'neutral'} uppercase>{task.priority}</Chip>

          {/* AI badge */}
          {task.source === 'ai' && (
            <Chip tone={isAiSuggestion ? 'warn' : 'info'}>
              <Sparkles size={10} />
              {isAiSuggestion ? 'Suggested' : 'AI'}
            </Chip>
          )}

          {/* Recurring badge */}
          {task.recurrence?.freq && (
            <Chip tone="info" title={`Repeats ${task.recurrence.freq}`}>
              <Repeat size={10} />
              {task.recurrence.freq}
            </Chip>
          )}

          {/* Assignment badge */}
          {isDelegated && (
            teamView ? (
              <Chip tone="brand" title="Assigned to">
                <ArrowRight size={10} />
                {task.assigneeName || 'Assignee'}
              </Chip>
            ) : (
              <Chip tone="brand" title="Assigned to you">
                <UserCheck size={10} />
                by {task.assignedByName || 'Manager'}
              </Chip>
            )
          )}

          {/* Labels */}
          {task.labels?.map(label => (
            <Chip key={label} tone="neutral">{label}</Chip>
          ))}
        </div>

        {/* Description */}
        {task.description && (
          <p style={{
            font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.description}
          </p>
        )}

        {/* Source email info for AI tasks */}
        {task.source === 'ai' && task.aiMeta?.emailSubject && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginTop: 4,
            font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)',
          }}>
            <Mail size={10} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              From: {task.aiMeta.emailFrom} — {task.aiMeta.emailSubject}
            </span>
          </div>
        )}

        {/* Due date */}
        {dueInfo && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4,
            font: `450 11.5px/1.4 ${FONT}`,
            color: dueInfo.overdue ? 'var(--danger)' : 'var(--fg-3)',
          }}>
            {dueInfo.overdue && <AlertTriangle size={12} />}
            <Clock size={12} />
            {dueInfo.text}
          </span>
        )}

        {/* AI guide checklist */}
        {guide?.steps?.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setGuideOpen(!guideOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, border: 'none', padding: 0,
                background: 'transparent', cursor: 'pointer',
                font: `550 11px/1.2 ${FONT}`, color: 'var(--brand)',
              }}
            >
              <Wand2 size={11} />
              AI Guide ({guideDone}/{guide.steps.length})
              {guideOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {guideOpen && (
              <div style={{
                marginTop: 6, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 5,
                borderLeft: '2px solid var(--brand-soft)',
              }}>
                {guide.steps.map((step, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: teamView ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!step.done}
                      disabled={teamView}
                      onChange={() => handleToggleStep(i)}
                      style={{ marginTop: 2, width: 13, height: 13, flexShrink: 0, accentColor: 'var(--brand)' }}
                    />
                    <span style={{
                      font: `450 12px/1.45 ${FONT}`,
                      color: step.done ? 'var(--fg-4)' : 'var(--fg-2)',
                      textDecoration: step.done ? 'line-through' : 'none',
                    }}>
                      {step.text}
                    </span>
                  </label>
                ))}
                {!teamView && (
                  <button
                    type="button"
                    onClick={() => handleGenerateGuide(true)}
                    disabled={generating}
                    title="Regenerate guide"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, border: 'none', padding: 0,
                      background: 'transparent', cursor: 'pointer', opacity: generating ? 0.5 : 1,
                      font: `500 10.5px/1.2 ${FONT}`, color: 'var(--fg-4)',
                    }}
                  >
                    {generating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                    Regenerate
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {/* AI accept/dismiss */}
        {onAccept && (
          <button type="button" onClick={onAccept} title="Accept suggestion"
            style={{ ...iconBtn, color: 'var(--brand)' }}>
            <Check size={15} />
          </button>
        )}
        {onDismiss && (
          <button type="button" onClick={onDismiss} title="Dismiss suggestion" style={iconBtn}>
            <X size={15} />
          </button>
        )}

        {/* Guide me (AI coach) */}
        {canGuide && !guide?.steps?.length && (
          <button
            type="button"
            onClick={() => handleGenerateGuide(false)}
            disabled={generating}
            title="Guide me — AI breaks this task into simple steps"
            style={{ ...iconBtn, color: 'var(--brand)', opacity: generating ? 0.5 : 1 }}
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          </button>
        )}

        {/* Edit */}
        {onEdit && !lockedForAssignee && (
          <button type="button" onClick={onEdit} title="Edit" style={iconBtn}>
            <Pencil size={15} />
          </button>
        )}

        {/* Delete */}
        {onDelete && !lockedForAssignee && (
          <button type="button" onClick={onDelete} title="Delete"
            style={{ ...iconBtn, color: 'var(--danger)' }}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
