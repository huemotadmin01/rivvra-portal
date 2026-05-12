import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Loader2, BarChart3, Users, UserCheck, Clock,
  ShieldAlert, FileBarChart, RefreshCw, Download,
} from 'lucide-react';

/* ── CSV export ───────────────────────────────────────────────────────────
 * 2026-05-12 audit P3 #28. Client-side serialise — the dashboard data
 * is already loaded; no need for a separate backend export endpoint.
 * Layout is multi-section: headline counts at top, then each breakdown
 * (by stage / source / recruiter) with its own header row. Recruiters
 * can paste this straight into Sheets for leadership reporting. */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildReportingCsv(data, rangeLabel) {
  const lines = [];
  lines.push(`ATS Reporting Export,${csvEscape(rangeLabel)}`);
  lines.push(`Generated,${new Date().toISOString()}`);
  lines.push('');
  lines.push('Headline metrics');
  lines.push('Metric,Value');
  lines.push(`Total applications,${data.totalApplications ?? 0}`);
  lines.push(`Total candidates,${data.totalCandidates ?? 0}`);
  lines.push(`Total jobs,${data.totalJobs ?? 0}`);
  lines.push(`Total hired,${data.hiredCount ?? 0}`);
  lines.push(`Avg time to hire (days),${data.avgTimeToHire ?? ''}`);
  lines.push('');
  lines.push('Applications by stage');
  lines.push('Stage,Count');
  (data.applicationsByStage || []).forEach((s) => {
    lines.push(`${csvEscape(s.stageName)},${s.count}`);
  });
  lines.push('');
  lines.push('Applications by source');
  lines.push('Source,Count');
  (data.applicationsBySource || []).forEach((s) => {
    lines.push(`${csvEscape(s.source)},${s.count}`);
  });
  lines.push('');
  lines.push('Applications by recruiter');
  lines.push('Recruiter,Count');
  (data.applicationsByRecruiter || []).forEach((r) => {
    lines.push(`${csvEscape(r.recruiterName)},${r.count}`);
  });
  return lines.join('\n');
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

/* ── Time-range options ───────────────────────────────────────────────────
 * 2026-05-12 audit P1 #8. Each option emits a { dateFrom, dateTo } pair
 * (or both null = all time). "Custom" is intentionally omitted for now —
 * the four presets cover ~95% of recruiter intent and avoid a date
 * picker dependency. Add later if leadership asks for arbitrary ranges. */
const TIME_RANGE_OPTIONS = [
  { key: 'all', label: 'All time' },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'ytd', label: 'Year to date' },
];

function rangeToDates(key) {
  if (key === 'all') return { dateFrom: null, dateTo: null };
  const now = new Date();
  if (key === 'ytd') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    return { dateFrom: yearStart.toISOString(), dateTo: now.toISOString() };
  }
  const opt = TIME_RANGE_OPTIONS.find((o) => o.key === key);
  if (!opt?.days) return { dateFrom: null, dateTo: null };
  const from = new Date(now.getTime() - opt.days * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
}

/* ── Stat Card ────────────────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, iconColor }) {
  return (
    <div className="bg-dark-900 rounded-xl p-6 border border-dark-800">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon size={20} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

/* ── Horizontal Bar Chart (pure CSS) ──────────────────────────────────── */
function HorizontalBarChart({ title, data, labelKey, valueKey, barColor }) {
  const maxVal = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <div className="bg-dark-900 rounded-xl p-6 border border-dark-800">
      <h3 className="text-lg font-semibold text-white mb-5">{title}</h3>

      {data.length === 0 ? (
        <p className="text-dark-500 text-sm text-center py-6">No data yet</p>
      ) : (
        <div className="space-y-3">
          {data.map((item, i) => {
            const pct = Math.round((item[valueKey] / maxVal) * 100);
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-dark-300 w-32 shrink-0 truncate" title={item[labelKey] || 'Unknown'}>
                  {item[labelKey] && String(item[labelKey]).trim() ? item[labelKey] : <span className="italic text-dark-500">Unknown</span>}
                </span>
                <div className="flex-1 bg-dark-800 rounded-full h-6 overflow-hidden">
                  <div
                    className={`${barColor} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%`, minWidth: item[valueKey] > 0 ? '1.5rem' : 0 }}
                  />
                </div>
                <span className="text-sm font-medium text-dark-300 w-10 text-right shrink-0">
                  {item[valueKey]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Recruiter Table ──────────────────────────────────────────────────── */
function RecruiterTable({ data, totalApplications }) {
  // Sort descending by application count, memoised so we don't re-sort
  // on every parent re-render (the table doesn't own this state).
  const sorted = useMemo(() => [...data].sort((a, b) => b.count - a.count), [data]);

  return (
    <div className="bg-dark-900 rounded-xl p-6 border border-dark-800">
      <h3 className="text-lg font-semibold text-white mb-5">Applications by Recruiter</h3>

      {sorted.length === 0 ? (
        <p className="text-dark-500 text-sm text-center py-6">No data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-dark-400 border-b border-dark-800">
                <th className="text-left py-2 pr-4 font-medium">Recruiter</th>
                <th className="text-right py-2 px-4 font-medium">Applications</th>
                <th className="text-right py-2 pl-4 font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const pct = totalApplications > 0
                  ? ((r.count / totalApplications) * 100).toFixed(1)
                  : '0.0';
                return (
                  <tr key={i} className="border-b border-dark-800/50 last:border-0">
                    <td className="py-3 pr-4 text-dark-200">{r.recruiterName}</td>
                    <td className="py-3 px-4 text-right text-dark-300">{r.count}</td>
                    <td className="py-3 pl-4 text-right text-dark-400">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Main AtsReporting Component ──────────────────────────────────────── */
export default function AtsReporting() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [rangeKey, setRangeKey] = useState('all');

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!orgSlug) return;
    // First fetch: full-page loading. Range change or explicit refresh:
    // small spinner only, dashboard stays rendered.
    if (silent || data) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await atsApi.getDashboard(orgSlug, rangeToDates(rangeKey));
      if (res.success) {
        setData(res);
      } else {
        showToast(res?.error || 'Failed to load reporting data', 'error');
      }
    } catch (err) {
      // Surface the actual server error so we can diagnose post-deploy
      // instead of staring at a generic "Failed" toast.
      showToast(err?.message || 'Failed to load reporting data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, rangeKey, showToast]);

  useEffect(() => {
    if (isAdmin) fetchDashboard();
  }, [isAdmin, fetchDashboard]);

  // Non-admin guard
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <ShieldAlert size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Admin access required</p>
          <p className="text-sm text-dark-500 mt-1">Only admins can view ATS reporting.</p>
        </div>
      </div>
    );
  }

  // Full-page loading only on the very first fetch. Subsequent fetches
  // (range change, refresh) keep the existing dashboard rendered and
  // surface progress via the small spinner inside the Refresh button.
  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-rivvra-500" />
        </div>
      </div>
    );
  }

  // Empty / no data state
  if (!data) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <FileBarChart size={48} className="mb-4 opacity-40" />
          <p className="text-lg">No data yet</p>
          <p className="text-sm text-dark-500 mt-1">Reporting data will appear once there are applications.</p>
        </div>
      </div>
    );
  }

  const {
    applicationsByStage = [],
    applicationsBySource = [],
    applicationsByRecruiter = [],
    totalJobs = 0,
    totalApplications = 0,
    totalCandidates = 0,
    hiredCount = 0,
    avgTimeToHire = 0,
  } = data;

  return (
    <div className="p-6 bg-dark-950 min-h-full space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ATS Reporting</h1>
          <p className="text-dark-400 text-sm mt-1">Recruitment analytics &amp; metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ats-reporting-range" className="sr-only">Time range</label>
          <select
            id="ats-reporting-range"
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value)}
            className="bg-dark-900 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fetchDashboard({ silent: true })}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-900 border border-dark-700 text-sm text-dark-200 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh reporting data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const rangeLabel = TIME_RANGE_OPTIONS.find((o) => o.key === rangeKey)?.label || rangeKey;
              const dateStamp = new Date().toISOString().slice(0, 10);
              downloadCsv(buildReportingCsv(data, rangeLabel), `ats-reporting-${dateStamp}.csv`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-900 border border-dark-700 text-sm text-dark-200 hover:text-white hover:border-dark-600 transition-colors"
            title="Export to CSV"
            aria-label="Export reporting data as CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Applications"
          value={totalApplications}
          icon={BarChart3}
          iconColor="bg-blue-500/15 text-blue-400"
        />
        <StatCard
          label="Total Candidates"
          value={totalCandidates}
          icon={Users}
          iconColor="bg-purple-500/15 text-purple-400"
        />
        <StatCard
          label="Total Hired"
          value={hiredCount}
          icon={UserCheck}
          iconColor="bg-green-500/15 text-green-400"
        />
        <StatCard
          label="Avg Time to Hire"
          value={
            Number.isFinite(Number(avgTimeToHire)) && Number(avgTimeToHire) > 0
              ? `${avgTimeToHire} days`
              : '—'
          }
          icon={Clock}
          iconColor="bg-amber-500/15 text-amber-400"
        />
      </div>

      {/* ── Charts (Stage + Source) ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HorizontalBarChart
          title="Applications by Stage"
          data={applicationsByStage}
          labelKey="stageName"
          valueKey="count"
          barColor="bg-rivvra-500"
        />
        <HorizontalBarChart
          title="Applications by Source"
          data={applicationsBySource}
          labelKey="source"
          valueKey="count"
          barColor="bg-blue-500"
        />
      </div>

      {/* ── Recruiter Table ─────────────────────────────────────────────── */}
      <RecruiterTable data={applicationsByRecruiter} totalApplications={totalApplications} />

      {/* ── Job Positions Summary ───────────────────────────────────────── */}
      <div className="bg-dark-900 rounded-xl p-6 border border-dark-800">
        <h3 className="text-lg font-semibold text-white mb-5">Job Positions Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-dark-800/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{totalJobs}</p>
            <p className="text-sm text-dark-400 mt-1">Total Jobs</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{hiredCount}</p>
            <p className="text-sm text-dark-400 mt-1">Hired</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{avgTimeToHire}</p>
            <p className="text-sm text-dark-400 mt-1">Avg Days to Hire</p>
          </div>
        </div>
      </div>
    </div>
  );
}
