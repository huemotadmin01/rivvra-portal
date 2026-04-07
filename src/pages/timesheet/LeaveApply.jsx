import { useState, useEffect, useMemo } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import { getMyLeaveBalances, applyLeave, getHolidays } from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton } from '../../components/Skeletons';
import { CalendarDays, Send, AlertCircle, Info, ToggleLeft, ToggleRight } from 'lucide-react';

const leaveTypeColors = {
  casual_leave: 'text-blue-400 border-blue-500/30',
  sick_leave: 'text-red-400 border-red-500/30',
  earned_leave: 'text-emerald-400 border-emerald-500/30',
  compensatory_off: 'text-purple-400 border-purple-500/30',
  maternity_leave: 'text-pink-400 border-pink-500/30',
  paternity_leave: 'text-cyan-400 border-cyan-500/30',
};

const leaveTypeLabels = {
  casual_leave: 'Casual Leave',
  sick_leave: 'Sick Leave',
  earned_leave: 'Earned Leave',
  compensatory_off: 'Comp Off',
  maternity_leave: 'Maternity Leave',
  paternity_leave: 'Paternity Leave',
};

function formatLeaveType(type) {
  return leaveTypeLabels[type] || type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || type;
}

export default function LeaveApply() {
  const { timesheetUser, loading: profileLoading } = useTimesheetContext();
  const { showToast } = useToast();

  const [balances, setBalances] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [leaveType, setLeaveType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySession, setHalfDaySession] = useState('first_half');

  // Fetch balances and holidays on mount
  useEffect(() => {
    if (!timesheetUser) return;
    const controller = new AbortController();
    Promise.all([
      getMyLeaveBalances().catch(() => null),
      getHolidays().catch(() => []),
    ]).then(([balData, holData]) => {
      // Normalize: merge leaveTypes + balances object into an array
      if (balData && balData.leaveTypes && balData.balances && !Array.isArray(balData.balances)) {
        const balObj = balData.balances;
        balData.balances = balData.leaveTypes.map(lt => ({
          leaveType: lt.code,
          name: lt.name,
          ...balObj[lt.code],
          policy: lt,
        }));
      }
      setBalances(balData);
      setHolidays(Array.isArray(holData) ? holData : holData?.holidays || []);
      // Default to first eligible leave type
      if (balData?.balances?.length > 0) {
        setLeaveType(balData.balances[0].leaveType);
      }
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [timesheetUser]);

  // Build a Set of holiday date strings for fast lookup (YYYY-MM-DD)
  const holidayDatesSet = useMemo(() => {
    const set = new Set();
    holidays.forEach(h => {
      if (h.date) set.add(h.date.slice(0, 10));
    });
    return set;
  }, [holidays]);

  // Calculate business days between from and to, excluding weekends and holidays
  const leaveDays = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    if (isHalfDay) return 0.5;

    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (start > end) return 0;

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      const dateStr = current.toISOString().slice(0, 10);
      if (day !== 0 && day !== 6 && !holidayDatesSet.has(dateStr)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }, [fromDate, toDate, isHalfDay, holidayDatesSet]);

  // Find the selected leave type's balance info
  const selectedBalance = useMemo(() => {
    if (!balances?.balances || !leaveType) return null;
    return balances.balances.find(b => b.leaveType === leaveType);
  }, [balances, leaveType]);

  // Check if the org leave policy allows half-day (policy-level setting, not per leave type)
  const halfDayAllowed = balances?.policy?.halfDayAllowed ?? false;

  // Available balance for selected type
  const available = selectedBalance?.available ?? 0;

  // LOP days (leave without pay) when balance is insufficient
  const lopDays = leaveDays > available ? leaveDays - available : 0;

  const resetForm = () => {
    setFromDate('');
    setToDate('');
    setReason('');
    setIsHalfDay(false);
    setHalfDaySession('first_half');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!leaveType || !fromDate || !toDate || !reason.trim()) {
      showToast('Please fill all required fields', 'error');
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      showToast('From date cannot be after To date', 'error');
      return;
    }
    if (leaveDays <= 0) {
      showToast('No working days in selected range', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await applyLeave({
        leaveType,
        fromDate,
        toDate,
        reason: reason.trim(),
        isHalfDay,
        halfDaySession: isHalfDay ? halfDaySession : undefined,
      });
      showToast('Leave application submitted successfully', 'success');
      resetForm();
      // Refresh balances
      const updated = await getMyLeaveBalances().catch(() => null);
      if (updated) {
        if (updated.leaveTypes && updated.balances && !Array.isArray(updated.balances)) {
          const balObj = updated.balances;
          updated.balances = updated.leaveTypes.map(lt => ({
            leaveType: lt.code, name: lt.name, ...balObj[lt.code], policy: lt,
          }));
        }
        setBalances(updated);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit leave application', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading || loading) {
    return (
      <PageSkeleton>
        <HeaderSkeleton titleW="w-48" />
        <CardGridSkeleton count={3} />
        <div className="card p-6 space-y-4">
          <div className="h-5 w-32 bg-dark-800 rounded" />
          <div className="h-10 w-full bg-dark-800 rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-dark-800 rounded-lg" />
            <div className="h-10 bg-dark-800 rounded-lg" />
          </div>
          <div className="h-20 w-full bg-dark-800 rounded-lg" />
          <div className="h-10 w-28 bg-dark-800 rounded-lg" />
        </div>
      </PageSkeleton>
    );
  }

  // Not eligible for leave management
  if (balances?.eligible === false) {
    return (
      <div className="p-3 sm:p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-10 h-10 text-dark-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Leave Management Unavailable</h2>
          <p className="text-dark-400 text-sm">Leave management is not available for your employment type. Contact your manager for leave requests.</p>
        </div>
      </div>
    );
  }

  const leaveTypes = balances?.balances || [];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Apply for Leave</h1>
        <p className="text-dark-400 text-sm mt-1">Check your balance and submit a leave request</p>
      </div>

      {/* Leave Balance Cards */}
      {leaveTypes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {leaveTypes.map((bal) => {
            const colors = leaveTypeColors[bal.leaveType] || 'text-dark-400 border-dark-600/30';
            return (
              <div
                key={bal.leaveType}
                className={`bg-dark-800 border border-dark-700 rounded-xl p-4 ${
                  leaveType === bal.leaveType ? 'ring-1 ring-rivvra-500' : ''
                }`}
              >
                <p className={`text-sm font-medium mb-3 ${colors.split(' ')[0]}`}>
                  {formatLeaveType(bal.leaveType)}
                </p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-white">{bal.available ?? 0}</p>
                    <p className="text-xs text-dark-400 mt-0.5">Available</p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-xs text-dark-400">
                      Accrued: <span className="text-dark-300">{bal.accrued ?? 0}</span>
                    </p>
                    <p className="text-xs text-dark-400">
                      Used: <span className="text-dark-300">{bal.used ?? 0}</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leave Application Form */}
      <form onSubmit={handleSubmit} className="card">
        <div className="p-4 border-b border-dark-800">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <CalendarDays size={18} className="text-rivvra-500" />
            Leave Application
          </h3>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Leave Type */}
          <div>
            <label className="block text-sm text-dark-400 mb-1.5">Leave Type</label>
            <select
              value={leaveType}
              onChange={(e) => {
                setLeaveType(e.target.value);
                setIsHalfDay(false);
              }}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((bal) => (
                <option key={bal.leaveType} value={bal.leaveType}>
                  {formatLeaveType(bal.leaveType)} ({bal.available ?? 0} available)
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          {(() => {
            const lwdMax = timesheetUser?.lastWorkingDate
              ? new Date(timesheetUser.lastWorkingDate).toISOString().slice(0, 10)
              : undefined;
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1.5">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      max={lwdMax}
                      onChange={(e) => {
                        setFromDate(e.target.value);
                        if (!toDate || e.target.value > toDate) setToDate(e.target.value);
                      }}
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1.5">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate || undefined}
                      max={lwdMax}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                    />
                  </div>
                </div>
                {lwdMax && (
                  <p className="text-xs text-amber-300/80 -mt-2">
                    Your last working date is {new Date(timesheetUser.lastWorkingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Leave cannot extend beyond this date.
                  </p>
                )}
              </>
            );
          })()}

          {/* Half-day toggle (only if policy allows) */}
          {halfDayAllowed && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsHalfDay(!isHalfDay);
                    if (!isHalfDay) setToDate(fromDate); // half-day is single day
                  }}
                  className="flex items-center gap-2 text-sm text-dark-300 hover:text-white transition-colors"
                >
                  {isHalfDay ? (
                    <ToggleRight size={24} className="text-rivvra-500" />
                  ) : (
                    <ToggleLeft size={24} className="text-dark-500" />
                  )}
                  Half Day
                </button>
              </div>

              {isHalfDay && (
                <div className="flex gap-4 ml-1">
                  <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
                    <input
                      type="radio"
                      name="halfDaySession"
                      value="first_half"
                      checked={halfDaySession === 'first_half'}
                      onChange={() => setHalfDaySession('first_half')}
                      className="accent-rivvra-500"
                    />
                    First Half
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
                    <input
                      type="radio"
                      name="halfDaySession"
                      value="second_half"
                      checked={halfDaySession === 'second_half'}
                      onChange={() => setHalfDaySession('second_half')}
                      className="accent-rivvra-500"
                    />
                    Second Half
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm text-dark-400 mb-1.5">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter the reason for your leave..."
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 resize-none"
            />
          </div>

          {/* Leave days info */}
          {fromDate && toDate && leaveDays > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-dark-800/50 border border-dark-700 rounded-lg px-3 py-2">
                <Info size={16} className="text-rivvra-500 flex-shrink-0" />
                <p className="text-sm text-dark-300">
                  Leave days to be deducted: <span className="text-white font-medium">{leaveDays}</span>
                </p>
              </div>

              {lopDays > 0 && (
                <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
                  <p className="text-sm text-amber-400">
                    Insufficient balance. <span className="font-medium">{lopDays} day{lopDays !== 1 ? 's' : ''}</span> will be marked as LOP (Loss of Pay).
                  </p>
                </div>
              )}
            </div>
          )}

          {fromDate && toDate && leaveDays === 0 && (
            <div className="flex items-center gap-2 bg-dark-800/50 border border-dark-700 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="text-dark-500 flex-shrink-0" />
              <p className="text-sm text-dark-500">
                No working days in the selected range (weekends/holidays excluded).
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !leaveType || !fromDate || !toDate || !reason.trim() || leaveDays <= 0}
              className="bg-rivvra-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              <Send size={16} />
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
