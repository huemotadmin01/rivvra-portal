# Pre-production audit — `redesign` → `main`

**Date:** 2026-08-22 · **Head:** `redesign@0d7cc501` vs `main@814432ec`
**Scale:** 264 commits, 306 files, +108,871 / −5,594

---

## Verdict

**Mechanically safe to merge. The risk is not the 160 V2 pages — they are inert
in production. It is the 16 ungated surfaces and ~30 edited legacy files.**

---

## 1. Merge mechanics — all green

| check | result |
|---|---|
| Commits on `main` not in `redesign` | **0** — `main` was merged in on 2026-08-22, so this is a fast merge with no conflict surface |
| `npm ci` | clean (the lockfile break earlier today is fixed) |
| `npm run build` (production, no `VITE_STAGING`) | clean, 499 chunks |
| `.github/workflows/deploy.yml` | **unchanged** |
| STAGING ribbon in production `dist/` | **0 occurrences** — correctly tree-shaken by `VITE_STAGING` |

---

## 2. Blast radius — what actually changes for a production user

**171 routes are `PageSwitch`-gated** on `currentOrg?.uiV2 === true`. No
production org has `uiV2`, so all 160 V2 page files ship as dead code: present
in the bundle, never rendered. This is the property that makes the deploy
survivable.

**16 V2 surfaces are NOT gated** and go live for everyone the moment this
merges, because `PageSwitch` calls `useOrg()`, which throws outside
`OrgProvider`:

- **5 auth pages** — `OrgLoginPage`, `ForgotPassword`, `ResetPassword`,
  `FindWorkspace`, `InviteAccept`. **Every user meets these at login.**
- **10 admin pages** — all of `/admin/*`. Super-admins only.
- **`DocumentVaultV2`** — the ex-employee document route.

**These are the surfaces to smoke-test first tomorrow.** They were each
verified in-browser when built (see phases 45–49), with auth logic spliced
byte-identical and asserted by diff.

**All 16 are now verified on staging against real (pseudonymised) data**, on
2026-08-22:

- **5 auth pages + Document Vault** — smoke-tested earlier in the session.
- **10 admin pages** — verified logged in as super-admin. Every one renders
  live data, not an empty or error state: Dashboard (4 workspaces / 101 users /
  95 of 110 seats), Workspaces (4 rows with plan, seats, owner), Workspace
  detail (90 members with per-app access chips, owner card, stats, backups
  panel, and the `uiV2` toggle itself), Email Templates (66 across 5 groups),
  Announcements (1 active / 18 dismissed), KB Review (0 drafts / 17 platform
  articles), Payroll Config (full FY 2026-27 statutory tree — PF, ESI, cess,
  both tax regimes), Employee Config (4 employment types, 8 separation
  reasons, country ID fields).
- **Console:** no application errors. The only three entries are Chrome
  extension message-channel noise from an extension reconnect.

Navigation was read-only — no state-changing control was clicked.

Two things worth knowing, neither caused by the redesign:

- **PT Master reads `0 states`** on staging. Statutory lookups fall back to the
  org-level PT state, so this is safe, but check production has its PT master
  populated.
- `ats_stage_documents` appears **twice** in Email Templates (dated 22/08/2026
  and 14/07/2026) — a duplicate data row, not a rendering fault.

---

## 3. Risk register

### MEDIUM — legacy pages edited (production users see these today)

| file | change | risk |
|---|---|---|
| `AtsApplicationDetail.jsx` | **−2067** lines, extracted into `applicationDetailParts.jsx` (+2090) | Largest structural change to a live page. Net-neutral refactor, but it is the whole hire/offer/interview flow. |
| `PublicSigningPage/Route` | +79 / −16 | Signing is legally significant. |
| `CareersJobDetail` / `CareersHome` | +173 / −53 | Public, white-labelled, per-customer accent. |
| `incentive/*` (4 files) | currency formatter swap | See below — lower than it looks. |
| `invoicing/*` reports (7 files) | `opacity-70` removal + a React key fix | Cosmetic plus one genuine bug fix. |

### LOW — the incentive currency swap (initially flagged higher, then measured)

`RecordDetail`, `RecordsList`, `MyEarnings`, `IncentiveDashboard` replaced a
hardcoded `formatINR` with `formatCurrency(amount, currentCompany?.currency || 'INR')`.

**Fallback is safe at both levels** — the call site defaults to `'INR'` and
`formatCurrency` itself does `const cur = currency || 'INR'`. A company with no
currency set renders exactly as before. Display only changes for companies that
genuinely have a non-INR currency, where the previous hardcoded ₹ was wrong.

### LOW — shared surfaces

- `ds-tokens.css` — accent `-ink` tokens **added**, no existing `--acc-*`
  value changed. Fills, icons and glows are untouched.
- `legacy-bridge.css` — hover rules added, scoped to `.ds-shell`, which only
  V2 pages mount. Cannot reach production pages.
- `marketing-tokens.css` — **does** ship to production marketing pages, but is
  pinned dark, so it renders identically to today (verified: 164 nodes, 0
  colour changes under a forced theme).

---

## 4. Still pending in the redesign

| item | state |
|---|---|
| `PayrollRunPage` V2 feature port | **Not done.** +349 lines of guided-run behaviour exist on the legacy page only. V2 lags. Inert in production. |
| KB double left-column | Rail restored (#149); KB now shows its own article tree *and* the app rail. Needs a look. |
| Contrast gate — hover pass | Built, canary-tested, **discarded**: it reported green over a live bug. |
| `applicationDetailParts` → ds | Deferred by decision until legacy `AtsApplicationDetail` retires. |
| `KnowledgeBasePage`, careers ×2 | Deliberately not migrated. Careers is blocked on ds supporting a per-instance accent override. |
| `--acc-fuchsia` / `--acc-rose` on `surface-2` (light) | 4.25 / 4.24 — below AA, not currently used as text anywhere covered. |

---

## 5. Suggested order for tomorrow

1. **Merge, then smoke the 16 ungated surfaces first** — log out and back in
   (all five auth pages), then one `/admin/*` page. These are the only things
   that change for a normal user.
2. **Then the edited legacy pages** — open one ATS application detail (the
   −2067 refactor), one signing link, one careers page, one incentive record.
3. **`uiV2` stays off for production orgs.** Turn it on for one pilot org only
   after 1 and 2 are clean. That converts 160 pages from dead code to live in a
   single flag flip, so it deserves its own day.
4. **Rollback is a flag, not a revert** — for anything V2, unset `uiV2`. For
   the 16 ungated surfaces it is a real revert, which is why they are step 1.
