// ============================================================================
// incentiveValidate.js — shared validation for incentive records
// ============================================================================
// One source of truth for the rules enforced both by the inline-edit handler
// in RecordDetail and the full-form save in RecordForm. Throws a plain Error
// with a user-friendly message; callers either catch (RecordDetail) or read
// the .message and toast it (RecordForm).
// ============================================================================

// Fields whose value is a non-negative number. Validated client-side so the
// user sees the error before the round-trip.
export const NUMERIC_FIELDS = new Set([
  'untaxedInvoicedValue',
  'consultantSalarySnapshot',
  'recruiterAmountOverride',
  'accountManagerAmountOverride',
]);

// Fields that nullify on empty (vs. clamping to 0). Override fields are the
// canonical "leave blank to use rate engine" knob — clearing them must send
// `null`, not `0`.
export const NULLABLE_NUMERIC_FIELDS = new Set([
  'recruiterAmountOverride',
  'accountManagerAmountOverride',
]);

export const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Validate + normalise a single field for inline edit.
 *
 * @param {string} field      — the record field name (e.g. "consultantEmployeeId")
 * @param {any}    rawVal     — the user-entered value
 * @param {object} record     — the current record (used for cross-field checks)
 * @returns {any}             — the normalised value to send to the server
 * @throws {Error}            — when the value is invalid
 */
export function validateRecordField(field, rawVal, record) {
  let val = rawVal;

  // YYYY-MM month fields
  if (field === 'serviceMonth' || field === 'payoutMonth') {
    if (val && !YM_RE.test(val)) {
      throw new Error('Use YYYY-MM (e.g. 2026-04)');
    }
    // serviceMonth is required server-side; payoutMonth empty re-derives.
    if (field === 'serviceMonth' && !val) {
      throw new Error('Service month is required');
    }
  }

  // Numeric fields
  if (NUMERIC_FIELDS.has(field)) {
    if (val === '' || val == null) {
      val = NULLABLE_NUMERIC_FIELDS.has(field) ? null : 0;
    } else {
      const n = Number(val);
      if (!Number.isFinite(n)) throw new Error('Must be a number');
      if (n < 0) throw new Error('Must be ≥ 0');
      val = n;
    }
  }

  // Required FK selects: client + consultant must stay set.
  if (field === 'clientContactId' && !val) {
    throw new Error('Client is required');
  }
  if (field === 'consultantEmployeeId' && !val) {
    throw new Error('Consultant is required');
  }

  // Recruiter / AM: at least one must remain.
  if (field === 'recruiterEmployeeId' && !val
      && !(record?.accountManagerEmployeeId)) {
    throw new Error('At least one of Recruiter / AM is required');
  }
  if (field === 'accountManagerEmployeeId' && !val
      && !(record?.recruiterEmployeeId)) {
    throw new Error('At least one of Recruiter / AM is required');
  }

  return val;
}

/**
 * Validate a full record-form submission.
 *
 * @param {object} form — the local form state from RecordForm
 * @throws {Error}      — first-found validation error, with a UX-ready message
 */
export function validateRecordForm(form) {
  if (!form.clientContactId && !form.clientName) {
    throw new Error('Client is required');
  }
  if (!form.consultantEmployeeId) {
    throw new Error('Consultant is required');
  }
  if (!form.serviceMonth) {
    throw new Error('Service month is required');
  }
  if (!YM_RE.test(form.serviceMonth)) {
    throw new Error('Service month must be YYYY-MM');
  }
  if (form.payoutMonth && !YM_RE.test(form.payoutMonth)) {
    throw new Error('Payout month must be YYYY-MM');
  }
  if (!form.untaxedInvoicedValue) {
    throw new Error('Untaxed invoice value is required');
  }
  if (!form.recruiterEmployeeId && !form.accountManagerEmployeeId) {
    throw new Error('At least one of Recruiter / AM is required');
  }
}
