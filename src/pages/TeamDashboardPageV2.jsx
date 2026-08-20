// ============================================================================
// TeamDashboardPageV2.jsx — Outreach team performance, on ds
// ============================================================================
//
// Route: /org/:slug/outreach/team-dashboard. Admin and team_lead only.
//
// Spliced in byte-identically: the role gate, the date-range params, the
// 30-second auto-refresh (paused while the tab is hidden), every email-rate
// memo, and all the chart-data preparation and reduce sums.
//
// ── The chart palette: what moved and why ──────────────────────────────────
// `STATUS_CONFIG`'s colours are spliced verbatim and are still exactly what a
// dark-theme user sees today. But this page had no light theme before, and its
// hexes were picked against a dark surface. Run against ds `--surface-1` in
// light (#FFFFFF), four of the seven fall below 3:1:
//
//     replied  #22c55e 2.28   no_response #f59e0b 2.15
//     bounced  #f97316 2.80   lost        #94a3b8 2.56
//
// Washed-out arcs on white is a defect the migration would introduce, so light
// gets its own steps — same hue per status, re-stepped and validated, never an
// automatic flip of the dark values:
//
//     node scripts/validate_palette.js "<light steps>" --mode light --surface "#FFFFFF"
//       Lightness band      PASS      Normal-vision floor PASS (17.5)
//       Contrast vs surface PASS      Chroma floor        see below
//
// The chroma-floor FAIL is the validator applied slightly out of scope: it
// flags `not_contacted` and `lost_no_response` for "reading gray", which is
// precisely what those two statuses are supposed to look like. A status
// palette is not a categorical series palette.
//
// ── Flagged, NOT changed ───────────────────────────────────────────────────
// In DARK, `bounced` #f97316 and `no_response` #f59e0b sit at ΔE 9.6 for
// normal vision (6.2 deutan) — below the 15 floor, i.e. genuinely hard to tell
// apart on adjacent arcs even with full colour vision. That is pre-existing and
// it is a real legibility problem on a chart a team lead reads to work out
// where deliverability is going wrong.
//
// Re-hueing it would change what a colour MEANS on a dashboard people read
// daily, so it is reported rather than quietly fixed. What this file does do is
// make sure identity is never carried by colour alone: every place a status
// colour appears — donut legend, status-breakdown cards, tooltip — carries its
// text label too.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlatform } from '../context/PlatformContext';
import {
  BarChart3, RefreshCw, Loader2, Users, Mail, Send, Eye,
  MousePointerClick, TrendingUp, ShieldAlert,
  UserCheck, MessageSquare, ArrowDownRight,
  Target, Zap, CalendarDays, Calendar
} from 'lucide-react';

import api from '../utils/api';
import { useOrg } from '../context/OrgContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton, TableSkeleton } from '../components/Skeletons';
import {
  Panel, Chip, Button, Input, Field, Callout, EmptyState,
  Meter, Stat, InlineSelect,
} from '../components/ds';

// Only real statuses that exist in the system
const STATUS_CONFIG = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280' },
  in_sequence: { label: 'In Sequence', color: '#3b82f6' },
  replied: { label: 'Replied', color: '#22c55e' },
  replied_not_interested: { label: 'Not Interested', color: '#ef4444' },
  no_response: { label: 'No Response', color: '#f59e0b' },
  bounced: { label: 'Bounced', color: '#f97316' },
  lost_no_response: { label: 'Lost / No Response', color: '#94a3b8' },
};

// Helper: format date as YYYY-MM-DD for input[type=date] using LOCAL time (not UTC)
function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: get today's date at midnight (local)
function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getYesterday() {
  const d = getToday();
  d.setDate(d.getDate() - 1);
  return d;
}

// Light-theme steps for the status palette. Same hue per status as the dark
// values above, re-stepped so each clears 3:1 on `--surface-1` in light. Never
// derived by flipping the dark values — see the header note for the validator
// output that picked them.
const STATUS_LIGHT = {
  not_contacted:          '#6b7280',
  in_sequence:            '#2563eb',
  replied:                '#15803d',
  replied_not_interested: '#dc2626',
  no_response:            '#854d0e',
  bounced:                '#ea580c',
  lost_no_response:       '#64748b',
};

/** True while the document is in the light theme. Charts take real colour
 *  values, not CSS variables, so the palette has to be resolved in JS. */
function useIsLightTheme() {
  const read = () => typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-theme') === 'light';
  const [light, setLight] = useState(read);
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setLight(read()));
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return light;
}

/** Resolve a status key to the colour for the current theme. */
function statusColor(key, isLight) {
  return (isLight && STATUS_LIGHT[key]) || STATUS_CONFIG[key]?.color;
}

/** Chart chrome + non-status mark colours, resolved per theme. recharts takes
 *  real values, so these cannot be CSS variables. */
const chartInk = (isLight) => ({
  axisInk:      isLight ? '#4b5563' : '#9ca3af',
  axisInkMuted: isLight ? '#6b7280' : '#6b7280',
  cursorFill:   isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)',
  // The bar chart is ONE series — leader vs rest is emphasis, not identity,
  // so it is the same hue at two strengths rather than two hues.
  barLead:      isLight ? '#15803d' : '#22c55e',
  barRest:      isLight ? '#15803d80' : '#22c55e80',
  rankGold:     isLight ? '#15803d' : '#22c55e',
  rankSilver:   isLight ? '#2563eb' : '#3b82f6',
  rankRest:     isLight ? '#6b7280' : '#6b7280',
});

// ── Shared render tokens ────────────────────────────────────────────────────
const h3Style = { display: 'flex', alignItems: 'center', gap: 8, font: "600 13px/1.36 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 };
const bodyStyle = { font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 };
const metaStyle = { font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 };
const microStyle = { font: "500 10px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)' };
const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const cardGrid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 });

/** Initial-in-a-circle used by every per-member row. */
function MemberDot({ name }) {
  return (
    <span style={{
      width: 24, height: 24, borderRadius: 99, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--surface-3)', color: 'var(--fg-3)',
      font: "700 9px/1 'Inter', system-ui, sans-serif",
    }}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </span>
  );
}

/** Per-member row with a proportion bar — used by four sections. */
function MemberBar({ name, count, pct, color, showPct }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <MemberDot name={name} />
          <span style={{ ...bodyStyle, fontSize: 12, ...truncate }}>{name}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {showPct && <span style={metaStyle}>{pct.toFixed(0)}%</span>}
          <span style={{ font: "700 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{count}</span>
        </span>
      </div>
      <div style={{ marginLeft: 32, height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: color, transition: 'width 500ms var(--e-out)' }} />
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 'var(--r-3, 14px)',
      background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line-2), var(--sh-4)',
    }}>
      <p style={{ ...metaStyle, marginBottom: 4 }}>{payload[0]?.payload?.fullName || label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ font: "700 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 'var(--r-3, 14px)',
      background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line-2), var(--sh-4)',
    }}>
      {/* Swatch AND name — the two orange-family statuses are close enough
          that the dot alone would not tell them apart. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: d.payload?.color }} />
        <p style={{ ...metaStyle, margin: 0 }}>{d.name}</p>
      </div>
      <p style={{ font: "700 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
        {d.value?.toLocaleString()}
      </p>
    </div>
  );
}

export default function TeamDashboardPageV2() {
  const isLight = useIsLightTheme();
  const { user } = useAuth();
  const { orgPath } = usePlatform();
  const { getAppRole, currentOrg } = useOrg();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Date filter state
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | 'custom'
  const [customFrom, setCustomFrom] = useState(toDateStr(getToday()));
  const [customTo, setCustomTo] = useState(toDateStr(getToday()));
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const dateDropdownRef = useRef(null);

  // Org membership role is the source of truth; user.role (from Sales Teams) is fallback
  const orgRole = currentOrg ? getAppRole('outreach') : null;
  const effectiveRole = (orgRole && orgRole !== 'member') ? orgRole : (user?.role || orgRole || 'member');
  const canView = effectiveRole === 'admin' || effectiveRole === 'team_lead';

  // Compute date params based on filter
  const dateParams = useMemo(() => {
    if (dateFilter === 'today') {
      const today = toDateStr(getToday());
      return { dateFrom: today, dateTo: today };
    }
    if (dateFilter === 'yesterday') {
      const yesterday = toDateStr(getYesterday());
      return { dateFrom: yesterday, dateTo: yesterday };
    }
    // custom
    return { dateFrom: customFrom, dateTo: customTo };
  }, [dateFilter, customFrom, customTo]);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await api.getDashboardStats(dateParams);
      if (res.success) {
        setData(res);
        setLastUpdated(new Date());
        setError('');
      } else {
        setError(res.error || 'Failed to load');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateParams]);

  useEffect(() => {
    if (canView) {
      setLoading(true);
      fetchData();
    }
  }, [canView, fetchData]);

  // Auto-refresh every 30 seconds (paused when tab is hidden)
  useEffect(() => {
    if (!canView) return;
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [canView, fetchData]);

  // Close date dropdown on outside click (ref-based to avoid closing on date picker interaction)
  useEffect(() => {
    if (!showDateDropdown) return;
    const handleClick = (e) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDateDropdown]);

  // Close date dropdown on Escape key
  useEffect(() => {
    if (!showDateDropdown) return;
    const handleEsc = (e) => { if (e.key === 'Escape') setShowDateDropdown(false); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showDateDropdown]);

  // Computed email rates
  const emailOpenRate = useMemo(() => {
    if (!data?.emailStats?.sent) return 0;
    return ((data.emailStats.opened / data.emailStats.sent) * 100).toFixed(1);
  }, [data]);

  const emailClickRate = useMemo(() => {
    if (!data?.emailStats?.opened || !data?.emailStats?.clicked) return 0;
    return ((data.emailStats.clicked / data.emailStats.opened) * 100).toFixed(1);
  }, [data]);

  const emailReplyRate = useMemo(() => {
    if (!data?.emailStats?.sent) return 0;
    return ((data.emailStats.replied / data.emailStats.sent) * 100).toFixed(1);
  }, [data]);

  const emailBounceRate = useMemo(() => {
    if (!data?.emailStats?.sent) return 0;
    return ((data.emailStats.bounced / data.emailStats.sent) * 100).toFixed(1);
  }, [data]);

  // Date label for display
  const dateLabel = useMemo(() => {
    if (dateFilter === 'today') return 'Today';
    if (dateFilter === 'yesterday') return 'Yesterday';
    if (customFrom === customTo) {
      return new Date(customFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const from = new Date(customFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const to = new Date(customTo + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${from} – ${to}`;
  }, [dateFilter, customFrom, customTo]);


  const { axisInk, axisInkMuted, cursorFill, barLead, barRest, rankGold, rankSilver, rankRest } = chartInk(isLight);

  if (!canView) {
    return (
      <div style={{ padding: 32, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          tone="warn"
          icon={<ShieldAlert size={28} />}
          title="Access Restricted"
        >
          This dashboard is available to Admin and Team Lead roles only.
        </EmptyState>
      </div>
    );
  }

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton titleW="w-44" subtitleW="w-60" />
      <CardGridSkeleton count={3} />
      <TableSkeleton rows={6} cols={4} />
    </PageSkeleton>
  );
  // Prepare chart data
  const statusData = Object.entries(STATUS_CONFIG)
    .map(([key, cfg]) => ({
      name: cfg.label,
      value: data?.leadsByStatus?.[key] || 0,
      color: statusColor(key, isLight),
    }))
    .filter(d => d.value > 0);

  const inSequenceData = (data?.inSequenceByUser || []).map(r => ({
    name: r.sourcedBy?.split(' ')[0] || 'Unknown',
    fullName: r.sourcedBy || 'Unknown',
    count: r.count,
  }));

  // Use enrollment-based count (source of truth) instead of leads.outreachStatus
  const totalInSequence = data?.inSequenceCount || 0;
  // Date-filtered In Sequence (for KPI card, bar chart, detail table)
  const totalInSequenceInRange = data?.inSequenceCountInRange || 0;
  const inSequenceDataInRange = (data?.inSequenceByUserInRange || []).map(r => ({
    name: r.sourcedBy?.split(' ')[0] || 'Unknown',
    fullName: r.sourcedBy || 'Unknown',
    count: r.count,
  }));
  const leadsScrapedInRange = data?.leadsScrapedInRange || [];
  const leadsScrapedThisWeek = data?.leadsScrapedThisWeek || [];
  const emailsScheduledInRange = data?.emailsScheduledInRange || [];
  const emailsSentInRange = data?.emailsSentInRange || [];
  const leaderboard = data?.leaderboard || [];
  const totalScrapedInRange = leadsScrapedInRange.reduce((s, r) => s + r.count, 0);
  const totalScrapedWeek = leadsScrapedThisWeek.reduce((s, r) => s + r.count, 0);
  const totalEmailsScheduled = emailsScheduledInRange.reduce((s, r) => s + r.count, 0);
  const totalEmailsSentInRange = emailsSentInRange.reduce((s, r) => s + r.count, 0);

  // Pipeline: Total → In Sequence → Replied
  const pipelineSteps = [
    { label: 'Total Leads', value: data?.totalLeads || 0, color: '#6b7280', link: '/outreach/leads' },
    { label: 'In Sequence', value: totalInSequence, color: '#3b82f6', link: '/outreach/team-contacts?status=in_sequence' },
    { label: 'Responded', value: data?.repliedCount || 0, color: '#22c55e', link: '/outreach/team-contacts?status=replied' },
  ];

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 20 }} className="sm:p-6">
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, font: "700 20px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 'var(--r-2, 12px)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--brand-soft)', color: 'var(--brand-ink)',
            }}>
              <BarChart3 size={16} />
            </span>
            Team Performance
          </h1>
          <p style={{ ...metaStyle, marginTop: 4, marginLeft: 42, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {user?.teamName ? (
              <Chip tone="warn">{user.teamName}</Chip>
            ) : effectiveRole === 'admin' ? (
              <Chip tone="brand">All Teams</Chip>
            ) : null}
            <span>
              {data?.teamMembers?.length || 0} members
              {lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-ink)' }}>
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--brand)' }} />
              Live
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Date Filter */}
          <div style={{ position: 'relative' }} ref={dateDropdownRef}>
            <Button
              variant={dateFilter !== 'today' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              iconLeft={<Calendar size={14} />}
              aria-haspopup="dialog"
              aria-expanded={showDateDropdown}
            >
              {dateLabel}
            </Button>
            {showDateDropdown && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                minWidth: 220, maxWidth: 'calc(100vw - 1.5rem)', padding: '4px 0',
                borderRadius: 'var(--r-3, 14px)', background: 'var(--surface-2)',
                boxShadow: '0 0 0 1px var(--line-2), var(--sh-4)',
              }}>
                {[
                  { key: 'today', label: 'Today' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: 'custom', label: 'Custom Range' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setDateFilter(opt.key);
                      if (opt.key !== 'custom') setShowDateDropdown(false);
                    }}
                    style={{
                      width: '100%', padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
                      background: 'none', border: 0,
                      font: "450 12px/1.4 'Inter', system-ui, sans-serif",
                      color: dateFilter === opt.key ? 'var(--brand-ink)' : 'var(--fg-3)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                {dateFilter === 'custom' && (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-2)', display: 'grid', gap: 12 }}>
                    <Field label="From" htmlFor="td-from">
                      <Input
                        id="td-from"
                        type="date"
                        value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        max={customTo}
                      />
                    </Field>
                    <Field label="To" htmlFor="td-to">
                      <Input
                        id="td-to"
                        type="date"
                        value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        min={customFrom}
                        max={toDateStr(getToday())}
                      />
                    </Field>
                    <Button block size="sm" onClick={() => setShowDateDropdown(false)}>Apply</Button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Refresh */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            iconLeft={<RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {refreshing && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
          boxShadow: '0 0 0 1px var(--line-2), var(--sh-3)',
        }}>
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
          <span style={metaStyle}>Updating...</span>
        </div>
      )}

      {/* ─── KPI Cards Row ─── */}
      <div style={cardGrid(180)}>
        <Stat
          label="Total Leads" value={(data?.totalLeads || 0).toLocaleString()}
          icon={<Users size={16} />} color="var(--acc-blue, var(--brand))"
          note="all time"
          onClick={() => navigate(orgPath('/outreach/team-contacts'))}
        />
        <Stat
          label="In Sequence" value={totalInSequenceInRange.toLocaleString()}
          icon={<Send size={16} />} color="var(--brand)"
          note={dateLabel.toLowerCase()}
          onClick={() => navigate(orgPath('/outreach/team-contacts') + '?status=in_sequence')}
        />
        <Stat
          label="Response Rate" value={`${data?.responseRate?.rate || 0}%`}
          icon={<TrendingUp size={16} />} color="var(--brand)"
          note={`${data?.responseRate?.replied || 0} of ${data?.responseRate?.totalContacted || 0}`}
          onClick={() => navigate(orgPath('/outreach/team-contacts') + '?status=replied')}
        />
        <Stat
          label="Scraped" value={totalScrapedInRange.toLocaleString()}
          icon={<Zap size={16} />} color="var(--warn-ink)"
          note={dateLabel.toLowerCase()}
          onClick={() => navigate(orgPath('/outreach/team-contacts'))}
        />
        <Stat
          label="Emails Scheduled" value={totalEmailsScheduled.toLocaleString()}
          icon={<CalendarDays size={16} />} color="var(--acc-purple, var(--brand))"
          note={dateLabel.toLowerCase()}
          onClick={() => navigate(orgPath('/outreach/engage'))}
        />
      </div>

      {/* ─── Pipeline Funnel ─── */}
      <Panel>
        <h3 style={{ ...h3Style, marginBottom: 16 }}>
          <Target size={16} style={{ color: 'var(--brand-ink)' }} />
          Outreach Pipeline
          <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>all time</span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {pipelineSteps.map((step, i) => {
            const maxVal = pipelineSteps[0].value || 1;
            const widthPct = Math.max(((step.value / maxVal) * 100), 8);
            return (
              <div
                key={i}
                role={step.link ? 'button' : undefined}
                tabIndex={step.link ? 0 : undefined}
                style={{ flex: 1, minWidth: 0, cursor: step.link ? 'pointer' : undefined }}
                onClick={() => step.link && navigate(orgPath(step.link))}
                onKeyDown={(e) => { if (step.link && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(orgPath(step.link)); } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ ...metaStyle, ...truncate }}>{step.label}</span>
                  <span style={{ font: "700 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginLeft: 8 }}>
                    {step.value.toLocaleString()}
                  </span>
                </div>
                <div style={{ height: 32, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 'var(--r-2, 12px)', width: `${widthPct}%`,
                    backgroundColor: step.color, opacity: 0.6,
                    transition: 'width 700ms var(--e-out)',
                  }} />
                </div>
                {i < pipelineSteps.length - 1 && pipelineSteps[i].value > 0 && (
                  <p style={{ ...metaStyle, marginTop: 4, textAlign: 'center' }}>
                    {((pipelineSteps[i + 1].value / pipelineSteps[i].value) * 100).toFixed(0)}%
                    <ArrowDownRight size={10} style={{ display: 'inline', marginLeft: 2 }} />
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ─── Charts Row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Bar Chart: In Sequence by sourcedBy */}
        <Panel style={{ gridColumn: 'span 1' }}>
          <h3 style={h3Style}>
            <Send size={16} style={{ color: 'var(--brand-ink)' }} />
            In Sequence by Team Member
          </h3>
          <p style={{ ...metaStyle, margin: '4px 0 16px' }}>{`Enrollments ${dateLabel.toLowerCase()} grouped by team member`}</p>
          {inSequenceDataInRange.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={inSequenceDataInRange} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: axisInk, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisInkMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: cursorFill }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={42}>
                  {inSequenceDataInRange.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? barLead : barRest} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260, ...bodyStyle, color: 'var(--fg-4)' }}>
              {`No leads enrolled ${dateLabel.toLowerCase()}`}
            </div>
          )}
        </Panel>

        {/* Donut: Leads by Status */}
        <Panel>
          <h3 style={h3Style}>
            <UserCheck size={16} style={{ color: 'var(--acc-blue, var(--brand-ink))' }} />
            Lead Distribution
          </h3>
          <p style={{ ...metaStyle, margin: '4px 0 8px' }}>By outreach status · all time</p>
          {statusData.length > 0 ? (
            <div style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ font: "700 20px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                    {(data?.totalLeads || 0).toLocaleString()}
                  </div>
                  <div style={metaStyle}>Total</div>
                </div>
              </div>
              {/* Legend below — always labelled. Two of these hues are close
                  enough that a swatch alone would not distinguish them. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12, rowGap: 4, marginTop: 4 }}>
                {statusData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: d.color }} />
                    <span style={metaStyle}>{d.name}</span>
                    <span style={{ ...metaStyle, color: 'var(--fg-3)' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260, ...bodyStyle, color: 'var(--fg-4)' }}>No data</div>
          )}
        </Panel>
      </div>

      {/* ─── Email Performance ─── */}
      <Panel>
        <h3 style={{ ...h3Style, marginBottom: 16 }}>
          <Mail size={16} style={{ color: 'var(--acc-blue, var(--brand-ink))' }} />
          Email Performance
          <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>All Sequences · all time</span>
        </h3>
        <div style={cardGrid(150)}>
          <EmailMetricCard label="Sent" value={data?.emailStats?.sent || 0} icon={<Send size={16} />} color="var(--acc-blue, var(--brand-ink))" />
          <EmailMetricCard label="Opened" value={data?.emailStats?.opened || 0} rate={emailOpenRate} rateLabel="open rate" icon={<Eye size={16} />} color="var(--acc-purple, var(--brand-ink))" />
          <EmailMetricCard label="Clicked" value={data?.emailStats?.clicked || 0} rate={emailClickRate} rateLabel="click-to-open" icon={<MousePointerClick size={16} />} color="var(--warn-ink)" />
          <EmailMetricCard label="Interested" value={data?.emailStats?.replied || 0} rate={emailReplyRate} rateLabel="interested rate" icon={<MessageSquare size={16} />} color="var(--brand-ink)" />
          <EmailMetricCard label="Not Interested" value={data?.emailStats?.repliedNotInterested || 0} icon={<ArrowDownRight size={16} />} color="var(--warn-ink)" negative />
          <EmailMetricCard label="Bounced" value={data?.emailStats?.bounced || 0} rate={emailBounceRate} rateLabel="bounce rate" icon={<ArrowDownRight size={16} />} color="var(--danger)" negative />
        </div>
      </Panel>

      {/* ─── Emails Sent + Scraped ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Panel>
          <h3 style={{ ...h3Style, marginBottom: 16 }}>
            <Send size={16} style={{ color: 'var(--acc-blue, var(--brand-ink))' }} />
            Emails Sent
            <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>{dateLabel.toLowerCase()}</span>
            <Chip tone="info" style={{ marginLeft: 'auto' }}>{totalEmailsSentInRange}</Chip>
          </h3>
          {emailsSentInRange.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {emailsSentInRange.map((r, i) => (
                <MemberBar
                  key={i}
                  name={r.sourcedBy}
                  count={r.count}
                  pct={totalEmailsSentInRange > 0 ? (r.count / totalEmailsSentInRange) * 100 : 0}
                  color="var(--acc-blue, var(--brand))"
                />
              ))}
            </div>
          ) : (
            <p style={{ ...metaStyle, padding: '16px 0', textAlign: 'center' }}>No emails sent {dateLabel.toLowerCase()}</p>
          )}
        </Panel>

        <Panel>
          <h3 style={{ ...h3Style, marginBottom: 16 }}>
            <Zap size={16} style={{ color: 'var(--warn-ink)' }} />
            Leads Scraped
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {[
              { title: dateLabel, total: totalScrapedInRange, rows: leadsScrapedInRange, tone: 'warn', empty: 'No scrapes in range' },
              { title: 'This Week', total: totalScrapedWeek, rows: leadsScrapedThisWeek, tone: 'info', empty: 'No scrapes this week' },
            ].map((col) => (
              <div key={col.title}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <span style={microStyle}>{col.title}</span>
                  <Chip tone={col.tone}>{col.total}</Chip>
                </div>
                {col.rows.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {col.rows.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <MemberDot name={r.sourcedBy} />
                          <span style={{ ...bodyStyle, fontSize: 12, ...truncate }}>{r.sourcedBy}</span>
                        </span>
                        <span style={{ font: "700 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginLeft: 8 }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ ...metaStyle, padding: '8px 0' }}>{col.empty}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ─── Team Leaderboard ─── */}
      <Panel>
        <h3 style={{ ...h3Style, marginBottom: 16 }}>
          <Users size={16} style={{ color: 'var(--acc-blue, var(--brand-ink))' }} />
          Team Leaderboard
          <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>by total contacts sourced</span>
          <Chip tone="info" style={{ marginLeft: 'auto' }}>{(data?.totalLeads || 0).toLocaleString()} total</Chip>
        </h3>
        {leaderboard.length > 0 ? (
          <div style={cardGrid(240)}>
            {leaderboard.map((entry, i) => {
              const maxCount = leaderboard[0]?.count || 1;
              const pct = (entry.count / maxCount) * 100;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 99, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    font: "700 9px/1 'Inter', system-ui, sans-serif",
                    background: i === 0 ? 'var(--warn-soft)' : i === 1 ? 'var(--surface-4)' : i === 2 ? 'var(--surface-3)' : 'var(--surface-3)',
                    color: i === 0 ? 'var(--warn-ink)' : i === 1 ? 'var(--fg-3)' : i === 2 ? 'var(--warn-ink)' : 'var(--fg-4)',
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ ...bodyStyle, fontSize: 12, ...truncate }}>{entry.sourcedBy}</span>
                      <span style={{ font: "700 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginLeft: 8 }}>
                        {entry.count.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99, width: `${pct}%`,
                        transition: 'width 500ms var(--e-out)',
                        backgroundColor: i === 0 ? rankGold : i === 1 ? rankSilver : rankRest,
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ ...metaStyle, padding: '8px 0', textAlign: 'center' }}>No contacts sourced yet</p>
        )}
      </Panel>

      {/* ─── Status Breakdown ─── */}
      <Panel>
        <h3 style={{ ...h3Style, marginBottom: 16 }}>
          <UserCheck size={16} style={{ color: 'var(--acc-blue, var(--brand-ink))' }} />
          Status Breakdown
          <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>all time</span>
        </h3>
        <div style={cardGrid(150)}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = data?.leadsByStatus?.[key] || 0;
            const pct = data?.totalLeads > 0 ? ((count / data.totalLeads) * 100).toFixed(1) : '0.0';
            const color = statusColor(key, isLight);
            return (
              <button
                key={key}
                onClick={() => navigate(orgPath(`/outreach/team-contacts?status=${key}`))}
                style={{
                  padding: 14, textAlign: 'left', cursor: 'pointer',
                  borderRadius: 'var(--r-3, 14px)', border: 0,
                  background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
                }}
              >
                {/* Swatch AND label — never colour alone. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: color }} />
                  <span style={{ ...microStyle, ...truncate }}>{cfg.label}</span>
                </div>
                <div style={{ font: "700 17px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{count.toLocaleString()}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    width: `${Math.min(parseFloat(pct), 100)}%`, backgroundColor: color,
                    transition: 'width 500ms var(--e-out)',
                  }} />
                </div>
                <div style={{ ...metaStyle, marginTop: 4 }}>{pct}%</div>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ─── Emails Scheduled + In Sequence Detail ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Panel>
          <h3 style={{ ...h3Style, marginBottom: 16 }}>
            <CalendarDays size={16} style={{ color: 'var(--acc-purple, var(--brand-ink))' }} />
            Emails Scheduled
            <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>{dateLabel.toLowerCase()} · contacts due for next email</span>
            <Chip tone="purple" style={{ marginLeft: 'auto' }}>{totalEmailsScheduled}</Chip>
          </h3>
          {emailsScheduledInRange.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {emailsScheduledInRange.map((r, i) => (
                <MemberBar
                  key={i}
                  name={r.sourcedBy}
                  count={r.count}
                  pct={totalEmailsScheduled > 0 ? (r.count / totalEmailsScheduled) * 100 : 0}
                  color="var(--acc-purple, var(--brand))"
                />
              ))}
            </div>
          ) : (
            <p style={{ ...metaStyle, padding: '16px 0', textAlign: 'center' }}>No emails scheduled for {dateLabel.toLowerCase()}</p>
          )}
        </Panel>

        <Panel>
          <h3 style={{ ...h3Style, marginBottom: 16 }}>
            <Send size={16} style={{ color: 'var(--brand-ink)' }} />
            In Sequence Detail
            <span style={{ ...metaStyle, fontWeight: 400, marginLeft: 4 }}>{dateLabel.toLowerCase()}</span>
            <Chip tone="brand" style={{ marginLeft: 'auto' }}>{totalInSequenceInRange}</Chip>
          </h3>
          {(data?.inSequenceByUserInRange?.length || 0) > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.inSequenceByUserInRange.map((r, i) => (
                <MemberBar
                  key={i}
                  name={r.sourcedBy}
                  count={r.count}
                  pct={totalInSequenceInRange > 0 ? (r.count / totalInSequenceInRange) * 100 : 0}
                  color="var(--brand)"
                  showPct
                />
              ))}
            </div>
          ) : (
            <p style={{ ...metaStyle, padding: '16px 0', textAlign: 'center' }}>{`No leads enrolled ${dateLabel.toLowerCase()}`}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function EmailMetricCard({ label, value, rate, rateLabel, icon, color, negative }) {
  return (
    <div style={{
      padding: 16, textAlign: 'center', borderRadius: 'var(--r-3, 14px)',
      background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
    }}>
      <span style={{ display: 'inline-flex', color, marginBottom: 8 }}>{icon}</span>
      <div style={{ font: "700 20px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{value.toLocaleString()}</div>
      <div style={{ ...microStyle, marginBottom: 4 }}>{label}</div>
      {rate !== undefined && rate > 0 && (
        <div style={{ ...metaStyle, fontWeight: 550, color: negative ? 'var(--danger)' : 'var(--fg-4)' }}>
          {rate}% {rateLabel}
        </div>
      )}
    </div>
  );
}
