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
