# Plan: guided run state on the Payroll Run page

**Status:** proposal — nothing implemented. Needs sign-off on §7 before coding.
**Drafted:** 2026-08-13
**Trigger:** HR could not tell which of `Finalize`, `Lock Inputs`, `Lock Payroll`,
`Hold Payslips` and `Re-process` to click, or in what order.

---

## 1. The problem

The run header presents six controls of equal visual weight, in an order that has
nothing to do with when they should be used, with labels that don't say what they do.
Nothing marks which step the run is on or what comes next.

This is not a training gap. Two of the six are actively misleading (§3), one ordering
mistake is a trap that silently blocks the rest of the month (§4), and the page models
a payroll month as linear when Huemot's is not (§5).

## 2. The real state machine

Verified against `src/payroll.js` on 2026-08-13. This is the ground truth the UI has to
reflect; today it is nowhere on screen.

```
draft ──process──> processed ──finalize──> finalized ──mark-paid──> paid
                       ▲                        │
                       └──────unfinalize────────┘
```

| Action | Allowed from | Blocked by |
| --- | --- | --- |
| Process / Re-process | `draft`, `processed`, `processing` | `payrollLocked`; legacy release-all; missing `companyId`; any **rejected attendance sheet** (`ATTENDANCE_REJECTED`); missing FY statutory config |
| Release payslips | `processed`, `finalized`, `paid` | — (accepts an `employeeIds` subset) |
| Hold payslips | any | — (accepts an `employeeIds` subset) |
| Ad-hoc earnings/deductions | `draft`, `processed` | `inputsLocked` |
| Override a row | `processed` | that **employee's own** payslip being released |
| Finalize | `processed` only | — |
| Unfinalize | `finalized` only | — |
| Mark Paid | `finalized` only | — |

Two consequences HR cannot currently see:

- **Mark Paid requires `finalized`.** Finalize is not optional bookkeeping; it is on the
  critical path to recording payment.
- **Finalize leaves `processed`, so it blocks Process.** See §4.

## 3. Two labels that overpromise

**`Lock Inputs` does not lock inputs.** It is enforced in exactly one place —
`payroll.js:5151`, the ad-hoc adjustments endpoint. It does **not** freeze attendance or
timesheets; there is no `inputsLocked` check anywhere in `timesheet.js`. The in-product
KB (`src/content/kb/running-payroll.md:147`) describes a "two-level locking system…
prevents accidental edits after review", which overstates it. An HR admin who locks
inputs and believes attendance is now frozen is wrong, and nothing tells them.

*Either* rename it to what it does (`Lock Adjustments`), *or* extend enforcement to
attendance/timesheet edits for the run period. **This is a §7 decision — the second
option changes who can edit what, so it is not a UI change.**

**`Lock Payroll` blocks re-processing** and nothing else. The label suggests something
broader and more final than it is.

## 4. The ordering trap

Finalize is reachable the moment a run is processed, and it is the most prominent
button on the page — filled purple, top right. But:

> Process accepts `draft | processed | processing`. Finalize moves the run to
> `finalized`. **A finalized run can no longer be processed.**

So for a month with a second cohort still to compute, clicking Finalize early blocks the
work that remains. Recovery is Unfinalize, which is easy *if you know that's what
happened* — the error only says "Can only process draft or re-process."

Today the July run sits in exactly this position: `processed`, 31 of 68 released, 37
external consultants still to be released. Finalize is the biggest button on screen and
is the wrong thing to click.

## 5. Partial release is normal, not an edge case

Huemot pays one payroll month on two dates — employees and internal consultants on the
30th/31st, external consultants on the 15th of the following month once timesheets are
approved. A month therefore looks like:

```
process → release cohort A → pay A → (wait ~2 weeks)
        → re-process → release cohort B → pay B → finalize → mark paid
```

Release is already per-employee (`releasedEmployeeIds`), and re-processing now freezes
released rows. **A naive linear stepper would mark "Release" complete at 31/68 and walk
HR straight into the Finalize trap.** Partial release must be a first-class state that
reads as *in progress*, not *done*.

This is the same modelling error that produced four separate bugs this week — the
run-level `payslipReleased` boolean being read where per-employee truth was needed
(timesheet window guard, process guard, Release/Hold buttons, row override). The UI
must not repeat it.

## 6. Proposal

### 6.1 Not a modal

A modal on entry interrupts once and is gone precisely when someone gets stuck three
steps later. It also cannot express "you are here". Guidance must be **persistent and
ambient**.

### 6.2 A step strip in the run header

A compact horizontal strip under the run title showing the month's actual sequence,
each step in one of four states — `done`, `current`, `blocked`, `upcoming`:

```
①Process ──② Release A ──③ Pay A ──④ Re-process ──⑤ Release B ──⑥ Finalize ──⑦ Mark Paid
   done       done          done      done          ← current      upcoming     upcoming
```

Steps 2–5 collapse to a single `Release` step for orgs that pay one cohort. The strip is
derived, never stored — see §6.4.

### 6.3 One primary action at a time

The rule that fixes most of the confusion: **exactly one button carries primary styling,
and it is the next action.** Everything else demotes to bordered/ghost. A one-line
banner states it in words with the button beside it:

> **Next:** release payslips to 37 external consultants. `Release Remaining (37)`

Destructive or out-of-sequence actions (Hold, Unfinalize, Unlock) move behind a
"⋯ More" menu — reachable, never the obvious click.

### 6.4 Deriving the next action

Pure function, no new persisted state, testable in isolation — same approach as
`payrollFreeze.js`:

```js
// src/utils/payrollRunGuidance.js
nextAction(run) -> { step, label, action, why, blockedReason }
```

Priority order, first match wins:

| Condition | Next action |
| --- | --- |
| `status === 'draft'` | Process |
| rejected attendance sheets exist | **Blocked** — "Resolve N rejected attendance sheets" |
| `reprocessFrozenDrift.length > 0` | **Review** — drift banner (§ shipped) |
| unreleased rows exist **and** their figures look computed | Release remaining (N) |
| unreleased rows exist **and** figures are stale/zero | Re-process |
| all released, `status === 'processed'` | Finalize |
| `status === 'finalized'` | Mark Paid |
| `status === 'paid'` | Done — no primary action |

"Figures look computed" needs a real definition — §7.

### 6.5 Say what the locks do

Replace tooltips with plain statements of effect: *"Blocks ad-hoc earnings and
deductions on this run"*, *"Blocks re-processing"*. If §7 keeps the `Lock Inputs` name
without extending enforcement, the tooltip must say so explicitly.

### 6.6 Guard the trap

While any row is unreleased, Finalize is demoted (not disabled) with a tooltip:
*"37 employees have no payslip yet. Finalizing blocks re-processing."* If clicked
anyway, confirm with that sentence. **Whether to hard-block is a §7 decision.**

## 7. Decisions needed before coding

1. **`Lock Inputs`** — rename to `Lock Adjustments` (honest, cheap), or extend it to
   actually freeze attendance/timesheets for the period (real behaviour change,
   affects who can edit what)?
2. **Finalize with unreleased rows** — demote + confirm, or hard-block?
3. **"Figures look computed"** — how does the UI distinguish "this cohort is ready to
   release" from "this cohort still needs a re-process"? Options: net > 0; timesheet
   approved for the period; or an explicit per-cohort marker.
4. **Is the 7-step sequence right for all tenants**, or does the two-cohort shape need
   to be opt-in per org? Other tenants may pay everyone once.
5. **Where does `Mark Paid` sit** relative to the real bank transfer — before or after
   money actually moves?

## 8. Explicitly out of scope

- No change to any payroll figure, formula or export.
- No change to who may perform an action (`requireAppAdmin('payroll')` stays).
- No new persisted run fields — guidance is derived from existing state.
- Not a wizard. HR must retain the ability to do things out of order.

## 9. Testing

Unit-test `nextAction(run)` against fixtures for: fresh draft; processed with nothing
released; **processed with 31/68 released** (today's July run — must yield "Release
remaining (37)", never "Finalize"); all released and processed; finalized; paid; a run
with rejected attendance; a run with non-empty drift; and a legacy release-all.

Then walk the July run itself and confirm the strip reads
`Process ✓ · Release A ✓ · Pay A ✓ · Re-process ✓ · Release B ← current`.

## 10. Phasing

1. **Phase 1 (small, high value):** next-action banner + single-primary rule + honest
   lock tooltips. Fixes the confusion without new UI vocabulary.
2. **Phase 2:** the step strip.
3. **Phase 3:** the Finalize guard and the `Lock Inputs` resolution from §7.

Phase 1 alone would have prevented today's question.
