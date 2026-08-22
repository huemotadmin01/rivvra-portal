# V2 feature drift — legacy features that never reached their twin

**Question:** since the redesign branched, which features shipped to legacy
pages and were never ported to the V2 twin?

**Window:** 2026-08-11 (first V2 page) → 2026-08-23. Not "the last month" —
before 08-11 no V2 file existed, so nothing could drift.

**Impact today: none.** Every gap below is on a `uiV2`-gated page, and no
production org has the flag. They become real the moment it is flipped, which
is exactly why they matter before a pilot.

---

## Method

1. Paired every `*V2.jsx` with its legacy original by filename → **157 pairs**
   (17 V2 files are new components with no twin).
2. For each pair, found commits touching the legacy file *after* the V2 twin
   was created, where the same commit did **not** touch the twin → 28 commits
   across 12 files.
3. That over-reports, because several were ported later in separate commits.
   So each candidate was then **content-checked against the V2 file** for the
   specific identifier the legacy commit introduced.

Step 3 is what the findings rest on. Step 2 alone would have produced nine
false positives.

---

## CONFIRMED GAPS

### 1. `PayrollRunPageV2` — the entire guided-run layer *(highest severity)*

Eight legacy commits (2026-08-14 → 08-16) built a guided run experience. None
reached V2. Verified absent by identifier:

| feature | legacy | V2 |
|---|---|---|
| "kept the figure already paid" disclosure | yes | **missing** |
| step strip (Process → Release → Finalize → Mark paid) | yes | **missing** |
| next-action banner / single primary button | yes | **missing** |
| `holdDecided` — HR says whether a salary hold is settled | yes | **missing** |
| "Lock Adjustments" rename + Finalize consequence dialog | yes | **missing** |
| Release counts who can actually be released, and names them | yes | **missing** |
| never release a zero-value payslip | yes | **missing** |
| Re-process disabled (not hidden) when payroll is locked | yes | **missing** |

The first row is the serious one. Legacy warns, with names and amounts, that a
released payslip kept a figure already paid — e.g. paid ₹96,192 where recompute
would have produced ₹99,792 — and tells the user to pay corrections as arrears.
**V2 shows no such warning.** A payroll admin on V2 loses a money-safety
disclosure that exists today.

This is the port that was scoped at +349 lines and deliberately deferred
(2026-08-22) for lack of context on the release/finalize flow. It is still the
right call not to guess at it — but it is now the single largest blocker to
turning `uiV2` on for anyone who runs payroll.

### 2. `SettingsAtsV2` — Job Aging thresholds not editable

`AtsDashboardV2` **has** the Job Aging & Delivery SLA card. Its two settings
did not come with it:

- `jobAgingTargetDays` — "Job aging target" — legacy yes, V2 **0 occurrences**
- `jobNoSubmittalDays` — "Submittal window" — legacy yes, V2 **0 occurrences**

Effect: on V2 an admin sees the SLA card and its "14 breaching SLA" count, but
cannot tune what counts as a breach. The card reads defaults it cannot change.
(The three older `reportingThresholds` — stale/awaiting/pending — *are* in V2.)

### 3. `ReplyIntentBadge` — absent from all of V2

`grep` across every `/v2/` path and `*V2.jsx`: **zero references.** The AI
reply-intent badge shipped to `TeamListsPage` and `MyListsPage` on 2026-08-21
and has no V2 presence.

Note the near miss: `IcpScoreBadge` **is** present, via
`components/outreach/v2/leadskit.jsx`, which both V2 list pages import. So the
ICP fit badge is fine and only reply-intent is missing — a per-page check would
have wrongly flagged both.

---

## VERIFIED PRESENT — no action

Each confirmed by the identifier the legacy commit introduced:

| feature | V2 status |
|---|---|
| Incentive "Create anyway" + `otherIssues` footnote | present |
| Statutory: effective settings, ESI default, exclusion rename | present |
| Timesheet assignment end-date guard (`isDayDisabled`) | present |
| ATS Job Aging & Delivery SLA **card** | present |
| Outreach Hiring Signals card | present |
| ICP fit badge (via `leadskit`) | present |
| Invoicing journals link | fixed 2026-08-23 |
| Admin email templates (Job On Hold / Closed) | data-driven, no drift |

**Contact Detail RBAC fix — present.** Worth stating explicitly because it was
the one security-relevant item. Commit `995b1efd` ("admin-only affordances
leaking to plain members") guarded the activity panel with `canEdit={isAdmin}`.
`ContactDetailV2.jsx:789` carries the identical guard. Raw counts of `isAdmin`
differ (45 legacy vs 43 V2), but the files are structured differently, so the
counts are not evidence either way — the specific guard is what matters, and it
is there.

---

## What this method does NOT cover

State these before treating the list as complete:

- **Only pairs where a V2 twin exists** (157). A legacy page with no twin is
  fine — the route serves legacy — but it is outside this audit.
- **Identifier presence, not behavioural equivalence.** A V2 file can contain
  the identifier and still implement it wrongly. This finds omissions, not bugs.
- **Shared components are invisible to it.** Drift inside a component both
  shells import would not appear as a pair mismatch.
- **The window starts 2026-08-11.** Features built before that are baseline,
  not drift.

---

## Suggested order

1. **`PayrollRunPageV2`** — blocks any payroll-using org from the flag. Needs
   real care: release/finalize is money and statutory.
2. **`SettingsAtsV2` thresholds** — small and self-contained; the card is
   already there and only needs its two inputs.
3. **`ReplyIntentBadge` into `leadskit`** — smallest; `IcpScoreBadge` next to
   it is the working template.

Until 1 is done, do not enable `uiV2` for an org that runs payroll.
