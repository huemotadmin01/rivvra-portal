/**
 * TimesheetPayConfig — Payroll Dashboard
 * Financial overview, upcoming disbursements, client billing & employee pay config.
 * All pay data is managed in the Employee Directory. Roles in Settings > Users & Teams.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import {
  Search, Users, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  IndianRupee, CalendarDays,
  CheckCircle2, Circle, Clock,
  UserX, ArrowRight,
} from 'lucide-react';
import { getPayConfig, getPayrollSummary, getNotApprovedTimesheets } from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton, PendingListSkeleton } from '../../components/Skeletons';

/* ── Helpers (unchanged) ────────────────────────────────────────────────── */

function pickBillingRate(rateObj) {
  if (!rateObj) return null;
  const d = Number(rateObj.daily) || 0;
  const h = Number(rateObj.hourly) || 0;
  const m = Number(rateObj.monthly) || 0;
  if (m) return { value: m, suffix: '/mo', prefix: '\u20B9' };
  if (d) return { value: d, suffix: '/day', prefix: '\u20B9' };
  if (h) return { value: h, suffix: '/hr', prefix: '$' };
  return null;
}

function formatRate(rate) {
  if (!rate) return '\u2014';
  return `${rate.prefix}${rate.value.toLocaleString('en-IN')}${rate.suffix}`;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const typeLabels = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal',
  external_consultant: 'External',
  intern: 'Intern',
};

const typeBadgeColors = {
  confirmed: 'bg-blue-500/10 text-blue-400',
  internal_consultant: 'bg-purple-500/10 text-purple-400',
  external_consultant: 'bg-amber-500/10 text-amber-400',
  intern: 'bg-emerald-500/10 text-emerald-400',
};

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PAY_TABLE_PAGE_SIZE = 20;

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function TimesheetPayConfig() {
  const { timesheetUser } = useTimesheetContext();
  const { getAppRole, currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const orgRole = currentOrg ? getAppRole('timesheet') : null;
  const effectiveRole = orgRole || timesheetUser?.role || 'contractor';
  const isAdmin = effectiveRole === 'admin';

  // Month/year selector
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Data states
  const [payrollData, setPayrollData] = useState(null);
  const [currentMonthPayroll, setCurrentMonthPayroll] = useState(null); // always current month, independent of selector
  const [payConfigData, setPayConfigData] = useState(null);
  const [notApprovedData, setNotApprovedData] = useState(null);
  const [loading, setLoading] = useState(true);

  // UI states
  const [showEmployeeTable, setShowEmployeeTable] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSynced, setFilterSynced] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Navigation
  const goMonth = (dir) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  // Current month (fixed, for disbursements)
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Data fetching — selected month for summary cards/stepper, current month for disbursements
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const isCurrentMonth = month === currentMonth && year === currentYear;
      const fetches = [
        getPayrollSummary(month, year).catch(() => null),
        getPayConfig().catch(() => null),
        getNotApprovedTimesheets().catch(() => null),
      ];
      // Only fetch current month separately if selector is on a different month
      if (!isCurrentMonth) fetches.push(getPayrollSummary(currentMonth, currentYear).catch(() => null));

      const results = await Promise.all(fetches);
      setPayrollData(results[0]);
      if (results[1]?.success) setPayConfigData(results[1]);
      setNotApprovedData(results[2]);
      setCurrentMonthPayroll(isCurrentMonth ? results[0] : results[3]);
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally { setLoading(false); }
  }, [month, year, currentMonth, currentYear]);

  useEffect(() => { if (isAdmin) fetchDashboardData(); else setLoading(false); }, [isAdmin, fetchDashboardData]);

  // Pay config employee data
  const employees = useMemo(() => payConfigData?.employees || [], [payConfigData]);
  const syncedCount = useMemo(() => employees.filter(e => e.tsConfig.synced).length, [employees]);

  // Pay config table filtering
  const filtered = useMemo(() => {
    return employees.filter(emp => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !emp.fullName?.toLowerCase().includes(q) &&
          !emp.email?.toLowerCase().includes(q) &&
          !emp.employeeId?.toLowerCase().includes(q) &&
          !emp.designation?.toLowerCase().includes(q)
        ) return false;
      }
      if (filterSynced === 'synced' && !emp.tsConfig.synced) return false;
      if (filterSynced === 'not_synced' && emp.tsConfig.synced) return false;
      return true;
    });
  }, [employees, search, filterSynced]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAY_TABLE_PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAY_TABLE_PAGE_SIZE;
    return filtered.slice(start, start + PAY_TABLE_PAGE_SIZE);
  }, [filtered, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [search, filterSynced]);

  /* ── Loading skeleton ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <PageSkeleton>
        <HeaderSkeleton titleW="w-48" subtitleW="w-72" withButton />
        <CardGridSkeleton count={4} />
        <div className="card p-4 space-y-3">
          <div className="h-5 bg-dark-800 rounded w-full" />
          <div className="h-2 bg-dark-800/50 rounded w-3/4" />
        </div>
        <PendingListSkeleton count={5} />
      </PageSkeleton>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <p className="text-dark-400">You need admin access to view the payroll dashboard.</p>
        </div>
      </div>
    );
  }

  const summary = payrollData?.summary || {};
  const payrollRun = payrollData?.payrollRun;
  const disbursementEmployees = currentMonthPayroll?.employees || [];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">

      {/* ═══ Header + Month Selector ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Payroll Dashboard</h1>
          <p className="text-dark-400 text-sm">Financial overview, disbursements & employee pay rates</p>
        </div>
        <div className="flex items-center">
          <button onClick={() => goMonth(-1)} className="p-2.5 rounded-l-xl bg-dark-800/80 border border-dark-700 border-r-0 text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <ChevronLeft size={18} />
          </button>
          <div className="relative bg-gradient-to-b from-dark-800 to-dark-900 border-y border-dark-700 px-5 py-2 flex items-center gap-3 min-w-[200px] justify-center">
            <CalendarDays size={18} className="text-rivvra-500 shrink-0" />
            <div className="flex items-baseline gap-2">
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="bg-transparent text-white font-semibold text-base outline-none cursor-pointer appearance-none pr-4 hover:text-rivvra-400 transition-colors"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2366666680' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}>
                {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1} className="bg-dark-900">{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="bg-transparent text-dark-400 font-medium text-sm outline-none cursor-pointer appearance-none pr-4 hover:text-dark-200 transition-colors"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2366666680' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => <option key={y} value={y} className="bg-dark-900">{y}</option>)}
              </select>
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-rivvra-500/50 rounded-full" />
          </div>
          <button onClick={() => goMonth(1)} className="p-2.5 rounded-r-xl bg-dark-800/80 border border-dark-700 border-l-0 text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ═══ Summary Cards ═══ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Total Payable */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm text-dark-400">Total Payable</span>
            <IndianRupee size={16} className="text-amber-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{'\u20B9'}{fmt(summary.totalPayable)}</p>
          <p className="text-xs text-dark-500 mt-1">{monthNames[month]} {year}</p>
        </div>

        {/* Employees */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm text-dark-400">Employees</span>
            <Users size={16} className="text-purple-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{summary.employeeCount || 0}</p>
          <p className="text-xs text-dark-500 mt-1">
            <span className="text-emerald-400">{summary.paidCount || 0} paid</span>
            {(summary.unpaidCount || 0) > 0 && <span className="text-amber-400 ml-2">{summary.unpaidCount} unpaid</span>}
            {(summary.onHoldCount || 0) > 0 && <span className="text-red-400 ml-2">{summary.onHoldCount} on hold</span>}
          </p>
        </div>
      </div>

      {/* ═══ Payroll Run Status (read-only stepper) ═══ */}
      {(() => {
        const status = payrollRun?.status || 'open';
        const steps = [
          { key: 'open', label: 'Open' },
          { key: 'locked', label: 'Locked' },
          { key: 'processed', label: 'Processed' },
          { key: 'finalized', label: 'Finalized' },
        ];
        const statusIndex = steps.findIndex(s => s.key === status);
        const statusColors = {
          open: 'border-dark-700 bg-dark-800/50',
          locked: 'border-amber-500/30 bg-amber-500/5',
          processed: 'border-blue-500/30 bg-blue-500/5',
          finalized: 'border-emerald-500/30 bg-emerald-500/5',
        };
        const statusInfo = {
          open: { text: 'Payroll is open. Lock to freeze timesheet inputs before processing.', color: 'text-dark-400' },
          locked: { text: 'Inputs frozen. Employees cannot submit or edit timesheets.', color: 'text-amber-400/80' },
          processed: { text: 'Payroll processed. Review and finalize to close the month.', color: 'text-blue-400/80' },
          finalized: { text: `Payroll finalized for ${monthNames[month]} ${year}. No further changes.`, color: 'text-emerald-400/80' },
        };

        return (
          <div className={`card border ${statusColors[status]} p-4 space-y-3`}>
            {/* Step Indicator */}
            <div className="flex items-center gap-1 sm:gap-2">
              {steps.map((step, i) => {
                const isActive = step.key === status;
                const isPast = i < statusIndex;
                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex items-center gap-1.5 flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isActive ? 'bg-rivvra-500 text-dark-950 ring-2 ring-rivvra-500/30' :
                        isPast ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-dark-700 text-dark-500'
                      }`}>
                        {isPast ? <CheckCircle2 size={12} /> : isActive ? <Circle size={8} className="fill-current" /> : <Circle size={8} />}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        isActive ? 'text-white' : isPast ? 'text-emerald-400/70' : 'text-dark-500'
                      }`}>{step.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`flex-1 h-px mx-1 sm:mx-2 ${isPast ? 'bg-emerald-500/30' : 'bg-dark-700'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Info + Link */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-xs ${statusInfo[status].color}`}>{statusInfo[status].text}</p>
              {status !== 'finalized' && (
                <Link to={orgPath('/payroll/process')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-700 border border-dark-600 text-dark-200 hover:bg-dark-600 hover:text-white transition-colors">
                  Go to Process Payroll <ArrowRight size={12} />
                </Link>
              )}
              {status === 'finalized' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 size={14} /> Finalized
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══ Unapproved timesheets alert ═══ */}
      {(() => {
        const monthData = notApprovedData?.months?.find(m => m.month === month && m.year === year);
        if (!monthData || monthData.notApprovedCount === 0) return null;
        return (
          <div className="card border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <UserX size={16} className="text-amber-400 shrink-0" />
                <span className="text-xs sm:text-sm text-white font-medium">
                  {monthData.notApprovedCount} of {monthData.totalBillable} billable employees
                </span>
                <span className="text-xs sm:text-sm text-amber-400/80 hidden sm:inline">have unapproved timesheets</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Upcoming Disbursements (always current month) ═══ */}
      <DisbursementList employees={disbursementEmployees} orgPath={orgPath} />

      {/* ═══ Employee Pay Configuration (collapsible) ═══ */}
      <div className="card overflow-hidden">
        <button onClick={() => setShowEmployeeTable(!showEmployeeTable)}
          className="w-full p-4 flex items-center justify-between hover:bg-dark-800/30 transition-colors">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Users size={16} className="text-rivvra-400" />
            Employee Pay Configuration
            <span className="text-xs text-dark-500 font-normal ml-1">
              {employees.length} employees &middot; {syncedCount} synced
            </span>
          </h3>
          {showEmployeeTable
            ? <ChevronUp size={16} className="text-dark-400" />
            : <ChevronDown size={16} className="text-dark-400" />
          }
        </button>

        {showEmployeeTable && (
          <>
            {/* Search & Filter */}
            <div className="px-4 pb-3 flex items-center gap-3 border-t border-dark-800 pt-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email, ID, or designation..."
                  className="input-field w-full pl-10"
                />
              </div>
              <select
                value={filterSynced}
                onChange={e => setFilterSynced(e.target.value)}
                className="input-field w-auto"
              >
                <option value="all">All ({employees.length})</option>
                <option value="synced">Synced ({syncedCount})</option>
                <option value="not_synced">Not Synced ({employees.length - syncedCount})</option>
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider sticky left-0 bg-dark-900 z-10 min-w-[240px] border-r border-dark-700 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.4)]">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Pay Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider min-w-[120px]">Client</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider whitespace-nowrap">Candidate Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider whitespace-nowrap">Client Rate</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider whitespace-nowrap">Start Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider whitespace-nowrap">End Date</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider whitespace-nowrap">Paid Leave</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {paginated.map(emp => (
                    <EmployeeRow key={emp._id} emp={emp} />
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="p-8 text-center text-dark-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {search || filterSynced !== 'all'
                    ? 'No employees match your filters'
                    : 'No employees found. Add employees in the Employee Directory first.'
                  }
                </p>
              </div>
            )}

            {/* Pagination */}
            {filtered.length > PAY_TABLE_PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                <p className="text-xs text-dark-500">
                  Showing {(currentPage - 1) * PAY_TABLE_PAGE_SIZE + 1}–{Math.min(currentPage * PAY_TABLE_PAGE_SIZE, filtered.length)} of {filtered.length} employees
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`dot-${i}`} className="px-1 text-dark-500 text-xs">...</span>
                      ) : (
                        <button key={p} onClick={() => setCurrentPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            currentPage === p
                              ? 'bg-rivvra-500 text-dark-950'
                              : 'bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700'
                          }`}>{p}</button>
                      )
                    )}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Disbursement List ──────────────────────────────────────────────────── */

function DisbursementList({ employees, orgPath }) {
  const [showAll, setShowAll] = useState(false);

  // Filter to today and future dates only (+ on_hold regardless of date)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = (employees || []).filter(emp => {
    if (emp.paymentStatus === 'on_hold') return true;
    if (!emp.disbursementDate) return true; // no date = show it
    const d = new Date(emp.disbursementDate);
    d.setHours(0, 0, 0, 0);
    return d >= today;
  });

  if (!upcoming.length) {
    return (
      <div className="card p-8 text-center">
        <Clock size={24} className="mx-auto mb-2 text-dark-600" />
        <p className="text-sm text-dark-500">No upcoming disbursements</p>
        <p className="text-xs text-dark-600 mt-1">All disbursements for this period have been completed</p>
      </div>
    );
  }

  // Sort: on_hold first, then by disbursementDate ascending
  const sorted = [...upcoming].sort((a, b) => {
    if (a.paymentStatus === 'on_hold' && b.paymentStatus !== 'on_hold') return -1;
    if (b.paymentStatus === 'on_hold' && a.paymentStatus !== 'on_hold') return 1;
    const dateA = a.disbursementDate ? new Date(a.disbursementDate) : new Date('9999-12-31');
    const dateB = b.disbursementDate ? new Date(b.disbursementDate) : new Date('9999-12-31');
    return dateA - dateB;
  });

  const visible = showAll ? sorted : sorted.slice(0, 10);

  const statusColors = {
    paid: 'bg-emerald-500/10 text-emerald-400',
    unpaid: 'bg-amber-500/10 text-amber-400',
    on_hold: 'bg-red-500/10 text-red-400',
  };
  const statusLabels = { paid: 'Paid', unpaid: 'Unpaid', on_hold: 'On Hold' };

  // Group counts by status
  const statusCounts = upcoming.reduce((acc, e) => {
    acc[e.paymentStatus] = (acc[e.paymentStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="card flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-dark-800 flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
          <Clock size={16} className="text-blue-400" />
          Upcoming Disbursements
        </h3>
        <div className="flex items-center gap-2">
          {statusCounts.on_hold > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">{statusCounts.on_hold} on hold</span>
          )}
          <span className="text-xs text-dark-500">{upcoming.length} employees</span>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-dark-800 flex-1">
        {visible.map((emp, idx) => (
          <div key={emp.employeeId || emp.name || idx} className={`flex items-center justify-between px-4 py-2.5 hover:bg-dark-800/30 transition-colors ${
            emp.paymentStatus === 'on_hold' ? 'border-l-2 border-l-red-500' : ''
          }`}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400/20 to-blue-500/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-blue-300">{emp.name?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{emp.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {emp.employmentType && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeColors[emp.employmentType] || 'bg-dark-700 text-dark-400'}`}>
                      {typeLabels[emp.employmentType] || emp.employmentType}
                    </span>
                  )}
                  {emp.disbursementDate && (
                    <span className="text-[10px] text-dark-500">
                      {new Date(emp.disbursementDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                {'\u20B9'}{fmt(emp.netPay)}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[emp.paymentStatus] || statusColors.unpaid}`}>
                {statusLabels[emp.paymentStatus] || 'Unpaid'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {sorted.length > 10 && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full p-3 text-xs text-rivvra-400 font-medium hover:bg-dark-800/50 transition-colors border-t border-dark-800">
          {showAll ? 'Show Less' : `Show All ${sorted.length} Employees`}
        </button>
      )}
    </div>
  );
}

/* ── Employee Row (unchanged from original) ─────────────────────────────── */

const EmployeeRow = ({ emp }) => {
  const tc = emp.tsConfig;
  const assignments = emp.assignments || [];
  const activeAssignments = assignments.filter(a => a.status === 'active');
  const candidateRate = activeAssignments.length > 0
    ? pickBillingRate(activeAssignments[0].billingRate)
    : pickBillingRate(emp.billingRate);

  return (
    <tr className="group transition-colors hover:bg-dark-800/30">
      {/* Employee Info — sticky */}
      <td className="px-4 py-3 sticky left-0 bg-dark-900 group-hover:bg-dark-800 z-10 border-r border-dark-700 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-blue-300">
              {emp.fullName?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate max-w-[180px]">{emp.fullName}</p>
            <p className="text-xs text-dark-500 truncate max-w-[180px]">{emp.email}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {emp.employeeId && (
                <span className="text-[10px] text-dark-500">#{emp.employeeId}</span>
              )}
              {emp.department && (
                <span className="text-[10px] bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded">{emp.department}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Sync Status */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          tc.synced ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${tc.synced ? 'bg-green-400' : 'bg-amber-400'}`} />
          {tc.synced ? 'Synced' : 'Not synced'}
        </span>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          tc.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
          tc.role === 'manager' ? 'bg-blue-500/10 text-blue-400' :
          'bg-dark-700 text-dark-300'
        }`}>{tc.role ? tc.role.charAt(0).toUpperCase() + tc.role.slice(1) : 'Contractor'}</span>
      </td>

      {/* Pay Type */}
      <td className="px-4 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          tc.payType === 'monthly' ? 'bg-blue-500/10 text-blue-400' : 'bg-dark-700 text-dark-300'
        }`}>{tc.payType === 'monthly' ? 'Monthly' : 'Daily'}</span>
      </td>

      {/* Client */}
      <td className="px-4 py-3">
        {activeAssignments.length > 0 ? (
          <div className="space-y-1">
            {[...new Set(activeAssignments.map(a => a.clientName).filter(Boolean))].slice(0, 2).map((name, i) => (
              <span key={i} className="block text-xs text-white truncate max-w-[120px]">{name}</span>
            ))}
            {[...new Set(activeAssignments.map(a => a.clientName).filter(Boolean))].length > 2 && (
              <span className="text-[10px] text-dark-500">+{[...new Set(activeAssignments.map(a => a.clientName).filter(Boolean))].length - 2} more</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-dark-600">{'\u2014'}</span>
        )}
      </td>

      {/* Candidate Rate */}
      <td className="px-4 py-3 text-right">
        {activeAssignments.length > 1 ? (
          <div className="space-y-1">
            {activeAssignments.slice(0, 2).map((a, i) => {
              const rate = pickBillingRate(a.billingRate);
              return (
                <span key={i} className={`block text-xs font-medium ${rate ? 'text-white' : 'text-dark-600'}`}>
                  {formatRate(rate)}
                </span>
              );
            })}
            {activeAssignments.length > 2 && (
              <span className="text-[10px] text-dark-500">+{activeAssignments.length - 2} more</span>
            )}
          </div>
        ) : (
          <span className={`text-sm font-medium ${candidateRate ? 'text-white' : 'text-dark-600'}`}>
            {formatRate(candidateRate)}
          </span>
        )}
      </td>

      {/* Client Rate */}
      <td className="px-4 py-3 text-right">
        {activeAssignments.length > 0 ? (
          <div className="space-y-1">
            {activeAssignments.slice(0, 2).map((a, i) => {
              const clientRate = pickBillingRate(
                typeof a.clientBillingRate === 'object' ? a.clientBillingRate : { daily: a.clientBillingRate || 0 }
              );
              return (
                <span key={i} className={`block text-xs font-medium ${clientRate ? 'text-blue-400' : 'text-dark-600'}`}>
                  {formatRate(clientRate)}
                </span>
              );
            })}
            {activeAssignments.length > 2 && (
              <span className="text-[10px] text-dark-500">+{activeAssignments.length - 2} more</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-dark-600">{'\u2014'}</span>
        )}
      </td>

      {/* Start Date */}
      <td className="px-4 py-3">
        {activeAssignments.length > 0 ? (
          <div className="space-y-1">
            {activeAssignments.slice(0, 2).map((a, i) => (
              <span key={i} className="block text-xs text-dark-300 whitespace-nowrap">
                {formatDate(a.startDate) || '\u2014'}
              </span>
            ))}
            {activeAssignments.length > 2 && (
              <span className="text-[10px] text-dark-500">+{activeAssignments.length - 2} more</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-dark-600">{'\u2014'}</span>
        )}
      </td>

      {/* End Date */}
      <td className="px-4 py-3">
        {activeAssignments.length > 0 ? (
          <div className="space-y-1">
            {activeAssignments.slice(0, 2).map((a, i) => (
              <span key={i} className={`block text-xs whitespace-nowrap ${a.endDate ? 'text-dark-300' : 'text-emerald-400/70'}`}>
                {formatDate(a.endDate) || 'Ongoing'}
              </span>
            ))}
            {activeAssignments.length > 2 && (
              <span className="text-[10px] text-dark-500">+{activeAssignments.length - 2} more</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-dark-600">{'\u2014'}</span>
        )}
      </td>

      {/* Paid Leave */}
      <td className="px-4 py-3 text-center">
        {activeAssignments.length > 0 ? (
          <div className="space-y-1">
            {activeAssignments.slice(0, 2).map((a, i) => (
              <span key={i} className="block text-xs text-dark-300">
                {a.paidLeavePerMonth ?? tc.paidLeavePerMonth ?? 0}/mo
              </span>
            ))}
            {activeAssignments.length > 2 && (
              <span className="text-[10px] text-dark-500">+{activeAssignments.length - 2} more</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-dark-300">{tc.paidLeavePerMonth || 0}/mo</span>
        )}
      </td>
    </tr>
  );
};
