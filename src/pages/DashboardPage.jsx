import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  CalendarDays, IndianRupee, Clock, CheckCircle2, XCircle,
  FileText, AlertCircle, ArrowRight, TrendingUp
} from 'lucide-react';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    'not-created': 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}>
      {status?.replace('-', ' ')}
    </span>
  );
}

// Contractor Dashboard
function ContractorDashboard() {
  const { user } = useAuth();
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [disbursement, setDisbursement] = useState(null);
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/earnings/current').then(r => setCurrent(r.data)).catch(() => {}),
      api.get('/earnings/previous').then(r => setPrevious(r.data)).catch(() => {}),
      api.get('/earnings/disbursement-info').then(r => setDisbursement(r.data)).catch(() => {}),
      api.get('/timesheets').then(r => setTimesheets(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.fullName}</h1>
        <p className="text-gray-500 mt-1">Here's your timesheet summary</p>
      </div>

      {/* Earnings Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Month */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">
              {current ? `${monthNames[current.month]} ${current.year}` : 'Current Month'}
            </span>
            <StatusBadge status={current?.timesheetStatus} />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {current?.earnings?.grossAmount != null
              ? `₹${current.earnings.grossAmount.toLocaleString()}`
              : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{current?.earnings?.calculation || ''}</p>
          {current?.statusLabel && (
            <p className="text-xs text-accent mt-2 font-medium">{current.statusLabel}</p>
          )}
        </div>

        {/* Previous Month */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">
              {previous ? `${monthNames[previous.month]} ${previous.year}` : 'Previous Month'}
            </span>
            <StatusBadge status={previous?.timesheetStatus} />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {previous?.earnings?.grossAmount != null
              ? `₹${previous.earnings.grossAmount.toLocaleString()}`
              : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{previous?.breakdown?.totalWorkingDays || 0} working days</p>
          {previous?.disbursement?.status && (
            <span className={`text-xs font-medium mt-2 inline-block ${previous.disbursement.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
              {previous.disbursement.status === 'paid' ? 'Paid' : 'Payment Pending'}
            </span>
          )}
        </div>

        {/* Disbursement */}
        <div className={`rounded-xl border p-5 ${disbursement?.daysUntil <= 7 ? 'bg-accent/5 border-accent/20' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-accent" />
            <span className="text-sm text-gray-500">Next Salary</span>
          </div>
          {disbursement?.nextDisbursementDate ? (
            <>
              <p className="text-2xl font-bold text-gray-900">
                {new Date(disbursement.nextDisbursementDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
              </p>
              {disbursement.countdown && (
                <p className="text-sm text-accent font-medium mt-1">{disbursement.countdown}</p>
              )}
              {disbursement.note && (
                <p className="text-xs text-gray-400 mt-1">{disbursement.note}</p>
              )}
            </>
          ) : (
            <p className="text-gray-400">Not configured</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link to="/timesheet" className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
          <CalendarDays size={16} /> Fill Timesheet
        </Link>
        <Link to="/earnings" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
          <IndianRupee size={16} /> View Earnings
        </Link>
      </div>

      {/* Recent Timesheets */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Recent Timesheets</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {timesheets.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No timesheets yet</p>
          ) : (
            timesheets.slice(0, 5).map(ts => (
              <div key={ts._id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {monthNames[ts.month]} {ts.year} — {ts.project?.name}
                  </p>
                  <p className="text-xs text-gray-400">{ts.totalWorkingDays} working days</p>
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

// Admin/Manager Dashboard
function AdminDashboard() {
  const { user } = useAuth();
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/timesheets')
      .then(r => setTimesheets(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const pending = timesheets.filter(t => t.status === 'submitted');
  const approvedThisMonth = timesheets.filter(t => {
    const now = new Date();
    return t.status === 'approved' && t.month === now.getMonth() + 1 && t.year === now.getFullYear();
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.fullName}</h1>
        <p className="text-gray-500 mt-1">{user?.role === 'admin' ? 'Admin' : 'Manager'} Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={18} className="text-yellow-500" />
            <span className="text-sm text-gray-500">Pending Approvals</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-green-500" />
            <span className="text-sm text-gray-500">Approved This Month</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{approvedThisMonth.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={18} className="text-accent" />
            <span className="text-sm text-gray-500">Total Timesheets</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{timesheets.length}</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Pending Approvals</h3>
            <Link to="/approvals" className="text-accent text-sm hover:underline flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {pending.slice(0, 5).map(ts => (
              <div key={ts._id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {ts.contractor?.fullName} — {monthNames[ts.month]} {ts.year}
                  </p>
                  <p className="text-xs text-gray-400">{ts.project?.name} • {ts.totalWorkingDays} days</p>
                </div>
                <Link
                  to="/approvals"
                  className="text-accent text-xs font-medium hover:underline"
                >
                  Review
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === 'contractor') return <ContractorDashboard />;
  return <AdminDashboard />;
}
