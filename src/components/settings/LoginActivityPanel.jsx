/**
 * LoginActivityPanel — sign-in history of one user (2026-11-18).
 * Org owners/admins and Employee (HR) admins only; the API enforces it too,
 * because it shows IP addresses and devices.
 */
import { useEffect, useState } from 'react';
import { History, Loader2, ShieldAlert } from 'lucide-react';
import { Panel, Chip } from '../ds';
import api from '../../utils/api';
import { fmtDateTime, timeAgo, LOGIN_METHOD_LABELS, LOGIN_FAILURE_LABELS, fmtDate } from '../../utils/activityTime';

const text = (w, s, c = 'var(--fg-3)') => ({ font: `${w} ${s}px/1.45 'Inter', system-ui, sans-serif`, color: c, margin: 0 });

export default function LoginActivityPanel({ orgSlug, userId, style }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!orgSlug || !userId) return undefined;
    let cancelled = false;
    api.request(`/api/org/${orgSlug}/members/${userId}/login-activity?limit=100`)
      .then((res) => {
        if (cancelled) return;
        const since = Date.now() - 7 * 86400000;
        setError('');
        setData({ ...res, failures7d: (res.events || []).filter((e) => !e.success && new Date(e.at).getTime() > since).length });
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load sign-in history'); });
    return () => { cancelled = true; };
  }, [orgSlug, userId]);

  const events = data?.events || [];
  const shown = showAll ? events : events.slice(0, 10);
  const failures7d = data?.failures7d || 0;

  return (
    <Panel title="Login activity" icon={<History size={14} />} style={style}>
      <div style={{ padding: 8 }}>
        {error && <p style={text(400, 12.5, 'var(--danger)')}>{error}</p>}
        {!data && !error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...text(400, 12.5, 'var(--fg-4)') }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Fact label="Last active" value={data.lastActiveAt ? timeAgo(data.lastActiveAt) : '—'} sub={data.lastActiveAt ? fmtDateTime(data.lastActiveAt) : 'Recorded from 18 Nov 2026'} />
              <Fact label="Last sign-in" value={data.lastLogin ? timeAgo(data.lastLogin) : 'Never'} sub={data.lastLogin ? fmtDateTime(data.lastLogin) : null} />
              <Fact label="Account created" value={data.accountCreatedAt ? fmtDate(data.accountCreatedAt) : '—'} />
              <Fact
                label="Failed sign-ins (7 days)"
                value={String(failures7d)}
                tone={failures7d >= 3 ? 'var(--danger)' : undefined}
              />
            </div>

            {events.length === 0 ? (
              <p style={text(400, 12.5, 'var(--fg-4)')}>
                No sign-ins recorded yet. Sign-ins are recorded from {fmtDate(data.trackingSince)}.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr>
                      {['When (IST)', 'How', 'Result', 'Device', 'IP address'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line-2)', ...text(600, 10, 'var(--fg-4)'), textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '7px 8px', ...text(400, 12, 'var(--fg-2)'), whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                        <td style={{ padding: '7px 8px', ...text(400, 12) }}>
                          {LOGIN_METHOD_LABELS[e.method] || e.method}
                          {e.method === 'login_as' && e.impersonatorEmail && (
                            <span style={text(400, 11, 'var(--fg-4)')}> · by {e.impersonatorEmail}</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          {e.success
                            ? <Chip tone="brand">Signed in</Chip>
                            : <Chip tone="danger">{LOGIN_FAILURE_LABELS[e.reason] || 'Failed'}</Chip>}
                        </td>
                        <td style={{ padding: '7px 8px', ...text(400, 12), whiteSpace: 'nowrap' }}>
                          {[e.device?.browser, e.device?.os].filter(Boolean).join(' · ') || '—'}
                          {e.device?.mobile ? ' (mobile)' : ''}
                        </td>
                        <td style={{ padding: '7px 8px', ...text(400, 12, 'var(--fg-4)'), fontVariantNumeric: 'tabular-nums' }}>{e.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {events.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    style={{ marginTop: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', ...text(500, 12, 'var(--brand-ink)') }}
                  >
                    {showAll ? 'Show fewer' : `Show all ${events.length}`}
                  </button>
                )}
              </div>
            )}
            <p style={{ ...text(400, 11, 'var(--fg-4)'), marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={12} /> Visible to admins and HR admins only. Kept for 12 months. Recorded from {fmtDate(data.trackingSince)}.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

function Fact({ label, value, sub, tone }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)', padding: '10px 12px' }}>
      <p style={{ ...text(600, 10, 'var(--fg-4)'), textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
      <p style={{ ...text(650, 15, tone || 'var(--fg)'), marginTop: 4 }}>{value}</p>
      {sub && <p style={{ ...text(400, 11, 'var(--fg-4)'), marginTop: 2 }}>{sub}</p>}
    </div>
  );
}
