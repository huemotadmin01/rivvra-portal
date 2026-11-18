/**
 * OnboardingTimelinePanel — where a new joiner is in onboarding (2026-11-18).
 * Stage, what the form still needs, sign-in summary and every step with who /
 * when. Steps from before tracking started are rebuilt from the e-mail log and
 * marked "from e-mail log". HR (Employee-app) admins only.
 */
import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, CircleDot, CheckCircle2, Mail, LogIn, Eye, AlertTriangle } from 'lucide-react';
import { Panel, Chip } from '../ds';
import employeeApi from '../../utils/employeeApi';
import { fmtDateTime, timeAgo, daysSince, ONBOARDING_STAGES } from '../../utils/activityTime';

const text = (w, s, c = 'var(--fg-3)') => ({ font: `${w} ${s}px/1.45 'Inter', system-ui, sans-serif`, color: c, margin: 0 });

const ICONS = {
  invite_sent: Mail, invite_resent: Mail, workspace_link_sent: Mail,
  form_requested: Mail, form_link_resent: Mail,
  invite_accepted: LogIn, linked_existing_user: LogIn,
  form_shown: Eye,
  form_submitted: CheckCircle2, form_updated: CheckCircle2,
};

export default function OnboardingTimelinePanel({ orgSlug, employeeId, refreshKey, style }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgSlug || !employeeId) return undefined;
    let cancelled = false;
    employeeApi.getOnboardingTimeline(orgSlug, employeeId)
      .then((res) => { if (!cancelled) { setError(''); setData(res); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load onboarding'); });
    return () => { cancelled = true; };
  }, [orgSlug, employeeId, refreshKey]);

  const stage = data ? (ONBOARDING_STAGES[data.stage] || { label: data.stage, tone: 'neutral' }) : null;
  const pendingDays = data?.stage === 'form_pending' || data?.stage === 'invited' ? daysSince(data.lastRequestedAt) : null;
  const events = [...(data?.events || [])].reverse(); // newest first

  return (
    <Panel
      title="Onboarding"
      icon={<ClipboardCheck size={14} />}
      actions={stage ? <Chip tone={stage.tone}>{stage.label}{pendingDays != null ? ` · ${pendingDays} d` : ''}</Chip> : null}
      style={style}
    >
      <div style={{ padding: 8 }}>
        {error && <p style={text(400, 12.5, 'var(--danger)')}>{error}</p>}
        {!data && !error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...text(400, 12.5, 'var(--fg-4)') }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Fact label="Form submitted" value={data.completedAt ? fmtDateTime(data.completedAt) : 'Not yet'} />
              <Fact label="Last asked" value={data.lastRequestedAt ? timeAgo(data.lastRequestedAt) : '—'} sub={data.lastRequestedAt ? fmtDateTime(data.lastRequestedAt) : null} />
              <Fact label="Last sign-in" value={data.login?.lastLogin ? timeAgo(data.login.lastLogin) : (data.login ? '—' : 'No login yet')} sub={data.login?.lastLogin ? fmtDateTime(data.login.lastLogin) : null} />
              <Fact label="Last active" value={data.login?.lastActiveAt ? timeAgo(data.login.lastActiveAt) : '—'} sub={data.login?.lastActiveAt ? fmtDateTime(data.login.lastActiveAt) : null} />
            </div>

            {data.missing?.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', marginBottom: 14 }}>
                <AlertTriangle size={14} style={{ color: 'var(--warn-ink)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={text(600, 12, 'var(--warn-ink)')}>Still missing ({data.missing.length})</p>
                  <p style={{ ...text(400, 12, 'var(--fg-2)'), marginTop: 2 }}>{data.missing.join(' · ')}</p>
                </div>
              </div>
            ) : (
              <p style={{ ...text(500, 12, 'var(--brand-ink)'), marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> All details the onboarding form asks for are on file.
              </p>
            )}

            <p style={{ ...text(600, 10, 'var(--fg-4)'), textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Timeline</p>
            {events.length === 0 ? (
              <p style={text(400, 12.5, 'var(--fg-4)')}>Nothing yet — this person hasn't been invited or sent the form.</p>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {events.map((e, i) => {
                  const Icon = ICONS[e.type] || CircleDot;
                  const failed = e.meta?.emailStatus === 'failed';
                  return (
                    <li key={i} style={{ display: 'flex', gap: 10, padding: '7px 2px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                      <Icon size={14} style={{ color: e.type.startsWith('form_submitted') ? 'var(--brand-ink)' : 'var(--fg-4)', flexShrink: 0, marginTop: 2 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={text(500, 12.5, 'var(--fg)')}>
                          {e.label}
                          {failed && <span style={{ color: 'var(--danger)' }}> — e-mail failed</span>}
                        </p>
                        <p style={text(400, 11, 'var(--fg-4)')}>
                          {fmtDateTime(e.at)}
                          {e.by ? ` · by ${e.by}` : ''}
                          {e.source === 'email_log' ? ' · from e-mail log' : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)', padding: '10px 12px' }}>
      <p style={{ ...text(600, 10, 'var(--fg-4)'), textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
      <p style={{ ...text(600, 13, 'var(--fg)'), marginTop: 4 }}>{value}</p>
      {sub && <p style={{ ...text(400, 11, 'var(--fg-4)'), marginTop: 2 }}>{sub}</p>}
    </div>
  );
}
