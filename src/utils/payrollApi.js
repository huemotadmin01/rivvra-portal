import { API_BASE_URL } from './config';
import { getActiveCompanyId } from './api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.response = { status, data };
  }
}

// Request timeout (ms). api.js and timesheetApi both bound their requests; this
// client had none, so a stalled payroll call (Render cold start, hung Atlas
// query) left ESS pages spinning forever with no way out.
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Broadcast an expired/invalid session so a top-level listener can force a
 * clean re-login. Mirrors api.js — without it an expired token surfaced as a
 * swallowed error and pages rendered a false "no data" empty state.
 * Guarded on `token` so genuine not-logged-in 401s don't loop.
 */
function notifyAuthExpired(endpoint, token) {
  if (!token) return;
  try {
    window.dispatchEvent(new CustomEvent('rivvra:auth-expired', { detail: { endpoint } }));
  } catch { /* non-browser env */ }
}

async function request(method, url, { body, params, signal, responseType } = {}) {
  let fullUrl = `${API_BASE_URL}${url}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.append(k, v);
    }
    const qsStr = qs.toString();
    if (qsStr) fullUrl += `?${qsStr}`;
  }

  const headers = {};
  const token = localStorage.getItem('rivvra_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const companyId = getActiveCompanyId();
  if (companyId) headers['X-Company-Id'] = companyId;

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Timeout controller, combined with any caller-supplied abort signal.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  let combinedSignal = timeoutController.signal;
  if (signal) {
    const combined = new AbortController();
    const onAbort = () => combined.abort();
    if (signal.aborted) combined.abort();
    signal.addEventListener('abort', onAbort);
    timeoutController.signal.addEventListener('abort', onAbort);
    combinedSignal = combined.signal;
  }

  let res;
  try {
    res = await fetch(fullUrl, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      signal: combinedSignal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) notifyAuthExpired(url, token);

  if (responseType === 'blob') {
    if (!res.ok) {
      // A failed download still returns a JSON error body. Reading it as text
      // first lets actionable backend messages ("PT not configured for state")
      // reach the UI instead of a bare "Internal Server Error".
      let data = {};
      try { data = JSON.parse(await res.text()); } catch { /* not JSON */ }
      throw new ApiError(data.message || data.error || res.statusText, res.status, data);
    }
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || data.error || res.statusText, res.status, data);
  return data;
}

function orgUrl(orgSlug) {
  return `/api/org/${orgSlug}/payroll`;
}

// Salary Structures
export function getSalaryStructures(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/salary-structures`);
}
export function createSalaryStructure(orgSlug, data) {
  return request('POST', `${orgUrl(orgSlug)}/salary-structures`, { body: data });
}
export function updateSalaryStructure(orgSlug, id, data) {
  return request('PUT', `${orgUrl(orgSlug)}/salary-structures/${id}`, { body: data });
}
export function deleteSalaryStructure(orgSlug, id) {
  return request('DELETE', `${orgUrl(orgSlug)}/salary-structures/${id}`);
}
export function setDefaultStructure(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/salary-structures/${id}/set-default`);
}

// Employee Salary
export function getEmployeeSalaries(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/employee-salaries`);
}
export function createEmployeeSalary(orgSlug, data) {
  return request('POST', `${orgUrl(orgSlug)}/employee-salaries`, { body: data });
}
export function reviseEmployeeSalary(orgSlug, id, data) {
  return request('PUT', `${orgUrl(orgSlug)}/employee-salaries/${id}/revise`, { body: data });
}
export function getEmployeeSalaryHistory(orgSlug, employeeId) {
  return request('GET', `${orgUrl(orgSlug)}/employee-salaries/${employeeId}/history`);
}

// Statutory Config
export function getStatutoryConfigs(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/statutory`);
}
export function updateStatutoryConfig(orgSlug, employeeId, data) {
  return request('PUT', `${orgUrl(orgSlug)}/statutory/${employeeId}`, { body: data });
}
export function getPTStates(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/pt-states`);
}

// Tax Declarations
export function getTaxDeclarations(orgSlug, financialYear) {
  return request('GET', `${orgUrl(orgSlug)}/tax-declarations`, { params: { financialYear } });
}
export function upsertTaxDeclaration(orgSlug, employeeId, fy, data) {
  return request('PUT', `${orgUrl(orgSlug)}/tax-declarations/${employeeId}/${fy}`, { body: data });
}
/**
 * Admin approve/reject of an employee's declaration for a financial year.
 * `status` must be exactly 'approved' or 'rejected' — the backend 400s on
 * anything else. Approving also flips that employee's uploaded proofs to
 * `verified`. Company scoping rides on the X-Company-Id header `request()`
 * already sends; without it the backend 404s the employee.
 */
export function approveTaxDeclaration(orgSlug, employeeId, fy, status, remarks) {
  return request('PUT', `${orgUrl(orgSlug)}/tax-declarations/${employeeId}/${fy}/approve`, {
    body: { status, remarks: remarks || '' },
  });
}

// Payroll Runs
export function getPayrollRuns(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/runs`);
}
export function getPayrollRun(orgSlug, id) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${id}`);
}
export function createPayrollRun(orgSlug, data) {
  return request('POST', `${orgUrl(orgSlug)}/runs`, { body: data });
}
export function processPayrollRun(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/process`);
}
export function overridePayrollItem(orgSlug, runId, employeeId, data) {
  return request('PUT', `${orgUrl(orgSlug)}/runs/${runId}/items/${employeeId}`, { body: data });
}
export function finalizePayrollRun(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/finalize`);
}
export function unfinalizePayrollRun(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/unfinalize`);
}
export function markPayrollRunPaid(orgSlug, id, data) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/mark-paid`, { body: data });
}
export function deletePayrollRun(orgSlug, id) {
  return request('DELETE', `${orgUrl(orgSlug)}/runs/${id}`);
}

// Challan downloads
export function downloadPFChallan(orgSlug, id) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${id}/challan/pf`, { responseType: 'blob' });
}
export function downloadESIChallan(orgSlug, id) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${id}/challan/esi`, { responseType: 'blob' });
}
export function downloadPTChallan(orgSlug, id, state) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${id}/challan/pt`, { params: { state }, responseType: 'blob' });
}

// Payroll Locking
export function lockInputs(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/lock-inputs`);
}
export function unlockInputs(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/unlock-inputs`);
}
export function lockPayroll(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/lock-payroll`);
}
export function unlockPayroll(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/unlock-payroll`);
}

// Employee View Release
export function releasePayslips(orgSlug, id, employeeIds) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/release-payslips`, { body: employeeIds ? { employeeIds } : {} });
}
export function holdPayslips(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/hold-payslips`);
}

// Salary Hold
export function createSalaryHold(orgSlug, runId, employeeId, reason) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${runId}/salary-hold`, { body: { employeeId, reason } });
}
export function releaseSalaryHold(orgSlug, runId, holdId, note) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${runId}/salary-hold/${holdId}/release`, { body: { note } });
}

// Ad-hoc Earnings/Deductions
export function setAdHocAdjustment(orgSlug, runId, employeeId, data) {
  return request('PUT', `${orgUrl(orgSlug)}/runs/${runId}/adhoc/${employeeId}`, { body: data });
}

// Payslip PDF Downloads
export function downloadPayslipPdf(orgSlug, runId, employeeId) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/payslip/${employeeId}`, { responseType: 'blob' });
}
export function downloadAllPayslips(orgSlug, runId) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/payslips`, { responseType: 'blob' });
}
export function downloadMyPayslipPdf(orgSlug, runId) {
  return request('GET', `${orgUrl(orgSlug)}/my-payslip/${runId}`, { responseType: 'blob' });
}
export function downloadMyPayslipByMonth(orgSlug, year, month) {
  return request('GET', `${orgUrl(orgSlug)}/my-payslip/by-month/${year}/${month}`, { responseType: 'blob' });
}
export function downloadImportedPayslipPdf(orgSlug, year, month) {
  return request('GET', `${orgUrl(orgSlug)}/my-payslip/imported/${year}/${month}`, { responseType: 'blob' });
}
export function bulkDownloadMyPayslips(orgSlug, selections) {
  return request('POST', `${orgUrl(orgSlug)}/my-payslips/bulk-download`, { body: { selections }, responseType: 'blob' });
}

// Bank Transfer CSV
export function downloadBankTransfer(orgSlug, runId) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/bank-transfer`, { responseType: 'blob' });
}

// Bank Sheet (HDFC / Non-HDFC) Excel
export function downloadBankSheetHdfc(orgSlug, runId) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/bank-sheet/hdfc`, { responseType: 'blob' });
}
export function downloadBankSheetNonHdfc(orgSlug, runId) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/bank-sheet/non-hdfc`, { responseType: 'blob' });
}

// Export Reports
export function downloadPayrollExport(orgSlug, runId, type) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/export`, { params: { type }, responseType: 'blob' });
}
export function downloadPayrollSheet(orgSlug, runId) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/export/payroll-sheet`, { responseType: 'blob' });
}

// Intern payroll runs — read-only.
//
// Interns are paid by the MAIN statutory run, which includes them explicitly.
// The separate intern run selected the same interns from the same salary
// records, so processing both paid each stipend twice; its write path was
// removed from the API on 2026-07-30. These two readers remain only so a run
// created before that date can still be inspected. Do not add create/process/
// finalize/mark-paid/delete back — pay interns through the main run.
export function getInternPayrollRuns(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/intern-runs`);
}
export function getInternPayrollRun(orgSlug, id) {
  return request('GET', `${orgUrl(orgSlug)}/intern-runs/${id}`);
}

// Unconfigured employees
export function getUnconfiguredEmployees(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/unconfigured-employees`);
}

// Payroll Settings
export function getPayrollSettings(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/settings`);
}
export function updatePayrollSettings(orgSlug, data) {
  return request('PUT', `${orgUrl(orgSlug)}/settings`, { body: data });
}

// FY Statutory Config (Super Admin)
export function getFYConfigs() {
  return request('GET', '/api/superadmin/fy-config');
}
export function getFYConfig(fy) {
  return request('GET', `/api/superadmin/fy-config/${fy}`);
}
export function updateFYConfig(fy, data) {
  return request('PUT', `/api/superadmin/fy-config/${fy}`, { body: data });
}
export function copyFYConfig(targetFy, sourceFy) {
  return request('POST', `/api/superadmin/fy-config/${targetFy}/copy-from/${sourceFy}`);
}
export function seedFYConfig() {
  return request('POST', '/api/superadmin/fy-config/seed');
}

// PT Master
export function getPTMaster(orgSlug, financialYear) {
  return request('GET', `${orgUrl(orgSlug)}/pt-master`, { params: { financialYear } });
}
export function seedPTMaster(orgSlug, financialYear) {
  return request('POST', `${orgUrl(orgSlug)}/pt-master/seed`, { body: { financialYear } });
}
export function updatePTMasterConfig(orgSlug, id, data) {
  return request('PUT', `${orgUrl(orgSlug)}/pt-master/${id}`, { body: data });
}

// Employee Self-Service
export function getMySalary(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/my-salary`);
}
export function getMySalaryHistory(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/my-salary-history`);
}
export function getMyPayslips(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/my-payslips`);
}
export function getMyTax(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/my-tax`);
}
export function updateMyTaxRegime(orgSlug, regime) {
  return request('PUT', `${orgUrl(orgSlug)}/my-tax/regime`, { body: { regime } });
}
export function updateMyTaxDeclarations(orgSlug, data) {
  return request('PUT', `${orgUrl(orgSlug)}/my-tax/declarations`, { body: data });
}
// Admin: view any employee's tax report
export function getEmployeeTaxReport(orgSlug, employeeId, fy) {
  return request('GET', `${orgUrl(orgSlug)}/tax-report/${employeeId}/${fy}`);
}

export function getMyTaxReport(orgSlug, fy) {
  return request('GET', `${orgUrl(orgSlug)}/my-tax/report/${fy}`);
}
export function getMyTaxAvailableFYs(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/my-tax/available-fys`);
}
export function getMyTaxProofs(orgSlug, financialYear) {
  return request('GET', `${orgUrl(orgSlug)}/my-tax/proofs`, { params: { financialYear } });
}
export function downloadTaxProof(orgSlug, proofId) {
  return request('GET', `${orgUrl(orgSlug)}/my-tax/proofs/${proofId}/download`, { responseType: 'blob' });
}
export function getTaxProofUrl(orgSlug, proofId) {
  return `${API_BASE_URL}${orgUrl(orgSlug)}/my-tax/proofs/${proofId}/download`;
}
export function deleteTaxProof(orgSlug, proofId) {
  return request('DELETE', `${orgUrl(orgSlug)}/my-tax/proofs/${proofId}`);
}
export function uploadTaxProof(orgSlug, formData) {
  return request('POST', `${orgUrl(orgSlug)}/my-tax/declarations/proof`, { body: formData });
}

// ══════════════════════════════════════════════════════════════════════════
// Platform Settings (Super Admin)
// ══════════════════════════════════════════════════════════════════════════

export function getPlatformSettings() {
  return request('GET', '/api/superadmin/platform-settings');
}
export function getPlatformSetting(category) {
  return request('GET', `/api/superadmin/platform-settings/${category}`);
}
export function updatePlatformSetting(category, data) {
  return request('PUT', `/api/superadmin/platform-settings/${category}`, { body: data });
}

// Platform PT Master (Super Admin)
export function getPlatformPTMaster(fy) {
  return request('GET', '/api/superadmin/pt-master', { params: { fy } });
}
export function getPlatformPTState(fy, stateCode) {
  return request('GET', `/api/superadmin/pt-master/${fy}/${stateCode}`);
}
export function updatePlatformPTState(fy, stateCode, data) {
  return request('PUT', `/api/superadmin/pt-master/${fy}/${stateCode}`, { body: data });
}
export function seedPlatformPTMaster(financialYear) {
  return request('POST', '/api/superadmin/pt-master/seed', { body: { financialYear } });
}
export function copyPlatformPTMaster(targetFy, sourceFy) {
  return request('POST', `/api/superadmin/pt-master/${targetFy}/copy-from/${sourceFy}`);
}

// Settings Audit Log (Super Admin)
export function getSettingsAuditLog(params) {
  return request('GET', '/api/superadmin/settings-audit-log', { params });
}

// Migration (Super Admin)
export function runPlatformMigration() {
  return request('POST', '/api/superadmin/platform-settings/migrate');
}
export function verifyPlatformMigration() {
  return request('POST', '/api/superadmin/platform-settings/verify-migration');
}

// Public platform settings read (any authenticated user)
export function getPublicPlatformSetting(category) {
  return request('GET', `/api/platform/settings/${category}`);
}

// Org-Level FY Config Overrides
export function getOrgFYOverrides(orgSlug, fy) {
  return request('GET', `${orgUrl(orgSlug)}/settings/fy-overrides/${fy}`);
}
export function updateOrgFYOverrides(orgSlug, fy, data) {
  return request('PUT', `${orgUrl(orgSlug)}/settings/fy-overrides/${fy}`, { body: data });
}

// Org-Level TDS Config
export function getOrgTdsConfig(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/settings/tds-config`);
}
export function updateOrgTdsConfig(orgSlug, data) {
  return request('PUT', `${orgUrl(orgSlug)}/settings/tds-config`, { body: data });
}

/* ───────────────────────────────────────────────────────────────────────────
 * Tax-declaration shape helpers (shared by the admin TaxDeclarationsPage and
 * the ESS MyTaxDeclarationsPage).
 *
 * BACKGROUND — the two pages used to persist incompatible shapes for the same
 * document, and each silently destroyed the other's data:
 *   • Admin  saved `declarations.section80C` as an itemized OBJECT and keyed
 *     80D `selfFamily / parents / parentsSenior`.
 *   • ESS    saved `declarations.section80C` as a SCALAR and keyed 80D
 *     `self / parents`.
 * The backend stores whatever it is given, so after an admin save the ESS page
 * put an object into a number input (₹NaN) and after an ESS save the admin
 * modal read all zeros — and saving then wiped the employee's 80C to zero,
 * after which TDS was recalculated without the deduction.
 *
 * CANONICAL SHAPE (what both pages now read and write):
 *   declarations.section80CItems  → itemized object, SECTION_80C_KEYS below.
 *                                   The single source of truth for the split.
 *   declarations.section80CTotal  → capped numeric total (the backend
 *                                   recomputes this on every write; it is what
 *                                   payroll.js actually uses via totalDeclared).
 *   declarations.section80D       → { selfFamily, parents, parentsSenior }
 *
 *   declarations.section80C       → LEGACY / route-input field only. NEVER read
 *                                   it directly — read via read80CTotal().
 *                                   The two backend write routes demand
 *                                   different types and we cannot edit them:
 *                                     payroll.js ~1373 (admin PUT) does
 *                                       Object.values(section80C)  → needs an object
 *                                     payroll.js ~4037 (ESS PUT) does
 *                                       Number(section80C)         → needs a scalar
 *                                   So each page keeps sending the type its own
 *                                   route requires purely so the backend's
 *                                   section80CTotal / totalDeclared math is
 *                                   correct, and both mirror the real breakdown
 *                                   into section80CItems.
 *
 * All readers below are defensive and render correctly for documents already
 * stored in EITHER historical shape.
 * ─────────────────────────────────────────────────────────────────────────── */

export const SECTION_80C_KEYS = [
  ['epf', 'Employee PF'],
  ['ppf', 'PPF'],
  ['elss', 'ELSS / Tax Saving MF'],
  ['lifeInsurance', 'Life Insurance'],
  ['housingLoan', 'Housing Loan Principal'],
  ['tuitionFees', 'Tuition Fees'],
  ['nsc', 'NSC'],
  ['others', 'Others'],
];

export const SECTION_80D_KEYS = [
  ['selfFamily', 'Self & Family'],
  ['parents', 'Parents'],
  ['parentsSenior', 'Parents (Senior Citizen)'],
];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Sum an itemized-object shape, ignoring non-numeric members. */
function sumValues(obj) {
  if (!isPlainObject(obj)) return 0;
  return Object.values(obj).reduce((s, v) => s + num(v), 0);
}

/**
 * Read the 80C breakdown out of a stored `declarations` document in any shape.
 * Returns an object with every SECTION_80C_KEYS key present as a number.
 * A scalar-only legacy document lands its whole amount in `others` so that
 * opening + saving the admin modal can never zero it out.
 */
export function normalize80CItems(declarations) {
  const d = declarations || {};
  const out = Object.fromEntries(SECTION_80C_KEYS.map(([k]) => [k, 0]));

  const source = isPlainObject(d.section80CItems)
    ? d.section80CItems
    : (isPlainObject(d.section80C) ? d.section80C : null);

  if (source) {
    let unmapped = 0;
    for (const [k, v] of Object.entries(source)) {
      if (k in out) out[k] = num(v);
      else unmapped += num(v);
    }
    out.others += unmapped;
    return out;
  }

  // Legacy scalar shape (or nothing at all).
  out.others = num(d.section80C) || num(d.section80CTotal);
  return out;
}

/**
 * Total declared under 80C, capped. Prefers the itemized breakdown, falls back
 * to the backend-computed `section80CTotal`, then to a legacy scalar.
 */
export function read80CTotal(declarations, limit = 150000) {
  const d = declarations || {};
  let total;
  if (isPlainObject(d.section80CItems)) total = sumValues(d.section80CItems);
  else if (isPlainObject(d.section80C)) total = sumValues(d.section80C);
  else if (d.section80CTotal !== undefined) total = num(d.section80CTotal);
  else total = num(d.section80C);
  return Math.min(total, limit);
}

/**
 * Read 80D into the canonical three-key shape. Maps the legacy ESS key `self`
 * onto `selfFamily` and folds any unknown key into `parents` so no rupee is
 * dropped on a round-trip.
 */
export function normalize80D(declarations) {
  const src = (declarations || {}).section80D;
  const out = { selfFamily: 0, parents: 0, parentsSenior: 0 };
  if (!isPlainObject(src)) return out;
  for (const [k, v] of Object.entries(src)) {
    if (k in out) out[k] += num(v);
    else if (k === 'self') out.selfFamily += num(v);
    else out.parents += num(v);
  }
  return out;
}

export function read80DTotal(declarations) {
  const n = normalize80D(declarations);
  return n.selfFamily + n.parents + n.parentsSenior;
}
