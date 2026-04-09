# Employee Offboarding & Full & Final

This guide covers the full separation lifecycle in Rivvra — from marking an employee as resigned or terminated, to preparing their Full & Final (F&F) settlement, clearing their assets, and making sure the final payout lands in the right month's payroll run.

The workflow has five phases, and they are driven almost entirely by one field: the **Last Working Date (LWD)**. Get the LWD right and the rest of the system falls into line automatically.

---

## Phase 1 — Mark the employee as separated

Open the employee's detail page and edit their record. Scroll to the *Separation* section and set:

- **Status** — change from *active* to either *resigned* or *terminated*.
- **Last Working Date (LWD)** — required. This is the last physical day the employee works, not the day you are entering the record.
- **Separation Reason** — pick from the configurable list. The defaults are *Better opportunity*, *Personal reasons*, *Performance*, *Redundancy/Layoff*, *Contract end*, *Absconding*, *Mutual agreement*, and *Other*. Custom reasons can be added under **Settings → Employee → Separation reasons**.
- **Separation Notes** (optional) — free text for anything the reason field doesn't capture.

### Scheduled exit (planned separations)

If you know the LWD in advance — say an employee has given one month's notice — you can set the LWD on a still-*active* employee. The record stays active until you explicitly change the status later, but the LWD is already visible to payroll and F&F. This is how most planned resignations should be tracked so the finance team can plan cashflow ahead of time.

### What happens automatically when status flips to resigned/terminated

The moment you save this change, the backend runs several cascades in a single operation:

1. **All active assignments are closed out.** Each assignment gets `status: 'ended'` and `endDate: LWD`. Billable hours stop accruing against that client/project.
2. **Portal access is revoked.** The employee's `linkedUserId` is cleared, which drops their seat from the org membership. On their next login attempt they lose access to workspace apps. A released seat is returned to the org billing pool.
3. **Post-LWD pending leaves are auto-cancelled.** Any leave request with `fromDate` strictly after the LWD and status `pending` or `approved` is cancelled with the reason *"Auto-cancelled on employee separation (post-LWD)"*. Critically, the leave balances are *rolled back* — approved leaves decrement the `used` counter, pending leaves decrement the `pending` counter. Without this, exiting employees would carry phantom leave balances that inflate their leave encashment at F&F time.
4. **Manager flag is recalculated.** If the person being separated was a manager, and they have no other active reports, their `isManager` flag is cleared. This keeps the Leave Approvals dashboard tidy.

> **Gotcha:** You cannot revert a resigned/terminated employee back to *active* without first clearing the LWD (or providing a new future LWD for a rescheduled exit). This is by design — reversing a separation shouldn't leave a stale LWD hanging around on the record.

---

## Phase 2 — Prepare the Full & Final settlement

Navigate to **Full & Final** (`/org/:slug/payroll/fnf`). The dashboard lists every confirmed employee who is either separated or has a future LWD scheduled, grouped into three stages:

- **Scheduled Exit** — active employee, LWD set in the future, no F&F yet.
- **Pending F&F** — resigned or terminated, no settlement created yet, or a saved draft.
- **Settled** — settlement is finalized (or paid).

Click an employee to open their settlement detail page. On first open Rivvra calculates a live draft from current data — salary structure, leave balances, notice-period shortfall, outstanding assets — so you see sensible numbers immediately. Nothing is saved until you click *Save Draft*.

### What the system auto-calculates

**Salary base.** The current `sp_employee_salaries` record is used to back-calculate `monthlyGross`, `dailyGross`, `monthlyBasic`, and `dailyBasic`. The salary structure name is shown at the top of the screen so you can confirm you're looking at the right pay band.

**Leave encashment.** The F&F screen reads the employee's leave balances for the financial year that contains the LWD, then applies the org's leave policy rules:

- The policy-level switch *Allow encashment on exit* must be on.
- Each leave type must be individually marked *Encashable*.
- Loss of Pay is never encashable.

The system computes the current available balance using the same formula as the live Leave Balances page (`available = max(0, accrued + carriedForward + manualAdjustment − used − pending)`) and multiplies by `dailyBasic`. The breakdown is shown per leave type so you can see exactly where the total is coming from — e.g. *Casual: 5 days*, *Earned: 3 days*.

**Notice period recovery.** The default notice period is **90 days**. If the employee's resignation date is known, the system computes *days served* between the resignation date and the LWD, then `recovery = max(0, noticeDays − daysServed) × dailyGross`. If no resignation date is set, nothing is auto-calculated — you'll need to enter the recovery amount manually if applicable.

**Asset deductions.** Any `assets` records with a deduction amount stamped against this employee's assignment history are summed up. Each asset is listed with its name, type, condition, and deduction amount.

**Pending assets warning.** If the employee still has unreturned assets, the screen shows a warning. This does not block saving the draft, but it will require a *Force Finalize* confirmation later.

### What you can override manually

- **Resignation Date** — fill this in if it wasn't captured at hire/update time. Changing it will recompute the notice period.
- **Notice Days Served** — override the auto-calculated value if the employee served extra days or the company is waiving the shortfall.
- **Loan / Advance Recovery** — outstanding loans or salary advances to recover from the final payout.
- **Other Deductions** — damages, uniform costs, anything else. There's a notes field for context.
- **Other Additions** — bonus payout, goodwill gesture, manually-calculated gratuity (Rivvra doesn't compute gratuity yet).
- **General Notes / Override Reason** — required when editing an existing draft. This is what populates the audit trail so other admins know *why* the numbers changed.

### The audit trail

Every save compares the new values against the last-saved draft (or the initial calculation for first save) and appends one entry per changed field to `settlement.history`. Each entry records the field name, the old value, the new value, who changed it, when, and the reason you typed into the override-reason box. You can expand the *Change History* panel on the settlement page at any time to see the full timeline — this is the system of record for explaining F&F overrides to finance or to the employee.

### Totals

The screen computes `totalEarnings = leaveEncashment + otherAdditions` and `totalDeductions = noticeRecovery + assetDeductions + loanRecovery + otherDeductions`. The *Net Settlement* can be negative if recoveries exceed additions — that's valid and means the company is owed money, which needs to be collected outside the payroll cycle.

---

## Phase 3 — Clear assets (if applicable)

From the employee detail page, the *Asset Clearance* widget lets you generate a clearance record for the separating employee. Every asset currently assigned to them is listed with its current state. There are two paths:

- **Normal return flow.** Mark assets as returned one by one from the Assets module as the employee hands them back. The clearance record auto-updates; once the last asset transitions to *returned*, the clearance status flips to *cleared*.
- **Admin override / force clear.** If an asset is lost, damaged beyond return, or being written off, click *Admin Override — Force Clear* and enter a reason. The clearance is marked cleared, the reason is stamped on the record, and the F&F settlement can proceed.

Asset deductions set at the time of loss or damage show up automatically in the F&F settlement as line items — you don't need to enter them twice.

---

## Phase 4 — Finalize the F&F settlement

Back on the F&F settlement detail page, click **Finalize** once the numbers are locked in. Before finalization the system performs one gate:

> If the employee still has pending (unreturned) assets, finalization is blocked and you'll see an error listing them. To proceed anyway, re-click Finalize with the *Force Finalize with pending assets* confirmation — this stamps `forceFinalizedWithPendingAssets: true` on the record so there's an audit trail of what you did.

On finalize:

- `status` flips from `draft` to `finalized`
- `finalizedAt` and `finalizedBy` are stamped
- The settlement becomes read-only

If you need to correct something after finalization, click **Reopen**. This reverts the status to `draft`, clears `finalizedAt`/`finalizedBy`, and lets you edit again. Reopen is safe — it does not touch the audit history, so the reopen + re-save is itself captured as new history entries.

> **Critical:** The payroll merge in Phase 5 only picks up settlements with status `finalized`. Drafts are ignored on purpose, so HR can iterate on the numbers without them accidentally landing in a running payroll.

---

## Phase 5 — Merge into the exit-month payroll run

This is the final step, and it is almost entirely automatic. When you process (or reprocess) the payroll run for the month that contains the employee's LWD, Rivvra:

1. Fetches every `fnf_settlements` record with `status: 'finalized'` for the org
2. Filters to employees whose LWD falls inside the payroll run's month
3. For each match, builds an `fnfAdjustments` object and attaches it to the employee's payslip item

The exit-month payslip then shows the employee's regular prorated salary (calculated using calendar-day proration: `daysWorkedInMonth / totalDaysInMonth`) plus every F&F line item broken out individually:

**Earnings side**

- Regular salary components, prorated to the LWD
- *F&F: Leave Encashment* — the full encashment amount
- *F&F: Other Additions* — with the notes you typed in as a suffix

**Deductions side**

- Normal PF/ESI/PT/TDS on the prorated salary
- *F&F: Notice Period Recovery*
- *F&F: Asset Deductions*
- *F&F: Loan Recovery*
- *F&F: Other Deductions*

TDS is recalculated for statutory employees when F&F earnings push the gross higher — without this, leave encashment would go untaxed in the final payslip and create a mismatch with the annual report.

Finally, the settlement record is stamped with `mergedInRun` pointing back at the payroll run that absorbed it, and the employee row in the payroll dashboard gets an **F&F merged** badge so it's obvious at a glance that this payslip carries their final settlement.

### A worked example

An employee with LWD of 8 April 2026 in a 30-day month:

- Regular Basic: ₹8,500 (full month) → ₹2,408 (8/30 prorated)
- Regular HRA: ₹3,400 → ₹963
- Regular Special Allowance: ₹5,100 → ₹1,446
- **F&F: Leave Encashment: +₹425** (0.5 SL + 1 CL × dailyBasic)
- **Gross: ₹5,242** (₹4,817 salary + ₹425 encashment)
- Deductions: ₹771 (PF + ESI)
- **Net Pay: ₹4,471**

Reprocessing the run re-reads the settlement and overwrites `mergedInRun` — so if you adjust the F&F and reopen-edit-finalize before running payroll again, the corrected numbers flow through cleanly.

---

## Common issues and fixes

- **F&F screen shows zero leave encashment.** Check the Leave Policy under **Settings → Employee Self Service → Leaves**. The policy-level *encashment on exit* switch must be on, and each leave type must be individually marked *encashable*. LOP never encashes.
- **Payroll re-run doesn't show the F&F line items.** The settlement must be in `finalized` status, not `draft`. Open the settlement and check the banner at the top — if it still says *Draft*, click *Finalize* and reprocess the payroll run.
- **Net Settlement is negative.** This is valid and means recoveries exceed earnings. The employee owes the company money; this has to be collected outside the system (payroll will not withhold past zero).
- **Separation was saved but the employee still appears in Leave Approvals.** The manager's `isManager` flag is only recomputed for the *direct manager* of the separated employee. If the separated employee was themselves a manager, their approval queue is frozen; reassign their direct reports to a new manager from the employee detail pages.
- **Asset clearance is stuck.** If an asset is lost or unreturnable, use *Admin Override — Force Clear* with a reason. This is the intended escape hatch.
- **Leave balance looks wrong after separation.** Rivvra computes the available balance on the fly from `accrued + carriedForward + manualAdjustment − used − pending`. The stored `available` field on the leave balance document can be stale. If the F&F screen still shows the wrong number, double-check that the auto-cancel of post-LWD leaves actually ran — you can confirm in the leave request list by filtering to *cancelled* and looking for the *"Auto-cancelled on employee separation"* reason.

---

For the mirror-image process when a new joiner enters the company, see **Employee Onboarding Workflow**.
