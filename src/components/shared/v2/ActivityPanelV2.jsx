import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import activityApi from '../../../utils/activityApi';
import atsApi from '../../../utils/atsApi';
import {
  Button, Chip, ConfirmDialog, EmptyState, Spinner,
} from '../../ds';
import {
  Activity as ActivityIcon, AlertCircle, Calendar, Check, ClipboardList,
  Mail, MessageSquare, Trash2, User, X,
} from 'lucide-react';

const FONT = "'Inter', system-ui, sans-serif";

/** Activity type → Chip tone. `system` rows get their own renderer. */
const TYPE_TONES = {
  note: 'neutral',
  call: 'info',
  meeting: 'info',
  email: 'warn',
  task: 'brand',
  onboarding: 'brand',
  offboarding: 'warn',
  system: 'info',
};

// System events render as a slim audit-trail line (no checkbox, no delete).
const SYSTEM_ACTION_LABELS = {
  status_change: 'Status',
  approval_change: 'Approval',
  recruiter_change: 'Recruiter',
  account_owner_change: 'Account Owner',
  approver_change: 'Approver',
  client_change: 'Client',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
  unarchived: 'Unarchived',
  stage_change: 'Stage',
  refused: 'Refused',
  unrefused: 'Restored',
  hired: 'Hired',
  won: 'Won',
  lost: 'Lost',
  email_sent: 'Email',
  email_failed: 'Email',
  offer_revised: 'Offer revised',
  offer_envelope_disconnected: 'Envelope disconnected',
  stage_auto_advance: 'Stage',
  rate_confirmation_sent: 'Rate Confirmation',
  team_notice_fanout: 'Team announcement',
  interview_invite_sent: 'Interview invite',
};

const meta = { font: `450 10.5px/1.5 ${FONT}`, color: 'var(--fg-faint, #4a5563)' };
const body = { font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-2, #c3ccd6)' };

const rowStyle = (highlight) => ({
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
  borderRadius: 'var(--r-2, 10px)',
  ...(highlight ? {
    background: 'var(--brand-soft, rgba(34,197,94,.14))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--brand, #22c55e) 40%, transparent)',
  } : null),
});

function EmailEventItem({ activity, highlight, onOpenBody }) {
  const failed = activity.action === 'email_failed';
  const subject = activity.meta?.subject || activity.meta?.templateKey || '(no subject)';
  const recipients = Array.isArray(activity.meta?.recipients) ? activity.meta.recipients : [];
  const emailLogId = activity.meta?.emailLogId || null;

  return (
    <div id={`activity-${activity._id}`} style={rowStyle(highlight)}>
      <span style={{ marginTop: 3, flexShrink: 0, color: failed ? 'var(--danger, #ef4444)' : 'var(--warn, #f59e0b)' }}>
        {failed ? <AlertCircle size={12} /> : <Mail size={12} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Chip tone={failed ? 'danger' : 'warn'}>{failed ? 'Email · failed' : 'Email · sent'}</Chip>
          <span style={{ ...body, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject}</span>
          {emailLogId && onOpenBody && (
            <button
              type="button"
              onClick={() => onOpenBody(emailLogId, subject)}
              style={{ font: `500 11px/1.4 ${FONT}`, color: 'var(--brand, #22c55e)', background: 'transparent' }}
            >
              View email
            </button>
          )}
        </div>
        {recipients.length > 0 && (
          <p style={{ ...meta, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            to {recipients.join(', ')}
          </p>
        )}
        {failed && activity.meta?.error && (
          <p style={{ ...meta, color: 'var(--danger, #ef4444)', marginTop: 2 }} title={activity.meta.error}>
            {activity.meta.error}
          </p>
        )}
        <p style={{ ...meta, marginTop: 2 }}>
          {activity.createdByName || 'System'} · {new Date(activity.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function SystemEventItem({ activity, highlight }) {
  const label = SYSTEM_ACTION_LABELS[activity.action] || activity.action || 'System';
  return (
    <div id={`activity-${activity._id}`} style={rowStyle(highlight)}>
      <ActivityIcon size={12} style={{ marginTop: 3, flexShrink: 0, color: 'var(--info, #38bdf8)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Chip tone="info">{label}</Chip>
          <span style={{ ...body, minWidth: 0 }}>{activity.summary || activity.note || activity.action}</span>
        </div>
        <p style={{ ...meta, marginTop: 2 }}>
          {activity.createdByName || 'System'} · {new Date(activity.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function ActivityItem({ activity, onToggle, onDelete, highlight, onOpenEmailBody }) {
  if (activity.type === 'system' && (activity.action === 'email_sent' || activity.action === 'email_failed')) {
    return <EmailEventItem activity={activity} highlight={highlight} onOpenBody={onOpenEmailBody} />;
  }
  if (activity.type === 'system') return <SystemEventItem activity={activity} highlight={highlight} />;

  const isNote = activity.type === 'note';
  const done = !!activity.isDone;

  return (
    <div id={`activity-${activity._id}`} style={{ ...rowStyle(highlight), opacity: done ? 0.55 : 1 }}>
      {isNote ? (
        <MessageSquare size={13} style={{ marginTop: 3, flexShrink: 0, color: 'var(--fg-4, #828e9f)' }} />
      ) : (
        // No handler → a static indicator, not a dead button. Read-only
        // viewers still need to see whether a task is done.
        <span
          {...(onToggle ? {
            role: 'checkbox', tabIndex: 0, 'aria-checked': done,
            'aria-label': activity.summary || 'Mark done',
            onClick: () => onToggle(activity._id, !done),
            onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(activity._id, !done); } },
          } : { role: 'img', 'aria-label': done ? 'Done' : 'Not done' })}
          style={{
            marginTop: 2, width: 15, height: 15, flexShrink: 0, borderRadius: 4,
            display: 'grid', placeItems: 'center', cursor: onToggle ? 'pointer' : 'default',
            background: done ? 'var(--brand-soft, rgba(34,197,94,.14))' : 'transparent',
            boxShadow: `inset 0 0 0 1px ${done ? 'var(--brand, #22c55e)' : 'var(--line-2, rgba(255,255,255,.11))'}`,
            color: 'var(--brand, #22c55e)',
          }}
        >
          {done && <Check size={10} />}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Chip tone={TYPE_TONES[activity.type] || 'neutral'}>{activity.type}</Chip>
          {activity.dueDate && (
            <span style={{ ...meta, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Calendar size={9} /> {new Date(activity.dueDate).toLocaleDateString()}
            </span>
          )}
          {activity.assignedToName && (
            <span style={{ ...meta, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <User size={9} /> {activity.assignedToName}
            </span>
          )}
        </div>
        {activity.summary && <p style={{ ...body, marginTop: 3 }}>{activity.summary}</p>}
        {activity.note && <p style={{ ...body, color: 'var(--fg-3, #98a4b2)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{activity.note}</p>}
        <p style={{ ...meta, marginTop: 3 }}>
          {activity.createdByName} · {new Date(activity.createdAt).toLocaleDateString()}
          {done && activity.doneAt ? ` · Done ${new Date(activity.doneAt).toLocaleDateString()}` : ''}
        </p>
      </div>

      {/* Always rendered rather than revealed on hover — the legacy panel hid
          this behind :hover, which is unreachable on touch. */}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(activity)}
          title="Delete"
          aria-label={`Delete ${activity.summary || activity.type}`}
          style={{ display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2, color: 'var(--fg-4, #828e9f)', background: 'transparent' }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '6px 9px', border: 'none', outline: 'none',
  borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-1, #0e131a)',
  color: 'var(--fg, #eef2f6)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.11))',
  font: `450 12.5px/1.4 ${FONT}`,
};

function ActivityForm({ mode, onSubmit, onCancel }) {
  const isNote = mode === 'note';
  const blank = { type: isNote ? 'note' : 'call', summary: '', note: '', dueDate: '', assignedToName: '' };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const empty = !form.summary.trim() && !form.note.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (empty) return;
    setSaving(true);
    setErrMsg('');
    try {
      await onSubmit({
        type: isNote ? 'note' : form.type,
        summary: form.summary.trim() || null,
        note: form.note.trim() || null,
        dueDate: form.dueDate || null,
        assignedToName: form.assignedToName.trim() || null,
      });
      setForm(blank);
    } catch (err) {
      // Legacy swallowed this: a failed create closed nothing and said
      // nothing, so the note looked saved until you reloaded.
      setErrMsg(err?.message || 'Failed to save. Your text is still here — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10, padding: 10,
      borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-2, #141b24)',
    }}>
      {!isNote && (
        <div style={{ display: 'flex', gap: 7 }}>
          <select value={form.type} onChange={set('type')} style={{ ...inputStyle, width: 'auto' }}>
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
            <option value="task">Task</option>
          </select>
          <input type="date" value={form.dueDate} onChange={set('dueDate')} style={{ ...inputStyle, width: 'auto' }} />
        </div>
      )}
      <input
        value={form.summary} onChange={set('summary')}
        placeholder={isNote ? 'Note title (optional)' : 'Summary'}
        style={inputStyle}
      />
      <textarea
        value={form.note} onChange={set('note')}
        placeholder={isNote ? 'Write your note…' : 'Details (optional)'}
        rows={isNote ? 3 : 2}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 44 }}
      />
      {!isNote && (
        <input value={form.assignedToName} onChange={set('assignedToName')} placeholder="Assigned to (name)" style={inputStyle} />
      )}
      {errMsg && (
        <p style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--danger, #ef4444)' }}>{errMsg}</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving || empty}>
          {saving ? 'Saving…' : isNote ? 'Log Note' : 'Schedule'}
        </Button>
      </div>
    </form>
  );
}

/** Portal-rendered drawer for the HTML body of a sent email. Lazy-fetches on
 *  open so the timeline itself stays cheap. */
function EmailBodyDrawer({ open, orgSlug, applicationId, logId, fallbackSubject, onClose }) {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !logId || !applicationId) return undefined;
    let cancelled = false;
    setLoading(true); setError(''); setLog(null);
    atsApi.getApplicationEmailBody(orgSlug, applicationId, logId)
      .then((res) => { if (!cancelled) setLog(res?.log || null); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load email'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orgSlug, applicationId, logId]);

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 95, display: 'flex', justifyContent: 'flex-end',
        background: 'color-mix(in srgb, #04070c 62%, transparent)', backdropFilter: 'blur(3px)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 672, height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--surface-1, #0e131a)',
        boxShadow: '-1px 0 0 0 var(--line-2, rgba(255,255,255,.11)), var(--sh-4, 0 24px 64px rgba(0,0,0,.5))',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: '16px 20px', borderBottom: '1px solid var(--line, rgba(255,255,255,.07))',
        }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center',
              borderRadius: 'var(--r-1, 7px)', background: 'var(--warn-soft, rgba(245,158,11,.14))', color: 'var(--warn, #f59e0b)',
            }}>
              <Mail size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ font: `650 14px/1.3 ${FONT}`, color: 'var(--fg, #eef2f6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log?.subject || fallbackSubject || 'Email'}
              </h3>
              {log && (
                <p style={{ ...meta, marginTop: 2 }}>
                  to {(log.to || []).join(', ')} · {new Date(log.sentAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: 'var(--fg-4, #828e9f)', background: 'transparent', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>}
          {!loading && error && <p style={{ ...body, color: 'var(--danger, #ef4444)' }}>{error}</p>}
          {!loading && !error && log && !log.bodyHtml && (
            <p style={{ ...body, color: 'var(--fg-3, #98a4b2)' }}>
              Body not captured for this email. It was sent before email-snapshotting was
              enabled, or sending failed before rendering completed.
              {log.error && <span style={{ display: 'block', marginTop: 8, color: 'var(--danger, #ef4444)' }}>{log.error}</span>}
            </p>
          )}
          {!loading && !error && log?.bodyHtml && (
            // Kept on a white card in both themes: this is an email body with
            // its own inline styling, rendered as the recipient saw it, not
            // as part of our surface. Sanitized because the renderer
            // interpolates candidate- and contact-supplied fields.
            <div style={{ background: '#fff', color: '#000', borderRadius: 'var(--r-2, 10px)', padding: 20 }}>
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.bodyHtml) }} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * v2 activity timeline for any entity, on ds primitives.
 *
 * Same data flow and API surface as `shared/ActivityPanel`, with four
 * behaviour changes that were bugs rather than styling:
 *
 *  - Deleting an activity now asks first. It was immediate and irreversible.
 *  - Create, toggle and delete failures surface. All three were swallowed,
 *    so a failed delete looked like nothing happened.
 *  - A failed list load says so instead of rendering as "no activities yet".
 *  - The delete control is always rendered, not revealed on :hover, which
 *    made it unreachable on touch.
 *
 * `canEdit` gates every write affordance. It defaults to true so a caller
 * that doesn't pass it behaves exactly as before.
 */
export default function ActivityPanelV2({
  orgSlug, entityType, entityId, refreshKey = 0, canEdit = true,
}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [formMode, setFormMode] = useState(null); // null | 'note' | 'activity'
  const [highlightId, setHighlightId] = useState(null);
  const [showSystem, setShowSystem] = useState(true);
  const [emailDrawer, setEmailDrawer] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | { activity, busy }
  const location = useLocation();
  const scrollDoneRef = useRef(false);

  const fetchActivities = useCallback(async () => {
    if (!orgSlug || !entityType || !entityId) return;
    try {
      const res = await activityApi.list(orgSlug, entityType, entityId);
      if (res.success) {
        // Plan-linked activities are surfaced in the Launch Plan card instead.
        setActivities((res.activities || []).filter((a) => !a.planInstanceId));
        setLoadError('');
      } else {
        setLoadError(res.error || 'Failed to load activities');
      }
    } catch (err) {
      setLoadError(err?.message || 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, entityType, entityId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities, refreshKey]);

  // Scroll-to + highlight when arriving from the My Activities dropdown.
  useEffect(() => {
    if (loading || scrollDoneRef.current) return undefined;
    const targetId = new URLSearchParams(location.search).get('activityId');
    if (!targetId || !activities.some((a) => a._id === targetId)) return undefined;
    scrollDoneRef.current = true;
    setHighlightId(targetId);
    const scrollT = setTimeout(() => {
      document.getElementById(`activity-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    const fadeT = setTimeout(() => setHighlightId(null), 3500);
    return () => { clearTimeout(scrollT); clearTimeout(fadeT); };
  }, [loading, activities, location.search]);

  // Rejects so ActivityForm can keep the user's text and show the reason.
  const handleCreate = async (data) => {
    const res = await activityApi.create(orgSlug, { ...data, entityType, entityId });
    if (!res.success || !res.activity) throw new Error(res.error || 'Failed to save');
    setActivities((prev) => [res.activity, ...prev]);
    setFormMode(null);
  };

  const handleToggle = async (id, isDone) => {
    const prev = activities;
    setActivities((list) => list.map((a) => (
      a._id === id ? { ...a, isDone, doneAt: isDone ? new Date().toISOString() : null } : a
    )));
    try {
      await activityApi.markDone(orgSlug, id, isDone);
      setActionError('');
    } catch (err) {
      // Optimistic here, unlike the inline fields: a checkbox that doesn't
      // tick until the server answers feels broken, and the revert is cheap
      // and visible.
      setActivities(prev);
      setActionError(err?.message || 'Could not update that activity.');
    }
  };

  const confirmDelete = async () => {
    if (!confirm) return;
    setConfirm((c) => c && { ...c, busy: true });
    try {
      await activityApi.remove(orgSlug, confirm.activity._id);
      setActivities((prev) => prev.filter((a) => a._id !== confirm.activity._id));
      setActionError('');
      setConfirm(null);
    } catch (err) {
      setActionError(err?.message || 'Could not delete that activity.');
      setConfirm(null);
    }
  };

  const visible = activities.filter((a) => (showSystem ? true : a.type !== 'system'));

  return (
    <section style={{
      background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-3, 16px)',
      boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07)), var(--lift, inset 0 1px 0 rgba(255,255,255,.05))',
      padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{
          font: `650 10.5px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.08em',
          color: 'var(--fg-4, #828e9f)',
        }}>
          Activities
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Button
            variant="ghost" size="sm"
            iconLeft={<ActivityIcon size={12} />}
            aria-pressed={showSystem}
            title={showSystem ? 'Hide system changes' : 'Show system changes'}
            onClick={() => setShowSystem((v) => !v)}
            style={showSystem ? { color: 'var(--info, #38bdf8)' } : undefined}
          >
            Changes
          </Button>
          {canEdit && (
            <>
              <Button
                variant="ghost" size="sm" iconLeft={<MessageSquare size={12} />}
                onClick={() => setFormMode(formMode === 'note' ? null : 'note')}
                style={formMode === 'note' ? { color: 'var(--brand, #22c55e)' } : undefined}
              >
                Log Note
              </Button>
              <Button
                variant="ghost" size="sm" iconLeft={<ClipboardList size={12} />}
                onClick={() => setFormMode(formMode === 'activity' ? null : 'activity')}
                style={formMode === 'activity' ? { color: 'var(--brand, #22c55e)' } : undefined}
              >
                Schedule Activity
              </Button>
            </>
          )}
        </div>
      </div>

      {canEdit && formMode && (
        <ActivityForm mode={formMode} onSubmit={handleCreate} onCancel={() => setFormMode(null)} />
      )}

      {actionError && (
        <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--danger, #ef4444)', marginBottom: 8 }}>
          {actionError}
        </p>
      )}

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><Spinner /></div>
      ) : loadError ? (
        <EmptyState
          icon={<AlertCircle size={20} />}
          tone="danger"
          title="Couldn't load activities"
          compact
          actions={<Button variant="secondary" size="sm" onClick={() => { setLoading(true); fetchActivities(); }}>Retry</Button>}
        >
          {loadError}
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={<MessageSquare size={20} />} title="No activities yet" compact>
          {activities.length > 0
            ? 'Only system changes are recorded here. Turn on Changes to see them.'
            : canEdit ? 'Log a note or schedule an activity to start the trail.' : 'Nothing has been logged against this record.'}
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 500, overflowY: 'auto' }}>
          {visible.map((a) => (
            <ActivityItem
              key={a._id}
              activity={a}
              highlight={highlightId === a._id}
              onToggle={canEdit ? handleToggle : undefined}
              onDelete={canEdit ? (act) => setConfirm({ activity: act }) : undefined}
              onOpenEmailBody={entityType === 'ats_application'
                ? (logId, subject) => setEmailDrawer({ logId, subject })
                : null}
            />
          ))}
        </div>
      )}

      {/* Only ats_application has a body-fetch endpoint wired up; the other
          entity panels share this component but not that route. */}
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

      <ConfirmDialog
        open={!!confirm}
        danger
        busy={!!confirm?.busy}
        title="Delete activity?"
        message={
          confirm
            ? `"${confirm.activity.summary || confirm.activity.note || confirm.activity.type}" will be removed from the timeline. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
