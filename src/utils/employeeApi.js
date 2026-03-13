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

  remove(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${id}`, {
      method: 'DELETE',
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

  // ── Employee Documents (bank proof, education certificates, etc.) ──────────
  async uploadEmployeeDoc(orgSlug, employeeId, file, category, subcategory = null, educationIndex = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    if (subcategory) formData.append('subcategory', subcategory);
    if (educationIndex !== null && educationIndex !== undefined) formData.append('educationIndex', educationIndex);
    const url = `${API_BASE_URL}/api/org/${orgSlug}/employee/employees/${employeeId}/documents`;
    const token = localStorage.getItem('rivvra_token');
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) { const data = await res.json(); throw new Error(data.error || 'Upload failed'); }
      throw new Error(`Upload failed with status ${res.status}`);
    }
    return res.json();
  },

  async uploadMyDoc(orgSlug, file, category, subcategory = null, educationIndex = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    if (subcategory) formData.append('subcategory', subcategory);
    if (educationIndex !== null && educationIndex !== undefined) formData.append('educationIndex', educationIndex);
    const url = `${API_BASE_URL}/api/org/${orgSlug}/employee/my-documents`;
    const token = localStorage.getItem('rivvra_token');
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) { const data = await res.json(); throw new Error(data.error || 'Upload failed'); }
      throw new Error(`Upload failed with status ${res.status}`);
    }
    return res.json();
  },

  listEmployeeDocs(orgSlug, employeeId, category = null, educationIndex = null) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (educationIndex !== null && educationIndex !== undefined) params.set('educationIndex', educationIndex);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/documents${qs}`);
  },

  listMyDocs(orgSlug, category = null, educationIndex = null) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (educationIndex !== null && educationIndex !== undefined) params.set('educationIndex', educationIndex);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.request(`/api/org/${orgSlug}/employee/my-documents${qs}`);
  },

  getEmployeeDocUrl(orgSlug, employeeId, docId) {
    return `${API_BASE_URL}/api/org/${orgSlug}/employee/employees/${employeeId}/emp-documents/${docId}`;
  },

  deleteEmployeeDoc(orgSlug, employeeId, docId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/emp-documents/${docId}`, { method: 'DELETE' });
  },

  deleteMyDoc(orgSlug, docId) {
    return api.request(`/api/org/${orgSlug}/employee/my-documents/${docId}`, { method: 'DELETE' });
  },

  // ── Rate Revision ──────────────────────────────────────────────────────────
  reviseRate(orgSlug, employeeId, assignmentIndex, data) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/assignments/${assignmentIndex}/revise-rate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getRateHistory(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/rate-history`);
  },

  // ── Employee ↔ User Linking ───────────────────────────────────────────────
  linkUser(orgSlug, employeeId, userId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/link-user`, {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    });
  },

  unlinkUser(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/unlink-user`, {
      method: 'PUT',
    });
  },

  // ── Invite from Employee Page ──────────────────────────────────────────────
  inviteToWorkspace(orgSlug, employeeId, options = {}) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/invite`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // ── Send Onboarding Form Link ──────────────────────────────────────────────
  sendOnboardingLink(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/send-onboarding-link`, {
      method: 'POST',
    });
  },

  // ── Onboarding ─────────────────────────────────────────────────────────────
  checkOnboarding(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/onboarding-check`);
  },

  getMyProfile(orgSlug) {
    return api.request(`/api/org/${orgSlug}/employee/my-profile`);
  },

  submitOnboarding(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/employee/my-profile/onboarding`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Plan Templates ─────────────────────────────────────────────────────────
  listPlanTemplates(orgSlug, planType) {
    const qs = planType ? `?planType=${planType}` : '';
    return api.request(`/api/org/${orgSlug}/employee/plan-templates${qs}`);
  },

  createPlanTemplate(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/employee/plan-templates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePlanTemplate(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/employee/plan-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deletePlanTemplate(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/employee/plan-templates/${id}`, {
      method: 'DELETE',
    });
  },

  // ── Plan Instances ─────────────────────────────────────────────────────────
  launchPlan(orgSlug, employeeId, templateId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/launch-plan`, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
  },

  listEmployeePlans(orgSlug, employeeId) {
    return api.request(`/api/org/${orgSlug}/employee/employees/${employeeId}/plans`);
  },

  getPlanInstance(orgSlug, instanceId) {
    return api.request(`/api/org/${orgSlug}/employee/plan-instances/${instanceId}`);
  },

  updatePlanTask(orgSlug, instanceId, taskId, data) {
    return api.request(`/api/org/${orgSlug}/employee/plan-instances/${instanceId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getMyTasks(orgSlug, status) {
    const qs = status ? `?status=${status}` : '';
    return api.request(`/api/org/${orgSlug}/employee/my-tasks${qs}`);
  },
};

export default employeeApi;
