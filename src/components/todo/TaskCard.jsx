import {
  CheckCircle2, Circle, Clock, AlertTriangle, Sparkles, Pencil, Trash2,
  Check, X, Mail,
} from 'lucide-react';

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
  selected,
  onSelect,
  onToggleStatus,
  onEdit,
  onDelete,
  onAccept,
  onDismiss,
  showCheckbox,
}) {
  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const dueInfo = formatDate(task.dueDate);
  const isAiSuggestion = task.source === 'ai' && !task.aiMeta?.accepted;

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

        {/* Edit */}
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
        )}

        {/* Delete */}
        {onDelete && (
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
