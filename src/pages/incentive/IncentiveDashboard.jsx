// ============================================================================
// IncentiveDashboard.jsx — Admin dashboard (totals, trend, leaderboard)
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import incentiveApi from '../../utils/incentiveApi';
import IncentiveNotificationsBanner from '../../components/incentive/IncentiveNotificationsBanner';
import MonthPicker from '../../components/incentive/MonthPicker';
import {
  Loader2, TrendingUp, CheckCircle2, Clock, FileText, Users, Plus, Hourglass,
} from 'lucide-react';

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-dark-900 rounded-xl p-5 border border-dark-800">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-dark-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function IncentiveDashboard() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [waiting, setWaiting] = useState({ count: 0, groups: [] });
  const [waitingOpen, setWaitingOpen] = useState(false);

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, month]);

  async function load() {
    setLoading(true);
    try {
      const [summary, waitingRes] = await Promise.all([
        incentiveApi.getSummary(orgSlug, {
          scope: 'admin',
          month: month || undefined,
        }),
        incentiveApi.getWaitingOnPayroll(orgSlug).catch(() => null),
      ]);
      setData(summary || null);
      if (waitingRes?.success) {
        setWaiting({ count: waitingRes.count || 0, groups: waitingRes.groups || [] });
      }
    } catch (e) {
      console.error('Failed to load dashboard', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
      </div>
    );
  }

  const stats = data?.stats || {};
  const trend = data?.trend || [];
  const leaderboard = data?.leaderboard || [];
  const byClient = data?.byClient || [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.amount || 0));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incentive Dashboard</h1>
          <p className="text-sm text-dark-400 mt-1">
            Org-wide commission tracking for Recruiters & Account Managers
          </p>
        </div>
        <div className="flex gap-2">
          <MonthPicker
            value={month}
            onChange={setMonth}
            placeholder="Current month"
          />
          <button
            onClick={() => navigate(orgPath('/incentive/records/new'))}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <Plus size={16} /> New Record
          </button>
        </div>
      </div>

      <IncentiveNotificationsBanner />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Paid"
          value={formatINR(stats.paid?.amount)}
          sub={`${stats.paid?.count || 0} records`}
          icon={CheckCircle2}
          color="bg-emerald-950 text-emerald-400"
        />
        <StatCard
          label="Approved (pending payout)"
          value={formatINR(stats.approved?.amount)}
          sub={`${stats.approved?.count || 0} records`}
          icon={Clock}
          color="bg-blue-950 text-blue-400"
        />
        <StatCard
          label="Draft"
          value={formatINR(stats.draft?.amount)}
          sub={`${stats.draft?.count || 0} records`}
          icon={FileText}
          color="bg-dark-800 text-dark-300"
        />
        <StatCard
          label={month ? 'Forecast (this month)' : 'YTD Paid'}
          value={formatINR(month ? stats.forecast?.amount : data?.ytd?.amount)}
          sub={month ? 'Approved + draft for this month' : 'Calendar YTD'}
          icon={TrendingUp}
          color="bg-fuchsia-950 text-fuchsia-400"
        />
      </div>

      <WaitingOnPayrollCard
        count={waiting.count}
        groups={waiting.groups}
        open={waitingOpen}
        onToggle={() => setWaitingOpen((v) => !v)}
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            12-Month Trend (paid + approved)
          </h2>
          {trend.length === 0 ? (
            <p className="text-sm text-dark-400">No data yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {trend.map((t) => (
                <div
                  key={t.month}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${t.month}: ${formatINR(t.amount)}`}
                >
                  <div
                    className="w-full bg-fuchsia-600 rounded-t"
                    style={{
                      height: `${((t.amount || 0) / maxTrend) * 100}%`,
                      minHeight: '2px',
                    }}
                  />
                  <span className="text-[10px] text-dark-500 -rotate-45 origin-top-left translate-y-2">
                    {t.month?.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={16} /> Top Earners
          </h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-dark-400">No data yet.</p>
          ) : (
            <ul className="space-y-2">
              {leaderboard.slice(0, 8).map((e, i) => (
                <li
                  key={e.employeeId || i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-dark-300">
                    {i + 1}. {e.name || '—'}
                  </span>
                  <span className="font-semibold text-white">
                    {formatINR(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {byClient.length > 0 && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            By Client
          </h2>
          <table className="w-full text-sm">
            <thead className="text-dark-400 text-xs uppercase">
              <tr>
                <th className="text-left px-2 py-1 font-medium">Client</th>
                <th className="text-right px-2 py-1 font-medium">Records</th>
                <th className="text-right px-2 py-1 font-medium">Net Profit</th>
                <th className="text-right px-2 py-1 font-medium">Incentive</th>
              </tr>
            </thead>
            <tbody>
              {byClient.map((c) => (
                <tr key={c.clientName} className="border-t border-dark-800">
                  <td className="px-2 py-2 text-white">{c.clientName}</td>
                  <td className="px-2 py-2 text-right text-dark-300">{c.count}</td>
                  <td className="px-2 py-2 text-right text-dark-300">
                    {formatINR(c.netProfit)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-white">
                    {formatINR(c.incentive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WaitingOnPayrollCard({ count, groups, open, onToggle }) {
  if (!count) return null;
  return (
    <div className="bg-amber-950/30 border border-amber-900/40 rounded-xl p-5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-900/40 text-amber-300">
            <Hourglass size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Waiting on payroll
              <span className="ml-2 text-2xl font-bold text-amber-300">{count}</span>
            </p>
            <p className="text-xs text-dark-400 mt-0.5">
              Paid invoices waiting for the consultant&apos;s payslip to release.
              Drafts auto-create once payroll is marked paid.
            </p>
          </div>
        </div>
        <span className="text-xs text-amber-300">{open ? 'Hide' : 'Show details'}</span>
      </button>
      {open && groups.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-amber-900/40">
          <table className="w-full text-sm">
            <thead className="text-dark-400 text-xs uppercase bg-dark-900/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Consultant</th>
                <th className="text-left px-3 py-2 font-medium">Service Month</th>
                <th className="text-left px-3 py-2 font-medium">Invoices</th>
                <th className="text-right px-3 py-2 font-medium">Value</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr
                  key={`${g.consultantEmployeeId}|${g.serviceMonth}`}
                  className="border-t border-amber-900/30"
                >
                  <td className="px-3 py-2 text-white">{g.consultantName || '—'}</td>
                  <td className="px-3 py-2 text-dark-300">{g.serviceMonth}</td>
                  <td className="px-3 py-2 text-dark-300">
                    {(g.invoiceNumbers || []).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-dark-300">
                    {formatINR(g.untaxedInvoicedValue)}
                  </td>
                  <td className="px-3 py-2 text-amber-300">
                    {g.reason === 'salary_hold'
                      ? 'Salary on hold'
                      : 'Payslip not released'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
