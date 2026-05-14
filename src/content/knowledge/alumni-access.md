# Alumni Access (Post-Separation Portal)

Rivvra keeps separated employees on the portal in a read-only "alumni" state so they can pull payslips, Form 16, tax reports, and their Full & Final receipt after they leave. This is driven by a single field — `org_memberships.status` — and a daily cron that moves people through the lifecycle.

This guide is for admins. It covers how to read the alumni state, how to configure the policy, how to use the Alumni Directory to reactivate or revoke access, and what alumni themselves see.

---

## The lifecycle

Alumni go through four possible states:

1. **Active** — normal employee. No alumni fields set.
2. **Phase A (amber banner)** — from LWD to LWD + *grace period days* (default 90). Full read-only access to their own records. They see a top-of-page amber banner counting down to the cutoff.
3. **Phase B (orange banner, confirmed employees only)** — from the end of Phase A until the **next 30 June on or after their LWD**. This is the deadline that lines up with the Indian ITR filing window (ITR for FY X-Y is due 31 July Y, so 30 June keeps access open with a day to spare). Same read-only access; the banner switches to orange and explains that they're in the tax-filing window. Password reset now routes to their registered personal email for security.
4. **Archived (red banner, rarely rendered)** — cutoff has passed. The backend blocks login entirely with a 403 `ALUMNI_ARCHIVED` error. The only way back in is an admin reactivation.

The phase is *computed* on every request from `alumniSince`, `alumniCutoffAt`, `alumniReactivatedUntil`, and the employee's employment type — there's no separate "phase" column to keep in sync.

---

## What alumni can and can't do

**Can see:** Dashboard, My Profile, My Timesheet / My Attendance history, My Salary, My Payslips, Tax Report (confirmed only), and a new **F&F Receipt** page that shows their finalized settlement.

**Cannot do:** mark attendance, submit or edit timesheets, raise or cancel leave requests, approve anything, or reach any admin or team screens. Every member-facing write endpoint is gated by a `requireWriteAccess` middleware that returns 403 `ALUMNI_READ_ONLY` when the membership is in alumni/archived status.

**How it works under the hood:** the shared `orgMiddleware` accepts both `active` and `alumni` memberships. For alumni, it computes the phase against the linked employee record and blocks `archived` outright with a 403 `ALUMNI_ARCHIVED` error (in case the daily cron hasn't caught up yet). It attaches `req.alumniReadOnly = true` so downstream write endpoints can gate accordingly. This means all read-only org-scoped endpoints — payslips, salary, tax report, F&F receipt — work seamlessly for alumni without any per-endpoint changes.

**Seat count:** alumni *do not count* against your billing seat total. The moment someone flips to `alumni`, they stop consuming a seat.

---

## Alumni Policy configuration

Navigate to **Employee → Configuration → Alumni Policy** (admin only). Three settings:

- **Grace period (days)** — default 90. Length of Phase A. Applies to all separations across the org. Change this before a big reorg to give people more or less time.
- **Extend to tax-filing window** — default on. When on, confirmed employees get Phase B extended until the next 30 June on or after their LWD (aligns with the Indian ITR filing window). Turn this off only if you have a specific reason to shorten confirmed employees' access.
- **Reactivation default (days)** — default 7. How long a one-click reactivation grants an archived alumnus.

Policy changes take effect for **new** separations only. Employees who are already in the alumni lifecycle keep the cutoff date that was computed at their separation time.

---

## The Alumni Directory

Navigate to **Employee → Alumni** (admin only) to see every alumnus and archived member in a single table. The directory enriches each row by joining the membership to the employee record via `linkedUserId` (not email), so alumni whose portal account uses a personal Gmail still show their HR-managed full name, LWD, and personal-email status correctly. Columns:

- **Name and email** — the employee's HR-managed full name (preferred over the portal user display name) and the portal login email.
- **Phase** — color-coded badge (amber A, orange B, red archived).
- **LWD** — the last working date stamped at separation.
- **Cutoff** — the computed end of read-only access.
- **Days left** — countdown, auto-refreshes on page load.
- **Personal email** — shows *On file* or *Missing* based on whether `employees.privateEmail` is set. This is a **readiness indicator for Phase B**: if *Missing*, the alumnus cannot use self-service password reset during Phase B (the forgot-password flow routes OTPs to the personal email, and without one it tells them to contact the admin). Admins should fill in the personal email from the employee detail page while the employee is still in Phase A.
- **Actions** — Reactivate 7 days and Revoke.

### Reactivate 7 days

Click **Reactivate 7d** on any row (archived or within the last days of alumni) to grant a temporary 7-day window. What happens:

- `status` flips to (or stays at) `alumni`
- `alumniReactivatedUntil` is set to now + 7 days
- If the natural `alumniCutoffAt` is earlier than the reactivation end, it's pushed forward to match
- An entry is appended to `alumniHistory` with the actor, timestamp, and reason
- The cron's "reactivation expiry" pass on the 8th day reverts the membership to `archived` automatically

Use this when an ex-employee reaches out for a copy of a payslip after they've been archived, or when someone needs a few extra days to file their ITR.

### Revoke

Click **Revoke** on any alumni row to archive them immediately. This is the escape hatch for when HR needs to cut access right now — e.g. after a non-amicable separation or a security incident.

---

## Password reset for alumni

The `/api/auth/forgot-password` endpoint has a branch for alumni users:

1. User enters their work email.
2. Backend finds the portal user, confirms they have a password, then checks their memberships.
3. If they have **no active** memberships but **one or more alumni** memberships, the OTP is routed to the personal email on file (`employees.privateEmail`) instead of the work email.
4. If no personal email is on file, the request returns a friendly error asking them to contact the admin. This is the only case where the forgot-password endpoint breaks its usual "always return success to prevent enumeration" rule — it has to, because without a personal email there is no safe destination for the OTP.
5. If they're archived, the request is silently dropped.

The reset flow itself is unchanged — the OTP is still keyed by the work email so `POST /api/auth/reset-password` continues to work. Only the email *destination* changes. The `otp_codes` document is stamped with `sentTo` and `alumni: true` so the audit trail is explicit about where the OTP actually went.

---

## The daily cron

`cron/alumniLifecycle.js` runs once every 24 hours and does three passes:

1. **Archive overdue alumni** — any membership where `alumniCutoffAt < now` and there's no active reactivation gets `status: 'archived'`, with an audit history entry noting the cron did it.
2. **Warning email stamp** — members with a cutoff 6–7 days out get `alumniWarnedAt` stamped so the warning email (when wired to an email template) goes out exactly once. The email itself is a TODO — the current implementation just stamps the flag.
3. **Reactivation expiry** — if `alumniReactivatedUntil < now`, check whether the natural cutoff is still in the future. If yes, just clear `alumniReactivatedUntil` (they return to their normal alumni state). If no, archive them with a history entry noting the reactivation expired.

The cron has an `isProcessing` guard so two concurrent runs can't race.

---

## Migrating existing data

One-shot script: `scripts/migrateAlumniStatus.js`. It scans every employee with status `resigned` or `terminated` and a `lastWorkingDate` set, resolves their linked portal user (restoring `linkedUserId` if it was previously nulled by the old flow), and updates the membership with alumni state. If the computed cutoff is already in the past, the membership is set straight to `archived`. Supports `--dry-run` for a no-op preview that prints a per-org breakdown.

Run once per environment after deploying the alumni feature. The script is idempotent — memberships already in alumni/archived are skipped.

---

## Common questions

**An ex-employee can't log in but their cutoff hasn't passed.** Check the Alumni Directory. If the row shows `status: archived` despite the cutoff being in the future, someone probably hit Revoke. Use Reactivate 7d to give them temporary access.

**The Alumni Directory shows someone with status `alumni` but *phase* `archived`.** This is a race window — the cron hasn't run yet but the cutoff has already passed. The next daily run will flip them to `archived`. You can force it by hitting Revoke.

**Billing seat count didn't go down after a separation.** The transition only fires when an employee's status changes to resigned/terminated **with** an LWD set. If the LWD was blank the alumni helper skips the transition (there's nothing to compute a cutoff from). Set the LWD and re-save the employee record.

**Someone's password reset still goes to their work email.** They probably have at least one **active** membership in another org (Rivvra is multi-tenant — one portal user can be active in org A and an alumnus in org B). The alumni branch only triggers when the user has *no* active memberships anywhere.

**Alumni gets "Failed to load payslips" or 403 errors on My Salary / Tax Report.** The shared `orgMiddleware` accepts alumni memberships and attaches `req.alumniReadOnly = true`. If this error appears, check that the backend is running the latest code — an older version may still filter memberships by `status: 'active'` only.

**Alumni Directory shows wrong name or "—" for LWD.** The directory joins employee records by `linkedUserId`, not by email. If the portal user signed up with a personal Gmail that doesn't match the employee's work email, an older version using email-based joins would fail silently. Ensure `linkedUserId` on the employee record matches the portal user's `_id`. The migration script (`scripts/migrateAlumniStatus.js`) auto-heals this by matching on email and restoring the link.

**Leave Balances page still shows remaining balance for a terminated employee.** If the employee has a finalized FNF settlement with leave encashment, the Leave Balances page (under the *Terminated* or *Resigned* filter) should show "0 (encashed)" with a green banner displaying the encashment amount. If the raw balance still appears, the FNF settlement may be in `draft` status — finalize it and refresh.

**F&F Receipt shows "Employee record not found" for an alumnus.** The `/fnf/my-settlement` endpoint looks up the employee by `linkedUserId` (with an email fallback for legacy rows). If the portal user's email differs from the work email on the employee record, the link must be in place. Check `employee.linkedUserId` matches the portal user `_id`.

---

See also: **Employee Offboarding & Full & Final** for the manual separation and F&F workflow that feeds into the alumni lifecycle.
