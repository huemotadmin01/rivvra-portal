import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import {
  CalendarDays, IndianRupee, Clock, CheckCircle2,
  FileText, AlertCircle, ArrowRight, Loader2
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

  useEffect(() => {
    Promise.all([
      timesheetApi.get('/earnings/current').then(r => setCurrent(r.data)).catch(() => showToast('Failed to load current month data', 'error')),
      timesheetApi.get('/earnings/previous').then(r => setPrevious(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/disbursement-info').then(r => setDisbursement(r.data)).catch(() => {}),
      timesheetApi.get('/timesheets').then(r => setTimesheets(r.data)).catch(() => showToast('Failed to load timesheets', 'error')),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome, {timesheetUser?.fullName}</h1>
        <p className="text-dark-400 mt-1">Here's your timesheet summary</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          {current?.statusLabel && <p className="text-xs text-blue-400 mt-2 font-medium">{current.statusLabel}</p>}
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

      <div className="flex gap-3">
        <Link to={orgPath('/timesheet/my-timesheet')} className="bg-rivvra-500 text-dark-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-2 transition-colors">
          <CalendarDays size={16} /> Fill Timesheet
        </Link>
        <Link to={orgPath('/timesheet/earnings')} className="bg-dark-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-dark-700 flex items-center gap-2 transition-colors">
          <IndianRupee size={16} /> View Earnings
        </Link>
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
                  <p className="text-sm font-medium text-white">{monthNames[ts.month]} {ts.year} — {ts.project?.name}</p>
                  <p className="text-xs text-dark-500">{ts.totalWorkingDays} working days</p>
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

function AdminDashboard() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    timesheetApi.get('/timesheets')
      .then(r => setTimesheets(r.data))
      .catch(() => showToast('Failed to load timesheets', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Hooks must be called before any early return (Rules of Hooks)
  const pending = useMemo(() => timesheets.filter(t => t.status === 'submitted'), [timesheets]);
  const approvedThisMonth = useMemo(() => {
    const now = new Date();
    return timesheets.filter(t => t.status === 'approved' && t.month === now.getMonth() + 1 && t.year === now.getFullYear());
  }, [timesheets]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome, {timesheetUser?.fullName}</h1>
        <p className="text-dark-400 mt-1">{timesheetUser?.role === 'admin' ? 'Admin' : 'Manager'} Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
    </div>
  );
}

export default function TimesheetDashboard() {
  const { timesheetUser, loading, error, refetch } = useTimesheetContext();
  const { getAppRole, currentOrg } = useOrg();

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

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

  // Determine if user should see member (contractor) dashboard or admin/manager dashboard.
  // ts_users.role is the source of truth ('admin', 'manager', 'contractor').
  // Org membership app role is checked as a secondary signal.
  const orgRole = currentOrg ? getAppRole('timesheet') : null;
  const tsRole = timesheetUser.role; // 'admin' | 'manager' | 'contractor'

  // Show admin/manager dashboard if EITHER ts_user role OR org app role indicates non-member
  const isMember = tsRole === 'contractor' && (!orgRole || orgRole === 'member');

  if (isMember) return <ContractorDashboard />;
  return <AdminDashboard />;
}
