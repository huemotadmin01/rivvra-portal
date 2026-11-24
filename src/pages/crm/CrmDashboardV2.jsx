// ============================================================================
// CrmDashboardV2.jsx — CRM dashboard, rebuilt 2026-11-24
// ============================================================================
//
// Owner: "optimize the dashboard, reports to show only meaningful information
// to admin, team lead and sales reps". Measured the same day: 33 open deals,
// 15 past their next step; 3 follow-ups logged in 30 days (one rep); 90 days:
// 79 new, 4 became jobs, ~130 lost (61 "No response"). The old page led with
// all-time totals (626 total / 492 lost / 806 filed), listed the reps twice,
// drew a two-stage funnel, a pipeline value that covered 10 of 626 deals and
// an "Upcoming activities" panel nobody fills.
//
// Now one page, three audiences, same questions:
//   • Today      — open, overdue, due today, followed up this week. Not
//                  affected by the date range; each tile opens Follow-ups.
//   • Results    — new deals, became jobs, lost, win rate, requirements from
//                  existing clients, in the chosen range.
//   • Why lost   — top reasons in the range.
//   • Team table — lead / admin only: one row per salesperson, most overdue
//                  first. A rep sees "Needs you now" instead.
// A rep only ever gets their own numbers — the server decides, not this page.
//
// Data: GET /crm/insights. The old GET /crm/dashboard is left as it was.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import {
  ArrowRight, RefreshCw, Sparkles, CheckCircle2, Settings2, AlertTriangle,
  Clock, CalendarCheck, Briefcase, Trophy, XCircle, Percent, FilePlus2, Users, Inbox,
} from 'lucide-react';
import {
  Button, Callout, Chip, EmptyState, InlineSelect, Meter, Panel, Spinner, Stat,
} from '../../components/ds';
import { dueLabel } from '../../components/crm/nextStep';

const FONT = "'Inter', system-ui, sans-serif";
const micro = { font: `450 12px/1.45 ${FONT}`, color: 'var(--fg-4)' };

// New-workspace onboarding card. Hidden once the org has both a contact and an opportunity.
function CrmGetStarted({ slug, contactsTotal, oppsTotal }) {
  const steps = [
    {
      label: 'Add your first contact',
      desc: 'Opportunities are linked to a contact — add a client company or person first',
      done: contactsTotal > 0,
      to: `/org/${slug}/contacts/list`,
      cta: 'Add contact',
    },
    {
      label: 'Create your first opportunity',
      desc: 'Track a deal through your pipeline from first contact to converted',
      done: oppsTotal > 0,
      to: `/org/${slug}/crm/opportunities/new`,
      cta: 'New opportunity',
    },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <span style={{
          width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center',
          borderRadius: 'var(--r-2)', background: 'var(--brand-soft)',
        }}>
          <Sparkles size={17} style={{ color: 'var(--brand)' }} />
        </span>
        <div>
          <h3 style={{ font: `600 14.5px/1.3 ${FONT}`, color: 'var(--fg)' }}>Get started with CRM</h3>
          <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 }}>
            {doneCount} of {steps.length} steps complete
          </p>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: 'var(--r-2)',
              background: step.done ? 'var(--brand-soft)' : 'var(--surface-2)',
              boxShadow: `inset 0 0 0 1px ${step.done ? 'var(--brand-line)' : 'var(--line)'}`,
            }}
          >
            <span style={{
              width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center',
              borderRadius: 999,
              background: step.done ? 'var(--brand)' : 'var(--surface-3)',
              color: step.done ? 'var(--brand-fg)' : 'var(--fg-2)',
            }}>
              {step.done ? <CheckCircle2 size={15} /> : <span style={{ font: `700 11px/1 ${FONT}` }}>{i + 1}</span>}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ font: `550 13px/1.4 ${FONT}`, color: step.done ? 'var(--brand-ink)' : 'var(--fg)' }}>
                {step.label}
              </p>
              {!step.done && (
                <p style={{ font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 }}>{step.desc}</p>
              )}
            </div>
            {!step.done && (
              <Link to={step.to} style={{ flexShrink: 0, textDecoration: 'none' }}>
                <Button variant="secondary" size="sm" iconRight={<ArrowRight size={13} />}>{step.cta}</Button>
              </Link>
            )}
          </div>
        ))}
        <Link
          to={`/org/${slug}/crm/config/stages`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
            borderRadius: 'var(--r-2)', border: '1px dashed var(--line-2)',
            color: 'var(--fg-3)', textDecoration: 'none',
            font: `450 11.5px/1.4 ${FONT}`,
          }}
        >
          <Settings2 size={14} style={{ flexShrink: 0 }} />
          <span>Optional: customize your pipeline stages to match how you sell</span>
        </Link>
      </div>
    </Panel>
  );
}

// Date range for the "Results" half. Sticky per person. Today's tiles ignore it.
const RANGE_KEY = 'rivvra:crm-dashboard-range';
const RANGES = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'quarter', label: 'This quarter' },
  { key: 'ytd', label: 'This year' },
];
function readRange() {
  try { const v = localStorage.getItem(RANGE_KEY); if (RANGES.some((r) => r.key === v)) return v; } catch { /* blocked */ }
  return '30d';
}
function rangeDates(key) {
  const now = new Date();
  if (key === 'quarter') return { from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString(), to: now.toISOString() };
  if (key === 'ytd') return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: now.toISOString() };
  const days = RANGES.find((r) => r.key === key)?.days || 30;
  return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: now.toISOString() };
}
const timeOf = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const th = { font: `550 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)', textAlign: 'right', padding: '8px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
const td = { font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-2)', textAlign: 'right', padding: '9px 12px', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' };

function TeamTable({ rows }) {
  if (!rows.length) return <EmptyState compact title="Nothing in this range">No open deals and no results for anyone yet.</EmptyState>;
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const cols = [
    { k: 'open', label: 'Open', title: 'Open deals now' },
    { k: 'overdue', label: 'Overdue', title: 'Open deals whose next step is past its date' },
    { k: 'touched7', label: 'Followed up', title: 'Open deals with a follow-up logged in the last 7 days' },
    { k: 'created', label: 'New', title: 'Deals created in the range' },
    { k: 'jobs', label: 'Became jobs', title: 'Deals that became an ATS job in the range' },
    { k: 'lost', label: 'Lost', title: 'Deals marked lost in the range' },
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Salesperson</th>
            {cols.map((c) => <th key={c.k} style={th} title={c.title}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeId || r.name}>
              <td style={{ ...td, textAlign: 'left', color: 'var(--fg)' }}>
                {r.name} {r.left && <Chip tone="warn" title="No longer an active employee — move these deals">Left</Chip>}
              </td>
              {cols.map((c) => {
                const v = r[c.k] || 0;
                const color = c.k === 'overdue' && v > 0 ? 'var(--danger)'
                  : c.k === 'touched7' && r.open > 0 && v === 0 ? 'var(--warn-ink, #b45309)'
                  : v === 0 ? 'var(--fg-4)' : td.color;
                return <td key={c.k} style={{ ...td, color, fontWeight: c.k === 'overdue' && v > 0 ? 600 : 450 }}>{v}</td>;
              })}
            </tr>
          ))}
          <tr>
            <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: 'var(--fg)', borderBottom: 'none' }}>Total</td>
            {cols.map((c) => <td key={c.k} style={{ ...td, fontWeight: 600, color: 'var(--fg)', borderBottom: 'none' }}>{sum(c.k)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LostReasons({ rows, total }) {
  if (!rows.length) return <EmptyState compact title="No lost deals in this range" />;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div style={{ display: 'grid', gap: 10, padding: 16 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr auto', alignItems: 'center', gap: 10 }}>
          <span style={{ font: `450 12.5px/1.4 ${FONT}`, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
          <Meter value={r.count} max={max} />
          <span style={{ ...micro, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right' }}>
            {r.count} · {total ? Math.round((r.count / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CrmDashboardV2() {
  const { orgSlug: slug } = useOrg();
  const { currentCompany } = useCompany();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [rangeKey, setRangeKey] = useState(readRange);
  // Leads and admins start on their team; a rep is always on their own deals.
  const [scope, setScope] = useState('team');
  const [setupCounts, setSetupCounts] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    Promise.all([
      contactsApi.list(slug, { limit: 1 }).catch(() => null),
      crmApi.listOpportunities(slug, { limit: 1 }).catch(() => null),
    ]).then(([c, o]) => { if (!cancelled) setSetupCounts({ contacts: c?.total ?? null, opps: o?.total ?? null }); });
    return () => { cancelled = true; };
  }, [slug, currentCompany?._id]);

  const load = useCallback(async ({ manual = false } = {}) => {
    if (!slug) return;
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const res = await crmApi.getInsights(slug, { scope, ...rangeDates(rangeKey), tzOffset: new Date().getTimezoneOffset() });
      if (mine !== seq.current) return;
      setData(res);
      setUpdatedAt(new Date());
      if (manual) addToast('Dashboard is up to date', 'success');
    } catch (err) {
      if (mine === seq.current) addToast(err?.message || 'Could not load the dashboard', 'error');
    } finally {
      if (mine === seq.current) { setLoading(false); setRefreshing(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id, scope, rangeKey]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}><Spinner label="Loading dashboard…" /></div>;
  }
  if (!data) return null;

  const team = data.scope === 'team';
  const now = data.now || {};
  const res = data.results || {};
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label || '';
  const toFollowUps = () => navigate(`/org/${slug}/crm/follow-ups${team ? '?scope=team' : ''}`);
  const who = team
    ? (data.viewerMode === 'all' ? 'Everyone in sales' : 'Your team')
    : 'Your deals';
  const lostTotal = (data.lostReasons || []).reduce((s, r) => s + r.count, 0);

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {setupCounts && setupCounts.contacts !== null && setupCounts.opps !== null && (
        <CrmGetStarted slug={slug} contactsTotal={setupCounts.contacts} oppsTotal={setupCounts.opps} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ font: `650 19px/1.3 ${FONT}`, letterSpacing: '-0.016em', color: 'var(--fg)' }}>CRM Dashboard</h1>
          <div style={{ ...micro, marginTop: 4 }}>
            {who}{updatedAt ? ` · updated ${timeOf(updatedAt)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {data.canSeeTeam && (
            <InlineSelect value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Whose numbers">
              <option value="team">{data.viewerMode === 'all' ? 'Everyone' : 'My team'}</option>
              <option value="mine">Only mine</option>
            </InlineSelect>
          )}
          <InlineSelect
            value={rangeKey}
            aria-label="Date range for results"
            onChange={(e) => { setRangeKey(e.target.value); try { localStorage.setItem(RANGE_KEY, e.target.value); } catch { /* blocked */ } }}
          >
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </InlineSelect>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load({ manual: true })}
            disabled={refreshing}
            iconLeft={refreshing ? <Spinner size={13} /> : <RefreshCw size={13} />}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* ── Today ── */}
      <div>
        <div style={{ ...micro, font: `600 11px/1.4 ${FONT}`, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Today</div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Stat label="Open deals" value={now.open ?? 0} icon={<Briefcase size={14} />} color="var(--info)" note="being worked now" onClick={toFollowUps} />
          <Stat label="Overdue" value={now.overdue ?? 0} icon={<AlertTriangle size={14} />} color="var(--danger)" note="next step is past its date" onClick={toFollowUps} />
          <Stat label="Due today" value={now.dueToday ?? 0} icon={<Clock size={14} />} color="var(--warn)" note="next step due today" onClick={toFollowUps} />
          <Stat
            label="Followed up this week"
            value={now.followedUpThisWeek ?? 0}
            icon={<CalendarCheck size={14} />}
            color="var(--brand)"
            note={`of ${now.open ?? 0} open deal${now.open === 1 ? '' : 's'} · last 7 days`}
            onClick={toFollowUps}
          />
        </div>
        {now.noNextStep > 0 && (
          <div style={{ marginTop: 10 }}>
            <Callout tone="warn" icon={<AlertTriangle size={16} />}>
              {now.noNextStep} open deal{now.noNextStep === 1 ? ' has' : 's have'} no next step with a date. Open Follow-ups and set one.
            </Callout>
          </div>
        )}
      </div>

      {/* ── Results in the range ── */}
      <div>
        <div style={{ ...micro, font: `600 11px/1.4 ${FONT}`, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Results · {rangeLabel}</div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Stat
            label="New deals"
            value={res.created ?? 0}
            icon={<Sparkles size={14} />}
            color="var(--info)"
            note={res.createdAuto ? `${res.createdAuto} tracked automatically from replies` : 'opportunities created'}
          />
          <Stat label="Became jobs" value={res.becameJobs ?? 0} icon={<Trophy size={14} />} color="var(--brand)" note="deal turned into an ATS job" />
          <Stat label="Lost" value={res.lost ?? 0} icon={<XCircle size={14} />} color="var(--danger)" note="marked lost" />
          <Stat
            label="Win rate"
            value={res.winRate == null ? '—' : `${res.winRate}%`}
            icon={<Percent size={14} />}
            color="var(--warn)"
            note={res.winRate == null ? 'nothing decided yet' : `${res.becameJobs} of ${res.becameJobs + res.lost} decided deals`}
          />
          <Stat
            label="Client requirements"
            value={res.clientRequirements ?? 0}
            icon={<FilePlus2 size={14} />}
            color="var(--fg-3)"
            note="roles from existing clients, raised straight to a job"
          />
        </div>
      </div>

      {team && (
        <Panel title="Team" icon={<Users size={16} />} flush>
          <div style={{ ...micro, padding: '10px 16px 0' }}>
            Open, overdue and followed up are today. New, became jobs and lost are for {rangeLabel.toLowerCase()}. Most overdue first.
          </div>
          <TeamTable rows={data.team || []} />
        </Panel>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <Panel
          title={team ? 'Most overdue' : 'Needs you now'}
          icon={<Inbox size={16} />}
          flush
          actions={<Button size="sm" variant="ghost" iconRight={<ArrowRight size={13} />} onClick={toFollowUps}>All follow-ups</Button>}
        >
          {(data.needsYou || []).length === 0 ? (
            <EmptyState compact icon={<CheckCircle2 size={20} />} title="Nothing overdue or due today">{team ? 'The team is up to date.' : 'You are up to date.'}</EmptyState>
          ) : (data.needsYou || []).map((o) => (
            <Link
              key={o._id}
              to={`/org/${slug}/crm/opportunities/${o._id}`}
              style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `550 13.5px/1.4 ${FONT}`, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.companyName || o.name}</div>
                <div style={{ ...micro, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team && o.salespersonName ? `${o.salespersonName} · ` : ''}{o.nextStep}</div>
              </div>
              <span style={{ ...micro, color: new Date(o.nextStepDueAt) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'var(--danger)' : 'var(--warn-ink, #b45309)', whiteSpace: 'nowrap' }}>
                {dueLabel(o.nextStepDueAt)}
              </span>
            </Link>
          ))}
        </Panel>
        <Panel title={`Why deals were lost · ${rangeLabel}`} icon={<XCircle size={16} />} flush>
          <LostReasons rows={data.lostReasons || []} total={lostTotal} />
        </Panel>
      </div>

    </div>
  );
}
