import { API_BASE_URL } from './config';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.response = { status, data };
  }
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

  const companyId = localStorage.getItem('rivvra_current_company');
  if (companyId) headers['X-Company-Id'] = companyId;

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    signal,
  });

  if (responseType === 'blob') {
    if (!res.ok) throw new ApiError(res.statusText, res.status, {});
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || res.statusText, res.status, data);
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
export function releasePayslips(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/release-payslips`);
}
export function holdPayslips(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/runs/${id}/hold-payslips`);
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

// Export Reports
export function downloadPayrollExport(orgSlug, runId, type) {
  return request('GET', `${orgUrl(orgSlug)}/runs/${runId}/export`, { params: { type }, responseType: 'blob' });
}

// Intern Payroll Runs
export function getInternPayrollRuns(orgSlug) {
  return request('GET', `${orgUrl(orgSlug)}/intern-runs`);
}
export function getInternPayrollRun(orgSlug, id) {
  return request('GET', `${orgUrl(orgSlug)}/intern-runs/${id}`);
}
export function createInternPayrollRun(orgSlug, data) {
  return request('POST', `${orgUrl(orgSlug)}/intern-runs`, { body: data });
}
export function processInternPayrollRun(orgSlug, id) {
  return request('POST', `${orgUrl(orgSlug)}/intern-runs/${id}/process`);
}
export function finalizeInternPayrollRun(orgSlug, id) {
  return request('PUT', `${orgUrl(orgSlug)}/intern-runs/${id}/finalize`);
}
export function markInternPayrollRunPaid(orgSlug, id) {
  return request('PUT', `${orgUrl(orgSlug)}/intern-runs/${id}/mark-paid`);
}
export function deleteInternPayrollRun(orgSlug, id) {
  return request('DELETE', `${orgUrl(orgSlug)}/intern-runs/${id}`);
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
