# Staging environment

A fully isolated copy of Rivvra for testing the UI redesign (and anything else
risky) against realistically-shaped data. **Nothing done in staging can reach a
customer**: the data is scrubbed, every outbound side effect is neutered, and
the API cannot see production.

## Architecture

```
rivvra-portal-staging.onrender.com   Render web service (this repo)
  │                         node staging/server.cjs — serves dist/ behind
  │                         HTTP basic auth, X-Robots-Tag: noindex, robots.txt disallow
  │                         built with: npm run build:staging
  │                         (VITE_API_URL=https://api-staging.rivvra.com, VITE_STAGING=true)
  ▼
api-staging.rivvra.com      Render web service (Rivvra-Staffing-Enterprise-Suite-api,
  │                         same branch as production, staging env vars)
  │                         STAGING=true · CRONS_DISABLED=true · its own JWT_SECRET
  ▼
staging Atlas cluster       separate Atlas project + credentials
                            only ever receives SCRUBBED data
```

Production (www.rivvra.com → GitHub Pages → prod API on Render → prod Atlas)
is untouched by any of this.

## How to tell which environment you're in

- **Frontend:** an amber **"STAGING — TEST DATA ONLY"** ribbon is fixed to the
  top of every page. It cannot be dismissed. No ribbon = production.
- **API:** `GET /health` returns `"staging": true` on the staging instance and
  `"staging": false` in production. Also check `database`.
- Staging JWTs do not work against production and vice versa (different
  `JWT_SECRET`s), so a mixed-up tab fails closed at login.

## Access

- **URL:** https://rivvra-portal-staging.onrender.com — gated by HTTP basic auth.
  (No custom domain: the free Render workspace includes 2 custom domains, both
  used — api-staging.rivvra.com took the second. Adding staging.rivvra.com
  would cost $0.25/mo; skipped by decision on 2026-08-11. The API's CORS
  allowlist already includes both origins, so adding the domain later is just
  Render + one GoDaddy CNAME.) Credentials
  live in the team password manager ("Rivvra staging — basic auth"), set via
  the `STAGING_BASIC_AUTH` env var on the Render frontend service.
- **App login:** every scrubbed user's password is the shared staging password
  (password manager: "Rivvra staging — app login"). Emails are rewritten to
  `u<hash>@staging.invalid`; find your own address by asking an admin to look
  you up, or use the super-admin account. Google sign-in is **disabled** on
  staging (deliberately — `GOOGLE_CLIENT_ID` is unset, fails closed).

## Refreshing the database

The copy is accurate the day it's taken and stale a month later. Refresh
(monthly, or on demand) from the API repo:

```bash
cd ../Rivvra-Staffing-Enterprise-Suite-api
R2_ENDPOINT=... R2_BUCKET=rivvra-db-backups \
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
STAGING_MONGO_URL='mongodb+srv://...staging...' \
STAGING_LOGIN_PASSWORD='<staging app login password>' \
./scripts/staging-refresh.sh
```

What it does: downloads the newest production backup from R2 → restores into a
**local** mongod → runs `scripts/scrub-staging.js --execute` → runs
`scripts/verify-staging-scrub.js` (hard gate: any surviving email/PAN/Aadhaar/
IFSC/blob aborts the pipeline) → dumps the scrubbed copy → loads it into the
staging cluster with `--drop`.

**Raw production data never touches the staging cluster.** The scrub also
refuses to run against anything that isn't localhost, and the load step
refuses a target URL that doesn't contain "staging".

Prereqs: a local `mongod` running on 27017, `mongodump`/`mongorestore`
(`brew install mongodb-database-tools`), `aws` CLI.

## What the scrub does (summary)

- Every email → `u<hash>@staging.invalid` (deterministic, unique per original,
  swept from every string field in every collection — including inside prose).
- Person/company names → generated equivalents, **length-preserving**, same
  original → same fake everywhere (denormalized caches stay consistent). A
  prose pass also replaces known names inside activity feeds, notes, etc.
- Phones → non-routable (`00000…`-prefixed), length-preserving; also swept
  from free text.
- Bank/statutory identifiers (account numbers, IFSC, PAN, Aadhaar, UAN,
  PF/ESI, GSTIN, TAN) → nulled everywhere.
- Document blobs and signed PDFs → stripped (filename/mimeType/size kept);
  `cloudinaryPublicId` nulled so staging can never address (or delete) a
  production Cloudinary object.
- Gmail OAuth tokens nulled; passwords reset to the shared staging password;
  org/membership auth settings forced to password login.
- `sign_webhooks` deactivated AND pointed at `staging.invalid` (these fire
  from DB state — no env var could stop them).
- Dropped outright: `otp_codes`, `password_reset_tokens`, `auth_rate_limits`,
  `email_logs`, `chatbot_logs`, `verify_logs`, `enrichment_audits`,
  `export_logs`, `workspace_recovery_log`.
- **Preserved:** row counts (except drops above), FKs, dates, currency codes,
  salary/invoice amounts, org/company relationships, archived + alumni
  records, financial-year boundaries.

Each run writes `scrub-report-<ts>.json` with per-collection counts.

## What is stubbed vs live on the staging API

| Integration | Staging state |
|---|---|
| Resend (transactional email) | Key from a staging-only Resend account, no verified domain → every send fails at the API. All recipient addresses are `@staging.invalid` (undeliverable) anyway. Note: the key must EXIST — the SDK throws at boot without one. |
| Gmail outreach / todo scan | Dead: OAuth client secrets unset + tokens scrubbed from DB. |
| Google sign-in | Disabled (`GOOGLE_CLIENT_ID` unset, fails closed). |
| Stripe | Keys unset → client is null, clean no-op. |
| Odoo | All `ODOO_*` unset → fully inert (guarded four-var check). |
| Cloudinary | Creds unset → uploads fail, stored documents show as unavailable. |
| Sign webhooks | Deactivated in DB by the scrub. E-signing itself is internal (pdf-lib) and works. |
| Cron jobs (19) | `CRONS_DISABLED=true` — none register. Re-enable one with `CRON_ALLOWLIST=jobName`. |
| OpenAI | Live with a separate low-limit key; `OPENAI_PROXY_REQUIRE_AUTH=true`. |
| GST / e-invoice / GSTN | Off (default-off flags left unset; sandbox defaults). |
| Sentry | Separate staging project (`SENTRY_DSN`), frontend reports `environment: staging`, release `ui-v2`. |
| FX rates, geo-IP | Live (read-only, harmless). |

## Known limitations

- **Documents/files don't open** — blobs are stripped and Cloudinary is
  disconnected. Filenames and sizes remain, so list layouts are realistic.
- **No email ever arrives anywhere**, including OTP login — hence the shared
  password.
- **Render free tier sleeps** — first request after idle takes ~50 s.
- **The copy drifts** — refresh before relying on it.
- Job-board/public-careers Turnstile, payments, and billing flows are dead
  ends by design.
- Names/emails inside PDFs already rendered into `bodyHtml`-style caches are
  dropped with `email_logs`; names inside free text are replaced only when
  they match a known person/company name.

## Provisioning reference (one-time)

1. **Atlas:** new project "Rivvra Staging" → M0 cluster (name contains
   "staging") → DB user + allow 0.0.0.0/0 (Render dynamic IPs).
2. **Render (API):** new web service from the API repo, main branch. Env:
   `MONGO_URL` (staging cluster), `MONGO_DB=brynsaleads`, `STAGING=true`,
   `CRONS_DISABLED=true`, `EXTRA_CORS_ORIGINS=https://staging.rivvra.com`,
   fresh `JWT_SECRET`/`EXPORT_SECRET`/`GMAIL_ENCRYPTION_KEY`/`ADMIN_SECRET`,
   staging `RESEND_API_KEY`, low-limit `OPENAI_API_KEY`,
   `OPENAI_PROXY_REQUIRE_AUTH=true`, staging `SENTRY_DSN`.
   Custom domain `api-staging.rivvra.com`.
3. **Render (frontend):** new web service from this repo, `redesign` branch.
   Build: `npm ci && npm run build:staging` · Start: `npm run start:staging`.
   Env: `VITE_API_URL=https://api-staging.rivvra.com`, `VITE_STAGING=true`,
   `VITE_SENTRY_DSN=<staging>`, `VITE_APP_VERSION=ui-v2`,
   `STAGING_BASIC_AUTH=user:password`. Custom domain `staging.rivvra.com`.
4. **GoDaddy DNS:** CNAME `staging` and `api-staging` → the Render targets
   shown on each service's custom-domain page. (Additive records only — do
   not touch `www`/`@`.)
5. Run the refresh pipeline (above), then verify:
   `curl https://api-staging.rivvra.com/health` shows `"staging": true`;
   unauthenticated https://staging.rivvra.com returns 401; after basic auth,
   the amber ribbon is visible and login works with the staging password.

---

## Testing risky changes without touching production (policy, 2026-08-26)

Both staging services deploy from **`main`** — the same branch production
deploys from. That is deliberate: staging then always rehearses exactly the
code production runs (this is what made the onboarding e2e rehearsal
meaningful). There is **no permanent staging branch**, and there should not
be one: it drifts, doubles every hotfix merge, and quietly makes staging stop
telling the truth about prod.

When a new feature is risky, pick the tier that fits:

1. **Default — dark launch behind a per-org flag (the `uiV2` playbook).**
   Build the feature gated on an org-level flag, push to `main`. It deploys
   everywhere but runs nowhere until the flag is flipped — first for the
   staging org, then a pilot company, then everyone. Production runs the
   exact bits that were tested, and rollback is one flag flip per org.
   Fits ~90% of work: new pages, endpoints, reports, crons (crons also sit
   behind `CRONS_DISABLED`/`CRON_ALLOWLIST`).

2. **Too invasive to flag (auth/middleware rewrites, dependency upgrades,
   schema migrations) — short-lived feature branch + repoint staging.**
   Work on `feature/x`. Production only deploys from `main`, so it is
   untouched. In the Render dashboard, switch the staging service's deploy
   branch (Settings → Build & Deploy → Branch) from `main` to `feature/x`
   — API service, portal service, or both. Test against the scrubbed
   staging DB (code AND data fully isolated; schema migrations can run for
   real there). When it survives: merge to `main`, point staging back at
   `main`, delete the branch. The branch lives days, not forever.
   Need fresher data first? `scripts/staging-refresh.sh` (API repo) rebuilds
   staging's DB from the latest R2 backup.

3. **Money-math and data-shape logic — local rigs before any deploy.**
   The in-memory-mongo rig and a local mongod loaded from a scrubbed dump
   catch most breakage without deploying anything.

Safety net behind all three: nightly R2 backup + weekly proven restore test
(`db-restore-test.yml`), per-org flags for instant rollback, and Render's
"redeploy previous commit" for a truly bad push.

> ✅ **Resolved 2026-08-26:** both staging services now build `main` —
> API verified via `/health` commit, portal repointed in the Render dashboard
> and verified by bundle content. The fully-merged `redesign` branch was
> deleted from origin (tip was `ad35f598`, recreatable from that SHA).

## Branching for the redesign (HISTORICAL — merged to main 2026-08-22; kept for the record)

The UI redesign lives on the long-lived **`redesign`** branch, per the
handoff's rollout plan. Rules:

- **`redesign`** — all v2 work. The staging frontend service
  (`rivvra-portal-staging`) builds from this branch, so pushing here
  deploys staging only.
- **`main`** — production. `.github/workflows/deploy.yml` triggers on
  pushes to `main` and publishes to GitHub Pages (www.rivvra.com), so
  redesign commits must NOT land here until a deliberate merge.
- Slices 0–4 (portal commits `0cb3132c` … `475c1952`) are already on
  `main` and therefore already deployed to production. They are inert
  there — no production org has the `uiV2` flag, and the v2 components
  are lazy-loaded — but they are live code, not shelved.
- Rebase `redesign` onto `main` before each merge back so unrelated
  production fixes stay ahead of the redesign work.
- The **API repo stays on `main`**: its only redesign change is the
  additive `uiV2` field on the org payload plus the super-admin
  whitelist entry, which both environments need.
