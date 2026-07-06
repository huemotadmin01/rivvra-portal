import { useState, useEffect } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Sparkles, Pencil, Trash2,
  Check, X, Mail, Wand2, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Repeat, UserCheck, ArrowRight,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';

const PRIORITY_STYLES = {
  high: 'bg-red-500/10 text-red-400',
  medium: 'bg-amber-500/10 text-amber-400',
  low: 'bg-blue-500/10 text-blue-400',
};

const STATUS_ICONS = {
  pending: Circle,
  'in-progress': Clock,
  done: CheckCircle2,
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

export default function TaskCard({
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
    // Optimistic update; server failure just reverts on next reload.
    setGuide(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? { ...s, done: newDone } : s)),
    }));
    todoApi.toggleGuideStep(orgSlug, task._id, index, newDone).catch(() => {});
  }

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 hover:bg-dark-800/50 transition-colors ${
      task.status === 'done' ? 'opacity-60' : ''
    }`}>
      {/* Select checkbox */}
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected || false}
          onChange={onSelect}
          className="mt-1 w-4 h-4 rounded border-dark-600 text-teal-500 focus:ring-teal-500 bg-dark-800"
        />
      )}

      {/* Status toggle */}
      <button
        onClick={onToggleStatus}
        className={`mt-0.5 flex-shrink-0 transition-colors ${
          task.status === 'done'
            ? 'text-emerald-400 hover:text-emerald-300'
            : 'text-dark-500 hover:text-teal-400'
        }`}
      >
        <StatusIcon size={20} />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${
            task.status === 'done' ? 'line-through text-dark-500' : 'text-white'
          }`}>
            {task.title}
          </span>

          {/* Priority badge */}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority}
          </span>

          {/* AI badge */}
          {task.source === 'ai' && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
              isAiSuggestion
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-purple-500/10 text-purple-400'
            }`}>
              <Sparkles size={10} />
              {isAiSuggestion ? 'Suggested' : 'AI'}
            </span>
          )}

          {/* Recurring badge */}
          {task.recurrence?.freq && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-400" title={`Repeats ${task.recurrence.freq}`}>
              <Repeat size={10} />
              {task.recurrence.freq}
            </span>
          )}

          {/* Assignment badge */}
          {isDelegated && (
            teamView ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400" title="Assigned to">
                <ArrowRight size={10} />
                {task.assigneeName || 'Assignee'}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400" title="Assigned to you">
                <UserCheck size={10} />
                by {task.assignedByName || 'Manager'}
              </span>
            )
          )}

          {/* Labels */}
          {task.labels?.map(label => (
            <span key={label} className="px-1.5 py-0.5 rounded text-[10px] bg-dark-700 text-dark-300">
              {label}
            </span>
          ))}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-dark-400 mt-0.5 line-clamp-1">{task.description}</p>
        )}

        {/* Source email info for AI tasks */}
        {task.source === 'ai' && task.aiMeta?.emailSubject && (
          <div className="flex items-center gap-1 mt-1 text-[11px] text-dark-500">
            <Mail size={10} />
            <span className="truncate">From: {task.aiMeta.emailFrom} — {task.aiMeta.emailSubject}</span>
          </div>
        )}

        {/* Due date */}
        {dueInfo && (
          <span className={`inline-flex items-center gap-1 mt-1 text-xs ${
            dueInfo.overdue ? 'text-red-400' : 'text-dark-400'
          }`}>
            {dueInfo.overdue && <AlertTriangle size={12} />}
            <Clock size={12} />
            {dueInfo.text}
          </span>
        )}

        {/* AI guide checklist */}
        {guide?.steps?.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setGuideOpen(!guideOpen)}
              className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 font-medium"
            >
              <Wand2 size={11} />
              AI Guide ({guideDone}/{guide.steps.length})
              {guideOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {guideOpen && (
              <div className="mt-1.5 pl-1 space-y-1 border-l-2 border-teal-500/20">
                {guide.steps.map((step, i) => (
                  <label key={i} className="flex items-start gap-2 pl-2 cursor-pointer group/step">
                    <input
                      type="checkbox"
                      checked={!!step.done}
                      disabled={teamView}
                      onChange={() => handleToggleStep(i)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-dark-600 text-teal-500 focus:ring-teal-500 bg-dark-800 flex-shrink-0"
                    />
                    <span className={`text-xs leading-snug ${
                      step.done ? 'line-through text-dark-500' : 'text-dark-300 group-hover/step:text-dark-200'
                    }`}>
                      {step.text}
                    </span>
                  </label>
                ))}
                {!teamView && (
                  <button
                    onClick={() => handleGenerateGuide(true)}
                    disabled={generating}
                    className="flex items-center gap-1 pl-2 text-[10px] text-dark-500 hover:text-dark-300 disabled:opacity-50"
                    title="Regenerate guide"
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
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* AI accept/dismiss */}
        {onAccept && (
          <button
            onClick={onAccept}
            className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded"
            title="Accept suggestion"
          >
            <Check size={14} />
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1.5 text-dark-400 hover:bg-dark-700 rounded"
            title="Dismiss suggestion"
          >
            <X size={14} />
          </button>
        )}

        {/* Guide me (AI coach) */}
        {canGuide && !guide?.steps?.length && (
          <button
            onClick={() => handleGenerateGuide(false)}
            disabled={generating}
            className="p-1.5 text-teal-400 hover:bg-teal-500/10 rounded disabled:opacity-50"
            title="Guide me — AI breaks this task into simple steps"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          </button>
        )}

        {/* Edit */}
        {onEdit && !lockedForAssignee && (
          <button
            onClick={onEdit}
            className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
        )}

        {/* Delete */}
        {onDelete && !lockedForAssignee && (
          <button
            onClick={onDelete}
            className="p-1.5 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
