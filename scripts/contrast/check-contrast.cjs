#!/usr/bin/env node
/**
 * Build gate: fail if any rendered text falls below WCAG AA contrast.
 *
 * Follows the house pattern of staging/check-no-prod-api.cjs — a plain node
 * script, hard failure rather than a warning, run from an npm script.
 *
 * Usage:
 *   node scripts/contrast/check-contrast.cjs [--base http://localhost:5173]
 *                                            [--routes a,b,c] [--json out.json]
 *                                            [--themes dark,light]
 *
 * Uses playwright-core against the CHANNEL Chrome already on the machine, so
 * nothing downloads a browser — GitHub's ubuntu runners ship Chrome, and so do
 * most dev machines. If Chrome is missing the script says so and exits 2,
 * which is distinguishable from "found contrast failures" (exit 1).
 *
 * Routes are declared in routes.json beside this file so adding a page to the
 * gate is a data change, not a code change.
 */
const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = argOf('base', process.env.CONTRAST_BASE || 'http://localhost:5173').replace(/\/$/, '');
const THEMES = argOf('themes', 'dark,light').split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = argOf('json', null);

/** The measurement, shared verbatim with anything else that wants it. */
const CORE_SRC = fs.readFileSync(path.join(HERE, 'audit-core.js'), 'utf8');
const AUDIT_EXPR = CORE_SRC.slice(
  CORE_SRC.indexOf('String.raw`') + 'String.raw`'.length,
  CORE_SRC.lastIndexOf('`;'),
);

/** Accepted failures. An entry without a reason is a bug, not a decision. */
function loadAllowlist() {
  const f = path.join(HERE, 'allowlist.json');
  if (!fs.existsSync(f)) return [];
  const entries = JSON.parse(fs.readFileSync(f, 'utf8')).allow || [];
  const unreasoned = entries.filter((e) => !e.reason || !String(e.reason).trim());
  if (unreasoned.length) {
    console.error(`allowlist.json: ${unreasoned.length} entr(ies) have no reason. Every suppression must say why.`);
    process.exit(2);
  }
  return entries;
}

const isAllowed = (allow, routePath, f) => allow.some((a) =>
  a.route === routePath && a.text === f.text && (!a.selector || f.selector.includes(a.selector)));

function loadRoutes() {
  const custom = argOf('routes', null);
  if (custom) return custom.split(',').map((p) => ({ path: p.trim(), name: p.trim() }));
  const f = path.join(HERE, 'routes.json');
  if (!fs.existsSync(f)) {
    console.error(`No routes.json at ${f} and no --routes given.`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).routes;
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    console.error('playwright-core is not installed. Run: npm i -D playwright-core');
    process.exit(2);
  }

  const routes = loadRoutes();
  const ALLOW = loadAllowlist();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch (e) {
    console.error('Could not launch Chrome via playwright-core channel "chrome".');
    console.error(String(e).split('\n')[0]);
    console.error('Install Chrome, or set channel to one that exists on this machine.');
    process.exit(2);
  }

  const report = { base: BASE, themes: THEMES, routes: [], totals: { checked: 0, failures: 0, skipped: 0 } };
  let sawFailure = false;

  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // Seed the stored preference BEFORE any app code runs, and pin the
    // attribute too — some public routes never mount the theme toggle, so the
    // attribute is the only way to exercise their light rendering.
    await ctx.addInitScript(([t]) => {
      try { localStorage.setItem('rivvra.theme', t); } catch { /* ignore */ }
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.setAttribute('data-theme', t);
      });
    }, [theme]);

    const page = await ctx.newPage();
    for (const route of routes) {
      const url = BASE + route.path;
      let res;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        // Give reveal/intro animations a beat to settle on their final colours.
        await page.waitForTimeout(route.settle ?? 600);
        await page.evaluate(([t]) => document.documentElement.setAttribute('data-theme', t), [theme]);
        await page.waitForTimeout(150);
        res = await page.evaluate(AUDIT_EXPR);
      } catch (e) {
        console.error(`  ✗ ${theme} ${route.path} — could not audit: ${String(e).split('\n')[0]}`);
        sawFailure = true;
        continue;
      }

      const allowed = res.failures.filter((f) => isAllowed(ALLOW, route.path, f));
      res.failures = res.failures.filter((f) => !isAllowed(ALLOW, route.path, f));
      res.allowed = allowed.length;

      report.totals.checked += res.checked;
      report.totals.failures += res.failures.length;
      report.totals.allowed = (report.totals.allowed || 0) + allowed.length;
      report.totals.skipped += res.skipped.length;
      report.routes.push({ theme, path: route.path, ...res });

      const mark = res.failures.length ? '✗' : '✓';
      console.log(`  ${mark} ${theme.padEnd(5)} ${route.path.padEnd(38)} ${String(res.checked).padStart(4)} checked, ${res.failures.length} failing, ${res.skipped.length} skipped${res.allowed ? `, ${res.allowed} allowed` : ''}`);
      for (const f of res.failures.slice(0, 8)) {
        console.log(`        ${f.ratio}:1 (needs ${f.need}) ${JSON.stringify(f.text)}  ${f.selector}`);
      }
      if (res.failures.length > 8) console.log(`        … and ${res.failures.length - 8} more`);
      if (res.failures.length) sawFailure = true;
    }
    await ctx.close();
  }

  await browser.close();

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`\nJSON report → ${JSON_OUT}`);
  }

  const { checked, failures, skipped } = report.totals;
  console.log(`\n${checked} text nodes checked across ${routes.length} route(s) × ${THEMES.length} theme(s).`);
  console.log(`${failures} below AA, ${skipped} unmeasurable (gradient text and the like — reported, never silently passed), ${report.totals.allowed || 0} allow-listed with a stated reason.`);

  if (sawFailure) {
    console.error('\nContrast gate FAILED.');
    process.exit(1);
  }
  console.log('\nContrast gate passed.');
})();
