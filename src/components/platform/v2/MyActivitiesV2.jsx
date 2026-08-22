import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, AlertTriangle } from 'lucide-react';
import activityApi from '../../../utils/activityApi';

/**
 * Global "My Activities" dropdown for the V2 app bar.
 *
 * This is a port of the block in platform/TopBar.jsx, not a shared extraction:
 * TopBar ships live to production today, and re-pointing it at a new component
 * on deploy day would put a live legacy file at risk for no user-visible gain.
 * The fetch/sort/mark-done logic below is copied verbatim from that file — only
 * the presentation moves from the legacy Tailwind scale onto ds tokens.
 *
 * Keep the two in sync until legacy TopBar retires.
 */

// Accent per activity type. These mirror the legacy badge colours one-for-one;
// `-ink` is the readable-on-tint variant, which is what the accent audit
// established for text sitting on a 15% wash of its own accent.
const ACT_TYPE_ACCENT = {
  note: 'slate',
  call: 'blue',
  meeting: 'purple',
  email: 'amber',
  task: 'emerald',
  onboarding: 'rivvra',
  offboarding: 'orange',
};

const ENTITY_LABELS = {
  employee: 'Employee',
  crm_opportunity: 'Opportunity',
  crm_contact: 'Contact',
  ats_application: 'Application',
  ats_job: 'Job',
};

// Map an activity's entityType -> route path (relative, used with orgPath)
function entityRoutePath(entityType, entityId) {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'employee':         return `/employee/${entityId}`;
    case 'crm_opportunity':  return `/crm/opportunities/${entityId}`;
    case 'crm_contact':      return `/contacts/${entityId}`;
    case 'ats_application':  return `/ats/applications/${entityId}`;
    case 'ats_job':          return `/ats/jobs/${entityId}`;
    default: return null;
  }
}

function tint(accent) {
  return `color-mix(in srgb, var(--acc-${accent}) 15%, transparent)`;
}

function MyActivitiesV2({ orgSlug, orgPath }) {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fetchActivities = async (slug) => {
    if (!slug) return;
    try {
      const res = await activityApi.my(slug, { isDone: false, limit: 20 });
      if (res?.success) {
        const list = res.activities || [];
        // Sort: overdue first (oldest dueDate first), then by dueDate asc, then by createdAt desc
        const now = Date.now();
        const isOverdue = (a) => a.dueDate && new Date(a.dueDate).getTime() < now;
        list.sort((a, b) => {
          const oa = isOverdue(a) ? 1 : 0;
          const ob = isOverdue(b) ? 1 : 0;
          if (oa !== ob) return ob - oa; // overdue first
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          if (da !== db) return da - db;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setActivities(list);
      }
    } catch {
      // silently ignore
    }
  };

  // Initial fetch + 60s polling
  useEffect(() => {
    if (!orgSlug) return;
    fetchActivities(orgSlug);
    const interval = setInterval(() => fetchActivities(orgSlug), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  // Refetch on dropdown open
  useEffect(() => {
    if (open && orgSlug) fetchActivities(orgSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click — the other AppBarV2 popovers do the same.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleMarkDone = async (e, id) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    await activityApi.markDone(orgSlug, id, true).catch(() => {});
    setActivities(prev => prev.filter(a => a._id !== id));
  };

  const handleNavigateToActivity = (activity) => {
    setOpen(false);
    const path = entityRoutePath(activity.entityType, activity.entityId);
    if (!path) return; // unsupported entity → no-op (row is visually inert)
    // Use query string + hash so detail page can scroll/highlight after data load
    navigate(`${orgPath(path)}?activityId=${activity._id}#activity-${activity._id}`);
  };

  const overdueCount = activities.filter(a => a.dueDate && new Date(a.dueDate).getTime() < Date.now() && !a.isDone).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="My Activities"
        style={{ position: 'relative' }}
      >
        <Clock style={{ width: 17, height: 17 }} />
        {activities.length > 0 && (
          <span
            style={{
              position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, padding: '0 3px',
              display: 'grid', placeItems: 'center', borderRadius: 999,
              background: overdueCount > 0 ? 'var(--danger)' : 'var(--brand)',
              color: '#fff', font: '700 9px/1 var(--font)',
            }}
          >
            {activities.length > 9 ? '9+' : activities.length}
          </span>
        )}
      </button>

      {open && (
        <div className="pop" style={{ top: 42, right: 0, width: 320, maxWidth: 'calc(100vw - 24px)', padding: 0 }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ font: '600 12px/1 var(--font)', color: 'var(--fg-2)' }}>My Activities</span>
            {overdueCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px',
                borderRadius: 'var(--r-1)', background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
                color: 'var(--danger)', font: '500 9px/1.4 var(--font)',
              }}>
                <AlertTriangle size={9} /> {overdueCount} overdue
              </span>
            )}
          </div>

          {activities.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <Clock style={{ width: 22, height: 22, color: 'var(--fg-faint)', margin: '0 auto 6px' }} />
              <p style={{ font: '450 12px/1.4 var(--font)', color: 'var(--fg-4)' }}>No pending activities</p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
              {activities.map((a) => {
                const overdue = a.dueDate && new Date(a.dueDate).getTime() < Date.now();
                const navigable = !!entityRoutePath(a.entityType, a.entityId);
                const accent = ACT_TYPE_ACCENT[a.type] || ACT_TYPE_ACCENT.note;
                return (
                  <div
                    key={a._id}
                    onClick={() => navigable && handleNavigateToActivity(a)}
                    title={navigable ? 'Open record' : 'No detail page available for this entity'}
                    className={navigable ? 'act-row is-nav' : 'act-row'}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 10px', borderRadius: 'var(--r-2)',
                      cursor: navigable ? 'pointer' : 'default',
                      opacity: navigable ? 1 : 0.8,
                      borderLeft: overdue ? '2px solid color-mix(in srgb, var(--danger) 60%, transparent)' : '2px solid transparent',
                    }}
                  >
                    <button
                      onClick={(e) => handleMarkDone(e, a._id)}
                      title="Mark done"
                      aria-label="Mark done"
                      className="act-check"
                      style={{
                        marginTop: 2, width: 15, height: 15, flexShrink: 0,
                        borderRadius: 4, border: '1px solid var(--line-2)', background: 'transparent',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 'var(--r-1)',
                          background: tint(accent), color: `var(--acc-${accent}-ink)`,
                          font: '500 9px/1.4 var(--font)',
                        }}>
                          {a.type}
                        </span>
                        <span style={{ font: '450 9px/1.4 var(--font)', color: 'var(--fg-4)' }}>
                          {a.entityName || (ENTITY_LABELS[a.entityType] || a.entityType)}
                        </span>
                        {a.dueDate && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 2,
                            font: `${overdue ? 500 : 450} 9px/1.4 var(--font)`,
                            color: overdue ? 'var(--danger)' : 'var(--fg-4)',
                          }}>
                            <Calendar size={8} /> {new Date(a.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {overdue && (
                          <span style={{
                            padding: '1px 4px', borderRadius: 'var(--r-1)',
                            background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
                            color: 'var(--danger)', font: '500 9px/1.4 var(--font)',
                          }}>
                            Overdue
                          </span>
                        )}
                      </div>
                      {a.summary && (
                        <p style={{
                          font: '450 12px/1.4 var(--font)', color: 'var(--fg-2)', marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {a.summary}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MyActivitiesV2;
