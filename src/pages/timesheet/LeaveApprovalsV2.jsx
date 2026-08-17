import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { getAllLeaveRequests, approveLeaveRequest, rejectLeaveRequest, revertLeaveRequest } from '../../utils/timesheetApi';
import { CheckCircle2, XCircle, Loader2, Calendar, Clock, User, AlertTriangle, RotateCcw } from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import { leaveTypeAccent } from '../../config/leaveTypes';
import {
  PageHeader, Tabs, Panel, Chip, Button, Modal, Textarea, Callout, EmptyState, PageSpinner, Avatar,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Approve / reject / revert on leave requests. Logic above `return (` is
// spliced in verbatim.
//
// This page carries a THIRD hand-rolled leave-type map, which is the finding —
// see REDESIGN-QA.md. The split below is deliberate and narrow:
//
//   COLOUR comes from the shared `leaveTypeAccent`. That is presentation, which
//   is this migration's remit, and the shared tone map is identical to legacy's
//   for all four types legacy knows (sick=red, casual=blue, comp_off=purple,
//   lop=orange) — so nothing that renders today changes colour. The six types
//   legacy omits stop falling through to neutral, which is a strict gain.
//
//   LABELS stay legacy's map, verbatim. Switching to the shared
//   `formatLeaveType` would render `lop` as "Loss of Pay" where this page says
//   "LOP" — a copy change, not a theme change, and not mine to make here.
// ─────────────────────────────────────────────────────────────────────────────

const leaveTypeLabels = {
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  comp_off: 'Comp Off',
  lop: 'LOP',
};

/** Status pill tone, replacing legacy's `statusBadgeColors` class map. */
const STATUS_TONE = { pending: 'warn', approved: 'brand', rejected: 'danger' };

function formatDate(dateStr) {
  return formatDateUTC(dateStr, { locale: 'en-IN' }) || '';
}

export default function LeaveApprovalsV2() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    setRequests([]);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [currentCompany?._id]);

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

  const handleRevert = async (id) => {
    if (!window.confirm('Revert this leave approval? It will go back to pending status.')) return;
    setActionLoading(id);
    try {
      await revertLeaveRequest(id);
      showToast('Leave reverted to pending');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Revert failed', 'error');
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

  if (loading) return <PageSpinner label="Loading leave requests…" />;

  const FILTERS = ['pending', 'approved', 'rejected', 'all'];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="Leave Approvals"
        sub={counts.pending > 0 ? `${counts.pending} pending` : undefined}
      />

      <Tabs
        tabs={FILTERS.map(f => ({
          key: f,
          label: f.charAt(0).toUpperCase() + f.slice(1),
          count: counts[f],
        }))}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: 14 }}
      />

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.length === 0 ? (
          <Panel><EmptyState title="No leave requests found" /></Panel>
        ) : (
          filtered.map(req => {
            const accent = leaveTypeAccent(req.leaveType);
            const name = req.employee?.fullName || req.employeeName || 'Unknown';
            const days = req.totalDays || req.days || 0;
            return (
              <Panel key={req._id}>
                <div style={{ display: 'grid', gap: 12 }}>

                  {/* Top row: employee + badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <Avatar name={name} size="md" />
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          font: "600 13.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {name}
                        </p>
                        <p style={{
                          font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '2px 0 0',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {req.employee?.email || req.employeeEmail || ''}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {/* Leave-type pill. Colour from the shared tone map, label
                          from legacy's — see the header comment.

                          The ink is --fg, NOT the accent. An accent on a wash of
                          itself is the pairing Chip documents at ~4.35 and that
                          my-attendance already failed on; measured here it was
                          4.21 for LOP and 4.24 for Casual Leave. The tint plus
                          the ring carry the hue; the label stays legible. */}
                      <Chip
                        style={{
                          background: `color-mix(in srgb, ${accent} 16%, transparent)`,
                          color: 'var(--fg)',
                          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 38%, transparent)`,
                        }}
                      >
                        {leaveTypeLabels[req.leaveType] || req.leaveType}
                      </Chip>
                      <Chip tone={STATUS_TONE[req.status]}>
                        {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                      </Chip>
                    </div>
                  </div>

                  {/* Details */}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px',
                    font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                      {formatDate(req.fromDate || req.startDate)} — {formatDate(req.toDate || req.endDate)}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={13} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                      {days} day{days !== 1 ? 's' : ''}
                    </span>
                    {req.isHalfDay && (
                      <Chip tone="warn">
                        Half Day ({req.halfDaySession === 'second_half' ? 'Second Half' : 'First Half'})
                      </Chip>
                    )}
                  </div>

                  {/* Reason */}
                  {req.reason && (
                    <p style={{
                      font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0,
                      background: 'var(--surface-2)', borderRadius: 'var(--r-1)', padding: '8px 12px',
                    }}>
                      {req.reason}
                    </p>
                  )}

                  {/* LOP warning. Text carried verbatim, emoji included — see
                      REDESIGN-QA.md on the doubled warning marker and on the
                      `|| req.totalDays` fallback. */}
                  {(req.isLOP || req.isLop || req.lopDays > 0) && (
                    <Callout tone="warn" icon={<AlertTriangle size={15} />}>
                      ⚠️ {req.lopDays || req.totalDays || 0} LOP day{(req.lopDays || req.totalDays || 0) !== 1 ? 's' : ''}
                    </Callout>
                  )}

                  {/* Approved info */}
                  {req.status === 'approved' && (req.approvedBy || req.approvedAt) && (
                    <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                      Approved{req.approvedBy?.fullName ? ` by ${req.approvedBy.fullName}` : ''}{req.approvedAt ? ` on ${formatDate(req.approvedAt)}` : ''}
                    </p>
                  )}

                  {/* Revert approved leave */}
                  {req.status === 'approved' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRevert(req._id)}
                        disabled={!!actionLoading}
                        iconLeft={actionLoading === req._id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                      >
                        Revert to Pending
                      </Button>
                    </div>
                  )}

                  {/* Rejected info */}
                  {req.status === 'rejected' && req.rejectionReason && (
                    <Callout tone="danger" icon={<XCircle size={15} />} title="Rejection reason:">
                      {req.rejectionReason}
                    </Callout>
                  )}

                  {/* Actions for pending */}
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(req._id)}
                        disabled={!!actionLoading}
                        iconLeft={actionLoading === req._id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRejectId(req._id)}
                        disabled={!!actionLoading}
                        iconLeft={<XCircle size={15} />}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>
            );
          })
        )}
      </div>

      <Modal
        open={!!rejectId}
        onClose={() => { setRejectId(null); setRejectReason(''); }}
        size="sm"
        tone="danger"
        icon={<XCircle size={18} />}
        title="Reject Leave Request"
        sub="The employee sees this reason on their request."
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => { setRejectId(null); setRejectReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              disabled={!!actionLoading}
              iconLeft={actionLoading === rejectId ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
            >
              Reject
            </Button>
          </>
        )}
      >
        <Textarea
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Reason for rejection..."
          maxLength={500}
          aria-label="Reason for rejection"
          style={{ minHeight: 100, resize: 'none' }}
        />
      </Modal>
    </div>
  );
}
