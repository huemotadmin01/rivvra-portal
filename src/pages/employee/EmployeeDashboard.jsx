import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePageTitle } from '../../hooks/usePageTitle';
import employeeApi from '../../utils/employeeApi';
import { formatDateUTC } from '../../utils/dateUtils';
import {
  Loader2, Users, UserCheck, UserX, UserMinus,
  Building2, Briefcase, Calendar, AlertTriangle, Clock,
  TrendingUp, ChevronDown,
} from 'lucide-react';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function periodToDates(period, customFrom, customTo) {
  const now = new Date();
  let from, to;
  switch (period) {
    case 'current_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last_month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'last_3_months':
      from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'custom':
      from = customFrom ? new Date(customFrom) : null;
      to = customTo ? new Date(customTo) : null;
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return {
    from: from ? from.toISOString().slice(0, 10) : '',
    to: to ? to.toISOString().slice(0, 10) : '',
  };
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function KPICard({ label, value, icon: Icon, color = 'dark', subtitle }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dark: 'bg-dark-800 text-dark-200 border-dark-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs opacity-70">{label}</span>
        <Icon size={16} className="opacity-50" />
      </div>
      <p className="text-2xl font-bold">{value ?? 0}</p>
      {subtitle && <p className="text-[10px] opacity-60 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function HorizontalBar({ items, color = 'rivvra' }) {
  const max = Math.max(...items.map(i => i.count), 1);
  const gradient = color === 'rivvra'
    ? 'from-rivvra-500 to-emerald-500'
    : color === 'orange'
      ? 'from-orange-500 to-amber-500'
      : 'from-blue-500 to-cyan-500';
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.name || item.label} className="flex items-center gap-3">
          <span className="text-xs text-dark-400 w-32 text-right truncate" title={item.name || item.label}>{item.name || item.label}</span>
          <div className="flex-1 bg-dark-800 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${gradient} rounded-full flex items-center justify-end px-2 transition-all duration-500`}
              style={{ width: `${Math.max((item.count / max) * 100, item.count > 0 ? 8 : 0)}%` }}
            >
              {item.count > 0 && <span className="text-[10px] text-white font-medium">{item.count}</span>}
            </div>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-dark-500 text-center py-2">No data</p>}
    </div>
  );
}

function BillableBar({ billable = 0, nonBillable = 0 }) {
  const total = billable + nonBillable || 1;
  const billPct = Math.round((billable / total) * 100);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-dark-400">Billable</span>
            <span className="text-xs text-emerald-400 font-medium">{billable} ({billPct}%)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-dark-400">Non-Billable</span>
            <span className="text-xs text-amber-400 font-medium">{nonBillable} ({100 - billPct}%)</span>
          </div>
        </div>
      </div>
      <div className="w-full bg-dark-800 rounded-full h-4 overflow-hidden flex">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
          style={{ width: `${billPct}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
          style={{ width: `${100 - billPct}%` }}
        />
      </div>
    </div>
  );
}

function AlertCard({ title, icon: Icon, borderColor, items, renderItem }) {
  return (
    <div className={`bg-dark-800/50 border ${borderColor} rounded-xl p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-dark-300" />
        <h3 className="text-sm font-semibold text-dark-200">{title}</h3>
        {items.length > 0 && (
          <span className="ml-auto text-[10px] bg-dark-700 text-dark-300 px-2 py-0.5 rounded-full">{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-dark-500 text-center py-4">None</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

function MiniTable({ title, icon: Icon, columns, rows, orgSlug }) {
  return (
    <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-dark-300" />
        <h3 className="text-sm font-semibold text-dark-200">{title}</h3>
        {rows.length > 0 && (
          <span className="ml-auto text-[10px] bg-dark-700 text-dark-300 px-2 py-0.5 rounded-full">{rows.length}</span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-dark-500 text-center py-4">No records</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dark-400 border-b border-dark-700">
                {columns.map(col => (
                  <th key={col.key} className="pb-2 text-left font-medium pr-3">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._id || i} className="border-b border-dark-700/50 last:border-0">
                  {columns.map(col => (
                    <td key={col.key} className="py-2 pr-3 text-dark-300">
                      {col.key === 'fullName' && row._id ? (
                        <Link to={`/org/${orgSlug}/employee/${row._id}`} className="text-rivvra-400 hover:underline">
                          {row[col.key] || '-'}
                        </Link>
                      ) : col.key === 'joiningDate' || col.key === 'lastWorkingDate' ? (
                        row[col.key] ? formatDateUTC(row[col.key]) : '-'
                      ) : (
                        row[col.key] || '-'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function EmployeeDashboard() {
  usePageTitle('Employee Dashboard');
  const { orgSlug } = useOrg();
  const { showToast } = useToast();

  const [period, setPeriod] = useState('current_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const dates = useMemo(() => periodToDates(period, customFrom, customTo), [period, customFrom, customTo]);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    employeeApi.getDashboard(orgSlug, dates)
      .then(res => { if (res.success !== false) setData(res); })
      .catch(() => showToast('Failed to load employee dashboard', 'error'))
      .finally(() => setLoading(false));
  }, [orgSlug, dates.from, dates.to]);

  /* ── Loading state ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-dark-400 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const kpis = data.overview || {};
  // Backend returns byType as object { confirmed: 22, ... }, convert to array
  const byTypeObj = data.byType || {};
  const byType = typeof byTypeObj === 'object' && !Array.isArray(byTypeObj)
    ? Object.entries(byTypeObj).map(([name, count]) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), count }))
    : (Array.isArray(byTypeObj) ? byTypeObj : []);
  const billableSplit = data.billableSplit || {};
  const periodStats = { newJoiners: (data.newJoiners || []).length, offBoarded: (data.offBoarded || []).length };
  const byDepartment = data.byDepartment || [];
  const byEmpType = byType;
  const newJoiners = data.newJoiners || [];
  const offBoarded = data.offBoarded || [];
  const upcomingLwds = data.upcomingLWDs || [];
  const expiringAssignments = data.expiringAssignments || [];
  const probationEnding = data.probationEnding || [];

  const periodLabels = {
    current_month: 'Current Month',
    last_month: 'Last Month',
    last_3_months: 'Last 3 Months',
    custom: 'Custom Range',
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg font-semibold text-dark-100">Employee Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="appearance-none bg-dark-800 border border-dark-700 text-dark-200 text-xs rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-rivvra-500"
            >
              {Object.entries(periodLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="bg-dark-800 border border-dark-700 text-dark-200 text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-rivvra-500"
              />
              <span className="text-dark-500 text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="bg-dark-800 border border-dark-700 text-dark-200 text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-rivvra-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Employees" value={kpis.total} icon={Users} color="emerald" />
        <KPICard label="Active" value={kpis.active} icon={UserCheck} color="green" />
        <KPICard label="Resigned" value={kpis.resigned} icon={UserX} color="amber" />
        <KPICard label="Terminated" value={kpis.terminated} icon={UserMinus} color="red" />
      </div>

      {/* ── Secondary Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* By Employment Type */}
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-dark-300" />
            <h3 className="text-sm font-semibold text-dark-200">By Employment Type</h3>
          </div>
          <div className="space-y-3">
            {byType.length === 0 ? (
              <p className="text-xs text-dark-500 text-center py-2">No data</p>
            ) : (
              byType.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="text-xs text-dark-300">{item.name}</span>
                  <span className="text-xs font-semibold text-dark-200 bg-dark-700 px-2 py-0.5 rounded-full">{item.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Billable Split */}
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-dark-300" />
            <h3 className="text-sm font-semibold text-dark-200">Billable Split</h3>
          </div>
          <BillableBar billable={billableSplit.billable} nonBillable={billableSplit.nonBillable} />
        </div>

        {/* Period Stats */}
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-dark-300" />
            <h3 className="text-sm font-semibold text-dark-200">Period Stats</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400">{periodStats.newJoiners ?? 0}</p>
              <p className="text-[10px] text-dark-400 mt-1">New Joiners</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">{periodStats.offBoarded ?? 0}</p>
              <p className="text-[10px] text-dark-400 mt-1">Off-boarded</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-dark-300" />
            <h3 className="text-sm font-semibold text-dark-200">Employees by Department</h3>
          </div>
          <HorizontalBar items={byDepartment} color="rivvra" />
        </div>

        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-dark-300" />
            <h3 className="text-sm font-semibold text-dark-200">Employees by Type</h3>
          </div>
          <HorizontalBar items={byEmpType} color="orange" />
        </div>
      </div>

      {/* ── Tables Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniTable
          title="New Joiners"
          icon={UserCheck}
          orgSlug={orgSlug}
          columns={[
            { key: 'fullName', label: 'Name' },
            { key: 'employmentType', label: 'Type' },
            { key: 'department', label: 'Department' },
            { key: 'joiningDate', label: 'Joining Date' },
          ]}
          rows={newJoiners}
        />

        <MiniTable
          title="Off-boarded"
          icon={UserMinus}
          orgSlug={orgSlug}
          columns={[
            { key: 'fullName', label: 'Name' },
            { key: 'employmentType', label: 'Type' },
            { key: 'lastWorkingDate', label: 'LWD' },
            { key: 'separationReason', label: 'Reason' },
          ]}
          rows={offBoarded}
        />
      </div>

      {/* ── Alert Cards Row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AlertCard
          title="Upcoming LWDs"
          icon={AlertTriangle}
          borderColor="border-amber-500/30"
          items={upcomingLwds}
          renderItem={item => (
            <div key={item._id || item.fullName || item.name} className="flex items-center justify-between bg-dark-900/50 rounded-lg px-3 py-2">
              <div>
                {item._id ? (
                  <Link to={`/org/${orgSlug}/employee/${item._id}`} className="text-xs text-rivvra-400 hover:underline font-medium">{item.fullName || item.name}</Link>
                ) : (
                  <p className="text-xs text-dark-200 font-medium">{item.fullName || item.name}</p>
                )}
                <p className="text-[10px] text-dark-500">{item.lastWorkingDate ? formatDateUTC(item.lastWorkingDate) : '-'}</p>
              </div>
              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                {item.daysLeft != null ? `${item.daysLeft}d left` : '-'}
              </span>
            </div>
          )}
        />

        <AlertCard
          title="Expiring Assignments"
          icon={Clock}
          borderColor="border-orange-500/30"
          items={expiringAssignments}
          renderItem={item => (
            <div key={item._id || item.fullName || item.name} className="flex items-center justify-between bg-dark-900/50 rounded-lg px-3 py-2">
              <div>
                {item._id ? (
                  <Link to={`/org/${orgSlug}/employee/${item._id}`} className="text-xs text-rivvra-400 hover:underline font-medium">{item.fullName || item.name}</Link>
                ) : (
                  <p className="text-xs text-dark-200 font-medium">{item.fullName || item.name}</p>
                )}
                <p className="text-[10px] text-dark-500">{item.client || '-'} &middot; ends {item.endDate ? formatDateUTC(item.endDate) : '-'}</p>
              </div>
              <span className="text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                {item.daysLeft != null ? `${item.daysLeft}d left` : '-'}
              </span>
            </div>
          )}
        />

        <AlertCard
          title="Probation Ending"
          icon={Calendar}
          borderColor="border-blue-500/30"
          items={probationEnding}
          renderItem={item => (
            <div key={item._id || item.fullName || item.name} className="flex items-center justify-between bg-dark-900/50 rounded-lg px-3 py-2">
              <div>
                {item._id ? (
                  <Link to={`/org/${orgSlug}/employee/${item._id}`} className="text-xs text-rivvra-400 hover:underline font-medium">{item.fullName || item.name}</Link>
                ) : (
                  <p className="text-xs text-dark-200 font-medium">{item.fullName || item.name}</p>
                )}
                <p className="text-[10px] text-dark-500">{item.probationEnd ? formatDateUTC(item.probationEnd) : '-'}</p>
              </div>
              <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                {item.daysLeft != null ? `${item.daysLeft}d left` : '-'}
              </span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
