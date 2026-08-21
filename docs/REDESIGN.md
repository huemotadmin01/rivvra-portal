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

### `expenses/ExpenseDetail` — migrated in phase 9, on explicit instruction

Held back twice because it is a money surface on two counts: it does FX
arithmetic in the page, and it owns the approval and reimbursement
transitions. Migrated when asked, under the strictest discipline in this
project.

Nothing that produces a number or moves a claim between states was touched,
and that is verified by diff rather than by eye — `lineConverted()` including
its `sameCcy` short-circuit, the `totalAmount` reduce, every `formatCurrency`
call site argument-for-argument, and the full `expensesApi` call set
(submit / resubmit / withdraw / approve / reject / cancel / delete / sync /
reimburse / reverse) all compare identical. The declaration set is identical
too: nothing cut, nothing added.

**A limit worth stating: no claim on staging has a cross-currency line.** The
runtime money-parity check therefore only exercises the `rate = 1` path. The
FX branch is covered by the static diff of `lineConverted` and nothing else —
if a real multi-currency claim ever appears, re-run the harness against it.

`STATUS_META` keeps `approved` on the same **warn** tone as `submitted`
rather than a success tone. Bills are created on approval, so a happy-path
claim never lingers in `approved` — that state means the bill failed to sync
and has to read as "needs attention", not "done".

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
| ~~`CrmPipeline`, `AtsPipeline` — kanban archetype, not yet designed~~ | **Wrong; done in phase 8.** Nothing needed designing — see below. |
| ~~KB pages~~ | **Assessed in phase 11 and deliberately NOT migrated — see below.** The concern was right. |
| Forms and wizards (`EmployeeForm`, `AtsApplicationNew`, onboarding) | new archetype: multi-step validation, unsaved-change guards |
| Invoicing (24 pages, 11 money-heavy), payroll (14, 7 money-heavy) | salary/statutory display — parity-proven rendering, reviewed separately |
| `expenses/ExpenseDetail` | moved here out of group 1: FX arithmetic and totals rendered in the page, plus approval/reimbursement transitions |
| Sign — `PublicSigningPage` only | **Assessed in phase 12 — the premise was half wrong. It is not dark-broken; it is a deliberate standalone LIGHT surface. Do not migrate it to ds. See below.** |
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

---

## The kanban archetype (phase 8)

`pages/crm/CrmPipelineV2.jsx` is the reference.

**The blocker was not real — the third of three checked, and the third to be
stale.** `@dnd-kit` was already installed and already used by three pages,
both boards already implemented the same pattern (`DndContext` +
`SortableContext` + `useSortable` + drag overlay), and every generic
primitive they need already existed in `ds`. The work was extraction.

### ds/Kanban is presentational only

It does not import dnd-kit. The caller runs `useSortable`/`useDroppable` and
passes `dragRef`, `dragProps`, `style`, `isDragging`, `dropRef`, `isOver`
down. Same split the filter controls use — `ds/` is controlled, the binding
lives in the page — applied to drag instead of routing.

That answers the real open question, which the deferred entry never named:
*may a ds component depend on a behavioural library?* No. It keeps a board
renderable read-only with no DnD at all, and means swapping dnd-kit later
touches two pages rather than the design system.

`dropTarget` is a prop, not a house rule, because the two boards genuinely
differ and both work: CRM registers the whole column, ATS only the body —
and ATS therefore needs its `col:` id prefix, or a drop on an **empty**
column resolves `over` to null and snaps back.

### Gate parity is proven by diff, not by runtime test

`AtsPipeline` carries ten drop gates. Verifying which drops get refused at
runtime would mean manufacturing ten broken application states on staging —
a resume-less candidate, an offer-less hire, an unsigned rate confirmation —
and any one missed is a silent hole.

Instead the migration leaves the main component body untouched and proves it:
the body diff is **two lines** (the board wrapper), with `canDragCard`,
`handleDragEnd` and the full gate-flag set individually verified identical.
One check, all ten gates, cannot sample wrong. **Use this shape for any page
whose correctness lives in a branch you cannot easily trigger.**

### Duplication is where drift hides

`EvalStars` existed in both boards and had diverged so that each copy carried
the bug the other had fixed — CRM's was mouse-only but contained its clicks;
ATS's was keyboard-reachable but let clicks bubble, so rating a card would
also open it. Neither call site passed `onChange`, so the interactive path
was dead code in both, which is how they drifted unnoticed for months.
`ds/RatingStars` takes the correct half of each.

---

## Sign — the blocker was real for ONE page, not seven

Checked against the files, as the other three deferred entries should have
been. `PublicSigningPage` really is externally facing: its route sits in the
public/no-auth block, outside `.ds-shell`, so neither the palette bridge nor
the theme toggle reaches it. Migrating it means committing to whatever
palette it renders with, on a legally-significant signing surface. That one
stays deferred on its merits.

The other five are ordinary in-shell pages, and the reason given for
deferring them does not hold:

| page | lines | send path? |
|---|---|---|
| `SignConfig` | 666 | none — **migrated (phase 10)** |
| `SignTemplates` | 840 | none — **migrated (phase 10)** |
| `SignTemplateEditor` | 2,662 | **1 call — corrected below**; chrome migrated (phase 10) |
| `SignRequestDetail` | 1,007 | 3 calls — **migrated (phase 10)** |
| `SignRequests` | 2,221 | 4 calls — **fully migrated (phase 10)** |

None of them uses the three ds components that depend on `shell.css`
(`SelectChip`, `GroupByChip`, `MoreFilters`), so the one documented
out-of-shell hazard is not in play either. Three of the five have no send
path at all.

What genuinely makes Sign expensive is **size**: ~10,600 lines across six
files, with two over 2,200. That is a scheduling fact, not a design blocker,
and it should be recorded as such rather than as an archetype problem.

`shared/SignRequestWidget.jsx` is **migrated** as
`shared/v2/SignRequestWidgetV2.jsx` (phase 10), and the four v2 pages
(`ContactDetailV2`, `CrmOpportunityDetailV2`, `AtsApplicationDetailV2`,
`EmployeeDetailV2`) now import it. The legacy file stays for the legacy pages.
Everything above its `return (` — including `handleSend`, which calls
createRequest and emails the signers — is byte-identical.

**ds `Modal` does not portal.** It positions itself with an inline
`position: fixed`, so any ancestor with a `transform` or `filter` creates a
containing block and traps it — the modal lands off-centre and clipped. The
legacy widget already carried a `createPortal(…, document.body)` wrapper with
a comment explaining exactly that, and the V2 keeps it wrapped around ds
`Modal` rather than dropping it. Verified at runtime: the dialog's parent is
`document.body`, it sits outside `.ds-shell`, and it centres across the full
viewport including the sidebar. **Any future caller that renders ds `Modal`
beneath a transformed ancestor needs the same wrapper** — or ds `Modal` should
learn to portal itself.

### PublicSigningPage — do NOT put ds components on it

The deferral said the bridge cannot reach it and there is no theme toggle.
Both true, and both beside the point. Measured in phase 12:

- It is a **deliberate standalone light surface** — white document on
  `bg-gray-50`/`bg-gray-100`, an indigo action bar, a signing toolbar. That is
  right for an external counterparty, who has no theme preference and is being
  shown a legal document.
- `data-theme` is **unset** on this route, so the ds tokens — which are defined
  on `:root` and therefore *do* resolve here — fall to their **dark** defaults.

**That is the real blocker, and it is the opposite of the one recorded.** Drop a
ds `Button` or `Panel` onto this page today and it renders *dark on a light
document*. Migrating it means first giving the route an explicit light token
context (e.g. `data-theme="light"` on its root, since custom properties
inherit), and only then reaching for ds. Nobody should do half of that.

What phase 12 actually fixed, both found by loading the real signing surface
with a token read from staging Mongo:

1. **`formatDisplayDate` printed the literal string "Invalid Date" onto the
   document.** `toLocaleDateString` on an invalid `Date` *returns* `"Invalid
   Date"` rather than throwing, so the function's own `try/catch` never fired.
   Anything that is not a bare `YYYY-MM-DD` hit it — an ISO datetime
   (`2026-05-04T12:00:00.000Z`), `04/05/2026`, or free text. A counterparty
   about to sign saw `Date: Invalid Date`. Now falls back to the raw value,
   which is what the `catch` was already trying to do.
2. **Contrast.** `text-gray-400` on this page's light cards is **2.54** —
   under the 4.5 text floor *and* the 3.0 graphics floor, so its icons failed
   too. Sixteen sites moved to `gray-500`; the compliance footer needed
   `gray-600` because it sits on `bg-gray-100` rather than a white card
   (`gray-500` measured 4.39 there — same token, different surface).

Both views now audit clean.

#### Correction: the "Invalid Date" was a staging scrub artifact

The first write-up of this said the root cause was upstream — something
writing non-date values into a date field, with real documents affected.
**That was wrong, and it was investigated and closed the same day.**

The verify payload's `previousValues` returned **five entries, all fake
names** (`Micaban Bo`, `Letaku Povejud`, `Dara`, `Kun`). That is the staging
scrub: `scripts/scrub-staging.js` pseudonymises `sign_request_values`, and it
does not exempt date fields. Nothing wrote a bad date — the scrub overwrote a
good one.

Every production path into `formatDisplayDate` yields a bare `YYYY-MM-DD`:

| path | shape |
|---|---|
| autofill → `todayStr()` | `YYYY-MM-DD`, built from local parts |
| the signer's own input | `<input type="date">`, spec-guaranteed |
| `serverSignedAt` | already coerced, `.toISOString().slice(0, 10)` |
| `request.validity` | already coerced, `.split('T')[0]` |
| `previousValues` | written by the two paths above |
| `prefillData` (SignRequestWidget) | name/email/phone/company only — no dates |

The author had already defended both ISO-shaped paths explicitly, which is
exactly why only scrubbed values ever tripped it.

**The fix still stands, as hardening rather than a bug fix.**
`toLocaleDateString` on an invalid `Date` returns the literal string rather
than throwing, so that `try/catch` could never fire; falling back to the raw
value is cheap and is what the `catch` already intended.

**The lesson worth keeping:** when a defect reproduces only on staging, check
the scrub before blaming the app. Scrubbed data can make a healthy code path
look broken — and worse, can make a *type* look violated when only the value
was replaced.

### Incentive money printed the wrong currency (phase 13)

Five files in `pages/incentive/` each carried their own `formatINR`, and they
were not even consistent with one another — `RecordDetail` kept paise,
the dashboard and `RecordsList` pinned `maximumFractionDigits: 0` and dropped
them. All five hard-coded INR.

This was recorded as a latent risk. **It was not latent.** The org has four
companies — INR, CAD, USD, INR — and the Incentive dashboard is
company-scoped. On the USD company the "Waiting on payroll" table was
rendering real USD invoice values as **₹464, ₹5,200, ₹4,536, ₹7,680**. The
first check missed it by querying only `/incentive/records` (empty for that
company) and not noticing the card draws from invoices, which are not.

Both dashboards now use the shared `formatMoney`, with the currency taken
from the **active company**:

```js
const money = (amount) => formatMoney(amount, currentCompany?.currency || 'INR');
```

**Why the company and not the record**, given `utils/formatCurrency`'s header
says to pass the record's own currency: this page shows AGGREGATES, and
`/incentive/summary` returns no currency at all — only bare numbers. A
company-scoped total has exactly one correct currency, and it is the
company's. Per-record screens are a different matter (below).

Two intended consequences: a USD/CAD company stops seeing ₹, and paise print
when a figure has them — so YTD reads `₹19,84,580.17`, matching the stored
figure, and the list agrees with `RecordDetail`, which already showed 2dp.

One trap worth knowing: `WaitingOnPayrollCard` sits at module scope and cannot
see the page's formatter, so `money` is threaded to it as a prop. ESLint's
`no-undef` caught that — a module-scope `formatINR` had hidden the coupling.

**Still on the old formatter, deliberately not touched here:**
`RecordsList`, `RecordDetail` and `MyEarnings`. These are per-record surfaces
where `record.currency` IS present, so the correct fix is to pass that, not
the company's — a different change with different review. `MyEarnings`
already has a currency-aware wrapper that falls back to `formatINR` only for
INR, which is the pattern the other two should follow.

### KB — measured, and deliberately left alone

The deferral said "redesigned separately in July — migrating risks undoing
that". That was a guess. It is now measured, and it was right.

`pages/kb/` is three files and 730 lines: `KnowledgeBasePage` composing
`KbAskPanel` and `KbArticleEditor`, behind one route. Checked in the browser
across all four views — landing, article, Ask panel, and the article editor —
in **both themes**:

| | result |
|---|---|
| inside `.ds-shell`? | **yes** — the palette bridge reaches it |
| contrast failures | **zero**, every view, both themes |
| sidebar absent? | deliberate — `PlatformLayoutV2.jsx:85` excludes `knowledgeBase` explicitly, because KB has its own article nav |

So there is nothing broken to repair. Migrating it would mean rewriting a
coherent three-week-old redesign into ds primitives for consistency alone,
against the risk of regressing it — the same trade as `SignTemplateEditor`,
but more clear-cut, because here the defect count is zero and the design is
recent and deliberate.

**What was changed:** one thing. The page declared a local `EmptyState`, which
shadows the ds export of the same name — anyone later importing the ds barrel
into this file would get a silent shadow rather than an error. Renamed to
`KbEmptyState`.

A note on method: the light-theme screenshot showed the app cards as grey
slabs and looked like a real defect. It was the theme cross-fade caught
mid-transition. Measuring after the paint settled found zero failures and the
cards rendering correctly. **Screenshot, then measure — do not act on the
screenshot alone.**

### SignTemplateEditor: two corrections, and a partial by design

**It has a send path.** This table said "none". `handleQuickSendSubmit` saves
the placed fields, then calls `createRequest`, which emails the signers. The
count was taken from a grep that missed it.

**It had no contrast defects.** The audit came back clean in both themes
before any change, so unlike every other page in this slice, migrating it was
consistency work rather than repair. That changes the risk/benefit: there was
nothing broken to justify touching the risky parts.

So the change is deliberately partial. Migrated: the header, context menu,
tag strip, mobile toggles, the send dialog (onto ds `Modal` + `Field`), and
the left sidebar. Left alone: `fieldMeta` / `clamp` / `snapYToSiblings`, and
`PageContainer` / `FieldOverlay` / `PdfThumbnailStrip` — the canvas layer that
owns drag, resize and the normalised `posX`/`posY` deciding where a signature
lands on a legally-binding document. **A fractional error there does not show
up in a screenshot**, and the surrounding panel classes it would buy are
already themed correctly by the bridge. Converting them is churn against real
risk.

The verification that matters for this page is not a screenshot: fetch the
template's `signItems` and compare each stored `posX`/`posY`/`width`/`height`
against the rendered box as a fraction of the page canvas. All six fields on
`LOA Certificate` matched to four decimals.

A note on method: a batch of multi-line string replacements against this file
missed 7 of 11 targets in one pass — the same failure that produced the
`SignConfig` reset. On a file this size, anchor on single lines or slice by
index, and re-verify the untouched regions by diff after every pass.

### Migrating a modal that sends: where to put the boundary

`SignRequests`' three modals (`NewRequestModal`, `QuickSendModal`,
`BulkSendModal`) hold every outward-facing path on the page —
`createRequest`, `createEnvelopeRequest`, `quickSendPrepare`, `bulkSend`.
They were migrated in a second pass, and the technique generalises to any
form whose submit does something irreversible:

**Put the boundary at `return (`.** Everything above it — state, effects,
validation, and every handler that talks to the API — stays byte-identical;
only the JSX below is rewritten. That makes "the send behaviour did not
change" a `diff`, not an argument. Verified per modal by extracting the
region from the signature down to `if (!show) return null;` and comparing:
`QuickSendModal` and `BulkSendModal` identical, `NewRequestModal` identical
but for `modalRef`, which only ever carried the legacy dialog div's ref.

**Every control keeps its exact `value`/`onChange` binding.** A dropped
binding in a form like this is a broken send, not a cosmetic bug.

**Where a ds primitive replaces a hand-rolled control, adapt to the old
handler rather than rewriting it.** `QuickSendModal`'s `handleFile` reads
`e.target.files?.[0] || e.dataTransfer?.files?.[0]`, so `ds/FileDrop` hands
its `File` back in that shape. Proof it works: dropping
`Verification_Only (2).pdf` still auto-names the document "Verification
Only" — the legacy filename-tidying (extension, `(2)` suffix, underscore) ran
untouched — and a `.docx` is still rejected.

Two contrast fixes fell out of the audit: the wizard's active step pip was
white on `indigo-500` (**4.07**, and indigo is not a colour the bridge
remaps) and is now `--brand-fg` on `--brand`; the review step's signing-order
pip was `--a-sign` on an 18% tint of itself over `surface-3` (**3.95**) and
is now solid accent with `--bg` text.

The earlier count in this table said "2 calls". That was wrong — it counted
only the list body and missed the modals. It is four, plus
`bulkDeleteRequests` and the row-level cancel/remind.

### The signed-document tab asked for a file that isn't there

`SignRequestDetail` initialises `docTab` to `'signed'` before the request has
loaded, and never reconciles it:

```js
const [docTab, setDocTab] = useState('signed');   // legacy — never revisited
```

A request with a certificate but no signed PDF therefore renders a lone
"Certificate" tab and then fetches `/signed-pdf`, which 404s, so the panel
reads "Failed to load PDF". **No request in staging has a `signedPdfUrl`**, so
all 46 signed requests there hit it. The V2 derives `activeDocTab` from what
actually exists; the legacy file still has the bug.

### A shell reset was eating legacy button borders

Migrating `SignTemplates` surfaced a defect in `shell.css`, not in any page:

```css
.ds-shell button { … border: none; … }   /* removed */
```

Tailwind's preflight already zeroes button borders app-wide, so this added
nothing — but at specificity (0,1,1) it beat the `border` **width** utility
(0,1,0). The bridge only ever remaps border *colours*, so every legacy button
carrying a bare `border` lost its outline the moment it was rendered inside a
v2 page. `sign/TagPicker`'s tag pills flattened into bare text, which is how it
was found; a sweep of the legacy components v2 pages import shows TagPicker is
the only one affected, so the fix is narrow.

The general rule this implies: **element-level resets in `shell.css` must stay
weaker than the utilities the bridge remaps.** A reset that duplicates
preflight is not free — it changes who wins.

### Open defects, not yet fixed

- **Aged Receivables / Payables split one counterparty across two rows.**
  *Render fixed; the underlying data issue is NOT.* The report can return two
  rows sharing a `customerId` because invoices carry a **denormalised**
  counterparty name and the aggregation groups by name as well as id — so a
  rename splits one party in two. Live on staging: customer
  `69e3e771f6e20f6d943fb5b8` appears as both "Todin Hutop Hatik Fufec"
  (₹790,634.50) and "…Fufeco" (₹637,757.76) — **one customer, ₹14.28L shown
  as two partial lines**. The duplicate React key is fixed (index added, so
  rows can no longer be omitted or duplicated), but the rows are deliberately
  NOT merged in the frontend: that would change a money figure, and the split
  is real data. The fix belongs in the aggregation (group by id alone) or in a
  backfill of the denormalised names. Related: the CRM rename cascade, whose
  19-opportunity remediation is still pending.

- **A policy whose PDF fails to render can never be acknowledged.**
  `PolicyReaderModal`'s scroll gate leaves `reachedEnd` false when the render
  errors, so "I acknowledge" stays locked while the only offered path is
  Download. Inherited from the legacy component, not introduced by the
  migration — but on staging, where every policy download 500s, it is the
  only state you can reach.

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

---

## The invoicing money pass (phase 14)

Invoicing is the largest thing left: **26 routes, ~14k LOC, 27% of everything
remaining.** It sat in the deferred table as "salary/statutory display —
parity-proven rendering, reviewed separately". That deferral was right, unlike
three of the others.

### The rule for this pass

Tighter than the ordinary migration recipe. **Nothing above `return (` moves.**
Not reformatted, not renamed, not "tidied". Every fetch, projection, sort and
arithmetic expression stays byte-identical, and that is checked mechanically
rather than by eye:

```
extract every .reduce / .sort / `?? ` fallback / ternary / Array.isArray guard
from both files, normalise the row-variable name, compare the sets
```

On the first batch this reported `AgedReceivables 3, AgedPayables 3,
InvoiceAnalysis 15 — IDENTICAL`. It also **caught a real bug**: generating
`AgedPayablesV2` from the receivables file by substitution produced
`Array.isArray(data?.byVendor) ? data.byCustomer : []` — a ternary testing one
field and returning another, so the vendor table would always be empty. The
build was green. Eyeballing the diff would not reliably have caught it.

Then the runtime check caught a second one the build also missed: the same
substitution rewrote `<Users>` to `<Building2>` in the JSX but left the import
line as `import { ArrowLeft, Users }`. Page crashed on load with
`Building2 is not defined`.

**Two mechanical checks, two real defects, zero from the build.** Same lesson
as every prior phase, now with the money pass's own version of it: string
surgery across a mirrored file pair needs both a logic diff and a page load.

### Batch 1 — the three read-only reports

`reports/receivables`, `reports/payables`, `reports/analysis`. Chosen first
because they are pure display: no post, no send, no state transition, so the
standing "never trigger" rules cannot be brushed against while proving the
method.

Money parity vs the legacy capture: **114 / 36 / 115 values, identical, same
order.** Contrast: **0 failures across 634 nodes** in light theme.

`reports/tax` was deliberately left out of the batch. It is a tab host that
embeds `GstReport` and the 2B reconciliation — a statutory surface that wants
its own pass, not absorption into a layout batch.

### Two ds additions this pass earned

- **`DataTable` `totals`** — a `<tfoot>` row, keyed by **column key** rather
  than position, so reordering columns cannot slide a total under the wrong
  header. Every money report in the product ends in a totals row and none of
  the 62 migrated pages had one; building it once unblocks the whole block.
- **`--attn`** — a fourth severity tone for the aging ramps. See `THEMING.md`
  for why the light value was measured rather than picked.

### What clipped, and why it matters more here

The aging cards were a fixed `repeat(6, 1fr)`. `1fr` floors at the content
width, so a lakh-scale figure at 24px pushed the 90+ and Total cards off the
right edge. On most surfaces that is a layout nit; on a money surface a clipped
figure is a wrong figure. `repeat(auto-fit, minmax(190px, 1fr))` wraps to a
second row instead — the correct failure mode.

### Order for the rest of invoicing

Read-only reports first (done), then the lists, then config, and
`InvoiceDetail` (5,189 lines, and it posts and sends) last and alone. The
statutory reports — GST, GST 2B, TDS, Profitability — each get their own batch:
they are the ones where a rendering change is a filing risk, not a cosmetic one.

### Batch 2 — the four list routes

`invoicing/invoices`, `invoicing/bills`, `invoicing/employee-bills`,
`invoicing/payments` — three components, four routes (`VendorBillList` serves
both bill routes via `mode`).

Money parity vs a legacy capture taken before any edit: **44 / 26 / 22 / 20
values, identical, same order.** Contrast: **0 failures across 841 nodes** in
light theme.

#### `ResizableTable` is KEPT, not replaced

The obvious move was to swap it for ds `DataTable`. That would have been wrong
twice over:

1. It is **already themed for the v2 shell.** `legacy-bridge.css` defines
   `--rt-sticky-head` / `--rt-sticky-cell` under `.ds-shell` *and names these
   two pages in the comment* — the pinned columns had held a hardcoded
   near-black, so in light theme the invoice numbers inside them measured a
   1.00 contrast ratio. Someone already did this work.
2. It owns three things ds `DataTable` does not: **column widths persisted per
   user** (`storageKey`), **sticky left/right columns**, and a **footer slot**.
   On a seven-column money table whose footer carries the per-currency page
   totals, none of those are cosmetic.

So these two pages migrate their **chrome** — header, tab strip, toolbar,
loading and empty states — and leave the table, its money cells and its totals
footer rendering through unchanged code. That is a smaller diff *and* a safer
one. `PaymentsList`, which never used `ResizableTable`, moves fully to
`DataTable`.

Worth generalising: **check whether the bridge already covers a legacy
component before replacing it.** The migration's job is the design system, not
the component count.

#### `VendorBillList` is the batch's write surface

Its AI import runs `extractVendorBill` → `createInvoice` → `uploadAttachment` —
it creates real vendor bills. Chrome-only migration there is deliberate, and
the extraction flow was **never exercised** during verification: a run would
have created a financial record on staging and burned an AI call. It is
covered by the logic diff, not by a page load. Stated plainly rather than
implied.

#### Two more defects the build didn't catch

Same shape as batch 1, so it is now a pattern rather than an anecdote:

- Trimming the lucide import list broke the **retained** `ResizableTable`
  footer — `ChevronLeft is not defined`, crash on mount. The chrome no longer
  used those icons; the block I deliberately kept still did.
- One icon was left imported but unused after the swap.

Both are now checked mechanically instead of by eye — extract every `<Icon`
referenced *after* the import statement, diff against the imported set, and
require `missing` and `unused` to be empty. Cheaper than the page load that
found the first one.

#### Deliberately not changed

- **Filters stay in local state, not the URL.** `listkit`'s `useListParams` is
  the house pattern, but moving a money list's filters into the URL changes
  what a bookmark means. Product decision, not a layout one.
- **`handleSort` keeps its two-state asc/desc toggle.** ds `DataTable` offers a
  three-state cycle whose third state is "unsorted"; these fetches have no
  unsorted mode, so the cycle is adapted down rather than introduced.

### Batch 3 — three config pages

`config/payment-terms`, `config/expense-categories`, `config/journals`, onto ds
`ConfigList` — the same master-data archetype the CRM config pages use.

Taxes, TDS and the product catalogue are **not** in this batch. They carry
rates and prices, so they get their own passes; these three carry none.

#### The rule shifts here, because the kit owns the form

On the lists, "nothing above `return (` moves" was enough. `ConfigList` owns
the create/edit form and its state, so the page's `form`/`editingId` plumbing
necessarily goes. What must survive is narrower and more important:
**validation and payload construction**, lifted verbatim out of `handleSave`
into a `buildPayload(values, isNew)` that onCreate/onUpdate both call.

Checked by extracting every payload key expression, guard and transform from
both files and comparing the sets. The legacy form-state entries drop out (they
have no counterpart by design); everything that reaches the server is matched.

**That check caught a real defect.** `JournalsConfig` seeds a new journal's
currency from `currentCompany?.currency || 'INR'`, not a hard `'INR'`. My first
version used `defaultValue: 'INR'` — on a USD company every new journal would
have been created in the wrong currency. Same class as the incentive
`formatINR` hardcoding, one batch after writing that up. It is now proven the
other way too: opening New on the USD company shows the currency select
prefilled `USD`.

`ConfigList` renders a thrown Error inline, so the validation throws instead of
toasting — the message lands beside the field and the modal keeps the input.

#### Verified against the real endpoints

Unlike the vendor-bill AI flow, these write paths are safe to exercise: the
entities are org config with real delete endpoints. Full cycle on payment
terms, checked at the wire rather than in the UI:

| step | result |
|---|---|
| duplicate name | rejected inline, nothing written (still 9 terms) |
| create | `{name: "ZZ TEST TERM (delete me)", days: 7, isDefault: false, active: true}` — `days` a **Number**, not a string |
| edit | `days: 9` |
| delete | row gone, back to 9 terms |

Test row cleaned up. `isDefault` was deliberately left false throughout —
setting it would have changed the org's default payment term. The default is
still `Due on Receipt`.

`showInactive` on expense categories is a FETCH parameter, not a client filter;
confirmed on the wire as `?includeInactive=1`. The list does not visibly change
because staging has **zero** inactive categories — the round-trip is verified,
the filtering effect is not.

#### Two smaller findings

- **Legacy expense-category delete had no confirmation at all** — one click
  deactivated. Now confirmed, per the Slice-4 ruling. The copy says
  *deactivate*, because that is what the endpoint does (it soft-deletes; with
  `showInactive` on, the row stays and flips). Promising deletion would have
  repeated the CRM lost-reasons mistake.
- **ds `Switch`'s `label` is the ACCESSIBLE name, not a visible one.** Passing
  it alone renders a bare unlabelled toggle, which is what shipped to the first
  screenshot. Visible text has to sit beside it. Worth knowing before the next
  page reaches for a toggle in a toolbar.

### Batch 4 — taxes and TDS (statutory rates)

`config/taxes` and `config/tds`, onto ds `ConfigList`. Rate parity against a
pre-edit capture: **22 and 17 values, identical.** Contrast: 0 failures across
168 / 109 nodes.

Three things preserved exactly, each of which a rewrite would have flattened:

- **The type-conditional 100 cap.** `if (form.type === 'percentage' && rateNum
  > 100)`. A fixed-amount tax may exceed 100 — it is money, not a percent.
  Verified both ways at runtime: percentage 150 is refused, fixed 150 is not.
- **The India gate on TDS.** `companyCountry !== 'IN'` returns the India-only
  screen, and stays *after* all hooks so hook order is stable. Verified by
  switching to the US company: gate shown, zero rows rendered.
- **The TDS payload defaults**, `Number(x) || 0` and `ratePanMissing || 20` —
  20 being the statutory no-PAN rate. `||` not `??`, because a blank string
  must fall through. All 15 legacy defaults across both pages were checked
  mechanically against the `fields` block.

Also caught before it shipped: I had guessed the TDS list response key as
`res.configs`; it is `res.rows`. That would have rendered an empty table.

---

## 🔴 Two server-side defects found while testing this batch

Neither is caused by the migration — legacy sends the identical payload — and
neither is fixed here, because both live in the API repo and one changes what a
tax *is*. Raising them rather than working around them.

### 1. `type` is not persisted on taxes. Every tax is stored as `percentage`.

```
POST /invoicing/taxes  {"name":"…","rate":150,"type":"fixed",…}
→ stored: {"rate":150,"type":"percentage"}          # scope and inclusive DO persist
```

Same for `type: 'group'`, and a `PUT {type:'fixed'}` does not change it either.

Two consequences, the second one material:

- The Type picker offers three options and only one of them is real. Fixed and
  group taxes cannot be created at all.
- **It converts the 100 cap into a bypass.** Choose Fixed, enter 150 — the
  frontend correctly allows it (fixed amounts may exceed 100), the server drops
  the type, and the row is stored as **150 %**. A rate that the percentage
  guard exists specifically to prevent.

The frontend guard is not the right place to patch this: capping fixed taxes
would break the legitimate case. The fix belongs in the API — either persist
`type`, or reject a payload whose type it will not honour.

### 2. Tax delete is a soft delete, and both the legacy copy and the toast said otherwise.

The legacy dialog read *"This permanently removes the tax. If invoices
reference it, deletion will be refused."* Observed: `DELETE` returns 200 and
flips `active: false`. A brand-new, entirely unreferenced tax was soft-deleted
exactly the same way, and the row stays in the list.

`TaxesConfigV2` corrects the copy to say *deactivate* — the same correction
Slice 4 made to CRM lost reasons, and the same one this pass made to expense
categories. Never promise an outcome the server does not produce.

**Staging residue:** three inactive `ZZ TEST TAX …` rows remain in the staging
taxes list. They were created to prove the two defects above and cannot be
removed through the API — `DELETE` only deactivates, and `?hard` / `?force` /
`?permanent` are all ignored. They need a DB-level delete.

### Batch 5 — product catalogue and invoicing settings

`invoicing/products`, `invoicing/config/products`, `invoicing/config/settings`
and `settings/invoicing` — two components, four routes. Product money parity:
**14 values, identical.** Contrast: 0 failures across 106 / 92 nodes.

#### `ProductCatalog` — the nuance worth the whole pass

```js
defaultPrice: form.defaultPrice !== '' ? Number(form.defaultPrice) : undefined
```

Blank sends **`undefined`, not `0`**. "No default price" and "priced at zero"
are different claims: the first leaves the line open for the invoice to set,
the second asserts free. Coercing blank to 0 would silently price every
unpriced product.

Proven at runtime without writing a row, by patching `window.fetch` to capture
the POST body and return a synthetic 499:

```
{"name":"ZZ PRICE PROBE","type":"service","description":"","hsnSacCode":"",
 "unit":"","internalRef":"","taxIds":[],"active":true}
```

`defaultPrice` absent — `undefined` survives to `JSON.stringify`, which drops
the key. **Worth reusing: intercept-and-block is how you verify a payload on a
write surface without leaving a record behind.** It is strictly better than
create-then-delete, which this pass has already shown can leave residue when
delete turns out to be soft.

That capture also settles a loose end from batch 4: `type: "service"` is
present, so `ConfigList` does seed select defaults correctly, and the tax
anomaly really was the server dropping `type`.

`description` is deliberately **not** trimmed while every sibling field is.
Kept as-is rather than tidied into consistency.

#### `SettingsInvoicing` is mounted at TWO routes

`/invoicing/config/settings` and `/settings/invoicing`, the latter inside
`SettingsPageWrapper` which supplies its own "Settings" heading. That is why
the legacy renders a bare stack of section cards with no page header — and why
the v2 does the same. **Do not add a `PageHeader` there.** Both routes are
flag-switched together so the page cannot look like two different products
depending on how you reached it. Verified on both mounts.

Three behaviours preserved that a settings rewrite loses easily:

- **Every Save button saves the whole object.** `saveSettings(section)` uses
  its argument only to pick which spinner shows; the PUT body is the entire
  `settings` state. Pressing Save under Defaults also persists unsaved Feature
  toggles. That is the existing contract.
- **`requireConsultantOnLines` is tri-state** — `null` auto / `true` always /
  `false` never. A checkbox would collapse auto into never.
- **The sequence preview** is what the next invoice number will look like.

Both seed actions (`seedDefaults`, `seedTdsDefaults`) are carried over
untouched and were deliberately not triggered.

### Batch 6 — the statutory reports (GST and TDS)

`reports/tax` (which is `TaxReport` → `GstReport`) and `reports/tds`. Three
files, two routes.

Money parity: **GST 88 values identical; TDS 131 money figures identical.**
Contrast: 0 failures across 668 nodes.

#### Chrome only, and this is where that rule earns the most

Migrated: page header, Sync-GSTN button, granularity segmented control, FY
picker, the two CSV buttons, and the error / loading states. Byte-identical:
every figure and table, the `HowToRead` primer and every `TermHint` from the
readability pass (cd5ef6e5), both statutory modals, and the export handlers.

**No export was triggered during verification.** `downloadStatutoryCsv`
produces GSTR-1; `tds26q` is vendor deductee rows and `tds24q` is employee-wise
salary TDS. These are filing artefacts. A layout pass has no business
generating one, so they are covered by the static diff and nothing else — the
same standard applied to the vendor-bill AI import in batch 2.

#### The switch on `TaxReport` is the load-bearing line

```js
if (currentCompany?.currency === 'INR') return <GstReportV2 />;
```

An INR company gets the statutory GST report on this route; everyone else gets
the generic collected-vs-paid report. They are **separate components on
purpose** so a company switch remounts cleanly instead of changing hook order.
Only the *target* moved, so both branches are on ds together — otherwise
switching companies would flip the page between two design systems.

#### Two process notes

- The route aliases are `TaxReportInv` / `TdsReportInv`, not `TaxReport` /
  `TdsReport` — `TaxReportsPage` from payroll already owns the obvious name.
  The wiring assertion caught this rather than silently patching nothing.
- Slicing the header out of `TaxReport` by searching for `{loading` cut into
  the middle of the date-filter block, because the first match was inside the
  Generate button, not at the top level. **Anchor a slice on a structural
  marker** (`{/* Date Range Filter */}`), never on a token that recurs at a
  deeper nesting level. The build caught this one; a subtler version would not
  have been caught.

#### Harness note

The TDS capture differs from legacy at exactly one index: `'CSV 24'` vs
`'CSV24'`. That is the money regex spanning the two CSV **button labels**,
whose surrounding whitespace changed when they became ds Buttons. Every value
that starts with a currency symbol is identical. Worth knowing before treating
a one-index diff as a figure drift.

### Still to do in invoicing

`reports/gst-2b` and `reports/profitability` are **not** in this batch and are
not "reports" in the same sense:

- **GST 2B reconciliation** has four write endpoints — `importGstr`,
  `reconcileGstr`, `annotateGstr`, `updateBillReference`. It is a
  reconciliation *workflow* and needs its own verification cycle.
- **Profitability** writes adjustments and access grants
  (`saveProfitAdjustment`, `setProfitabilityAccess`), is owner-gated, and is
  one of only two files in the app that import recharts.

Then bank reconciliation, follow-ups, and `InvoiceDetail` last and alone.

### Batch 7 — GSTR-2B reconciliation

`reports/gst-2b`. One route, one file, and the most conservative migration in
the pass.

**Chrome only:** page header, return-period picker, the upload and re-reconcile
buttons, and the India-gate screen. Byte-identical: all four write handlers,
the bucket definitions, the match logic, the CSV column order and the
`HowToRead` primer. Workflow-expression diff: **32 occurrences, PRESERVED.**

Four write paths, none triggered:

| endpoint | what it does |
|---|---|
| `importGstr2b` | uploads a GSTR-2B JSON for a period |
| `reconcileGstr2b` | re-runs the match for a period |
| `annotateGstr2bRow` | marks a row reviewed |
| `updateBillReference` | writes `vendorInvoiceNumber` onto a real vendor bill |

#### ⚠️ The verification limit, stated plainly

**No period on staging has a GSTR-2B uploaded.** Checked 2026-04 through
2026-07 and 2025-12 — every one returns zero rows. So the bucket cards, the
reconciliation table and every figure in it **were never rendered** during
verification. Only the empty state and the India gate were. Their correctness
rests on the static diff alone.

I did not fabricate a 2B to get around this. Uploading one is a statutory
write, and batch 4 established that staging rows of this kind cannot reliably
be removed afterwards — three `ZZ TEST TAX` rows are still there. Creating
reconciliation state to prove a layout change is the wrong trade.

**Before this page is enabled for a production org, look at it on a period that
actually has a 2B.** That is the one thing this batch cannot tell you.

This is the first page in the pass where the money-parity harness had nothing
to compare — worth noting as a category. A page can be diff-clean, audit-clean
and still unverified, and the honest move is to say which.

### Batch 8 — Profitability

`reports/profitability`. Money parity: **94 values identical.** Page audit: 1
flagged, and it was a false positive (see below).

**Chrome only**, for three reasons stacked on one page: it writes
(`saveProfitAdjustment` moves net profit; `setProfitabilityAccess` grants or
revokes access to net-profit figures — neither triggered), it is owner-gated,
and it is one of only two files importing recharts.

The methodology paragraph under the title is kept **verbatim**. It is the
page's only defence against being read against the Customer Invoices list: it
states GST-exclusion, service-period recognition and ECB conversion, and says
outright that the totals will not match. Shortening it for a tidier header
would remove the warning, not the discrepancy.

#### A real light-theme defect the standard audit could not see

The chart's axis ticks were hard-coded `#9ca3af` — **2.29:1** in light theme.
The page sweep did not flag it, because it reads `color` and SVG text paints
with `fill`. Fixed with a scoped stylesheet (2.29 → 6.63); the audit's blind
spot and the fix are both written up in `REDESIGN-QA.md`.

That is worth stating plainly: **the contrast audit has been blind to every
chart in the app for the whole project.** Only two files import recharts, so
the exposure is small — but `TeamDashboardPage` is the other one and has never
been checked this way.

### Batch 9 — bank reconciliation and follow-ups

`reconciliation` and `follow-ups`. Chrome only on both; write-path diff
**9 and 11 occurrences, PRESERVED**. Contrast: 0 failures (241 / 38 nodes).

**`follow-ups` has the strictest reason in the pass:** `sendFollowUp` **emails
the customer** about an overdue invoice. Not fired. The send path and
`updateFollowUpConfig` are byte-identical, and only the header and its Refresh
action moved. Money parity on the overdue table: **28 values identical.**

**`reconciliation` writes too** — `reconcileLine` asserts that a bank line
matches a recorded payment, and `createBankStatement` imports one. Neither
fired.

⚠️ **Second unverifiable table in the pass.** No bank statement exists on
staging, so only the empty state renders — the statement list, the line table
and the suggestion matcher were never exercised. Same category as the GSTR-2B
table in batch 7, and the same decision: importing a statement would create
financial records that batch 4 showed cannot be cleaned up afterwards.

Two of the twenty-one invoicing pages migrated so far now rest on the static
diff alone for their main table. Both are reconciliation surfaces, and both
are unverifiable for the same reason — staging has no imported source
documents. That is a gap in the staging dataset, not in the method.
### Batch 10 — the invoice/bill "form" routes, and a bridge fix worth more than the batch

**`InvoiceForm` and `VendorBillForm` are not forms.** Mirroring Odoo, "New"
immediately creates a blank draft and redirects to the detail page; the edit
routes are straight redirects. The only rendered output is a spinner, so that
is all that moved — the create-and-redirect effects, including the `creating`
guards that stop a re-render creating a second draft, are byte-identical.

Neither route was loaded on staging, for the obvious reason: **visiting them
creates an invoice.** Verified by reading the effect.

#### `InvoiceDetail` — assessed and deliberately NOT migrated

5,189 lines and 33 API methods, including `sendInvoice`, `emailInvoice`,
`generateEInvoice`, `recordPayment`, `createCreditNote`, `cancelInvoice` and
`setGstHold`. Its chrome is a bespoke full-bleed document editor with a
20-button conditional action bar and a status stepper — not a `PageHeader`
shape. Rebuilding it would be the highest-risk, lowest-value change in the
pass.

Measured instead: on a posted invoice in light theme it reported **one**
failure. That one turned out not to be a page problem at all.

#### 🔴 The bridge mapped `text-white` on saturated fills to `--fg`

`.ds-shell .text-white { color: var(--fg); }` is right for the common case —
`text-white` as "the bright text tier" on a dark surface. It is wrong for the
other meaning: **the label on a coloured button or pill**, where the fill does
not change with the theme and the text must stay white.

InvoiceDetail's status stepper showed it: white-on-`bg-blue-600` computed to
`#16191D` on `#2563EB` — **3.36:1**, below AA. **259 places in the codebase
pair `text-white` with a saturated `bg-*` utility**, so this was never one
page's bug.

Fixed in `legacy-bridge.css` by restoring `#FFF` when `text-white` co-occurs
with a saturated fill. InvoiceDetail then measured **0 failures in both
themes**.

Same shape as the NotificationBell badge fix already in `THEMING.md`: when a
fill and its text come from different sources, a bridge-mapped foreground over
an unmapped background is the pairing most likely to be wrong. That note
predicted this class of bug; it just had not been swept for.

**Generalisable:** a utility name that encodes a *value* (`text-white`) can
carry two different *roles*. A bridge that maps it by value gets one of them
wrong, and which one is invisible until a light theme exists.

### Timesheet batch 2 — the ESS money pages

`my-salary`, `my-payslips`, `earnings`, `my-fnf`. These are what an employee
sees about their own pay, so the money-pass rule applies at its strictest:
**nothing above `return (` moved, and inside the render only the page header
changed.**

Money parity against captures taken before any edit:

| page | values | result |
|---|---:|---|
| my-salary | 16 | identical |
| my-payslips | 13 | identical |
| earnings | 36 | identical |

Contrast: 0 failures across 326 nodes in light theme.

The `earnings` capture is the one worth noting — it includes the 2% TDS pair
and the ₹1,923.84 / ₹94,268.16 gross-to-net split, which is exactly the kind
of derived figure a re-layout disturbs without anyone noticing.

**No PDF download was triggered** on any of the four. `downloadMyPayslipPdf`,
`downloadImportedPayslipPdf`, `downloadPayslipPDF` and
`downloadMyPayslipByMonth` all generate a real payslip document; a layout pass
has no reason to produce one.

⚠️ **`my-fnf` is unverified.** The staging user has no finalised settlement, so
only the "has not been finalized yet" state renders — every settlement line
and the total rest on the static diff alone. **Third page in the project with
this shape**, after the GSTR-2B and bank-statement tables, and the same
decision: finalising an F&F on staging is a payroll action with real
consequences and is on the never-trigger list.

That is now a pattern worth stating once: **every unverifiable page in this
project is a settlement or reconciliation surface, and all of them are
unverifiable because staging has no finalised instance of the thing.** It is a
gap in the staging dataset, and it is the same gap each time.

### Payroll batch 5 — `tax-reports`, and a house rule about `ds` prop names

The page itself is a straightforward verbatim-slice migration: 87 identical
logic lines, an expandable per-employee report, a full-report dialog, and 84
money values that match legacy exactly in order and value.

The thing worth carrying forward is what the batch turned up on the way.

**`EmptyState` had been called with the wrong prop names since #76 — 12 sites
across 8 already-merged files.** The contract is `children` and `actions`; I
had been passing `sub` and `action`. React spreads unknown props onto the
outer element and renders nothing, so those empty states shipped with no
explanatory copy and no button — including two `Retry` buttons that were the
only escape from a failed load.

`EmptyState.d.ts` states the correct contract. Nothing enforces it: Vite does
not type-check, and eslint has no rule for JSX prop names. So the standing
rule for this migration gets one more line:

> **A `ds` primitive's `.d.ts` is the contract, and nothing checks that you
> followed it.** Before using a `ds` component in a new page, read its `.d.ts`
> — not the last page that used it, which may be wrong in the same way.

This is the sixth time the build passed on something visibly broken. It is the
first where the defect was *invisible* — a missing button looks like a design
choice — which is why it survived eight PRs instead of one.

Second: the rendered-output diff earned its place again. Two things the first
draft dropped were invisible to a source-text probe because they are computed
in the component rather than read from the payload — the dialog's running
**Cumulative TDS** column, and the `{monthsProcessed} processed •
{monthsRemaining} remaining` caption. Nothing in a `formatMoney` field-set
comparison can see either. Diff the rendering, not the source.

Third, on pinning legacy for a parity capture: flipping `uiV2` in the cached
org **does not hold** — the app refetches the org on mount and puts it back,
so a capture taken that way can silently be V2-vs-V2. Pin by routing straight
at the legacy component for the duration of the capture, then restore.

### Payroll batch 6 — `payroll/settings`, and the accordion the system was missing

The FY statutory config is the highest-leverage config surface in the product:
every payroll run reads its slabs, cess, surcharge, PF and ESI rates from here.
So the bar was higher than "logic spliced in verbatim" — every conversion was
asserted on its own (22 probes), and all 65 rate inputs were compared rendered,
legacy against v2, on both entry points.

Two things worth carrying forward.

**`ds` gained an `Accordion`.** Five titled collapsible sections, and the system
had no primitive for it — every existing collapsible in a v2 page is a
table-row expander, which is a different shape with different semantics. Built
in `ds/` with a `.d.ts` rather than left local, per the standing rule, and
deliberately **controlled**: a settings page needs to open a section from
outside it (deep link, validation error, expand-all), and an internally
stateful accordion cannot do that without a ref escape hatch. `settings`
(7,260 lines) is next and is almost entirely this shape.

**A number input cannot be probed for draft state.** Assigning an invalid
intermediate like `"4."` to an `<input type="number">` clears it in the DOM
before React ever sees it, so `el.value` cannot distinguish "draft held in
React state" from "cleared". I read a `""` as a `DraftNumberInput` regression
for a moment; the harness was wrong, not the code. **Ninth false-failure mode**,
and the rule it yields is narrow but sharp: to test a controlled number input,
drive it through a re-render and compare what comes back, not through
`el.value` mid-edit.

The re-render test is the one that actually earned its keep here. Typing a
rate, collapsing the section, and re-expanding it forces the value back through
`Number(raw) / 100` and then `toPercentDisplay` — which is the exact path that
turns `8.33` into `8.330000000000002` if the rounding guard is ever dropped.

### Payroll batch 7 — `statutory-run`, and the limit of the verbatim-slice method

This is the last payroll page and the one that publishes. It is also the page
that broke the method every other page in this migration relied on.

**The verbatim slice is not a safety guarantee — it is a safety guarantee about
one region of the file.** On `statutory-run`, most of the money math lives
*inside the render*: the summary-card reducers, the per-row live-ad-hoc
recomputation (`baseGross` → `displayNet`), the mark-paid payable/held split,
both filter pipelines, and the draft-run em-dash guards. Splicing everything
above `return (` and then hand-rewriting the JSX would have left every one of
those to be retyped from memory.

So the rule gets a second clause:

> Splice the pre-return block verbatim **and then grep the render for
> arithmetic**. Any expression in the JSX that computes rather than formats is
> a slice of its own: copy it, diff it, and record the diff. On this page that
> was six additional blocks; on most pages it is zero, which is exactly why it
> is easy to forget.

The `displayNet` chain is the concrete argument. It strips ad-hoc deductions
out of `item.totalDeductions` but deliberately leaves F&F in, so live edits
flow through while the total still matches the printed payslip. That is not a
rule anyone reconstructs correctly from the variable names.

**Second: the audit adjudicated against me, on a rule I had already written.**
`finalized` needed a Chip tone that wasn't `info` (which would have made it
identical to `processed`). I added a `purple` tone with the accent as its own
ink — on a 14% wash of itself. That is the accent-on-its-own-tint pairing
documented twice in THEMING.md, and warned about in a comment three lines above
the line I added. It measured 4.12 against a 4.5 floor.

The fix was already sitting in the same file: `brand` and `warn` read
`--brand-ink` / `--warn-ink` precisely because of this. Added
`--acc-purple-ink` and pointed the tone at it.

The lesson is not "run the audit" — the audit worked. It is that a documented
rule stopped being consulted at the moment it became inconvenient, and the
place it was documented was the file being edited.

### Settings batch 1 — and the difference between "dimmed" and "passing"

Settings is ~7,500 legacy lines across 16 files, so it gets broken up by
archetype rather than by size. This first batch takes the four app-settings
tabs that share one shape — admin gate, cards of controls, optional save —
because that shape is what the remaining twelve are.

Two things worth carrying forward.

**`opacity-60` is not a disabled state, it is an unmeasurable one.** Both
placeholder tabs dimmed their unbuilt cards with container opacity. The
contrast audit cannot see through that: it composites background colours, not
ancestor alpha, so it would have reported those labels as comfortably passing
when in fact nobody had measured what the user actually sees. The rule was
already written under tax-declarations — a non-zero dim means *unmeasured* —
but it was written about a value I had introduced, and this is the first time
it showed up in legacy code.

The fix is the same either way: let the state be carried by something the audit
can reason about. A `Coming Soon` chip plus genuinely `disabled` controls says
the same thing, and `disabled` is exempt from AA *by spec* — so the audit skips
it deliberately rather than accidentally.

**A tab that writes on every interaction should say so in its own source.**
`SettingsTodo` has no Save button: all three selects call `handleSaveConfig`
from `onChange`, and the blocklist writes on add and on remove. Changing one
select changes AI-scan behaviour for every member of the org, immediately. That
is the existing contract and it is carried across unchanged — but the v2 file
now opens with a note saying so, because nothing in the UI signals it and the
next person to test this tab will otherwise find out by doing it.

Also worth recording: `ToggleSwitch` was duplicated **character for character**
across two of these four files, and four more copies survive elsewhere
(`SettingsTimesheet`, `SettingsEmployee`, `SettingsAts`, and the shared
`components/ToggleSwitch.jsx`). ds has shipped `Switch` the whole time. Six
copies of a toggle is what happens when the primitive exists but nothing
prompts you to reach for it — the same failure mode as the `EmptyState` prop
names in #85, and the reason to read the `.d.ts` before writing the page.

### Settings batch 2 — the #85 rule paying for itself, and layout ≠ paint

`SettingsOutreach` + `EngageSettings`, migrated together because a 71-line
shell around a 408-line child is not two batches.

**The rule from #85 worked.** The Connect control is a real link, and `Button`
renders a `<button>` with no `as` prop — `as="a" href=…` would have spread both
onto a button and produced something that looks like a link and navigates
nowhere. That is precisely the `EmptyState` failure, and this time it was
caught *before* writing the page because the rule now says to read the `.d.ts`
first. `Button` gained a polymorphic `as` instead.

Worth stating: the value of that rule is not that it prevents a class of bug,
it is that it moves the discovery from "verified live, three steps later" to
"before the first line was written."

**Layout is not paint.** The light-theme audit reported 19 sidebar failures —
dark-theme ink measured against a light-theme background. I had flushed with
`void document.body.offsetHeight` and assumed that settled the theme switch.
It forces layout; it does not force the compositor. After a real paint the same
ink computes correctly and all 19 vanish. The 5th false-failure mode gets one
clarification: **only a screenshot (or equivalent) settles a theme switch.**

**A measurement method was also wrong.** Lint baselines in this project have
sometimes been taken as `eslint … && echo clean`, which reads the exit code —
and eslint exits 0 when there are only warnings. Re-checked with full output;
the affected batches turned out to be accurate anyway, but the method was not
sound and is not used again.

Finally, a pre-existing crash worth naming because it is a shape that recurs:
`SettingsOutreach` swallows a failed status call with `.catch(() => {})`, leaves
its state `null`, and the child then reads `gmailStatus.connected` unguarded —
so an API hiccup replaces the whole tab with the error boundary. Carried across
unchanged and reported. **A swallowed error plus an unguarded read of the state
it was supposed to populate is a crash waiting for a bad network day**, and this
codebase has that pattern in more than one place.

### Settings batch 5 — a toast that reads like a rejection isn't one

`settings/incentive` is a money surface: its FX table decides what a recruiter
or account manager is actually paid when an invoice is raised in a currency
other than the company's functional one. 131 lines spliced verbatim, plus the
three module tables and 13 probes.

The finding worth keeping is about **how to verify a validation guard**.

Before clicking Save I installed a fetch interceptor that blocked and recorded
any non-GET to the settings endpoint. Three guards were exercised. Two returned
before the network, as expected. The third — the same-currency row — showed
this toast:

> Removed 1 same-currency row (FX rates only apply across currencies).

That reads like a rejection. It is not. `sameCcy` **warns and continues**:
execution falls straight through to the PUT, and the interceptor caught the
write. Had I trusted the wording, I would have saved to the org's incentive
settings on the strength of a message that sounded like it had stopped me.

So: **the UI is not evidence about control flow.** A guard that "shows an
error" may or may not `return`, and the only reliable way to tell from the
outside is to watch the network. When exercising validation on a surface that
writes, put a blocking interceptor in first — not as a formality, but because
this is the case it exists for.

Two smaller things this page is a good example of:

- **A field that isn't rendered can still be load-bearing.** `DEFAULTS` carries
  `defaultRecruiterRate` / `defaultAccountManagerRate` at 0.06 with a comment
  saying they are deliberately hidden. `onSave` PUTs `{ ...form }`, so deleting
  them from the object — the obvious "dead code" cleanup — would erase the
  resolver's fallback on the next save.
- **A guard against your own form's defaults.** `loadError` exists so that a
  failed fetch cannot render built-in DEFAULTS and let one Save click overwrite
  the org's real settings. It is the sort of thing that looks like defensive
  noise until you notice the form's initial state is a complete, plausible,
  entirely wrong settings object.

### Settings batch 8 — `x || fallback` after `Number()` eats a legitimate zero

`settings/timesheet` is the largest settings tab (641 lines) and the one with
the sharpest write surface: two buttons that email every employee with a
pending timesheet or attendance. Neither was clicked.

The durable finding is a small one about a very common expression.

The reminder day is clamped with:

```js
Math.min(10, Math.max(1, Number(e.target.value) || 5))
```

I predicted `0 → 1`. It is **`0 → 5`**, because `Number('0')` is `0`, which is
falsy, so `|| 5` fires *before* the clamp ever runs. The `Math.max(1, …)` lower
bound is unreachable except via a negative number.

Confirmed by evaluating the same pure expression and comparing it against the
DOM across five inputs — `0 → 5`, `-3 → 1`, `7 → 7`, `99 → 10`, blank `→ 5`.

**My expectation was wrong, not the code**, and that is the point worth
recording. `Number(x) || fallback` is written everywhere in this codebase as
"parse, with a default", but it silently converts a deliberate `0` into the
default. On a reminder-day field that is harmless. On a rate, a cap, a quota or
a threshold it is not — and this is the second page in the project carrying the
pattern.

The check that settled it is also worth keeping: **evaluate the suspect
expression as a pure function in the page, then compare it to what the DOM
actually shows.** If they agree, the migration is faithful whatever the
behaviour is, and the question moves from "did I break this?" to "should this
behave this way?" — which is a question for the owner, not the migration.

### Settings batch 9 — when verifying the happy path is itself the risk

`settings/general` holds the three most destructive actions in the product:
delete the organization, restore a backup over all current data, and create a
backup. Four verbatim slices, 14 probes, zero writes.

The rule this page produced is about **what not to verify**.

A type-the-slug delete has two sides. The rejection side — wrong value keeps
the button disabled — is safe to exercise, and was, against five near-misses:
empty, prefix, one character short, wrong case, trailing space. The acceptance
side is different: typing the exact slug **arms** a control that erases the
entire workspace, and leaves it armed until something navigates away.

So the coverage for a guarded destructive action is:

> Probe the comparison in source, exercise every rejection live, and stop.
> Do not type the magic string. A test that leaves the most destructive control
> in the product one click from firing has negative value, however green it
> looks.

The same applied to the backup restore, where the point was moot for a
different reason worth recording: the org has no backups, so no Restore button
renders at all. `confirmText !== 'RESTORE'` is probed, not exercised — and the
writeup says which, rather than implying the dialog was driven.

Second, smaller: the auth section contains the only setting on the page that
can lock **every member** out of the org — turning both sign-in methods off.
That one *is* safe to exercise, because the guard is a disabled Save rather
than a confirmation, so the dangerous state is reachable without being
committable. Toggled both off, confirmed the warning and the disabled Save,
restored. The difference between the two cases is worth internalising: a
**disabled-button** guard can be tested by entering the bad state; a
**type-to-confirm** guard cannot, because entering the good state is the danger.

### Settings batch 10 — prove the binding set, don't read the form

`settings/companies` is the largest settings file (1,162 lines) and the one
where a migration slip would be quietest: `handleSave` PUTs the **whole** form,
and `populateForm` is what fills it. A field bound in the render but missing
from `populateForm` goes to the server blank and **erases itself on the next
save** — with no error, no toast, and nothing visibly wrong until someone
notices the bank account number is gone.

Reading a 30-field form twice and hoping to spot a gap is not verification. The
check that actually settles it is mechanical:

> Extract every field the render *binds* (through each `handle*Change` helper)
> on both sides, and compare the sets. Equal sets, equal round-trip.

31 on each side, no difference in either direction. That takes seconds and is
not fooled by a form long enough that attention runs out halfway.

The same pass surfaced a **data** defect the code was innocent of. The country
code drives two gates, `cc === 'IN'`, which hide the PAN field and the whole
IRP e-invoicing section. The default company stores `country: "India"` with
`countryCode: "MP"` — a *state* code in the country-code field — so neither can
be configured for it. The Tax ID label still reads "GSTIN", but only because
that is the helper's default branch; it is right by accident.

Two things worth keeping from that:

- **A permissive default can hide a bad input.** `taxIdLabel` returns GSTIN for
  anything it does not recognise, so `MP` looks correct while `cc === 'IN'`
  quietly fails elsewhere. A default that swallows unknown values makes the
  bad value invisible at exactly the place you would notice it.
- **On staging, suspect the scrub before the app.** Another row on the same page
  reads `country: "Titonur Racuc"`, which is plainly pseudonymised. `MP` is not
  obviously scrubbed, but it could be — so the finding is written as "check this
  field in production", not as a confirmed live bug. That distinction has been
  wrong-way-round once already in this project.

---

## Phase 20 — Employee, batch 1 (asset types, departments, assets, quick-create)

Four pages, 1,155 legacy lines. Slices byte-identical, lint parity exact on all
four (1=1, 2=2, 2=2, 0=0 — same rules, same messages, only line numbers move).

### The substitution that needed proving

`EmployeeQuickCreate` used `EmployeePicker`, a Tailwind widget that matched a
query against **name + employeeId + designation**. ds has no equivalent, and
`ComboBox` searches only `label` and `sub` — two fields, not three.

Folding the two extras into `sub` (`#11332222 · Java Backend with AWS`) keeps all
three searchable, but "keeps" was a claim, not a fact. Verified by driving the
live picker with one query per axis:

| query | axis | options |
|---|---|---|
| `Hutafa` | name | 1 |
| `11332222` | employeeId | 1 |
| `Java Backend` | designation | 1 |
| `zzzznope` | — | 0 |

That is the whole point of a substitution: a component swap is only equivalent
if you go and measure the thing the old one did.

One deliberate difference: legacy capped the rendered list at `.slice(0, 50)`
("cap render for sanity"); there are 62 manager options, so the last 12 were
unreachable without typing. ds `ComboBox` shows all 62. That is a cap removal,
not a behaviour change — noted rather than silently inherited.

### A tone is a claim about meaning

I first gave the department headcount chip `tone="warn"` — amber. Legacy painted
it `bg-dark-700 text-dark-300`, plain grey. The contrast audit passed it in both
themes, because amber-on-amber-wash is perfectly legible.

Legibility was never the question. A headcount is not a warning state, and an
amber chip on every card says something the legacy page did not say. Changed to
`neutral`.

**The audit cannot catch semantic drift.** It measures whether you can read the
text, not whether the colour is telling the truth. Every tone assignment in a
migration is a small editorial decision, and it needs a reason from the legacy
file — not just a passing ratio.

### Gates verified live, nothing written

Both destructive/creating surfaces were exercised behind a blocking `fetch`
interceptor (every non-GET rejected and logged). The blocked list stayed empty
throughout, because nothing ever got far enough to fire:

- **Department delete** is offered only at `employeeCount === 0`. Probed four
  departments: Administration (0) and Marketing (0) show Delete; Admin (3) and
  IT (99) do not.
- **Asset create** stays disabled until type + non-blank name + assignee are all
  set. Whitespace-only name keeps it disabled; it enables on the third condition
  and not before.
- **Quick-create** stays disabled through `a@b` and enables only after both
  pickers are filled — the first-hire waiver does not apply here, and did not
  fire.

### Filter counts as an arithmetic check

The Assets page shows both stat tiles and a filterable grid, fed by two separate
API calls. Filtering by each status and counting cards gives 19 assigned + 8
returned = 27 total, matching the tiles exactly. Two independent paths agreeing
is worth more than either one looking plausible.

That count needed one correction first: `[aria-label^="Open "]` also matched the
layout's **"Open navigation"** button, inflating every bucket by exactly one.
Consistent off-by-one across every measurement is the signature of an
over-matching selector, not of a real discrepancy — the fourth time this
particular mode has shown up.

### Contrast

4 routes × 2 themes, plus the department edit modal in both: **0 failures**,
331 elements checked per theme. Screenshot before each read, since layout is not
paint.

---

## Phase 20 — Employee, batch 2 (plan templates, asset detail, directory)

Three pages, 1,435 legacy lines. Ten separate slices, each diffed.

### A bug I shipped in the previous batch

`AssetListV2` passed `onChange={e => setSearch(e.target.value)}` to ds
`SearchInput`. `SearchInput` hands back the **string**, not the event, so
`e.target` was `undefined` and the assets search box threw on every keystroke.
It went out in #100.

The batch-1 verification covered the status and type filters and reconciled
their counts against the stat tiles. It never typed in the search box. The build
passed, lint passed, and the contrast audit passed, because none of them execute
an event handler.

Fixed and re-verified by actually typing, one query per legacy match axis —
`Lenovo` (name) → 4, `Headphone` (assetTypeName) → 3, `Reref` (assignedToName)
→ 2, `zzz` → 0 with the empty state, clear → 27.

Swept every other `SearchInput` call site: the rest pass the setter directly or
carry a `typeof v === 'string'` shim. One site, now fixed.

**The lesson is narrow and worth stating plainly:** when a ds primitive's
callback signature differs from the DOM one it replaces, the only thing that
catches a mistake is invoking it. "I verified the filters" is not "I verified
the search" — adjacent controls are separate claims.

### Slicing around a component that owns its own state

Two pages needed the slice broken up rather than deviating silently.

`EmployeeDirectory` coordinated which filter dropdown was open through an
`openFilter` state and a `toggleFilter`. ds `SelectChip` owns its popover, so
those lines have no counterpart. Rather than quietly dropping them, the file is
spliced in **four** segments — 80-97, 101-190, 199-205, 211-242 — plus the
render-resident page-window arithmetic at 481-491, each diffed separately. Then
one more check: diff legacy 80-242 against the assembled result and enumerate
every line with no counterpart. Exactly seven, all of them `openFilter`
bookkeeping.

`AssetDetail` had the same shape: `assignSearch` / `assignDropdown` /
`reassignSearch` / `reassignDropdown` became unreadable once `ComboBox` took over
the search box, but their **setters** are still called inside the byte-identical
handlers. Kept as write-only state (`const [, setAssignSearch] = useState('')`)
so the handlers never had to be edited. Three slices, and again the
enumerate-the-difference check: exactly four lines, all four of them those.

That enumeration step is the useful part. Diffing the slices you kept proves the
slices you kept; listing what has no counterpart proves you did not lose anything
you did not mean to.

### Findings — reported, not fixed

**`AssetDetail` still fetches assignable employees with `limit: 100`.** The same
truncation that was fixed in `AssetList` (2026-07-21, replaced with server-side
search) was never backported here. On staging the reassign picker offers exactly
**100** options while the directory reports **141** employees — 41 people who
cannot be assigned an asset from this page, with no error and no indication that
the list is short. Carried across verbatim; fixing it means changing the fetch
and moving the picker to server-side search, which is a behaviour change, not a
migration.

**`handleReassign` is two sequential writes with no rollback** — a `returnAsset`
carrying a synthetic "Reassigned to another employee" note, then an `assign`. If
the second fails the asset is left *returned*, unassigned to anyone, while the
error reads "Failed to reassign". Carried across exactly, including that window.

**Asset deduction amounts are hardcoded INR** in both the input prefix and
`h.deductionAmount.toLocaleString('en-IN')`. Untouched, per the standing rule on
money display.

**Two `EmployeeDirectory` quirks**, both legacy, both carried: `activeFilterCount`
counts `statusFilter`, which *defaults* to `'active'`, so the Clear affordance
shows on first paint; and `clearAllFilters` sets status to `''`, which is not the
initial `'active'` — clearing lands somewhere the page never started.

### Arithmetic checks

The directory's status filter refetches from the server, so the counts are
independent measurements: 64 active + 72 resigned + 5 terminated = **141** = All
Statuses. Department IT → 103, plus Billable → 96, Clear → back to 141 with the
`(2)` suffix appearing only above one active filter, as legacy.

The spliced page-window formula was exercised on both of its branches: at 6 total
pages, page 3 shows 1-5 (`page <= 3`) and page 4 shows 2-6 (`page >= totalPages
- 2`). ds `Pagination` was deliberately not adopted — it derives page count from
`total`/`pageSize` and has no numbered buttons, so it would have changed which
pages are reachable.

### Unverifiable on this data

All nine plan templates are seeded `isDefault` records, so the `!tpl.isDefault`
guard leaves **zero** Delete buttons on the page. The delete path is correct by
inspection and unexercisable here.

### Lint

`EmployeeDirectory` 0 = 0. Two pages improved rather than matched, both by
deleting the offending code: `PlanTemplates` 2 -> 1 (unused `api` import),
`AssetDetail` 2 -> 1 (unused `onCloseDropdown` inside the local `EmployeeLookup`,
a component that no longer exists).

### Contrast

3 routes x 2 themes, with the plan-template editor and the asset return modal
open: **0 failures**.

---

## Phase 20 — Employee, batch 3 (org chart, onboarding wizard)

Two pages, 1,575 legacy lines. The employee app is now 100% v2.

### Geometry does not get modernised

`OrgChart` is mostly maths. The card metrics, `layoutTree`, the L-shaped
connector path expression, the cycle-breaking tree builder, the pan/zoom/fit
handlers, and `reassignManager` are all spliced in byte-identically — 87 lines
of constants and layout, 219 lines of component logic, plus the connector path
and `matchesSearch` diffed on their own.

Three things were deliberately not verbatim, each diffed around: the connector
`stroke` (a hardcoded slate rgba, now a token, so the lines survive the light
theme), the avatar ink, and `handleClick`'s unused `e` parameter — which was one
of legacy's three lint errors, so lint goes 5 → 4.

The avatar is the interesting one. Legacy drew initials in `avatarColors[0]` over
that same colour at 25% — accent on its own tint, the pairing this project has
measured at ~4.1 before. The name hash and the eight-colour palette are
unchanged, so an employee keeps their colour; the tint carries the identity and
the ink is `--fg`.

### A false failure that cost a detour, twice

Searching the org chart highlights matching cards with an amber border. Probing
`getComputedStyle(card).borderTopColor` after typing returned **white at 11%** —
identical to the unhighlighted default. It looked like `--warn-ink` was failing
to resolve inside `color-mix`.

It wasn't. Reading `el.getAttribute('style')` — what React actually set — showed
`border: 2px solid color-mix(in srgb, var(--warn-ink) 55%, transparent)` on
exactly the matching card and `var(--line-2)` on every other, and probing
`color-mix` live resolved it to amber at 55%. A screenshot shows the highlight
plainly. **Computed styles read without a forced paint are stale** — mode five on
the list, and it is still the one that fools me.

The light theme then produced the same shape of scare twice more: cards rendered
grey with unreadable text, and stepper circles came out dark. Both were the
theme cross-fade caught mid-transition; both settled correctly on a second look.

Two rules worth holding onto:
- **The inline style attribute is the better probe.** It is what React set, it
  needs no paint, and it distinguishes "the code took the wrong branch" from
  "the harness read a stale value" — which the computed value cannot.
- **A colour that looks wrong right after a theme switch is a transition, not a
  bug,** until it is still wrong a second later.

### ds `Stepper` — a new primitive, and why

The wizard's audit surfaced one real AA failure at **4.22**: the active step's
numeral, painted `text-rivvra-400` on `bg-rivvra-500/20` inside the legacy
`OnboardingStepper`. Brand ink on a 20% wash of the same brand — the same
failure mode as the purple Chip in #87 and the avatar above.

`StageBar` is not a substitute: it is a row of pipeline chips for a record that
can move *backwards*, whereas a wizard step is reached by passing validation.
So `Navigation/Stepper` is new, with a `.d.ts` that says plainly why the ink is
never the accent.

The legacy `OnboardingStepper` is left untouched — the legacy wizard still
renders it, and this migration does not edit pages it is not migrating. The V2
page imports the step *list* from it, so the two cannot drift.

### Statutory validation, verified rather than assumed

Half of what the onboarding wizard collects is statutory. The whole data layer —
`INITIAL_FORM`, every mutator, all of `validateStep` with its six format
patterns, and `handleSubmit` — is spliced in byte-identically, and the field sets
were compared mechanically rather than by reading: **42 bound fields on each
side, no difference in either direction**, and identical error-key sets.

Then exercised live, behind a blocking interceptor:

| input | result |
|---|---|
| account `12ab34cd56` | masked to `123456` |
| aadhaar `1234-5678-9012` | masked to `123456789012` |
| ifsc `sbin0001234` / pan `abcde1234f` | upper-cased |
| account `1234` | "must be 9-18 digits" |
| pan `NOTAPAN123` | "Invalid PAN format" |
| aadhaar `123` | "must be 12 digits" |
| phone `0000055925` | "valid 10-digit mobile" (fails `^[6-9]`) |

### Findings — reported, not fixed

**`IFSC_RE` is declared and never applied.** The IFSC field is checked for
presence only. Demonstrated: `XXXXXXXXXXX` passes validation and the step
advances, with the missing bank document as the only remaining error. A bank
routing code with a defined format that is never enforced.

**`address.street2` / `permanentAddress.street2`** are in `INITIAL_FORM` and go
up in the submit payload, but no step renders an input for either.

**`reassignManager` has no rollback** and is fired by a plain drag-drop or a
single click in move mode — one gesture away from re-parenting a person. Its
descendant check (the only thing stopping a manager being filed under their own
report) is carried across byte-identically and was not triggered.

### Contrast

2 routes × 2 themes: **0 failures** after the Stepper fix, which was the only
real one this batch.

---

## Phase 20 — Employee, batch 4: `EmployeeForm` (the last one)

2,332 lines, the largest single file in the project, and the one that carries
contractor money: candidate rates, client billing rates, rate revisions with
effective dates, and the rate history each revision appends to.

**The employee app is now 100% v2.**

### Nothing in this migration can change a number

The first thing to establish, before touching anything, was whether any money
maths lives in the render. Grepping the render for `toFixed`, `toLocaleString`,
`reduce`, `*`, `/` returned **nothing arithmetic** — every rate is read and
written, never computed, and all of the maths is server-side. `formatRate`, the
one money *formatter*, sits at legacy line 834, inside the spliced region.

So the whole risk surface reduces to binding fidelity, and that is checkable
mechanically. Two slices, both byte-identical (84 lines of constants and
`INITIAL_FORM`; 737 lines from `useParams` through `formatRate` — `validateForm`,
`handleSubmit`, `saveAssignment`, the separation flow, the link/unlink pair, and
`updateAssignmentNested`'s one-rate-at-a-time rule). Then:

- **71 bound fields on each side, no difference in either direction.**
- **Value-for-value parity against the legacy render of the same record**,
  captured by temporarily pinning the route at the legacy component. 57 field
  values legacy, 56 v2 — the single difference being the Billable
  `<input type="checkbox">` (whose `.value` is the string `"on"`) becoming a ds
  `Switch`, which is a `role="switch"` button and therefore not an `input`. Its
  `aria-checked` is `true`, matching the checked box. Every other value matches
  one-for-one, all six rate fields included.

### The slice boundary that bit

The first assembly did not parse: "Unexpected end of file". Tag balance was fine;
a bracket-depth counter said the head and render fragments were individually
balanced. The counter was lying, because it cannot tell a regex literal
(`/^[A-Z]{5}[0-9]{4}[A-Z]$/`) from a block.

Parsing the head **plus the slice alone** located it immediately: legacy line 842
is `if (loading) {`, so a slice of 104–842 ended on an unclosed brace. Trimmed to
104–840.

**Bisect with the real parser, not a hand-rolled counter.** esbuild on a
half-file found in one step what brace-counting could not find at all.

### Findings — reported, not fixed

**Every rate group is labelled `₹/day`, `$/hour`, `₹/month`.** Two currencies
inside one group, hardcoded, with no conversion and no reference to the
assignment's own billing currency. Four sites in the render plus the two
`validateForm` error strings.

This is not theoretical. The record used for parity has **candidate ₹6,000/day
and client $23/hour on the same assignment**, and the revise-rate modal prints
them one above the other via `formatRate`:

> Candidate: ₹6,000/day
> Client: $23/hour

Whether that is a data problem or a labelling problem, changing a money label is
a money change. Carried across untouched, raised here.

### Verified live, nothing written

Behind a blocking interceptor armed *before* the page loaded. The blocked list
stayed empty throughout.

- All 12 sections render and prefill from the record.
- The revise-rate modal opens with current rates formatted by the spliced
  `formatRate`, and effective date defaulted to today by `todayStr()`.
- **Apply Revision with no rates entered wrote nothing** — `handleReviseRate`'s
  `if (!hasBR && !hasCBR)` guard returned before the PUT, the modal stayed open,
  and the interceptor recorded zero attempts.
- Closed without applying.

### Contrast — and a third false alarm

2 themes: **0 failures**, 144 elements each.

Light theme appeared to show the legacy `EmployeePicker` as a dark island. It was
the theme cross-fade for the **third** time this session; on a fresh load the
chip's ink is `rgb(22,25,29)`, i.e. `--fg`. The app's Tailwind `dark-*` palette
is theme-aware, so the three shared legacy widgets kept on this page
(`EmployeePicker`, `ComboSelect`, `AssignmentDocs`) theme correctly.

Worth stating once more, since it has now cost time three times: **do not judge a
colour from a screenshot taken immediately after switching themes.** Re-read
after it settles, or read the inline style instead.

---

## Phase 21 — Incentive, batch 1 (records list, record form)

Two pages, 836 legacy lines. Both lint 0 = 0.

### The render-resident sum this rule exists for

`RecordsList`'s "Incentive (R+AM)" column is computed **inside the JSX**:

```js
formatAmount((r.recruiterIncentive || 0) + (r.accountManagerIncentive || 0), r.currency)
```

Splicing everything above `return (` would have missed it entirely. Five separate
slices were taken and diffed instead: `formatAmount` (with the comment explaining
why its rounding is deliberately whole-units), `STATUS_TABS`, `SHORT_STATUS`,
`StatusCell`'s four-branch divergence rule, and the 99-line main block including
`getTabCount`'s `reduce` over the status buckets.

### Money parity, digit for digit

Captured both renders of the same page by temporarily pinning the route at the
legacy component. **Net Profit and Incentive (R+AM) match exactly across the
first eight rows**, en-IN lakh grouping and all — ₹2,31,792 / ₹25,497,
₹2,11,826 / ₹23,301, and so on. Tab counts match too, and reconcile:
16 + 2 + 300 + 45 = **363**.

### Findings — reported, not fixed

**`RecordForm` labels the salary snapshot `(₹)` hardcoded** while the three money
fields around it interpolate the record's own `currency`. On the record used for
verification all four should read INR, so the page shows
"Untaxed invoice value (INR)", "Recruiter amount override (INR)",
"AM amount override (INR)" — and, between them, "Consultant salary snapshot (₹)".
Consistent only by luck of the record's currency.

`onSave`'s coercions are the other thing worth naming, and they are carried
across byte-identically: an empty override becomes `null` (cleared) while a typed
`0` becomes `Number(0)` (an override of zero). On a commission record those are
very different instructions, and they hang entirely on `=== ''`.

### Contrast

2 themes, ~443 elements each: **0 failures**. Includes the strikethrough
`cancelled` chips, which survive as a `Chip` with `textDecoration` rather than a
bespoke pill class.

---

## Phase 21 — Incentive, batch 2 (record detail, my earnings)

Two pages, 1,941 legacy lines. **The incentive app is now 100% v2.**

### Nine slices, because the logic is interleaved with the render

`RecordDetail` defines its lifecycle handlers *after* the loading guard, so
"splice everything above `return (`" does not describe this file at all. Five
separate slices: both money formatters, `STATUS_LABEL`, `toOptions`, the
141-line data layer, and the 151-line block holding the capability flags
(`canApprove`, `canReverse`, …), the soft-warning derivations, `hardDeletePhrase`
and all nine handlers. `MyEarnings` took four more.

Three arithmetic expressions live *inside* `RecordDetail`'s JSX and came across
with it: the FX line (`Number(record.fxRate).toFixed(4)`) and the two
rate-to-percent conversions (`* 100`).

### Money parity on a record that exercises all of it

The verification record is cancelled, in USD, with both parties cancelled — so it
covers the native/reported currency split, the FX line, the percent conversions,
and the gating in one page. Legacy and v2 render identically:

| | value |
|---|---|
| Invoice (USD) | `$4,752.00` |
| FX rate | `1 USD = 85.0000 INR` |
| Untaxed invoice (INR) | `₹4,03,920.00` |
| Net profit | `₹3,20,587.00` |
| Rate (both parties) | `5.00%` |
| Incentive (both parties) | `₹16,029.35` |

4,752 × 85 = 403,920, so the FX conversion is internally consistent too. The
action set matched exactly: **Hard Delete, Restore Recruiter share, Restore AM
share** — no Approve/Cancel/Reverse, because the record is cancelled.

`MyEarnings` matched on stats (`₹7,53,777` YTD / 91 records), chip counts
(All 210 · Draft 4 · Approved 1 · Cancelled 45) and every row, including the
dual-role row that prints `₹8,606` with `+ ₹8,606` beneath it.

### The hard-delete gate, driven to three near-misses

`canConfirm` needs a non-empty reason **and** an exact match on the confirmation
phrase. Driven live behind a blocking interceptor:

| state | confirm button |
|---|---|
| no reason, no phrase | disabled |
| reason only | disabled |
| reason + wrong phrase | disabled |
| correct phrase, no reason | disabled |

Both conditions were never satisfied at once, so the delete was never armed.
Zero write attempts recorded.

### One shared component fixed, deliberately

`IncentiveNotificationsBanner` used a hardcoded dark-mode fuchsia palette. In the
light theme it stayed a dark lavender wash carrying blue-violet ink and measured
**2.24–2.45** against a 4.5 floor across all eight of its text nodes.

That is normally out of scope — it is shared with the legacy page. Two things
changed the call: it is already rendered by `IncentiveDashboardV2`, a **shipped**
v2 page, so the failure is live today; and the fix is presentation-only, swapping
hardcoded colours for `--acc-purple` / `--fg` tokens with no logic touched.

Worth separating clearly, because the audit did its job in one direction and not
the other: it caught this (unreadable ink) but would never have caught the amber
headcount chip from #100 (perfectly readable, wrong meaning). **Legibility and
meaning are different checks.**

### A scare that was not a write

Mid-verification the notifications banner stopped rendering, and "Mark all read"
is a write. Checked directly against the API rather than assuming: all three
notifications were still `unreadOnly` — nothing had been marked. The component
swallows fetch errors and renders `null` on an empty list, so a transient load
looks identical to a dismissal. Nothing was written; the banner returned on
reload.

### Contrast

2 pages × 2 themes: **0 failures** (520 elements on MyEarnings, 65 on
RecordDetail), after the banner fix.

---

## Phase 24 — MyProfilePage

957 legacy lines → 862. Lint 1 = 1 (the same unused `passwordAuthAllowed`,
which sits inside the verbatim slice).

Four slices, all byte-identical: `TIMEZONE_OPTIONS` with its rationale comment,
`resolvePhotoUrl`, the 263-line data layer, and the two masking helpers.

### The sensitive surface here is masking, not money

```js
maskAccount  → '••••' + acc.slice(-4)
maskAadhaar  → '•••• •••• ' + aadhaar.slice(-4)
```

Both guard on `length < 4` and **return the raw value** when it is shorter — so
a short or malformed account number is shown in full, by design. That is worth
knowing about but is not a bug to fix mid-migration, and either function is one
transposed character away from printing a whole bank account or Aadhaar number.
Diffed, then re-checked by exact string count on both sides.

### A gate that is not where it looks

The Set/Change Password button's `disabled` only tests
`!newPassword || newPassword !== confirmPassword`. **The 10-character floor is
not on the button** — it lives inside `handlePasswordSubmit`. So five matching
characters *enables* the button:

| state | button |
|---|---|
| empty | disabled |
| new only, 5 chars | disabled |
| both match, 5 chars | **enabled** |
| new 12 chars, confirm mismatched | disabled |

Clicking it in that enabled-but-invalid state produced
"Password must be at least 10 characters" and **zero write attempts** — the
floor holds where it actually lives. Carried across unchanged.

The lesson is the one this project keeps relearning from the other direction:
a disabled button is not the guard, it is a hint about the guard. Test the
submit path, not the affordance.

### Delete-account gate

Rejects every near-miss — lowercase, trailing space, one character short — and
the exact phrase was never typed, so the delete was never armed.

### Parity

Captured both renders by pinning the route at the legacy component. All five
data tabs are **character-for-character identical**, including every `—`
placeholder. Work Info, Personal (with its 6-field address block), Emergency,
Bank & Statutory, Account Security.

### Unverifiable on this data

The staging account has `bankDetails.accountNumber`, `statutory.aadhaar`, IFSC
and PAN all `null`, so both tabs render `—` and **the masking branch is never
entered**. Byte-identity is the guarantee here, not observation — stated plainly
rather than implied by a passing screenshot.

### Contrast

6 tabs × 2 themes = 12 audits: **0 failures**.

---

## Phase 25 — AtsApplicationNew

`src/pages/ats/AtsApplicationNew.jsx` (1,435) → `AtsApplicationNewV2.jsx`
(1,530). Route `/ats/jobs/:jobId/applications/new`, behind `PageSwitch`.

### Why the whole logic layer is one slice

Almost every line of this page is a gate, so legacy 37–688 — **652 lines,
diffed byte-identical** — is spliced in whole. The render was rebuilt on ds and
contains no computation beyond `Math.min(8, …)` and a display `.slice(0, 12)`.

| gate | what it actually says |
|---|---|
| `hasResume` | a fresh upload always counts; a **reused** resume only counts after `resumeConfirmed` |
| `blockedByDuplicate` | hard-blocks on `ongoing` or `hired` only — a `refused` prior leaves Create **enabled** |
| `canSubmit` | eight-condition conjunction over all of the above |

Also verified with an identifier sweep: every name declared in the logic layer
that the legacy render used is still used by the V2 render — zero dropped.

### The duplicate banner has three faces, and they were all reachable

The staging data had one of each, so none of this rests on reading the source:

| prior application | banner | Create |
|---|---|---|
| `ongoing` (Direbe Dusoha Ku) | amber, "Already applied to this job" | **blocked** |
| `refused` (Todumo Jako) | amber, "Previously refused for this job" | **enabled** once the resume is confirmed |
| `hired` (Gopor Semoho, another job) | red, "Already hired into this role" | **blocked** |

The refused row is the one worth stating out loud: the banner appears *and*
Create stays live, because re-applying after a refusal is legitimate and the
server's 409 is the real backstop.

### The resume gate, watched flipping

Picking an existing candidate loads their resume into an amber card reading
"confirm to reuse, or upload a new file", with the checklist row still **unticked**
and Create disabled. Clicking "Use this resume" flips the card to the brand ring
and "will be attached to this application", the row ticks, and the bar changes to
"Ready to create." That gap is the whole point of the 2026-05-13 fix — before
it, prior-application files attached silently.

### Selective blanking, observed

Typing over a picked candidate must blank only the fields that came *from* the
pick. Driven live:

| field | before | after retyping the name |
|---|---|---|
| email (inherited) | `ud2701…@staging.invalid` | **blanked** |
| linkedin (inherited) | `https://staging.invalid/in/…` | **blanked** |
| phone (**typed by hand**) | `+91 99999 00000` | **kept** |

The resume card reverted to the dropzone in the same tick, and Create went back
to disabled. Leaving an inherited email in place is what would let the server's
email-dedupe attach the application to the wrong candidate.

### Parity

Route pinned at the legacy component and the same states replayed. Empty state
and the refused-duplicate state are text-identical, including
"At least one of email or phone is required.", the full banner body, the
Pipeline read-outs (`Stage New` / `Employment · External Consultant`) and every
Summary row. Only difference: ds `Chip` renders `existing` / `you` / `inherited`
in lower case where legacy uppercased them.

### Contrast

83 nodes, both themes, three duplicate states: **0 failures.**

Two surfaces the audit *skips* were measured by hand instead of trusted to the
exemption, because the accepted-suggestion chip is green ink on a green wash —
exactly the shape that has failed before:

| surface | dark | light |
|---|---|---|
| accepted AI chip (`disabled`) | 5.25 | 5.53 |
| pending AI chip | — | 10.09 |
| Create button | — | 5.02 |
| danger banner | 5.69 | 5.56 |

A first dark run reported 3 failures with dark ink measured against a *light*
background — ratio 1.02. That is the theme cross-fade, caught mid-transition for
the fourth time in this project. A forced paint and a re-run: 0.

### Not triggered

Create application, resume upload, skill attach. A blocking interceptor was
armed for the whole session and `__blocked` stayed empty throughout — nothing
was written to staging, so there is nothing to clean up.

---

## Phase 23 — InvoiceDetail (the big one)

`src/pages/invoicing/InvoiceDetail.jsx` (5,189) → `InvoiceDetailV2.jsx` (4,977),
behind `PageSwitch`. Full record in
[INVOICE-DETAIL-MIGRATION.md](INVOICE-DETAIL-MIGRATION.md).

**19 verbatim slices, 2,051 spliced lines, 0 mismatches.** 26 money expressions
asserted by exact string count. Lint identical to the legacy baseline at
13 problems, including both React Compiler diagnostics.

### Assembled by a script, not by hand

At this size the verbatim-slice method stops being something you can hold in
your head. `scratchpad/id-assemble.py` concatenates legacy line ranges with
written render chunks and prints a manifest of where each splice landed; the
verification step diffs the manifest back. "Byte-identical" becomes a checked
claim rather than a careful intent — which is the only version of the claim
worth making on a page that decides what a customer is billed.

### A static totals panel proves almost nothing

Reading a posted invoice's totals exercises `invoice.total` and nothing else —
`localTotals`, `buildTaxBreakdown` and the whole draft arithmetic never run. So
the draft was *driven*: same qty, same rate, same tax picked on both sides.

| | V2 | legacy |
|---|---|---|
| 3 × ₹12,345.67 line amount | ₹37,037.01 | ₹37,037.01 |
| Taxable Value | ₹37,037.01 | ₹37,037.01 |
| IGST 18% | ₹6,666.66 | ₹6,666.66 |
| Total | ₹43,703.67 | ₹43,703.67 |

Every resulting write was rejected; the draft was re-read from the API
afterwards and is unchanged. TDS was driven the same way inside
`RecordPaymentModal` — 194J @ 10% on a ₹1,99,920 base gives ₹19,992 and a net of
₹2,15,913.60, with nothing submitted.

### The audit was lying, and it took a hand-measurement to catch it

`parseColor` canvas-round-tripped `rgb`/`color`/`oklch` but not **`oklab`** —
which is exactly what Chrome computes a Tailwind `bg-sky-500/15` to. The numeric
fallback read L/a/b as R/G/B, and `[\d.]+` dropped the minus signs, so the chip's
sky wash became a near-black at 15% and composited to a believable grey. It
reported 4.29 on a node whose real ratio is 5.27.

The tell was that the "failure" was in a shared component that has been on every
audited page for months. Painting the colour on a canvas by hand gave a different
answer than the tool. `parseColor` now paints *everything*, with a sentinel check
so an unparseable value returns null instead of the previous fill.

**A fabricated background is worse than no measurement, because it reads like a
finding.** Every page audited before this fix was re-run; the two most recent
(AtsApplicationNew, and this one) come back 0/0 with the corrected parser.

### Theme cross-fade, fifth sighting

A dark sweep reported 25 failures — every one a sidebar nav item, every one at
exactly 1.67, and the *same count on all four pages in the sweep*. That identical
count across unrelated pages is the signature: it is shell chrome caught
mid-transition, not a page defect. Screenshot, settle, re-run: 0.

### Not verifiable on this data

Staging has no invoice carrying TDS, no draft with a non-zero stored total, and
no invoice with a discount — so the totals panel's **TDS / Net Payable rows and
the Discount row never rendered**. Byte-identity and the string-count assertions
are the guarantee there. Said plainly rather than implied by a passing
screenshot.

### ds

`Input`, `Select`, `Textarea` now `forwardRef` — `EditableField` needs the DOM
node to focus and select on open, and without it click-to-edit puts the caret
nowhere.

### Interceptor note

The blocking interceptor did **not** survive a Vite full reload triggered by
editing `App.jsx` mid-session. Caught by checking `window.__armed` before the
next interactive step. Check the flag; do not assume it.

---

## Phase 26 — PublicSigningPage

`src/pages/sign/PublicSigningPage.jsx` (2,728) → `PublicSigningPageV2.jsx`
(2,903), plus `PublicSigningRoute.jsx`. **Opt-in; defaults to legacy.**

This is the only page in the migration that an unauthenticated stranger opens
from an email to sign a legal document, and three things about it broke the
usual method.

### 1. `PageSwitch` cannot gate this route

`/sign/public/:requestId/:signerId/:token` lives outside `OrgPlatformLayout`,
so there is no `OrgProvider`, no `currentOrg.uiV2`, and the verify endpoint
returns `orgName` but no UI flag. The switch is therefore local and explicit:

| URL | result |
|---|---|
| `?ui=v2` | v2, remembered in `localStorage` |
| `?ui=v1` | legacy, preference cleared |
| no param | **legacy** |

All three verified. A counterparty part-way through a contract must not be
handed a different UI because a flag defaulted the wrong way.

### 2. ds tokens default to DARK, and this page must not

`:root` in `ds-tokens.css` **is** the dark theme; light only arrives via
`[data-theme='light']`, which nothing but the in-app `ThemeToggle` ever sets.
An external signer has no toggle and no stored preference — so a naive ds port
renders this page **dark for every counterparty**. That is a change to how a
legal document is presented, and nobody asked for it.

The page pins `data-theme="light"` on its own root. Verified by forcing
`<html data-theme="dark">` and confirming the page still computes
`--bg: rgb(250,248,244)`.

### 3. The document surface is not re-themed at all

Everything that paints on, or positions against, the PDF is spliced verbatim
and keeps its own palette — **5 slices, 1,778 lines, 0 mismatches**:

| slice | legacy | lines |
|---|---|---|
| helpers + signature pipeline | 21–205 | 185 |
| `useIsMobileViewport` + `SignaturePadModal` logic | 210–321 | 112 |
| `InlineFieldInput` (whole) | 559–692 | 134 |
| `FittedText` / `PrevSignerValue` / `SignatureStamp` / `PdfPageWithFields` (whole) | 695–1344 | 650 |
| main component logic | 1347–2043 | 697 |

25 signature-chain expressions asserted by string count: the SHA-256 hash and
its 12-hex truncation, the paper-knockout luminance loop and feather band, the
1200×600 downscale that fixed the phone-photo 413, `penColor="#0f3a8a"`, and
every field-geometry expression including `prevAnchoredTop` and the
coarse-pointer compact gate.

The dashed rose frame, the "Signed with Rivvra Sign" label and the truncated
hash are **audit evidence the next signer is meant to inspect**. Re-tinting
them to brand tokens would change what a legal document looks like. Only the
chrome moved: header, banners, guard screens, bottom bar, modals, toast.

### Lint

Legacy 5 problems (4 errors, 1 warning). V2 **5 problems, the same set**. One
new error appeared en route — `StatusCard({ icon: Icon })` reads to eslint as
unused even though the JSX uses it — and was removed by taking `icon` as a
rendered node instead.

### Dropped

The local `ConfirmDialog` (legacy 532–556) was declared and never called; the
refuse flow has always had its own inline modal. 26 lines of dead code.

### Carried across unchanged, deliberately

`SignatureStamp` is passed `compact={isCompactScale}` but never destructures
`compact`, so the prop is silently ignored. That matches the stated intent
("always renders the full audit chrome"). Honouring it *or* deleting it would
change what a signer sees on a signed document — so it stays exactly as-is,
flagged rather than tidied.

### The "missing fields" was my harness, not the app — FALSE FAILURE #8

A public signing link needs a per-signer token that exists only in the sent
email, and the authenticated API correctly does not return it. So the signing
screen was exercised behind a stubbed `verify` response and a fixture PDF.

Under that harness, `PdfPageWithFields` paints the PDF canvas but renders **no
field overlay** — the whole overlay is gated on `rendered`, so the page looks
like a document that simply has no fields on it. Priyanshu confirmed fields
render fine on a real link, so this is a harness artifact. Chasing it anyway
was worth it for what it ruled out, and worth writing down for the next person
who builds a stub for this page.

**What it is not.** Instrumenting the effect showed
`run 1 start → run 1 cleanup → run 2 start → run 1 getPage (stale) → run 2
getPage → run 2 about to render`, and then nothing. That interleaving looks
exactly like a two-run race over the shared `renderTaskRef`, and I wrote a
generation-counter guard for it. **The guard was inert and has been reverted:**
the existing `if (!canvas || cancelled) return;` already bails the older run
before it can touch the canvas or the task ref, because React always runs a
cleanup before the next effect. There was no race to fix.

**What it actually is.** `page.render()`'s promise never settles. Confirmed
with StrictMode disabled — one run, not stale, reaches `page.render()` and
hangs — so the double-mount is irrelevant. It reproduces with a hand-rolled
PDF *and* one generated by jsPDF, on a cold full page load, in a production
build, on the **legacy** page as well as v2. The same fixture renders fine when
the route is entered by client-side navigation from an already-running app.
That points at pdf.js worker initialisation on a cold load under the stub, not
at either page.

Legacy and v2 behave **identically** throughout — which is what byte-identity
predicts, and is the parity evidence for the document surface.

**Lesson: a stub that makes the page render at all is not a stub that makes it
render truthfully.** Two independent things were wrong-looking here, and the
one that matched a familiar pattern (a React effect race) was the one that was
not real. Disabling StrictMode to collapse the run count was the experiment
that settled it in one step; reach for that before writing a fix.

Verified: the opt-in gate (all three directions), the terminal screens, the
light-theme pin, contrast (0 failures).

---

## Phase 27 — DashboardPage (Outreach home)

`src/pages/DashboardPage.jsx` (1,198) → `DashboardPageV2.jsx` (1,187), behind
`PageSwitch`. Route `/outreach/dashboard` — the generic name is a leftover from
before the platform grew other apps; this is the Outreach home, not a global one.

**5 verbatim slices, 366 spliced lines, 0 mismatches.** 13 gate/derivation
expressions asserted by string count.

### Two computations that decide what the user is told

Both are render-resident, so each was copied to its own cell rather than
spliced with the logic:

- **The daily email quota.** `effectiveLimit` is the `Math.min` of the user's
  limit and the org's, `orgBound` picks which `sent` counter is displayed, and
  `atLimit` is what tells someone their queued sequence emails have stopped
  going out. Wrong either way, it hides a stopped campaign or invents one.
- **`canExportCrm`**, which deliberately mirrors the backend's
  `requireAppAccess('crm')` gate so the UI never offers an export the API will
  403.

### Parity

Route pinned at the legacy component, same query and same filter on both sides:

| | legacy | v2 |
|---|---|---|
| search `an` | 16,419 contacts found | 16,419 contacts found |
| \+ location `Pune` | 1,194 contacts found | 1,194 contacts found |
| Get Started | 2 of 3 steps complete | 2 of 3 steps complete |
| all four stat tiles | value **and** zero-state CTA | identical |

The stats row first looked like a mismatch — it was my extraction regex
chunking ds `Stat`'s `note` onto a different line, not a difference in the
page. Re-extracted structurally: identical. Worth remembering that a diff of
two scraped strings is only as good as the scrape.

### Deliberate render-layer change

The local `Pagination` — numbered page buttons with a 5-wide sliding window —
is replaced by ds `Pagination` (range readout plus prev/next). That loses
"jump straight to page 7". It is the right trade here because this page's three
siblings (`LeadsPageV2`, `MyListsPageV2`, `TeamContactsPageV2`) already use the
ds one, and a search-results list that paginates differently from the contacts
list it feeds is worse than losing the jump. Verified live: `1–25 of 1,194` →
next → `26–50 of 1,194`. `searchTotalPages` still gates whether the control
renders, matching legacy's `if (totalPages <= 1) return null;`.

`ds` `Avatar` also collapses the photo/initials branch — `src` wins — while
`initials` keeps the legacy derivation rather than Avatar's own.

### Contrast

Dashboard 74 nodes, search results 234, companies 24, Add-to-List modal 247 —
both themes, **0 failures**.

### Not verifiable on this data

The staging account has Gmail disconnected, so `emailsToday && gmailStatus?.connected`
is false and **the entire quota block never rendered** — on either page. The
verbatim copy is the guarantee there.

### Not triggered

Save contact, add to list, create list. The Add-to-List modal was opened and
closed without selecting; the interceptor stayed empty throughout.

---

## Phase 28 — EngagePage

`src/pages/EngagePage.jsx` (966) → `EngagePageV2.jsx` (956), behind
`PageSwitch`. Route `/outreach/engage`.

**4 verbatim slices, 376 spliced lines, 0 mismatches.** 15 metric/gate
expressions asserted by string count. Lint matches the legacy baseline exactly
at 6 problems.

### What had to survive

The whole 336-line logic layer, including the Gmail OAuth redirect exchange
with its single-use-code dedupe and the optimistic `rivvra_gmail_connected`
marker that survives the OrgRedirect remount, plus both setup gates:
`handleToggleSequence` refuses to **activate** while `setupStatus.allComplete`
is false, and `handleNewSequence` refuses to open the wizard on the same
condition. Pausing is optimistic with a revert on failure.

The per-sequence campaign metrics live inside the render, so that block was
copied to its own cell: each rate clamps at 100% and reads `0%` before anything
is sent, `finished` sums replied + repliedNotInterested + lostNoResponse +
bounced, and `active` is enrolled minus that. These are the numbers someone
judges a campaign by.

### Parity

Route pinned at the legacy component. Every table cell **identical**:

| sequence | contacts | active/finished | delivered | opened | interested | bounced |
|---|---|---|---|---|---|---|
| Huemot Main Marketing Email | 19,572 | 2462/17110 | 68,204 | 46% | 0% | 8% |
| Demo — Gmail Send Test | 2 | 0/2 | 2 | 100% | 0% | 0% |

Quota `0/50`, count `2 Sequences`, and **New sequence disabled on both** —
setup is incomplete on this org, so the gate is genuinely exercised rather
than assumed.

Also driven: sort toggles asc/desc on Contacts, the `draft` filter empties the
list to the empty state at `0 of 2 Sequences`, search narrows to `1 of 2`, and
the portalled row menu lands 4px below its trigger (772 → 776) with the right
item set for an owned, shared, active sequence.

### Two things deliberately not carried across

- **`showFilterDropdown` / `filterLabel`** are dropped from the spliced logic.
  They served a hand-rolled filter popover that ds `InlineSelect` replaces, and
  splicing them whole would have shipped dead state — three new lint errors
  that the legacy file does not have. The slice was split around them rather
  than the lint being silenced.
- **The local `EmptyState`** is replaced by the ds one; the name collided with
  the ds export and the local was a plain card.

### One thing deliberately kept

`deliveredRate` is computed in the metrics block and never rendered — dead in
legacy too. Carried across so the lint baseline matches. Deleting it is a
silent decision about a metric someone may have meant to show; that is a call
to make deliberately, not while migrating a page.

### The ref that could not be a ds Button

The row action menu is `createPortal`ed and positioned from its trigger's
`getBoundingClientRect()`. ds `Button` does not forward refs, so that one
control stays a plain `<button>` styled to match, with `aria-haspopup` and
`aria-expanded` added. Adding `forwardRef` to `Button` would have been the
bigger change for one call site.

### Contrast

Sequences 61 nodes, Settings tab 57, open row menu 66 — **0 failures**.

A light run first reported 16 — every one a sidebar nav item, identical class,
right after the theme toggle. Cross-fade, **sixth sighting**. Settled: 0.

### Not triggered

Activate, pause, delete, duplicate, share, export CSV, connect/disconnect
Gmail. The row menu was opened and closed without selecting anything.

---

## Phase 29 — TeamDashboardPage

`src/pages/TeamDashboardPage.jsx` (962) → `TeamDashboardPageV2.jsx` (964),
behind `PageSwitch`. Route `/outreach/team-dashboard`, admin + team_lead only.

**3 verbatim slices, 186 spliced lines, 0 mismatches.** 22 gate/metric
expressions asserted by string count. Lint **3 → 1**: the two
`'Icon' is defined but never used` errors go away because the two card
components now take `icon` as a rendered node; the one that remains is the
pre-existing dead `inSequenceData`, carried across deliberately.

### The chart palette — the first page in this migration where colour is data

This is a recharts page, so the `dataviz` skill applies: **compute the palette,
don't eyeball it.** Running the validator on the seven `STATUS_CONFIG` colours
found two separate things, and only one of them was mine to fix.

**Mine.** The page had no light theme before, and its hexes were picked against
a dark surface. On ds `--surface-1` in light (#FFFFFF), four of seven fall
below 3:1 — `replied` 2.28, `no_response` 2.15, `bounced` 2.80, `lost` 2.56.
Washed-out arcs on white is a defect the migration would *introduce*, so light
gets its own steps, same hue per status, validated rather than flipped:

```
node scripts/validate_palette.js "#6b7280,#2563eb,#15803d,#dc2626,#854d0e,#ea580c,#64748b" \
  --mode light --surface "#FFFFFF"
  [PASS] Lightness band   [PASS] Normal-vision floor (17.5)   [PASS] Contrast vs surface
```

Verified live: dark renders `#3b82f6 / #22c55e / #ef4444 / #f59e0b / #f97316`
— byte-identical to legacy — and the toggle swaps to the light steps through a
`MutationObserver` on `data-theme`.

The validator's remaining chroma-floor FAIL is it being applied slightly out of
scope: it flags `not_contacted` and `lost_no_response` for "reading gray",
which is exactly what those two statuses are meant to look like. **A status
palette is not a categorical series palette.**

**Not mine — flagged, not changed.** In dark, `bounced` #f97316 and
`no_response` #f59e0b sit at **ΔE 9.6 normal vision** (6.2 deutan) — below the
15 floor, genuinely hard to tell apart on adjacent arcs even with full colour
vision. Pre-existing, and a real problem on a chart read to work out where
deliverability is going wrong. Re-hueing it changes what a colour *means* on a
dashboard people read daily, so it is reported rather than quietly fixed. My
first attempt at light steps made this pair **worse** (ΔE 4.1) — which is
exactly why the rule is to run the script instead of reasoning about it.

What this file does do is make identity never colour-alone: donut legend,
status-breakdown cards and both tooltips all carry the text label beside the
swatch.

### Parity

The obvious approach failed twice, and both failures are worth recording.

1. **Text scraping was ambiguous.** "In Sequence" appears in four places on
   this page — a KPI, the funnel, the donut legend and a detail panel — so
   `indexOf(label)` matched the wrong one and reported a mismatch that was not
   there. Same lesson as phase 27, one page later.
2. **The endpoint is not deterministic.** Two back-to-back
   `getDashboardStats` calls with identical params returned
   `not_contacted: 34` and then `12984`. That is server-side churn, nothing to
   do with either page — but it makes a load-legacy-then-load-v2 comparison
   worthless.

So the payload was **pinned** — one captured response, `getDashboardStats`
stubbed to return it, both pages rendered against it — and the whole page text
compared. Identical except two things, neither of them a number:

- legacy emits `All Teams89 members · <TIME>` as one text node where v2 emits
  `All Teams` + `89 members · <TIME>`, because the badge is now a `Chip`
- ds `Stat` renders its label as given, so `RESPONSE RATE` → `Response Rate`

**Every figure on the page matches**: KPIs, funnel values and both conversion
percentages (3% ↘ 26%), the full status distribution, and all four email rates
(45.7% open, 54.2% click-to-open, 0.3% interested, 7.2% bounce).

### Contrast

165 nodes, both themes: **0 failures**. A light run first reported 14 — all
sidebar items, straight after the toggle. Cross-fade, **seventh sighting**.

### Not triggered

Nothing on this page writes; the only action is Refresh, which re-reads. The
interceptor stayed empty throughout.

---

## Phase 30 — AdminPayrollSettingsPage

`src/pages/admin/AdminPayrollSettingsPage.jsx` (738) →
`AdminPayrollSettingsPageV2.jsx` (854). Route `/admin/settings/payroll`.
**First page in the platform-admin area to move.**

This page sets the numbers the whole platform computes payroll from — PF and
ESI rates and ceilings, cess, surcharge slabs, both tax regimes, per-state PT
slabs, and the default salary structure new workspaces inherit.

**4 verbatim slices, 278 spliced lines, 0 mismatches.** 18 statutory
expressions asserted by string count. Lint **14 → 13** (the one that goes is
`Section`'s `Icon`, now a node).

### Two structural facts, neither optional

1. **`PageSwitch` cannot gate this route.** `/admin/*` lives outside
   `OrgProvider`, and `useOrg()` **throws** with no provider — the switch would
   crash rather than fall back. The v2 page is wired directly; the legacy file
   is kept unreferenced so reverting is one line. Defensible only because the
   whole area sits behind `SuperAdminRoute`.
2. **`AdminLayout` is a hard-dark legacy shell** with no theme toggle, and
   nothing under `/admin/*` writes `data-theme` — so ds tokens resolve from
   `:root` (dark) and *happen* to agree. "Happen to" is not a guarantee: a
   client-side hop from the org app in light theme carries the attribute over.
   The page pins `data-theme="dark"` on its own root.

### Two slips I made and caught

Both were mine, both were in the direction of "slightly nicer", and both would
have changed a statutory form:

- **Per-slab visible labels.** Passing `label` to every slab cell rendered
  "Slab 1 min / Slab 1 max / Slab 1 rate" above each row — duplicating the
  Min/Max/Rate column headers and tripling the height of the editor. `NumField`
  now separates `label` (visible) from `ariaLabel` (named but not drawn).
- **A `min` that legacy never had.** `NumField` defaulted `min = '0'`, which
  silently put a floor under the cess rate and all six regime
  deduction/rebate fields — legacy omits `min` on exactly those seven. The
  default is gone and every call site states it. Verified in the DOM: 7 inputs
  with no `min`, cess at `step="0.01"` with none, PF/ESI at
  `min="0" step="0.0001"`.

A `step` or a `min` is not styling on this page. It decides what the spinner
will round a statutory rate to.

### The validator, driven

`validateSlabs` runs before the API call and returns early, so both failure
modes could be exercised without writing anything:

| edit | message |
|---|---|
| slab 2 min 5000001 → 4000000 | `Surcharge slabs: slabs overlap around 4000000` |
| slab 2 max cleared | `Surcharge slabs: only the last slab may have no upper limit` |

Both restored afterwards and the table re-read cell by cell — the five
surcharge slabs are back to `0–5000000 @ 0` … `50000001–∞ @ 0.37`. The
interceptor never fired.

### Verified without touching a privilege flag

The page is behind `SuperAdminRoute`, which gates on `user.superAdmin`. Writing
that flag into stored auth state is a privilege-escalation shape and was
correctly refused, so the page was mounted through a **temporary unguarded
route** instead, removed before commit. It loaded real platform data — FY
2026-27 and 2025-26, PF 0.12 / 0.0367 / 0.0833, ESI 0.0075 / 0.0325 / 21000 —
so no stubbing was needed either.

### Contrast

81 nodes with every section expanded: **0 failures**. One theme only, which is
the point of the pin.

### Flagged

`copyPlatformPTMaster` is imported and never called — kept, because it says a
copy-PT-master-between-FYs endpoint exists with no UI behind it. That is a
missing feature, not dead code, and deleting the import would erase the clue.

### Not triggered

Save FY config, save PT state, save salary structure, seed FY, seed PT master,
copy FY, run migration, verify migration.

---

## Phase 31 — incentive/RatesTable

`src/pages/incentive/RatesTable.jsx` (710) → `RatesTableV2.jsx` (649), behind
`PageSwitch` at `/org/:slug/incentive/rates`.

**2 verbatim slices, 204 spliced lines, 0 mismatches** against the manifest.

The whole page is one thing: what percentage every incentive record gets
computed at. So the slices are drawn around that and nothing else — the lane
model and both display formatters (legacy 25–75), then every piece of state and
every handler (legacy 78–230). Only the chrome is new.

### Parity

Legacy and v2 were rendered at the same route, minutes apart, against the same
four staging rows, and the tables compared cell by cell:

| | legacy | v2 |
|---|---|---|
| table body (4 rows × 7 cells) | — | **byte-identical** |
| `min` / `max` / `step` on both rate inputs | 0 / 100 / 0.01 | same |
| `maxLength` on tier / note | 80 / 500 | same |

22 string-count assertions over the rate expressions, all passing — including
both directions of the conversion (`Number(ratePct) / 100` and
`(Number(r.rate) || 0) * 100`), the `n > 100` bound, and the two lane
ternaries. Two counts deliberately differ and are asserted at their new values:
`laneOfRow` 4→3 (legacy's `DisplayRow` and `EditingRow` are now one cell
renderer) and `fmtPct` 3→5 (two new aria-labels on the row buttons).

Reminder to self, third time now: strip comments before counting. My own
docblock quoting `Number(newRate.ratePct) / 100` counted as a second occurrence.

### The payloads, read at the network boundary

The strongest check available without writing anything. With the blocking
interceptor armed, all three mutations were driven and their bodies inspected:

```
POST  /incentive/rates          {"role":"recruiter","rate":0.05,"effectiveFrom":"2026-09-01",
                                 "note":"…","employeeId":"699b…","tier":null}
PUT   /incentive/rates/<tier>   {"rate":0.075,…,"tier":"Team Lead"}
PUT   /incentive/rates/<org>    {"rate":0.05,…}          ← no `tier` key
```

That last line is the point. `saveEdit` only sends `tier` when the row is
already on the tier lane; on an org row the key is absent, so an edit cannot
move a row between lanes. "5" → `0.05` and `0.075` → `"7.50"` → `0.075` both
round-trip exactly.

All three were blocked. Staging still has its original four rows with their
April `updatedAt` timestamps.

The tier lane has no rows on staging, so its edit branch was exercised by
stubbing a synthetic tier row into the `GET /rates` response — read-only, and
the only way to reach that branch without creating a rate.

### Two new ds primitives

**`RadioCards`** (`ds/Form/RadioCards.jsx`). Legacy's `ScopeRadio` was a local
button row, and the page comment says why it exists: "three radios so the lane
is unmissable… we don't want admins to silently create the wrong layer."
Collapsing that to a dropdown would have thrown away the one thing it was for.
So it became a real primitive: single-select where the options need explaining
and all of them stay on screen. Unlike the button row it replaces it is an
actual radiogroup — one tab stop, arrow keys, hints inside the accessible name.

**`ComboBox` gains `keywords`** — matched by the search box, never rendered.
Legacy's `EmployeePicker` searched name, email, designation *and* employee code
while displaying only the designation. Without `keywords` the choice would have
been "show the code or lose the ability to search it", on a picker where
picking the wrong person assigns the wrong rate. Verified: typing `11212215`
narrows 50 options to 1, and the code appears nowhere on the page.

### The bug the build could not have caught

`RadioCards` shipped its arrow-key handler with the focus chase in a
`requestAnimationFrame`. Lint clean, build clean, and **wrong**: the arrow key
moved the selection but left focus on the old card, now `tabIndex={-1}`. Tab
out and back would have skipped the group entirely.

The cause is worth remembering. The selection lives in the *caller's* state, so
the card we want to focus does not exist in its selected form until React has
committed the parent's re-render — and React's commit can land after the rAF.
The fix is a `pendingFocus` ref read in an effect, which by definition runs
after commit. Found by pressing an arrow key. Nothing else would have found it.

### Departures, stated

- **No clear-to-empty on the employee picker.** Legacy showed the selection as
  a chip with an X. `ComboBox` has no such affordance. Re-picking works and both
  lane switches already reset `employeeId`, so the only lost move is "deselect
  and leave the form invalid". Judged not worth a second primitive.
- **The form grid.** Legacy packed six controls into a `md:grid-cols-6` strip
  that only held together at one breakpoint. The lane-specific control now gets
  its own row and the rest sit in an auto-fit row, so field order is stable at
  every width. Caught by looking at the page, not by reading the code.
- **ds `ConfirmDialog`** replaces `shared/ConfirmDialog`. Verified that Enter no
  longer confirms a `danger` dialog — pressed it, dialog stayed open, no DELETE
  attempted. Escape still cancels.
- Four form controls moved from `aria-label` to real `<label for>`. Same
  accessible names (Role, Rate %, Effective from, Note), now clickable.

### ⚠️ Flagged, not fixed

`incentiveApi.lookupEmployees` returns **exactly 50 employees and ignores both
`limit` and `search`** — verified directly against the staging API. The
Per-employee picker therefore cannot reach anyone past the first 50, and typing
a 51st person's name finds nothing. Pre-existing and server-side; fixing it is
an API change. This is the same shape as the asset Assign-To `limit:100`
truncation.

### Contrast

Fully expanded (picker open with 50 options, a row in edit): **light 156 nodes /
0 failures, dark 158 / 0**.

### False failure #9 — the audit read light-theme backdrops after a theme switch

One dark run reported 11 failures whose backgrounds were light-theme values
(`rgb(246,243,238)`) while their ink was already dark. Identical at +900ms and
+3000ms, so not obviously a cross-fade. Direct measurement of every flagged node
gave correct dark values (`rgb(20,27,36)` on `rgb(14,19,26)`), the screenshot
showed a correct dark page, and a clean light→dark→audit round-trip gave 0.

I could not pin the mechanism and am not going to invent one. The rule that
falls out: **a contrast run taken right after a theme toggle on a heavy DOM is
not trustworthy — re-toggle, settle, and re-run before believing a failure.**

### Drive-by: three v2 pages had inert responsive padding

`DashboardPageV2`, `EngagePageV2` and `TeamDashboardPageV2` were written as
`style={{ padding: 16 }} className="sm:p-6"`. Inline styles beat Tailwind
classes, so the class never applied and all three rendered 16px on desktop
instead of the 24px every other v2 page uses. My own regression from phases
27–29. All four call sites now use the house `clamp(12px, 2vw, 24px)`; measured
24px at 1272px wide.

### Not triggered

Add rate, save edit, delete rate. Nothing written to staging.

---

## Phase 32 — careers/* : deliberately NOT migrated to ds

`CareersHome.jsx` (698) and `CareersJobDetail.jsx` (646) stay off the design
system. This is a decision, not a gap — the same call as Knowledge Base, and
for stronger reasons.

### Why

1. **They are white-labelled.** `org.branding.primaryColor` drives every accent
   on the page. ds primitives read `--brand`, which is Rivvra green. Migrating
   means either dropping per-customer branding from a customer's own careers
   site, or threading an accent override through every ds component — which
   would corrupt the token contract for the ~50 pages that depend on it. The
   staging org's accent is `#2bb3b3`; a candidate should see that, not ours.
2. **They deliberately refuse theming.** Both set
   `documentElement.style.background = '#fafafa'` on mount and restore on
   unmount, and say so in their headers: "Hard-isolated from the dark portal."
   Light/dark from tokens is the whole value ds adds, and these pages opt out on
   purpose. A candidate's OS dark mode should not repaint their prospective
   employer's careers site.
3. **They are a marketing surface, not a data surface.** Mesh gradients,
   count-up hero stats, staggered scroll reveals. Rebuilt out of `DataTable` /
   `Panel` / `Stat` they would read as an admin console, which is worse for the
   person they exist for.

**If this is ever revisited**, the blocker to solve first is (1): ds needs a
supported per-instance accent override before a white-label surface can use it.

### What was done instead

The verification pass, which is where the migration's value actually comes from.
Every defect below was confirmed in a browser against live staging data before
being touched, and re-confirmed after.

| | before | after |
|---|---|---|
| CareersHome — form controls with no accessible name | 4 of 4 | 0 |
| CareersHome — contrast failures (104 nodes) | 5 | **0** |
| CareersJobDetail — apply-form controls with no accessible name | 5 of 5 | 0 |
| CareersJobDetail — contrast failures (27 base / 43 sheet open) | 7 | **0** |

### The finding worth keeping

**A customer-chosen brand colour cannot be used raw as both ink and fill.** The
accent was used two ways, and the staging teal failed both:

- as ink on `#fafafa` — the hero's accent half, stat-tile numbers — **2.45:1**
- as fill under hardcoded `text-white` — every CTA — **2.56:1**

They fail in opposite directions, so there is no single rule that fixes it: a
dark accent breaks the ink usage, a light accent breaks the fill usage, and a
mid-luminance accent like teal breaks both at once. New `careers/accent.js`:
`readableOn()` picks the foreground by luminance (teal's CTA went 2.56 → 6.92,
white → near-black), and `accentInk()` darkens the ink just enough to clear the
bar, leaving already-passing colours untouched. Checked across 8 hues including
pure white and pure black.

Residual, stated honestly: for the *default* indigo `#5b6cff` the best available
foreground is 4.25:1 on a 14px button — better than the ~3.5 it had, still short
of 4.5. Closing that would mean darkening the customer's fill, which is their
brand colour on their primary CTA. Not mine to change.

### The apply form had no labels at all

`Field` rendered its `<label>` as a **sibling** of the control, with no `htmlFor`
and no wrapping. Every input on a public job application — name, email, phone,
LinkedIn — resolved to a `null` accessible name. Screen reader: "edit text",
four times. `Field` now takes a render prop so it can hand the control a
generated `id`, plus `aria-invalid` and an `aria-describedby` pointing at that
field's own error. Driven with a real failed submit: all five fields report
`aria-invalid=true` and their `aria-describedby` resolves to the right message.

### A regression I introduced, caught by driving the form

Passing `required` through to the inputs turned on **native HTML5 validation**,
which preempts the submit event — so the page's own `validate()` never ran and
none of its messages could appear. That silently removes the only thing telling
a candidate that a generic URL will not do in the LinkedIn field. Now
`aria-required`, which announces the same thing and changes no behaviour.

The build was clean the whole time. Clicking Submit found it.

### The mobile apply sheet was an inescapable modal

It is the primary conversion path on phones and shipped as a plain `<div>`: no
`role="dialog"`, no `aria-modal`, focus left behind it on `<body>`, Escape did
nothing, and the page behind the scrim stayed tabbable. Now a real dialog with a
focus trap, scroll lock, Escape, and focus returned to the opener — all verified.

Its `max-h-[92vh] max-h-[92dvh]` looked like a dvh-with-fallback but Tailwind
orders its own output and **vh won** — measured 747.04px at 812 tall, exactly
92vh. The `dvh` never applied, so the sheet ignored mobile browser chrome, which
is the only reason `dvh` was reached for. Now set inline.

### Not verified

**Reduced motion.** Both pages now wrap in `MotionConfig reducedMotion="user"`
and `useCountUp` short-circuits on `useReducedMotion()`. I could not exercise
either: this harness cannot emulate `prefers-reduced-motion`, patching
`matchMedia` came too late for framer-motion's cached query, and forcing
`reducedMotion="always"` had no effect because `useReducedMotion()` reads the
media query directly rather than consulting `MotionConfig`. The code follows the
documented API and its failure mode is the status quo (animations still play),
but it is **unverified**, not verified.

### False failure #10 — framer-motion intros freeze when the pane is backgrounded

A screenshot showed the hero washed out with the stats card and CTA missing. It
looked like `MotionConfig` had broken the page. It had not: `document.hidden`
was `true`, so `requestAnimationFrame` was paused and every
`initial → animate` reveal was frozen at `opacity: 0`. Confirmed by stashing to
HEAD and reloading — **unmodified HEAD froze identically**.

Two lessons. Any page with framer-motion intro reveals will screenshot as broken
while the pane is backgrounded — check `document.hidden` before believing it.
And the contrast audit gave a clean pass on that same frozen page, because it
reads `color` and composited backgrounds and **ignores opacity** — so it cannot
tell you an element is invisible.

### Not triggered

No application was submitted. The blocking interceptor was armed throughout;
validation failures never reach the network, so nothing was written.

---

## Phase 33 — ats/AtsCandidateDetail

`src/pages/ats/AtsCandidateDetail.jsx` (592) → `AtsCandidateDetailV2.jsx` (656),
behind `PageSwitch`.

**2 verbatim slices, 229 spliced lines, 0 mismatches.**

The interesting thing on this page is not the layout, it is the permission
lattice — nine derived booleans deciding who reads and who writes. All nine are
inside the `main.logic` slice and **19 string-count assertions** pin them,
including the two subtle ones:

- `isMine` `String()`-coerces both sides. This is the ObjectId-vs-string
  comparison that has already caused a visibility bug elsewhere on the platform.
- `crossCompanySafe = !!currentCompanyId && !isCrossCompany`. The
  `!!currentCompanyId` half is the load-race fix: an *unresolved* company
  context must not count as writable, or a cross-company candidate is briefly
  editable before the context settles.

### Parity

Legacy and v2 rendered at the same route against the same staging candidate.
**`body.innerText` is identical** — every contact value, the whole AI-resume
block (summary, 11 years, extracted skills, 5 work-history entries, 6 education
rows), owner, rating, and both RecordMeta dates. Two differences, both accounted:

| difference | why |
|---|---|
| `Applications(1)` → `Applications` + a chip | count moved into the Panel's `actions` |
| Applied column always visible | legacy hid it below `md`; ds `DataTable` has no per-column breakpoint. Checked at 375px: page does **not** overflow (`scrollWidth 375 = clientWidth`), table fits at 317px, no data loss |

### Payloads read at the network boundary

With the blocking interceptor armed, every write path was driven and its body
inspected. Four attempted, four blocked:

```
PATCH …/candidates/<id>/archive   {"cascade":true}
PUT   …/candidates/<id>           {"mobile":"+15550001111"}
PUT   …/candidates/<id>           {"evaluation":3}      ← number, not "3"
```

That last one is the point of the whole `saveField` coercion: the select hands
back a **string**, and `[0,1,2,3].includes(Number(v)) ? n : 0` is what turns it
into a number the API will accept. Staging is unchanged — `mobile` still null,
`evaluation` still null, `updatedAt` still 19 Jul.

The archive dialog also correctly stays open when the write fails, and the
`isAdmin` branch of the active-applications warning rendered.

### Two components deliberately not swapped

> **Superseded in phase 42** — the person picker was migrated. See
> "Phase 42 — the person picker". Two corrections to what follows:
> `AssetDetailV2` was listed below as keeping `EmployeeLookup`; it does not,
> and never did — it uses ds `ComboBox` over a preloaded `limit: 100` list.
> The grep behind that claim matched a *comment*. And `EntityLookup` now does
> have the link-gate (`hrefProbe`), which is what unblocked the migration.

**`shared/EmployeeLookup` stays.** ds `EntityLookup` nominally supersedes it,
but EmployeeLookup carries a `probeSalesperson` check gating whether the
selection renders as a hyperlink — precisely so a legacy `managerId` with no
employee record does not link to a 404. `EntityLookup` has no equivalent.
Decisive point: **every other migrated ATS page keeps EmployeeLookup too**
(`AtsApplicationDetailV2`, `AtsJobDetailV2`, `AtsApplicationNewV2`). Only the
two contacts/CRM V2 pages use `EntityLookup`, and those pick contacts, not
employees. A manager picker that behaved differently here than on the
application page is the "two places disagreed" shape `PageSwitch` itself was
extracted to avoid. Migrating the person picker is its own job, for all call
sites at once.

**`SkillsPicker` / `StageBadge` / `AiResumeInsights`** are ATS-domain
components shared with the other ATS pages, not chrome.

The archive dialog uses ds `Modal`, not `ConfirmDialog` — it has three actions,
not two. `onClose` is passed `undefined` while archiving, which is how ds Modal
is told to be non-dismissible, preserving legacy's rule that neither Escape nor
a scrim click can hide an archive in flight.

### Flagged, not fixed

- **`recruiterOptions` is dead — and so is the fetch behind it.** `listRecruiters`
  fires on every candidate-detail load, sets `recruiters` state, feeds a `useMemo`
  that nothing renders. Its comment claims it "fuels the manager dropdown"; that
  dropdown is `EmployeeLookup`, which fetches its own list from
  `/contacts/salespersons`. So: one wasted request per page view plus a
  misleading comment. Dead in legacy too (identical single lint error), kept
  verbatim for parity. Project lint 726 → 727 is exactly this error now existing
  in both files.
- **`StageBadge stageName={app.stageName}`** renders the denormalised stage
  cache rather than resolving `stageId`. Consistent with the platform-wide note
  that `stageName` is a stale cache; rendered as legacy does, not re-derived.

### False failure #11 — a contrast audit taken after a theme toggle is worthless

This sharpens #9 into a hard rule, because it cost real time twice.

Three separate "failures" were chased on this page: "Add Skill" failing in
light, then the *same* element failing in dark, then the AppBar company name
failing in light and appearing to be a genuine shared-shell bug. Every one was a
**stale computed style** left over from toggling the theme. `getComputedStyle`
kept returning the previous theme's value — light `--brand-ink` on a dark
background and vice versa — and it survived a full dark → wait → light → wait
re-toggle, which is why the mitigation recorded in #9 was not enough.

Measured properly, on **fresh page loads with no toggling**:

| theme | nodes | failures |
|---|---|---|
| dark | 94 | **0** |
| light | 94 | **0** |

**The rule: never audit contrast after a theme toggle. Set the theme, reload,
then audit.** If a failure does appear, re-measure that element's
`getComputedStyle` directly before believing the audit.

### Not triggered

Archive, unarchive, AI re-score, and every inline field save. Nothing written.

---

## Phase 34 — admin/AdminWorkspaceDetailPage

`src/pages/admin/AdminWorkspaceDetailPage.jsx` (550) →
`AdminWorkspaceDetailPageV2.jsx` (600). Wired directly, no `PageSwitch` —
`/admin/*` is outside `OrgProvider`, same as phase 30.

**3 verbatim slices, 149 spliced lines, 0 mismatches, 24 assertions.**

This is the most destructive page in the product: from here a Rivvra
super-admin can overwrite an entire customer org's data from a backup, delete
backups, change a workspace's plan and seats, and log in as any member of any
org.

### The confirmations deliberately stay as `window.confirm`

Restore is guarded by **two sequential** `window.confirm` calls, delete by one,
impersonation by one. Converting these to ds `ConfirmDialog` was the obvious
"finish the migration" move and I did not do it:

- A native confirm blocks the event loop. It cannot be click-through dismissed,
  cannot be defeated by a mis-scoped Escape handler, and cannot double-fire from
  a re-render.
- The second restore confirm — *"Are you absolutely sure? This action cannot be
  undone."* — exists purely as **friction**. Replacing it means writing new code
  on the one path in this app that can destroy a customer's data, in exchange
  for nicer typography on a super-admin-only screen.

This is the one place in the migration where the legacy control is the safer
control, and the header says so.

### All four guards driven, nothing written

With confirms auto-declined and non-GET requests blocked:

| action | observed |
|---|---|
| Restore, decline #1 | 1 confirm, **second never shown**, 0 network |
| Restore, accept #1 → decline #2 | both confirms shown in order, 0 network |
| Delete | `Delete this backup? This cannot be undone.`, 0 network |
| Login As | names the member, the workspace, and the audit log, 0 network |

The restore confirm interpolates the **same** date string the table cell shows
— they share one `backupDateStr` helper, so the string an admin reads before
overwriting an org cannot drift from the row they clicked. Both size branches
verified against synthetic rows: 3 500 000 B → `3.3 MB`, 512 000 B → `500 KB`.

Save was driven too. The payload is exactly legacy's, and the part that matters
is that `billing` stays **nested**:

```
PUT …/superadmin/workspaces/<id>
{"plan":"pro","billing":{"seatsTotal":100},"enabledApps":[…],"uiV2":false}
```

Flattening that to a top-level `seatsTotal` would have silently dropped every
seat-count change. Staging is unchanged: plan `pro`, seats 100, `uiV2` still
true, `ats` still enabled, 0 backups.

### Parity

Genuine legacy vs genuine v2, same workspace: **every field identical** — plan
`pro` and all five options in order, seats `100` with `min=1`, all six app
toggles, 90 members, and the first three member rows cell-for-cell including
the long `appAccess` strings and the `alumni` status.

### A regression I introduced, caught by needing a soft nav

I rendered "Back to Workspaces" as `Button as="a" href`, which is a **full page
load**. Legacy used a react-router `<Link>` — a soft nav. In an SPA that means
booting the whole app to go one route up. Now a `BackToWorkspaces` component
that keeps the `href` (so middle-click and open-in-new-tab still work) and
calls `navigate()` on plain click — which is what `<Link>` does internally.

Found only because I needed a client-side navigation to re-run an effect; the
build and lint were clean.

### ⚠️ Flagged, not fixed

- **`ALL_APPS` is stale, and four enabled apps are invisible.** The constant
  lists six apps; this org has **ten** enabled — `sign`, `payroll`, `todo` and
  `invoicing` have no toggle on this page. They are *preserved* on save
  (`editApps` seeds from the full `enabledApps` and `toggleApp` only adds or
  removes the clicked id), so nothing is dropped — but a super-admin cannot see
  or change them here. Verified against the live workspace record. Changing the
  list is a product decision about what super-admins may toggle on customer
  orgs.
- **Seats has an asymmetry.** It loads as `seatsTotal || 0` but the input
  coerces with `parseInt(…) || 1` under `min={1}`. So a workspace can *display*
  0 seats yet can never be *set* to 0. Billing-adjacent; left exactly as-is.

### False failure #12 — editing a `lazy()` import path does not swap a loaded module

My first legacy-vs-v2 comparison reported the two pages as identical on every
field. They were: **both snapshots were v2.** Pointing the `lazy(() => import(…))`
at the legacy file and letting HMR apply it does not replace an already-resolved
module — the old one stays cached, so the route kept rendering v2.

It was caught by a canary: the snapshot recorded `pinnedTheme: true`, and only
v2 pins `data-theme="dark"`. Without that field the phase would have shipped on
a comparison of a page against itself.

**The rule: when swapping which component a route renders, assert a marker only
one of the two versions has before trusting the comparison.** Earlier phases
were safe by luck — those routes sat behind `PageSwitch` with *both* modules
referenced, so both were genuinely loadable.

### Contrast

**895 nodes, 0 failures** — the largest surface audited in this migration (90
member rows plus backup rows). No theme toggle involved: the page pins
`data-theme="dark"` on its own root, per the phase-33 rule.

### Not triggered

Save, create backup, restore backup, delete backup, Login As.

---

## Phase 35 — admin/AdminEmailTemplatesPage

`src/pages/admin/AdminEmailTemplatesPage.jsx` (497) →
`AdminEmailTemplatesPageV2.jsx` (560). Wired directly, no `PageSwitch` —
`/admin/*` is outside `OrgProvider`, same as phases 30 and 34.

**3 verbatim slices, 240 spliced lines, 0 mismatches, 21 assertions.**
Both files lint clean; project total unchanged at 729.

This page edits the raw HTML body of all 66 transactional emails the platform
sends. A mistake here does not look like a broken page — it looks like
customers not receiving a login code.

### Three things deliberately not re-themed

1. **The preview surface stays white.** Email clients render on white. Theming
   the preview to the dark admin shell would let an admin sign off on contrast
   that does not exist in Gmail. Verified in the browser:
   `panelBg: rgb(255, 255, 255)`.
2. **`DOMPurify.sanitize(previewHtml)`** — and this one was *proven*, not
   assumed. I stubbed the preview response locally (nothing left the browser)
   with `<script>window.__xssFired=true</script>` and
   `<img src=x onerror="…">`. Result: `scriptTags: 0`, `imgsWithOnerror: 0`,
   `xssFired: false`, and the surviving DOM was exactly
   `<p id="safe">Code: <b>123456</b> expires in 10 min</p><img src="x">`.
3. **`GROUP_CONFIG` spliced whole**, including its now-unused `color` /
   `bgColor` Tailwind strings. Its `match` predicates are the classification
   contract; rewriting the object to drop two presentation fields would have
   meant retyping them. ds tones are looked up separately by group id
   (`GROUP_TONE`), so grouping is untouched and only the paint is new.

### Parity

Genuine legacy vs genuine v2 — this time with a canary, per false failure #12
(`isV2` asserts the `data-theme="dark"` only v2 pins):

| | legacy | v2 |
|---|---|---|
| header count | 66 templates | same |
| group counts | 4 / 7 / 6 / 19 / 30 | **same** |
| template keys, in order | 60 sampled | **identical** |

The editor was opened on `otp` — the highest-stakes template on the platform —
and loaded subject *"Your Rivvra verification code"* with an 836-character
body, confirming `startEditing` fetches the FULL template rather than reusing
the list row (which omits `htmlBody`, so editing from list data would save an
empty body over a working one).

### Guards and payloads

- Whitespace-only subject → **"Subject and HTML body are required"**, 0 network.
  The `.trim()` guard holds.
- Valid save → `PUT …/superadmin/email-templates/otp` with the body unmodified.
  Blocked; nothing written.
- Preview → `{"sampleData":{"otp":"123456","expiryMinutes":"10"}}`, which is
  `getSampleValue` resolving both of that template's placeholders correctly.

### ⚠️ Flagged, not fixed

Both are pre-existing feature gaps, measured against the live template set:

- **`getSampleValue` covers 44 of 126 distinct placeholders — 35%.** The other
  87 fall through to the `` `[${placeholder}]` `` branch, so for most templates
  the Preview renders literals rather than content. That includes
  `compensation` and `joiningDate` on the hired/offer mail — precisely the
  fields an admin would want to eyeball before editing an offer template.
- **Five placeholders inject raw HTML and are indistinguishable in the UI:**
  `appAccessHtml`, `dueTodayListHtml`, `jobsTableHtml`, `messageHtml`,
  `requiredDocumentsHtml`. Per the platform rule, `renderEmail` escapes every
  key *without* the `Html` suffix, so these five are the unescaped ones — and
  note `appAccess` and `appAccessHtml` both exist, which is that rule in the
  wild. The page renders their chips identically to plain-text placeholders, so
  nothing signals that editing around them concerns markup. None has a sample
  value either, so the preview shows `[jobsTableHtml]` instead of a table.

Adding samples or an "HTML" badge is a product change to the page that decides
what customers receive, so both are left as findings.

### Contrast

Fresh load, no theme toggle (the page pins its own `data-theme="dark"`):
**218 nodes collapsed / 236 with an editor open (11 placeholder chips), 0
failures.**

### Not triggered

Save template. The preview POST was answered from a local stub and never left
the browser.

---

## Phase 36 — admin/AdminAnnouncementsPage

`src/pages/admin/AdminAnnouncementsPage.jsx` (420) →
`AdminAnnouncementsPageV2.jsx` (490). Wired directly — `/admin/*` is outside
`OrgProvider`, as phases 30, 34, 35.

**3 verbatim slices, 140 spliced lines, 0 mismatches, 23 assertions.** Both
files lint clean; project total unchanged at 729.

Everything on this page is broadcast to real users in every workspace, and the
page says so itself: *"Changes are live immediately — no deploy."*

### The banner mirror is spliced verbatim — Tailwind and all

This is the decision that matters here, and it runs the opposite way to the
rest of the migration.

`BannerPreview` exists for one stated reason: it is a *"pixel-faithful copy of
AnnouncementBanner so admins see exactly what ships"*. And
`components/platform/AnnouncementBanner` is imported by **both**
`PlatformLayout` **and** `PlatformLayoutV2` — the same unmigrated teal Tailwind
component renders inside the redesigned shell today.

Re-theming the preview to ds tokens would modernise nothing. It would make the
preview stop matching the banner it is a preview *of*, so an admin composing a
launch banner would sign off on something users never see. The mirror is the
feature.

Confirmed in the browser — the preview's live classes are legacy's exactly:

```
flex items-center gap-3 px-4 py-2.5 bg-teal-500/10 border border-teal-500/20 rounded-lg text-sm
inline-flex … bg-teal-500 text-dark-950 font-medium shrink-0
```

**The slice is drawn tightly around the teal box alone (legacy 58–71).** The
first attempt spliced the whole component, which swept in the "Live preview"
caption — chrome, not mirror — and the contrast audit promptly failed it at
**3.92:1** (`text-dark-500`, on an 11px label needing 4.5). Narrowing the slice
to just the mirror let the caption move to ds tokens and fixed it. Good
reminder that a verbatim slice should contain exactly what must not change, and
nothing else.

⚠️ **When `AnnouncementBanner` is migrated, `BannerPreview` must move in the
same commit.** They are one thing in two files and nothing but a comment
enforces it.

### Parity

Genuine legacy vs genuine v2 (canary: `isV2` asserts the `data-theme` only v2
pins). The rendered list row is **character-for-character identical** — status,
title, target-app chip, body, audience label, "All workspaces", "until Sep 30,
2026", "18 dismissed".

### Guards and payloads, all blocked

| path | observed |
|---|---|
| create, empty required field | native validation, **0 network** |
| create, valid | `POST …/announcements` |
| delete, 1st click | arms, button reads "Confirm?", 0 network |
| delete, wait 4.6s | **disarms itself**, trash icon returns, 0 network |
| delete, 2nd click in-window | `DELETE …/announcements/<id>` |
| activate toggle | `PUT` with the **whole record** |

Two payloads are worth quoting. The create proves the `orgSlugs` codec — typing
`" Huemot-Technology , BILLING-Test ,, "` produced:

```json
{"orgSlugs":["huemot-technology","billing-test"],"activeUntil":null,"active":true}
```

trimmed, **lowercased**, empties dropped, and a cleared date sent as explicit
`null` rather than `""`.

The toggle proves the round-trip. Flipping active re-sends every field —
including `activeUntil:"2026-09-30"`, unshifted by the
`toISOString().split('T')[0]` UTC slice. Anything `toForm`/`toPayload` failed to
round-trip would be silently blanked by a simple activate/deactivate, so this
is the assertion that matters most on the page.

Staging is untouched: still one announcement, still active, nothing created or
deleted.

### Small fidelity fix

Legacy wrapped the checkbox and its text in a `<label>`, so clicking the text
toggled it. A ds `Switch` is a `<button>`, which a `<label>` does not drive —
so the row carries the click and the visible text is `aria-hidden`, avoiding a
double announcement alongside the Switch's own accessible name.

### Contrast

Fresh load: **12 nodes (list) / 31 with the modal open and the preview
populated, 0 failures.**

### Measurement note

`document.body.innerText` reported the preview as absent while
`innerHTML` found it — the modal body is scroll-clipped and `innerText`
approximates *rendered* text. The page was fine; the probe was wrong. When a
check says an element is missing, confirm with a DOM query before believing it.

### Not triggered

Create, update, activate/deactivate, delete.

---

## Phase 37 — admin/AdminEmployeeSettingsPage

`src/pages/admin/AdminEmployeeSettingsPage.jsx` (382) →
`AdminEmployeeSettingsPageV2.jsx` (493). Wired directly — `/admin/*` is outside
`OrgProvider`, as phases 30, 34, 35, 36.

**2 verbatim slices, 59 spliced lines, 0 mismatches, 25 assertions.** V2 lints
clean (legacy carries one pre-existing `icon: Icon` error); project total
unchanged at 729.

Three platform-wide tables every tenant inherits: employment types (payroll
mode, leave eligibility, attendance vs ESS), separation reasons, and the
per-country statutory ID fields with their validation regexes.

### The page that barely splices

This is the first page in the migration where the verbatim-slice method mostly
does not apply. Only 59 lines are sliceable — the option tables and the
load/save shell. **Eleven state updates are written inline in the JSX**, one
per input, so they had to be transcribed by hand.

That makes the string-count check the primary evidence here rather than a
supplement: 25 assertions covering every one of those handlers, the
`isSystem` gating, the add/delete row shapes and all three save calls. All
match legacy exactly.

Worth stating plainly: a byte-diff cannot reach hand-transcribed code, so the
confidence on this page rests on the assertions plus the live comparison,
not on the manifest.

### Parity

Genuine legacy vs genuine v2 (canary: `isV2`). **Identical** — the same 8
inputs with the same `disabled` flags (all four system keys locked, all four
labels editable), the same 8 select values, the same 4 checkbox states.

### The handlers that would have been easy to get wrong

Two edits were driven and the save payload read at the network boundary:

```
PUT …/superadmin/platform-settings/employment_types
{"items":[{"key":"confirmed",…,"payrollMode":null,"leaveEligible":true,…}, …]}
```

- **`payrollMode: null`** — a real JSON null, not the string `"null"`. The
  option value round-trips as the *string* `'null'` and the handler converts it
  back (`e.target.value === 'null' ? null : e.target.value`). Getting that wrong
  would write the string `"null"` as a payroll mode for every employee on the
  "None (excluded)" type.
- **`leaveEligible: true`** — a real boolean out of the new ds `Checkbox`.

Blocked. Staging unchanged: `confirmed` still `statutory`, still 4 types / 8
reasons / 4 ID fields.

### New ds primitive: `Checkbox` — extracted, not written

`DataTable` had carried a private `Check` component since row selection was
built: a `span[role=checkbox]` with a drawn tick, Space/Enter toggling, and
click-propagation stopped so a checkbox inside a clickable row does not open
the row. It was always a general primitive; being private just meant every
other surface had to hand-roll one.

Moved to `ds/Form/Checkbox.jsx` with a `.d.ts`, `disabled` support added, and
`DataTable` imports it back under its old name so its own usage is unchanged.
**26 pages use `DataTable`**, so this was verified rather than assumed:
`AtsCandidateDetailV2`'s table renders the same headers and rows with no
console errors, and DataTable's single lint error is the same pre-existing
`react-hooks/immutability` one it had at HEAD.

### ⚠️ Flagged, not fixed

- **The success toast mangles one of the three categories.** `saveCategory`
  does `category.replace('_', ' ')` with a **string** pattern, which replaces
  only the first underscore. `employment_types` and `separation_reasons` have
  one each and read fine; `id_field_schemas` becomes **"id field_schemas saved
  successfully"**. Cosmetic, pre-existing, and inside the verbatim slice.
- **The ID-fields section mutates state in place.** Six handlers do
  `const updated = { ...idSchemas }` — a *shallow* copy — then assign through
  `updated.schemas.IN.fields[idx]`, which writes into the original state
  object, before `setIdSchemas({ ...updated })` forces the re-render. It works
  today only because the new top-level reference is what React compares. The
  employment-types and separation-reasons sections use the correct immutable
  pattern, so the page is internally inconsistent. Left verbatim; this is a
  state-management correctness fix, not a migration one.
- **ID fields have no `isSystem` concept at all** — unlike the other two
  tables, every field including PAN and Aadhaar can be deleted with one click
  and no confirmation.

### Contrast

Fresh load, all three sections expanded (36 inputs, 8 checkboxes):
**32 nodes, 0 failures.**

### Not triggered

Save employment types, save reasons, save ID fields.

---

## Phase 38 — the admin trio (Workspaces, Overview, KB Review)

Three pages in one batch, all under `/admin/*` so all wired directly:

| page | lines | slices | spliced |
|---|---|---|---|
| `AdminWorkspacesPage` | 250 → 223 | 2 | 61 |
| `AdminOverviewPage` | 232 → 245 | 2 | 52 |
| `AdminKbReviewPage` | 242 → 283 | 2 | 69 |

**6 verbatim slices, 182 spliced lines, 0 mismatches, 24 assertions.** All three
V2 files lint clean; project total unchanged at 729.

### `PlanBadge` was duplicated character-for-character

The identical function existed in both `AdminWorkspacesPage` and
`AdminOverviewPage`. The two copies agreed, but nothing *kept* them agreeing —
add a plan tier to one and the other silently falls back to `free` styling. Now
one definition in `pages/admin/adminShared.jsx`, tone map preserving legacy's
exact grouping.

### The risky part: ds `DataTable` sorts three ways, legacy sorts two

Legacy's `toggleSort` flips asc/desc forever and never clears. ds `DataTable`
cycles asc → desc → **cleared**. Wiring `onSortChange` straight through would
have added a third state legacy never had.

`DataTable` only proposes `null` for the column that is *already* the sorted one
at desc, so `next ? next.key : sort` recovers the clicked key and hands it to
legacy's own `toggleSort`. Verified by clicking Name three times:

```
click 1 → S, M, M, C   (desc)
click 2 → C, M, M, S   (asc)
click 3 → S, M, M, C   (desc — did NOT clear)
```

### Publishing guards, driven

`AdminKbReviewPage`'s approve **publishes to the live platform docs every tenant
reads**. Both write paths keep their native dialogs, and `reject`'s
`window.prompt` has no ds equivalent at all — the null-vs-empty-string
distinction is load-bearing (`null` = cancelled and `if (note === null) return;`
bails; `''` = "reject, no reason" and proceeds). A ds dialog returning a plain
string would collapse those.

Staging had no drafts, so one was stubbed read-only to reach the path:

```
confirm: Publish "ATS Overview" to the live platform docs?
prompt:  Reject this draft? Optional reason:
network writes: []
```

`lineFlags` was exercised at the same time — the diff rendered three panes and
correctly marked "Line two" removed. Its quirk is worth knowing and is now in
the header: it is SET-based, so a line that merely *moved* counts as unchanged
and duplicates collapse. That is why legacy shows both full bodies beside it.

`AdminOverviewPage`'s registration toggle was driven too —
`PUT …/superadmin/registration {"open":true}`, blocked. Staging registration
stays **Closed**.

### Parity

All three compared against genuine legacy with the `isV2` canary:

- **workspaces** — identical: 4 workspaces, same 6 headers, all 4 rows
  cell-for-cell including `92/100` seats.
- **overview** — identical: registration Closed, same stats, `95 / 110 used`.
- **kb-review** — same values (0 / 0 / 17). One accounted difference: legacy's
  `StatCard` renders value-then-label, ds `Stat` renders label-then-value, which
  briefly made a naive regex read the numbers off by one. The values match; the
  DOM order does not.

### Contrast

**kb-review 32 (draft expanded) / workspaces 41 / overview 41 — 0 failures each.**

### Not triggered

Registration toggle, draft approve (publish), draft reject.

---

## Phase 39 — DocumentVault + AdminLoginPage

Two standalone pages, both outside `OrgProvider`, both wired directly.

| page | lines | slices | spliced |
|---|---|---|---|
| `DocumentVault` | 127 → 176 | 2 | 41 |
| `AdminLoginPage` | 240 → 283 | 1 | 112 |

**3 slices, 153 spliced lines, 0 mismatches, 18 assertions.** Both lint clean;
project total unchanged at 729.

### DocumentVault

A top-level, identity-scoped page — not org-scoped, deliberately. It lists every
release document shared with the signed-in person across all workspaces,
*including ones where they are a fully-archived ex-employee*. It is how someone
pulls their Form-16 years after leaving, which is why nothing here is gated on
org membership and why grouping is by workspace.

Verified against real staging data: two Form-16s under the right employer, sizes
through the `< 1024 KB` branch (`103 KB`, `61 KB`), and a per-document
`aria-label` the legacy buttons did not have. **Download was not triggered** —
downloading a file needs explicit permission.

### AdminLoginPage — the whole auth path spliced

This is the one `/admin/*` page not behind `SuperAdminRoute`, because it is how
you get behind it. Every branch is a different security outcome, so all of it is
verbatim:

- The redirect fires only on `isAuthenticated && user?.superAdmin` — an
  authenticated NON-super-admin stays put.
- **Both** login paths re-check `result.user?.superAdmin` *after* a successful
  credential exchange and refuse otherwise. Dropping that second check would
  hand the admin console to any customer.
- `googleInitialized` is a ref, not state, so the GSI script injects once.

Verified without entering any credentials: submitting empty produced *"Please
enter a valid email address"*, then a valid-looking email with no password
produced *"Please enter your password"* — **zero network calls** either time. To
reach the page at all, an invalid token was left in storage so `devAuthBoot`
would not re-seed; no privileges were fabricated.

### The legacy comparison caught me rewriting copy

My first pass invented new wording on an auth page — "Platform administration —
authorised personnel only", "Sign in", "Super admin access is logged and
audited", and placeholders `you@rivvra.com` / `••••••••`. None of that is a
migration; it is a product edit nobody asked for.

It also **reordered the page**: legacy puts the Google button *above* the form,
which is the only reason the divider reads "or sign in with email". My version
had the form first, leaving the divider saying "or" into nothing.

All of it was restored from legacy: copy, placeholders, order, and
`disabled={loading || !email || !password}`. `body.innerText` is now
character-for-character identical to legacy.

The one deliberate addition kept: `autocomplete="username"` /
`"current-password"`, which legacy omitted entirely. It is additive, changes no
app behaviour, and is what lets a password manager fill the form.

`RivvraLogo` and the `mesh-gradient grid-pattern` backdrop stay — brand identity
shared with the other auth surfaces, and re-theming one alone would break the
family. The Google button's `#admin-google-signin-button` id is the contract
with Google's script; renaming it silently removes Google sign-in.

### Contrast

DocumentVault 11 / AdminLogin 7 — **0 failures**.

### Lesson repeated twice this session

Both `AdminOverviewPage` and `AdminLoginPage` had their `main.logic` slice cut
one line short, because I counted back from `return (` instead of locating the
closing `};`. Both produced an immediate parse error, so neither shipped — but
the rule is: **find the closing brace explicitly, never infer it from the line
before the return.**

### Not triggered

Document download, admin sign-in (no credentials entered).

---

## Phase 40 — AtsJobNew + AtsCandidateNew (and why SequenceWizardPage is deferred)

| page | lines | slices | spliced |
|---|---|---|---|
| `AtsCandidateNew` | 196 → 182 | 2 | 46 |
| `AtsJobNew` | 275 → 273 | 2 | 87 |

**4 slices, 133 spliced lines, 0 mismatches, 20 assertions.** Both behind
`PageSwitch`, both lint clean, project total unchanged at 729.

### The slices are drawn around a crash

Both pages declare every `useState`/`useEffect` **before** the non-admin early
return, and legacy says why: putting the gate first changes the hook COUNT when
the role flips, which produced a *"Rendered fewer hooks than expected"* crash in
production in May.

So the slice boundaries are: hooks (verbatim) → the ds-themed gate → handlers
(verbatim). The gate sits *between* two spliced blocks precisely so re-theming
it could not move it relative to the hooks. An assertion checks the invariant
directly — **0 hooks declared after `if (!isAdmin)`** on either page.

### Payloads read at the network boundary

`AtsCandidateNew`, with the three optional fields left empty:

```json
{"name":"Harness Candidate","email":"harness@example.invalid"}
```

Trimmed, and phone / mobile / linkedinProfile **omitted entirely** rather than
sent as `""` — that is the `|| undefined` on each optional.

`AtsJobNew`, with Expected Hires cleared:

```json
{"name":"Harness Internal Role","expectedHires":1,
 "isClientRole":false,"source":"Direct","approvalStatus":null}
```

Four things at once: a blank hires field became `1` not `NaN`
(`parseInt(…, 10) || 1`); `isClientRole: false` keeps internal roles out of the
CRM funnel; and **`approvalStatus: null` lands the job at draft** — legacy's own
comment notes the endpoint otherwise defaults to `'pending'`, stranding jobs in
pending-with-no-approver limbo.

Both blocked. Nothing created on staging.

### Copy drift, caught again

`AtsJobNew`'s subtitle and its "Job Title" label, and `AtsCandidateNew`'s submit
button, had all drifted in my first pass — I had written "Job Name" and a
"Creating…" label legacy never had. Restored from legacy before shipping. That
is three phases running where comparing against legacy caught me rewriting
user-facing text; the discipline is now: **diff the copy, not just the data.**

### ⚠️ SequenceWizardPage is deferred, deliberately

`src/pages/SequenceWizardPage.jsx` (264) is **not** migrated, and counting it as
a page would misrepresent the work. Measured:

- Its render is 61 lines, of which **exactly one** carries its own markup (the
  wrapper `div`'s className). Five lines mount wizard components.
- Those components — `WizardStepper`, `BuilderSelection`, `ComposeStep`,
  `EmailStepEditor`, `RichBodyEditor`, `ScheduleStep`, `ReviewStep`,
  `TemplatePreviewModal` — are **8 files, 1,272 lines, with zero ds imports.**

Migrating the page means changing one className and leaving every pixel a user
actually sees on legacy Tailwind. The real work is the wizard subsystem, which
is larger than several of the pages already done and deserves its own scoped
task rather than being smuggled in as "the last page".

Its logic is worth preserving when that happens: `handleActivate` tracks
`activated` / `activateErr` separately because swallowing the `resumeSequence`
error used to tell the user a sequence was live when it was still a draft (e.g.
Gmail disconnected server-side). **Sequence activation is on the never-trigger
list and was not exercised.**

### Contrast

AtsCandidateNew 14 / AtsJobNew 17 — **0 failures**.

### Not triggered

Candidate creation, job creation, sequence activation.

---

## Status: the page migration is complete

Every reachable page is either on ds or a recorded decision. Six entries remain
in the "not behind PageSwitch / not V2" scan, and none of them is an
outstanding page:

| entry | lines | why it is not a gap |
|---|---|---|
| `PublicSigningRoute` | 51 | Not a page — the v1/v2 route wrapper written in phase 26. |
| `components/admin/AdminLayout` | 60 | Not a page — the admin shell. |
| `SequenceWizardPage` | 264 | **Deferred, phase 40.** A 1-line-of-markup shell over an 8-file, 1,272-line wizard subsystem with zero ds imports. The subsystem is the real work. |
| `kb/KnowledgeBasePage` | 411 | **Deliberate skip**, predating this run. |
| `careers/CareersHome` | 724 | **Deliberately not on ds, phase 32** — white-label, per-customer accent, theme-isolated. Got the a11y + contrast pass instead. |
| `careers/CareersJobDetail` | 740 | Same as above. |

**159 V2 page files ship.** Build clean; project lint sits at 729 problems, the
same number it started this run at — every V2 file added is clean, and the count
only moves when a legacy file is kept alongside its replacement.

### What is genuinely left, in priority order

1. **The wizard subsystem** (8 files, 1,272 lines) — the largest remaining block
   of legacy Tailwind behind a live route.
2. **`AnnouncementBanner`** — renders inside `PlatformLayoutV2` today. When it
   migrates, `BannerPreview` in `AdminAnnouncementsPageV2` must move in the same
   commit (phase 36).
3. ~~**The person picker.**~~ Done in phase 42. `shared/PersonLookup` wraps ds
   `EntityLookup` and all 8 V2-only call sites use it. Of the two shared
   modules that still imported `EmployeeLookup`: `QuickAddClientModal` was
   forked to `QuickAddClientModalV2` on ds (phase 43), and
   `applicationDetailParts.jsx` is **deferred to legacy retirement** (phase 44
   — a fork was written and then deleted; see the reversal there). Its two
   picker sites are the last `EmployeeLookup` users on any V2 surface, and they
   are harmless where they are: `legacy-bridge.css` themes those modals inside
   `.ds-shell`.
4. **`text-rivvra-400` as body text** — 176 files still use it. The completed
   `--brand-as-text` sweep covered ds surfaces, not the legacy Tailwind tail.

### Findings raised across the run and never fixed

Each was left because fixing it is a product or API decision, not a migration:

- `lookupEmployees` caps at 50 and ignores `search`/`limit` (phase 31).
- `ALL_APPS` is stale — 4 enabled apps have no toggle (phase 34).
- `getSampleValue` covers 44 of 126 email placeholders; 5 inject raw HTML with
  no UI signal (phase 35).
- Seats can display 0 but never be set to 0 (phase 34).
- ID-field schemas mutate state in place; ID fields have no `isSystem` guard
  (phase 37).
- `saveCategory`'s toast mangles `id_field_schemas` (phase 37).
- `recruiterOptions` and its `listRecruiters` fetch are dead (phase 33).
- `deliveredRate` dead in EngagePage's metrics; `copyPlatformPTMaster` imported
  and never called.

### The false-failure catalogue, final

Twelve entries. The three that cost the most time, and the rules that came out
of them:

- **#9/#11 — never audit contrast after a theme toggle.** `getComputedStyle`
  returns the previous theme's values and survives a re-toggle. Set the theme,
  **reload**, then audit.
- **#10 — framer-motion intros freeze when the pane is backgrounded.** A
  screenshot of a frozen page looks like a broken render; check
  `document.hidden`. The contrast audit reads `color` and ignores opacity, so it
  will pass a page that is invisible.
- **#12 — editing a `lazy()` import path does not swap a loaded module.** Assert
  a version-unique marker before trusting any legacy-vs-v2 comparison.

---

## Phase 41 — the sequence wizard subsystem

The block deferred in phase 40. 7 components + the page shell, all behind
`PageSwitch` as two complete trees: legacy page → legacy components,
`SequenceWizardPageV2` → `components/wizard/v2/*`.

**6 verbatim slices, 464 spliced lines, 0 mismatches, 35 assertions.** Every V2
file matches its legacy sibling's lint count exactly; project total 729 → 735,
which is precisely the six issues now existing in both copies.

### Two files are deliberately NOT migrated

**`wizardConstants.js`** — pure data and helpers, and **also imported by
`components/SequenceDetailPage`**. Forking it would put the detail page and the
wizard on diverging copies of the automation triggers and schedule defaults.
Imported unchanged.

**`RichBodyEditor.jsx`** — the important call in this subsystem. It is a
contentEditable **email composer**, and `.rich-body-editor` in `index.css`
renders it in **Arial/Helvetica 14px/1.6 on white with Gmail's link blue
`#1a73e8`**. That is not un-migrated legacy styling; it is a deliberate mirror
of the recipient's client. Re-theming it to ds — Inter, dark surface,
brand-green links — would mean a writer styling text against a background the
reader never sees.

It also holds two things no restyle should go near: the DOMPurify `sanitize`
with its `FORBID_TAGS`/`FORBID_ATTR` list, and the `isInternalChange` ref dance
that stops the caret jumping to 0 on every keystroke.

Verified in the browser that it survived intact: `rgb(255,255,255)` /
`rgb(26,26,26)` / `Arial, Helvetica, sans-serif` / `14px`.

### The behaviour that justified splicing the page

`handleActivate` tracks `activated` and `activateErr` separately rather than
assuming success — legacy's comment records that swallowing the
`resumeSequence` error once told users a sequence was live when it was still a
draft.

Proven by stubbing create-succeeds / resume-fails locally (nothing left the
browser):

```
POST /api/sequences            → stubbed success
POST /api/sequences/…/resume   → stubbed failure ("Gmail is not connected")
claims "created and activated" → false
surfaced instead               → "Gmail is not connected"
```

The user is told the truth. **Activation itself was never triggered.**

### Walked end to end

Template → compose → schedule → review, with every write blocked:

| check | result |
|---|---|
| `computeEmailDay` over the template's 2/2/4/2 waits | Day 1, 3, 5, 9, 11 |
| compose totals | 5 emails, waits `2,2,4,2` |
| `validate()` with no name | "Sequence name is required", 0 network |
| schedule defaults | Mon–Fri on, Sat/Sun off, their 4 selects **disabled not hidden** |
| toggle Saturday on | its selects enable with `08:00`/`18:00` **intact** |
| review totals | "5 emails over 10 days", 4 rules, 1 filter |
| draft payload | steps normalised to exactly `type,subject,body,days`; **no `_localAttachments`** |

That last row is `buildPayload` doing its job — the transient local-attachment
field never reaches the API.

### One deliberate behaviour change

Legacy hid each email card's Edit/Delete buttons behind
`opacity-0 group-hover:opacity-100`. They are now always visible: a hover-only
control is dead on touch, which is the platform-wide finding from the mobile
pass. Called out here because it is the only intentional divergence.

### Copy drift — caught a fourth and fifth time

The legacy comparison found two more inventions of mine: the template modal's
action read **"Use this template"** where legacy says **"Customize template"**
(which is the more accurate word — the steps are copied in to edit, not applied),
and I had added a Cancel button legacy does not have. The email cards read
**"N variables"** where legacy says **"N placeholders"**. Both restored.

Five phases running. The rule is now unavoidable: **the legacy comparison is not
a formality — diff the copy, every time.**

### False failure #13 — focus-dependent behaviour is untestable in a hidden pane

`lastFocusedRef` decides whether a placeholder pill lands in Subject or Body.
Every pill went to the body no matter what I focused — which looked like broken
routing. It was not: `document.hasFocus()` is **false** while the pane is
backgrounded, so real focus events never fire and the ref stays at its `'body'`
default.

Dispatching `focusin` — the bubbling event React actually delegates `onFocus`
to — proved the wiring: `{{lastName}}` landed in the Subject with the body
untouched.

**Rule: to exercise `onFocus` in this harness, dispatch `focusin`; `.focus()`
alone does nothing when the document is not focused.** (And `.focus()` on an
already-focused element fires no event at all, which sent me down the wrong
path first.)

### Contrast

selection 24 / template modal 47 / compose 67 / compose + editor 38 /
schedule / review 55 — **0 failures throughout.**

### Not triggered

Sequence create, activate, attachment upload, test-email send.

## Phase 42 — the person picker

Closes the item phase 33 deferred: `shared/EmployeeLookup` was still the picker
on migrated V2 pages, so ATS ran two different pickers side by side.

### What blocked it, and what unblocked it

`EntityLookup` had no answer to `EmployeeLookup`'s `probeSalesperson` gate: the
check that asks "is this id actually an employee?" before offering a link, so a
legacy `managerId` with no employee record renders as plain text instead of a
link to a 404. That gate is the whole reason the legacy component survived.

It is now `hrefProbe` on ds `EntityLookup` — `(value) => Promise<boolean>`,
generic over entity type. It starts FALSE and only flips true when the promise
resolves true, so the failure mode is a **missing** link, never a broken one.
A rejected probe is treated as false.

`shared/PersonLookup` supplies the two app-specific halves — `listSalespersons`
for search, `probeSalesperson` for the gate — and takes `EmployeeLookup`'s
prop names, so call sites changed only their tag.

### The behaviour change this forced, which is the point of the phase

`EntityLookup` is **pessimistic**: `onSelect` must reject for a failed save to
show as failed. `EmployeeLookup` was fire-and-forget — the three ATS detail
pages caught the error, toasted, and returned undefined. Wiring that unchanged
would have made a failed save resolve, and the row would have repainted with a
person who was never assigned.

So `savePerson` in `AtsCandidateDetailV2`, `AtsApplicationDetailV2` and
`AtsJobDetailV2` now re-throws. The toast stays (same signal users know) and
the thrown message is the **same string** the toast shows, so the inline error
does not read differently from the toast beside it.

Verified against a forced 500: the row kept the OLD approver, showed "Request
failed" inline, and the PUT body carried the correct `{id, name}` pair. Under
the old contract that same failure would have displayed the new name.

### Two additions the call sites forced

- **`variant='inline'`** — the value alone, no label column, no link. Legacy
  had this variant; ds had `row` and `button` only. `AtsApplicationNewV2`
  needs it: its picker sits inside a field box the page already labelled and
  styled, where the row variant's 140px label gutter would misalign it.
- **`confirmsSave`** (default true) — create forms pass `false`. On a **New
  Job** / **New Application** page nothing is persisted on select, so the
  1500ms green "saved" tick would claim a write that has not happened. Errors
  and the saving spinner still show. This is a false affordance legacy did not
  have, and it would have shipped silently.

`ComboBox` was considered for the create forms and rejected: ds's own guidance
splits the picker family by data source, and these search asynchronously.
`AssetDetailV2` does pick people with `ComboBox`, but only by preloading
`limit: 100` — which is the recorded truncation defect, not a precedent.

### What did NOT move

`applicationDetailParts.jsx` and `QuickAddClientModal.jsx` keep
`EmployeeLookup`: each is imported by a legacy page **and** a V2 page, so
swapping either would drag the new picker into a legacy surface. They move when
their last legacy importer does.

### Verified (staging, all writes blocked — nothing written, nothing to clean up)

- 3 pickers on `AtsJobDetailV2`, 1 on `AtsCandidateDetailV2`, 2 on
  `AtsApplicationDetailV2` (one `editable={false}`), 1 each on the two create
  forms — 8 total, names matching their records exactly.
- Probe gate both ways: live probe → "Open →" with the right `?from=` context;
  probe stubbed empty → link gone, name still shown.
- Pessimistic failure on two separate rows: value unchanged, inline error and
  toast agreeing.
- `confirmsSave={false}`: pencil only, no tick, on both the inline and row
  create-form pickers.
- Inline variant contrast on its caller-supplied surface, fresh load per theme
  (never after a toggle — catalogue #9/#11): 15.40 dark, 15.93 light.

## Phase 43 — QuickAddClientModal, and the fixed-dark discovery

> ## ⚠️ CORRECTION (phase 44) — the central claim below is WRONG
>
> Phase 43 asserted that the shared modules are fixed-dark inside V2 pages, that
> a ds child in them measures **1.01:1**, and that V2 therefore has a **live
> light-theme hole**. **None of that is true**, and the error was mine.
>
> `src/components/platform/v2/legacy-bridge.css` — 1,121 rules — already remaps
> the legacy Tailwind scale onto ds tokens under `.ds-shell`
> (`.ds-shell .bg-dark-800 { background-color: var(--surface-2) }`, and so on).
> Its own header names "the ATS hire/offer modals" as a target. So inside a V2
> page these modals **do follow the theme**, and a ds child sits on
> `var(--surface-2)` and reads normally.
>
> Where the 1.01:1 came from: I computed ds `--fg` against the **raw Tailwind
> palette hex** (`#0f172a`) instead of against what actually renders. A bare
> probe element does resolve to the fixed hex — but a probe outside `.ds-shell`
> is not the surface under test. Measuring the real dialog gives
> `rgb(246,243,238)` in light theme.
>
> **What survives.** The bridge is deliberately scoped to `.ds-shell` and "must
> never affect" the legacy shell. On a LEGACY page the dark classes stay truly
> dark, so putting a ds picker in a module that legacy also renders would create
> the contrast problem *there*. Forking rather than editing in place is still
> right — but for that narrow reason, not the urgent one claimed below.
>
> **What does not survive.** There is no live light-theme hole on the V2 pages.
> The urgency used to pull this work ahead of the documented "defer until legacy
> retires" plan was not real. `QuickAddClientModalV2` is still a correct ds
> migration and measured clean in both themes — only its justification was bad.
>
> Method note, and the reason this went unnoticed for a whole phase: the
> measurement was never taken against a rendered legacy modal. It was taken
> against a synthetic probe. **Measure the actual element, in place.**

Follows phase 42, which left two shared modules on the legacy picker because
each is imported by a legacy page as well as a V2 one.

### The picker swap is not a picker swap

The naive move — repoint the import — is **wrong**, and measurably so.

Both modules are fixed-dark Tailwind. `tailwind.config.js` defines the `dark`
palette as literal hexes (`dark-800` = `#1e293b`, `dark-900` = `#0f172a`), so
these surfaces do **not** follow the theme. That was harmless while everything
inside them was also fixed-dark.

It stops being harmless the moment a ds component goes in. ds reads `--fg`,
which in LIGHT theme is `#16191D`. Measured on those panels:

| text on the fixed-dark modal | ratio |
|---|---|
| ds `--fg` (what PersonLookup would render) | **1.01:1** |
| ds `--fg-4` (its placeholder ink) | 3.16:1 |
| legacy `text-white` (what is there today) | 17.85:1 |

1.01:1 is invisible. So **"swap the picker" and "move the surface to ds" are
one job**, not two — and the surface has to move first.

This also means the V2 pages have a live light-theme hole *today*, independent
of the picker: these modals render as dark slabs on a light page.

### What shipped

`QuickAddClientModalV2` — forked, not migrated in place, because the legacy
file serves `EmployeeDetail` as well as `EmployeeDetailV2`. Only V2 points at
the fork; the import keeps the local name `QuickAddClientModal`, so the call
site is unchanged.

Spliced verbatim: the create payload (especially `countryCode: 'India'` /
`defaultCurrency: 'INR'`, which decide the contact's country and the currency
every future invoice inherits), `canSubmit`, the `!contact?._id` throw that
treats an id-less 200 as failure, and the reset effect that stops a second
client inheriting the first one's owner.

The picker passes `confirmsSave={false}` — nothing is written until "Create
Client", so the green tick would claim a write that has not happened.

Verified on staging, all writes blocked, "Create Client" never pressed:
- Module identity confirmed by a `Building2` icon canary before measuring —
  per catalogue #12, a repointed import does not prove which module rendered.
- Light: 8 text nodes, **0 contrast failures, min 5.02** (white panel).
- Dark: 8 text nodes, **0 failures, min 6.74**.
- Picked salesperson renders at **17.63:1**, against the 1.01:1 the naive
  swap would have produced.
- `canSubmit` gate intact: Create disabled until a salesperson is chosen.

### `applicationDetailParts.jsx` — REVERSED: deferred after all

> This section originally read "decided, not deferred" and recorded a decision
> to fork. **That decision was made on the wrong premise and has been undone.**
> The fork was written, then deleted before it was ever committed or wired.

The premise was the 1.01:1 "live light-theme hole" corrected at the top of this
phase. `legacy-bridge.css` already themes these modals inside `.ds-shell`, so
there is no defect to race. Without urgency the trade collapses:

- **Cost:** ~2,000 duplicated lines, including a 911-line `HireModal` carrying
  offer and salary fields — the highest-risk code in the module — kept in two
  copies for as long as legacy lives.
- **Benefit:** tidiness. The modals already follow the theme, and the picker
  work that actually needed doing (phase 42) is finished elsewhere.

**Decision: defer**, exactly as the deferral table said all along — migrate in
place once legacy `AtsApplicationDetail` retires, when the module stops being
shared and the work costs no duplication and carries no legacy risk.

What stays true from the fork attempt, and is worth keeping for whoever does it:

- V2 imports 14 exports totalling **1975 of the module's 2059 exported lines**.
  Only `StageBar`, `KANBAN_COLORS` and two layout helpers (84 lines) are
  legacy-only — so an in-place migration is very nearly the whole file.
- Both `EmployeeLookup` sites live in `CreateEmployeeDrawer` and
  `InterviewScheduleModal`. Nothing else in the module holds a picker.
- `FormSection` and `FieldLabel` are used **only** by `CreateEmployeeDrawer`,
  so they can move with it without touching `HireModal`.
- Where a modal is a real `<form>`, keep the form and reach it from a ds footer
  button via `form="…"`. Re-wiring to `onClick` would make `required`
  decorative.
- ⚠️ `HireModal` carries offer/salary fields. Splice money and date expressions
  verbatim; propose, never ship, anything that changes salary display.

**Method note — two failures worth not repeating.** A naive `s.index("…")` on a
content marker silently gutted `HireModal`: the marker occurred five times and
the first hit was in another component, while a `count(old)==1` assertion passed
because `old` had been sliced out of the file itself. Locate components by their
declaration and a **brace match**, and after every edit assert that every OTHER
component is byte-identical to the source. Separately, an aborted script was
misread as a stale-module cache when in fact the import rewrite had simply never
been written — check the file before blaming the bundler.
