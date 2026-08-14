# Theming — how light/dark actually works

Written because the answer surprised us, and because it changes what the
redesign has to finish before dark mode counts as shipped.

---

## The one thing to know

**Light/dark is a property of the v2 shell, not of migrated pages.**

Two facts establish it:

- The theme switch exists in exactly one place: `components/platform/v2/AppBarV2.jsx`.
  The legacy shell has no toggle and is always dark.
- Every one of the ~1,070 rules in `components/platform/v2/legacy-bridge.css`
  is scoped under `.ds-shell`. The bridge remaps the legacy fixed-value
  Tailwind scale (`dark-800`, `text-white`, `text-emerald-400`) onto semantic
  tokens.

Put those together: **turn `uiV2` on and the whole app themes — migrated or
not** — because any legacy page rendered inside the v2 shell has its palette
translated on the way through.

This is why an unmigrated page like `expenses/ExpenseDetail`, 1,323 lines that
this project has never touched, renders correctly in light theme today.

### What follows from it

Migrating a page to `ds/` is a consistency and maintainability decision. It is
**not** what buys you dark mode. The two goals were bundled and are separable:
the theming work is essentially done, while the design-system migration is
roughly a sixth complete and its remaining pages need new archetypes designed
before they can start.

---

## The failure modes the bridge cannot fix by itself

A class-remapping bridge has exactly two blind spots. Both are now closed, and
both are worth recognising if a new one appears.

### 1. Colours set inline

An inline `style` outranks any stylesheet rule short of `!important`, so the
bridge cannot reach it.

`components/ResizableTable.jsx` pinned its sticky columns with a hardcoded
near-black background — a sticky cell must paint something opaque or the
scrolling columns show through it. In light theme those columns stayed black.
On Customer Invoices, the invoice numbers inside them measured a **1.00
contrast ratio**: text exactly the same colour as its background, invisible.

Fixed with a variable-with-fallback: the component reads
`var(--rt-sticky-head, rgb(31 31 35))`, and the bridge defines the variable
under `.ds-shell`. The variable is deliberately **not** defined at `:root`, so
the legacy shell falls through to the original colour and production renders
byte-identically. That pattern is the escape hatch for any future inline
colour.

### 2. An accent that is readable but not readable *enough*

Accent text was originally left unbridged on the theory that "emerald, red,
amber and blue read acceptably in both themes". Measurement disproved it — a
`text-emerald-400` chip on its own tint came in at 1.64:1 — and an earlier pass
remapped accent text by meaning (emerald/green/teal → brand, red/rose → danger,
amber/orange/yellow → warn, blue/sky/cyan/indigo/purple → info).

That got the chips to ~4.35, which is *nearly* the 4.5 floor and easy to
declare done. It wasn't. On paper a 10% tint barely darkens the surface, so an
accent sitting on its own tint has almost no background to contrast against.

Fixed by splitting the role: `--brand-ink` and `--warn-ink` are the colours for
text **on** a soft tint, separate from `--brand`/`--warn`, which remain the
button fill and the active-tab underline where the existing values are already
correct. In dark theme the ink tokens alias the accent — nothing changes.
Danger (5.63) and info (5.77) already cleared the floor and got no override.

| token | light value | on its tint |
|---|---|---|
| `--brand-ink` | `#12652F` | 4.37 → **6.25** |
| `--warn-ink` | `#9A4708` | 4.35 → **5.55** |

Both `ds/Chip` and the bridge's accent-text rules read the ink tokens, so the
one change covers migrated and legacy chips alike.

#### The sweep, and what it actually found (phase 11)

`--brand`-as-text got swept across **27 v2 routes**, measured in light theme.
The measured answer is much narrower than the grep:

- A grep for `color: 'var(--brand)'` returns **32 sites**.
- Only **one route** produced brand-coloured contrast failures.

The reason is that the failing pairing is not "brand as text" in general:

| `--brand` text on… | ratio | verdict |
|---|---|---|
| `--surface-1` (white) | **5.02** | passes |
| `--surface-2` (`#F6F3EE`) | **4.53** | passes, barely |
| `--brand-soft` (its own tint) | **4.37** | **fails** |

So only accent-on-its-own-tint fails — exactly what `--brand-ink` exists for.
Most of the 32 grep hits are icons on a tint, and icons are graphics judged at
3:1 (WCAG 1.4.11), which 4.37 clears.

Four sites carried brand *text* on a brand tint and were fixed:
`ds/StageBar` (the current-stage pill, which fixes every stage pipeline at
once), `AtsApplicationsV2` and `AtsJobPositionsV2` initial badges, and a
`LeaveBalancesV2` callout. In dark `--brand-ink` aliases `--brand`, so all
four are provably no-ops there.

**The lesson, again: count what fails, not what matches.** 32 → 4.

---

### 3. `opacity-*` on top of an already-correct colour — FIXED

The bridge remaps colours; it cannot remap opacity, and opacity is what
failed here. **Fixed** — and the scope turned out to be far smaller than the
first estimate, which is the lesson worth keeping.

The statutory report pages carry explanatory copy in `text-[11px] opacity-60`
and similar. The colour underneath is already the right token — the extra
dimming is a habit from the dark theme, where a muted colour on near-black
still had headroom. On paper it does not:

| page | worst | text |
|---|---|---|
| `invoicing/reports/tax` | 2.67 | "Output GST − ITC (books)" |
| `invoicing/reports/tds` | 2.67 | "owed to govt by the 7th" |
| `invoicing/reports/receivables` | 3.17 | "31-60 Days" |
| `invoicing/reports/payables` | 3.17 | "31-60 Days" |
| `invoicing/reports/profitability` | 3.23 | "Total Costs" |

**The 518-occurrences-across-192-files figure was misleading.** It counted
every `opacity-*` utility, most of which sit on icons and decorative glyphs
that never fail. Measuring what *actually* fell below AA reduced it to **one
class pattern** — `text-xs|text-[11px] … opacity-60|70 … uppercase` on a KPI
tile label — in **8 places across 7 files**.

Three of those seven already had a V2 that supersedes them, and since light
theme only exists inside the v2 shell, the legacy file is never rendered in
light. **Real scope: 6 files.** The `opacity` was redundant anyway — the
labels are already subordinate via `text-xs` + `uppercase` +
`tracking-wider` — so it was removed rather than floored, leaving icon and
`disabled:` opacity untouched.

Measured after: `reports/tax` 10 → **0**, `tds` 10 → **0**, `receivables`
12 → **0**, `payables` 6 → **0**, `profitability` 3 → **0**.

**The lesson: count what fails, not what matches.** A grep for the mechanism
over-counts by ~60× against a measurement of the symptom, and that gap is
the difference between "a 192-file sweep" and an afternoon.

Worth noting the failures are concentrated in the tax/GST report explanatory
copy — text added by the July readability pass specifically so people could
understand the numbers.

---

## Auditing

The recipe lives in `REDESIGN-QA.md` (added on the phase-6a group-1 branch).
Four things produce false failures; the last two were found here.

1. **Sampling during the theme cross-fade returns interpolated colours.** It
   reproduced twice doing this work — once reporting a perfectly legible
   sidebar at 1.67, once a 3.04 on a button that settles at 7.11. Let the
   transition finish before you believe a number.
2. **Ancestor visibility.** Use `el.checkVisibility({ checkOpacity: true,
   checkVisibilityCSS: true })`; checking only the element's own
   `display`/`visibility`/`opacity` misses text inside a hidden wrapper.
3. **Disabled controls are WCAG-exempt** but `ds/Button` dims them to
   `opacity: .45`, so a locked primary button reports about 2.2 every time.
4. **Gradients read as transparent.** `getComputedStyle(el).backgroundColor`
   returns `rgba(0,0,0,0)` when the background is a `linear-gradient`, so a
   naive audit composites the text onto whatever is *behind* the element and
   reports nonsense. `ds/Avatar` paints
   `linear-gradient(140deg, var(--brand-hi), var(--brand-lo))` with
   `--brand-fg` text: every avatar on every list page reports a 1.00 ratio and
   every one is fine. Skip any element with a non-`none` `backgroundImage`
   anywhere in its ancestor chain, or resolve it by sampling the rendered
   pixel instead.

A practical note: the naive audit is O(elements × depth) canvas reads and
takes tens of seconds on a 300-element page. Memoising the effective
background per element — each element's is its own background composited over
its parent's — brings a full page to about 40ms.


---

## `--fg-faint` was carrying content (phase 11) — FIXED

`--fg-faint` is documented at the top of `ds-tokens.css` as **decoration
ONLY** — separator dots, disabled glyphs. It had drifted into carrying the
one thing a reader most needs to resolve: the answer "there is no value here".

Empty cells, empty inline fields and empty detail rows all rendered their
em-dash in `--fg-faint`, which measures **2.52 in light and 2.46 in dark**
against a 4.5 floor. An em-dash standing in for a value is the cell's content,
not its ornament.

Repointed to `--fg-4`, the lowest **text** tier (~5.66 light, ~5.61 dark):

| where | note |
|---|---|
| `ds/Table/DataTable` | the empty-cell fallback — the single biggest source |
| `ds/Form/InlineField` | the empty-value em-dash |
| `ds/Navigation/Tabs` | the count badge on an inactive tab |
| 9 v2 pages | their own em-dash and "no value" placeholders |

Decoration keeps `--fg-faint` and is correct there: breadcrumb separators,
drag handles, empty rating stars, `ConfigDot`, the `RecordMeta` clock icon,
and the disabled-lock glyphs. Icons are graphics, judged at 3:1.

**Rule of thumb:** if removing it would leave the reader unsure what the value
is, it is content — use `--fg-4` at the faintest. `--fg-faint` is for marks
that carry no information on their own.

### The follow-up, and a correction — FIXED

That count was recorded here as `FilterBar`'s `resultCount`. **It was not.**
`FilterBar` sits on `--surface-1`, where `--fg-4` measures 5.66 and is fine.

Measuring the actual element found the count inside the **active segment of a
lifecycle strip** — "Ongoing 598", "Open 28". The strip's selected pill is
`--surface-4`, the darkest surface token, and the count was pinned to
`--fg-4`:

| count on… | ratio |
|---|---|
| `--fg-4` on `--surface-2` (inactive segment) | 5.12 — fine |
| `--fg-4` on `--surface-4` (**active** pill) | **4.01–4.31** — fails |
| `--fg-2` on `--surface-4` | **8.50** |

The segment's *label* already switched with state (`on ? --fg : --fg-4`); only
the count was left behind on a fixed tier. Now it follows the segment too, in
both strips that use the pattern — `AtsApplicationsV2` and
`CrmOpportunitiesV2`.

**The generalisable bit:** when a control swaps its background by state, every
piece of text inside it has to swap with it. A child pinned to one tier will
be correct in one state and wrong in the other, and the wrong state is the
selected one — the state the user is most likely looking at.

Outreach's counts were checked and pass: they never sit on `--surface-4`.

### The Ask AI widget renders OUTSIDE the shell — FIXED (the hints)

Chasing the `⌘K` hint turned up something structural. In `App.jsx`,
`<ChatbotWidget />` is a **sibling of `<ShellSwitch />`**, not a child:

```jsx
<ShellSwitch />
<ChatbotWidget />        {/* outside .ds-shell */}
```

The palette bridge is `.ds-shell`-scoped, so it never reaches this widget.
Every class in it — `bg-dark-900/95`, `text-dark-500`, `border-dark-700` —
stays on the **raw Tailwind dark scale** whatever the theme, even though the
bridge has mappings for all of them. Confirmed at runtime:
`kbd.closest('.ds-shell')` is `null`.

That is the same category as `PublicSigningPage`: a surface the bridge cannot
see. It is the only *in-app* one.

**Why it was not "fixed" by moving it inside the shell.** The widget is
deliberately a dark glassy pill — gradient star, glow, backdrop blur. Inside
the shell the bridge would map `bg-dark-900/95` to `--surface-1`, turning it
white in light theme. That is a design change, not a bug fix. It is left
outside, and its own colours were made legible on the pill it actually has:

| hint | was | now |
|---|---|---|
| launcher `⌘K` | `dark-500`, 3.76 light / 3.99 dark | `dark-300` |
| composer "Press Enter to send…" | `dark-500`, 3.75 | `dark-400` |

The launcher is translucent, so its worst case is a **light** page showing
through and lifting the backdrop — which is why the light reading was the
lower of the two. Test that state, not the dark one.

Both verified with the panel open and closed, in both themes.
