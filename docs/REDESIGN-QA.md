# Redesign QA — phase 4

Run against **staging data** (`api-staging.rivvra.com`, org `huemot-technology`,
`uiV2 = true`) with the portal served from the `redesign` branch. Driven in a
real browser, not by reading code.

Re-run this before any widening of the rollout — the point is that "the pages
still render" stops being an assumption.

---

## How to re-run

```bash
VITE_API_URL=https://api-staging.rivvra.com npm run dev -- --port 5173
```

Then, with a seeded session, sweep every v2 route and record what breaks. The
sweep drives React Router directly rather than reloading each time:

```js
history.pushState({}, '', path);
window.dispatchEvent(new PopStateEvent('popstate'));
```

Two things that will mislead you if you don't know them:

- **Allow ≥4s per route.** At 2.5s several lists still showed zero rows purely
  because the fetch hadn't landed. Every one of those was a false alarm.
- **`innerText` returns `''` when the browser pane is hidden** (it needs
  layout). Use `textContent`. There is also **no `<main>` element** in the v2
  shell, so query `document.body`.

---

## The contrast audit

`REDESIGN.md` step 6 points here for the recipe; here it is. Run it in the
console on each migrated route, **in light theme** — light is where a dark-only
legacy colour that survived the migration shows up as near-invisible text.

The method that matters: resolve every colour by **painting it onto a 1×1
canvas and reading the pixel back**, never by parsing the computed-style
string. `getComputedStyle` hands back `rgb()`, `rgba()`, `color(…)` and
sometimes an unresolved `color-mix()`; painting normalises all of them, and it
is the only way to get the true alpha. Then composite each ancestor's
background down to the document canvas — a translucent chip on a translucent
panel is not the colour either one declares.

```js
const cv = document.createElement('canvas'); cv.width = cv.height = 1;
const ctx = cv.getContext('2d', { willReadFrequently: true });
const rgba = s => { ctx.clearRect(0,0,1,1); ctx.fillStyle = '#000';
  try { ctx.fillStyle = s } catch { return null }
  ctx.fillRect(0,0,1,1); const d = ctx.getImageData(0,0,1,1).data;
  return [d[0], d[1], d[2], d[3]/255]; };
const over = (f,b) => [0,1,2].map(i => f[i]*f[3] + b[i]*(1-f[3]));
// walk ancestors, composite each non-transparent background down, then
// composite the text colour (times element opacity) onto the result;
// WCAG ratio, threshold 4.5 (3.0 for ≥24px, or ≥18.66px bold).
```

Four things that will give you false failures:

- **The browser pane returns stale computed styles while it is hidden.**
  Found during the phase-11 sweep: after a theme toggle the sidebar kept
  reporting the *dark* `--fg` (`#EEF2F6`) for 15+ seconds, long past any
  transition, while `--fg` at the same node correctly resolved to the light
  value. A screenshot — which forces a paint — made the next read correct
  (`rgb(22,25,29)`, and the audit went clean). If a "failure" survives a long
  settle, take a screenshot and re-read before believing it.

- **Let the theme transition finish.** Sampling right after the theme toggle
  returns *interpolated* colours mid-transition. A first pass read the To-Do
  sidebar at 1.67 and the active tab at 1.12; both were fully legible, and a
  re-run once settled reported neither. Wait a beat, then sample.
- **Test ancestor visibility, not just the element's.** `el.checkVisibility({
  checkOpacity: true, checkVisibilityCSS: true })` catches text inside a
  hidden wrapper; checking only the element's own `display`/`visibility`/
  `opacity` does not.
- **A gradient ANCESTOR, not just the element.** `getComputedStyle`
  returns `transparent` for a `linear-gradient`, so a text node sitting on a
  gradient composites against whatever is behind it and can report 1.00.
  Guarding only the element itself is not enough — `ds/Avatar` paints a
  gradient and puts its initials in a child, which is why every candidate
  list reports ~26 phantom failures at exactly 1.00. Walk up: if any ancestor
  between the text and its first opaque background has a `backgroundImage`
  other than `none`, skip the node rather than trusting the composite.

- **Ignore disabled controls.** WCAG 1.4.3 exempts them, and ds `Button`
  dims to `opacity: .45` when disabled, so a locked primary button reports
  around 2.2 every time. A disabled "I acknowledge" on the policy reader is
  the expected reading, not a defect.

### Standing result (phase 6a)

Every migrated route reports the same two ds-level failures and nothing else:

| where | ratio | needs |
|---|---|---|
| `Chip` tinted text on its own soft background (`warn`, `brand`) | 4.35–4.37 | 4.5 |
| App-bar notification badge count (white on `--brand`) | 2.03 | 4.5 |

Both are token pairings in `ds/`, not page code — `MyPoliciesV2` has shipped
with the `Chip` one since phase 6a's first batch. Fixing them means moving a
shared token, which changes every migrated page at once, so it wants its own
change rather than a per-page workaround. Pages should keep reporting zero
failures *beyond* these two.

## Route sweep — 23 v2 routes

All rendered. **Zero console errors, zero unhandled rejections** across the
whole sweep.

| Route | Result |
|---|---|
| `contacts/list` · `companies` · `individuals` | 25 / 27 / 27 rows |
| `contacts/config` | 7 rows |
| `contacts/:id` (company) | renders; 8 panels, both toggles |
| `crm/opportunities` | 25 rows, "1–25 of 28 deals" |
| `crm/config/stages` · `tags` · `lost-reasons` | 7 / 23 / 6 rows |
| `ats/candidates` | 25 rows of 3,334 |
| `ats/jobs` | 50 rows (grouped) |
| `ats/applications` | 25 rows of 598 |
| `ats/my-approvals` | 10 rows |
| `ats/config` | 50 rows across sections |
| `documents` | card grid, 53 documents |
| `expenses` | genuinely empty; correct empty state |
| `employee/alumni` | 23 rows |
| `timesheet/leave/balances` · `reports` | 6 / 15 rows |
| `outreach/leads` · `team-lists` · `team-contacts` | 50 / 10 / 50 rows |
| `outreach/lists` | genuinely empty; correct empty state |

`crm/opportunities` showing 28 against an org-wide total of 1,080 is **correct** —
the page is company-scoped and the raw API probe was not.

## URL round-trip

`ats/candidates?search=an&sort=name&dir=desc&page=2` loaded cold restores the
search box, the sort and the page: "Showing 26–50 of 2,404", "Page 2 / 97".

## Contact Detail (phases 3a/3b)

- Inline save persists; **an unchanged commit writes nothing** (`updatedAt`
  identical before and after).
- Tag add/remove round-trips.
- `?tab=` survives reload with the right tab selected.
- Activity: note created; delete asks first; **Enter does not confirm a danger
  dialog**; confirming removes the row.
- `EntityLookup`: empty-query search on open, debounced re-query, "Create …"
  offered on no match, create-and-link round-trips.

---

## Findings

### 1. The v2 app bar overflows a 375px phone — every v2 page (open)

`documentElement.scrollWidth` is **440 against a 375 viewport on every v2 route**,
so the whole page scrolls sideways.

The offenders are in `components/platform/v2/AppBarV2.jsx`, not in any page: the
notification bell reaches `x=440` and the account avatar `x=440`. The right-hand
cluster (help, theme, bell, avatar) has nothing that hides or wraps below `sm`,
and the breadcrumb nav has no `min-width: 0`, so it refuses to shrink and pushes
the cluster off-screen.

This contradicts the house rule from the mobile pass: wide content scrolls inside
its own `overflow-x` container, the page body never scrolls horizontally. Tables
obey it — the app bar doesn't.

Not fixed here: app-bar layout wants a visual review, not a blind `min-width: 0`.

### 2. No `<main>` landmark in the v2 shell (open)

`document.querySelectorAll('main').length === 0` on every v2 route. `nav` and a
single `h1` are present, so this is the one missing landmark. Screen-reader users
get no skip target. Legacy had the same gap, so it's not a regression — but the
shell is the cheapest possible place to fix it.

### 3. Inline fields are not keyboard reachable (open, carried from phase 2)

`InlineField`'s read mode is a `div` with `onClick` — no `tabIndex`, no `role`,
no key handler. Every field on every migrated detail page is mouse-only. The
`type='toggle'` variant is a real `button` and is fine, and `ActivityPanelV2`'s
done-checkbox got `role="checkbox"` plus Enter/Space in 3b, so the pattern is
settled — `InlineField` and `InlineComboField` need the same treatment across
all their consumers at once.

### 4. Legacy shell flashes before the flag resolves (open)

`ShellSwitch` reads `currentOrg?.uiV2 === true`, so while the org fetch is in
flight the legacy shell renders and then swaps. Observed directly: a
mid-navigation sample caught 14 legacy-classed elements on a v2 route. Cached
org payloads make this invisible most of the time; a cold load or a slow org
fetch makes it a visible flash — and a *failed* org fetch leaves the user on
legacy with no indication anything is wrong.

### 5. `SignRequestWidget` is dark-only (known, deferred)

Renders correctly in dark, wrong in light, on Contact Detail's Activities tab.
Belongs to the Sign surface and migrates with it.

---

## Fixed during this phase's own work

Both found by using the components rather than reading them:

- **`ds/Button` ignored a caller's `style`** — `{...rest}` spread after `style=`
  replaced the computed object wholesale, so tinting a ghost button dropped its
  display, padding and height. `DensityToggle` and `GroupedHeader` had the same
  latent clobber with no caller yet. All three now merge.
- **`ds/Tabs` reserved a scrollbar gutter** that rendered as a stray rule beside
  the underline.
- **`ds/ConfirmDialog` rendered a `danger` confirm as a brand-green primary
  button** — "Delete permanently" looked exactly like "Save", with only the
  icon tile hinting at the consequence. `ds/Button` gains a `danger` variant
  (new `--danger-fg` / `--danger-glow` tokens) and the dialog uses it when
  `danger` is set. Measured after the fix: white on `#B91C1C` at **6.47:1** in
  light, `#1A0505` on `#F87171` at **7.11:1** in dark. Six existing call sites
  pick it up. Note the CRM/ATS config pages still show the *legacy* dialog —
  `ds/ConfigList` imports `shared/ConfirmDialog`, the deprecation already
  tracked in `REDESIGN.md`.

---

## Money parity: two things the harness does that look like findings

Both hit during the phase-14 invoicing pass. Neither is a defect.

- **`<style>` content is in `textContent`.** `scripts/money-parity.js` reads
  `document.body.textContent`, which includes the text of any `<style>`
  element in the body. ds `DataTable` injects
  `@keyframes rv-pulse{0%,100%{opacity:.5}50%{opacity:.85}}`, so a v2 capture
  picks up three phantom values — `0%`, `100%`, `50%` — that the legacy page
  never had. They appear because the regex matches percentages (deliberately:
  a dashboard's rates drift like its money). Filter `x.endsWith('%')` before
  diffing, or compare only the currency-prefixed values. Aged receivables went
  114 → 120 purely from this.

- **Regex greediness merges a figure with the next label's digits.** The
  capture for a card reading `₹20,23,922.27` above a `1-30 Days` label comes
  back as `₹20,23,922.271`. Harmless — the harness is a *string* comparator and
  the same merge happens on both sides, so it still catches a real drift. Do
  not "fix" it by trimming, or legacy and v2 stop being comparable.

## Phase 14 result

`invoicing/reports/{receivables,payables,analysis}` — **0 contrast failures
across 634 text nodes**, light theme, all four false-failure guards applied.
No `Chip` on these pages, so the standing ds-level `Chip` failure does not
appear.

Money parity against the legacy capture: **114 / 36 / 115 values, identical
and in the same order.**

## The import-drift check (phase 14 batch 2)

Two of the four defects found in the invoicing pass were the same bug: an
import list trimmed against the *migrated* chrome while a **retained** legacy
block still used the icon. The build passes — Vite resolves the module fine —
and the page crashes on mount with `X is not defined`.

Cheaper than finding it by page load:

```js
const body = src.slice(src.indexOf("from 'lucide-react';"));   // after the import
const imported = new Set(/import \{([^}]*)\} from 'lucide-react';/.exec(src)[1]
  .split(',').map(s => s.trim()).filter(Boolean));
const used = LUCIDE.filter(n => new RegExp(`<${n}[\\s/>]`).test(body));
// require: used - imported === ∅   and   imported - used === ∅
```

Run it whenever a migration **keeps** part of the legacy render. If the whole
body is rewritten the risk disappears, which is exactly why it is easy to
forget on a partial migration.

## Phase 14 batch 2 result

`invoicing/{invoices,bills,employee-bills,payments}` — **0 contrast failures
across 841 text nodes**, light theme. Money parity **44 / 26 / 22 / 20 values,
identical and in order**.

Not exercised, deliberately: the vendor-bill AI import
(`extractVendorBill` → `createInvoice` → `uploadAttachment`). Running it would
create a real financial record on staging.

## Verifying a config page's write path (phase 14 batch 3)

Config entities are org master data with real delete endpoints, so unlike the
vendor-bill AI import these are safe to exercise end to end on staging. Do it —
a rendered form proves nothing about what reaches the server.

**Check the payload at the wire, not in the UI.** `curl` the list endpoint
after each step. The create above returned `days: 7` as a **Number**; a form
that posted `"7"` would look identical on screen.

Two rules for the test row:

- Name it so it is unmistakable — `ZZ TEST … (delete me)` — and delete it in
  the same session.
- **Never set a "default" flag.** Creating a payment term or journal with
  `isDefault: true` changes what future invoices inherit. Leave it false and
  confirm afterwards that the real default is untouched.

**Driving a ds modal from the console:** `computer` clicks take
screenshot-space coordinates and a stale screenshot will send them to the wrong
control — during this batch that silently hit Cancel twice and looked like "the
error never rendered". Prefer driving the DOM directly:

```js
const setNative = (el, v) => {                       // React-compatible
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create').click();
```

Then assert on state (`aria-checked`, whether the submit button still exists)
rather than on a screenshot.

**Confirm a fetch-param filter reached the network.** `showInactive` looks like
a client filter and is not. Wrap `window.fetch`, toggle once, and read the URL —
`?includeInactive=1`. Staging had no inactive rows, so the list looked
unchanged either way; without the wire check that is indistinguishable from a
dead toggle.

## Phase 14 batch 3 result

`invoicing/config/{payment-terms,expense-categories,journals}` — **0 contrast
failures** across 67 / 64 / 183 nodes, light theme. Full create → edit → delete
verified on payment terms and cleaned up.

## A sixth false-failure mode: SVG text measured by `color`

The audit reads `getComputedStyle(el).color`. **SVG `<text>` is painted with
`fill`, not `color`** — `color` is inherited, unused, and on a chart label it
is whatever the surrounding panel set. Measuring it produced a 1.06 "failure"
on a Y-axis tick that actually renders at 6.63.

`<text>` and `<tspan>` therefore need the fill-based measurement, not the page
sweep:

```js
const texts = [...document.querySelectorAll('text')]
  .filter(t => t.closest('.recharts-responsive-container'));
texts.map(t => rgba(getComputedStyle(t).fill));   // fill, never color
```

This cuts both ways, and the second direction is the dangerous one: the page
sweep will also **miss real chart failures**, because it never reads the
property that paints. That is exactly what happened here — see the
`--fg-3` fix below, which the sweep did not flag at all.

## Theming a recharts chart without touching its props (phase 14)

`Profitability` hard-codes four dark-only chart colours: X tick `#9ca3af`,
Y tick `#6b7280`, zero line `#374151`, hover cursor white @ 3%. In light theme
the X ticks measured **2.29:1** — below AA — and the zero line and cursor were
near-invisible.

**A CSS declaration beats an SVG presentation attribute.** So the recharts
props are left exactly as they are and a scoped stylesheet themes all four:

```css
.pf-chart .recharts-cartesian-axis-tick-value { fill: var(--fg-3); }
.pf-chart .recharts-yAxis .recharts-cartesian-axis-tick-value { fill: var(--fg-4); }
.pf-chart .recharts-reference-line line { stroke: var(--line-strong); }
.pf-chart .recharts-tooltip-cursor { fill: var(--surface-3); opacity: .45; }
```

Component diff stays clean; result is 2.29 → **6.63** in light, 6.84 in dark,
all 17 chart labels passing AA in both.

Two traps, both hit:

- **`var()` does not resolve inside a presentation attribute.** It has to be
  CSS. Passing `var(--fg-3)` to recharts' `tick={{ fill }}` silently does
  nothing.
- **The wrapper must be `display: contents`.** A plain `<div>` around
  `ResponsiveContainer` breaks its height chain and the chart renders at zero
  height — it vanishes entirely.
- The tick TEXT class is `recharts-cartesian-axis-tick-value`; the *group* is
  `recharts-cartesian-axis-tick-label`. Targeting `…-tick text` matches
  nothing. Verify the class on a live node before trusting a chart selector.

---

## my-timesheet — the ink on a fill depends on the fill, not the family

`my-timesheet` opened with 13 failures, all on the "Working" day badges at
**2.47:1**, and the cause was a rule added two batches earlier in this file.

That rule fixed a real bug — the bridge mapped `text-white` to `--fg`, which
turns the label on a coloured button near-black in light theme — but it
matched with `[class*="bg-blue-"]`, i.e. per colour FAMILY. Family is the
wrong unit. `bg-blue-700` and `bg-blue-400` want opposite inks.

Measured over the 39 family/step pairs the codebase actually pairs with
`text-white`: white wins on 17 and loses on 22. There is no single constant
that is right, so `scripts/ink-for-fill.js` computes both lists and emits the
CSS. Re-run it with `--css` whenever a new fill appears; it exits non-zero on
a fill missing from its palette table.

**The generalisable part:** both inks are *literals*, not tokens. The fill
does not change with the theme, so the ink must not either. Mapping this class
of pairing to `--fg` is what produced the original bug — it flips the ink
under a fixed background. Anywhere a fill and its text come from different
sources, that is the pairing to check.

This also repaired the **dark** theme, where `--fg` is near-white and all 22
light fills were sitting at ~2.5:1 — a pre-existing failure that predates the
rule and had never been reported, because the audit only ever ran on the page
being migrated.

### A second finding, 128 call sites

The last remaining failure was the **Submit** button at 3.52:1 — and it is the
app's primary brand button. The brand ink rule only matched `.text-white`, but
the legacy brand fill is bright green, so its label is written `text-dark-950`.
In light theme `--brand` resolves to `#15803D`, on which a near-black ink is
3.52. 128 elements pair `bg-rivvra-*` with `text-dark-950`. Both spellings now
resolve to `--brand-fg` (→ 5.02).

### Proposed, not done

`indigo-500` (4.47, 22 sites) and `purple-500` (4.46, 17 sites) miss AA with
*either* ink — the fill itself is too mid-tone. Fixing them means darkening the
fill, a visible change across already-merged pages, so it is left alone here.
Both are within rounding of the threshold and neither is a regression.

### Harness: false-failure mode #5 is not just for hidden elements

The dark-theme run reported 25 sidebar failures at 1.67:1. `--fg-2` resolved
correctly to `#BAC4D0`, but `.sb-item`'s computed `color` was frozen at the
*light* value in both themes — the pane was not painting, so the `color`
transition never advanced. `getComputedStyle` returned a stale value on a
fully visible element, 800 ms after the switch.

**Force a paint (take a screenshot) between switching the theme and reading
computed styles.** After the paint: `rgb(186, 196, 208)`, 0 failures. The
audit itself is now `scripts/contrast-audit.browser.js`, with all six
false-failure guards written down next to the bug each one hides.

Final: **0 failures of 148 checked, both themes.** Guard diff PRESERVED —
216 guard/logic occurrences identical, including all 9 `isDayDisabled` sites.

---

## my-attendance — an accent on a wash of itself, and opacity hiding the evidence

This page is not a header-only migration: it is colour-coded end to end, and
`statusConfig` — twelve statuses × six pre-baked Tailwind class strings on the
fixed dark scale — is *why* it was dark-only. That table sits above `return (`.

So the rule is stated more precisely here than "nothing above `return (`
moves", because a blanket version would have blocked the migration entirely:

> The **logic** above the return is spliced in verbatim and diffed byte-for-byte
> (257 lines). `statusConfig` / `statusBanners` are **presentation** tables and
> may be re-tokenised — but their **content** fields (label / short / emoji, and
> every banner string) are asserted identical, because those are what the legend
> and the mobile list actually render.

Each status now names ONE `--acc-*` token and the render derives tint, border
and dot from it, so a status can no longer be themed in one place and not
another. Legacy's ½-variants used a lighter step of the same hue; there is one
`--acc` step per family, so `half: true` takes a weaker tint of the parent hue
instead of borrowing a different one.

### The finding: don't let the ink carry the hue

First audit: **31 failures in light** — P at 3.50, H at 3.96, muted — at 4.26.
The cause was mine: I tinted the **cell** and then tinted the **pill** again on
top, so the accent ink sat on a doubled wash of itself. Legacy got away with the
same structure only because its ink was a light-400 on a dark ground; inverted,
it collapses.

This is the pairing `Chip` already documents ("the accent on its own tint
measures ~4.35 against a 4.5 floor") — worse here because of the stacking.

Tuning tint percentages per accent was whack-a-mole: 12% fixed emerald (4.69)
and purple (4.50, on the line) but left amber at 4.29. The fix is structural,
not numeric — **let the tint carry the status and keep the text near-black**:

```js
const cellInk   = (cfg) => (cfg.muted ? 'var(--fg-4)' : cfg.accent);  // legend dots, summary figures — neutral ground
const statusInk = (cfg) => (cfg.muted ? 'var(--fg-3)' : 'var(--fg)'); // letter inside a TINTED cell
```

Every status clears AA by a wide margin in both themes, it stops depending on a
per-accent constant, and it stops the page conveying status by hue alone.

### `opacity` was hiding the problem, not solving it

Legacy dimmed post-LWD and future cells with `opacity: .45/.55`. Opacity on a
container blends the whole subtree toward the backdrop — it lowers real contrast
while leaving `getComputedStyle(el).color` completely unchanged, so **the audit
cannot see it**. Every measurement on a dimmed cell was optimistic.

Muted days now get an explicit `--surface-2` and a muted ink, no opacity. The
audit reports `dimmedByAncestorOpacity`, and a run is only trustworthy when that
is **0** — otherwise the numbers are a floor, not a result. Treat a non-zero
count as "unmeasured", not "passed".

### New primitive

`ds/Feedback/Callout` — tinted surface, icon, message, optional action. Four on
this page alone, each previously hand-rolled with its own gradient and opacity
stop. Tones follow Chip's table including its `-ink` correction. Already-merged
pages still hand-roll this shape and could adopt it later; not retrofitted here.

### Verification

- **0 failures** across all four combinations — desktop and mobile × light and
  dark (137 and 157 nodes), `dimmedByAncestorOpacity: 0` in every run
- Logic block byte-identical (257 lines); 13 guard declarations identical across
  both render paths; statusConfig key order and content fields identical
- Toggle cycle exercised live: P → ½ → A → P, returning to its start
- Guards exercised live: a future day, a weekend, and a future *holiday* all
  refuse the click — the future guard correctly beats the holiday cycle
- **Not exercised:** the holiday cycle (H → HW → ½HW → H). The only holiday in
  the staging month is in the future, so the future guard shadows it. That code
  is verbatim legacy.
- No writes: nothing was saved or submitted; local edits discarded by reload

---

## timesheet/users — a money page, and two things wrong with it that aren't mine

`TimesheetUsers` sets the daily/monthly pay rate and the client billing rate
that the contractor pay chain reads, so it gets the full money treatment: the
logic above `return (` is spliced in byte-identical (177 lines) and every money
string is asserted present on both sides (10 probes — the two rate render
expressions, both `(₹)` labels, all three `RATE_TYPE_LABELS` entries, the
billing-rate fallback, the proration formula, the PL badge).

### 🔴 Finding 1 — `RATE_TYPE_LABELS` mixes currencies

```js
const RATE_TYPE_LABELS = {
  daily:   '₹/day',
  hourly:  '$/hour',    // ← not a typo in this doc
  monthly: '₹/month',
};
```

The client-billing-rate field relabels itself from this table. Pick **hourly**
and the field says the number is **dollars**; pick daily or monthly and the same
field says rupees. Nothing converts — it is one `clientBillingRate` number
either way. So the label is the only thing telling anyone what the figure means,
and for one of three options it says something different from the other two.

This is **carried across unchanged and deliberately not fixed.** Changing what a
rate label says changes what the stored number means, and that is a decision to
take on purpose. It also sits against the standing rule that billing currency
comes from the record, not a hardcoded glyph — the whole table is hardcoded ₹,
which is the more general version of the same bug.

### 🔴 Finding 2 — the status pill is an unconfirmed destructive control

The Status cell looks like a badge. It is a `<button>`, and one click runs:

```js
await employeeApi.update(orgSlug, user._id, { status: newStatus });  // 'resigned'
```

No confirmation, no undo in the UI, and it is directly adjacent to the Edit
button in a 91-row table. Marking someone resigned is what drives alumni
handling and stops their payroll.

Behaviour is **preserved exactly** — adding a confirm is a behaviour change and
belongs in its own commit, not smuggled into a theme migration. V2 adds a
`title` naming the consequence, which is as far as it should go unasked.

### Money parity: 0 real diffs, and two harness lessons

Captured legacy and v2 against the same 91 rows by temporarily pointing the
route at the legacy component, then restored it. **455 cells compared, 74 money
cells, 52 distinct values, 0 real differences.**

Getting there took two corrections, both worth keeping:

1. **Never key a parity capture on a display name.** The first diff reported 29
   mismatches. The data has **16 duplicate names in 91 rows**, so a `Map` keyed
   by name silently collapsed rows and compared the wrong pairs. Key on a unique
   id, or on row index when both sides render the same list in the same order.
2. **`innerText` inserts a newline between inline-flex children.** Five cells
   differed as `"Daily1 PL"` vs `"Daily\n1 PL"`. Not a layout change — both chips
   measured the same `getBoundingClientRect().top`, i.e. the same line. When a
   text diff looks like whitespace, check geometry before believing it.

A third, milder one: the wait-for-load predicate `/\d+ of \d+ users/` matched
**"0 of 0 users"**, because v2 renders `PageHeader` outside the loading gate
where legacy rendered a full-page skeleton. Wait on a non-zero count, not on the
shape of the string.

### Smaller notes

- Legacy dimmed inactive rows with `opacity-50` on the `<tr>`. Replaced with a
  muted name ink, for the reason recorded under my-attendance — container
  opacity lowers real contrast while hiding it from the audit. Verified on the
  Resigned view: `dimmedByAncestorOpacity: 0`, rows still clearly distinct.
- Badge hues move to `Chip`'s tone set (admin purple → `warn`, manager blue →
  `info`, pay type indigo/amber → `info`/`warn`). Hand-rolling accent chips to
  preserve the exact hue is the pairing that failed on my-attendance, and Chip's
  tones already carry the measured `-ink` corrections. Hue here is decoration.
- Lint: legacy has 2 errors, v2 has 1. The remaining one (`err` unused in
  `toggleActive`'s catch) is inside the byte-identical slice and stays there.

### Verification

- **0 contrast failures** across six surfaces — list, modal, and the Resigned
  view × light and dark (688 / 691 / 716 / 716 / 596 / 596 nodes),
  `dimmedByAncestorOpacity: 0` throughout
- Search exercised (`Gopor` → 2 of 169) and the Status chip (78 resigned + 91
  active = 169)
- **No writes**: no user created, no user updated, no status toggled. The modal
  was opened and dismissed with Escape.

---

## leave/apply — proving a pay-affecting preview by driving it, not by reading it

`LeaveApply` previews how many days a request costs and how many become **LOP —
Loss of Pay**. That preview is pay-affecting, so the same rule as the other
money pages: everything above `return (` is spliced in verbatim (**207 lines,
byte-identical**), plus the two date helpers that live above the component and
were checked separately.

Seven pay-affecting expressions are asserted by exact text — `lopDays`,
`available`, the half-day `0.5` branch, the weekend test, the business-day
count, the half-day-on-non-working-day guard, and `halfDayAllowed`.

**But expression equality is not behavioural equality**, and this page's output
depends on fetched holidays, on which calendar years get fetched, and on
singular/plural wording. So it was driven, in both renders, over the same six
cases:

| case | days | LOP |
|---|---|---|
| 24–28 Aug (28th is Raksha Bandhan) | 4 | — |
| 29–30 Aug (weekend only) | *no working days* | — |
| 24 Aug – 4 Sep | 9 | 5 days |
| 28 Dec – 4 Jan (**cross-year**) | 5 | 1 day |
| half-day on Sat 29 | *half-day warning* | — |
| half-day on Mon 24 | 0.5 | — |

**36 assertions, 0 differences.** The cross-year case is the one worth keeping:
it confirms both 2026 and 2027 holiday fetches fire (the bug the `neededYears`
comment describes), and it is the only case that exercises the singular
`1 day` branch of `{lopDays} day{lopDays !== 1 ? 's' : ''}`.

### Harness notes

- **One case per `javascript_tool` call.** Three chained cases (~6 s of waits)
  timed out; each case alone is fine. The first probe also hung on its own
  toggle-reset loop — when a driver times out, suspect the driver before the page.
- **Compare only the keys both captures carry.** The first diff showed 4
  mismatches that were `undefined` vs `null` — the v2 and legacy probes had
  drifted to different shapes. Same family as the duplicate-name artifact on
  timesheet/users: *the comparison was wrong, not the code.*

### `leaveTypeAccent`

`config/leaveTypes.js` already existed to stop two pages disagreeing about leave
type labels and colours. It gains `leaveTypeAccent(code)` — the same tone map
resolved to `--acc-*` tokens instead of fixed-dark Tailwind classes, so v2 reads
tokens without the mapping being duplicated into the page. Two tones have no
`--acc` family: `red` → `--danger` (which is what it means), `pink` →
`--acc-rose`. The accent is used as **text on a neutral card**, never as a fill
under itself.

### Verification

- **0 contrast failures** in both themes (69 nodes each),
  `dimmedByAncestorOpacity: 0`
- Logic block byte-identical (207 lines); both date helpers identical; 7
  pay-affecting expressions and 6 preview strings asserted
- Build green, lint clean (legacy baseline also clean)
- **No writes** — confirmed zero `leave-request` calls in resource timing. The
  form was filled to a submittable state to render the LOP callout, and the
  submit button was never clicked.

---

## timesheet/approvals — three pieces of dead or half-built code, found by lint

Approve / reject / revert move a timesheet into the state payroll reads, and the
page also sends reminder emails, so everything above `return (` is spliced in
verbatim (**109 lines, byte-identical**) and ten mutating paths are asserted by
exact text — the two `window.confirm` gates, the reason-required check, all four
endpoints, the `!t.isAttendance` filter, and both derived lists. The
payroll-lock guard lives in the render and is asserted separately.

### What lint found that reading didn't

Running eslint on the **legacy** file as a baseline turned up two unused
declarations, and chasing them produced three findings:

1. **`statusColors` is dead.** A five-entry map of status → Tailwind fill,
   declared at module scope and referenced nowhere — the calendar builds its
   classes inline instead. This is the one thing **not** carried into v2:
   copying it would be copying a decoy.
2. **`toggleSelectAll` is dead in both files.** The bulk-reminder feature has
   per-row checkboxes and a "Send Reminder (n)" button, but the select-all
   handler is never wired to any control. `draftFiltered` exists **only** to
   feed it, so it is dead too. Either the select-all checkbox was lost in a
   refactor or it was never finished; both are preserved verbatim so the answer
   stays the maintainer's.
3. **`controllerRef` is not a ref.**
   ```js
   const controllerRef = { current: null };   // plain object, rebuilt every render
   ```
   `load()` writes the new `AbortController` onto *this* render's object, while
   the effect cleanup closes over the object from the render it ran in. So the
   abort at the top of `load()` does not reliably cancel the previous in-flight
   request. **`AttendanceApprovals.jsx` has the identical line**, so it is a
   two-file issue and the next page in the queue inherits it.

Net lint: legacy 2 errors, v2 1 — the delta is exactly the dead map.

### Day cells: the my-attendance fix, applied again

Legacy painted the expanded calendar as saturated fills with white text.
`bg-emerald-500` + white is **2.54:1** and `bg-blue-500` + white is **3.68:1**,
both below AA at the 9px these render at. Same fix as my-attendance — the tint
carries the state, the digit stays near-black/near-white. Weekend-work keeps
legacy's ring, since it is the one state the fill alone doesn't distinguish.

### Not reachable on staging data

**The payroll-lock branch never renders.** `Cannot revert — payroll is
{status} for this month` requires a run in `processed` or `finalized`; every
month Apr–Aug 2026 reports `open`. The unlocked branch (Revert button) was
exercised on June's 36 approved rows. The guard expression is preserved verbatim
and asserted by text, but it has **not** been seen on screen.

This is the fourth surface blocked the same way (GSTR-2B, bank statement,
my-fnf receipt, now this). All of them need one seeding exercise, not four
migrations — see the note under the statutory batches.

### Added copy

The reject dialog gains a `sub`: *"The contractor sees this reason and can
resubmit."* Legacy had a bare title. Modal's API asks for the consequence there,
and the reason is in fact shown to the contractor.

### Verification

- **0 contrast failures** across four surfaces — list and reject modal × light
  and dark (197 / 197 / 101 / 101 nodes), `dimmedByAncestorOpacity: 0`
- Logic byte-identical (109 lines); 10 mutating paths + the payroll-lock guard
  asserted
- Exercised live: tab counts across three periods (Aug/Jul/Jun), row expansion,
  the calendar grid on a leave-heavy month, Approve/Reject rendering only for
  `submitted`, Revert rendering only for `approved`, and the reject modal opened
  and cancelled
- **No writes** — confirmed **zero** calls to `/approve`, `/reject`, `/revert`
  or `/reminders/send` in resource timing. No reminder email was sent.

---

## attendance/approvals — the same half-built feature, decayed differently

Sibling of `timesheet/approvals`: same approve / reject / revert / remind
surface over attendance. Logic spliced in verbatim (**104 lines,
byte-identical**), eight mutating paths asserted by exact text, payroll-lock
guard asserted separately, and the ten-branch colour ladder checked branch by
branch.

### The select-all residue is different in each file

The sibling has a `toggleSelectAll` handler wired to no control. **This file has
no `toggleSelectAll` at all — yet still computes `draftFiltered`**, the list
that only ever existed to feed it. So the same half-built select-all left a
different residue in each file: one kept the handler and lost the checkbox, the
other lost both and kept the input. Preserved (it is inside the verbatim slice);
lint parity is legacy 1 error, v2 1.

`controllerRef` is the same plain-object-not-a-ref defect flagged on the
sibling, carried across unchanged.

### `entryColors.upcoming` is unreachable

Legacy's map defines an `upcoming` style — dashed border, muted — but the colour
ladder has **no `status === 'upcoming'` branch**, so a future day falls through
to the default grey. `upcoming` is a real status elsewhere in the attendance
model (my-attendance renders it), so this is a genuine gap, not a spare key.
Mirrored exactly in v2's `ENTRY_ACCENT` (kept, unused) and flagged rather than
fixed — adding a branch changes what a reviewer sees.

### Day cells

Every entry in legacy's `entryColors` was a saturated fill with `text-white` at
9px: emerald-500 **2.54:1**, amber-500 **2.15:1**, blue-500 **3.68:1**. Same fix
as my-attendance and the sibling — tint carries the state, digit stays
near-black. ½ variants take a weaker tint of the parent hue.

### ⚠️ Four branches unreachable on staging data

This page has the **worst** coverage of the batch, and it is a data problem, not
a code one. Across **ten months (Nov 2025 – Aug 2026)** attendance exists only
in `draft`, `approved` and `no_entry`. There is **no `submitted` and no
`rejected` record anywhere.** So:

| branch | why unreachable |
|---|---|
| Approve / Reject buttons | need `status === 'submitted'` |
| Reject modal | only opens from the Reject button |
| Rejection-reason `Callout` | needs `rejected` **and** a `rejectionReason` |
| Payroll-lock message | every month reports `open` |

What that leaves: the modal and the reject flow are the *same composition* as
the sibling page's, which **was** verified live in #74 — but that is inference
from a sibling, not verification of this page. Stated plainly rather than
counted as covered.

Fixing this needs seeding, not migration — now five surfaces deep (GSTR-2B,
bank statement, my-fnf receipt, timesheet-approvals lock, and these four).

### Verification

- **0 contrast failures** across four surfaces — draft and approved views ×
  light and dark (116 / 116 / 179 / 179 nodes), `dimmedByAncestorOpacity: 0`
- Logic byte-identical (104 lines); 8 mutating paths, the payroll-lock guard and
  all 10 colour-ladder branches asserted
- Exercised live: tab counts across two periods, row expansion, the calendar on
  both a present-only month and one with leave days, the 7-item legend, the
  summary row, and Revert rendering only for `approved`
- **No writes** — zero calls to `/approve`, `/reject`, `/revert` or
  `/reminders/send`. No reminder email sent.

---

## leave/approvals — I walked into the exact pairing I'd documented twice

Logic spliced in verbatim (**80 lines, byte-identical**), `formatDate` checked
separately, eight mutating paths asserted by exact text.

### The finding I caused, and the one I inherited

**Caused.** The first audit came back with **20 failures** — LOP at **4.21**,
Casual Leave at **4.24**. I had hand-rolled the leave-type pill as
`background: accent 14%` with `color: accent`: an accent on a wash of itself.
That is the pairing `Chip`'s own comment documents at ~4.35, that my-attendance
failed on, and that I explicitly warned about in the timesheet/users notes
before doing it anyway. Fixed the same way as the day cells — the tint and ring
carry the hue, the label ink is `--fg`.

The lesson is not "remember the rule". It is that **any time a page needs a hue
`Chip` doesn't have, hand-rolling is the failure path**, and the answer is
always tint-plus-neutral-ink.

**Inherited: a third hand-rolled leave-type map.** `config/leaveTypes.js` exists
specifically because "LeaveApply and LeaveMyRequests each carried their own
hand-rolled label/colour map and the two disagreed". This page carries a
**third**, and it is narrower — 4 types where the shared module has 10. So
`earned_leave`, `privilege_leave`, `maternity_leave`, `paternity_leave`,
`bereavement_leave` and `unpaid_leave` render with a neutral pill and their
**raw snake_case code** as the label (`leaveTypeLabels[code] || code`), where
every other leave page shows a proper title.

The split taken here is deliberate and narrow:

- **Colour** moves to the shared `leaveTypeAccent`. Verified first that the
  shared tone map is **identical** for all four types legacy knows (sick=red,
  casual=blue, comp_off=purple, lop=orange), so nothing that renders today
  changes — and the six missing types stop falling through to neutral.
- **Labels** stay legacy's map, verbatim. Switching to `formatLeaveType` would
  render `lop` as "Loss of Pay" where this page says "LOP". That is a copy
  change, not a theme change.

### Two smaller inherited nits, both preserved

- **The LOP count can overstate.** `req.lopDays || req.totalDays || 0` — the
  block renders when `isLOP` is true, so a request flagged LOP with `lopDays`
  absent or `0` displays its **total** days as LOP days. LOP days are unpaid
  days, so this is money-adjacent display. Preserved and flagged.
- **Doubled warning marker.** The text begins with `⚠️` and the callout already
  carries an `AlertTriangle` — legacy had both too. Visible in the screenshots
  as "⚠ ⚠️1 LOP day". One-line copy fix, not taken here.

### Harness: the Avatar gradient is a blind spot

The audit skipped **50 nodes** as `gradient` — every `Avatar`, whose brand
gradient fill defeats the composited-background walk. Measured by hand instead:
white 12px bold initials against both gradient stops, **7.13** and **9.11**.
Fine here, but worth knowing that `Avatar` initials are invisible to the audit
everywhere it is used.

### ⚠️ Unreachable on staging data

`Pending 0` and `Rejected 0`, and unlike the approvals pages this one is **not
period-scoped** (`getAllLeaveRequests` takes no month), so there is no other
period to try. Out of reach: the Approve/Reject buttons, the reject modal, and
the rejection-reason callout. The Revert path and everything else was exercised
on the 50 approved requests.

Sixth surface needing the same seeding exercise.

### Verification

- **0 contrast failures** in both themes (529 light / 532 dark nodes),
  `dimmedByAncestorOpacity: 0`; `Avatar` initials measured separately
- Logic byte-identical (80 lines); `formatDate` identical; 8 mutating paths and
  8 display strings asserted
- Exercised live: tab counts, the approved list with Sick Leave / LOP / Casual
  Leave pills, LOP callout, half-day chip, reason block, "Approved on" line, and
  Revert rendering only for `approved`
- **No writes** — zero calls to any `/approve`, `/reject` or `/revert` endpoint

---

## timesheet/projects — three columns that nothing populates

Small page, clean migration: logic spliced in verbatim (**57 lines,
byte-identical**), all eight write paths asserted by exact text (2 PUT, 2 POST,
2 DELETE, both `confirm()` gates). Lint clean on both sides.

### 🔴 `billingCurrency` has no input anywhere

`billingCurrency` appears **four** times in the legacy file:

- initialised to `'INR'` in the `clientForm` state
- reset to `'INR'` after a save
- reset to `'INR'` when opening the Add dialog
- rendered as a read-only **Currency** column

…and is bound to **no input at all**. So a client created through this screen is
always INR, and there is no way to change it here. Edit happens to preserve
whatever a record already has, because `setClientForm(c)` spreads the whole
object — but nothing in this UI can ever set it.

Given the standing rule that billing currency comes from the record rather than
a hardcoded glyph, a money-defining field with no input is worth naming. Carried
across exactly as-is, hardcoded `'INR'` included.

### 🔴 …and the API doesn't return it, or two other columns

Checked the live endpoint rather than inferring. `GET /timesheet/clients`
returns documents with exactly these keys:

```
_id, name, orgId, companyId, contactId, createdAt
```

No `billingCurrency`, no `contactPerson`, no `contactEmail`. So **three of the
five client columns render em-dashes for all 25 clients** — verified on screen,
not just in the payload.

Two of those three (Contact Person, Contact Email) *do* have inputs in the
dialog. Whether the API stores-but-doesn't-return them, or drops them the way it
drops tax `type`, needs an API-side check — it cannot be settled from the
frontend without creating a client, which was not done.

### One deliberate render difference

Legacy prints `{c.billingCurrency}` bare, so a missing value renders as an empty
cell, while the adjacent Contact and Email columns explicitly print `|| '—'`.
`DataTable` falls back to an em-dash for every column, so Currency now matches
its neighbours. Strictly more consistent, and stated here because it is a
rendered difference rather than a pure re-skin.

### Harness: I hit the stale-paint artifact again

Switched the theme and audited **in the same call**, and got the familiar 29
sidebar failures at 1.67:1. The very next audit in the same batch — taken after
a tab click forced a repaint — was 0/144 on the same page. The guard is already
written down; the mistake is doing both in one `javascript_tool` call. **Force a
paint (screenshot, or any real interaction) between the theme switch and the
read**, every time.

### Verification

- **0 contrast failures** across eight surfaces — clients, projects, and both
  modals × light and dark (144 / 60 / 150 / 67 nodes per theme),
  `dimmedByAncestorOpacity: 0` throughout
- Logic byte-identical (57 lines); 8 write paths asserted; `billingCurrency`
  reference count identical (4) and still bound to no input
- Exercised live: both tabs with counts, the 25-client table, the 4-project
  table with Active chips, and both dialogs opened and dismissed
- **No writes** — client and project counts re-queried after the run: still
  **25** and **4**, unchanged. Nothing created, edited or deleted.

---

## tax/declarations — the one page where source-text parity was not enough

This page computes the 80C cap, the 80D total, the declared-deduction total and
the HRA annualisation that feed TDS, and its regime toggle selects the slab
table. Logic spliced in verbatim (**216 lines, byte-identical**), the five
top-level helpers diffed separately, and **13 tax computations** asserted by
exact text — including the payload's `Math.min(sumItems(items), section80CLimit)`
and the `section80CItems` breakdown it travels with.

### Why the ₹-string check had to escalate

The source-text ₹ diff reported **7 of 23 strings missing**. They were not
missing: the comparison cards became a two-row `map` and the summary rows a
`row()` helper, so `₹{fmt(x)}` became `` `₹${fmt(x)}` ``. Identical output,
different source.

That is exactly the point where a text diff stops being evidence. So the page
got a **rendered** capture instead — legacy and v2 driven with the same inputs
(80C 120,000 + 80,000 over the 150,000 cap, 80D 25,000, rent 10,000/mo):

```
₹0  ₹1,32,600  ₹1,32,600  ₹1,50,000  ₹1,50,000  ₹1,50,000
₹1,00,000  ₹1,00,000  ₹1,50,000  ₹25,000  ₹1,75,000
```

**11 strings, identical sequence, exact match.**

A first pass showed `₹1,00,000` twice in legacy and once in v2. Not a defect —
I had filled the landlord PAN in the v2 run, which clears the "Required when
annual rent exceeds ₹1,00,000" error. Re-run with PAN empty on both: exact
match. *Third time in this project a parity diff was the harness, not the code —
always equalise the input state before believing a count.*

### Computations exercised live, not just diffed

- **80C cap:** 120,000 + 80,000 → `Total 80C (capped) ₹1,50,000` with the
  `Capped at ₹1,50,000` warning, and Total Deductions ₹1,50,000
- **80D flows in uncapped:** +25,000 → Total Deductions **₹1,75,000**
- **HRA PAN threshold:** 8,000/mo (96,000/yr) → no PAN required; 10,000/mo
  (1,20,000/yr) → required; entering a PAN clears it; input uppercases

### Findings, all preserved

- **Statutory figures are hardcoded prose.** The New Regime panel states
  ₹75,000 standard deduction, 14% employer NPS and a ₹12,75,000 rebate ceiling
  as literal text — while `section80CLimit` beside it is fetched from
  `getPublicPlatformSetting('tax_declaration_sections')`. One is correctable
  without a deploy and the others are not, so a finance act will silently split
  them apart.
- **`taxInfo` is dead state.** `setTaxInfo(taxRes.tax)` is called and `taxInfo`
  is never read. Present in both files; lint parity legacy 4 / v2 4.
- **`isProofWindow()`** hides the entire upload block outside Jan 1 – Mar 15, so
  it is unreachable today. Seventh surface on the seeding list.

### ⚠️ Staging footprint — declared, not hidden

Verifying the Old Regime form needs the regime to *be* old, and that is a write.
Judged acceptable: staging, the test user's own record, one toggle, reversible.

- switched `new` → `old`, verified the form, switched back
- **regime re-queried afterwards: `new` — restored**
- the regime PUT created `declarations: {}` server-side where the field was
  previously absent. It holds **none** of the typed test values (checked
  explicitly), and `{}` normalises to the same all-zero render. Nothing was
  saved — the Save button was never pressed — and there is no endpoint to
  remove the empty object, so it is left as-is.

### Verification

- **0 contrast failures** in both themes on the Old Regime form, the richest
  state (95 light / 98 dark nodes), `dimmedByAncestorOpacity: 0`
- Logic byte-identical (216 lines); 5 helpers identical; 13 tax computations and
  all money expressions asserted; rendered money **exact match** with legacy
- Build green; lint parity 4/4, every error inside the verbatim slice

---

## tax/report — hardcoded labels sitting beside the numbers they describe

The employee-facing tax computation: slab breakdown, surcharge, cess, rebate,
YTD TDS and a month-by-month cumulative. Every figure comes from the server;
the page only formats and signs them. Logic spliced in verbatim (**68 lines,
byte-identical**), the three top-level helpers diffed separately, **13 money
expressions** asserted — including `Row`'s
`{negative ? '-' : ''}₹{fmt(Math.abs(value || 0))}` sign handling.

Rendered parity against legacy on the same data: **41 figures, exact match, 0
differences**, with the Monthly TDS breakdown expanded so the running
cumulative column was compared too.

### 🔴 The finding: a label that can contradict the number next to it

```jsx
<Row label={`Less: Standard Deduction (${report.regime === 'new' ? '₹75K' : '₹50K'})`}
     value={-report.standardDeduction} negative />
<Row label="Cess (4%)" value={report.cess} />
```

In both rows the **label is hardcoded** and the **value is server-computed**.
They are rendered side by side in the same table row, so if the server's
standard deduction or cess rate ever changes, the row will state one figure and
show another — and the label is the more authoritative-looking of the two.

This is the sharper form of the same problem written up under
`tax/declarations`, where the hardcoded statutory prose at least sat in a
separate panel from the computed numbers. Here they share a row. Preserved
exactly; the fix is to derive the label from the value (or drop the parenthetical),
which is a copy decision.

### Lint: a spurious error worth not "fixing"

Legacy reports `'Icon' is defined but never used` at `SummaryCard`, and it **is**
used — `<Icon size={14} />` is two lines below. I initially assumed legacy's
`icon: Icon` destructure-rename confused the rule and took `Icon` directly in
v2; the error persisted, so that theory was wrong and the comment in the file
now says so rather than repeating a wrong explanation. Lint parity is **3 errors
+ 1 warning on both sides**, identical set.

### Verification

- **0 contrast failures** in both themes with every section expanded
  (101 light / 105 dark nodes), `dimmedByAncestorOpacity: 0`
- Logic byte-identical (68 lines); `fmt`, `MONTH_NAMES` and `getCurrentFY`
  identical; 13 money expressions asserted
- **Rendered money: 41 figures, exact match** with legacy, monthly breakdown
  expanded
- **No writes.** The only mutating control is the "Switch to … Regime" button,
  which renders solely when `betterRegime !== regime`. The account's better
  regime equals its current regime, so the button never appeared — this page was
  verified entirely read-only.

---

## The seeding script — and the claim it disproved

`scripts/seed-staging-fixtures.js` creates the record states the timesheet/ESS
QA passes could not reach. **Dry-run by default**, `--apply` to write,
`--cleanup` to reverse, host-locked to staging, idempotent (probes first), and
every free-text field it writes carries a `[QA-SEED]` tag.

### I said "one seeding exercise unblocks all seven". That was wrong.

Writing it forced the question of what each fixture actually *costs*, and the
seven split three ways:

| fixture | outcome |
|---|---|
| `attendance-submitted` | ✅ seeded |
| `leave-pending` | ✅ seeded |
| `attendance-rejected` | ⚠️ needs a **second account** |
| `leave-rejected` | ⚠️ needs a **second account** |
| `bank-statement` | ⚠️ possible, but **irreversible** — own flag |
| `gstr2b` | ⚠️ operator must supply a real 2B export |
| `payroll-lock` | ⛔ **refused** — payroll publish |
| `fnf-receipt` | ⛔ **refused** — F&F settlement |
| `proof-window` | ⛔ **not a data problem** — reads the clock |

Two are on the standing never-trigger list, so the script refuses them *even
with `--apply`* and prints why. One cannot be seeded at all.

### Two constraints only the write path revealed

The dry run passed cleanly and was still wrong twice. Both were found by
actually calling the API:

1. **`PATCH /attendance/:id/submit` → 403 Access denied.** Submit is
   self-service; an admin cannot submit another employee's attendance. The
   fixture had been scanning the admin-wide `/attendance/all` and picking any
   draft. Fixed to scan the *self* endpoint.
2. **`PATCH /leave-requests/:id/reject` → 403 "You cannot reject your own leave
   request".** A correct self-approval guard — and it means one account can
   never produce a rejected fixture. Both rejection fixtures now declare
   `secondAccount: true` and explain how to supply one
   (`RIVVRA_STAGING_APPROVER_EMAIL` / `_PASSWORD`).

Neither is a bug. Both are the API being right, and both would have shipped as
a broken script if the write path had been left untested — the same lesson as
the green build that never caught a defect.

### `bank-statement` is gated because it cannot be undone

The API exposes list / create / update / suggestions / reconcile for bank
statements and **no delete route**. A seeded statement is permanent, so it sits
behind `--allow-permanent` rather than running with the rest. Same family as the
three undeletable `ZZ TEST TAX` rows.

### What the fixtures unblocked, verified on screen

- **attendance/approvals** — `Submitted 0 → 1`; Approve and Reject now render,
  and the reject modal opens. In #75 that modal was reported as *inferred from
  the sibling page*, not verified. **It is verified now.**
- **leave/approvals** — `Pending 0 → 1`; Approve/Reject render, reject modal
  opens with its copy, and the `[QA-SEED]` tag is visible on the row
- **0 contrast failures** across the newly-reachable states (54 nodes,
  `dimmed: 0`)

The fixtures are **left in place** — that is the point of them. `--cleanup
--apply` reverses the two that can be reversed.
