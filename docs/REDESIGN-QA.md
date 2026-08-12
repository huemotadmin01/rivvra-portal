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
