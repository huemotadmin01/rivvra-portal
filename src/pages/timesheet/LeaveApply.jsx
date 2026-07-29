import { useState, useEffect, useMemo } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import { getMyLeaveBalances, applyLeave, getHolidays } from '../../utils/timesheetApi';
import { PageSkeleton, HeaderSkeleton, CardGridSkeleton } from '../../components/Skeletons';
import { CalendarDays, Send, AlertCircle, Info, ToggleLeft, ToggleRight } from 'lucide-react';
import { formatLeaveType, leaveTypeTextClasses } from '../../config/leaveTypes';

/** Local Y-M-D key for a Date — never toISOString(), which shifts across UTC. */
function toLocalKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse a 'YYYY-MM-DD' input value into a LOCAL-midnight Date. */
function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function LeaveApply() {
  const { timesheetUser, loading: profileLoading } = useTimesheetContext();
  const { showToast } = useToast();

  const [balances, setBalances] = useState(null);
  // Holidays keyed by calendar year. getHolidays() with no year defaults to the
  // CURRENT year server-side, so applying in December for January dates used to
  // miss next-year holidays entirely and the "days to be deducted"/LOP preview
  // disagreed with what the backend actually booked.
  const [holidaysByYear, setHolidaysByYear] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [leaveType, setLeaveType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySession, setHalfDaySession] = useState('first_half');

  // Fetch balances on mount
  useEffect(() => {
    if (!timesheetUser) return;
    const controller = new AbortController();
    getMyLeaveBalances(undefined, { signal: controller.signal })
      .catch(() => null)
      .then((balData) => {
        if (controller.signal.aborted) return;
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
        // Default to first eligible leave type
        if (balData?.balances?.length > 0) {
          setLeaveType(balData.balances[0].leaveType);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [timesheetUser]);

  // Every calendar year the selected range touches (usually one, two across a
  // Dec→Jan range). Always includes the current year so the page is useful
  // before any date is picked.
  const neededYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    const from = parseLocalDate(fromDate);
    const to = parseLocalDate(toDate);
    if (from) years.add(from.getFullYear());
    if (to) years.add(to.getFullYear());
    if (from && to && to >= from) {
      for (let y = from.getFullYear(); y <= to.getFullYear(); y++) years.add(y);
    }
    return [...years].sort();
  }, [fromDate, toDate]);

  // Fetch holidays for any year we don't have yet.
  useEffect(() => {
    if (!timesheetUser) return;
    const controller = new AbortController();
    const missing = neededYears.filter(y => !(y in holidaysByYear));
    if (missing.length === 0) return;
    Promise.all(missing.map(y =>
      getHolidays({ year: y }, { signal: controller.signal })
        .then(res => [y, Array.isArray(res) ? res : res?.holidays || []])
        .catch(() => [y, []])
    )).then((pairs) => {
      if (controller.signal.aborted) return;
      setHolidaysByYear(prev => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesheetUser, neededYears.join(',')]);

  // Build a Set of holiday date strings for fast lookup (YYYY-MM-DD)
  const holidayDatesSet = useMemo(() => {
    const set = new Set();
    for (const list of Object.values(holidaysByYear)) {
      for (const h of list || []) {
        if (h.date) set.add(String(h.date).slice(0, 10));
      }
    }
    return set;
  }, [holidaysByYear]);

  const isNonWorkingDay = (dateStr) => {
    const d = parseLocalDate(dateStr);
    if (!d) return false;
    const day = d.getDay();
    return day === 0 || day === 6 || holidayDatesSet.has(dateStr);
  };

  // The backend rejects a half-day taken on a weekend/holiday, but the client
  // used to return a flat 0.5 without checking — the form happily submitted and
  // the user got a bare server error.
  const halfDayOnNonWorkingDay = isHalfDay && !!fromDate && isNonWorkingDay(fromDate);

  // Calculate business days between from and to, excluding weekends and holidays
  const leaveDays = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    if (isHalfDay) return isNonWorkingDay(fromDate) ? 0 : 0.5;

    // Dates are built from local Y-M-D parts throughout: `new Date('YYYY-MM-DD')`
    // parses as UTC midnight, so getDay() below would report the PREVIOUS day in
    // any negative-offset timezone and mis-count weekends.
    const start = parseLocalDate(fromDate);
    const end = parseLocalDate(toDate);
    if (!start || !end || start > end) return 0;

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      if (!isNonWorkingDay(toLocalKey(current))) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (parseLocalDate(fromDate) > parseLocalDate(toDate)) {
      showToast('From date cannot be after To date', 'error');
      return;
    }
    // The backend rejects half-days on weekends/holidays — catch it here so the
    // user gets a sentence they can act on instead of a bare server error.
    if (halfDayOnNonWorkingDay) {
      showToast('A half-day cannot be taken on a weekend or holiday', 'error');
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
      // Every validation in POST /leave-requests (LWD guard, overlap,
      // half-day-on-weekend, not-eligible, no-policy) responds { error: '...' }
      // — reading only `.message` reduced all of them to a useless generic.
      showToast(
        err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to submit leave application',
        'error'
      );
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
            const colors = leaveTypeTextClasses(bal.leaveType);
            return (
              <div
                key={bal.leaveType}
                className={`bg-dark-800 border border-dark-700 rounded-xl p-4 ${
                  leaveType === bal.leaveType ? 'ring-1 ring-rivvra-500' : ''
                }`}
              >
                <p className={`text-sm font-medium mb-3 ${colors.split(' ')[0]}`}>
                  {formatLeaveType(bal.leaveType, bal.name)}
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
                  {formatLeaveType(bal.leaveType, bal.name)} ({bal.available ?? 0} available)
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          {(() => {
            // Build from the stored UTC calendar parts — toISOString() on an
            // already-UTC-midnight date is fine, but going through local parts
            // keeps this consistent with the rest of the page's date handling.
            const lwd = timesheetUser?.lastWorkingDate ? new Date(timesheetUser.lastWorkingDate) : null;
            const lwdMax = lwd && !isNaN(lwd.getTime())
              ? `${lwd.getUTCFullYear()}-${String(lwd.getUTCMonth() + 1).padStart(2, '0')}-${String(lwd.getUTCDate()).padStart(2, '0')}`
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

          {halfDayOnNonWorkingDay && (
            <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-400">
                The selected date is a weekend or holiday — a half-day can only be taken on a working day.
              </p>
            </div>
          )}

          {fromDate && toDate && leaveDays === 0 && !halfDayOnNonWorkingDay && (
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
              disabled={submitting || !leaveType || !fromDate || !toDate || !reason.trim() || leaveDays <= 0 || halfDayOnNonWorkingDay}
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
