import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { getAllLeaveRequests, approveLeaveRequest, rejectLeaveRequest } from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, TabsSkeleton, CardListSkeleton } from '../../components/Skeletons';
import { CheckCircle2, XCircle, Loader2, Calendar, Clock, User, AlertTriangle } from 'lucide-react';

const leaveTypeColors = {
  sick_leave: 'bg-red-500/10 text-red-400 border-red-500/20',
  casual_leave: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  comp_off: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  lop: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const leaveTypeLabels = {
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  comp_off: 'Comp Off',
  lop: 'LOP',
};

const statusBadgeColors = {
  pending: 'bg-amber-500/10 text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LeaveApprovals() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAllLeaveRequests();
      setRequests(Array.isArray(data) ? data : data.requests || data.leaveRequests || data.data || []);
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Failed to load leave requests', 'error');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this leave request?')) return;
    setActionLoading(id);
    try {
      await approveLeaveRequest(id);
      showToast('Leave request approved');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Approval failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }
    setActionLoading(rejectId);
    try {
      await rejectLeaveRequest(rejectId, { rejectionReason: rejectReason.trim() });
      showToast('Leave request rejected');
      setRejectId(null);
      setRejectReason('');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Rejection failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const counts = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    all: requests.length,
  };

  if (loading) return (
    <PageSkeleton>
      <HeaderSkeleton subtitleW="w-64" />
      <TabsSkeleton widths={[80, 76, 56, 44]} />
      <CardListSkeleton count={5} />
    </PageSkeleton>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Leave Approvals</h1>
        {counts.pending > 0 && (
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-xs font-medium">
            {counts.pending} pending
          </span>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-rivvra-500 text-white'
                : 'bg-dark-800 border border-dark-700 text-dark-400 hover:text-white'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Request Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-dark-500">No leave requests found</div>
        ) : (
          filtered.map(req => (
            <div key={req._id} className="card p-4 sm:p-5 space-y-3">
              {/* Top row: Employee info + status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-dark-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{req.employee?.fullName || req.employeeName || 'Unknown'}</p>
                    <p className="text-sm text-dark-400 truncate">{req.employee?.email || req.employeeEmail || ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${leaveTypeColors[req.leaveType] || 'bg-dark-700 text-dark-400 border-dark-600'}`}>
                    {leaveTypeLabels[req.leaveType] || req.leaveType}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeColors[req.status] || 'bg-dark-700 text-dark-400'}`}>
                    {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dark-300">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-dark-500" />
                  {formatDate(req.startDate)} — {formatDate(req.endDate)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-dark-500" />
                  {req.totalDays || req.days || 0} day{(req.totalDays || req.days || 0) !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Reason */}
              {req.reason && (
                <p className="text-sm text-dark-400 bg-dark-800/50 rounded-lg px-3 py-2">{req.reason}</p>
              )}

              {/* LOP Warning */}
              {req.isLOP && req.lopDays > 0 && (
                <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={14} />
                  <span>{req.lopDays} day{req.lopDays !== 1 ? 's' : ''} will be LOP</span>
                </div>
              )}

              {/* Approved info */}
              {req.status === 'approved' && (req.approvedBy || req.approvedAt) && (
                <p className="text-xs text-dark-500">
                  Approved{req.approvedBy?.fullName ? ` by ${req.approvedBy.fullName}` : ''}{req.approvedAt ? ` on ${formatDate(req.approvedAt)}` : ''}
                </p>
              )}

              {/* Rejected info */}
              {req.status === 'rejected' && req.rejectionReason && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <span className="font-medium">Rejection reason:</span> {req.rejectionReason}
                </div>
              )}

              {/* Actions for pending */}
              {req.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleApprove(req._id)} disabled={!!actionLoading}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {actionLoading === req._id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approve
                  </button>
                  <button onClick={() => setRejectId(req._id)} disabled={!!actionLoading}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <XCircle size={16} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) { setRejectId(null); setRejectReason(''); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setRejectId(null); setRejectReason(''); } }}>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 w-full max-w-md mx-4" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold text-white mb-4">Reject Leave Request</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full bg-dark-900/50 border border-dark-700 rounded-lg p-3 text-sm text-white placeholder-dark-500 mb-4 min-h-[100px] outline-none focus:border-rivvra-500 focus:ring-2 focus:ring-rivvra-500/20 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-dark-400 hover:bg-dark-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleReject} disabled={!!actionLoading}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading === rejectId ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
