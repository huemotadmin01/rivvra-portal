import { TIMESHEET_API_URL } from './config';
import { getActiveCompanyId, getActiveOrgSlug } from './api';

// ─── Fetch-based API client (replaces axios) ────────────────────────────────

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    // Match axios error shape so existing catch blocks work unchanged:
    //   err.response?.data?.error || err.response?.data?.message || err.message
    this.response = { status, data };
  }
}

async function request(method, url, { body, params, signal, responseType } = {}) {
  // Build full URL with query params
  let fullUrl = `${TIMESHEET_API_URL}${url}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.append(k, v);
    }
    const qsStr = qs.toString();
    if (qsStr) fullUrl += `?${qsStr}`;
  }

  // Build headers
  const headers = {};
  const token = localStorage.getItem('rivvra_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // Active company (2026-07-28). This client never sent the header, so the
  // timesheet API could only fall back to the persisted currentCompanyId and a
  // mid-session company switch never reached ensureEmployee — which resolves
  // the caller's employee record per company. Same hydration gate as api.js.
  const companyId = getActiveCompanyId();
  if (companyId) headers['X-Company-Id'] = companyId;

  // Active workspace. /api/timesheet/* is the largest block of routes with no
  // :slug in the path — 108 of them — so without this header every ESS and
  // leave request would resolve against the token's defaultOrgId regardless of
  // the workspace the URL names. See getActiveOrgSlug() in ./api.
  const orgSlug = getActiveOrgSlug();
  if (orgSlug) headers['X-Org-Slug'] = orgSlug;

  // Create an AbortController for timeout (30s)
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000);

  // Combine caller signal + timeout signal
  let combinedSignal = timeoutController.signal;
  if (signal) {
    const combined = new AbortController();
    const onAbort = () => combined.abort();
    signal.addEventListener('abort', onAbort);
    timeoutController.signal.addEventListener('abort', onAbort);
    combinedSignal = combined.signal;
  }

  let res;
  try {
    res = await fetch(fullUrl, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // Re-throw AbortErrors as-is (for useEffect cleanup)
    throw err;
  }
  clearTimeout(timeoutId);

  // Handle 401 — session expired.
  // Broadcast the same global event api.js dispatches so a top-level listener
  // can force a clean re-login. Without it an expired session was swallowed by
  // the many `.catch(() => {})` call sites and rendered as a false "no data"
  // empty state — the user was never bounced to login. Guarded on `token` so a
  // genuine not-logged-in 401 on the login screen doesn't loop.
  if (res.status === 401) {
    console.error('Timesheet API auth failed — session expired');
    if (token) {
      try {
        window.dispatchEvent(new CustomEvent('rivvra:auth-expired', { detail: { endpoint: url } }));
      } catch { /* non-browser env */ }
    }
    let data;
    try { data = await res.json(); } catch { data = {}; }
    throw new ApiError(data.error || 'Unauthorized', 401, data);
  }

  // Handle non-OK responses
  if (!res.ok) {
    let data;
    try { data = await res.json(); } catch { data = {}; }
    throw new ApiError(data.error || data.message || res.statusText, res.status, data);
  }

  // Parse response
  if (responseType === 'blob') {
    return { data: await res.blob() };
  }

  // Try JSON, fallback to text
  const text = await res.text();
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { data: text };
  }
}

// Axios-compatible interface
const timesheetApi = {
  get:    (url, opts) => request('GET', url, opts),
  post:   (url, body, opts) => request('POST', url, { ...opts, body }),
  put:    (url, body, opts) => request('PUT', url, { ...opts, body }),
  patch:  (url, body, opts) => request('PATCH', url, { ...opts, body }),
  delete: (url, opts) => request('DELETE', url, opts),
};

/**
 * AbortController usage (unchanged from axios version):
 *   useEffect(() => {
 *     const controller = new AbortController();
 *     timesheetApi.get('/endpoint', { signal: controller.signal }).then(...);
 *     return () => controller.abort();
 *   }, []);
 */

/**
 * Pre-warm the timesheet backend.
 * Now that timesheet is merged into the main backend, this is effectively
 * a no-op (the main backend is already warm from other API calls).
 * Kept for backward compatibility with AppCard.jsx import.
 */
export function warmTimesheetBackend() {
  // No-op: timesheet is now served by the main backend
  return Promise.resolve();
}

// ─── Cross-platform user management (Settings → Users & Teams) ──────────────

/**
 * Batch-fetch timesheet users by email addresses.
 * Returns { success, users: { email: tsUser | null } }
 */
export async function getTimesheetUsersByEmails(emails) {
  const res = await timesheetApi.post('/auth/users/by-emails', { emails });
  return res.data;
}

/**
 * Update a timesheet user's role by email.
 */
export async function updateTimesheetRoleByEmail(email, role) {
  const res = await timesheetApi.put(`/auth/users/by-email/${encodeURIComponent(email)}/role`, { role });
  return res.data;
}

/**
 * Provision a new timesheet account for a Rivvra team member.
 */
export async function provisionTimesheetUser(email, fullName, role = 'contractor') {
  const res = await timesheetApi.post('/auth/users/provision', { email, fullName, role });
  return res.data;
}

// ─── App Settings (Odoo-inspired config) ──────────────────────────────────
export async function getTimesheetAppSettings() {
  const res = await timesheetApi.get('/app-settings');
  return res.data;
}

export async function updateTimesheetAppSettings(data) {
  const res = await timesheetApi.put('/app-settings', data);
  return res.data;
}

// ─── Pay Configuration (Employee → Timesheet config) ──────────────────────
export async function getPayConfig() {
  const res = await timesheetApi.get('/pay-config');
  return res.data;
}

export async function updatePayConfig(email, data) {
  const res = await timesheetApi.put(`/pay-config/${encodeURIComponent(email)}`, data);
  return res.data;
}

export async function syncAllPayConfig() {
  const res = await timesheetApi.post('/pay-config/sync-all');
  return res.data;
}

// ─── Leave Management ─────────────────────────────────────────────────────

export async function getLeavePolicy() {
  const res = await timesheetApi.get('/leave-policy');
  return res.data;
}

export async function updateLeavePolicy(data) {
  const res = await timesheetApi.put('/leave-policy', data);
  return res.data;
}

export async function getMyLeaveBalances(financialYear, opts) {
  const res = await timesheetApi.get('/leave-balances/me', { ...opts, params: { financialYear } });
  return res.data;
}

export async function getAllLeaveBalances(params) {
  const res = await timesheetApi.get('/leave-balances', { params });
  return res.data;
}

export async function adjustLeaveBalance(data) {
  const res = await timesheetApi.post('/leave-balances/adjust', data);
  return res.data;
}

export async function getLeaveHistory(employeeId, params) {
  const res = await timesheetApi.get(`/leave-balances/${employeeId}/history`, { params });
  return res.data;
}

export async function applyLeave(data) {
  const res = await timesheetApi.post('/leave-requests', data);
  return res.data;
}

export async function getMyLeaveRequests(params) {
  const res = await timesheetApi.get('/leave-requests/me', { params });
  return res.data;
}

export async function getAllLeaveRequests(params) {
  const res = await timesheetApi.get('/leave-requests', { params });
  return res.data;
}

export async function getPendingLeaveRequests() {
  const res = await timesheetApi.get('/leave-requests/pending');
  return res.data;
}

export async function approveLeaveRequest(id) {
  const res = await timesheetApi.patch(`/leave-requests/${id}/approve`);
  return res.data;
}

export async function rejectLeaveRequest(id, data) {
  const res = await timesheetApi.patch(`/leave-requests/${id}/reject`, data);
  return res.data;
}

export async function revertLeaveRequest(id) {
  const res = await timesheetApi.patch(`/leave-requests/${id}/revert`);
  return res.data;
}

export async function cancelLeaveRequest(id, data) {
  const res = await timesheetApi.patch(`/leave-requests/${id}/cancel`, data);
  return res.data;
}

export async function runLeaveAccrual(data) {
  const res = await timesheetApi.post('/leave-accrual/run', data);
  return res.data;
}

export async function runLeaveYearEnd(data) {
  const res = await timesheetApi.post('/leave-year-end/run', data);
  return res.data;
}

// ─── Holiday Calendar ─────────────────────────────────────────────────────

export async function getHolidays(params, opts) {
  const res = await timesheetApi.get('/holidays', { ...opts, params });
  return res.data;
}

export async function updateHolidays(data) {
  const res = await timesheetApi.put('/holidays', data);
  return res.data;
}

export async function copyHolidaysToYear(data) {
  const res = await timesheetApi.post('/holidays/copy-to-year', data);
  return res.data;
}

// ─── Payroll Dashboard ───────────────────────────────────────────────────

export async function getPayrollSummary(month, year) {
  const res = await timesheetApi.get('/payroll/summary', { params: { month, year } });
  return res.data;
}

export async function getReconciliation(month, year) {
  const res = await timesheetApi.get('/timesheets/reconciliation', { params: { month, year } });
  return res.data;
}

export async function getNotApprovedTimesheets() {
  const res = await timesheetApi.get('/dashboard/not-approved');
  return res.data;
}

// ─── Leave Reports ────────────────────────────────────────────────────────

export async function getLeaveReportSummary(params) {
  const res = await timesheetApi.get('/leave-reports/summary', { params });
  return res.data;
}

export async function getLeaveReportUtilization(params) {
  const res = await timesheetApi.get('/leave-reports/utilization', { params });
  return res.data;
}

export async function exportLeaveReport(params) {
  const res = await timesheetApi.get('/leave-reports/export', { params, responseType: 'blob' });
  return res;
}

// ─── Attendance (Confirmed Employees) ──────────────────────────────────

export async function getAttendance(month, year) {
  const res = await request('GET', `/attendance/${month}/${year}`);
  return res.data;
}

export async function updateAttendance(id, entries) {
  const res = await request('PUT', `/attendance/${id}`, { body: { entries } });
  return res.data;
}

export async function submitAttendance(id) {
  const res = await request('PATCH', `/attendance/${id}/submit`);
  return res.data;
}

// NOTE: there is no DELETE /api/timesheet/attendance/:id route in the backend —
// a `deleteAttendance` helper used to live here and would have 404'd. It had no
// callers, so it was removed rather than pointed somewhere. Use resetAttendance.

export async function resetAttendance(id) {
  const res = await request('PATCH', `/attendance/${id}/reset`);
  return res.data;
}

export default timesheetApi;
