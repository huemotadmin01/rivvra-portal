#!/usr/bin/env node
/* global process */
// eslint.config.js applies globals.browser to every js/jsx file; this is a
// Node-run script, so it declares its own globals.

/**
 * seed-staging-fixtures.js — create the record states the redesign QA passes
 * could not reach on staging.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Seven surfaces went unverified across the timesheet/ESS migration, every one
 * of them because no record on staging was in the required state — not because
 * the code was untestable. Rather than migrate seven pages blind, this creates
 * the states once.
 *
 * ── What it will NOT do ──────────────────────────────────────────────────────
 * Two of those seven need actions on the standing never-trigger list, so this
 * script REFUSES them even with --apply, and prints why:
 *
 *   payroll-lock   needs a payroll run moved to processed/finalized
 *                  → that is "payroll publish". Not automatable here.
 *   fnf-receipt    needs POST /fnf/settlement/:id/finalize
 *                  → that is "F&F settlement". Not automatable here.
 *
 * A third is not a data problem at all:
 *
 *   proof-window   isProofWindow() reads the system clock (Jan 1 – Mar 15).
 *                  No fixture can change that. See the note it prints.
 *
 * And one is deliberately operator-supplied:
 *
 *   gstr2b         requires importing a GSTR-2B return. This script will not
 *                  fabricate statutory filing data. Supply a real export with
 *                  --gstr2b-file=<path> and it will import and reconcile it.
 *
 * ── Safety model ─────────────────────────────────────────────────────────────
 *   • Dry-run by DEFAULT. Nothing is written without --apply.
 *   • Refuses to run against any host that is not the staging API.
 *   • Every fixture probes first and skips if already satisfied (idempotent).
 *   • Free-text fields carry a SEED_TAG so fixtures are identifiable later.
 *   • --cleanup reverses what can be reversed. One fixture cannot be
 *     (bank-statement has no DELETE route) and is gated behind its own flag.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node scripts/seed-staging-fixtures.js                 # probe + plan, no writes
 *   node scripts/seed-staging-fixtures.js --apply         # create the fixtures
 *   node scripts/seed-staging-fixtures.js --cleanup --apply
 *   node scripts/seed-staging-fixtures.js --only=leave-pending --apply
 *   node scripts/seed-staging-fixtures.js --apply --allow-permanent   # incl. bank statement
 *
 * Credentials come from RIVVRA_STAGING_EMAIL / RIVVRA_STAGING_PASSWORD, or from
 * the secrets file at ~/rivvra-backups/staging-secrets-*.txt. Never printed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const API = process.env.RIVVRA_STAGING_API || 'https://api-staging.rivvra.com';
const ORG = process.env.RIVVRA_STAGING_ORG || 'huemot-technology';

/** Shared staging login. Not a secret; the password is read separately. */
const DEFAULT_STAGING_EMAIL = 'u036a4d29a02@staging.invalid';

/** Marker written into every free-text field this script fills. */
const SEED_TAG = '[QA-SEED]';

/** Hard guard: this script only ever talks to staging. */
const ALLOWED_HOSTS = ['api-staging.rivvra.com', 'localhost', '127.0.0.1'];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => (argv.find((a) => a.startsWith(`${f}=`)) || '').split('=').slice(1).join('=');

const APPLY = has('--apply');
const CLEANUP = has('--cleanup');
const ALLOW_PERMANENT = has('--allow-permanent');
const ONLY = val('--only');
const GSTR2B_FILE = val('--gstr2b-file');
const APPROVER = process.env.RIVVRA_STAGING_APPROVER_EMAIL && process.env.RIVVRA_STAGING_APPROVER_PASSWORD
  ? { email: process.env.RIVVRA_STAGING_APPROVER_EMAIL, password: process.env.RIVVRA_STAGING_APPROVER_PASSWORD }
  : null;

// ── output ───────────────────────────────────────────────────────────────────
const C = { dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m', off: '\x1b[0m' };
const say = (...a) => console.log(...a);
const head = (t) => say(`\n${C.cyn}${t}${C.off}\n${'─'.repeat(Math.min(t.length, 70))}`);

// ── auth ─────────────────────────────────────────────────────────────────────

/** Read credentials without ever echoing them. */
function credentials() {
  if (process.env.RIVVRA_STAGING_EMAIL && process.env.RIVVRA_STAGING_PASSWORD) {
    return { email: process.env.RIVVRA_STAGING_EMAIL, password: process.env.RIVVRA_STAGING_PASSWORD };
  }
  const dir = join(homedir(), 'rivvra-backups');
  let file;
  try {
    file = readdirSync(dir).filter((f) => /^staging-secrets-.*\.txt$/.test(f)).sort().pop();
  } catch {
    throw new Error(`No credentials. Set RIVVRA_STAGING_EMAIL and RIVVRA_STAGING_PASSWORD, or place a secrets file in ${dir}`);
  }
  if (!file) throw new Error(`No staging-secrets-*.txt found in ${dir}`);
  const text = readFileSync(join(dir, file), 'utf8');
  // The secrets file holds STAGING_LOGIN_PASSWORD but no login email — the
  // shared staging account is identified separately. Override either with env.
  const password = (text.match(/^\s*STAGING_LOGIN_PASSWORD\s*[:=]\s*(\S+)/im) || [])[1];
  const email = process.env.RIVVRA_STAGING_EMAIL || DEFAULT_STAGING_EMAIL;
  if (!password) throw new Error(`No STAGING_LOGIN_PASSWORD found in ${file}`);
  return { email, password };
}

let TOKEN = null;
let COMPANY_ID = null;

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new Error(`Refusing to call ${host} — this script only runs against staging`);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (COMPANY_ID) headers['x-company-id'] = COMPANY_ID;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || res.statusText;
    const err = new Error(`${method} ${path} → ${res.status} ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return raw ? { data, res } : data;
}

async function login() {
  const { email, password } = credentials();
  const out = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  TOKEN = out.token || out.accessToken;
  if (!TOKEN) throw new Error('Login succeeded but returned no token');
  const companies = await api(`/api/org/${ORG}/companies`).catch(() => null);
  const list = companies?.companies || companies || [];
  COMPANY_ID = Array.isArray(list) && list.length ? (list[0]._id || list[0].id) : null;
  say(`${C.dim}authenticated as ${email.replace(/(.{4}).*(@.*)/, '$1***$2')}${COMPANY_ID ? ` · company ${COMPANY_ID}` : ''}${C.off}`);
}

// ── fixture helpers ──────────────────────────────────────────────────────────

const ts = (p) => `/api/timesheet${p}`;
const inv = (p) => `/api/org/${ORG}/invoicing${p}`;

/** Months to look through when hunting for a seedable record. */
function recentPeriods(n = 6) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return out;
}

async function findAttendance(statuses) {
  for (const { month, year } of recentPeriods()) {
    const res = await api(ts(`/attendance/all?month=${month}&year=${year}`)).catch(() => null);
    const rows = res?.attendance || [];
    const hit = rows.find((r) => statuses.includes(r.status));
    if (hit) return { ...hit, month, year };
  }
  return null;
}

async function findLeave(statuses) {
  const res = await api(ts('/leave-requests')).catch(() => null);
  const rows = Array.isArray(res) ? res : res?.requests || res?.leaveRequests || res?.data || [];
  return rows.find((r) => statuses.includes(r.status)) || null;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const FIXTURES = [
  {
    id: 'attendance-submitted',
    unblocks: 'attendance/approvals — the Approve and Reject buttons (render only for status `submitted`)',
    async probe() {
      const hit = await findAttendance(['submitted']);
      return hit ? { satisfied: true, detail: `${hit.employeeName} ${hit.month}/${hit.year}` } : { satisfied: false };
    },
    async plan() {
      // MUST be the operator's OWN attendance. `PATCH /attendance/:id/submit`
      // is self-service: submitting another employee's record returns
      // 403 Access denied, which is correct — so scan the self endpoint, not
      // the admin-wide /attendance/all.
      for (const { month, year } of recentPeriods()) {
        const mine = await api(ts(`/attendance/${month}/${year}`)).catch(() => null);
        const att = mine?.attendance;
        if (att && att.status === 'draft') {
          return { can: true, detail: `submit your own ${month}/${year} attendance (currently draft)`, draft: { ...att, month, year } };
        }
      }
      return { can: false, detail: 'none of your own last 6 months of attendance is in draft — nothing to submit' };
    },
    async seed(plan) {
      await api(ts(`/attendance/${plan.draft._id}/submit`), { method: 'PATCH' });
      return `submitted attendance ${plan.draft._id}`;
    },
    async cleanup() {
      const hit = await findAttendance(['submitted']);
      if (!hit) return 'nothing to revert';
      await api(ts(`/attendance/${hit._id}/revert`), { method: 'PATCH' });
      return `reverted attendance ${hit._id} to draft`;
    },
  },

  {
    id: 'attendance-rejected',
    unblocks: 'attendance/approvals — the reject modal and the rejection-reason Callout',
    needs: 'attendance-submitted',
    // Verified against the live API: rejecting your own submission returns 403.
    // The approver must be a different account from the submitter, so this
    // cannot be seeded single-handed. Set RIVVRA_STAGING_APPROVER_* to supply one.
    secondAccount: true,
    async probe() {
      const hit = await findAttendance(['rejected']);
      return hit ? { satisfied: true, detail: `${hit.employeeName} ${hit.month}/${hit.year}` } : { satisfied: false };
    },
    async plan() {
      const sub = await findAttendance(['submitted']);
      return sub
        ? { can: true, detail: `reject ${sub.employeeName} ${sub.month}/${sub.year}`, sub }
        : { can: false, detail: 'needs a submitted attendance first (run attendance-submitted)' };
    },
    async seed(plan) {
      await api(ts(`/attendance/${plan.sub._id}/reject`), {
        method: 'PATCH',
        body: { rejectionReason: `${SEED_TAG} fixture — created to exercise the rejection view` },
      });
      return `rejected attendance ${plan.sub._id}`;
    },
    async cleanup() {
      const hit = await findAttendance(['rejected']);
      if (!hit) return 'nothing to revert';
      await api(ts(`/attendance/${hit._id}/revert`), { method: 'PATCH' });
      return `reverted attendance ${hit._id} to draft`;
    },
  },

  {
    id: 'leave-pending',
    unblocks: 'leave/approvals — Approve/Reject buttons and the reject modal (Pending was 0)',
    async probe() {
      const hit = await findLeave(['pending']);
      return hit ? { satisfied: true, detail: `${hit.employee?.fullName || hit.employeeName} ${hit.fromDate?.slice(0, 10)}` } : { satisfied: false };
    },
    async plan() {
      const bal = await api(ts('/leave-balances/me')).catch(() => null);
      const type = bal?.balances?.[0]?.leaveType || bal?.leaveTypes?.[0]?.code || 'casual_leave';
      // A single working day well clear of today, to avoid overlap rejections.
      const d = new Date();
      d.setDate(d.getDate() + 21);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { can: true, detail: `apply 1 day of ${type} on ${day}`, body: { leaveType: type, fromDate: day, toDate: day, reason: `${SEED_TAG} fixture — created to exercise the approvals view`, isHalfDay: false } };
    },
    async seed(plan) {
      const out = await api(ts('/leave-requests'), { method: 'POST', body: plan.body });
      return `created leave request ${out?._id || out?.request?._id || ''}`.trim();
    },
    async cleanup() {
      const hit = await findLeave(['pending']);
      if (!hit) return 'nothing to cancel';
      await api(ts(`/leave-requests/${hit._id}/cancel`), { method: 'PATCH', body: { reason: `${SEED_TAG} cleanup` } });
      return `cancelled leave request ${hit._id}`;
    },
  },

  {
    id: 'leave-rejected',
    unblocks: 'leave/approvals — the rejection-reason block (Rejected was 0)',
    needs: 'leave-pending',
    // Verified against the live API: "You cannot reject your own leave request".
    // A correct guard, and it means one account cannot produce this fixture.
    secondAccount: true,
    async probe() {
      const hit = await findLeave(['rejected']);
      return hit ? { satisfied: true, detail: hit.rejectionReason?.slice(0, 40) } : { satisfied: false };
    },
    async plan() {
      const pend = await findLeave(['pending']);
      return pend
        ? { can: true, detail: `reject request ${pend._id}`, pend }
        : { can: false, detail: 'needs a pending leave request first (run leave-pending)' };
    },
    async seed(plan) {
      await api(ts(`/leave-requests/${plan.pend._id}/reject`), {
        method: 'PATCH',
        body: { rejectionReason: `${SEED_TAG} fixture — created to exercise the rejection view` },
      });
      return `rejected leave request ${plan.pend._id}`;
    },
    async cleanup() {
      const hit = await findLeave(['rejected']);
      if (!hit) return 'nothing to revert';
      await api(ts(`/leave-requests/${hit._id}/revert`), { method: 'PATCH' });
      return `reverted leave request ${hit._id} to pending`;
    },
  },

  {
    id: 'bank-statement',
    unblocks: 'invoicing/bank-reconciliation — the statement table (never had a row)',
    permanent: true,
    permanentWhy: 'the API exposes list/create/update/reconcile for bank statements but NO delete route, so this row cannot be removed afterwards',
    async probe() {
      const res = await api(inv('/bank-statements')).catch(() => null);
      const rows = res?.statements || res?.data || [];
      return rows.length
        ? { satisfied: true, detail: `${rows.length} statement(s) already present` }
        : { satisfied: false };
    },
    async plan() {
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      return {
        can: true,
        detail: `create statement "${SEED_TAG} fixture" dated ${date}`,
        body: { name: `${SEED_TAG} fixture statement`, date, startBalance: 0, endBalance: 0, currency: 'INR' },
      };
    },
    async seed(plan) {
      await api(inv('/bank-statements'), { method: 'POST', body: plan.body });
      return 'created bank statement (PERMANENT — no delete route exists)';
    },
    cleanup: null,
  },

  {
    id: 'gstr2b',
    unblocks: 'invoicing GSTR-2B reconciliation table',
    operatorSupplied: true,
    operatorWhy: 'this needs a real GSTR-2B return imported. The script will not fabricate statutory filing data — supply an export with --gstr2b-file=<path>',
    async probe() {
      const res = await api(inv('/gst/2b/imports')).catch(() => null);
      const rows = res?.imports || res?.data || [];
      return rows.length
        ? { satisfied: true, detail: `${rows.length} 2B import(s) present` }
        : { satisfied: false };
    },
    async plan() {
      if (!GSTR2B_FILE) return { can: false, detail: 'no --gstr2b-file supplied' };
      return { can: true, detail: `import ${GSTR2B_FILE} then reconcile its return period` };
    },
    async seed() {
      throw new Error('GSTR-2B import is multipart/form-data; run it from the Invoicing UI with the supplied file, then re-run this script to reconcile.');
    },
    cleanup: null,
  },

  {
    id: 'payroll-lock',
    unblocks: 'approvals + attendance/approvals — the "Cannot revert — payroll is processed" branch',
    refuse: 'Reaching this state means moving a payroll run to processed/finalized — that is a payroll publish, which is on the standing never-trigger list. Set it up by hand on staging if you want the branch verified, or accept it as unverified.',
  },

  {
    id: 'fnf-receipt',
    unblocks: 'timesheet/my-fnf — the settlement receipt',
    refuse: 'Reaching this state means POST /fnf/settlement/:id/finalize — an F&F settlement, on the standing never-trigger list. Not automatable here.',
  },

  {
    id: 'proof-window',
    unblocks: 'tax/declarations — the proof-upload block',
    notData: 'isProofWindow() reads the system clock and returns true only between Jan 1 and Mar 15. No record state changes that. The honest options are: verify it during the window, temporarily stub the helper behind a flag, or accept it as seasonally unverifiable. This script will not move your clock.',
  },
];

// ── run ──────────────────────────────────────────────────────────────────────

async function main() {
  head('Rivvra staging QA fixtures');
  say(`${C.dim}api ${API} · org ${ORG}${C.off}`);
  say(APPLY
    ? `${C.yel}MODE: APPLY — writes are enabled${C.off}`
    : `${C.grn}MODE: dry run — nothing will be written (pass --apply to execute)${C.off}`);
  if (CLEANUP) say(`${C.yel}CLEANUP requested${C.off}`);

  await login();

  const selected = FIXTURES.filter((f) => !ONLY || f.id === ONLY);
  if (ONLY && !selected.length) {
    say(`${C.red}No fixture called "${ONLY}". Known: ${FIXTURES.map((f) => f.id).join(', ')}${C.off}`);
    process.exitCode = 1;
    return;
  }

  const summary = { satisfied: 0, seeded: 0, planned: 0, blocked: 0, refused: 0, failed: 0 };
  /** Fixtures this pass will create, so chained ones can report honestly. */
  const willRun = new Set();

  for (const f of selected) {
    head(f.id);
    say(`${C.dim}unblocks: ${f.unblocks}${C.off}`);

    if (f.refuse) {
      say(`${C.red}REFUSED${C.off} — ${f.refuse}`);
      summary.refused++;
      continue;
    }
    if (f.notData) {
      say(`${C.yel}NOT A DATA PROBLEM${C.off} — ${f.notData}`);
      summary.refused++;
      continue;
    }
    // The gate is about CREATING the fixture (self-approval is blocked).
    // Reverting one is a plain admin action, so cleanup needs no second account.
    if (f.secondAccount && !APPROVER && !CLEANUP) {
      const state = await f.probe().catch(() => ({ satisfied: false }));
      if (state.satisfied) {
        say(`${C.grn}already satisfied${C.off}${state.detail ? ` — ${state.detail}` : ''}`);
        summary.satisfied++;
        continue;
      }
      say(`${C.yel}needs a second account${C.off} — the API rejects self-approval (verified: 403), so the`);
      say(`${C.dim}approver must differ from the requester. Set RIVVRA_STAGING_APPROVER_EMAIL and${C.off}`);
      say(`${C.dim}RIVVRA_STAGING_APPROVER_PASSWORD to a second staging account and re-run.${C.off}`);
      summary.blocked++;
      continue;
    }

    try {
      if (CLEANUP) {
        if (!f.cleanup) {
          say(`${C.yel}no cleanup possible${C.off}${f.permanentWhy ? ` — ${f.permanentWhy}` : ''}`);
          continue;
        }
        if (!APPLY) { say(`${C.dim}would clean up (dry run)${C.off}`); summary.planned++; continue; }
        say(`${C.grn}✓${C.off} ${await f.cleanup()}`);
        summary.seeded++;
        continue;
      }

      const state = await f.probe();
      if (state.satisfied) {
        say(`${C.grn}already satisfied${C.off}${state.detail ? ` — ${state.detail}` : ''}`);
        summary.satisfied++;
        continue;
      }

      const plan = await f.plan();
      if (!plan.can) {
        // In a dry run the prerequisite hasn't been created yet, so a chained
        // fixture looks blocked when --apply would in fact satisfy it earlier
        // in the same pass. Say that, rather than understating the plan.
        if (!APPLY && f.needs && willRun.has(f.needs)) {
          say(`${C.dim}would: ${plan.detail || 'run after ' + f.needs}${C.off}`);
          say(`${C.dim}(currently blocked only because ${f.needs} has not run yet — --apply chains them in one pass)${C.off}`);
          willRun.add(f.id);
          summary.planned++;
          continue;
        }
        say(`${C.yel}blocked${C.off} — ${plan.detail}`);
        if (f.operatorWhy) say(`${C.dim}${f.operatorWhy}${C.off}`);
        summary.blocked++;
        continue;
      }
      willRun.add(f.id);

      if (f.permanent && !ALLOW_PERMANENT) {
        say(`${C.yel}skipped — irreversible${C.off}`);
        say(`${C.dim}${f.permanentWhy}${C.off}`);
        say(`${C.dim}re-run with --allow-permanent if you accept that${C.off}`);
        summary.blocked++;
        continue;
      }

      if (!APPLY) {
        say(`${C.dim}would: ${plan.detail}${C.off}`);
        summary.planned++;
        continue;
      }

      say(`${C.grn}✓${C.off} ${await f.seed(plan)}`);
      summary.seeded++;
    } catch (err) {
      say(`${C.red}failed${C.off} — ${err.message}`);
      summary.failed++;
    }
  }

  head('summary');
  say(`already satisfied ${summary.satisfied} · ${APPLY ? 'seeded' : 'would seed'} ${APPLY ? summary.seeded : summary.planned} · blocked ${summary.blocked} · refused ${summary.refused} · failed ${summary.failed}`);
  if (!APPLY && summary.planned) say(`${C.dim}re-run with --apply to execute${C.off}`);
  if (summary.refused) say(`${C.dim}refused fixtures are deliberate — see the reasons above${C.off}`);
  process.exitCode = summary.failed ? 1 : 0;
}

main().catch((e) => { say(`${C.red}${e.message}${C.off}`); process.exitCode = 1; });
