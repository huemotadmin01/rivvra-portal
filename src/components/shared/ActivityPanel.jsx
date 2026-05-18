import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import activityApi from '../../utils/activityApi';
import atsApi from '../../utils/atsApi';
import {
  Check, Trash2, Calendar, Plus, Loader2, MessageSquare, ClipboardList,
  User, Activity as ActivityIcon, Mail, AlertCircle, X,
} from 'lucide-react';

const TYPE_BADGES = {
  note:        'bg-dark-700 text-dark-300',
  call:        'bg-blue-500/10 text-blue-400',
  meeting:     'bg-purple-500/10 text-purple-400',
  email:       'bg-amber-500/10 text-amber-400',
  task:        'bg-emerald-500/10 text-emerald-400',
  onboarding:  'bg-rivvra-500/10 text-rivvra-400',
  offboarding: 'bg-orange-500/10 text-orange-400',
  system:      'bg-sky-500/10 text-sky-300',
};

// System events render as a slim audit-trail line (no checkbox, no delete).
// Action-tag → label mapping keeps the timeline compact and consistent
// across job/application/opportunity records.
const SYSTEM_ACTION_LABELS = {
  status_change:        'Status',
  approval_change:      'Approval',
  recruiter_change:     'Recruiter',
  account_owner_change: 'Account Owner',
  approver_change:      'Approver',
  client_change:        'Client',
  published:            'Published',
  unpublished:          'Unpublished',
  archived:             'Archived',
  unarchived:           'Unarchived',
  stage_change:         'Stage',
  refused:              'Refused',
  unrefused:            'Restored',
  hired:                'Hired',
  won:                  'Won',
  lost:                 'Lost',
  email_sent:           'Email',
  email_failed:         'Email',
  offer_revised:        'Offer revised',
  offer_envelope_disconnected: 'Envelope disconnected',
  stage_auto_advance:   'Stage',
  rate_confirmation_sent: 'Rate Confirmation',
  team_notice_fanout:   'Team announcement',
  interview_invite_sent: 'Interview invite',
};

// Email-event row (Q1+Q2 locked 2026-05-11). One row per send, all
// recipients inline. Body is fetched on demand and shown in a side
// drawer — keeps the activities collection light.
function EmailEventItem({ activity, highlight, onOpenBody }) {
  const failed = activity.action === 'email_failed';
  const subject = activity.meta?.subject || activity.meta?.templateKey || '(no subject)';
  const recipients = Array.isArray(activity.meta?.recipients) ? activity.meta.recipients : [];
  const emailLogId = activity.meta?.emailLogId || null;
  return (
    <div
      id={`activity-${activity._id}`}
      className={`flex items-start gap-3 px-3 py-2 rounded-lg ${
        highlight ? 'bg-rivvra-500/10 ring-1 ring-rivvra-500/40' : ''
      }`}
    >
      {failed ? (
        <AlertCircle size={12} className="text-red-400/90 mt-1 flex-shrink-0" />
      ) : (
        <Mail size={12} className="text-amber-400/90 mt-1 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            failed ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
          }`}>
            {failed ? 'Email · failed' : 'Email · sent'}
          </span>
          <span className="text-xs text-dark-200 min-w-0 truncate">{subject}</span>
          {emailLogId && onOpenBody && (
            <button
              type="button"
              onClick={() => onOpenBody(emailLogId, subject)}
              className="text-[10px] text-rivvra-300 hover:text-rivvra-200 underline-offset-2 hover:underline"
            >
              View email
            </button>
          )}
        </div>
        {recipients.length > 0 && (
          <p className="text-[10px] text-dark-500 mt-0.5 truncate">
            to {recipients.join(', ')}
          </p>
        )}
        {failed && activity.meta?.error && (
          <p className="text-[10px] text-red-400/90 mt-0.5 truncate" title={activity.meta.error}>
            {activity.meta.error}
          </p>
        )}
        <p className="text-[10px] text-dark-600 mt-0.5">
          {activity.createdByName || 'System'} · {new Date(activity.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// Lightweight portal-rendered side drawer for viewing the rendered HTML
// body of a sent email. Lazy-fetches on open so the activity list itself
// stays cheap to load.
function EmailBodyDrawer({ open, orgSlug, applicationId, logId, fallbackSubject, onClose }) {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !logId || !applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setLog(null);
    atsApi.getApplicationEmailBody(orgSlug, applicationId, logId)
      .then((res) => { if (!cancelled) setLog(res?.log || null); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load email'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orgSlug, applicationId, logId]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-dark-800 border-l border-dark-700 shadow-2xl w-full max-w-2xl h-full flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-dark-700/80 bg-gradient-to-b from-dark-800 to-dark-800/70">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/10 text-amber-300">
              <Mail size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white leading-tight truncate">
                {log?.subject || fallbackSubject || 'Email'}
              </h3>
              {log && (
                <p className="text-xs text-dark-400 mt-0.5 truncate">
                  to {(log.to || []).join(', ')} · {new Date(log.sentAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors flex-shrink-0 -mr-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-12 text-dark-500">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading…
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {!loading && !error && log && !log.bodyHtml && (
            <p className="text-sm text-dark-400">
              Body not captured for this email. It was sent before email-snapshotting was
              enabled, or sending failed before rendering completed.
              {log.error && <span className="block mt-2 text-red-400">{log.error}</span>}
            </p>
          )}
          {!loading && !error && log?.bodyHtml && (
            <div className="bg-white text-black rounded-lg p-5 shadow-inner">
              {/* The Sign / ATS email templates ship inline-styled HTML
                  intended for an email client. Rendering it inside an
                  iframe-style white surface keeps that intent. The body
                  comes from our own renderer and a server-trusted DB
                  template, not user input. */}
              <div dangerouslySetInnerHTML={{ __html: log.bodyHtml }} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SystemEventItem({ activity, highlight }) {
  const label = SYSTEM_ACTION_LABELS[activity.action] || activity.action || 'System';
  return (
    <div
      id={`activity-${activity._id}`}
      className={`flex items-start gap-3 px-3 py-2 rounded-lg ${
        highlight ? 'bg-rivvra-500/10 ring-1 ring-rivvra-500/40' : ''
      }`}
    >
      <ActivityIcon size={12} className="text-sky-400/80 mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300">
            {label}
          </span>
          <span className="text-xs text-dark-200 min-w-0 truncate">{activity.summary || activity.note || activity.action}</span>
        </div>
        <p className="text-[10px] text-dark-600 mt-0.5">
          {activity.createdByName || 'System'} · {new Date(activity.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function ActivityItem({ activity, onToggle, onDelete, highlight, onOpenEmailBody }) {
  // Email-sent / email-failed get their own renderer with the "View email"
  // affordance (Q1+Q2 locked 2026-05-11).
  if (activity.type === 'system' && (activity.action === 'email_sent' || activity.action === 'email_failed')) {
    return <EmailEventItem activity={activity} highlight={highlight} onOpenBody={onOpenEmailBody} />;
  }
  if (activity.type === 'system') {
    return <SystemEventItem activity={activity} highlight={highlight} />;
  }
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
// `refreshKey` is an optional counter — when the parent increments it,
// the panel re-fetches. Used to surface server-side async events (e.g.
// email_sent rows recorded after a fire-and-forget send completes)
// without waiting for a manual page reload.
export default function ActivityPanel({ orgSlug, entityType, entityId, refreshKey = 0 }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState(null); // null | 'note' | 'activity'
  const [highlightId, setHighlightId] = useState(null);
  // Q3-B: "Show changes" toggle overlays system audit events into the
  // same timeline. Default ON so the audit trail is visible without an
  // extra click — matches how recruiters expect Odoo's chatter to behave.
  const [showSystem, setShowSystem] = useState(true);
  // Email-body side-drawer state. Only relevant for ats_application
  // panels — the endpoint that backs this lives under /ats/applications/
  // and is scoped to verify the log belongs to the current application.
  const [emailDrawer, setEmailDrawer] = useState(null); // null | { logId, subject }
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

  useEffect(() => { fetchActivities(); }, [orgSlug, entityType, entityId, refreshKey]);

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
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Activities</h3>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setShowSystem((v) => !v)}
            title={showSystem ? 'Hide system changes' : 'Show system changes'}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              showSystem ? 'bg-sky-500/15 text-sky-300' : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
            }`}
          >
            <ActivityIcon size={10} /> Changes
          </button>
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
          {activities
            .filter((a) => showSystem ? true : a.type !== 'system')
            .map(a => (
              <div key={a._id} className="group">
                <ActivityItem
                  activity={a}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  highlight={highlightId === a._id}
                  onOpenEmailBody={entityType === 'ats_application'
                    ? (logId, subject) => setEmailDrawer({ logId, subject })
                    : null}
                />
              </div>
            ))}
        </div>
      )}

      {/* ATS-only: email-body side drawer. Other entity panels share this
          component but don't have a body-fetch endpoint wired up yet, so
          we only mount the drawer for ats_application. The "View email"
          link is also conditionally rendered above. */}
      {entityType === 'ats_application' && (
        <EmailBodyDrawer
          open={!!emailDrawer}
          orgSlug={orgSlug}
          applicationId={entityId}
          logId={emailDrawer?.logId}
          fallbackSubject={emailDrawer?.subject}
          onClose={() => setEmailDrawer(null)}
        />
      )}
    </div>
  );
}
