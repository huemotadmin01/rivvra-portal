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

**25 v2 pages across 39 routes**, all behind `PageSwitch`, flag-gated to the
staging org. Done: the v2 shell, every major list, the config pages, five
detail pages (Contact, CRM Opportunity, ATS Application, ATS Job, Employee),
and the first five of the low-risk breadth group.

### Next up — group 1, 7 pages left

`todo/TodoTasks`, `todo/TodoTeamTasks`, `crm/CrmOpportunityNew`,
`documents/DocumentDetail`, `expenses/ExpenseDetail`,
`settings/AlumniPolicyPage`, `ess/PolicyReaderModal`.

No money surfaces, no send paths. The recipe that worked five times:

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

### Deferred, with the reason

| what | why it waits |
|---|---|
| `CrmDashboard`, `TodoDashboard`, and the other dashboards | need a ds chart component that does not exist |
| `CrmPipeline`, `AtsPipeline` | kanban archetype, not yet designed |
| KB pages | redesigned separately in July — migrating risks undoing that |
| Forms and wizards (`EmployeeForm`, `AtsApplicationNew`, onboarding) | new archetype: multi-step validation, unsaved-change guards |
| Invoicing (24 pages, 11 money-heavy), payroll (14, 7 money-heavy) | salary/statutory display — parity-proven rendering, reviewed separately |
| Sign (7 pages) | `PublicSigningPage` is externally facing; send paths |
| `ats/applicationDetailParts.jsx` + `HireModal` | only stops being debt once legacy `AtsApplicationDetail` retires (~26 Aug, per the two-week rule) |

### Open defects, not yet fixed

- **`ds/ConfirmDialog` renders a `danger` confirm as a brand-green primary
  button.** The dialog signals destructiveness with the icon tile only, so
  "Delete permanently" on Document Detail looks exactly like a benign
  confirm. Found in 6a; not fixed here because the fix changes the button on
  every existing consumer at once. The component already withholds Enter for
  `danger` — the styling should follow the same intent.
- **`ds/Chip` tinted text fails AA on its own soft background in light
  theme** — `warn` 4.35, `brand` 4.37, against 4.5. Present on every
  migrated page since the first 6a batch. Needs a token change, not a
  per-page workaround. Recipe and standing numbers in `REDESIGN-QA.md`.
- **A policy whose PDF fails to render can never be acknowledged.**
  `PolicyReaderModal`'s scroll gate leaves `reachedEnd` false when the render
  errors, so "I acknowledge" stays locked while the only offered path is
  Download. Inherited from the legacy component, not introduced by the
  migration — but on staging, where every policy download 500s, it is the
  only state you can reach.
- `InlineField` read mode is a click-only `div` — every migrated detail page
  is mouse-only for inline editing.
- `ShellSwitch` renders the legacy shell until the org fetch resolves; a
  *failed* fetch strands the user on it silently.
- `SignRequestWidget` is dark-only; the palette bridge covers it, but it is
  still legacy markup.
- Not ours: every `/documents/{id}/preview` request 500s on staging.
