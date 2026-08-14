// Tests for nextAction() — the derived "what should HR click next" guidance.
//
// Imports the REAL util (no copied logic). Fixtures follow docs/PAYROLL-RUN-GUIDANCE.md §9.
//
//   node scripts/test-payroll-run-guidance.js

import assert from 'node:assert';
import { nextAction, splitByRelease, finalizeWarning, isPayslipReleasedFor, runSteps, isReleasable } from '../src/utils/payrollRunGuidance.js';

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

check('unreleased rows with NO computed pay → Re-process, never Finalize', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 0), item(3, 0)] };
  const n = nextAction(run);
  assert.strictEqual(n.key, 'process', 'must not fall through to Finalize');
  assert.match(n.headline, /no pay computed/);
});

check('mixed computed/uncomputed unreleased → Release the computed, caution the rest', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 4000), item(3, 0)] };
  const n = nextAction(run);
  assert.strictEqual(n.key, 'release');
  assert.match(n.label, /\(1\)/, 'only the computed row is releasable');
  assert.match(n.caution, /1 more employee has no computed pay/);
});

check('zero-net rows are NOT releasable', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 4000), item(3, 0), item(4, 0, { salaryHold: true })] };
  const { releasable, needsCompute, onHold } = splitByRelease(run);
  assert.strictEqual(releasable.length, 1);
  assert.strictEqual(needsCompute.length, 1);
  assert.strictEqual(onHold.length, 1);
  assert.strictEqual(isReleasable(run, item(3, 0)), false);
  assert.strictEqual(isReleasable(run, item(2, 4000)), true);
});

check('uncomputed rows keep the Release step open (no premature Finalize)', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 0)] };
  assert.strictEqual(runSteps(run).find(s => s.key === 'release').state, 'current');
  assert.match(finalizeWarning(run), /1 employee has no payslip yet/);
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

console.log('\nrunSteps()\n');

const stateOf = (steps, key) => steps.find(s => s.key === key).state;

check('exactly one step is current, always', () => {
  for (const run of [
    { status: 'draft', items: [] },
    july,
    { ...july, releasedEmployeeIds: july.items.map(i => i.employeeId) },
    { ...july, status: 'finalized' },
    { ...july, status: 'paid' },
  ]) {
    const cur = runSteps(run).filter(s => s.state === 'current');
    assert.ok(cur.length <= 1, `expected <=1 current, got ${cur.length}`);
  }
});

check('draft → Process current, everything else upcoming', () => {
  const s = runSteps({ status: 'draft', items: [] });
  assert.strictEqual(stateOf(s, 'process'), 'current');
  assert.strictEqual(stateOf(s, 'release'), 'upcoming');
  assert.strictEqual(stateOf(s, 'markPaid'), 'upcoming');
});

check('THE JULY CASE: 31/68 → Process done, Release current (not done)', () => {
  const s = runSteps(july);
  assert.strictEqual(stateOf(s, 'process'), 'done');
  assert.strictEqual(stateOf(s, 'release'), 'current', 'partial release must NOT read as complete');
  assert.strictEqual(stateOf(s, 'finalize'), 'upcoming');
  assert.strictEqual(s.find(x => x.key === 'release').detail, '31/68 released');
});

check('all released → Release done, Finalize current', () => {
  const s = runSteps({ ...july, releasedEmployeeIds: july.items.map(i => i.employeeId) });
  assert.strictEqual(stateOf(s, 'release'), 'done');
  assert.strictEqual(stateOf(s, 'finalize'), 'current');
});

check('finalized → Mark paid current', () => {
  const s = runSteps({ ...july, status: 'finalized', releasedEmployeeIds: july.items.map(i => i.employeeId) });
  assert.strictEqual(stateOf(s, 'finalize'), 'done');
  assert.strictEqual(stateOf(s, 'markPaid'), 'current');
});

check('paid → every step done, nothing current', () => {
  const s = runSteps({ ...july, status: 'paid', releasedEmployeeIds: july.items.map(i => i.employeeId) });
  assert.ok(s.every(x => x.state === 'done'));
});

check('salary-hold-only remainder still lets Release read done', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 0, { salaryHold: true })] };
  assert.strictEqual(stateOf(runSteps(run), 'release'), 'done');
});

check('strip stays consistent with nextAction on the July run', () => {
  assert.strictEqual(nextAction(july).key, 'release');
  assert.strictEqual(stateOf(runSteps(july), 'release'), 'current');
});


console.log('\nnaming (Q: "who are these employees?")\n');

check('few uncomputed employees are named, not just counted', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), item(2, 4000),
      { employeeId: '3', employeeName: 'Rakesh Padme', netSalary: 0 },
      { employeeId: '4', employeeName: 'RAHUL CHALINDRAWAR', netSalary: 0 }] };
  const n = nextAction(run);
  assert.match(n.caution, /Rakesh Padme and RAHUL CHALINDRAWAR/);
});

check('many uncomputed employees stay a count, no unreadable list', () => {
  const items = [item(1, 5000), item(2, 4000)];
  for (let i = 3; i <= 12; i++) items.push({ employeeId: String(i), employeeName: `Emp ${i}`, netSalary: 0 });
  const n = nextAction({ status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'], items });
  assert.match(n.caution, /10 more employees/);
  assert.ok(!n.caution.includes('Emp 3'), 'should not list 10 names');
});

check('salary-hold employee is named too', () => {
  const run = { status: 'processed', payslipReleased: true, releasedEmployeeIds: ['1'],
    items: [item(1, 5000), { employeeId: '2', employeeName: 'Nutan (Kishu Sharma)', netSalary: 0, salaryHold: true }] };
  assert.match(nextAction(run).caution, /Nutan \(Kishu Sharma\)/);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
