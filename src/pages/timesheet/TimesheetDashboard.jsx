import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton, TwoCardSkeleton, PendingListSkeleton, CardListSkeleton } from '../../components/Skeletons';
import {
  CalendarDays, IndianRupee, Clock, CheckCircle2,
  FileText, AlertCircle, ArrowRight, UserX
} from 'lucide-react';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-dark-700 text-dark-400',
    submitted: 'bg-amber-500/10 text-amber-400',
    approved: 'bg-emerald-500/10 text-emerald-400',
    rejected: 'bg-red-500/10 text-red-400',
    'not-created': 'bg-dark-700 text-dark-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}>
      {status?.replace('-', ' ')}
    </span>
  );
}

function ContractorDashboard() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [disbursement, setDisbursement] = useState(null);
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Temporary: hide earnings for confirmed+billable employees (pending payroll deductions)
  const hideEarnings = timesheetUser?.employmentType === 'confirmed' && timesheetUser?.billable;

  useEffect(() => {
    const controller = new AbortController();
    const sig = { signal: controller.signal };
    const fetches = [
      timesheetApi.get('/timesheets', sig).then(r => setTimesheets(r.data)).catch(() => {}),
    ];
    if (!hideEarnings) {
      fetches.push(
        timesheetApi.get('/earnings/current', sig).then(r => setCurrent(r.data)).catch(() => {}),
        timesheetApi.get('/earnings/previous', sig).then(r => setPrevious(r.data)).catch(() => {}),
        timesheetApi.get('/earnings/disbursement-info', sig).then(r => setDisbursement(r.data)).catch(() => {}),
      );
    }
    Promise.all(fetches).finally(() => setLoading(false));
    return () => controller.abort();
  }, [hideEarnings]);

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton titleW="w-52" subtitleW="w-48" />
      <CardGridSkeleton count={3} />
      <TwoCardSkeleton />
      <CardListSkeleton count={3} />
    </PageSkeleton>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Welcome, {timesheetUser?.fullName}</h1>
        <p className="text-dark-400 text-sm mt-1">Here's your timesheet summary</p>
      </div>

      {/* Earnings cards — hidden for confirmed+billable employees (temporary) */}
      {!hideEarnings && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-dark-400">
                {current ? `${monthNames[current.month]} ${current.year}` : 'Current Month'}
              </span>
              <StatusBadge status={current?.timesheetStatus} />
            </div>
            {current?.earnings?.grossAmount != null ? (
              <>
                <p className="text-sm text-dark-400">Gross: ₹{current.earnings.grossAmount.toLocaleString()}</p>
                {current.earnings.tdsAmount > 0 && <p className="text-xs text-red-400">TDS (2%): -₹{current.earnings.tdsAmount.toLocaleString()}</p>}
                <p className="text-2xl font-bold text-emerald-400 mt-1">₹{(current.earnings.netAmount || current.earnings.grossAmount).toLocaleString()}</p>
              </>
            ) : <p className="text-2xl font-bold text-white">—</p>}
            <p className="text-xs text-dark-500 mt-1">{current?.earnings?.calculation || ''}</p>
            {current?.estimateNote && (
              <p className="text-xs text-amber-400/80 mt-1 italic">{current.estimateNote}</p>
            )}
            {current?.statusLabel && <p className={`text-xs mt-2 font-medium ${current?.timesheetStatus === 'rejected' ? 'text-red-400' : current?.timesheetStatus === 'not-created' ? 'text-amber-400' : 'text-blue-400'}`}>{current.statusLabel}</p>}
            {current?.timesheetStatus === 'rejected' && current?.rejectionReason && (
              <p className="text-xs text-red-400/70 mt-1">Reason: {current.rejectionReason}</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-dark-400">
                {previous ? `${monthNames[previous.month]} ${previous.year}` : 'Previous Month'}
              </span>
              <StatusBadge status={previous?.timesheetStatus} />
            </div>
            {previous?.earnings?.grossAmount != null ? (
              <>
                <p className="text-sm text-dark-400">Gross: ₹{previous.earnings.grossAmount.toLocaleString()}</p>
                {previous.earnings.tdsAmount > 0 && <p className="text-xs text-red-400">TDS (2%): -₹{previous.earnings.tdsAmount.toLocaleString()}</p>}
                <p className="text-2xl font-bold text-emerald-400 mt-1">₹{(previous.earnings.netAmount || previous.earnings.grossAmount).toLocaleString()}</p>
              </>
            ) : <p className="text-2xl font-bold text-white">—</p>}
            <p className="text-xs text-dark-500 mt-1">{previous?.breakdown?.totalWorkingDays || 0} working days</p>
            {previous?.disbursement?.status && (
              <span className={`text-xs font-medium mt-2 inline-block ${previous.disbursement.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {previous.disbursement.status === 'paid' ? 'Paid' : 'Payment Pending'}
              </span>
            )}
          </div>

          <div className={`card p-5 ${disbursement?.daysUntil <= 7 ? 'border-blue-500/20' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-blue-400" />
              <span className="text-sm text-dark-400">Next Salary</span>
            </div>
            {disbursement?.nextDisbursementDate ? (
              <>
                <p className="text-2xl font-bold text-white">
                  {new Date(disbursement.nextDisbursementDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </p>
                {disbursement.countdown && <p className="text-sm text-blue-400 font-medium mt-1">{disbursement.countdown}</p>}
                {disbursement.note && <p className="text-xs text-dark-500 mt-1">{disbursement.note}</p>}
              </>
            ) : (
              <p className="text-dark-500">Not configured</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 sm:gap-3">
        <Link to={orgPath('/timesheet/my-timesheet')} className="bg-rivvra-500 text-dark-950 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-rivvra-400 flex items-center gap-1.5 sm:gap-2 transition-colors">
          <CalendarDays size={14} /> Fill Timesheet
        </Link>
        {!hideEarnings && (
          <Link to={orgPath('/timesheet/earnings')} className="bg-dark-800 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 sm:gap-2 transition-colors">
            <IndianRupee size={14} /> View Earnings
          </Link>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-dark-800">
          <h3 className="font-semibold text-white">Recent Timesheets</h3>
        </div>
        <div className="divide-y divide-dark-800">
          {timesheets.length === 0 ? (
            <p className="p-4 text-sm text-dark-500">No timesheets yet</p>
          ) : (
            timesheets.slice(0, 5).map(ts => (
              <div key={ts._id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-white">{monthNames[ts.month]} {ts.year}{ts.project?.name ? ` — ${ts.project.name}` : ''}</p>
                  <p className="text-xs text-dark-500">{ts.totalWorkingDays} working days</p>
                  {ts.status === 'rejected' && ts.rejectionReason && (
                    <p className="text-xs text-red-400/70 mt-0.5">Reason: {ts.rejectionReason}</p>
                  )}
                </div>
                <StatusBadge status={ts.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const fullMonthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const empTypeBadge = {
  confirmed: 'bg-blue-500/10 text-blue-400',
  internal_consultant: 'bg-purple-500/10 text-purple-400',
  external_consultant: 'bg-amber-500/10 text-amber-400',
  intern: 'bg-emerald-500/10 text-emerald-400',
};
const empTypeLabel = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal',
  external_consultant: 'External',
  intern: 'Intern',
};

function AdminDashboard() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const [timesheets, setTimesheets] = useState([]);
  const [notApprovedData, setNotApprovedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notApprovedTab, setNotApprovedTab] = useState(0); // index into notApprovedData.months

  useEffect(() => {
    const controller = new AbortController();
    const sig = { signal: controller.signal };
    Promise.all([
      timesheetApi.get('/timesheets', sig).then(r => setTimesheets(r.data)).catch(() => {}),
      timesheetApi.get('/dashboard/not-approved', sig).then(r => setNotApprovedData(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Hooks must be called before any early return (Rules of Hooks)
  const pending = useMemo(() => timesheets.filter(t => t.status === 'submitted'), [timesheets]);
  const approvedThisMonth = useMemo(() => {
    const now = new Date();
    return timesheets.filter(t => t.status === 'approved' && t.month === now.getMonth() + 1 && t.year === now.getFullYear());
  }, [timesheets]);

  const selectedMonth = notApprovedData?.months?.[notApprovedTab] || null;

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton titleW="w-52" subtitleW="w-36" />
      <CardGridSkeleton count={3} />
      <PendingListSkeleton count={4} />
    </PageSkeleton>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Welcome, {timesheetUser?.fullName}</h1>
        <p className="text-dark-400 text-sm mt-1">{timesheetUser?.role === 'admin' ? 'Admin' : 'Manager'} Dashboard</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={18} className="text-amber-400" />
            <span className="text-sm text-dark-400">Pending Approvals</span>
          </div>
          <p className="text-3xl font-bold text-white">{pending.length}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="text-sm text-dark-400">Approved This Month</span>
          </div>
          <p className="text-3xl font-bold text-white">{approvedThisMonth.length}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={18} className="text-blue-400" />
            <span className="text-sm text-dark-400">Total Timesheets</span>
          </div>
          <p className="text-3xl font-bold text-white">{timesheets.length}</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-dark-800 flex items-center justify-between">
            <h3 className="font-semibold text-white">Pending Approvals</h3>
            <Link to={orgPath('/timesheet/approvals')} className="text-blue-400 text-sm hover:text-blue-300 flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-dark-800">
            {pending.slice(0, 5).map(ts => (
              <div key={ts._id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-white">{ts.contractor?.fullName} — {monthNames[ts.month]} {ts.year}</p>
                  <p className="text-xs text-dark-500">{ts.project?.name} • {ts.totalWorkingDays} days</p>
                </div>
                <Link to={orgPath('/timesheet/approvals')} className="text-blue-400 text-xs font-medium hover:text-blue-300">Review</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not Approved Timesheets — month-wise */}
      {notApprovedData?.months?.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-dark-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UserX size={18} className="text-red-400" />
                <h3 className="font-semibold text-white">Not Approved</h3>
              </div>
              {selectedMonth && (
                <span className="text-xs text-dark-500">
                  {selectedMonth.approvedCount} of {selectedMonth.totalBillable} approved
                </span>
              )}
            </div>
            {/* Month tabs */}
            <div className="flex gap-1.5">
              {notApprovedData.months.map((m, i) => (
                <button key={`${m.month}-${m.year}`} onClick={() => setNotApprovedTab(i)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    notApprovedTab === i
                      ? 'bg-rivvra-500 text-dark-950'
                      : 'bg-dark-800 text-dark-400 hover:bg-dark-700 hover:text-dark-200'
                  }`}>
                  {monthNames[m.month]} {m.year}
                  {m.notApprovedCount > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                      notApprovedTab === i ? 'bg-dark-950/20 text-dark-950' : 'bg-red-500/10 text-red-400'
                    }`}>{m.notApprovedCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedMonth?.notApprovedCount === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-dark-400">All {selectedMonth.totalBillable} billable employees are approved for {fullMonthNames[selectedMonth.month]} {selectedMonth.year}</p>
            </div>
          ) : selectedMonth ? (
            <div className="divide-y divide-dark-800">
              <div className="px-4 py-2 bg-dark-800/30">
                <p className="text-xs text-red-400 font-medium">
                  {selectedMonth.notApprovedCount} of {selectedMonth.totalBillable} billable employee{selectedMonth.notApprovedCount !== 1 ? 's' : ''} not approved for {fullMonthNames[selectedMonth.month]} {selectedMonth.year}
                </p>
              </div>
              {selectedMonth.notApprovedEmployees.map((emp, i) => (
                <div key={emp.email || i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-400/20 to-red-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-red-300">{emp.name?.charAt(0)?.toUpperCase() || '?'}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{emp.name}</p>
                      <p className="text-xs text-dark-500">{emp.employeeId || emp.email}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    emp.timesheetStatus === 'submitted' ? 'bg-amber-500/10 text-amber-400' :
                    emp.timesheetStatus === 'draft' ? 'bg-dark-700 text-dark-400' :
                    emp.timesheetStatus === 'rejected' ? 'bg-red-500/10 text-red-400' :
                    'bg-dark-700 text-dark-500'
                  }`}>
                    {emp.timesheetStatus === 'not_submitted' ? 'No Timesheet' :
                     emp.timesheetStatus.charAt(0).toUpperCase() + emp.timesheetStatus.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function TimesheetDashboard() {
  const { timesheetUser, loading, error, refetch } = useTimesheetContext();
  const { getAppRole, currentOrg } = useOrg();

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton titleW="w-44" subtitleW="w-36" />
      <CardGridSkeleton count={3} />
    </PageSkeleton>
  );

  if (!timesheetUser) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-10 h-10 text-dark-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Unable to load timesheet profile</h2>
          <p className="text-dark-400 text-sm mb-4">{typeof error === 'string' ? error : 'The timesheet server may be starting up. Please try again.'}</p>
          <button onClick={refetch} className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-medium hover:bg-rivvra-400 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Org membership role is the source of truth for access control.
  // ts_users.role is only a fallback when no org context exists.
  const orgRole = currentOrg ? getAppRole('timesheet') : null;
  const tsRole = timesheetUser.role; // 'admin' | 'manager' | 'contractor'
  const effectiveRole = orgRole || (tsRole === 'contractor' ? 'member' : tsRole);
  const isMember = effectiveRole === 'member' || effectiveRole === 'contractor';

  if (isMember) return <ContractorDashboard />;
  return <AdminDashboard />;
}
