/**
 * Employee App API utility
 * Uses the main ApiClient for org-scoped employee endpoints.
 */
import api from './api';
import { API_BASE_URL } from './config';

const employeeApi = {
  // ── Employees ─────────────────────────────────────────────────────────
  list(orgSlug, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return api.request(`/api/org/${orgSlug}/employee/employees${qs ? '?' + qs : ''}`);
  },

  get(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${id}`);
  },

  create(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/employee/employees`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getByEmail(orgSlug, email) {
    return api.request(`/api/org/${orgSlug}/employee/employees/by-email/${encodeURIComponent(email)}`);
  },

  stats(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/stats`);
  },

  // ── Departments ───────────────────────────────────────────────────────
  listDepartments(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/departments`);
  },

  createDepartment(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/employee/departments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateDepartment(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/employee/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteDepartment(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/employee/departments/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Admin ───────────────────────────────────────────────────────────
  importOdooRates(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/admin/import-odoo-rates`, {
      method: 'POST',
    });
  },

  syncAllToTimesheet(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/admin/sync-all-to-timesheet`, {
      method: 'POST',
    });
  },

  importOdooManagers(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/admin/import-odoo-managers`, {
      method: 'POST',
    });
  },

  cleanupTestData(orgSlug, { clientNames = [], projectNames = [] } = {}) {
    return api.request(`/api/org/${orgSlug}/employee/admin/cleanup-test-data`, {
      method: 'POST',
      body: JSON.stringify({ clientNames, projectNames }),
    });
  },

  // ── Timesheet Options (projects & clients for assignment dropdowns) ──
  getTimesheetOptions(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/timesheet-options`);
  },

  // ── Manager Options (active employees with portal license) ──
  getManagerOptions(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/manager-options`);
  },

  // ── App Settings ─────────────────────────────────────────────────────
  getAppSettings(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/app-settings`);
  },

  updateAppSettings(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/employee/app-settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Assignment Documents ────────────────────────────────────────────────
  async uploadAssignmentDoc(orgSlug, employeeId, assignmentIdx, file) {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${API_BASE_URL}/api/org/${orgSlug}/employee/employees/${employeeId}/assignments/${assignmentIdx}/documents`;
    const token = localStorage.getItem('rivvra_token');
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
      throw new Error(`Upload failed with status ${res.status}`);
    }
    return res.json();
  },

  listAssignmentDocs(orgSlug, employeeId, assignmentIdx) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/assignments/${assignmentIdx}/documents`);
  },

  deleteAssignmentDoc(orgSlug, employeeId, docId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/documents/${docId}`, {
      method: 'DELETE',
    });
  },

  getAssignmentDocUrl(orgSlug, employeeId, docId) {
    return `${API_BASE_URL}/api/org/${orgSlug}/employee/employees/${employeeId}/documents/${docId}`;
  },
};

export default employeeApi;
