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
  Briefcase, Trophy, XCircle, FileInput, ArrowRight,
  Clock, Calendar, BarChart3, RefreshCw,
  Sparkles, CheckCircle2, Settings2,
  AlertTriangle, ListTodo,
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

function PipelineBar({ data, showRevenue = true }) {
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
          {showRevenue && <RevenueByCurrency rows={d.revenueByCurrency} width={96} />}
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

// "14 Jun" for anything older than a week, "3d ago" for recent — a rep
// scanning a cold list cares about the gap, not the calendar date.
function sinceLabel(value) {
  if (!value) return 'never contacted';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (Number.isNaN(days)) return '—';
  if (days < 1) return 'today';
  if (days < 14) return `${days}d ago`;
  return `${days} days ago`;
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
  // ⚠️ These divided by data.total, which INCLUDES still-open deals. Every
  // live opportunity counted as a non-win, so the rate could only ever fall
  // as the pipeline grew: 99/586 = 16.9% instead of 99/503 = 19.7%. A rate
  // only means anything over the CLOSED population.
  const closed = (data.won || 0) + (data.lost || 0);
  const winRate = closed > 0 ? ((data.won / closed) * 100).toFixed(1) : 0;
  const conversionRate = closed > 0 ? ((data.converted / closed) * 100).toFixed(1) : 0;
  // Share of open deals contacted inside the going-cold window. The one
  // number on this page that describes what the team is doing now rather
  // than what it did historically.
  const openNow = data.activeNowCount ?? data.active ?? 0;
  const coldNow = data.goingCold?.count ?? 0;
  const coverage = openNow > 0 ? (((openNow - coldNow) / openNow) * 100).toFixed(0) : null;
  // Revenue is an average over whatever carries a value. Below a fifth of the
  // window it describes a handful of records, not a pipeline — say so instead
  // of printing a confident number.
  // Denominators for the two "share of" lists — the sum of what each list
  // actually shows.
  const stageTotal = (data.byStage || []).reduce((n, s) => n + (s.count || 0), 0);
  const repTotal = (data.bySalesperson || []).reduce((n, s) => n + (s.count || 0), 0);
  const revCov = data.revenueCoverage;
  const revenueIsRepresentative = revCov ? (revCov.of > 0 && revCov.withValue / revCov.of >= 0.2) : true;
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
  // A rep is anyone the server did not give the full picture to and whose
  // scope is exactly themselves. 'team' with one member is still a lead with a
  // team of one, so lean on mode rather than counting.
  const isRep = scope?.mode === 'self';
  // A lead sees their team and nobody else's. Same tiles as a rep, but the
  // question is "whose pipeline is rotting" rather than "what do I do next".
  const isLead = scope?.mode === 'team';
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

      {/* KPI Cards — deep-link into the matching filtered Opportunities list.

          A REP gets a different row. "Total / Won / Lost" all-time is a
          history lesson — 84% of it is the Odoo import, and 393 of the 404
          losses closed before Rivvra existed. None of it tells a salesperson
          what to do today. Their four are: what is open, what is rotting,
          what has no decided next step, and what they have closed this
          quarter. Admin and team-lead rows are unchanged for now. */}
      {isRep ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <Stat label="My active deals" value={data.activeNowCount ?? data.active} icon={<Clock size={14} />} color="var(--info)"
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)} />
          <Stat
            label={`Going cold (${data.goingCold?.days ?? 14}d+)`}
            value={data.goingCold?.count ?? 0}
            note="no contact logged"
            icon={<AlertTriangle size={14} />}
            color="var(--danger)"
            title="Open deals you haven't logged contact on recently. Oldest first, below."
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)}
          />
          <Stat
            label="Needs a next step"
            value={data.needsNextStep?.count ?? 0}
            note="still on the default"
            icon={<ListTodo size={14} />}
            color="var(--warn)"
            title="Open deals where nobody has decided what happens next — they still carry the placeholder set by the one-time backfill."
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)}
          />
          <Stat label="Won this quarter" value={data.wonThisQuarter ?? 0} icon={<Trophy size={14} />} color="var(--warn)"
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=won`)} />
        </div>
      ) : isLead ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <Stat label="Team active deals" value={data.activeNowCount ?? data.active} icon={<Clock size={14} />} color="var(--info)"
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)} />
          <Stat
            label={`Going cold (${data.goingCold?.days ?? 14}d+)`}
            value={data.goingCold?.count ?? 0}
            note="across the team"
            icon={<AlertTriangle size={14} />}
            color="var(--danger)"
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)}
          />
          <Stat
            label="Coverage"
            icon={<AlertTriangle size={14} />}
            value={coverage === null ? '—' : `${coverage}%`}
            note={coldNow > 0 ? `${coldNow} of ${openNow} going cold` : 'all open deals touched'}
            color={coverage !== null && Number(coverage) < 50 ? 'var(--danger)' : 'var(--info)'}
            title="Share of the team's open deals with contact logged inside the going-cold window."
          />
          <Stat label="Won this quarter" value={data.wonThisQuarter ?? 0} icon={<Trophy size={14} />} color="var(--warn)"
            onClick={() => navigate(`/org/${slug}/crm/opportunities?status=won`)} />
        </div>
      ) : (
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat label="Total Opportunities" value={data.total} icon={<Briefcase size={14} />} color="var(--a-crm)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities`)} />
        <Stat label="Active" value={data.active} icon={<Clock size={14} />} color="var(--info)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities?status=active`)} />
        <Stat label="Won" value={data.won} icon={<Trophy size={14} />} color="var(--warn)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities?status=won`)} />
        <Stat label="Lost" value={data.lost} icon={<XCircle size={14} />} color="var(--danger)"
          onClick={() => navigate(`/org/${slug}/crm/opportunities?status=lost`)} />
        {/* 2026-09-25: opportunities created only to raise an ATS job position
            and converted within the hour. They used to count as wins, which is
            why this page reported a 67% win rate. Shown, not hidden — the
            volume is real work, it just isn't selling. */}
        {data.jobIntake > 0 && (
          <Stat
            label="Filed as Jobs"
            value={data.jobIntake}
            note="not counted above"
            icon={<FileInput size={14} />}
            color="var(--fg-3)"
            title="Opportunities raised purely to open an ATS job position and converted within an hour. Excluded from the pipeline figures and rates so those describe selling."
            // ...&status=won, because every filed requisition is converted —
            // the list defaults to the Open segment, where these are 0 by
            // definition, so the bare link landed on an empty table.
            onClick={() => navigate(`/org/${slug}/crm/opportunities?jobIntake=true&status=won`)}
          />
        )}
      </div>
      )}

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
            <PipelineBar data={data.byStage || []} showRevenue={revenueIsRepresentative} />
          </Panel>
        </div>

        {/* For a REP, "By Salesperson" is a list of one — their own name and a
            number they already have above. Replace it with the thing the KPI
            actually points at: which deals are going cold, oldest first, one
            click from the record. */}
        {isLead ? (
          <Panel title="Pipeline health by rep">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(data.byRepHealth || []).filter((r) => r.active > 0).map((r) => {
                const pct = r.active > 0 ? Math.round((r.cold / r.active) * 100) : 0;
                return (
                  <div key={r._id || r.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{
                        font: `500 12px/1.4 ${FONT}`, color: 'var(--fg-2)', minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.name}
                      </span>
                      <span style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                        {r.cold} of {r.active} cold{r.wonThisQuarter > 0 ? ` · ${r.wonThisQuarter} won` : ''}
                      </span>
                    </div>
                    {/* The bar is the ROTTING share, so a long bar is bad.
                        Reading "who needs a nudge" should take one glance. */}
                    <Meter
                      value={pct}
                      readout={`${pct}%`}
                      color={pct >= 70 ? 'var(--danger)' : pct >= 40 ? 'var(--warn)' : undefined}
                    />
                  </div>
                );
              })}
              {(data.byRepHealth || []).filter((r) => r.active > 0).length === 0 && (
                <EmptyState compact title="No open deals in your team">Nothing to chase right now.</EmptyState>
              )}
            </div>
          </Panel>
        ) : isRep ? (
          <Panel title={`Going cold — oldest first`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data.goingCold?.items || []).map((opp) => (
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
                    <span style={{
                      display: 'block', font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {opp.companyName || opp.contactName || '—'}
                    </span>
                  </span>
                  <Chip tone="danger">{sinceLabel(opp.lastContactAt)}</Chip>
                </button>
              ))}
              {(data.goingCold?.count || 0) > (data.goingCold?.items || []).length && (
                <span style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-3)', padding: '2px 4px' }}>
                  and {data.goingCold.count - data.goingCold.items.length} more
                </span>
              )}
              {(data.goingCold?.count || 0) === 0 && (
                <EmptyState compact title="Nothing going cold">Every open deal has been contacted recently.</EmptyState>
              )}
            </div>
          </Panel>
        ) : (
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
        )}
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
            <Stat label="Win Rate" value={`${winRate}%`} note={`${data.won} of ${closed} closed`} color="var(--warn)"
              title="Of the deals that reached a decision. Open deals are excluded — they have not been lost, they are simply still running." />
            {/* Loss Rate is dropped: it was always 100 − win rate, so it
                carried no information of its own. Coverage replaces it with
                something only this page can tell you. */}
            <Stat
              label="Coverage"
              icon={<AlertTriangle size={14} />}
              value={coverage === null ? '—' : `${coverage}%`}
              note={coldNow > 0 ? `${coldNow} of ${openNow} going cold` : 'all open deals touched'}
              color={coverage !== null && Number(coverage) < 50 ? 'var(--danger)' : 'var(--info)'}
              title="Share of open deals with contact logged inside the going-cold window." />
            <Stat label="Conversion" value={`${conversionRate}%`} note={`${data.converted} filed as jobs`} color="var(--brand)"
              title="Closed deals that produced an ATS job. Not the same as Won — some deals become jobs without ever being marked won." />
            <Panel style={{ padding: 16 }}>
              <p style={{
                font: `500 12px/1 ${FONT}`, color: 'var(--fg-3)', marginBottom: 10,
              }}>
                Pipeline Value
              </p>
              {/* 2026-05-17 CRM-B: per-currency. Mixed pipelines used
                  to be summed with a single currency symbol that picked
                  the company default — INR even for opps in USD. */}
              {!revenueIsRepresentative ? (
                /* Printing "₹24,60,000" when 8 of 587 deals carry a value — and
                   none of the open ones — invites a decision on eight records.
                   Say what is actually known instead. */
                <>
                  <p style={{ font: `700 22px/1 ${FONT}`, color: 'var(--fg-4)' }}>—</p>
                  <p style={{ font: `450 11px/1.5 ${FONT}`, color: 'var(--fg-4)', marginTop: 6 }}>
                    Only {revCov.withValue} of {revCov.of} deals in this range carry a value,
                    so a pipeline total would describe those {revCov.withValue}, not the pipeline.
                  </p>
                </>
              ) : totalRevenueByCurrency.length === 0 ? (
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
                    {['Stage', 'Opportunities', ...(revenueIsRepresentative ? ['Revenue'] : []), 'Distribution'].map((h) => (
                      <th key={h} style={{
                        textAlign: h === 'Opportunities' || h === 'Revenue' ? 'right' : 'left', padding: '6px 12px',
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
                    // ⚠️ was s.count / data.active. byStage includes WON deals,
                    // so "Converted to Job" read 99/84 = 118%. A distribution
                    // is a share of the rows shown, not of the open subset.
                    const pct = stageTotal > 0 ? ((s.count / stageTotal) * 100).toFixed(0) : 0;
                    return (
                      <tr key={s.stageId} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '9px 12px', font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>{s.stageName}</td>
                        <td style={{ padding: '9px 12px', font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.count}</td>
                        {revenueIsRepresentative && (
                          <td style={{ padding: '9px 12px', font: `500 12px/1.4 ${FONT}`, color: 'var(--brand-ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(s.revenue || 0, currency)}</td>
                        )}
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
                  // Same overshoot: bySalesperson counts active AND won, so
                  // dividing by active alone exceeded 100% across the list.
                  const pct = repTotal > 0 ? ((s.count / repTotal) * 100).toFixed(0) : 0;
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
