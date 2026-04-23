// ============================================================================
// MyEarnings.jsx — Member-facing view of their own incentive records
// ============================================================================
// Shows only records where the logged-in employee is the Recruiter or the
// Account Manager. Backend strictly projects fields (no invoice value, no
// consultant salary, no peer's numbers).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import incentiveApi from '../../utils/incentiveApi';
import IncentiveNotificationsBanner from '../../components/incentive/IncentiveNotificationsBanner';
import MonthPicker from '../../components/incentive/MonthPicker';
import {
  Loader2, Award, IndianRupee, Clock, CheckCircle2, XCircle,
  TrendingUp, FileText,
} from 'lucide-react';

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-dark-900 rounded-xl p-5 border border-dark-800">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

const STATUS_STYLE = {
  draft: 'bg-dark-800 text-dark-300',
  approved: 'bg-blue-950 text-blue-300',
  paid: 'bg-emerald-950 text-emerald-300',
  cancelled: 'bg-red-950 text-red-300',
};

export default function MyEarnings() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [monthFilter, setMonthFilter] = useState('');

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, monthFilter]);

  async function load() {
    setLoading(true);
    try {
      const [recRes, sumRes] = await Promise.all([
        incentiveApi.listRecords(orgSlug, {
          scope: 'self',
          payoutMonth: monthFilter || undefined,
        }),
        incentiveApi.getSummary(orgSlug, {
          scope: 'self',
          month: monthFilter || undefined,
        }),
      ]);
      setRecords(recRes?.records || recRes || []);
      setSummary(sumRes || null);
    } catch (e) {
      console.error('Failed to load earnings', e);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const paid = summary?.stats?.paid || { count: 0, amount: 0 };
    const approved = summary?.stats?.approved || { count: 0, amount: 0 };
    const draft = summary?.stats?.draft || { count: 0, amount: 0 };
    const ytd = summary?.ytd || { amount: 0 };
    return { paid, approved, draft, ytd };
  }, [summary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Award className="text-fuchsia-400" /> My Earnings
          </h1>
          <p className="text-sm text-dark-400 mt-1">
            Your Recruiter / Account Manager incentives
          </p>
        </div>
        <MonthPicker
          value={monthFilter}
          onChange={setMonthFilter}
          placeholder="All months"
        />
      </div>

      <IncentiveNotificationsBanner />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Paid (YTD)"
          value={formatINR(stats.ytd.amount)}
          icon={TrendingUp}
          color="bg-emerald-950 text-emerald-400"
        />
        <StatCard
          label={monthFilter ? 'Paid (month)' : 'Paid (this period)'}
          value={formatINR(stats.paid.amount)}
          icon={CheckCircle2}
          color="bg-emerald-950 text-emerald-400"
        />
        <StatCard
          label="Approved (awaiting payslip)"
          value={formatINR(stats.approved.amount)}
          icon={Clock}
          color="bg-blue-950 text-blue-400"
        />
        <StatCard
          label="In draft"
          value={formatINR(stats.draft.amount)}
          icon={FileText}
          color="bg-dark-800 text-dark-300"
        />
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Records {monthFilter ? `· ${monthFilter}` : ''}
          </h2>
          <span className="text-xs text-dark-400">{records.length} items</span>
        </div>
        {records.length === 0 ? (
          <div className="p-10 text-center text-dark-400">
            <IndianRupee className="mx-auto mb-2 opacity-50" size={28} />
            <p className="text-sm">No incentive records yet for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-850 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Client</th>
                  <th className="text-left px-4 py-2 font-medium">Consultant</th>
                  <th className="text-left px-4 py-2 font-medium">Service Month</th>
                  <th className="text-left px-4 py-2 font-medium">Your Role</th>
                  <th className="text-right px-4 py-2 font-medium">Your Incentive</th>
                  <th className="text-left px-4 py-2 font-medium">Payout Month</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r._id}
                    className="border-t border-dark-800 hover:bg-dark-850 cursor-pointer transition-colors"
                    onClick={() => navigate(orgPath(`/incentive/records/${r._id}`))}
                  >
                    <td className="px-4 py-3 text-white">{r.clientName || '—'}</td>
                    <td className="px-4 py-3 text-dark-300">{r.consultantName || '—'}</td>
                    <td className="px-4 py-3 text-dark-300">{r.serviceMonth || '—'}</td>
                    <td className="px-4 py-3 text-dark-300">
                      {r.yourRole === 'recruiter'
                        ? 'Recruiter'
                        : r.yourRole === 'account_manager'
                        ? 'Account Manager'
                        : '—'}
                      {r.alsoRole && (
                        <span className="ml-1 text-xs text-dark-500">
                          (+ {r.alsoRole === 'recruiter' ? 'Recruiter' : 'AM'})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {formatINR(r.yourIncentive)}
                    </td>
                    <td className="px-4 py-3 text-dark-300">{r.payoutMonth || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_STYLE[r.status] || 'bg-dark-800 text-dark-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
