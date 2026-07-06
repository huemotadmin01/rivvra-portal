import { useState } from 'react';
import { Sparkles, Check, X, ChevronDown, ChevronUp, Clock, AlertTriangle } from 'lucide-react';

function dueInfo(d) {
  if (!d) return null;
  const date = new Date(d);
  const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  if (days === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, overdue: false };
}

function formatEmailDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SuggestionsBanner({ suggestions, onAccept, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  if (!suggestions || suggestions.length === 0) return null;

  async function handleAcceptAll() {
    await Promise.all(suggestions.map(s => onAccept(s._id)));
  }

  async function handleDismissAll() {
    await Promise.all(suggestions.map(s => onDismiss(s._id)));
  }

  return (
    <div className="mb-6 bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Sparkles size={16} className="text-amber-400" />
          </div>
          <span className="text-sm font-medium text-amber-300">
            AI found {suggestions.length} new task{suggestions.length > 1 ? 's' : ''} from your inbox
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAcceptAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Check size={12} />
            Accept All
          </button>
          <button
            onClick={handleDismissAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-lg text-xs font-medium transition-colors"
          >
            <X size={12} />
            Dismiss All
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-dark-400 hover:text-white"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-amber-500/10 divide-y divide-dark-800/50">
          {suggestions.map(task => {
            const due = dueInfo(task.dueDate);
            const emailDate = formatEmailDate(task.aiMeta?.emailDate);
            return (
            <div key={task._id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-dark-400 truncate mt-0.5">{task.description}</p>
                )}
                {task.aiMeta?.emailFrom && (
                  <p className="text-[11px] text-dark-500 mt-0.5">
                    From: {task.aiMeta.emailFrom}{emailDate ? ` — ${emailDate}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-3">
                {due && (
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                    due.overdue ? 'bg-red-500/10 text-red-400' : 'bg-teal-500/10 text-teal-400'
                  }`}>
                    {due.overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                    {due.text}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                  task.priority === 'high' ? 'bg-red-500/10 text-red-400' :
                  task.priority === 'low' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-amber-500/10 text-amber-400'
                }`}>
                  {task.priority}
                </span>
                <button
                  onClick={() => onAccept(task._id)}
                  className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
                  title="Accept"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => onDismiss(task._id)}
                  className="p-1 text-dark-400 hover:bg-dark-700 rounded"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
