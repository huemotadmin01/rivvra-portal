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

/** Split a run's rows by release state. */
export function splitByRelease(run) {
  const items = run?.items || [];
  const released = items.filter((i) => isPayslipReleasedFor(run, i.employeeId));
  const unreleased = items.filter((i) => !isPayslipReleasedFor(run, i.employeeId));
  // Salary-hold rows can never be released, so they must not count as work
  // outstanding — otherwise the run could never reach "ready to finalize".
  const releasable = unreleased.filter((i) => !i.salaryHold);
  return { items, released, unreleased, releasable };
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
  const { released, unreleased, releasable } = splitByRelease(run);

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
    // Rows with nothing computed are not ready to go out — releasing them would
    // email a zero payslip. Point at a re-process instead.
    const uncomputed = releasable.filter((i) => !(Number(i.netSalary) > 0));
    if (uncomputed.length === releasable.length) {
      return {
        key: 'process',
        label: 'Re-process',
        headline: `re-process — ${releasable.length} employee${releasable.length === 1 ? ' has' : 's have'} no figures yet`,
        why: 'These employees are in the run but nothing has been computed for them, so there is no payslip to release. Re-processing computes them; already-released rows keep the figures they were paid.',
      };
    }
    return {
      key: 'release',
      label: `Release Payslips (${releasable.length})`,
      headline: `release payslips to ${releasable.length} employee${releasable.length === 1 ? '' : 's'}`,
      why: released.length > 0
        ? `${released.length} payslip${released.length === 1 ? ' has' : 's have'} already gone out. These ${releasable.length} have not — releasing emails them and makes them visible in ESS.`
        : 'Releasing emails payslips to employees and makes them visible in ESS.',
      caution: uncomputed.length > 0
        ? `${uncomputed.length} of them still have no computed net pay — re-process first, or deselect them.`
        : undefined,
    };
  }

  const heldBack = unreleased.length - releasable.length;
  return {
    key: 'finalize',
    label: 'Finalize',
    headline: 'finalize this run',
    why: 'Everyone who can be released has been. Finalizing is required before the run can be marked paid.',
    caution: heldBack > 0
      ? `${heldBack} employee${heldBack === 1 ? ' is' : 's are'} on salary hold and will not receive a payslip.`
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
  const { releasable } = splitByRelease(run);
  if (releasable.length === 0) return null;
  return `${releasable.length} employee${releasable.length === 1 ? ' has' : 's have'} no payslip yet. Finalizing blocks re-processing — release them first.`;
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
