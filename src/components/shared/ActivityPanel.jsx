import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import activityApi from '../../utils/activityApi';
import { Check, Trash2, Calendar, Plus, Loader2, MessageSquare, ClipboardList, User } from 'lucide-react';

const TYPE_BADGES = {
  note:        'bg-dark-700 text-dark-300',
  call:        'bg-blue-500/10 text-blue-400',
  meeting:     'bg-purple-500/10 text-purple-400',
  email:       'bg-amber-500/10 text-amber-400',
  task:        'bg-emerald-500/10 text-emerald-400',
  onboarding:  'bg-rivvra-500/10 text-rivvra-400',
  offboarding: 'bg-orange-500/10 text-orange-400',
};

function ActivityItem({ activity, onToggle, onDelete, highlight }) {
  const isNote = activity.type === 'note';
  return (
    <div
      id={`activity-${activity._id}`}
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${activity.isDone ? 'opacity-50' : ''} ${
        highlight ? 'bg-rivvra-500/10 ring-1 ring-rivvra-500/40' : ''
      }`}
    >
      {/* Done toggle — hide for notes */}
      {!isNote ? (
        <button onClick={() => onToggle(activity._id, !activity.isDone)}
          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
            activity.isDone ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-dark-600 hover:border-dark-400'
          }`}>
          {activity.isDone && <Check size={10} />}
        </button>
      ) : (
        <MessageSquare size={14} className="text-dark-500 mt-0.5 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_BADGES[activity.type] || TYPE_BADGES.note}`}>
            {activity.type}
          </span>
          {activity.dueDate && (
            <span className="text-[10px] text-dark-500 flex items-center gap-0.5">
              <Calendar size={9} /> {new Date(activity.dueDate).toLocaleDateString()}
            </span>
          )}
          {activity.assignedToName && (
            <span className="text-[10px] text-dark-500 flex items-center gap-0.5">
              <User size={9} /> {activity.assignedToName}
            </span>
          )}
        </div>
        {activity.summary && <p className="text-xs text-dark-200 mt-0.5">{activity.summary}</p>}
        {activity.note && <p className="text-xs text-dark-400 mt-0.5 whitespace-pre-wrap">{activity.note}</p>}
        <p className="text-[10px] text-dark-600 mt-0.5">
          {activity.createdByName} · {new Date(activity.createdAt).toLocaleDateString()}
          {activity.isDone && activity.doneAt && ` · Done ${new Date(activity.doneAt).toLocaleDateString()}`}
        </p>
      </div>

      <button onClick={() => onDelete(activity._id)}
        className="opacity-0 group-hover:opacity-100 text-dark-600 hover:text-red-400 transition-opacity flex-shrink-0">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function ActivityForm({ mode, onSubmit, onCancel }) {
  const isNote = mode === 'note';
  const [form, setForm] = useState({
    type: isNote ? 'note' : 'call',
    summary: '',
    note: '',
    dueDate: '',
    assignedToName: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.summary.trim() && !form.note.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        type: isNote ? 'note' : form.type,
        summary: form.summary.trim() || null,
        note: form.note.trim() || null,
        dueDate: form.dueDate || null,
        assignedToName: form.assignedToName.trim() || null,
      });
      setForm({ type: isNote ? 'note' : 'call', summary: '', note: '', dueDate: '', assignedToName: '' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-3 space-y-2 bg-dark-900 rounded-lg p-3">
      {!isNote && (
        <div className="flex gap-2">
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 focus:outline-none">
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
            <option value="task">Task</option>
          </select>
          <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 focus:outline-none" />
        </div>
      )}
      <input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
        placeholder={isNote ? 'Note title (optional)' : 'Summary'}
        className="w-full bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-200 focus:outline-none placeholder:text-dark-500" />
      <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
        placeholder={isNote ? 'Write your note...' : 'Details (optional)'}
        rows={isNote ? 3 : 2}
        className="w-full bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-200 focus:outline-none min-h-[40px] placeholder:text-dark-500" />
      {!isNote && (
        <input value={form.assignedToName} onChange={e => setForm(f => ({ ...f, assignedToName: e.target.value }))}
          placeholder="Assigned to (name)"
          className="w-full bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-200 focus:outline-none placeholder:text-dark-500" />
      )}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel}
          className="px-2.5 py-1 text-[10px] text-dark-400 hover:text-dark-200 transition-colors">Cancel</button>
        <button type="submit" disabled={saving || (!form.summary.trim() && !form.note.trim())}
          className="px-3 py-1 text-[10px] bg-rivvra-500 hover:bg-rivvra-600 text-white rounded disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : isNote ? 'Log Note' : 'Schedule'}
        </button>
      </div>
    </form>
  );
}

/**
 * Unified activity panel for any entity.
 *
 * @param {string} orgSlug     - Organization slug
 * @param {string} entityType  - 'employee' | 'crm_opportunity' | 'crm_contact' | 'ats_application' | 'ats_job'
 * @param {string} entityId    - The entity's _id
 */
export default function ActivityPanel({ orgSlug, entityType, entityId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState(null); // null | 'note' | 'activity'
  const [highlightId, setHighlightId] = useState(null);
  const location = useLocation();
  const scrollDoneRef = useRef(false);

  const fetchActivities = async () => {
    if (!orgSlug || !entityType || !entityId) return;
    try {
      const res = await activityApi.list(orgSlug, entityType, entityId);
      if (res.success) {
        // Hide plan-linked activities — they are surfaced in the Launch Plan card
        const filtered = (res.activities || []).filter(a => !a.planInstanceId);
        setActivities(filtered);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchActivities(); }, [orgSlug, entityType, entityId]);

  // Scroll-to + highlight when navigated from My Activities dropdown
  useEffect(() => {
    if (loading || scrollDoneRef.current) return;
    const params = new URLSearchParams(location.search);
    const targetId = params.get('activityId');
    if (!targetId) return;
    if (!activities.some(a => a._id === targetId)) return;
    scrollDoneRef.current = true;
    setHighlightId(targetId);
    setTimeout(() => {
      const el = document.getElementById(`activity-${targetId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    // Fade highlight after a few seconds
    const t = setTimeout(() => setHighlightId(null), 3500);
    return () => clearTimeout(t);
  }, [loading, activities, location.search]);

  const handleCreate = async (data) => {
    const res = await activityApi.create(orgSlug, { ...data, entityType, entityId });
    if (res.success && res.activity) {
      setActivities(prev => [res.activity, ...prev]);
      setFormMode(null);
    }
  };

  const handleToggle = async (id, isDone) => {
    try {
      await activityApi.markDone(orgSlug, id, isDone);
      setActivities(prev => prev.map(a =>
        a._id === id ? { ...a, isDone, doneAt: isDone ? new Date().toISOString() : null } : a
      ));
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id) => {
    try {
      await activityApi.remove(orgSlug, id);
      setActivities(prev => prev.filter(a => a._id !== id));
    } catch {
      // silently fail
    }
  };

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Activities</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFormMode(formMode === 'note' ? null : 'note')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              formMode === 'note' ? 'bg-rivvra-500/20 text-rivvra-400' : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
            }`}
          >
            <MessageSquare size={10} /> Log Note
          </button>
          <button
            onClick={() => setFormMode(formMode === 'activity' ? null : 'activity')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              formMode === 'activity' ? 'bg-rivvra-500/20 text-rivvra-400' : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
            }`}
          >
            <ClipboardList size={10} /> Schedule Activity
          </button>
        </div>
      </div>

      {/* Form */}
      {formMode && (
        <ActivityForm
          mode={formMode}
          onSubmit={handleCreate}
          onCancel={() => setFormMode(null)}
        />
      )}

      {/* Activity list */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin text-dark-500" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-center text-xs text-dark-600 py-6">No activities yet</p>
      ) : (
        <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
          {activities.map(a => (
            <div key={a._id} className="group">
              <ActivityItem activity={a} onToggle={handleToggle} onDelete={handleDelete} highlight={highlightId === a._id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
