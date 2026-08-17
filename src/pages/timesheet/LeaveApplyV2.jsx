import { useState, useEffect, useMemo } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import { getMyLeaveBalances, applyLeave, getHolidays } from '../../utils/timesheetApi';
import { CalendarDays, Send, AlertCircle, Info } from 'lucide-react';
import { formatLeaveType, leaveTypeAccent } from '../../config/leaveTypes';
import {
  PageHeader, Panel, Callout, Button, Field, Input, Select, Textarea,
  Switch, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// This page previews how many days a leave request will cost and how many of
// them become LOP — Loss of Pay. That preview is pay-affecting, so everything
// above `return (` is spliced in from the legacy file verbatim and diffed
// byte-for-byte: the two date helpers, `neededYears`, `holidayDatesSet`,
// `isNonWorkingDay`, the business-day count in `leaveDays`, `lopDays`, the
// half-day-on-a-non-working-day guard, and every check in `handleSubmit`.
//
// The date helpers in particular carry hard-won comments about `new Date('Y-M-D')`
// parsing as UTC midnight and mis-counting weekends in negative-offset zones.
// Nothing in here is reformatted.
// ─────────────────────────────────────────────────────────────────────────────

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

export default function LeaveApplyV2() {
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

  if (profileLoading || loading) return <PageSpinner label="Loading leave balances…" />;

  // Not eligible for leave management
  if (balances?.eligible === false) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <PageHeader title="Apply for Leave" />
        <Panel>
          <EmptyState
            icon={<AlertCircle size={22} />}
            title="Leave Management Unavailable"
            sub="Leave management is not available for your employment type. Contact your manager for leave requests."
          />
        </Panel>
      </div>
    );
  }

  const leaveTypes = balances?.balances || [];

  // Built from the stored UTC calendar parts — toISOString() on an already-UTC-
  // midnight date is fine, but going through local parts keeps this consistent
  // with the rest of the page's date handling.
  const lwd = timesheetUser?.lastWorkingDate ? new Date(timesheetUser.lastWorkingDate) : null;
  const lwdMax = lwd && !isNaN(lwd.getTime())
    ? `${lwd.getUTCFullYear()}-${String(lwd.getUTCMonth() + 1).padStart(2, '0')}-${String(lwd.getUTCDate()).padStart(2, '0')}`
    : undefined;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="Apply for Leave"
        sub={<span className="hidden sm:block">Check your balance and submit a leave request</span>}
      />

      <div style={{ display: 'grid', gap: 14 }}>
        {/* ── Leave Balance Cards ── */}
        {leaveTypes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {leaveTypes.map((bal) => {
              const accent = leaveTypeAccent(bal.leaveType);
              const isSelected = leaveType === bal.leaveType;
              return (
                <div
                  key={bal.leaveType}
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 'var(--r-2)',
                    padding: 14,
                    // The selected card is ringed in brand, as in legacy. The
                    // accent below is TEXT on this neutral surface, never a fill
                    // under itself.
                    boxShadow: isSelected ? 'inset 0 0 0 2px var(--brand-line)' : 'none',
                  }}
                >
                  <p style={{ font: "600 13px/1.2 'Inter', system-ui, sans-serif", color: accent, margin: '0 0 12px' }}>
                    {formatLeaveType(bal.leaveType, bal.name)}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ font: "700 24px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {bal.available ?? 0}
                      </p>
                      <p style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>Available</p>
                    </div>
                    <div style={{ textAlign: 'right', display: 'grid', gap: 2 }}>
                      <p style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                        Accrued: <span style={{ color: 'var(--fg-2)' }}>{bal.accrued ?? 0}</span>
                      </p>
                      <p style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                        Used: <span style={{ color: 'var(--fg-2)' }}>{bal.used ?? 0}</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Leave Application Form ── */}
        <form onSubmit={handleSubmit}>
          <Panel icon={<CalendarDays size={16} />} title="Leave Application">
            <div style={{ display: 'grid', gap: 14 }}>

              <Field label="Leave Type" htmlFor="la-type">
                <Select
                  id="la-type"
                  value={leaveType}
                  onChange={(e) => {
                    setLeaveType(e.target.value);
                    setIsHalfDay(false);
                  }}
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((bal) => (
                    <option key={bal.leaveType} value={bal.leaveType}>
                      {formatLeaveType(bal.leaveType, bal.name)} ({bal.available ?? 0} available)
                    </option>
                  ))}
                </Select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                <Field label="From Date" htmlFor="la-from">
                  <Input
                    id="la-from"
                    type="date"
                    value={fromDate}
                    max={lwdMax}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      if (!toDate || e.target.value > toDate) setToDate(e.target.value);
                    }}
                  />
                </Field>
                <Field label="To Date" htmlFor="la-to">
                  <Input
                    id="la-to"
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    max={lwdMax}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </Field>
              </div>

              {lwdMax && (
                <Callout tone="warn" icon={<AlertCircle size={16} />}>
                  Your last working date is {new Date(timesheetUser.lastWorkingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Leave cannot extend beyond this date.
                </Callout>
              )}

              {/* Half-day toggle (only if policy allows) */}
              {halfDayAllowed && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Switch
                      checked={isHalfDay}
                      label="Half Day"
                      onChange={() => {
                        setIsHalfDay(!isHalfDay);
                        if (!isHalfDay) setToDate(fromDate); // half-day is single day
                      }}
                    />
                    <span style={{ font: "500 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Half Day</span>
                  </div>

                  {isHalfDay && (
                    <div style={{ display: 'flex', gap: 18, paddingLeft: 2 }}>
                      {[['first_half', 'First Half'], ['second_half', 'Second Half']].map(([value, label]) => (
                        <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
                          <input
                            type="radio"
                            name="halfDaySession"
                            value={value}
                            checked={halfDaySession === value}
                            onChange={() => setHalfDaySession(value)}
                            style={{ accentColor: 'var(--brand)' }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Field label="Reason" htmlFor="la-reason">
                <Textarea
                  id="la-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Enter the reason for your leave..."
                  style={{ resize: 'none' }}
                />
              </Field>

              {/* ── Cost preview. Strings byte-identical to legacy. ── */}
              {fromDate && toDate && leaveDays > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Callout icon={<Info size={16} />}>
                    Leave days to be deducted: <strong style={{ color: 'var(--fg)' }}>{leaveDays}</strong>
                  </Callout>

                  {lopDays > 0 && (
                    <Callout tone="warn" icon={<AlertCircle size={16} />}>
                      Insufficient balance. <strong>{lopDays} day{lopDays !== 1 ? 's' : ''}</strong> will be marked as LOP (Loss of Pay).
                    </Callout>
                  )}
                </div>
              )}

              {halfDayOnNonWorkingDay && (
                <Callout tone="warn" icon={<AlertCircle size={16} />}>
                  The selected date is a weekend or holiday — a half-day can only be taken on a working day.
                </Callout>
              )}

              {fromDate && toDate && leaveDays === 0 && !halfDayOnNonWorkingDay && (
                <Callout icon={<AlertCircle size={16} />}>
                  No working days in the selected range (weekends/holidays excluded).
                </Callout>
              )}

              <div style={{ paddingTop: 2 }}>
                <Button
                  type="submit"
                  iconLeft={<Send size={15} />}
                  disabled={submitting || !leaveType || !fromDate || !toDate || !reason.trim() || leaveDays <= 0 || halfDayOnNonWorkingDay}
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </Button>
              </div>
            </div>
          </Panel>
        </form>
      </div>
    </div>
  );
}
