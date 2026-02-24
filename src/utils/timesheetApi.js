import axios from 'axios';
import { TIMESHEET_API_URL } from './config';

const timesheetApi = axios.create({
  baseURL: TIMESHEET_API_URL,
  timeout: 30000, // 30s timeout for cold-start tolerance
});

// Use rivvra_token for unified platform auth
timesheetApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('rivvra_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

timesheetApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Timesheet API auth failed');
    }
    return Promise.reject(error);
  }
);

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
