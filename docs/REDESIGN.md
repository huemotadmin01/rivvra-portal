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
| Sign — `PublicSigningPage` only | **Genuinely blocked, and the only one.** It renders in the public/no-auth route block, OUTSIDE `.ds-shell`, so the palette bridge never reaches it and there is no theme toggle. The other Sign pages are inside the shell; see below. |
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
