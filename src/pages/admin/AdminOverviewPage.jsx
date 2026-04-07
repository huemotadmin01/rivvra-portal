import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import {
  Building2, Users, Clock, AlertTriangle, CreditCard,
  TrendingUp, Loader2, ChevronRight
} from 'lucide-react';

const statCards = [
  { key: 'totalOrgs', label: 'Total Workspaces', icon: Building2, color: 'blue' },
  { key: 'paidOrgs', label: 'Paid Orgs', icon: CreditCard, color: 'emerald' },
  { key: 'trialActive', label: 'Active Trials', icon: Clock, color: 'green' },
  { key: 'trialGrace', label: 'Grace Period', icon: AlertTriangle, color: 'amber' },
  { key: 'expiringIn7Days', label: 'Expiring in 7 Days', icon: AlertTriangle, color: 'red' },
  { key: 'totalUsers', label: 'Total Users', icon: Users, color: 'purple' },
  { key: 'orgsCreatedThisMonth', label: 'New Orgs This Month', icon: TrendingUp, color: 'cyan' },
  { key: 'usersCreatedThisMonth', label: 'New Users This Month', icon: TrendingUp, color: 'indigo' },
];

const colorMap = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'text-blue-400' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-400' },
  green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', icon: 'text-green-400' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400' },
  red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: 'text-red-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', icon: 'text-purple-400' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', icon: 'text-cyan-400' },
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400', icon: 'text-indigo-400' },
};

function AdminOverviewPage() {
  const [stats, setStats] = useState(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, wsRes] = await Promise.all([
        api.getSuperAdminStats(),
        api.getSuperAdminWorkspaces({ page: 1, limit: 10, sort: 'createdAt', order: 'desc' }),
      ]);
      setStats(statsRes.stats);
      setRecentWorkspaces(wsRes.workspaces || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-400 mt-1">Rivvra platform overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const colors = colorMap[card.color];
          const value = stats?.[card.key] ?? 0;
          return (
            <div
              key={card.key}
              className={`${colors.bg} border ${colors.border} rounded-xl p-5`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-dark-400">{card.label}</span>
                <card.icon className={`w-5 h-5 ${colors.icon}`} />
              </div>
              <div className={`text-3xl font-bold ${colors.text}`}>
                {value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Seats Usage */}
      {stats && (
        <div className="bg-dark-900/50 border border-dark-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-white">Total Platform Seats</span>
            <span className="text-sm text-dark-400">
              {stats.usedSeats?.toLocaleString()} / {stats.totalSeats?.toLocaleString()} used
            </span>
          </div>
          <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${stats.totalSeats > 0 ? Math.min(100, (stats.usedSeats / stats.totalSeats) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Recent Workspaces */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-800">
          <h2 className="text-base font-semibold text-white">Recent Workspaces</h2>
          <Link
            to="/admin/workspaces"
            className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="divide-y divide-dark-800">
          {recentWorkspaces.length === 0 ? (
            <div className="px-5 py-8 text-center text-dark-400">No workspaces yet</div>
          ) : (
            recentWorkspaces.map((ws) => (
              <Link
                key={ws._id}
                to={`/admin/workspaces/${ws._id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-dark-800/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-dark-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ws.name}</p>
                  <p className="text-xs text-dark-500">{ws.slug} · {ws.ownerEmail || 'No owner'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <PlanBadge plan={ws.plan} />
                  <TrialStatusBadge status={ws.trial?.status} />
                  <span className="text-xs text-dark-500">
                    {ws.billing?.seatsUsed || 0}/{ws.billing?.seatsTotal || 0} seats
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PlanBadge({ plan }) {
  const colors = {
    trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    pro: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    enterprise: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors[plan] || colors.trial}`}>
      {(plan || 'trial').toUpperCase()}
    </span>
  );
}

function TrialStatusBadge({ status }) {
  if (!status || status === 'none') return null;
  const colors = {
    active: 'bg-green-500/10 text-green-400',
    grace: 'bg-amber-500/10 text-amber-400',
    archived: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] || ''}`}>
      {status}
    </span>
  );
}

export default AdminOverviewPage;
