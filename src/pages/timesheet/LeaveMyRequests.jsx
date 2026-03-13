import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { getMyLeaveRequests, getMyLeaveBalances, cancelLeaveRequest } from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton, TabsSkeleton, CardListSkeleton } from '../../components/Skeletons';
import { CalendarDays, X, Loader2, Inbox } from 'lucide-react';

const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-dark-600 text-dark-400',
};

const leaveTypeColors = {
  sick_leave: 'bg-red-500/20 text-red-400',
  casual_leave: 'bg-blue-500/20 text-blue-400',
  comp_off: 'bg-purple-500/20 text-purple-400',
  lop: 'bg-orange-500/20 text-orange-400',
};

const leaveTypeLabels = {
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  comp_off: 'Comp Off',
  lop: 'Loss of Pay',
};

const filters = ['all', 'pending', 'approved', 'rejected', 'cancelled'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function isFutureDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

export default function LeaveMyRequests() {
  const { showToast } = useToast();
  const { timesheetUser } = useTimesheetContext();
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelModalId, setCancelModalId] = useState(null);

  const loadData = async () => {
    try {
      const [reqData, balData] = await Promise.all([
        getMyLeaveRequests(),
        getMyLeaveBalances(),
      ]);
      setRequests(Array.isArray(reqData) ? reqData : reqData?.requests || []);
      const bals = balData?.balances;
      setBalances(Array.isArray(bals) ? Object.entries(bals).map(([k, v]) => ({ leaveType: k, ...v })) : []);
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load leave data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCancel = async () => {
    if (!cancelModalId) return;
    setCancellingId(cancelModalId);
    try {
      await cancelLeaveRequest(cancelModalId, { cancelReason: cancelReason.trim() || undefined });
      showToast('Leave request cancelled');
      setCancelModalId(null);
      setCancelReason('');
      // Reload both balances and requests
      const [reqData, balData] = await Promise.all([
        getMyLeaveRequests(),
        getMyLeaveBalances(),
      ]);
      setRequests(Array.isArray(reqData) ? reqData : reqData?.requests || []);
      const bals = balData?.balances;
      setBalances(Array.isArray(bals) ? Object.entries(bals).map(([k, v]) => ({ leaveType: k, ...v })) : []);
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to cancel request', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const openCancelModal = (id) => {
    if (!window.confirm('Are you sure you want to cancel this leave request?')) return;
    setCancelModalId(id);
    setCancelReason('');
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton subtitleW="w-64" />
      <CardGridSkeleton count={3} />
      <TabsSkeleton widths={[44, 72, 76, 68, 76]} />
      <CardListSkeleton count={4} />
    </PageSkeleton>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">My Leave Requests</h1>
        <p className="text-dark-400 text-sm mt-1">View and manage your leave applications</p>
      </div>

      {/* Balance Summary Cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {balances.map((bal) => (
            <div key={bal.leaveType} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${leaveTypeColors[bal.leaveType] || 'bg-dark-600 text-dark-400'}`}>
                  {leaveTypeLabels[bal.leaveType] || bal.leaveType}
                </span>
              </div>
              <p className="text-2xl font-bold text-white">{bal.available ?? bal.remaining ?? 0}</p>
              <p className="text-xs text-dark-500 mt-1">
                of {bal.total ?? bal.allocated ?? 0} available
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-rivvra-500 text-white'
                : 'bg-dark-800 border border-dark-700 text-dark-400 hover:text-white'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {' '}({(f === 'all' ? requests : requests.filter(r => r.status === f)).length})
          </button>
        ))}
      </div>

      {/* Request List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <Inbox size={32} className="mx-auto mb-3 text-dark-600" />
            <p className="text-dark-500">No leave requests found</p>
          </div>
        ) : (
          filtered.map(req => (
            <div key={req._id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-3">
              {/* Top row: leave type badge + status badge */}
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${leaveTypeColors[req.leaveType] || 'bg-dark-600 text-dark-400'}`}>
                  {leaveTypeLabels[req.leaveType] || req.leaveType}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[req.status] || 'bg-dark-600 text-dark-400'}`}>
                  {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                </span>
              </div>

              {/* Date range + days */}
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays size={14} className="text-dark-500" />
                <span className="text-white font-medium">
                  {formatDate(req.startDate || req.fromDate)} — {formatDate(req.endDate || req.toDate)}
                </span>
                <span className="text-dark-500">
                  ({req.totalDays ?? req.numberOfDays ?? 1} day{(req.totalDays ?? req.numberOfDays ?? 1) > 1 ? 's' : ''})
                </span>
              </div>

              {/* Reason */}
              {req.reason && (
                <p className="text-sm text-dark-400">{req.reason}</p>
              )}

              {/* Rejection reason */}
              {req.status === 'rejected' && req.rejectionReason && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-400 mb-0.5">Rejection Reason</p>
                  <p className="text-sm text-red-300">{req.rejectionReason}</p>
                </div>
              )}

              {/* Cancel button — show for pending, or approved with future start date */}
              {(req.status === 'pending' || (req.status === 'approved' && isFutureDate(req.startDate || req.fromDate))) && (
                <div className="flex justify-end">
                  <button
                    onClick={() => openCancelModal(req._id)}
                    disabled={!!cancellingId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancellingId === req._id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <X size={14} />
                    )}
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Cancel Reason Modal */}
      {cancelModalId && (
        <div
          className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) { setCancelModalId(null); setCancelReason(''); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setCancelModalId(null); setCancelReason(''); } }}
        >
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-md mx-4" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold text-white mb-4">Cancel Leave Request</h3>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)..."
              className="w-full bg-dark-800/50 border border-dark-700 rounded-lg p-3 text-sm text-white placeholder-dark-500 mb-4 min-h-[100px] outline-none focus:border-rivvra-500 focus:ring-2 focus:ring-rivvra-500/20"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setCancelModalId(null); setCancelReason(''); }}
                className="px-4 py-2 text-sm text-dark-400 hover:bg-dark-800 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleCancel}
                disabled={!!cancellingId}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {cancellingId ? <Loader2 size={14} className="animate-spin" /> : null}
                Cancel Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
