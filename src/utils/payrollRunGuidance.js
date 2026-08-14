// Guidance for the Payroll Run page — what should HR click next?
//
// The run header offers six controls of equal weight, in an order unrelated to
// when they should be used. This derives the single next action from run state
// so the page can say it in words and give exactly one button primary styling.
//
// Pure and derived — no new persisted fields, no API calls. See
// docs/PAYROLL-RUN-GUIDANCE.md for the full plan and the open decisions.

/**
 * Is THIS employee's payslip released on THIS run?
 *
 * Mirrors isPayslipReleasedFor() in the API. Release is tracked PER EMPLOYEE via
 * releasedEmployeeIds, because a run is deliberately released to one cohort
 * while another is still pending — employees on the 30th, external consultants
 * on the 15th of the following month. Reading the run-level `payslipReleased`
 * flag alone has caused four separate bugs; don't.
 *
 * An absent/empty array on a released run means a legacy release-all.
 */
export function isPayslipReleasedFor(run, employeeId) {
  if (!run?.payslipReleased) return false;
  const ids = run.releasedEmployeeIds;
  if (!Array.isArray(ids) || ids.length === 0) return true;
  return ids.some((id) => String(id) === String(employeeId));
}

/**
 * Can this row be released right now?
 *
 * Two things disqualify a row, and both must email nobody:
 *  - salary hold: deliberately withheld.
 *  - nothing computed (net <= 0): releasing would email an EMPTY payslip. Seen
 *    on the July run — two external consultants sat at 0/23 days with
 *    attendance not_submitted and would have been included in a Select All.
 */
export function isReleasable(run, item) {
  if (isPayslipReleasedFor(run, item.employeeId)) return false;
  if (item.salaryHold) return false;
  return Number(item.netSalary) > 0;
}

/** Split a run's rows by release state. */
export function splitByRelease(run) {
  const items = run?.items || [];
  const released = items.filter((i) => isPayslipReleasedFor(run, i.employeeId));
  const unreleased = items.filter((i) => !isPayslipReleasedFor(run, i.employeeId));
  // Held rows can never be released, so they must not count as work
  // outstanding — otherwise the run could never reach "ready to finalize".
  const onHold = unreleased.filter((i) => i.salaryHold);
  // Uncomputed rows are NOT the same as held: they are outstanding work. They
  // block "ready to finalize" and point at a re-process, never at Finalize.
  const needsCompute = unreleased.filter((i) => !i.salaryHold && !(Number(i.netSalary) > 0));
  const releasable = unreleased.filter((i) => isReleasable(run, i));
  return { items, released, unreleased, releasable, onHold, needsCompute };
}

/**
 * The single next action for a run.
 *
 * @returns {null | {
 *   key: 'process'|'release'|'finalize'|'markPaid'|'done'|'wait',
 *   label: string,      // button text
 *   headline: string,   // "Next: <headline>"
 *   why: string,        // one sentence of reasoning
 *   caution?: string,   // a thing to check before acting
 * }}
 */
export function nextAction(run) {
  if (!run) return null;
  const { released, releasable, onHold, needsCompute } = splitByRelease(run);

  if (run.status === 'paid') {
    return {
      key: 'done',
      label: null,
      headline: 'Payroll complete',
      why: 'This run is processed, released, finalized and marked paid. Nothing further is needed.',
    };
  }

  if (run.status === 'processing') {
    return { key: 'wait', label: null, headline: 'Processing…', why: 'Figures are being recomputed.' };
  }

  if (run.status === 'draft') {
    return {
      key: 'process',
      label: 'Process',
      headline: 'process this run',
      why: 'Nothing has been computed yet. Processing calculates gross, deductions and net for everyone in the run.',
    };
  }

  if (run.status === 'finalized') {
    return {
      key: 'markPaid',
      label: 'Mark Paid',
      headline: 'mark this run as paid',
      why: 'The run is finalized. Record the payment once the money has actually left the bank.',
    };
  }

  // status === 'processed'
  if (releasable.length > 0) {
    return {
      key: 'release',
      label: `Release Payslips (${releasable.length})`,
      headline: `release payslips to ${releasable.length} employee${releasable.length === 1 ? '' : 's'}`,
      why: released.length > 0
        ? `${released.length} payslip${released.length === 1 ? ' has' : 's have'} already gone out. These ${releasable.length} have not — releasing emails them and makes them visible in ESS.`
        : 'Releasing emails payslips to employees and makes them visible in ESS.',
      caution: needsCompute.length > 0
        ? `${needsCompute.length} more employee${needsCompute.length === 1 ? ' has' : 's have'} no computed pay and ${needsCompute.length === 1 ? 'is' : 'are'} excluded — check their attendance, then re-process.`
        : undefined,
    };
  }

  // Nobody releasable, but rows still have nothing computed. This must NOT fall
  // through to Finalize: finalizing would block the re-process they need.
  if (needsCompute.length > 0) {
    return {
      key: 'process',
      label: 'Re-process',
      headline: `re-process — ${needsCompute.length} employee${needsCompute.length === 1 ? ' has' : 's have'} no pay computed`,
      why: 'These employees are in the run but nothing has been computed for them, so there is no payslip to release. Check their attendance is submitted, then re-process — already-released rows keep the figures they were paid.',
    };
  }

  return {
    key: 'finalize',
    label: 'Finalize',
    headline: 'finalize this run',
    why: 'Everyone who can be released has been. Finalizing is required before the run can be marked paid.',
    caution: onHold.length > 0
      ? `${onHold.length} employee${onHold.length === 1 ? ' is' : 's are'} on salary hold and will not receive a payslip.`
      : undefined,
  };
}

/**
 * Should Finalize be visually held back?
 *
 * Process accepts only draft/processed/processing, so finalizing a run makes it
 * un-processable. In a two-cohort month that blocks the work still to come, and
 * Finalize is the most prominent button on the page. Phase 3 decides whether
 * this becomes a hard block (see docs/PAYROLL-RUN-GUIDANCE.md §7).
 */
export function finalizeWarning(run) {
  if (!run || run.status !== 'processed') return null;
  const { releasable, needsCompute } = splitByRelease(run);
  const outstanding = releasable.length + needsCompute.length;
  if (outstanding === 0) return null;
  return `${outstanding} employee${outstanding === 1 ? ' has' : 's have'} no payslip yet. Finalizing blocks re-processing — deal with them first.`;
}

/**
 * The month's sequence, with where this run has got to.
 *
 * Four steps, not the seven the plan sketched. Enumerating cohorts
 * (Release A → Pay A → Re-process → Release B) would hard-code Huemot's
 * two-date shape onto every tenant and needs a per-org setting to be correct
 * — see docs/PAYROLL-RUN-GUIDANCE.md §7.4, still open. Instead the Release
 * step carries its own progress (`31/68 released`) and stays `current` until
 * nobody is left, which describes a one-cohort and a two-cohort month equally
 * well without configuration.
 *
 * `current` is always the first step that isn't done, so exactly one is ever
 * current. The strip says where the run IS; the banner (nextAction) says what
 * to DO — during a re-process those differ, which is intended.
 *
 * @returns {{key: string, label: string, state: 'done'|'current'|'upcoming', detail?: string}[]}
 */
export function runSteps(run) {
  const items = run?.items || [];
  const { released, releasable, needsCompute } = splitByRelease(run);
  const status = run?.status;
  const processed = ['processed', 'finalized', 'paid'].includes(status);

  const steps = [
    {
      key: 'process',
      label: 'Process',
      done: processed,
      detail: processed ? `${items.length} row${items.length === 1 ? '' : 's'}` : undefined,
    },
    {
      key: 'release',
      label: 'Release payslips',
      // Done only when nobody is left to release AND nobody is still waiting to
      // be computed. A partially released run is deliberately still in progress
      // — treating 31/68 as complete is what would walk HR into finalizing early.
      done: processed && releasable.length === 0 && needsCompute.length === 0,
      detail: items.length ? `${released.length}/${items.length} released` : undefined,
    },
    {
      key: 'finalize',
      label: 'Finalize',
      done: ['finalized', 'paid'].includes(status),
    },
    {
      key: 'markPaid',
      label: 'Mark paid',
      done: status === 'paid',
    },
  ];

  const firstOpen = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({
    key: s.key,
    label: s.label,
    detail: s.detail,
    state: s.done ? 'done' : (i === firstOpen ? 'current' : 'upcoming'),
  }));
}

/** Plain-language statement of what each lock actually prevents. */
export const LOCK_EFFECTS = {
  // Enforced in exactly one place in the API — the ad-hoc adjustments endpoint.
  // It does NOT freeze attendance or timesheets, despite the name.
  inputs: {
    lock: 'Blocks ad-hoc earnings and deductions on this run. Does not freeze attendance or timesheets.',
    unlock: 'Allow ad-hoc earnings and deductions on this run again.',
  },
  payroll: {
    lock: 'Blocks re-processing this run. Figures stay exactly as they are.',
    unlock: 'Allow this run to be re-processed.',
  },
};
