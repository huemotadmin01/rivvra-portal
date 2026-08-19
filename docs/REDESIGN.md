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
