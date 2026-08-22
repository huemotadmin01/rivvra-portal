// ============================================================================
// CrmDashboardV2.jsx — CRM dashboard on ds (phase 7)
// ============================================================================
// Copied from CrmDashboard.jsx. Everything that decides a number or who may
// see it is untouched:
//
//   - the admin/team-lead gate on Team Performance reads `getAppRole('crm')`
//     only. The user.role global fallback was deliberately removed once
//     because it could over-grant across tenants — it stays out.
//   - the time-range window (sticky in localStorage, applied server-side via
//     dateFrom/dateTo) and the unbounded setup counts, which are separate on
//     purpose: range-filtering the checklist counts would re-show the
//     get-started card on an older org whose activity fell outside 30d.
//   - `totalRevenueByCurrency`, the per-currency aggregation that replaced a
//     single scalar total.
//
// MONEY IS COPIED VERBATIM, including an inconsistency. `(unspecified)`
// currency renders two different ways in this file: RevenueByCurrency does
// `formatMoney(total,'INR').replace(/^₹/, '~')` (symbol becomes ~), while
// Pipeline Value does `~ ${formatMoney(total,'INR').replace(/^₹/, '')}`
// (symbol dropped, "~ " prefixed). Those produce different strings. It is
// reproduced exactly rather than reconciled — changing how a money figure
// prints is a product decision, not a layout one.
//
// Presentation moves to ds: KPICard → Stat (with onClick, so the tiles stay
// keyboard-reachable), the three hand-rolled proportion bars → Meter, the
// range picker → InlineSelect, panels → Panel.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { formatMoney } from '../../utils/currency';
import {
  Briefcase, Trophy, XCircle, ArrowRight,
  Clock, Calendar, BarChart3, RefreshCw,
  Sparkles, CheckCircle2, Settings2,
} from 'lucide-react';
import MyTeamWidget from '../../components/shared/MyTeamWidget';
import contactsApi from '../../utils/contactsApi';
import {
  Button, Chip, EmptyState, InlineSelect, Meter, Panel, Spinner, Stat,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

// New-workspace onboarding card — mirrors OutreachGetStarted on the Outreach
// dashboard. Hidden once the org has both a contact and an opportunity.
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

// 2026-05-17 CRM-B: per-currency revenue renderer. Multi-company tenants
// (Huemot India + Inc + PSA + Canada) have mixed-currency pipelines;
// rendering a single number with one symbol was misleading. Show one
// line per currency. Empty list → em-dash.
function RevenueByCurrency({ rows, width }) {
  const nonZero = (rows || []).filter(r => (r.total || 0) > 0);
  if (nonZero.length === 0) {
    return <span style={{ font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-4)', width, textAlign: 'right' }}>—</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, width }}>
      {nonZero.map((r, i) => (
        <span
          key={`${r.currency}-${i}`}
          title={r.currency === '(unspecified)' ? 'No currency on record' : r.currency}
          style={{ font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}
        >
          {r.currency === '(unspecified)' ? formatMoney(r.total, 'INR').replace(/^₹/, '~') : formatMoney(r.total, r.currency)}
        </span>
      ))}
    </div>
  );
}

function PipelineBar({ data }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map(d => (
        <div key={d.stageId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 112, flexShrink: 0, textAlign: 'right',
            font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.stageName}
          </span>
          <Meter
            value={d.count}
            max={maxCount}
            size="lg"
            readout={d.count > 0 ? d.count : ''}
            style={{ flex: 1, minWidth: 0 }}
          />
          <RevenueByCurrency rows={d.revenueByCurrency} width={96} />
        </div>
      ))}
    </div>
  );
}

// 2026-05-18: time-range filter — same shape as AtsDashboard so the two
// dashboards behave consistently. Default = 30d, sticky per-user via
// localStorage. The window applies server-side via ?dateFrom=&dateTo=.
const CRM_RANGE_STORAGE_KEY = 'rivvra:crm-reporting-range';
const TIME_RANGE_OPTIONS = [
  { key: 'all', label: 'All time' },
  { key: '7d',  label: 'Last 7 days',  days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'ytd', label: 'Year to date' },
];
function readStoredRange() {
  try {
    const stored = localStorage.getItem(CRM_RANGE_STORAGE_KEY);
    if (stored && TIME_RANGE_OPTIONS.some(o => o.key === stored)) return stored;
  } catch (_) { /* localStorage blocked */ }
  return '30d';
}
function writeStoredRange(key) {
  try { localStorage.setItem(CRM_RANGE_STORAGE_KEY, key); } catch (_) {}
}
function rangeToDates(key) {
  if (key === 'all') return { dateFrom: null, dateTo: null };
  const now = new Date();
  if (key === 'ytd') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    return { dateFrom: yearStart.toISOString(), dateTo: now.toISOString() };
  }
  const opt = TIME_RANGE_OPTIONS.find(o => o.key === key);
  if (!opt?.days) return { dateFrom: null, dateTo: null };
  const from = new Date(now.getTime() - opt.days * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
}

const SCOPE_COPY = {
  all:  { tone: 'brand', text: 'Showing everything (admin view)' },
  team: { tone: 'info' },
  self: { tone: 'warn', text: 'Showing your own data only' },
};

export default function CrmDashboardV2() {
  const { orgSlug: slug, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { addToast } = useToast();
  const currency = currentCompany?.currency || 'INR';
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeKey, setRangeKey] = useState(() => readStoredRange());
  // Get-started checklist counts — unbounded (the dashboard KPIs are
  // range-filtered, so a 30d window on an older org would wrongly re-show
  // the checklist). null = not yet loaded → card hidden.
  const [setupCounts, setSetupCounts] = useState(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    Promise.all([
      contactsApi.list(slug, { limit: 1 }).catch(() => null),
      crmApi.listOpportunities(slug, { limit: 1 }).catch(() => null),
    ]).then(([contactsRes, oppsRes]) => {
      if (cancelled) return;
      setSetupCounts({
        contacts: contactsRes?.total ?? null,
        opps: oppsRes?.total ?? null,
      });
    });
    return () => { cancelled = true; };
  }, [slug, currentCompany?._id]);

  // 2026-05-14: CRM Reporting page merged into Dashboard. The analytical
  // section (win/loss/conversion rates, salesperson performance) renders
  // only for admin or team-lead — same gate the old Reporting route had.
  // The per-app role check is the canonical source; the user.role global
  // fallback the merge initially included was inconsistent with how other
  // pages compute this and could over-grant across tenants.
  const crmRole = getAppRole('crm');
  const isAdminOrLead = crmRole === 'admin' || crmRole === 'team_lead';

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!slug) return;
    // Full-page spinner only on first load. Range change / refresh keeps
    // the existing dashboard rendered with a small spinner in the action
    // bar — matches AtsDashboard.
    if (silent || data) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await crmApi.getDashboard(slug, rangeToDates(rangeKey));
      if (res.success) setData(res);
      else addToast(res?.error || 'Failed to load dashboard', 'error');
    } catch (err) {
      addToast(err?.message || 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id, rangeKey]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spinner label="Loading dashboard…" />
      </div>
    );
  }

  if (!data) return null;

  // Derived analytics — only rendered inside the admin/lead gate, but
  // computed unconditionally because they're cheap and the gate is on
  // the JSX, not the data.
  const winRate = data.total > 0 ? ((data.won / data.total) * 100).toFixed(1) : 0;
  const lossRate = data.total > 0 ? ((data.lost / data.total) * 100).toFixed(1) : 0;
  const conversionRate = data.total > 0 ? ((data.converted / data.total) * 100).toFixed(1) : 0;
  // 2026-05-17 CRM-B: per-currency aggregation. The legacy totalRevenue
  // collapsed every currency into one scalar. Build a single
  // currency → total map from every stage's revenueByCurrency rows.
  const totalRevenueByCurrency = (() => {
    const acc = new Map();
    for (const s of data.byStage || []) {
      for (const r of s.revenueByCurrency || []) {
        if (!r.currency) continue;
        acc.set(r.currency, (acc.get(r.currency) || 0) + (r.total || 0));
      }
    }
    return Array.from(acc, ([currency, total]) => ({ currency, total }));
  })();

  const scope = data?.scope;
  const scopeCopy = scope && (
    scope.mode === 'team'
      ? `Showing your team (${scope.employeeCount} salesperson${scope.employeeCount === 1 ? '' : 's'})`
      : SCOPE_COPY[scope.mode]?.text
  );

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Get-started checklist (new workspaces; hides once set up) ── */}
      {setupCounts && setupCounts.contacts !== null && setupCounts.opps !== null && (
        <CrmGetStarted slug={slug} contactsTotal={setupCounts.contacts} oppsTotal={setupCounts.opps} />
      )}

      {/* ── Header — title + scope badge on the left, range picker on the right ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ font: `650 19px/1.3 ${FONT}`, letterSpacing: '-0.016em', color: 'var(--fg)' }}>
            CRM Dashboard
          </h1>
          {/* 2026-05-18: data-scope badge (mirrors AtsDashboard). */}
          {scope && scopeCopy && (
            <div style={{ marginTop: 5 }}>
              <Chip tone={SCOPE_COPY[scope.mode]?.tone || 'neutral'} dot>{scopeCopy}</Chip>
            </div>
          )}
        </div>
        {/* 2026-05-18: time-range picker. Sticky per-user via localStorage.
            Applies server-side to opportunity createdAt + wonAt; recent /
            upcoming activities are intentionally unbounded. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="crm-reporting-range" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Time range
          </label>
          <InlineSelect
            id="crm-reporting-range"
            value={rangeKey}
            onChange={(e) => {
              const next = e.target.value;
              setRangeKey(next);
              writeStoredRange(next);
            }}
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </InlineSelect>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchDashboard({ silent: true })}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh dashboard"
            iconLeft={refreshing ? <Spinner size={13} /> : <RefreshCw size={13} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards — deep-link into the matching filtered Opportunities list. */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat label="Total Opportunities" value={data.total} icon={<Briefcase size={14} />} color="var(--a-crm)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities`)} />
        <Stat label="Active" value={data.active} icon={<Clock size={14} />} color="var(--info)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)} />
        <Stat label="Won" value={data.won} icon={<Trophy size={14} />} color="var(--warn)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities?status=won`)} />
        <Stat label="Lost" value={data.lost} icon={<XCircle size={14} />} color="var(--danger)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities?status=lost`)} />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        {/* Pipeline Funnel */}
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <Panel
            title="Pipeline Overview"
            actions={
              <Button variant="ghost" size="sm" iconRight={<ArrowRight size={13} />}
                onClick={() => navigate(`/org/${slug}/crm/pipeline`)}>
                View Pipeline
              </Button>
            }
          >
            <PipelineBar data={data.byStage || []} />
          </Panel>
        </div>

        {/* By Salesperson */}
        <Panel title="By Salesperson">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.bySalesperson || []).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 999,
                    background: 'var(--surface-3)', font: `600 10px/1 ${FONT}`, color: 'var(--fg-3)',
                  }}>
                    {(s.name || 'U')[0]}
                  </span>
                  <span style={{
                    font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)', minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.name}
                  </span>
                </span>
                <Chip tone="neutral">{s.count}</Chip>
              </div>
            ))}
            {(!data.bySalesperson || data.bySalesperson.length === 0) && (
              <EmptyState compact title="No data yet" />
            )}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        {/* Recent Opportunities */}
        <Panel title="Recent Opportunities">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.recentOpportunities || []).map(opp => (
              <button
                key={opp._id}
                type="button"
                onClick={() => navigate(`/org/${slug}/crm/opportunities/${opp._id}`)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none',
                  borderRadius: 'var(--r-2)', background: 'var(--surface-2)', cursor: 'pointer',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block', font: `550 12px/1.4 ${FONT}`, color: 'var(--fg)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {opp.name}
                  </span>
                  <span style={{ display: 'block', font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 1 }}>
                    {opp.companyName || 'No company'} · {opp.stageName}
                  </span>
                </span>
                {opp.expectedRevenue && (
                  <span style={{ font: `500 10.5px/1.4 ${FONT}`, color: 'var(--brand-ink)', flexShrink: 0 }}>
                    {formatMoney(opp.expectedRevenue, opp.currency || currency)}
                  </span>
                )}
              </button>
            ))}
            {(!data.recentOpportunities || data.recentOpportunities.length === 0) && (
              <EmptyState compact title="No opportunities yet" />
            )}
          </div>
        </Panel>

        {/* Upcoming Activities */}
        <Panel title="Upcoming Activities">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.upcomingActivities || []).map(a => (
              <div key={a._id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
              }}>
                <span style={{
                  width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: 'var(--r-1)', font: `600 10px/1 ${FONT}`,
                  background: 'var(--surface-3)',
                  color: a.type === 'call' ? 'var(--info)'
                    : a.type === 'meeting' ? 'var(--a-ats)'
                    : a.type === 'email' ? 'var(--warn-ink)'
                    : 'var(--fg-3)',
                }}>
                  {a.type?.[0]?.toUpperCase() || '•'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {a.summary || a.note || 'Activity'}
                  </p>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 4, font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 1 }}>
                    <Calendar size={9} /> {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'No date'}
                  </p>
                </div>
              </div>
            ))}
            {(!data.upcomingActivities || data.upcomingActivities.length === 0) && (
              <EmptyState compact title="No upcoming activities" />
            )}
          </div>
        </Panel>
      </div>

      {/* ─── My Sales Team (lead-only; hides itself for admins/members) ───
          2026-05-18: range-aware — when the dashboard picker changes, the
          widget refetches and the "Won in …" column header updates. */}
      <MyTeamWidget
        type="crm"
        currency={data?.currency}
        dateFrom={rangeToDates(rangeKey).dateFrom}
        dateTo={rangeToDates(rangeKey).dateTo}
        rangeLabel={TIME_RANGE_OPTIONS.find(o => o.key === rangeKey)?.label}
      />

      {/* ─── Team Performance (admin / team-lead only) ─────────────────────
          Merged 2026-05-14 from the old /crm/reporting page. Same data
          source (GET /crm/dashboard), same gate (admin || team_lead) the
          standalone route had. */}
      {isAdminOrLead && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            borderTop: '1px solid var(--line)', paddingTop: 18,
          }}>
            <BarChart3 size={15} style={{ color: 'var(--fg-4)' }} />
            <h2 style={{
              font: `600 11px/1.3 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.09em',
              color: 'var(--fg-2)',
            }}>
              Team Performance
            </h2>
          </div>

          {/* Analytical KPIs — rates + pipeline value */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Stat label="Win Rate" value={`${winRate}%`} note={`${data.won} won`} color="var(--warn)" />
            <Stat label="Loss Rate" value={`${lossRate}%`} note={`${data.lost} lost`} color="var(--danger)" />
            <Stat label="Conversion" value={`${conversionRate}%`} note={`${data.converted} converted`} color="var(--brand)" />
            <Panel style={{ padding: 16 }}>
              <p style={{
                font: `500 12px/1 ${FONT}`, color: 'var(--fg-3)', marginBottom: 10,
              }}>
                Pipeline Value
              </p>
              {/* 2026-05-17 CRM-B: per-currency. Mixed pipelines used
                  to be summed with a single currency symbol that picked
                  the company default — INR even for opps in USD. */}
              {totalRevenueByCurrency.length === 0 ? (
                <p style={{ font: `700 22px/1 ${FONT}`, color: 'var(--fg-4)' }}>—</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {totalRevenueByCurrency.map((r) => (
                    <p key={r.currency} title={r.currency} style={{
                      font: `700 22px/1.15 ${FONT}`, letterSpacing: '-0.028em',
                      color: 'var(--fg)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {r.currency === '(unspecified)'
                        ? `~ ${formatMoney(r.total, 'INR').replace(/^₹/, '')}`
                        : formatMoney(r.total, r.currency)}
                    </p>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Pipeline Breakdown — distribution table */}
          <Panel title="Pipeline Breakdown">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Stage', 'Opportunities', 'Revenue', 'Distribution'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i === 1 || i === 2 ? 'right' : 'left', padding: '6px 12px',
                        font: `600 10px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.07em',
                        color: 'var(--fg-4)', whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.byStage || []).map(s => {
                    const pct = data.active > 0 ? ((s.count / data.active) * 100).toFixed(0) : 0;
                    return (
                      <tr key={s.stageId} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '9px 12px', font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>{s.stageName}</td>
                        <td style={{ padding: '9px 12px', font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.count}</td>
                        <td style={{ padding: '9px 12px', font: `500 12px/1.4 ${FONT}`, color: 'var(--brand-ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(s.revenue || 0, currency)}</td>
                        <td style={{ padding: '9px 12px', minWidth: 160 }}>
                          <Meter value={Number(pct)} readout={`${pct}%`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Salesperson Performance — progress bars (richer than the
              count-badge list above; kept distinct because managers care
              about share-of-pipeline, not just absolute count). */}
          <Panel title="Salesperson Performance">
            {(data.bySalesperson || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.bySalesperson.map((s, i) => {
                  const pct = data.active > 0 ? ((s.count / data.active) * 100).toFixed(0) : 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 999,
                        background: 'var(--surface-3)', font: `600 11px/1 ${FONT}`, color: 'var(--fg-3)',
                      }}>
                        {(s.name || 'U')[0]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                          <span style={{ font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>{s.name}</span>
                          <span style={{ font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>{s.count} ({pct}%)</span>
                        </div>
                        <Meter value={Number(pct)} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState compact title="No data yet" />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
