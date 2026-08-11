#!/usr/bin/env node
/**
 * Build gate: fail if the staging build can reach the production API.
 * The prod host exists in source only as `||` fallbacks behind VITE_API_URL —
 * if it survives into dist/, the env var wasn't set at build time and the
 * staging frontend would silently talk to production. Hard failure, not a
 * warning.
 */
const fs = require('node:fs');
const path = require('node:path');

const PROD_HOST = 'brynsa-leads-api.onrender.com';
const DIST = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(DIST)) { console.error(`No dist/ at ${DIST}`); process.exit(1); }

const hits = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|html|css|json|map)$/.test(entry.name) && fs.readFileSync(p, 'utf8').includes(PROD_HOST)) {
      hits.push(path.relative(DIST, p));
    }
  }
})(DIST);

if (hits.length) {
  console.error(`❌ Production API host "${PROD_HOST}" found in the staging build:`);
  for (const f of hits) console.error(`   dist/${f}`);
  console.error('VITE_API_URL was not set (or not applied) at build time. Refusing to ship.');
  process.exit(1);
}
console.log(`✅ Staging build is clean — no reference to ${PROD_HOST} in dist/.`);
