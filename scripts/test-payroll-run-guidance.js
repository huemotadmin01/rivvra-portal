// Tests for nextAction() — the derived "what should HR click next" guidance.
//
// Imports the REAL util (no copied logic). Fixtures follow docs/PAYROLL-RUN-GUIDANCE.md §9.
//
//   node scripts/test-payroll-run-guidance.js

import assert from 'node:assert';
import { nextAction, splitByRelease, finalizeWarning, isPayslipReleasedFor } from '../src/utils/payrollRunGuidance.js';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
};

const item = (id, net = 1000, extra = {}) => ({ employeeId: String(id), employeeName: `Emp ${id}`, netSalary: net, ...extra });
// The live July 2026 shape: 68 rows, ids 1..31 released, 32..68 unreleased externals.
const july = {
  status: 'processed',
  payslipReleased: true,
  releasedEmployeeIds: Array.from({ length: 31 }, (_, i) => String(i + 1)),
  items: Array.from({ length: 68 }, (_, i) => item(i + 1, 1000 + i)),
};

console.log('nextAction()\n');

check('fresh draft → Process', () => {
  const n = nextAction({ status: 'draft', items: [] });
  assert.strictEqual(n.key, 'process');
  assert.strictEqual(n.label, 'Process');
});

check('processed, nothing released → Release all', () => {
  const n = nextAction({ status: 'processed', items: [item(1), item(2)] });
  assert.strictEqual(n.key, 'release');
  assert.match(n.label, /Release Payslips \(2\)/);
});

check('THE JULY CASE: 31/68 released → Release the 37, never Finalize', () => {
  const n = nextAction(july);
  assert.strictEqual(n.key, 'release', 'must not push HR toward Finalize');
  assert.match(n.label, /\(37\)/);
  assert.match(n.why, /31 payslips have already gone out/);
});

check('all released, processed → Finalize', () => {
  const all = { ...july, releasedEmployeeIds: july.items.map(i => i.employeeId) };
  const n = nextAction(all);
  assert.strictEqual(n.key, 'finalize');
});

check('finalized → Mark Paid', () => {
  assert.strictEqual(nextAction({ ...july, status: 'finalized' }).key, 'markPaid');
});

check('paid → done, no button', () => {
  const n = nextAction({ ...july, status: 'paid' });
  assert.strictEqual(n.key, 'done');
  assert.strictEqual(n.label, null);
});

check('unreleased rows with NO computed pay → Re-process, not Release', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 0), item(3, 0)] };
  const n = nextAction(run);
  assert.strictEqual(n.key, 'process');
  assert.match(n.headline, /no figures yet/);
});

check('mixed computed/uncomputed unreleased → Release, with a caution', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 4000), item(3, 0)] };
  const n = nextAction(run);
  assert.strictEqual(n.key, 'release');
  assert.match(n.caution, /1 of them still have no computed net pay/);
});

check('salary-hold rows do not block reaching Finalize', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 4000, { salaryHold: true })] };
  const n = nextAction(run);
  assert.strictEqual(n.key, 'finalize');
  assert.match(n.caution, /1 employee is on salary hold/);
});

check('legacy release-all (flag set, empty id list) → everyone counts released', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: [], items: [item(1), item(2)] };
  const { released, unreleased } = splitByRelease(run);
  assert.strictEqual(released.length, 2);
  assert.strictEqual(unreleased.length, 0);
  assert.strictEqual(nextAction(run).key, 'finalize');
});

check('unreleased run → isPayslipReleasedFor is false for everyone', () => {
  assert.strictEqual(isPayslipReleasedFor({ payslipReleased: false }, '1'), false);
});

console.log('\nfinalizeWarning()\n');

check('July run → warns that Finalize blocks re-processing', () => {
  const w = finalizeWarning(july);
  assert.match(w, /37 employees have no payslip yet/);
  assert.match(w, /blocks re-processing/);
});

check('fully released run → no warning', () => {
  assert.strictEqual(finalizeWarning({ ...july, releasedEmployeeIds: july.items.map(i => i.employeeId) }), null);
});

check('already finalized → no warning', () => {
  assert.strictEqual(finalizeWarning({ ...july, status: 'finalized' }), null);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
