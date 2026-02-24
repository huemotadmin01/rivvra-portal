import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlatform } from '../context/PlatformContext';
import {
  BarChart3, RefreshCw, Loader2, Users, Mail, Send, Eye,
  MousePointerClick, TrendingUp, ShieldAlert,
  UserCheck, MessageSquare, ArrowDownRight,
  Target, Zap, CalendarDays, ChevronDown, Calendar
} from 'lucide-react';

import api from '../utils/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

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

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 shadow-2xl">
      <p className="text-[11px] text-dark-400 mb-1">{payload[0]?.payload?.fullName || label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold text-white">
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
    <div className="bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 shadow-2xl">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.payload?.color }} />
        <p className="text-[11px] text-dark-400">{d.name}</p>
      </div>
      <p className="text-sm font-bold text-white">{d.value?.toLocaleString()}</p>
    </div>
  );
}

export default function TeamDashboardPage() {
  const { user } = useAuth();
  const { orgPath } = usePlatform();
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

  const canView = user?.role === 'admin' || user?.role === 'team_lead';

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

  if (!canView) {
    return (
      <>
        <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
          <ShieldAlert className="w-12 h-12 text-dark-600 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-1">Access Restricted</h2>
          <p className="text-sm text-dark-400">This dashboard is available to Admin and Team Lead roles only.</p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="w-8 h-8 text-rivvra-500 animate-spin" />
          <p className="text-sm text-dark-400">Loading dashboard...</p>
        </div>
      </>
    );
  }

  // Prepare chart data
  const statusData = Object.entries(STATUS_CONFIG)
    .map(([key, cfg]) => ({
      name: cfg.label,
      value: data?.leadsByStatus?.[key] || 0,
      color: cfg.color,
    }))
    .filter(d => d.value > 0);

  const inSequenceData = (data?.inSequenceByUser || []).map(r => ({
    name: r.sourcedBy?.split(' ')[0] || 'Unknown',
    fullName: r.sourcedBy || 'Unknown',
    count: r.count,
  }));

  // Use enrollment-based count (source of truth) instead of leads.outreachStatus
  const totalInSequence = data?.inSequenceCount || 0;
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
    <>
      <div className="p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rivvra-500/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-rivvra-400" />
              </div>
              Team Performance
            </h1>
            <p className="text-xs text-dark-500 mt-1 ml-[42px]">
              {user?.teamName ? (
                <span className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium mr-1.5">{user.teamName}</span>
              ) : user?.role === 'admin' ? (
                <span className="text-rivvra-400 bg-rivvra-500/10 px-1.5 py-0.5 rounded font-medium mr-1.5">All Teams</span>
              ) : null}
              {data?.teamMembers?.length || 0} members
              {lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
              <span className="inline-flex items-center gap-1 ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500/70">Live</span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Date Filter */}
            <div className="relative" ref={dateDropdownRef}>
              <button
                onClick={() => setShowDateDropdown(!showDateDropdown)}
                className={`flex items-center gap-2 px-3.5 py-2 border rounded-xl text-sm transition-all ${
                  dateFilter !== 'today'
                    ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
                    : 'bg-dark-800 border-dark-700 text-dark-300 hover:text-white hover:border-dark-500'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                {dateLabel}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showDateDropdown && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl py-1 min-w-[220px]">
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
                      className={`w-full px-4 py-2.5 text-left text-xs hover:bg-dark-700 transition-colors ${
                        dateFilter === opt.key ? 'text-rivvra-400' : 'text-dark-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {dateFilter === 'custom' && (
                    <div className="px-4 py-3 border-t border-dark-700 space-y-3">
                      <div>
                        <label className="text-[10px] text-dark-500 uppercase tracking-wider block mb-1">From</label>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={e => setCustomFrom(e.target.value)}
                          max={customTo}
                          className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white outline-none focus:border-rivvra-500 [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-dark-500 uppercase tracking-wider block mb-1">To</label>
                        <input
                          type="date"
                          value={customTo}
                          onChange={e => setCustomTo(e.target.value)}
                          min={customFrom}
                          max={toDateStr(getToday())}
                          className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white outline-none focus:border-rivvra-500 [color-scheme:dark]"
                        />
                      </div>
                      <button
                        onClick={() => setShowDateDropdown(false)}
                        className="w-full px-3 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-xs font-semibold hover:bg-rivvra-400 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Refresh */}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 bg-dark-800 border border-dark-700 rounded-xl text-sm text-dark-300 hover:text-white hover:border-dark-500 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {refreshing && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg shadow-lg">
            <Loader2 className="w-3 h-3 text-rivvra-400 animate-spin" />
            <span className="text-xs text-dark-400">Updating...</span>
          </div>
        )}

        {/* ─── KPI Cards Row ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard
            label="Total Leads"
            value={data?.totalLeads || 0}
            icon={Users}
            gradient="from-blue-500/20 to-blue-600/5"
            iconColor="text-blue-400"
            subtitle="all time"
            onClick={() => navigate(orgPath('/outreach/team-contacts'))}
          />
          <KPICard
            label="In Sequence"
            value={totalInSequence}
            icon={Send}
            gradient="from-rivvra-500/20 to-rivvra-600/5"
            iconColor="text-rivvra-400"
            subtitle="current"
            onClick={() => navigate(orgPath('/outreach/team-contacts') + '?status=in_sequence')}
          />
          <KPICard
            label="Response Rate"
            value={`${data?.responseRate?.rate || 0}%`}
            icon={TrendingUp}
            gradient="from-emerald-500/20 to-emerald-600/5"
            iconColor="text-emerald-400"
            subtitle={`${data?.responseRate?.replied || 0} of ${data?.responseRate?.totalContacted || 0}`}
            onClick={() => navigate(orgPath('/outreach/team-contacts') + '?status=replied')}
          />
          <KPICard
            label={`Scraped`}
            value={totalScrapedInRange}
            icon={Zap}
            gradient="from-amber-500/20 to-amber-600/5"
            iconColor="text-amber-400"
            subtitle={dateLabel.toLowerCase()}
            onClick={() => navigate(orgPath('/outreach/team-contacts'))}
          />
          <KPICard
            label="Emails Scheduled"
            value={totalEmailsScheduled}
            icon={CalendarDays}
            gradient="from-purple-500/20 to-purple-600/5"
            iconColor="text-purple-400"
            subtitle={dateLabel.toLowerCase()}
            onClick={() => navigate(orgPath('/outreach/engage'))}
          />
        </div>

        {/* ─── Pipeline Funnel ─── */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-rivvra-400" />
            Outreach Pipeline
            <span className="text-[10px] text-dark-500 font-normal ml-1">all time</span>
          </h3>
          <div className="flex items-center gap-2">
            {pipelineSteps.map((step, i) => {
              const maxVal = pipelineSteps[0].value || 1;
              const widthPct = Math.max(((step.value / maxVal) * 100), 8);
              return (
                <div
                  key={i}
                  className={`flex-1 min-w-0 ${step.link ? 'cursor-pointer' : ''}`}
                  onClick={() => step.link && navigate(step.link)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-dark-400 truncate">{step.label}</span>
                    <span className="text-xs font-bold text-white ml-2">{step.value.toLocaleString()}</span>
                  </div>
                  <div className="h-8 bg-dark-800 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-700 ease-out"
                      style={{ width: `${widthPct}%`, backgroundColor: step.color, opacity: 0.6 }}
                    />
                  </div>
                  {i < pipelineSteps.length - 1 && pipelineSteps[i].value > 0 && (
                    <p className="text-[10px] text-dark-600 mt-1 text-center">
                      {((pipelineSteps[i + 1].value / pipelineSteps[i].value) * 100).toFixed(0)}%
                      <ArrowDownRight className="w-2.5 h-2.5 inline ml-0.5" />
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Charts Row ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Bar Chart: In Sequence by sourcedBy */}
          <div className="lg:col-span-3 card p-5">
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <Send className="w-4 h-4 text-rivvra-400" />
              In Sequence by Team Member
            </h3>
            <p className="text-[11px] text-dark-500 mb-4">Current active enrollments grouped by team member</p>
            {inSequenceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={inSequenceData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={42}>
                    {inSequenceData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#22c55e' : '#22c55e80'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-dark-500 text-sm">
                No leads in sequence yet
              </div>
            )}
          </div>

          {/* Donut: Leads by Status */}
          <div className="lg:col-span-2 card p-5">
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-400" />
              Lead Distribution
            </h3>
            <p className="text-[11px] text-dark-500 mb-2">By outreach status · all time</p>
            {statusData.length > 0 ? (
              <div className="relative">
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
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-xl font-bold text-white">{(data?.totalLeads || 0).toLocaleString()}</div>
                    <div className="text-[10px] text-dark-500">Total</div>
                  </div>
                </div>
                {/* Legend below */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                  {statusData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-[10px] text-dark-400">{d.name}</span>
                      <span className="text-[10px] text-dark-600">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-dark-500 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* ─── Email Performance ─── */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-400" />
            Email Performance
            <span className="text-[10px] text-dark-500 font-normal ml-1">All Sequences · all time</span>
          </h3>
          <div className="grid grid-cols-6 gap-3">
            <EmailMetricCard
              label="Sent"
              value={data?.emailStats?.sent || 0}
              icon={Send}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
              borderColor="border-blue-500/20"
            />
            <EmailMetricCard
              label="Opened"
              value={data?.emailStats?.opened || 0}
              rate={emailOpenRate}
              rateLabel="open rate"
              icon={Eye}
              color="text-purple-400"
              bgColor="bg-purple-500/10"
              borderColor="border-purple-500/20"
            />
            <EmailMetricCard
              label="Clicked"
              value={data?.emailStats?.clicked || 0}
              rate={emailClickRate}
              rateLabel="click-to-open"
              icon={MousePointerClick}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
              borderColor="border-amber-500/20"
            />
            <EmailMetricCard
              label="Interested"
              value={data?.emailStats?.replied || 0}
              rate={emailReplyRate}
              rateLabel="interested rate"
              icon={MessageSquare}
              color="text-emerald-400"
              bgColor="bg-emerald-500/10"
              borderColor="border-emerald-500/20"
            />
            <EmailMetricCard
              label="Not Interested"
              value={data?.emailStats?.repliedNotInterested || 0}
              icon={ArrowDownRight}
              color="text-orange-400"
              bgColor="bg-orange-500/10"
              borderColor="border-orange-500/20"
              negative
            />
            <EmailMetricCard
              label="Bounced"
              value={data?.emailStats?.bounced || 0}
              rate={emailBounceRate}
              rateLabel="bounce rate"
              icon={ArrowDownRight}
              color="text-red-400"
              bgColor="bg-red-500/10"
              borderColor="border-red-500/20"
              negative
            />
          </div>
        </div>

        {/* ─── Emails Sent + Scraped Tables ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Emails Sent — Selected Range */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-400" />
              Emails Sent
              <span className="text-[10px] text-dark-500 font-normal ml-1">{dateLabel.toLowerCase()}</span>
              <span className="ml-auto px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold">
                {totalEmailsSentInRange}
              </span>
            </h3>
            {emailsSentInRange.length > 0 ? (
              <div className="space-y-2.5">
                {emailsSentInRange.map((r, i) => {
                  const pct = totalEmailsSentInRange > 0 ? (r.count / totalEmailsSentInRange) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-dark-300">
                              {r.sourcedBy?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-xs text-dark-300">{r.sourcedBy}</span>
                        </div>
                        <span className="text-xs font-bold text-white">{r.count}</span>
                      </div>
                      <div className="ml-8 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-dark-600 text-[11px] py-4 text-center">No emails sent {dateLabel.toLowerCase()}</p>
            )}
          </div>

          {/* Leads Scraped — Selected Range + This Week */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Leads Scraped
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Selected range */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-dark-500 font-medium">{dateLabel}</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold">
                    {totalScrapedInRange}
                  </span>
                </div>
                {leadsScrapedInRange.length > 0 ? (
                  <div className="space-y-2">
                    {leadsScrapedInRange.map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-dark-300">
                              {r.sourcedBy?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-xs text-dark-300 truncate">{r.sourcedBy}</span>
                        </div>
                        <span className="text-xs font-bold text-white ml-2">{r.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-dark-600 text-[11px] py-2">No scrapes in range</p>
                )}
              </div>
              {/* This Week */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-dark-500 font-medium">This Week</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold">
                    {totalScrapedWeek}
                  </span>
                </div>
                {leadsScrapedThisWeek.length > 0 ? (
                  <div className="space-y-2">
                    {leadsScrapedThisWeek.map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-dark-300">
                              {r.sourcedBy?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-xs text-dark-300 truncate">{r.sourcedBy}</span>
                        </div>
                        <span className="text-xs font-bold text-white ml-2">{r.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-dark-600 text-[11px] py-2">No scrapes this week</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Team Leaderboard ─── */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            Team Leaderboard
            <span className="text-[10px] text-dark-500 font-normal ml-1">by total contacts sourced</span>
            <span className="ml-auto px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold">
              {(data?.totalLeads || 0).toLocaleString()} total
            </span>
          </h3>
          {leaderboard.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              {leaderboard.map((entry, i) => {
                const maxCount = leaderboard[0]?.count || 1;
                const pct = (entry.count / maxCount) * 100;
                return (
                  <div key={i} className="group">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ${
                        i === 0 ? 'bg-amber-500/20 text-amber-400'
                        : i === 1 ? 'bg-dark-600 text-dark-300'
                        : i === 2 ? 'bg-orange-900/30 text-orange-400'
                        : 'bg-dark-800 text-dark-500'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-dark-300 truncate">{entry.sourcedBy}</span>
                          <span className="text-xs font-bold text-white ml-2">{entry.count.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: i === 0 ? '#22c55e' : i === 1 ? '#3b82f6' : '#6b7280'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-dark-600 text-[11px] py-2 text-center">No contacts sourced yet</p>
          )}
        </div>

        {/* ─── Status Breakdown ─── */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-400" />
            Status Breakdown
            <span className="text-[10px] text-dark-500 font-normal ml-1">all time</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = data?.leadsByStatus?.[key] || 0;
              const pct = data?.totalLeads > 0 ? ((count / data.totalLeads) * 100).toFixed(1) : '0.0';
              return (
                <button
                  key={key}
                  onClick={() => navigate(`/outreach/team-contacts?status=${key}`)}
                  className="bg-dark-800/40 rounded-xl p-3.5 border border-dark-700/40 hover:border-dark-500 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span className="text-[10px] text-dark-400 uppercase tracking-wider truncate">{cfg.label}</span>
                  </div>
                  <div className="text-lg font-bold text-white">{count.toLocaleString()}</div>
                  <div className="mt-1.5 h-1 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(parseFloat(pct), 100)}%`, backgroundColor: cfg.color }}
                    />
                  </div>
                  <div className="text-[10px] text-dark-600 mt-1">{pct}%</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Emails Scheduled + In Sequence Detail ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Emails Scheduled */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-purple-400" />
              Emails Scheduled
              <span className="text-[10px] text-dark-500 font-normal ml-1">{dateLabel.toLowerCase()} · contacts due for next email</span>
              <span className="ml-auto px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 text-[10px] font-bold">
                {totalEmailsScheduled}
              </span>
            </h3>
            {emailsScheduledInRange.length > 0 ? (
              <div className="space-y-2.5">
                {emailsScheduledInRange.map((r, i) => {
                  const pct = totalEmailsScheduled > 0 ? (r.count / totalEmailsScheduled) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-dark-300">
                              {r.sourcedBy?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-xs text-dark-300">{r.sourcedBy}</span>
                        </div>
                        <span className="text-xs font-bold text-white">{r.count}</span>
                      </div>
                      <div className="ml-8 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-dark-600 text-[11px] py-4 text-center">No emails scheduled for {dateLabel.toLowerCase()}</p>
            )}
          </div>

          {/* In Sequence Detail */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-rivvra-400" />
              In Sequence Detail
              <span className="text-[10px] text-dark-500 font-normal ml-1">current</span>
              <span className="ml-auto px-2 py-0.5 rounded-lg bg-rivvra-500/10 text-rivvra-400 text-[10px] font-bold">
                {totalInSequence}
              </span>
            </h3>
            {(data?.inSequenceByUser?.length || 0) > 0 ? (
              <div className="space-y-2.5">
                {data.inSequenceByUser.map((r, i) => {
                  const pct = totalInSequence > 0 ? (r.count / totalInSequence) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-dark-300">
                              {r.sourcedBy?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-xs text-dark-300">{r.sourcedBy}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-dark-500">{pct.toFixed(0)}%</span>
                          <span className="text-xs font-bold text-white">{r.count}</span>
                        </div>
                      </div>
                      <div className="ml-8 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rivvra-500/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-dark-600 text-[11px] py-4 text-center">No leads in sequence</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Sub-components ─── */

function KPICard({ label, value, icon: Icon, gradient, iconColor, subtitle, onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border border-dark-700/50 bg-gradient-to-br ${gradient} p-4 text-left w-full ${onClick ? 'cursor-pointer hover:border-dark-500 transition-all' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] text-dark-400 uppercase tracking-wider font-medium">{label}</span>
          <div className="text-2xl font-bold text-white mt-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subtitle && <div className="text-[10px] text-dark-500 mt-0.5">{subtitle}</div>}
        </div>
        <div className="w-9 h-9 rounded-xl bg-dark-900/40 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
    </Wrapper>
  );
}

function EmailMetricCard({ label, value, rate, rateLabel, icon: Icon, color, bgColor, borderColor, negative }) {
  return (
    <div className={`rounded-xl p-4 ${bgColor} border ${borderColor} text-center`}>
      <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
      <div className="text-xl font-bold text-white">{value.toLocaleString()}</div>
      <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-1">{label}</div>
      {rate !== undefined && rate > 0 && (
        <div className={`text-[10px] font-medium ${negative ? 'text-red-400' : 'text-dark-400'}`}>
          {rate}% {rateLabel}
        </div>
      )}
    </div>
  );
}
