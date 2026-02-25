import { TIMESHEET_API_URL } from './config';

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

  // Handle 401 — session expired
  if (res.status === 401) {
    console.error('Timesheet API auth failed — session expired');
    localStorage.removeItem('rivvra_token');
    localStorage.removeItem('rivvra_user');
    const currentHash = window.location.hash || '';
    if (!currentHash.includes('/login')) {
      window.location.hash = '#/login';
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

export default timesheetApi;
