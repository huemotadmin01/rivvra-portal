import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Loader2, BarChart3, Users, UserCheck, Clock,
  ShieldAlert, FileBarChart,
} from 'lucide-react';

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
                <span className="text-sm text-dark-300 w-32 shrink-0 truncate">
                  {item[labelKey]}
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
  const sorted = [...data].sort((a, b) => b.count - a.count);

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
  const { showToast } = useToast();

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetchDashboard = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.getDashboard(orgSlug);
      if (res.success) {
        setData(res);
      } else {
        showToast('Failed to load reporting data', 'error');
      }
    } catch {
      showToast('Failed to load reporting data', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

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

  // Loading state
  if (loading) {
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
      <div>
        <h1 className="text-2xl font-bold text-white">ATS Reporting</h1>
        <p className="text-dark-400 text-sm mt-1">Recruitment analytics &amp; metrics</p>
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
          value={`${avgTimeToHire} days`}
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
