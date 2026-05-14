# Employee Self Service Guide

This guide covers everything an admin needs to know about the Employee Self Service (ESS) module — attendance marking, leave management, salary and payslip access, tax declarations, and how to configure policies. ESS is the employee-facing side of the Timesheet app.

---

## Timesheet modes

Every employee is automatically placed into one of two tracking modes based on their employment type and billable flag:

| Employment type | Billable | Mode |
|---|---|---|
| Confirmed | Any | Attendance |
| Internal Consultant | Non-billable | Attendance |
| Internal Consultant | Billable | Timesheet |
| External Consultant | Any | Timesheet |
| Intern | Any | Attendance |

- **Attendance mode** — the employee marks daily attendance via a monthly calendar grid. Payroll uses these entries for proration (present, absent, half-day, LOP).
- **Timesheet mode** — the employee logs hours against projects. Pay is calculated from timesheet days, not the attendance calendar.

This determines which pages appear in the employee's sidebar. You don't configure it manually — it's derived automatically.

---

## My Attendance

The attendance page shows a monthly calendar grid. Employees navigate months using prev/next controls.

### Entry statuses

| Status | Display | Meaning |
|---|---|---|
| `working` | **P** (Present) | Full day worked |
| `half_day` | **½** | Half day worked |
| `absent` | **A** | Absent, unpaid |
| `leave` | **L** | Approved leave |
| `half_day_leave` | **½L** | Half-day approved leave |
| `holiday` | **H** | Org holiday |
| `holiday_work` | **HW** | Worked on a holiday (full day) |
| `holiday_work_half` | **½HW** | Worked on a holiday (half day) |
| `weekend` | — | Weekend day |
| `not_joined` | — | Before joining date |
| `upcoming` | — | Future dates |
| `unfilled` | — | Past date not yet marked |

### Workflow

1. The employee clicks cells to toggle between present, half-day, absent, etc.
2. **Save** stores as a draft — not visible to payroll yet.
3. **Submit** sends the month for manager/HR review. A status banner shows whether the month is submitted (amber), approved (green), or rejected (red).
4. If the payroll period is locked, editing is blocked entirely with a lock banner.

### How attendance feeds payroll

The proration formula for attendance-mode employees:

```
totalWorkingDays = presentDays + (halfDays × 0.5) + holidays + paidLeaves
```

Holiday-work days (`holiday_work`, `holiday_work_half`) count as holidays for the regular pay formula but are tracked separately — if the org has a **holiday work allowance** configured, those days generate an additional earning.

---

## Leave management

### Who is eligible

Not all employees can use leave management:

- **External consultants** — never eligible.
- **Billable internal consultants** — not eligible.
- **Everyone else** (confirmed, non-billable IC, interns) — eligible.

If an employee isn't eligible, the Leaves section doesn't appear in their sidebar at all.

### Leave types

Leave types are configured per org under **Employee Self Service → Configuration → Leave Policy**. Common types:

- **Casual Leave** — short-notice personal leave.
- **Sick Leave** — illness-related; may require medical certificate for extended periods.
- **Earned Leave / Privilege Leave** — accrued based on tenure; often encashable on exit.
- **Compensatory Off** — in lieu of working on a holiday.
- **Maternity Leave** — statutory.
- **Paternity Leave** — as per org policy.

Each leave type has these configurable settings:

- **Accrual frequency** — Monthly, Quarterly, or Annual.
- **Accrual amount** — how many days are credited per period.
- **Carry-forward limit** — maximum unused days that roll over to the next FY (or unlimited).
- **LOP on zero balance** — if on, requests beyond the available balance are allowed but marked as LOP.
- **Sandwich rule** — if on, weekends/holidays falling between two leave days are counted as leave days too.
- **Encashable on exit** — if on, unused balance is paid out in the F&F settlement.

### How accrual works

Leave balances are stored per employee, per leave type, per financial year. Accrual happens automatically:

- **Monthly accrual cutoff**: if an employee joins on or before the 5th of a month, they get that month's accrual. If they join after the 5th, accrual starts from the next month.
- **Quarterly**: credited at the start of each quarter.
- **Annual**: the full year's entitlement is credited at the start of the FY.

When an employee's balance is first accessed (e.g. they apply for leave), the system auto-creates the balance record with catch-up accrual for any past periods they've missed.

### Leave balance formula

```
available = accrued + carriedForward + manualAdjustment − used − pending
```

- `accrued` — total earned so far this FY.
- `carriedForward` — unused balance from prior FY (capped at carry-forward limit).
- `manualAdjustment` — HR-entered adjustment (positive or negative).
- `used` — approved leaves consumed.
- `pending` — submitted requests awaiting approval.

### Applying for leave

1. Employee navigates to **Leaves → Apply Leave**.
2. Selects leave type, from date, to date, and optionally half-day flags.
3. System checks for overlapping requests (blocks if overlap found).
4. Duration is calculated using business-day counting (sandwich rule applied if enabled for this type).
5. Balance check:
   - **Sufficient balance** — days are marked as `pending`.
   - **Insufficient balance** — the shortfall is flagged as LOP. The request still goes through, but the LOP days will be deducted from pay.
6. The reporting manager is notified via email.
7. Attendance entries for the leave dates are auto-synced to `leave` status.

### Approval flow

When a manager approves a leave request:

- Balance updates from `pending` to `used`.
- LOP days are tracked in `balances.lop.used`.
- Attendance entries are synced: if the attendance was already submitted or approved, it's automatically reverted to draft with a reason note so HR can re-review.

### Rejection

- The `pending` balance is restored.
- The employee is notified via email.

### Cancellation by employee

- **Pending request** — can be cancelled anytime. Pending balance is restored.
- **Approved request** — can only be cancelled if **all leave dates are in the future**. Used balance is restored and attendance entries are reverted.

### Cancellation / revert by HR

HR can revert an approved leave, which:

- Moves `used` back to `pending` in the balance.
- Restores LOP tracking if applicable.
- Reverts the attendance entry changes.

### Auto-cancellation on separation

When an employee is separated (status → resigned/terminated), all pending and approved leave requests with dates **after** the LWD are auto-cancelled. The balance is rolled back — this prevents phantom leave days from inflating the F&F leave encashment.

---

## Leave Balances (admin view)

Navigate to **Leaves → Leave Balances**. This shows all employees' balances in a single table.

### Filters

- **Status** — Active (default), Resigned, Terminated, or All.
- **Department** — filter by department.
- **Search** — by name or email.

### What each column shows

For each leave type: `available / entitled` with color coding (green if >2, amber if ≤2, red if ≤0).

Expand any row to see the full breakdown: Entitled, Accrued, Carried Forward, Manual Adjustment, Used, Pending, and Available.

### Encashed balances

When a separated employee has a finalized F&F settlement with leave encashment, the Leave Balances page automatically detects it and shows:

- Summary cells: `0 / entitled` (instead of the raw available number).
- Expanded view: a green banner — *"Leave balance encashed in Full & Final settlement — ₹X"* — with the exact encashment amount.
- Each leave type card shows `Available: 0 (encashed)`.

The underlying balance record is preserved for audit — this is display-only.

---

## Holiday calendar

Navigate to **Employee Self Service → Configuration → Holiday Calendar** (admin only) or **ESS → Holiday Calendar** (everyone).

- Holidays are configured per org, per year.
- Company-specific holidays can override org-level holidays (for multi-company orgs).
- Recurring holidays (Republic Day, Independence Day, etc.) can be copied from one year to the next instead of re-entering.
- Holidays affect:
  - Attendance: auto-marked as `H` on the calendar.
  - Leave: excluded from business-day counting (unless sandwich rule overrides).
  - Payroll: holiday days are counted as paid days.

---

## My Salary

Shows the employee's current salary structure breakdown:

- **Monthly Gross** and **Annual CTC**
- Each salary component with amount and percentage (e.g. Basic ₹15,000 — 50%)
- **Employer contributions**: PF (employer share), ESI (employer share), EDLI
- **CTC** = Gross + Employer statutory costs

The employee lookup uses `linkedUserId` to match the portal user to the employee record. If the link is missing (e.g. for a legacy employee), it falls back to email matching and auto-heals the `linkedUserId` for future lookups.

---

## My Payslips

Lists all released payslips for the employee, sorted by month. Each entry shows:

- Month and year
- Gross earnings, total deductions, net pay
- **Download** button — generates the same PDF the HR team sees

Payslips only appear here after HR explicitly releases them from the payroll run page. Unreleased payslips are invisible to the employee.

Historical payslips imported from GreytHR (if the org migrated) also appear in this list.

---

## Tax declarations (employee view)

Employees can submit and update their investment declarations from **ESS → Tax Declarations**:

- Choose tax regime (Old or New).
- Enter investment amounts under each section (80C sub-items, HRA, 80D, etc.).
- Upload proof documents.
- Submit for HR review.

When the declaration is saved, TDS is automatically recalculated on the latest unfinalized payroll run.

### 80C sub-items

PPF, ELSS, LIC premium, Home loan principal, NSC, Tuition fees, 5-year FD, SCSS, NPS (80CCD). Total capped at ₹1,50,000.

---

## Tax Report (employee view)

Available at **ESS → Tax Report** for confirmed employees. Shows:

- Projected annual tax at current gross.
- Slab-by-slab breakdown.
- Side-by-side Old vs New regime comparison with recommended regime.
- Effect of declared investments on tax.
- Estimated monthly TDS for the rest of the FY.

This is the same computation as the admin Tax Report page — the employee just sees their own data.

---

## F&F Receipt (alumni only)

Separated employees in the alumni lifecycle see an **F&F Receipt** page in their sidebar. This shows their finalized Full & Final settlement:

- Earnings breakdown (leave encashment, other additions)
- Deductions breakdown (notice recovery, asset deductions, loan recovery)
- Net settlement amount
- Settlement status (finalized or paid)

The page only renders settlements in `finalized` or `paid` status — drafts are not visible to the employee.

---

## Email notifications

| Event | Recipient | Content |
|---|---|---|
| Payslip released | Employee | PDF attachment with payslip |
| Leave request submitted | Reporting manager | Request details, approve/reject link |
| Leave approved | Employee | Confirmation with dates |
| Leave rejected | Employee | Reason (if provided) |
| Leave cancelled by HR | Employee | Cancellation notice |

---

## ESS sidebar structure

What employees see depends on their role and employment type:

**All employees:**
- Dashboard
- My Profile
- My Attendance (attendance mode) OR My Timesheet (timesheet mode)

**Leave-eligible employees (confirmed, non-billable IC, intern):**
- Apply Leave
- My Leave Requests
- Holiday Calendar

**Confirmed employees (statutory payroll):**
- My Salary
- My Payslips
- Tax Declarations
- Tax Report

**Admin/manager extras:**
- Timesheet Approvals
- Attendance Approvals
- Leave Approvals
- Leave Balances (org-wide)
- Configuration (leave policies, holiday calendar)

**Alumni (separated, read-only):**
- Dashboard, My Profile (read-only)
- Past attendance/timesheet history (read-only)
- My Salary, My Payslips, Tax Report
- F&F Receipt
- Cannot mark attendance, submit timesheets, apply for leave, or approve anything

---

## Common issues and fixes

- **Employee can't see the Leaves section.** They're either an external consultant or a billable internal consultant — both are ineligible for leave management. This is by design.
- **Leave balance shows 0 accrued.** The employee may have joined after the 5th of the month, so the current month's accrual hasn't kicked in yet. Check the accrual frequency and cutoff rule.
- **Attendance can't be edited.** The payroll period is locked. Ask the payroll admin to unlock it, or process corrections from the admin attendance approvals page.
- **Leave request blocked by overlap.** The employee has an existing request (pending or approved) that covers the same dates. They need to cancel the existing request first.
- **LOP showing on payslip but employee had leave balance.** Check if the leave type allows LOP on zero balance. If the employee's balance ran out, the remaining days are automatically flagged as LOP. Also check for pending leaves tying up balance — pending leaves reduce `available` even though they haven't been approved yet.
- **My Salary page is empty.** The employee record doesn't have a `linkedUserId` matching the portal user. The system auto-heals via email matching, but if the emails don't match (e.g. personal Gmail portal account vs work email on employee record), the link needs to be set manually from the employee detail page.
- **Payslip not showing on My Payslips.** Payslips must be explicitly released by HR from the payroll run page. Check the run — the employee's entry should show "Released".
- **Tax report shows wrong regime.** The employee may not have submitted a tax declaration, in which case the system defaults to New Regime. Ask them to submit or update their declaration.
- **Sandwich rule inflating leave days.** A leave spanning Friday + Monday will count Saturday and Sunday as leave if the sandwich rule is enabled for that leave type. This is configurable per leave type — turn it off if it's not desired.
- **F&F Receipt page shows "Employee record not found".** The lookup uses `linkedUserId` to match portal user to employee. If the portal user signed up with a personal email that differs from the work email, the link must be manually set on the employee record.

---

For how payroll processes the data from ESS, see **Running Payroll**. For the separation workflow, see **Employee Offboarding & Full & Final**.
