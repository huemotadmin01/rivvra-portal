# Running Payroll

This guide covers end-to-end payroll processing in Rivvra — from salary structures and statutory deductions to processing runs, releasing payslips, and downloading challans. Rivvra handles Indian statutory compliance (PF, ESI, PT, TDS) out of the box for all employee types.

---

## Salary structures

A salary structure is a named template that defines how monthly gross pay is split into components — Basic, HRA, Special Allowance, etc.

Navigate to **Payroll → Salary Structures** to manage them.

### Rules

- Every component specifies a `percentOfGross`. All components in a structure must sum to exactly **100%**.
- **Basic must be at least 50%** of gross (statutory requirement for PF calculation).
- Each component can be individually marked as *taxable* and *PF-applicable*.
- The org-wide **default salary structure** is set under Payroll → Settings. New employees who don't have an explicit structure assigned get this one automatically.
- If no default is configured, the system falls back to: Basic 50%, HRA 20%, Special Allowance 30%.

### CTC → gross → components

Rivvra treats CTC as pure gross — employer statutory costs (PF, ESI, EDLI) are added *on top*. When you enter a CTC for an employee:

1. `grossMonthly = round(ctcAnnual / 12)`
2. Each component is computed as `grossMonthly × percentOfGross / 100`
3. Rounding differences land on the last component so the total is always exact

### Mid-month salary revisions

If an employee's salary changes partway through a month (e.g. a raise effective 15th), the payroll engine detects two salary records overlapping the same month and splits the calculation proportionally — old rate for the first half, new rate for the second.

---

## Payroll modes

Every employee is processed under exactly one mode, derived automatically from their employment type and billable flag:

| Employment type | Billable | Payroll mode |
|---|---|---|
| Confirmed (full-time) | Any | `statutory` |
| Internal Consultant | Non-billable | `statutory` |
| Internal Consultant | Billable | `consultant_flat_tds` |
| External Consultant | Any | `contractor` |
| Intern | Any | `intern_no_deduction` |

What each mode means:

- **Statutory** — full PF, ESI, PT, and progressive TDS. Attendance-based proration using a fixed 30-day divisor.
- **Consultant (flat TDS)** — flat-rate TDS only (no PF/ESI/PT). Pay based on timesheet or attendance.
- **Contractor** — timesheet-based pay. TDS may apply. Separate contractor-format payslip PDF.
- **Intern (no deduction)** — attendance-based pay with zero deductions.

You don't configure this anywhere — it's determined automatically when payroll runs. If an employee's type or billable flag changes, the mode updates on the next run.

---

## Statutory deductions

### Provident Fund (PF)

- **Employee contribution:** 12% of PF-applicable salary (components where `isPfApplicable` is on), capped at ₹1,800/month when PF-applicable salary exceeds ₹15,000.
- **Employer contribution:** 12% split as EPF (3.67%) + EPS (8.33%), also on the capped salary.
- **EDLI:** 0.5% employer contribution on capped salary.
- **PF wage ceiling:** ₹15,000/month.

### ESI (Employees' State Insurance)

- **Employee:** 0.75% of gross.
- **Employer:** 3.25% of gross.
- **ESI wage ceiling:** ₹21,000/month. Employees with gross above this are exempt from ESI entirely.

### Professional Tax (PT)

PT is state-wise and slab-based. The system resolves PT slabs through a 3-tier lookup:

1. **Platform DB overrides** (`sp_pt_master`) — org/FY-specific rates
2. **Org FY overrides** in statutory config
3. **Hardcoded fallback** — built-in slab tables

PT is deducted monthly based on the employee's gross slab.

### TDS (Income Tax — Section 192)

For salaried employees, TDS is calculated using **progressive annual projection**:

1. Project annual income: `ytdGross + (currentMonthGross × monthsRemaining)`
2. Apply the employee's chosen tax regime slabs and declared investments to get annual tax
3. Subtract YTD TDS already deducted
4. Divide remaining tax by months left in the FY

This self-correcting approach means TDS adjusts automatically every month — if someone declares investments mid-year their TDS drops; if gross increases (raise, bonus), TDS rises.

For consultants on flat TDS, a fixed percentage is applied directly to monthly pay.

---

## Tax regimes

Each employee chooses a regime. The choice is made via their **Tax Declaration** and can be changed during the FY — TDS recalculates automatically.

### New Regime (FY 2025-26 defaults)

- Standard deduction: ₹75,000
- Rebate limit: ₹12,00,000 (zero tax if taxable income ≤ ₹12L)
- Slabs: 0% up to ₹4L → 5% up to ₹8L → 10% up to ₹12L → 15% up to ₹16L → 20% up to ₹20L → 25% up to ₹24L → 30% above ₹24L

### Old Regime

- Standard deduction: ₹50,000
- Rebate limit: ₹5,00,000
- Slabs: 0% up to ₹2.5L → 5% up to ₹5L → 20% up to ₹10L → 30% above ₹10L
- Deductions: Section 80C (capped at ₹1,50,000), HRA exemption, 80D (medical insurance), and others

---

## Tax declarations

Employees submit investment declarations (80C, HRA, 80D, etc.) that feed into TDS projection.

### What's accepted under 80C

PPF, ELSS mutual funds, LIC premium, home loan principal, NSC, tuition fees, 5-year FD, SCSS, NPS additional (80CCD). The total of all 80C sub-items is capped at ₹1,50,000 regardless of what the employee declares.

### Proof uploads

Employees can attach scanned documents as proof of investments. Admins review and approve/reject proofs from the Tax Declarations admin page.

### Auto-recalculation

When an employee updates their declaration (especially if they switch regimes), the system immediately recalculates TDS on their latest unfinalized payroll run.

---

## Payroll run lifecycle

A payroll run moves through these states:

| State | What it means | Actions available |
|---|---|---|
| **Draft** | Created, no calculations | Delete, edit settings |
| **Processing** | Calculation in progress | Wait |
| **Processed** | Calculations complete | Review, add ad-hoc adjustments, release payslips, download challans, hold/release salaries |
| **Finalized** | Locked for accounting | Unfinalize if correction needed, mark as paid |
| **Paid** | Disbursement recorded | View only |

Only `draft` runs can be deleted. The two-level locking system (`inputsLocked` and `payrollLocked`) prevents accidental edits after review.

---

## Processing a payroll run

Navigate to **Payroll → Run Payroll**, select the month/year, and create a new run (or open an existing draft). Click **Process** to kick off the calculation.

The engine does the following in order:

1. **Loads FY config** — resolves org-specific PF/ESI/PT rate overrides for the financial year.
2. **Loads all employees** in scope (filtered by company if multi-company is enabled).
3. **Auto-creates salary records** — employees without one get the default structure automatically.
4. **Calculates YTD** — sums all finalized runs in the same FY to get year-to-date gross and TDS per employee. Historical GreytHR payslips (if imported) are included in the YTD.
5. **Loads attendance/timesheet data** — pulls submitted or approved entries to compute present days, leave days, half-days, holidays, and LOP.
6. **Loads LOP from leave requests** — approved LOP leave requests are factored into deductions.
7. **Handles mid-month salary changes** — splits calculation proportionally across old and new rates.
8. **Exit-month proration** — employees with an LWD in the payroll month are prorated using `daysWorkedInMonth / totalCalendarDays × grossMonthly`.
9. **Applies ad-hoc adjustments** — any manual earnings/deductions entered by HR.
10. **Merges F&F settlements** — finalized Full & Final settlements for exiting employees are auto-merged (leave encashment as earning, notice recovery as deduction).
11. **Holiday work allowance** — if the org has a holiday work allowance configured and the employee marked holiday-work days, the allowance is added.
12. **Full calculation** — computes net pay, all components, all deductions (PF/ESI/PT/TDS), and disbursement date.

### LOP proration for salaried employees

Uses a fixed 30-day divisor regardless of the calendar month:

```
perDayGross = grossMonthly / 30
lopDeduction = lopDays × perDayGross
proratedGross = grossMonthly − lopDeduction
```

### Reprocessing

You can reprocess a run as many times as needed (while it's in `processed` state, not finalized). Each reprocess recalculates from scratch using the latest data — attendance corrections, salary changes, declaration updates, and F&F edits all flow through cleanly.

---

## Ad-hoc adjustments

For any `processed` (not yet finalized) run, HR can add per-employee one-time earnings or deductions:

- **Earnings** — bonus, reimbursement, shift allowance, etc.
- **Deductions** — damages recovery, advance repayment, etc.

Each adjustment has a description, amount, and type. Adjustments are stored on the run document and factored into net pay on the next process cycle. They are blocked when `inputsLocked` is set on the employee's entry.

---

## Salary holds

If you need to withhold payment for a specific employee (e.g. pending investigation, bank details missing):

1. Click **Hold Salary** on their row in the payroll run.
2. Enter a reason.
3. Their payslip is excluded from the bank transfer file.
4. When ready, click **Release Hold** to include them again.

---

## Releasing payslips

Payslips are **not visible to employees automatically** after processing — this is a deliberate gate so HR can review everything first.

From the payroll run page, select employees and click **Release Payslips**. This:

- Marks each selected employee's entry as `released = true`
- Sends an automated email with the payslip PDF attached (via Resend)
- Makes the payslip visible on the employee's **My Payslips** page in ESS

You can release selectively — some employees now, others later.

---

## Challans and statutory filings

Once the run is processed, download challans for statutory filing:

| Challan | Format | Purpose |
|---|---|---|
| **PF ECR** | Text file | Upload to EPFO — contains UAN-wise PF contribution data |
| **ESI** | CSV | Upload to ESIC — employee-wise ESI contributions |
| **PT** | CSV | Professional Tax filing (state-specific format) |

---

## Exports and reports

| Export | Format | What it contains |
|---|---|---|
| **Bank transfer file** | CSV | Employee bank account + net pay — ready for NEFT/RTGS upload |
| **Payroll sheet** | Excel | Full register with all components and deductions |
| **All payslips** | ZIP of PDFs | Every released payslip |
| **Individual payslip** | PDF | Single employee |

---

## Tax reports

Navigate to **Payroll → Tax Reports** for a per-employee annual tax computation that shows:

- Projected annual tax at current gross
- Slab-by-slab breakdown
- Old vs new regime side-by-side comparison
- Estimated tax savings by switching regime
- Monthly TDS estimates for remaining months

This same report is available to employees under ESS → Tax Report (read-only view of their own data).

---

## The payroll dashboard

**Payroll → Dashboard** gives a quick overview for the current FY:

- **Net Payout** — sum of all finalized/paid runs
- **Total Gross** — across all runs
- **Total PF** and **Total TDS** — aggregate statutory numbers
- **Recent runs** — last 6 with status badges (draft/processing/processed/finalized/paid)
- **Quick action** — "Run Payroll" button to start a new run

---

## Common issues and fixes

- **Employee missing from the payroll run.** Check that they have `status: active`, a salary record, and belong to the same company (if multi-company is on). Employees without a salary record get one auto-created with the default structure, but if no default structure exists, they'll be skipped.
- **TDS looks too high/low.** TDS is projected across remaining months. If an employee joined mid-year, the projection assumes the current gross for all remaining months. Check their tax declaration — a missing or outdated declaration means no investment deductions are factored in.
- **ESI not deducting.** The employee's gross is above ₹21,000/month — they're ESI-exempt. This is automatic.
- **PF capped at ₹1,800.** Correct — when PF-applicable salary exceeds ₹15,000, the contribution caps at ₹1,800/month (12% of ₹15,000).
- **Payslip email not received.** Payslips must be explicitly *released* before employees can see them. Check the run page — if the employee's row doesn't show "Released", click Release Payslips first.
- **F&F not merging into payroll.** The F&F settlement must be in `finalized` status (not draft). Finalize it, then reprocess the payroll run.
- **Historical TDS mismatch after GreytHR migration.** Check `sp_employee_statutory` for `ytdGrossOverride`/`ytdTdsOverride` — these are only used when no actual Rivvra run data exists for the FY. If a Rivvra run has already been processed, the overrides are ignored and YTD comes from real run data.

---

For the employee's view of salary, payslips, and tax, see **Employee Self Service Guide**. For the separation and F&F workflow, see **Employee Offboarding & Full & Final**.
