# Redesign — working agreements

The migration of the portal onto the design system delivered in
`Rivvra Design System.zip`. Companion docs: `STAGING.md` (environment,
branch strategy), `REDESIGN-QA.md` (test matrix).

---

## Where things live

| Layer | Path | Owns |
|---|---|---|
| Design system | `src/components/ds/` | Presentational primitives. No routing, no data fetching, no domain vocabulary. Each component has a `.d.ts` contract beside it. |
| App-layer kits | `src/components/platform/v2/listkit.jsx` | URL binding only — reads/writes the query string and hands values to controlled `ds/` components. |
| Domain compositions | `src/components/outreach/v2/leadskit.jsx`, `src/components/ats/config/v2/sectionsV2.jsx` | Compositions that encode one app's vocabulary (a "lead", an "ATS picklist"). Built from `ds/`, never duplicating it. |
| Pages | `src/pages/**/*V2.jsx` | Data fetching, page composition. Import components **only** from `@/components/ds` (plus the kits above). |

**The rule that keeps this honest:** if a page needs a primitive that does
not exist in `ds/`, build it in `ds/` with a `.d.ts` — never in the page.
Phase 1 existed to repair exactly that drift; eleven primitives had
accumulated in the kit files, and `InlineSelect` was being imported by two
shared modules *from a page file*.

### Controlled vs. bound

`ds/` filter controls are **controlled**: they take `value` + `onChange` and
know nothing about the URL. The URL-bound variants (`SelectChipV2`,
`ArchivedToggleV2`, …) live in `listkit.jsx` as thin adapters. This is
deliberate — a design-system component that calls `useSearchParams` is
coupled to React Router and cannot be used in a modal, a drawer, or a
non-routed surface.

---

## Styling: inline styles in `ds/` are permanent (Option A)

Three mechanisms are in play — Tailwind (legacy pages and page-level
layout), inline styles (`ds/` components), and `shell.css` (the v2 app
shell). That is settled as follows:

- **`ds/` components keep inline styles.** They read semantic tokens
  (`var(--surface-1)`, `var(--fg-2)`, `var(--r-2)`), so theming, the
  light/dark swap and density all work exactly as they do for Tailwind
  classes. Values in the handoff `.jsx` are the spec; keeping them inline
  keeps each component byte-comparable against the handoff, which is what
  makes "did we drift from the design?" answerable by diff.
- **Page-level layout uses Tailwind or inline styles as convenient.** Page
  files are not spec artifacts.
- **`shell.css` stays** as the one stylesheet, scoped under `.ds-shell`,
  because the shell is a fixed chrome with pseudo-elements and media
  queries that inline styles cannot express.

**Why not Option B (convert `ds/` to Tailwind):** the conversion is a
mechanical rewrite of ~30 components with no user-visible outcome, it
breaks diff-against-handoff permanently, and the bundle argument does not
hold here — these styles are static objects hoisted by the bundler, and the
Tailwind class strings would be additive to a stylesheet that already ships.
Revisit only if a measured bundle or lint problem appears.

**Known cost, accepted:** three `ds/` components (`SelectChip`,
`GroupByChip`, `MoreFilters`) render popovers using the `.pop`, `.pop-item`
and `.pop-label` classes from `shell.css`. Every v2 page renders inside
`.ds-shell`, so this works today. If a `ds/` consumer ever lives outside the
shell, those three classes must travel with it. Noted in each file.

---

## Standing rules

1. Every migrated page ships behind `PageSwitch`. The legacy component stays
   until the v2 one has been live and quiet for two weeks.
2. New pages import components only from `@/components/ds`.
3. Where a component's `.jsx` and any document disagree, the `.jsx` wins.
4. Do not fork token values. Components read `src/styles/ds-tokens.css`.
5. Server-refused operations must not be described as soft in confirm copy
   (CRM stages, CRM lost reasons and ATS stages 400-block deletion while in
   use).
6. Never trigger outside staging: payroll publish, invoice post/send, sign
   request send, sequence activation, team invite, F&F settlement, bulk
   actions, announcement dismissal.

---

## The detail archetype (phase 3)

`pages/contacts/ContactDetailV2.jsx` is the reference. The shape:

- **Header** in a bare `Panel`: identity block (`Avatar` or a type glyph),
  `EditableHeading`, status `Chip`s, quick links, `RecordMeta`, and the
  destructive actions right-aligned.
- **`Tabs` bound to `?tab=`**, not to component state, so a tab is linkable and
  survives reload. An unknown `?tab=` falls back to the first tab.
- **Body**: `Panel` per section in an auto-fit grid, each a stack of
  `InlineField` / `InlineComboField` rows. Related records go in a `DataTable`
  inside a `flush` Panel.

Two rules the archetype depends on:

1. **`onSave` must reject on failure.** `InlineField` is pessimistic — it keeps
   the editor open with the user's text and offers retry. A handler that
   swallows its error and only toasts leaves the field claiming it saved.
2. **Archived records are read-only.** Fold the archive state into the page's
   admin predicate once (`isAdmin = isAdminRaw && !record.archived`) rather
   than at each of the ~24 call sites, and keep the raw predicate for the
   un-archive control.

---

## Deprecations in flight

| Shim | Replacement | Remove after |
|---|---|---|
| `platform/v2/configkit.jsx` (re-exports `ConfigListV2`, `ConfigDot`) | `ds` → `ConfigList`, `ConfigDot` | phase 2 |
| `PageHeaderV2` re-export in `listkit.jsx` | `ds` → `PageHeader` | phase 2 |
| `ds/Surface/ConfigList.jsx` importing `shared/ConfirmDialog` | `ds` → `ConfirmDialog` (exists as of phase 3b) | next config touch |
| `shared/ActivityPanel.jsx` (4 legacy detail pages) | `shared/v2/ActivityPanelV2.jsx` | those pages migrate |
| `shared/ContactLookup.jsx`, `shared/EmployeeLookup.jsx` | `ds` → `EntityLookup` | their pages migrate |
| `shared/SignRequestWidget.jsx` — dark-only, breaks light theme | rebuild with the Sign surface | Sign slice |

### App-layer v2 components

`ActivityPanelV2` is not a ds primitive — it knows about activity types,
entity types and the ATS email-body endpoint. Domain-coupled shared
components live in `components/<area>/v2/`, built **only** from ds, the same
layering as `platform/v2/listkit` and `outreach/v2/leadskit`. A v2 page must
never import the legacy sibling: they are visually incompatible, and the
legacy one silently ignores `canEdit`.

---

## Where the migration stands (end of phase 6a)

**31 v2 pages across 45 routes**, all behind `PageSwitch`, flag-gated to the
staging org. Done: the v2 shell, every major list, the config pages, six
detail pages (Contact, CRM Opportunity, ATS Application, ATS Job, Employee,
Document), and all of the low-risk breadth group except one.

Group 1 is closed out apart from `expenses/ExpenseDetail` — see below. The
two To-Do pages brought `components/todo/v2/{TaskCardV2,TaskFormModalV2}`
with them, and three ds primitives the forms needed: `Textarea`, `Select`
and `ComboBox`.

### `expenses/ExpenseDetail` — stopped, not migrated

Listed in group 1 as carrying no money surface. It does, on two counts, so
it was left alone rather than shipped:

- **It computes and displays money.** `lineConverted()` does FX arithmetic in
  the page (`Math.round(amt * rate * 100) / 100`), `totalAmount` sums the
  converted lines, and both render through `formatCurrency` against the
  claim currency. That is display of derived money, which the standing rule
  says to propose rather than ship.
- **It owns approval and reimbursement transitions** — submit, approve,
  reject, cancel, sync to Employee Bill, reimburse and reverse.

It is also 1,323 lines, roughly three times the largest page in the group.
It belongs with the invoicing/payroll bucket below: parity-proven rendering,
reviewed on its own.

### The recipe (worked seven times)

1. Copy the legacy file verbatim to `<Name>V2.jsx`. Do not re-derive logic —
   only presentation changes.
2. Swap `SectionCard`→`Panel`, `InlineField`/`RecordMeta`→ds,
   `ActivityPanel`→`ActivityPanelV2`, local `StageBar`→ds `StageBar`.
3. Cut any local component with a **paren-then-brace matcher**, never a regex.
   A regex ate three unrelated declarations on EmployeeDetail, and matching
   the first `{` lands inside destructured params. Then diff the declaration
   set against the legacy file — it should report only the cut component.
4. Wire `PageSwitch` in `App.jsx`.
5. Verify by **loading the page**. The build has never once caught a real
   defect in this migration; missing imports, swallowed declarations and
   invisible text all surfaced only at runtime.
6. Run the contrast audit in light theme (recipe in `REDESIGN-QA.md`).

Step 5 keeps earning its place. The build has still never caught anything —
what it missed in 6a was a `ComboBox` popover clipped by the modal body it
opened inside, which only reads as "the list is truncated" when you look at
it.

### Deferred, with the reason

| what | why it waits |
|---|---|
| ~~dashboards — need a ds chart component that does not exist~~ | **Wrong; unblocked in phase 7.** See below. |
| `CrmPipeline`, `AtsPipeline` | kanban archetype, not yet designed |
| KB pages | redesigned separately in July — migrating risks undoing that |
| Forms and wizards (`EmployeeForm`, `AtsApplicationNew`, onboarding) | new archetype: multi-step validation, unsaved-change guards |
| Invoicing (24 pages, 11 money-heavy), payroll (14, 7 money-heavy) | salary/statutory display — parity-proven rendering, reviewed separately |
| `expenses/ExpenseDetail` | moved here out of group 1: FX arithmetic and totals rendered in the page, plus approval/reimbursement transitions |
| Sign (7 pages) | `PublicSigningPage` is externally facing; send paths |
| `ats/applicationDetailParts.jsx` + `HireModal` | only stops being debt once legacy `AtsApplicationDetail` retires (~26 Aug, per the two-week rule) |

---

## The dashboard archetype (phase 7)

`pages/todo/TodoDashboardV2.jsx` is the reference.

**The blocker was not real.** Dashboards sat in the deferred table for months
as "need a ds chart component that does not exist". They do not:
**none of the ten dashboards imports recharts.** Only two files in the whole
app do — `TeamDashboardPage` and `invoicing/Profitability` — and neither is a
dashboard. What the dashboards actually render is stat tiles, proportion bars
built from divs, and lists.

Worth remembering as a pattern: the entry was written from the *category name*
rather than from the files. A whole class of pages was parked on a dependency
nobody had checked for.

The shape:

- **KPI row**: `Stat` per metric, each with `onClick` into the filtered list
  behind its number. `Stat` renders a real `<button>` when given `onClick` —
  every legacy dashboard hand-rolled that wrapper, and a `div` with an
  `onClick` would have made the whole row mouse-only.
- **Body**: a `Panel` per region on an auto-fit grid, the primary region
  spanning two columns.
- **Proportions**: `Meter`, never a hand-rolled track. The legacy pattern was
  `bg-dark-800 rounded-full h-2` with a width-set inner div — a fixed dark
  track that survived the theme swap only by accident of the palette bridge.
- **Charts**: only where the question is genuinely a distribution or a trend.
  Wrap recharts, which already ships in the bundle. **Still not needed** — see
  below.

### The one "real chart" turned out not to need one either

`AtsDashboard` held the only hand-rolled chart in the app: an SVG donut with a
fixed 12-colour palette. Validated against the light surface, that palette
**fails outright** — slots 2 and 3 (`#a855f7`, `#3b82f6`), which sit *adjacent*
in the ring, are ΔE **0.9** apart under deuteranopia, i.e. the same colour to
the most common form of colour blindness. Seven of the twelve also fall below
3:1 on the light surface, and the track ring was a hardcoded `#1f2937` that
stayed dark in light theme.

The answer was not a better palette. Both donuts plot a **magnitude comparison
across close values** — 11 recruiters, 9 clients — and a donut is the wrong
form for that past ~6 segments. Ranked **one-hue horizontal bars** answer "who
has the most" directly, need no categorical palette at all (nothing to
validate, no CVD risk), and keep every category named instead of folding the
9th onward into "Other" to fit a colour budget.

**The rule to carry forward: pick the form before the colour.** A palette
problem is often a form problem wearing a disguise. If a categorical palette
*is* genuinely needed later, validate it — don't eyeball ΔE.

### Copy first, then edit — it is measurable

`AtsDashboardV2` was produced by `cp` followed by targeted edits, and every
rewritten leaf kept its original signature so no call site moved. Result: the
~680-line main component body differs from legacy in **four places** — two
component renames, one comment, two colour props. Every fetch, gate, CSV
builder and derived metric is byte-identical, and that is checkable with
`diff` rather than trusted. Retyping a 1,400-line file cannot make that claim.

### What this cost, and what to check next

Two small primitives (`Meter`, and `onClick` on `Stat`), and the nine
remaining dashboards are unblocked.

Before starting the next archetype, **verify its blocker against the files.**
Kanban and forms are the other two entries — and the form archetype turns out
to be largely built already, since phase 6a shipped `Field`, `Input`,
`Textarea`, `Select` and `ComboBox` plus two working forms
(`TaskFormModalV2`, `CrmOpportunityNewV2`). What it still lacks is the
unsaved-change guard.

### Opacity is not a colour

Found twice, once in legacy and once in our own new code, so it is worth
stating as a rule: **do not express "de-emphasised" with `opacity` on a
container.** It multiplies through every descendant, and no palette remap can
reach it — the bridge maps colours.

`TaskCardV2` dimmed a done row to `opacity: .62`, which put the priority chip
inside it at **2.39** against a 4.5 floor and the AI-guide link at 2.55. It now
mutes the *title* (strikethrough, `--fg-4`) and leaves the rest at full
strength; the row still reads as done. The same pattern is still open across
the statutory report pages — see `THEMING.md`.

### Open defects, not yet fixed

- **Aged Receivables / Payables can drop a row.** `AgedReceivables.jsx:76` and
  `AgedPayables.jsx:70` key rows as `` `${row.customerId || i}-${currency}` ``.
  Two rows for the same counterparty in the same currency collide, and React
  warns "Encountered two children with the same key" then may omit or duplicate
  one. Observed live on staging with `69e3e771f6e20f6d943fb5b8-INR`.
  `TaxReport.jsx:206` has the same shape. Not fixed here: these are money
  reports, and the right fix depends on whether duplicate counterparty rows are
  expected (key needs the ageing bucket too) or whether something upstream
  should have merged them. **Worth checking against a real receivables total
  before trusting either report.**
- **A policy whose PDF fails to render can never be acknowledged.**
  `PolicyReaderModal`'s scroll gate leaves `reachedEnd` false when the render
  errors, so "I acknowledge" stays locked while the only offered path is
  Download. Inherited from the legacy component, not introduced by the
  migration — but on staging, where every policy download 500s, it is the
  only state you can reach.
- **`opacity-*` on small text, across the statutory reports** — 2.67 on the
  GST and TDS explanatory copy. 518 occurrences over 192 files, so it is a
  bridge-wide opacity floor or a real sweep, not a per-file edit. See
  `THEMING.md`.

*(Fixed and removed from this list: `ds/ConfirmDialog`'s brand-green danger
confirm, closed by the `Button` `danger` variant; and `ds/Chip`'s sub-AA
tinted text, closed by `--brand-ink` / `--warn-ink`.)*
- `InlineField` read mode is a click-only `div` — every migrated detail page
  is mouse-only for inline editing.
- `ShellSwitch` renders the legacy shell until the org fetch resolves; a
  *failed* fetch strands the user on it silently.
- `SignRequestWidget` is dark-only; the palette bridge covers it, but it is
  still legacy markup.
- Not ours: every `/documents/{id}/preview` request 500s on staging.
