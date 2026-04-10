# Employee Onboarding Workflow

This guide walks org admins through the full onboarding lifecycle in Rivvra — from creating the employee record to launching their onboarding plan. The workflow has four phases that run in parallel between the admin and the new joiner.

---

## Phase 1 — Admin creates the employee record

Navigate to **Employee → Add Employee** (`/org/:slug/employee/add`). The form is a three-step flow.

### Step 1: Core employment details

All fields here are required before the record can be saved.

- **Full Name, Work Email, Phone**
- **Employment Type** — one of *Confirmed Employee*, *Internal Consultant*, *External Consultant*, *Intern*. This choice drives downstream behavior: which sidebar items the employee sees in Employee Self Service, whether they are eligible for leave management, which onboarding plan templates are available, and how payroll treats them.
- **Department, Designation, Manager** — non-billable employees *must* have a Joining Date and Manager set, otherwise the save will be rejected.
- **Joining Date** and **Monthly Gross Salary**
- **Billable** flag (for consultants)
- **Status** — defaults to *active*. Do **not** set *resigned* or *terminated* here during hiring; those states also require a Last Working Date and will block save.

### Step 2: Address & contact

- **Current Address** (street, city, state, ZIP, country)
- **Emergency Contact** — name, phone, and relation are all required when status is *active*
- **Bank Details** (account number, IFSC, PAN) — optional at this stage, but the employee cannot be included in a payroll run until bank details exist.

### Step 3: Assignments (billable employees only)

For billable consultants you can add one or more assignments up front: *Client*, *Project*, *Billing Rate* (daily / hourly / monthly), optional *Client Billing Rate*, and *Paid Leave Per Month*.

### What happens on Save

The backend auto-generates an Employee ID (if you didn't provide one) using an atomic counter, so two admins creating employees at the same time never collide. If an existing `portal_users` account already has the employee's email, the record is auto-linked. For confirmed employees, a 90-day probation window is set automatically starting from the joining date — you can override this later from the employee detail page.

> **Gotcha:** You cannot save an employee with status `resigned` or `terminated` unless a Last Working Date is also set. Hire flows should always use status *active*.

---

## Phase 2 — Send the portal invite

Open the employee's detail page and click **Invite to Workspace**. The *Invite Employee* modal collects:

- **Organization Role** — *Member* for regular employees, *Admin* for HR/ops leads who need platform-wide access.
- **Authentication Method** — *Google* (OAuth) or *Password*. This is controlled by the org's auth settings.
- **App Access toggles** — the default is *Employee* and *Employee Self Service* enabled. Toggle on additional apps if the employee needs them (e.g. *Payroll* for HR, *ATS* for recruiters).

When you click Send:

1. The backend checks seat availability against the org's billing plan.
2. An `org_memberships` record is created in `invited` state with a 7-day invite token.
3. The employee receives an email with a link that points at `${PORTAL_URL}/org/${org.slug}/invite?token=${inviteToken}`.
4. `employee.onboardingStatus` is set to `pending` — this is what gates the self-service wizard.
5. `org.billing.seatsUsed` is incremented so the seat count is accurate immediately.

> **Gotcha:** The invite token expires after 7 days. If the joiner misses the window, re-send the invite from the detail page — the old token is superseded automatically.

---

## Phase 3 — Employee accepts the invite and completes the onboarding wizard

When the new joiner clicks the email link, they land on the *Accept Invite* page. If they don't yet have a portal account they'll set a password (or complete Google sign-in); if they already have one, they simply log in. Behind the scenes:

- `membership.status` flips from `invited` to `active`
- `membership.joinedAt` is stamped with the current time
- `linkedUserId` is written back onto the employee record — this is what lets the system match leave requests, timesheets, and payslips to the right person.

They are then redirected to `/org/:slug/employee/onboarding` which is gated by the `OnboardingGate` component — they cannot reach any other part of the platform until the wizard is complete.

### The five-step self-service wizard

1. **Personal Details** — Gender, DOB, Marital Status (spouse name if married), Nationality (defaults to Indian), Alternate Phone (validated as a 10-digit Indian mobile), Personal Email, Current Address, and Permanent Address. Checking *Same as Current Address* auto-fills the permanent block.
2. **Family & Emergency Contact** — Emergency contact (name, 10-digit phone, relation) is required. Additional family members (dependents, children, spouse) can be added as optional entries.
3. **Bank & Statutory** — Bank Name, Account Number (9–18 digits), IFSC Code (format `ABCD0XXXXXX`), and PAN (format `ABCDE1234F`). A *bank proof* document upload (cancelled cheque or digital passbook) is mandatory. Aadhaar, UAN, PF Number, and ESIC Number are optional but validated if provided.
4. **Education** — At least one education entry is required, each with Degree, Institution, Year, Percentage, and Specialization. Every entry must have at least one certificate upload attached.
5. **Review** — A summary of everything entered. Submitting locks the data in and flips `employee.onboardingStatus` to `completed`.

Once complete, the employee lands on the normal dashboard and has access to whichever apps the admin enabled during invite. The `OnboardingGate` is lifted for all future logins.

> **Tip:** Admins cannot edit the wizard payload on behalf of the employee from the admin UI — they'd have to ask the employee to resubmit. If you need to correct data post-submission, do it directly from the employee detail page's standard edit form.

---

## Phase 4 — Launch the onboarding plan (optional but recommended)

After the employee is in the system, admins can kick off a templated task list — things like "HR: collect signed offer letter", "IT: provision laptop and email", "Manager: schedule first-week 1:1". This is the *Launch Plan* flow.

From the employee detail page, click **Launch Plan**. The modal has two steps:

### Step 1: Select a template

The system automatically filters templates by the employee's effective type:

- Intern
- External Consultant
- Internal Consultant (Billable / Non-Billable)
- Confirmed Employee (Billable / Non-Billable)

This mapping lives in `getEmployeeApplicableType()` and ensures an intern never gets the confirmed-employee checklist. If only one template exists for their type, it is pre-selected automatically. Templates are maintained from **Employee → Plan Templates** (`/org/:slug/employee/plan-templates`).

### Step 2: Review and assign tasks

Each template task has a default assignee role (HR, Manager, IT, or Employee). You can override any assignee to a specific person — the dropdown shows employees who have a `linkedUserId` (i.e. they have accepted a portal invite), which is important because tasks need a real user to be actionable.

On launch:

- A `plan_instance` document is created with `status: 'in_progress'`
- Each task is cloned from the template with the overridden assignees
- Assignees receive task notifications
- The employee sees their onboarding progress on their home dashboard (the `PlanProgress` component)
- Anyone assigned a task can mark it complete from the `OnboardingStepper` component

Launching a plan is idempotent in the sense that the same template can be launched multiple times per employee if needed (e.g. a *re-onboarding* after a long leave), but most orgs only launch once per hire.

---

## Onboarding status at a glance

Throughout the flow, `employee.onboardingStatus` moves through these values — it's the single field the system uses to decide whether the joiner is blocked, in progress, or done:

| Value | Meaning | How to get there |
|-------|---------|------------------|
| *(unset)* | Admin created the employee but hasn't invited yet | Default on record creation |
| `pending` | Invite sent, wizard not yet submitted | Admin clicks *Invite to Workspace* |
| `completed` | Self-service wizard submitted | Employee clicks *Submit* on the Review step |

If an employee reports they are "stuck on the onboarding page", check this field on the detail page first — most of the time it's still `pending` because they closed the tab mid-wizard. They can resume right where they left off.

---

## Common issues and fixes

- **"Employee cannot be saved — email already exists in this org."** Each org enforces unique work emails. Use a different address or delete the conflicting record.
- **"Bank details required before payroll."** The admin can add bank details from the detail page on behalf of the employee if needed — you do not have to wait for the wizard.
- **Portal invite email didn't arrive.** Check the org's email logs under **Settings → Email Logs**. Most delivery failures are caused by catch-all filters on the recipient's domain.
- **Employee cannot see the apps I enabled.** App access on the `org_memberships` record is only re-read on login. Ask them to log out and back in.
- **Probation end date looks wrong.** The default is 90 days from joining date. You can override it per-employee from the detail page, or change the org-wide default under **Settings → Employee → Probation period**.
- **Re-hiring a former employee.** If someone was previously separated and their membership is now `alumni` or `archived`, you'll need to create a new employee record (or reactivate the old one by changing status back to *active* and clearing the LWD). The old `linkedUserId` is preserved on the employee record, so re-linking to the same portal user account is automatic if the work email matches. The alumni membership will need to be manually flipped back to `active` by an admin from Settings — the system won't do this automatically, because an accidental status change on the employee record shouldn't silently re-grant full access.

---

Once onboarding is complete, the employee is a fully active workspace member and will appear in payroll runs, leave dashboards, ATS interviewer lists, and any other app they have access to. For the mirror-image process when an employee leaves, see **Employee Offboarding & Full & Final**.
