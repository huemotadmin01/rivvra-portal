import { useState, useEffect, useCallback } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import { getAttendance, updateAttendance, submitAttendance, resetAttendance } from '../../utils/timesheetApi';
import {
  ChevronLeft, ChevronRight, Save, Send, Loader2, AlertCircle,
  CheckCircle2, Clock, XCircle, Info, RotateCcw,
} from 'lucide-react';
import { PageHeader, Panel, Callout, Button, PageSpinner } from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// This page is a factual record that feeds payroll, so the rule for it is the
// same as my-timesheet's: nothing above `return (` moves. `isAfterLwd`, the
// future-date guard (`dateStr > todayStr`), `canEdit`, the status toggle cycles
// and the summary arithmetic are spliced in from the legacy file verbatim and
// checked occurrence-by-occurrence.
//
// The ONE exception is `statusConfig` / `statusBanners`, which sit above the
// return but are pure presentation tables — they are the reason the page was
// dark-only. Their colour fields are re-tokenised below. Their CONTENT fields
// (label / short / emoji, and every banner's text) are byte-identical to
// legacy, and a check in the PR asserts that, because those strings are what
// the legend and the mobile list actually render.
// ─────────────────────────────────────────────────────────────────────────────

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Use UTC extraction — dates stored as midnight UTC in MongoDB
import { toDateInputValue } from '../../utils/dateUtils';
function toISTDateStr(d) {
  return toDateInputValue(d);
}

// Status display config.
//
// Legacy carried six pre-baked Tailwind class strings per status (gradient, bg,
// text, border, dot, ring, hoverBg) on a fixed dark scale. Each status now
// names ONE accent token and the render derives the tint, the border and the
// dot from it, so a status cannot end up themed in one place and not another.
//
// `half: true` is how legacy distinguished ½ Leave from Leave and ½HW from HW —
// it used a lighter step of the same hue (blue-300 on blue-400, orange-300 on
// orange-400). There is one --acc step per family, so the half-variants keep
// the parent hue and take a weaker tint instead of borrowing a different one.
const statusConfig = {
  working:  { label: 'Present',  short: 'P',  emoji: '✓', accent: 'var(--acc-emerald)' },
  half_day: { label: 'Half Day', short: '½',  emoji: '◑', accent: 'var(--acc-amber)' },
  absent:   { label: 'Absent',   short: 'A',  emoji: '✕', accent: 'var(--danger)' },
  leave:    { label: 'Leave',    short: 'L',  emoji: '🏖', accent: 'var(--acc-blue)' },
  half_day_leave: { label: '½ Leave', short: '½L', emoji: '🏖', accent: 'var(--acc-blue)', half: true },
  holiday:  { label: 'Holiday',  short: 'H',  emoji: '🎉', accent: 'var(--acc-purple)' },
  holiday_work:      { label: 'Holiday Work',      short: 'HW',  emoji: '🔨', accent: 'var(--acc-orange)' },
  holiday_work_half: { label: 'HW Half Day',  short: '½HW', emoji: '🔨', accent: 'var(--acc-orange)', half: true },
  weekend:    { label: 'Weekend',    short: '—',  emoji: '—', accent: 'var(--fg-4)', muted: true },
  not_joined: { label: 'Not Joined', short: '—',  emoji: '—', accent: 'var(--fg-4)', muted: true },
  upcoming:   { label: 'Upcoming',   short: '—',  emoji: '·', accent: 'var(--fg-4)', muted: true, dashed: true },
  unfilled:   { label: 'Unfilled',   short: '—',  emoji: '—', accent: 'var(--fg-4)', muted: true, dashed: true },
};

/** Tint / border / ink derived from a status's single accent token. */
const tint = (cfg, pct) => `color-mix(in srgb, ${cfg.accent} ${cfg.half ? pct * 0.6 : pct}%, transparent)`;

// `cellInk` is the ACCENT — legend dots and summary figures, which sit on a
// neutral surface and can carry the hue safely.
const cellInk = (cfg) => (cfg.muted ? 'var(--fg-4)' : cfg.accent);

// `statusInk` is for the letter INSIDE a tinted cell, and it deliberately is
// not the accent. An accent on a wash of itself is the pairing Chip already
// documents as landing ~4.35 against a 4.5 floor; measured here it was worse
// still (emerald 3.50, purple 3.96) because the cell tint and the pill fill
// stacked. Letting the tint carry the status and the text stay near-black
// holds every status well clear of AA in both themes, and stops the page
// conveying status by hue alone.
const statusInk = (cfg) => (cfg.muted ? 'var(--fg-3)' : 'var(--fg)');

function getEntryDisplayStatus(entry) {
  if (entry.status === 'working') {
    const h = parseFloat(entry.hours) || 0;
    if (h === 0) return 'unfilled';
    return h <= 4 ? 'half_day' : 'working';
  }
  if (entry.status === 'leave') {
    const h = parseFloat(entry.hours) || 0;
    if (h > 0 && h <= 4) return 'half_day_leave';
  }
  if (entry.status === 'holiday_work') return 'holiday_work';
  if (entry.status === 'holiday_work_half') return 'holiday_work_half';
  return entry.status;
}

const statusBanners = {
  submitted: { icon: Clock, text: 'Submitted — waiting for manager approval', tone: 'warn' },
  approved:  { icon: CheckCircle2, text: 'Approved by manager', tone: 'brand' },
  rejected:  { icon: XCircle, text: 'Rejected — please update and re-submit', tone: 'danger' },
};

export default function MyAttendancePageV2() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [attendance, setAttendance] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [periodLocked, setPeriodLocked] = useState(false);
  // null when the month loaded fine; otherwise { kind, message }.
  const [loadError, setLoadError] = useState(null);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    setPeriodLocked(false);
    setLoadError(null);
    try {
      const data = await getAttendance(month, year);
      setAttendance(data.attendance);
      setEntries(data.attendance?.entries || []);
      setPeriodLocked(!!data.periodLocked);
    } catch (err) {
      // On failure this page used to render its header, all-zero summary cards
      // and an empty calendar shell with no message at all — a 403 for an
      // employment type that doesn't use attendance looked identical to a month
      // with nothing marked. Record why so the render can say something.
      const status = err.response?.status;
      const message = err.response?.data?.error || err.response?.data?.message;
      setLoadError({
        kind: status === 403 ? 'not_applicable' : 'error',
        message,
      });
      if (status !== 403) showToast(message || 'Failed to load attendance', 'error');
      setAttendance(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const canEdit = !periodLocked && attendance && (attendance.status === 'draft' || attendance.status === 'rejected');

  // Last Working Date guard — disables every day after the employee's LWD
  const lastWorkingDate = (() => {
    const lwd = timesheetUser?.lastWorkingDate;
    if (!lwd) return null;
    const d = new Date(lwd);
    return isNaN(d.getTime()) ? null : d;
  })();

  const isAfterLwd = (dateStr) => {
    if (!lastWorkingDate) return false;
    // dateStr format: YYYY-MM-DD
    const [y, m, d] = dateStr.split('-').map(Number);
    const cell = new Date(y, m - 1, d);
    const lwdOnly = new Date(lastWorkingDate.getFullYear(), lastWorkingDate.getMonth(), lastWorkingDate.getDate());
    return cell > lwdOnly;
  };

  const handleDayClick = (dateStr) => {
    if (!canEdit) return;
    if (isAfterLwd(dateStr)) return;
    // Future-date guard: attendance is a factual record — you can't truthfully
    // claim Present/Absent/Half for a day that hasn't happened yet. The cell
    // is also visually disabled (see render path), this is belt-and-suspenders.
    if (dateStr > todayStr) return;

    setEntries(prev => prev.map(e => {
      const eDate = toISTDateStr(e.date);
      if (eDate !== dateStr) return e;
      if (['leave', 'weekend', 'not_joined'].includes(e.status)) return e;

      // Holiday toggle cycle: holiday → holiday_work → holiday_work_half → holiday
      if (e.status === 'holiday') {
        return { ...e, status: 'holiday_work', hours: 8 };
      }
      if (e.status === 'holiday_work') {
        return { ...e, status: 'holiday_work_half', hours: 4 };
      }
      if (e.status === 'holiday_work_half') {
        return { ...e, status: 'holiday', hours: 0 };
      }

      // Normal working day cycle: Present → Half Day → Absent → Present
      if (e.status === 'working' && parseFloat(e.hours) >= 8) {
        return { ...e, status: 'working', hours: 4, notes: 'Half day' };
      } else if (e.status === 'working' && parseFloat(e.hours) <= 4) {
        return { ...e, status: 'absent', hours: 0, notes: '' };
      } else {
        return { ...e, status: 'working', hours: 8, notes: '' };
      }
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!attendance || saving) return;
    setSaving(true);
    try {
      const data = await updateAttendance(attendance._id, entries);
      setAttendance(data.attendance);
      setEntries(data.attendance.entries);
      setDirty(false);
      showToast('Attendance saved', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!attendance || submitting) return;

    // Check for unfilled working days
    const unfilledDays = entries.filter(e => e.status === 'working' && (parseFloat(e.hours) || 0) === 0).length;
    if (unfilledDays > 0) {
      if (!window.confirm(`You have ${unfilledDays} unfilled day${unfilledDays > 1 ? 's' : ''}. Submit anyway?`)) return;
    }

    if (dirty) {
      setSaving(true);
      try {
        const data = await updateAttendance(attendance._id, entries);
        setAttendance(data.attendance);
        setEntries(data.attendance.entries);
        setDirty(false);
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to save', 'error');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setSubmitting(true);
    try {
      const data = await submitAttendance(attendance._id);
      setAttendance(data.attendance);
      setEntries(data.attendance.entries);
      showToast('Attendance submitted for approval', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!attendance) return;
    if (!window.confirm('Reset this attendance? All entries will be cleared.')) return;
    try {
      // Blank working entries via PATCH (keeps leave/holiday/weekend intact)
      const data = await resetAttendance(attendance._id);
      setAttendance(data.attendance);
      setEntries(data.attendance.entries);
      setDirty(false);
      showToast('Attendance reset');
    } catch (err) {
      showToast(err.response?.data?.error || 'Reset failed', 'error');
    }
  };

  // Earliest allowed month: January of current year
  const minYear = now.getFullYear();
  const minMonth = 1;

  const navigateMonth = (dir) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    else if (m < 1) { m = 12; y--; }
    // Block navigation to previous years
    if (y < minYear) return;
    setMonth(m);
    setYear(y);
  };

  const canGoBack = !(year === minYear && month === minMonth);

  // Build calendar grid
  const buildCalendarGrid = () => {
    if (!entries.length) return [];

    const entryMap = {};
    for (const e of entries) {
      entryMap[toISTDateStr(e.date)] = e;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const weeks = [];
    let currentWeek = new Array(startOffset).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const entry = entryMap[dateStr] || null;
      currentWeek.push({ day: d, dateStr, entry });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  };

  // Summary counts
  const summary = (() => {
    let present = 0, halfDay = 0, leave = 0, holiday = 0, absent = 0, weekend = 0, holidayWork = 0;
    entries.forEach(e => {
      if (e.status === 'not_joined' || e.status === 'upcoming') return;
      if (e.status === 'weekend') weekend++;
      else if (e.status === 'holiday') holiday++;
      else if (e.status === 'holiday_work') { holiday++; holidayWork += 1; }
      else if (e.status === 'holiday_work_half') { holiday++; holidayWork += 0.5; }
      else if (e.status === 'leave') {
        const h = parseFloat(e.hours) || 0;
        leave += (h > 0 && h <= 4) ? 0.5 : 1;
      }
      else if (e.status === 'absent') absent++;
      else if (e.status === 'working') {
        const h = parseFloat(e.hours) || 0;
        if (h >= 8) present++;
        else if (h > 0) halfDay++;
      }
    });
    const effective = present + (halfDay * 0.5) + holiday + leave;
    const totalCalendarDays = new Date(year, month, 0).getDate();
    return { present, halfDay, leave, holiday, absent, weekend, effective, totalCalendarDays, holidayWork };
  })();

  const weeks = buildCalendarGrid();
  const banner = statusBanners[attendance?.status];
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Summary card data
  const summaryCards = [
    { label: 'Present', value: summary.present, color: 'emerald', config: statusConfig.working },
    { label: 'Half Day', value: summary.halfDay, color: 'amber', config: statusConfig.half_day },
    { label: 'Leave', value: summary.leave, color: 'blue', config: statusConfig.leave },
    { label: 'Holiday', value: summary.holiday, color: 'purple', config: statusConfig.holiday },
    { label: 'Absent', value: summary.absent, color: 'red', config: statusConfig.absent },
    ...(summary.holidayWork > 0 ? [{ label: 'Holiday Work', value: summary.holidayWork, color: 'orange', config: statusConfig.holiday_work }] : []),
  ];

  if (loading) return <PageSpinner label="Loading attendance..." />;

  if (loadError) {
    const notApplicable = loadError.kind === 'not_applicable';
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <PageHeader title="My Attendance" sub={`${monthNames[month - 1]} ${year}`} />
        <Panel>
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <AlertCircle
              size={40}
              style={{ margin: '0 auto 12px', color: notApplicable ? 'var(--fg-4)' : 'var(--warn)' }}
            />
            <p style={{ font: "400 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', maxWidth: 420, margin: '0 auto' }}>
              {notApplicable
                ? (loadError.message || "Attendance tracking doesn't apply to your employment type. Contact HR if you think this is wrong.")
                : "We couldn't load your attendance for this month."}
            </p>
            {!notApplicable && (
              <>
                <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>
                  This isn't the same as having nothing marked — please try again.
                </p>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                  <Button variant="secondary" size="sm" iconLeft={<RotateCcw size={14} />} onClick={fetchAttendance}>
                    Retry
                  </Button>
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>
    );
  }

  const monthNav = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'var(--surface-2)', border: '1px solid var(--line-2)',
      borderRadius: 'var(--r-2)', padding: 3,
    }}>
      <button
        onClick={() => navigateMonth(-1)}
        disabled={!canGoBack}
        aria-label="Previous month"
        style={{
          display: 'grid', placeItems: 'center', width: 30, height: 30,
          borderRadius: 'var(--r-1)', border: 'none', background: 'transparent',
          color: canGoBack ? 'var(--fg-3)' : 'var(--fg-faint)',
          cursor: canGoBack ? 'pointer' : 'not-allowed',
        }}
      >
        <ChevronLeft size={16} />
      </button>
      <div style={{
        minWidth: 130, textAlign: 'center', padding: '0 8px', userSelect: 'none',
        font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)',
      }}>
        {monthNames[month - 1]} {year}
      </div>
      <button
        onClick={() => navigateMonth(1)}
        aria-label="Next month"
        style={{
          display: 'grid', placeItems: 'center', width: 30, height: 30,
          borderRadius: 'var(--r-1)', border: 'none', background: 'transparent',
          color: 'var(--fg-3)', cursor: 'pointer',
        }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader
        title="My Attendance"
        sub={<span className="hidden sm:block">Mark your monthly attendance</span>}
        actions={monthNav}
      />

      {/* Legacy gave a clickable cell `hover:brightness-125` and its pill a
          `group-hover:shadow-sm`. Inline styles can't express :hover, and the
          affordance is the only cue that a cell is editable, so it moves to a
          scoped sheet rather than being dropped. Only cells that pass the full
          isClickable guard get the class. */}
      <style>{`
        .att-cell { transition: filter var(--d-1) var(--e-out), box-shadow var(--d-1) var(--e-out); }
        .att-cell:hover { filter: brightness(1.18); }
        .att-cell:active { transform: scale(0.97); }
        .att-row:active { background: var(--surface-2); }
      `}</style>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* ── Last Working Date ── */}
        {lastWorkingDate && (
          <Callout tone="warn" icon={<AlertCircle size={18} />}>
            Your last working date is{' '}
            <strong>{lastWorkingDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.
            {' '}You can mark attendance only up to this date.
          </Callout>
        )}

        {/* ── Period Locked ── */}
        {periodLocked && (
          <Callout tone="warn" icon={<AlertCircle size={18} />}>
            Payroll for {monthNames[month - 1]} {year} is locked. Attendance cannot be modified.
          </Callout>
        )}

        {/* ── Status ── */}
        {banner && (
          <Callout tone={banner.tone} icon={<banner.icon size={18} />}>
            {banner.text}
            {attendance?.rejectionReason && (
              <span style={{ fontStyle: 'italic', opacity: 0.85 }}> "{attendance.rejectionReason}"</span>
            )}
          </Callout>
        )}

        {/* ── Auto-revert ── */}
        {attendance?.autoRevertReason && attendance?.status === 'draft' && (
          <Callout tone="warn" icon={<AlertCircle size={18} />}>
            {attendance.autoRevertReason}
          </Callout>
        )}

        {/* ── Summary Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
          {summaryCards.map(({ label, value, config }) => (
            <div
              key={label}
              style={{
                background: 'var(--surface-1)', border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-2)', padding: 12, textAlign: 'center',
              }}
            >
              <div style={{
                font: "700 22px/1 'Inter', system-ui, sans-serif", color: cellInk(config),
                fontVariantNumeric: 'tabular-nums', marginBottom: 5,
              }}>
                {value}
              </div>
              <div style={{
                font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {label}
              </div>
            </div>
          ))}
          <div style={{
            background: 'var(--surface-1)', border: '1px solid var(--brand-line)',
            borderRadius: 'var(--r-2)', padding: 12, textAlign: 'center',
          }}>
            <div style={{
              font: "700 22px/1 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)',
              fontVariantNumeric: 'tabular-nums', marginBottom: 5,
            }}>
              {summary.effective}
            </div>
            <div style={{
              font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Effective
            </div>
          </div>
        </div>

        {/* ── Calendar Grid (desktop / tablet) ── */}
        <Panel flush className="hidden sm:block">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {dayHeaders.map((d, i) => (
              <div
                key={d}
                style={{
                  padding: '12px 0', textAlign: 'center',
                  font: "600 11px/1 'Inter', system-ui, sans-serif",
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  color: i >= 5 ? 'var(--fg-4)' : 'var(--fg-3)',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--line-2)' }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {week.map((cell, ci) => {
                  if (!cell) {
                    return <div key={ci} style={{ minHeight: 88, background: 'var(--surface-2)', borderBottom: '1px solid var(--line-2)', borderRight: '1px solid var(--line-2)' }} />;
                  }

                  const { day, dateStr, entry } = cell;
                  if (!entry) {
                    return <div key={ci} style={{ minHeight: 88, background: 'var(--surface-2)', borderBottom: '1px solid var(--line-2)', borderRight: '1px solid var(--line-2)' }} />;
                  }

                  const displayStatus = getEntryDisplayStatus(entry);
                  const config = statusConfig[displayStatus] || statusConfig.working;
                  const isLocked = ['leave', 'weekend', 'not_joined'].includes(entry.status);
                  const isPostLwd = isAfterLwd(dateStr);
                  // Future dates can't be filled — attendance is a factual record,
                  // you don't yet know whether you'll be Present/Absent tomorrow.
                  const isFuture = dateStr > todayStr;
                  const isClickable = canEdit && !isLocked && !isPostLwd && !isFuture;
                  const isToday = dateStr === todayStr;
                  const isWeekend = entry.status === 'weekend';
                  const cellTooltip = isPostLwd
                    ? `Beyond last working date (${lastWorkingDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})`
                    : isFuture
                      ? "Can't mark attendance for a future date"
                      : '';

                  return (
                    <div
                      key={ci}
                      title={cellTooltip}
                      className={isClickable ? 'att-cell' : undefined}
                      onClick={() => isClickable && handleDayClick(dateStr)}
                      style={{
                        minHeight: 88, padding: 8, position: 'relative',
                        borderBottom: '1px solid var(--line-2)', borderRight: '1px solid var(--line-2)',
                        // Legacy painted these with a gradient. A flat tint reads the
                        // same at this size and keeps the cell auditable — the contrast
                        // checker skips any node under a gradient ancestor.
                        // No `opacity` dimming here. Opacity on the cell blends the
                        // whole subtree toward the backdrop, which both lowers real
                        // contrast and hides it from the audit (computed colour is
                        // unchanged). Muted days get an explicit surface instead.
                        background: isPostLwd || isFuture || isWeekend ? 'var(--surface-2)' : tint(config, 12),
                        cursor: isClickable ? 'pointer' : isPostLwd || isFuture ? 'not-allowed' : 'default',
                        boxShadow: isToday ? 'inset 0 0 0 2px var(--brand-line)' : 'none',
                        transition: 'background var(--d-1) var(--e-out)',
                      }}
                    >
                      {isToday && (
                        <div style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 99, background: 'var(--brand)' }} />
                      )}

                      <div style={{
                        font: "600 12px/1 'Inter', system-ui, sans-serif", marginBottom: 6,
                        color: isToday ? 'var(--brand-ink)' : isWeekend ? 'var(--fg-4)' : 'var(--fg-2)',
                      }}>
                        {day}
                      </div>

                      <div style={{
                        borderRadius: 'var(--r-1)', padding: '5px 6px', textAlign: 'center',
                        background: 'transparent',
                        border: `1px ${config.dashed ? 'dashed' : 'solid'} ${tint(config, 34)}`,
                      }}>
                        <span style={{ font: "700 11px/1 'Inter', system-ui, sans-serif", color: statusInk(config) }}>
                          {config.short}
                        </span>
                      </div>

                      {entry.notes && ['leave', 'holiday', 'holiday_work', 'holiday_work_half'].includes(entry.status) && (
                        <div
                          title={entry.notes}
                          style={{
                            font: "400 9px/1.3 'Inter', system-ui, sans-serif", marginTop: 4,
                            color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.notes.replace('Leave: ', '')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Calendar List (mobile) — one tappable row per day ── */}
        <Panel flush className="sm:hidden">
          {[...entries]
            .sort((a, b) => (toISTDateStr(a.date) < toISTDateStr(b.date) ? -1 : 1))
            .map((entry) => {
              const dateStr = toISTDateStr(entry.date);
              const [yy, mm, dd] = dateStr.split('-').map(Number);
              const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(yy, mm - 1, dd).getDay()];
              const displayStatus = getEntryDisplayStatus(entry);
              const config = statusConfig[displayStatus] || statusConfig.working;
              const isLocked = ['leave', 'weekend', 'not_joined'].includes(entry.status);
              const isPostLwd = isAfterLwd(dateStr);
              const isFuture = dateStr > todayStr;
              const isClickable = canEdit && !isLocked && !isPostLwd && !isFuture;
              const isToday = dateStr === todayStr;
              const isWeekend = entry.status === 'weekend';
              const isMuted = isPostLwd || isFuture || entry.status === 'not_joined' || entry.status === 'upcoming';
              const cellTooltip = isPostLwd
                ? `Beyond last working date (${lastWorkingDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})`
                : isFuture
                  ? "Can't mark attendance for a future date"
                  : '';
              const emoji = config.emoji && !['—', '·'].includes(config.emoji) ? `${config.emoji} ` : '';

              return (
                <div
                  key={dateStr}
                  title={cellTooltip}
                  className={isClickable ? 'att-row' : undefined}
                  onClick={() => isClickable && handleDayClick(dateStr)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderBottom: '1px solid var(--line-2)',
                    background: isToday ? 'var(--brand-soft)' : isWeekend || isMuted ? 'var(--surface-2)' : 'transparent',
                    cursor: isClickable ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                    <div style={{ font: "500 10px/1 'Inter', system-ui, sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-4)' }}>
                      {weekday}
                    </div>
                    <div style={{
                      font: "600 15px/1.2 'Inter', system-ui, sans-serif", marginTop: 2,
                      color: isToday ? 'var(--brand-ink)' : isWeekend ? 'var(--fg-4)' : 'var(--fg-2)',
                    }}>
                      {dd}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: 'var(--r-1)',
                      font: "600 12px/1.2 'Inter', system-ui, sans-serif",
                      background: tint(config, 14),
                      border: `1px ${config.dashed ? 'dashed' : 'solid'} ${tint(config, 34)}`,
                      color: statusInk(config),
                    }}>
                      {emoji}{config.label}
                    </span>
                    {entry.notes && ['leave', 'holiday', 'holiday_work', 'holiday_work_half'].includes(entry.status) && (
                      <span
                        title={entry.notes}
                        style={{
                          display: 'block', font: "400 10px/1.3 'Inter', system-ui, sans-serif", marginTop: 3,
                          color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.notes.replace('Leave: ', '')}
                      </span>
                    )}
                  </div>

                  {isClickable && <ChevronRight size={16} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />}
                </div>
              );
            })}
        </Panel>

        {/* ── Legend ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px', padding: '0 4px' }}>
          {Object.entries(statusConfig).filter(([k]) => k !== 'weekend' && k !== 'not_joined').map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: cellInk(cfg), flexShrink: 0 }} />
              <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* ── Actions ── */}
        {canEdit && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-4)' }}>
              <Info size={13} style={{ flexShrink: 0 }} />
              <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", margin: 0 }}>
                Weekday: <span style={{ color: 'var(--acc-emerald)' }}>Present</span> → <span style={{ color: 'var(--acc-amber)' }}>Half</span> → <span style={{ color: 'var(--danger)' }}>Absent</span>
                {' · '}
                Holiday: <span style={{ color: 'var(--acc-orange)' }}>HW</span> → <span style={{ color: 'var(--acc-orange)' }}>½HW</span> → <span style={{ color: 'var(--acc-purple)' }}>Holiday</span>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="ghost" size="md" onClick={handleReset} disabled={saving || submitting} iconLeft={<RotateCcw size={15} />}>
                Reset
              </Button>
              <Button variant="secondary" size="md" onClick={handleSave} disabled={saving || !dirty} iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}>
                Save Draft
              </Button>
              <Button variant="primary" size="md" onClick={handleSubmit} disabled={submitting} iconLeft={submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}>
                <span className="sm:hidden">Submit</span>
                <span className="hidden sm:inline">Submit for Approval</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
