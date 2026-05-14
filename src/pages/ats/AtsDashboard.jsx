import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Loader2, BarChart3, Users, UserCheck, Clock,
  FileBarChart, RefreshCw, Download, ChevronDown,
  AlertTriangle, MessageSquareWarning, Hourglass, ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

/* ── Sticky range preference ──────────────────────────────────────────────
 * 2026-05-12 Phase 1 (audit Q8 = D). Per-user, per-device. Default = 30d
 * on first visit; respects the user's last selection thereafter. */
const RANGE_STORAGE_KEY = 'rivvra:ats-reporting-range';
function readStoredRange() {
  try {
    const stored = localStorage.getItem(RANGE_STORAGE_KEY);
    if (stored && ['all', '7d', '30d', '90d', 'ytd'].includes(stored)) return stored;
  } catch (_) { /* localStorage blocked */ }
  return '30d';
}
function writeStoredRange(key) {
  try { localStorage.setItem(RANGE_STORAGE_KEY, key); } catch (_) {}
}

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
  lines.push('Recruiter,Applications,Hired,Conversion %');
  (data.applicationsByRecruiter || []).forEach((r) => {
    const conv = r.conversion == null ? '' : `${r.conversion}%`;
    lines.push(`${csvEscape(r.recruiterName)},${r.count},${r.hired ?? 0},${conv}`);
  });
  // Phase 3 export sections.
  if (data.offerAcceptance) {
    lines.push('');
    lines.push('Offer acceptance');
    lines.push('Metric,Value');
    lines.push(`Offered,${data.offerAcceptance.proposed ?? 0}`);
    lines.push(`Accepted,${data.offerAcceptance.accepted ?? 0}`);
    lines.push(`Rate,${data.offerAcceptance.rate == null ? '' : `${data.offerAcceptance.rate}%`}`);
  }
  if (Array.isArray(data.refusalReasons) && data.refusalReasons.length > 0) {
    lines.push('');
    lines.push('Refusal reasons');
    lines.push('Reason,Count');
    data.refusalReasons.forEach((r) => {
      lines.push(`${csvEscape(r.reasonName)},${r.count}`);
    });
  }
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

/* ── Stat Card ────────────────────────────────────────────────────────────
 * 2026-05-14: restyled to match the CRM Dashboard KPICard pattern —
 * tinted full-card background instead of a dark card with a tinted
 * icon badge. Keeps font sizes / padding aligned across the two
 * dashboards so they read as the same family. */
function StatCard({ label, value, icon: Icon, color = 'dark' }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red:     'bg-red-500/10 text-red-400 border-red-500/20',
    purple:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
    blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dark:    'bg-dark-800 text-dark-200 border-dark-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs opacity-70">{label}</span>
        <Icon size={16} className="opacity-50" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

/* ── Horizontal Bar Chart (pure CSS) ──────────────────────────────────── */
function HorizontalBarChart({ title, data, labelKey, valueKey, barColor }) {
  const maxVal = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <div className="bg-dark-850 rounded-xl p-4 border border-dark-700">
      <h3 className="text-sm font-semibold text-dark-200 mb-3">{title}</h3>

      {data.length === 0 ? (
        <p className="text-dark-600 text-xs text-center py-4">No data yet</p>
      ) : (
        <div className="space-y-2">
          {data.map((item, i) => {
            const pct = Math.round((item[valueKey] / maxVal) * 100);
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-dark-300 w-28 shrink-0 truncate" title={item[labelKey] || 'Unknown'}>
                  {item[labelKey] && String(item[labelKey]).trim() ? item[labelKey] : <span className="italic text-dark-500">Unknown</span>}
                </span>
                <div className="flex-1 bg-dark-800 rounded-full h-5 overflow-hidden">
                  <div
                    className={`${barColor} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%`, minWidth: item[valueKey] > 0 ? '1.25rem' : 0 }}
                  />
                </div>
                <span className="text-xs font-medium text-dark-300 w-8 text-right shrink-0">
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

/* ── Recruitment Funnel ───────────────────────────────────────────────────
 * 2026-05-12 Phase 1 (audit Q2 = A). Full pipeline funnel:
 *   - One bar per stage in canonical sequence order (New → ... → Hired)
 *   - Each row shows applicants currently at OR past this stage
 *     (cumulative-from-end, so "L1" = current L1 + everyone downstream)
 *   - Stage-to-stage conversion % shown between bars (e.g. "30% of L1 → L2")
 *
 * Why cumulative-from-end: an applicant currently "Hired" passed through
 * every earlier stage. A "candidates currently at this stage" view would
 * look like a near-empty funnel because most are clustered at one end.
 * Cumulative answers the question recruiters actually ask — "how many
 * have we kept through this gate?"
 */
function RecruitmentFunnel({ data }) {
  // Only stages with a known sequence; sort ascending. Stages with null
  // sequence (e.g. archived or oddly imported) drop out of the funnel.
  const ordered = useMemo(() => {
    return [...data]
      .filter((s) => Number.isFinite(s.sequence))
      .sort((a, b) => a.sequence - b.sequence);
  }, [data]);

  // Cumulative-from-end: passed[i] = sum(ordered[i..].count).
  const passed = useMemo(() => {
    const out = new Array(ordered.length).fill(0);
    let running = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      running += ordered[i].count || 0;
      out[i] = running;
    }
    return out;
  }, [ordered]);

  const maxVal = Math.max(...passed, 1);

  return (
    <div className="bg-dark-850 rounded-xl p-4 border border-dark-700">
      <h3 className="text-sm font-semibold text-dark-200 mb-0.5">Recruitment Funnel</h3>
      <p className="text-dark-500 text-[11px] mb-3">Applicants currently at or past each stage</p>

      {ordered.length === 0 ? (
        <p className="text-dark-600 text-xs text-center py-4">No data yet</p>
      ) : (
        <div className="space-y-1">
          {ordered.map((stage, i) => {
            const count = passed[i];
            const pct = Math.round((count / maxVal) * 100);
            const isLast = i === ordered.length - 1;
            // Conversion from this stage to the next (% that progressed)
            const conv = !isLast && passed[i] > 0
              ? Math.round((passed[i + 1] / passed[i]) * 100)
              : null;
            return (
              <div key={stage.stageId || i}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dark-300 w-32 shrink-0 truncate" title={stage.stageName}>
                    {stage.stageName}
                  </span>
                  <div className="flex-1 bg-dark-800 rounded-full h-5 overflow-hidden">
                    <div
                      className="bg-rivvra-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, minWidth: count > 0 ? '1.25rem' : 0 }}
                    />
                  </div>
                  <span className="text-xs font-medium text-dark-200 w-8 text-right shrink-0">
                    {count}
                  </span>
                </div>
                {!isLast && (
                  <div className="flex items-center gap-3 pl-32">
                    <div className="flex-1 flex items-center gap-2 py-1 text-[11px] text-dark-500">
                      <ChevronDown size={10} />
                      <span>
                        {conv === null
                          ? <span className="italic">—</span>
                          : <><span className={conv >= 50 ? 'text-emerald-400' : conv >= 25 ? 'text-amber-400' : 'text-red-400'}>{conv}%</span> progressed to {ordered[i + 1].stageName}</>}
                      </span>
                    </div>
                    <span className="w-8" />
                  </div>
                )}
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
  // 2026-05-12 Phase 3 (audit Q5 = A): added Hired + Conversion columns.
  const sorted = useMemo(() => [...data].sort((a, b) => b.count - a.count), [data]);

  return (
    <div className="bg-dark-850 rounded-xl p-4 border border-dark-700">
      <h3 className="text-sm font-semibold text-dark-200 mb-3">Applications by Recruiter</h3>

      {sorted.length === 0 ? (
        <p className="text-dark-600 text-xs text-center py-4">No data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dark-400 border-b border-dark-700">
                <th className="text-left py-2 pr-3 font-medium uppercase text-[10px] tracking-wider">Recruiter</th>
                <th className="text-right py-2 px-3 font-medium uppercase text-[10px] tracking-wider">Apps</th>
                <th className="text-right py-2 px-3 font-medium uppercase text-[10px] tracking-wider">Hired</th>
                <th className="text-right py-2 px-3 font-medium uppercase text-[10px] tracking-wider">Conversion</th>
                <th className="text-right py-2 pl-3 font-medium uppercase text-[10px] tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const pct = totalApplications > 0
                  ? ((r.count / totalApplications) * 100).toFixed(1)
                  : '0.0';
                const convText = r.conversion == null ? '—' : `${r.conversion}%`;
                // Highlight conversion in green when ≥ 20%, amber 5-20%, dim otherwise.
                // Tells managers at a glance who's closing vs. just sourcing.
                const convColor = r.conversion == null
                  ? 'text-dark-500'
                  : r.conversion >= 20
                  ? 'text-emerald-400'
                  : r.conversion >= 5
                  ? 'text-amber-400'
                  : 'text-dark-400';
                return (
                  <tr key={i} className="border-b border-dark-700/50 last:border-0">
                    <td className="py-2 pr-3 text-dark-200">{r.recruiterName}</td>
                    <td className="py-2 px-3 text-right text-dark-300">{r.count}</td>
                    <td className="py-2 px-3 text-right text-dark-300">{r.hired ?? 0}</td>
                    <td className={`py-2 px-3 text-right font-medium ${convColor}`}>{convText}</td>
                    <td className="py-2 pl-3 text-right text-dark-400">{pct}%</td>
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

/* ── Offer Acceptance Card ────────────────────────────────────────────────
 * Phase 3 (audit Q7 = B). Big rate number + the underlying counts
 * (offered / accepted) so the recruiter can sanity-check what the
 * percentage is computed from. Empty state when no offers in the
 * range — avoids displaying a misleading "0%" before there's data. */
function OfferAcceptanceCard({ data }) {
  const proposed = data?.proposed ?? 0;
  const accepted = data?.accepted ?? 0;
  const rate = data?.rate;
  const rateColor = rate == null ? 'text-dark-500'
    : rate >= 70 ? 'text-emerald-400'
    : rate >= 40 ? 'text-amber-400'
    : 'text-red-400';
  return (
    <div className="bg-dark-850 rounded-xl p-4 border border-dark-700">
      <h3 className="text-sm font-semibold text-dark-200 mb-0.5">Offer Acceptance</h3>
      <p className="text-dark-500 text-[11px] mb-3">Accepted ÷ offered in this window</p>
      {proposed === 0 ? (
        <p className="text-xs text-dark-600 text-center py-4">No offers extended yet</p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={`text-2xl font-bold ${rateColor}`}>{rate == null ? '—' : `${rate}%`}</p>
            <p className="text-[11px] text-dark-500 mt-1">
              {accepted} accepted of {proposed} offered
            </p>
          </div>
          <div className="text-right text-[11px] text-dark-400 space-y-0.5">
            <div><span className="text-emerald-400 font-medium">{accepted}</span> Accepted</div>
            <div><span className="text-dark-300 font-medium">{proposed - accepted}</span> Pending / declined</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Pipeline-health Alert Card ───────────────────────────────────────────
 * 2026-05-12 Phase 2 (audit Q6 = A). Three of these on the dashboard for
 * Stale apps / Awaiting result / Pending approvals. Each renders:
 *   - Heading + threshold label (e.g. "Stale (> 14 days)")
 *   - Count badge
 *   - First N affected records as clickable rows
 *   - "View all" link when items overflow N (capped at 25 server-side)
 * Empty state collapses to a single "All clear" line — recruiters don't
 * need to scroll past three blank cards on a healthy day.
 */
function AlertCard({ title, icon: Icon, iconColor, thresholdLabel, items, renderItem, emptyMessage, viewAllPath }) {
  const list = Array.isArray(items) ? items : [];
  const visible = list.slice(0, 5);
  const overflow = list.length > 5;
  return (
    <div className="bg-dark-850 rounded-xl p-4 border border-dark-700">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${iconColor}`}>
            <Icon size={14} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-dark-200 truncate">{title}</h3>
            <p className="text-[11px] text-dark-500">{thresholdLabel}</p>
          </div>
        </div>
        <span className={`text-xl font-bold ${list.length > 0 ? 'text-amber-400' : 'text-dark-500'}`}>
          {list.length}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-dark-600 text-center py-4">{emptyMessage}</p>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map(renderItem)}
          </ul>
          {overflow && viewAllPath && (
            <Link
              to={viewAllPath}
              className="flex items-center justify-end gap-1 mt-3 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors"
            >
              View all {list.length} <ArrowRight size={12} />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/* ── Main AtsDashboard Component ──────────────────────────────────────── */
export default function AtsDashboard() {
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();

  // 2026-05-14: in-page admin guard removed — /ats/dashboard is the
  // universal ATS landing now, so blocking non-admins here breaks the
  // landing for recruiters. The page renders whatever the API returns;
  // any admin-only data the endpoint chooses to exclude is the API's
  // responsibility, not the page's.
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  // Sticky per-user range. Lazy init reads localStorage; falls back to 30d.
  const [rangeKey, setRangeKey] = useState(() => readStoredRange());

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
    fetchDashboard();
  }, [fetchDashboard]);

  // Full-page loading only on the very first fetch. Subsequent fetches
  // (range change, refresh) keep the existing dashboard rendered and
  // surface progress via the small spinner inside the Refresh button.
  if (loading && !data) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-rivvra-500" />
        </div>
      </div>
    );
  }

  // Empty / no data state
  if (!data) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <FileBarChart size={40} className="mb-3 opacity-40" />
          <p className="text-sm text-dark-300">No data yet</p>
          <p className="text-xs text-dark-500 mt-1">Reporting data will appear once there are applications.</p>
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
    alerts = {},
    offerAcceptance = null,
    refusalReasons = [],
  } = data;

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-dark-100">ATS Dashboard</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="ats-reporting-range" className="sr-only">Time range</label>
          <select
            id="ats-reporting-range"
            value={rangeKey}
            onChange={(e) => {
              const next = e.target.value;
              setRangeKey(next);
              writeStoredRange(next);
            }}
            className="bg-dark-900 border border-dark-700 rounded-lg px-2.5 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fetchDashboard({ silent: true })}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-900 border border-dark-700 text-xs text-dark-200 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh reporting data"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const rangeLabel = TIME_RANGE_OPTIONS.find((o) => o.key === rangeKey)?.label || rangeKey;
              const dateStamp = new Date().toISOString().slice(0, 10);
              downloadCsv(buildReportingCsv(data, rangeLabel), `ats-reporting-${dateStamp}.csv`);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-900 border border-dark-700 text-xs text-dark-200 hover:text-white hover:border-dark-600 transition-colors"
            title="Export to CSV"
            aria-label="Export reporting data as CSV"
          >
            <Download size={12} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Applications" value={totalApplications} icon={BarChart3} color="blue" />
        <StatCard label="Total Candidates" value={totalCandidates} icon={Users} color="purple" />
        <StatCard label="Total Hired" value={hiredCount} icon={UserCheck} color="emerald" />
        <StatCard
          label="Avg Time to Hire"
          value={
            Number.isFinite(Number(avgTimeToHire)) && Number(avgTimeToHire) > 0
              ? `${avgTimeToHire} days`
              : '—'
          }
          icon={Clock}
          color="amber"
        />
      </div>

      {/* ── Funnel (Phase 1) — replaces the old Applications-by-Stage
          horizontal bar; shows same data plus cumulative + conversion %. */}
      <RecruitmentFunnel data={applicationsByStage} />

      {/* ── Pipeline health alerts (Phase 2) ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AlertCard
          title="Stale applications"
          icon={Hourglass}
          iconColor="bg-amber-500/15 text-amber-400"
          thresholdLabel={`> ${alerts.stale?.threshold ?? 14} days in same stage`}
          items={alerts.stale?.items || []}
          emptyMessage="No stale applications."
          viewAllPath={orgPath('/ats/applications')}
          renderItem={(item) => (
            <li key={item.applicationId}>
              <Link
                to={orgPath(`/ats/applications/${item.applicationId}`)}
                className="flex items-baseline justify-between gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-dark-800/50 transition-colors"
              >
                <span className="text-dark-200 truncate min-w-0" title={item.candidateName}>
                  <span className="text-white">{item.candidateName}</span>
                  {item.jobName && <span className="text-dark-500"> · {item.jobName}</span>}
                </span>
                <span className="text-xs text-amber-400 shrink-0">
                  {item.daysSinceLastMove != null ? `${item.daysSinceLastMove}d` : '—'} · {item.stageName}
                </span>
              </Link>
            </li>
          )}
        />
        <AlertCard
          title="Awaiting interview result"
          icon={MessageSquareWarning}
          iconColor="bg-orange-500/15 text-orange-400"
          thresholdLabel={`> ${alerts.awaiting?.threshold ?? 3} days since interview`}
          items={alerts.awaiting?.items || []}
          emptyMessage="No outstanding results."
          viewAllPath={orgPath('/ats/applications')}
          renderItem={(item) => (
            <li key={item.applicationId}>
              <Link
                to={orgPath(`/ats/applications/${item.applicationId}`)}
                className="flex items-baseline justify-between gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-dark-800/50 transition-colors"
              >
                <span className="text-dark-200 truncate min-w-0" title={item.candidateName}>
                  <span className="text-white">{item.candidateName}</span>
                  {item.jobName && <span className="text-dark-500"> · {item.jobName}</span>}
                </span>
                <span className="text-xs text-orange-400 shrink-0">
                  {item.overdue.map((o) => o.label.replace(' Interview', '').replace(' Discussion', '')).join(', ')}
                </span>
              </Link>
            </li>
          )}
        />
        <AlertCard
          title="Pending approvals"
          icon={AlertTriangle}
          iconColor="bg-red-500/15 text-red-400"
          thresholdLabel={`> ${alerts.pendingApprovals?.threshold ?? 24}h awaiting approval`}
          items={alerts.pendingApprovals?.items || []}
          emptyMessage="No jobs waiting for approval."
          viewAllPath={orgPath('/ats/jobs?approvalStatus=pending')}
          renderItem={(item) => (
            <li key={item.jobId}>
              <Link
                to={orgPath(`/ats/jobs/${item.jobId}`)}
                className="flex items-baseline justify-between gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-dark-800/50 transition-colors"
              >
                <span className="text-dark-200 truncate min-w-0" title={item.jobName}>
                  <span className="text-white">{item.jobName}</span>
                  {item.department && <span className="text-dark-500"> · {item.department}</span>}
                </span>
                <span className="text-xs text-red-400 shrink-0">
                  {item.hoursSinceCreated != null ? `${item.hoursSinceCreated}h` : '—'}
                </span>
              </Link>
            </li>
          )}
        />
      </div>

      {/* ── Source breakdown + Refusal reasons (Phase 3 right slot) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarChart
          title="Applications by Source"
          data={applicationsBySource}
          labelKey="source"
          valueKey="count"
          barColor="bg-blue-500"
        />
        <HorizontalBarChart
          title="Refusal Reasons"
          data={refusalReasons}
          labelKey="reasonName"
          valueKey="count"
          barColor="bg-red-500"
        />
      </div>

      {/* ── Offer Acceptance card (Phase 3) ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OfferAcceptanceCard data={offerAcceptance} />
        {/* Right slot reserved for a future "Time-to-fill by job" or
            similar — left empty rather than crammed with filler. */}
      </div>

      {/* ── Recruiter Table ─────────────────────────────────────────────── */}
      <RecruiterTable data={applicationsByRecruiter} totalApplications={totalApplications} />

      {/* ── Job Positions Summary ───────────────────────────────────────── */}
      <div className="bg-dark-850 rounded-xl p-4 border border-dark-700">
        <h3 className="text-sm font-semibold text-dark-200 mb-3">Job Positions Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-dark-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{totalJobs}</p>
            <p className="text-xs text-dark-400 mt-1">Total Jobs</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{hiredCount}</p>
            <p className="text-xs text-dark-400 mt-1">Hired</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{avgTimeToHire}</p>
            <p className="text-xs text-dark-400 mt-1">Avg Days to Hire</p>
          </div>
        </div>
      </div>
    </div>
  );
}
