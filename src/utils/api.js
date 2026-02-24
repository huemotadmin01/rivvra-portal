import { API_BASE_URL } from './config';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this._activeControllers = new Map(); // Track in-flight requests for cancellation
  }

  /**
   * Cancel all in-flight requests (e.g., on page navigation)
   */
  cancelAll() {
    for (const [key, controller] of this._activeControllers) {
      controller.abort();
    }
    this._activeControllers.clear();
  }

  /**
   * Cancel a specific request by its key
   */
  cancel(key) {
    const controller = this._activeControllers.get(key);
    if (controller) {
      controller.abort();
      this._activeControllers.delete(key);
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const requestKey = options._requestKey || endpoint;

    // Cancel previous request with same key (deduplication)
    if (options._requestKey) {
      this.cancel(requestKey);
    }

    const controller = new AbortController();
    this._activeControllers.set(requestKey, controller);

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    };
    // Remove internal options before passing to fetch
    delete config._requestKey;

    // Add auth token if available
    const token = localStorage.getItem('rivvra_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, config);

      // Check Content-Type before parsing as JSON
      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Non-JSON response — create meaningful error from status
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status} (${response.statusText || 'Unknown error'})`);
        }
        // Try parsing as JSON anyway (some servers don't set Content-Type correctly)
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Unexpected response format (status ${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request was cancelled — don't treat as real error
        throw error;
      }
      throw error;
    } finally {
      this._activeControllers.delete(requestKey);
    }
  }

  // Auth endpoints
  async sendOtp(email, isSignup = false, inviteToken = undefined) {
    const payload = { email, isSignup };
    if (inviteToken) payload.inviteToken = inviteToken;
    return this.request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async verifyOtp(email, otp) {
    return this.request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  }

  async verifyOtpOnly(email, otp) {
    return this.request('/api/auth/verify-otp-only', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  }

  async signupWithPassword(email, otp, name, password, inviteToken = undefined) {
    const payload = { email, otp, name, password };
    if (inviteToken) payload.inviteToken = inviteToken;
    return this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async loginWithPassword(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async googleAuth(userData) {
    return this.request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  // User endpoints
  async getProfile() {
    return this.request('/api/user/profile');
  }

  async getFeatures() {
    return this.request('/api/user/features');
  }

  async updateProfile(data) {
    return this.request('/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateOnboarding(data) {
    return this.request('/api/user/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async saveOnboarding(data) {
    return this.updateOnboarding(data);
  }

  // Company endpoints
  async searchCompanies(query) {
    return this.request(`/api/companies/search?q=${encodeURIComponent(query)}`);
  }

  async createOrUpdateCompany(data) {
    return this.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCompany(id) {
    return this.request(`/api/companies/${id}`);
  }

  // Leads endpoints
  async createLead(data) {
    return this.request('/api/portal/leads/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLeads(listName = null) {
    // Request all leads since the portal does client-side pagination
    const baseUrl = '/api/portal/leads?limit=10000';
    const url = listName ? `${baseUrl}&list=${encodeURIComponent(listName)}` : baseUrl;
    return this.request(url);
  }

  async searchAllLeads({ search, location, title, profileType, company, emailStatus, listName, page = 1, limit = 25, sort = 'createdAt', sortDir = 'desc' } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (location) params.set('location', location);
    if (title) params.set('title', title);
    if (profileType) params.set('profileType', profileType);
    if (company) params.set('company', company);
    if (emailStatus) params.set('emailStatus', emailStatus);
    if (listName) params.set('listName', listName);
    params.set('page', page.toString());
    params.set('limit', limit.toString());
    params.set('sort', sort);
    params.set('sortDir', sortDir);
    return this.request(`/api/portal/leads/search?${params.toString()}`);
  }

  async getLead(id) {
    return this.request(`/api/portal/leads/${id}`);
  }

  async saveLead(data) {
    return this.request('/api/portal/leads/save', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteLead(id) {
    return this.request(`/api/portal/leads/${id}`, {
      method: 'DELETE',
    });
  }

  async updateLead(id, data) {
    return this.request(`/api/portal/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateLeadNotes(id, notes) {
    return this.request(`/api/portal/leads/${id}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    });
  }

  async bulkDeleteLeads(ids) {
    return this.request('/api/portal/leads/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  // Lists endpoints
  async getLists() {
    return this.request('/api/lists');
  }

  async createList(name) {
    return this.request('/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteList(listId) {
    return this.request(`/api/lists/${listId}`, {
      method: 'DELETE',
    });
  }

  async getListLeads(listName, page = 1, limit = 10) {
    return this.request(`/api/lists/${encodeURIComponent(listName)}/leads?page=${page}&limit=${limit}`);
  }

  async updateLeadLists(id, lists) {
    return this.request(`/api/portal/leads/${id}/lists`, {
      method: 'PUT',
      body: JSON.stringify({ lists }),
    });
  }

  async removeLeadFromList(leadId, listName) {
    return this.request(`/api/portal/leads/${leadId}/lists/${encodeURIComponent(listName)}`, {
      method: 'DELETE',
    });
  }

  // CRM endpoints
  async exportToOdoo({ leadData, userEmail, linkedinUrl, profileType, extractedSkill }) {
    return this.request('/api/crm/export-odoo', {
      method: 'POST',
      body: JSON.stringify({ leadData, userEmail, linkedinUrl, profileType, extractedSkill }),
    });
  }

  async checkCRMExport(url, userEmail) {
    return this.request(`/api/crm/check-export?url=${encodeURIComponent(url)}&userEmail=${encodeURIComponent(userEmail)}`);
  }

  async extractSkill(headline, userEmail) {
    return this.request('/api/openai/extract-skill', {
      method: 'POST',
      body: JSON.stringify({ headline, userEmail }),
    });
  }

  // Sequence endpoints
  async getSequences() {
    return this.request('/api/sequences');
  }

  async getSequence(id) {
    return this.request(`/api/sequences/${id}`);
  }

  async createSequence(data) {
    return this.request('/api/sequences', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSequence(id, data) {
    return this.request(`/api/sequences/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSequence(id) {
    return this.request(`/api/sequences/${id}`, {
      method: 'DELETE',
    });
  }

  async enrollInSequence(sequenceId, leadIds) {
    return this.request(`/api/sequences/${sequenceId}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ leadIds }),
    });
  }

  async pauseSequence(id) {
    return this.request(`/api/sequences/${id}/pause`, {
      method: 'POST',
    });
  }

  async resumeSequence(id) {
    return this.request(`/api/sequences/${id}/resume`, {
      method: 'POST',
    });
  }

  async getSequenceEnrollments(id, page = 1, limit = 50, { status, search, owner, dateFrom, dateTo } = {}) {
    let url = `/api/sequences/${id}/enrollments?page=${page}&limit=${limit}`;
    if (status && status !== 'all') url += `&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (owner && owner !== 'all') url += `&owner=${encodeURIComponent(owner)}`;
    if (dateFrom) url += `&dateFrom=${encodeURIComponent(dateFrom)}`;
    if (dateTo) url += `&dateTo=${encodeURIComponent(dateTo)}`;
    return this.request(url);
  }

  async duplicateSequence(id) {
    return this.request(`/api/sequences/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async shareSequence(id) {
    return this.request(`/api/sequences/${id}/share`, {
      method: 'POST',
    });
  }

  async removeEnrollment(sequenceId, enrollmentId) {
    return this.request(`/api/sequences/${sequenceId}/enrollments/${enrollmentId}`, {
      method: 'DELETE',
    });
  }

  async markEnrollmentReplied(sequenceId, enrollmentId, replyType = 'interested') {
    return this.request(`/api/sequences/${sequenceId}/enrollments/${enrollmentId}/mark-replied`, {
      method: 'POST',
      body: JSON.stringify({ replyType }),
    });
  }

  // Tags management
  async updateLeadTags(leadId, tags) {
    return this.request(`/api/portal/leads/${leadId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags }),
    });
  }

  async getLeadReply(leadId) {
    return this.request(`/api/portal/leads/${leadId}/reply`);
  }

  // Account management
  async deleteAccount() {
    return this.request('/api/user/delete-account', {
      method: 'DELETE',
    });
  }

  // Gmail OAuth
  async getGmailOAuthUrl() {
    return this.request('/api/engage/oauth-url');
  }

  async connectGmail(code) {
    return this.request('/api/engage/connect-gmail', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async disconnectGmail() {
    return this.request('/api/engage/disconnect-gmail', {
      method: 'POST',
    });
  }

  async getGmailStatus() {
    return this.request('/api/engage/gmail-status');
  }

  // Engage Settings
  async getEngageSettings() {
    return this.request('/api/engage/settings');
  }

  async updateEngageSettings(settings) {
    return this.request('/api/engage/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Engage Stats
  async getEmailsSentToday() {
    return this.request('/api/engage/emails-sent-today');
  }

  // Sequence Email Log
  async getSequenceEmailLog(sequenceId, page = 1, limit = 50) {
    return this.request(`/api/sequences/${sequenceId}/email-log?page=${page}&limit=${limit}`);
  }

  // Lightweight poll for sequence updates (stats + latest activity timestamp)
  async pollSequence(sequenceId) {
    return this.request(`/api/sequences/${sequenceId}/poll`);
  }

  // Attachment management
  async uploadAttachment(sequenceId, stepIndex, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stepIndex', stepIndex);
    const url = `${this.baseUrl}/api/sequences/${sequenceId}/attachments`;
    const token = localStorage.getItem('rivvra_token');
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
      throw new Error(`Upload failed with status ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Upload failed: unexpected response format');
    }
    const data = await res.json();
    return data;
  }

  async deleteAttachment(sequenceId, attachmentId) {
    return this.request(`/api/sequences/${sequenceId}/attachments/${attachmentId}`, { method: 'DELETE' });
  }

  async getStepAttachments(sequenceId, stepIndex) {
    return this.request(`/api/sequences/${sequenceId}/steps/${stepIndex}/attachments`);
  }

  // Sequence Schedule
  async updateSequenceSchedule(sequenceId, schedule) {
    return this.request(`/api/sequences/${sequenceId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify({ schedule }),
    });
  }

  // Pause/Resume enrollment
  async pauseEnrollment(sequenceId, enrollmentId) {
    return this.request(`/api/sequences/${sequenceId}/enrollments/${enrollmentId}/pause`, {
      method: 'POST',
    });
  }

  // Toggle step enabled/disabled
  async toggleStep(sequenceId, stepIndex) {
    return this.request(`/api/sequences/${sequenceId}/steps/${stepIndex}/toggle`, {
      method: 'PUT',
    });
  }

  // Update single step (subject/body/days)
  async updateStep(sequenceId, stepIndex, data) {
    return this.request(`/api/sequences/${sequenceId}/steps/${stepIndex}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Delete single step
  async deleteStep(sequenceId, stepIndex) {
    return this.request(`/api/sequences/${sequenceId}/steps/${stepIndex}`, {
      method: 'DELETE',
    });
  }

  // Add step to sequence
  async addStep(sequenceId, step) {
    return this.request(`/api/sequences/${sequenceId}/steps`, {
      method: 'POST',
      body: JSON.stringify(step),
    });
  }

  // Bulk enrollment actions
  async bulkPauseEnrollments(sequenceId, enrollmentIds) {
    return this.request(`/api/sequences/${sequenceId}/enrollments/bulk-pause`, {
      method: 'POST',
      body: JSON.stringify({ enrollmentIds }),
    });
  }

  async bulkRemoveEnrollments(sequenceId, enrollmentIds) {
    return this.request(`/api/sequences/${sequenceId}/enrollments/bulk-remove`, {
      method: 'POST',
      body: JSON.stringify({ enrollmentIds }),
    });
  }

  // Export sequence to CSV (secure: token in header, not URL)
  async exportSequenceCsv(sequenceId) {
    const token = localStorage.getItem('rivvra_token');
    const response = await fetch(`${this.baseUrl}/api/sequences/${sequenceId}/export-csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      // Try to extract error message from JSON response
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        throw new Error(data.error || `Export failed with status ${response.status}`);
      }
      throw new Error(`Export failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sequence-export-${sequenceId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Reconcile sequence stats
  async reconcileStats(sequenceId) {
    return this.request(`/api/sequences/${sequenceId}/reconcile-stats`, {
      method: 'POST',
    });
  }

  // Send test email
  async sendTestEmail(sequenceId, stepIndex, testEmail) {
    return this.request(`/api/sequences/${sequenceId}/send-test`, {
      method: 'POST',
      body: JSON.stringify({ stepIndex, testEmail }),
    });
  }

  // Update automation rules
  async updateAutomationRules(sequenceId, automationRules) {
    return this.request(`/api/sequences/${sequenceId}/automation-rules`, {
      method: 'PUT',
      body: JSON.stringify({ automationRules }),
    });
  }

  async updateEnteringCriteria(sequenceId, enteringCriteria) {
    return this.request(`/api/sequences/${sequenceId}/entering-criteria`, {
      method: 'PUT',
      body: JSON.stringify({ enteringCriteria }),
    });
  }

  // Suppression list
  async getSuppressions(page = 1, limit = 50, search = '') {
    let url = `/api/engage/suppressions?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return this.request(url);
  }

  async addSuppression(email, reason = 'manual') {
    return this.request('/api/engage/suppressions', {
      method: 'POST',
      body: JSON.stringify({ email, reason }),
    });
  }

  async removeSuppression(id) {
    return this.request(`/api/engage/suppressions/${id}`, {
      method: 'DELETE',
    });
  }

  // Setup status (for engage setup guide)
  async getSetupStatus() {
    return this.request('/api/user/setup-status');
  }

  // Ensure default lists exist for user
  async ensureDefaultLists() {
    return this.request('/api/lists/ensure-defaults', {
      method: 'POST',
    });
  }

  // Team management
  async getTeamMembers() {
    return this.request('/api/team/members');
  }

  async updateMemberRole(userId, role) {
    return this.request(`/api/team/members/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async deleteTeamMember(userId) {
    return this.request(`/api/team/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async inviteTeamMember(email, role = 'member') {
    return this.request('/api/team/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async getTeamInvites() {
    return this.request('/api/team/invites');
  }

  async cancelTeamInvite(inviteId) {
    return this.request(`/api/team/invites/${inviteId}`, {
      method: 'DELETE',
    });
  }

  async validateInviteToken(token) {
    return this.request('/api/team/invite/validate', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // Accept invite: { token, name, password } for new user, { token, credential } for Google, { token } for one-click
  async acceptInvite(data) {
    return this.request('/api/team/invite/accept', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ─── Org Branding & Settings ──────────────────────────────────────────────

  async updateOrg(orgSlug, data) {
    return this.request(`/api/org/${orgSlug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadOrgLogo(orgSlug, formData) {
    const url = `${this.baseUrl}/api/org/${orgSlug}/logo`;
    const token = localStorage.getItem('rivvra_token');
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    return res.json();
  }

  async deleteOrgLogo(orgSlug) {
    return this.request(`/api/org/${orgSlug}/logo`, { method: 'DELETE' });
  }

  // ─── Org Membership Management ─────────────────────────────────────────────

  async getOrgMembers(orgSlug) {
    return this.request(`/api/org/${orgSlug}/members`);
  }

  async updateOrgMember(orgSlug, userId, data) {
    return this.request(`/api/org/${orgSlug}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async removeOrgMember(orgSlug, userId) {
    return this.request(`/api/org/${orgSlug}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async inviteOrgMember(orgSlug, data) {
    return this.request(`/api/org/${orgSlug}/invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Org invite validation + acceptance (public endpoints for invite flow)
  async validateOrgInvite(token) {
    return this.request('/api/org/invite/validate', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // Accept org invite: { token, credential } for Google, { token } for one-click, { token, name, password } for new
  async acceptOrgInvite(data) {
    return this.request('/api/org/invite/accept', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin impersonation
  async impersonateUser(targetUserId) {
    return this.request('/api/admin/impersonate', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
  }

  // Sub-Teams CRUD
  async getTeams() {
    return this.request('/api/teams');
  }

  async createTeam(name, leaderId = null) {
    return this.request('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name, leaderId }),
    });
  }

  async updateTeam(teamId, data) {
    return this.request(`/api/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTeam(teamId) {
    return this.request(`/api/teams/${teamId}`, {
      method: 'DELETE',
    });
  }

  async addTeamMembers(teamId, userIds) {
    return this.request(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  async removeTeamMember(teamId, userId) {
    return this.request(`/api/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Team Member Rate Limits (admin only)
  async getMemberRateLimits() {
    return this.request('/api/teams/members/rate-limits');
  }

  async updateMemberRateLimits(userId, limits) {
    return this.request(`/api/teams/member/${userId}/rate-limits`, {
      method: 'PUT',
      body: JSON.stringify(limits),
    });
  }

  // Team Dashboard
  async getDashboardStats({ dateFrom, dateTo } = {}) {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    const qs = params.toString();
    return this.request(`/api/dashboard/team${qs ? `?${qs}` : ''}`);
  }

  // Rename default list (admin only)
  async renameDefaultList(listId, newName) {
    return this.request(`/api/lists/${listId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName }),
    });
  }

  // Team Lists (admin/team_lead only)
  async getTeamLists() {
    return this.request('/api/lists/team');
  }

  async getTeamListLeads(listName, page = 1, limit = 10) {
    return this.request(`/api/lists/team/${encodeURIComponent(listName)}/leads?page=${page}&limit=${limit}`);
  }

  // Team Leads (admin/team_lead only)
  async getTeamLeads(listName = null) {
    const baseUrl = '/api/portal/leads/team?limit=10000';
    const url = listName ? `${baseUrl}&list=${encodeURIComponent(listName)}` : baseUrl;
    return this.request(url);
  }

  async assignLeadOwner(leadId, newOwnerId) {
    return this.request(`/api/portal/leads/${leadId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ newOwnerId }),
    });
  }

  // ─── Public Org Info ────────────────────────────────────────────────────────

  async getOrgPublicInfo(slug) {
    return this.request(`/api/org/${slug}/public-info`);
  }

  // ─── Trial & Billing ──────────────────────────────────────────────────────

  async getTrialStatus(orgSlug) {
    return this.request(`/api/org/${orgSlug}/trial-status`);
  }

  async upgradeOrg(orgSlug, data) {
    return this.request(`/api/org/${orgSlug}/upgrade`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ─── Super Admin ──────────────────────────────────────────────────────────

  async getSuperAdminStats() {
    return this.request('/api/superadmin/stats');
  }

  async getSuperAdminWorkspaces(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/superadmin/workspaces${qs ? '?' + qs : ''}`);
  }

  async getSuperAdminWorkspace(orgId) {
    return this.request(`/api/superadmin/workspaces/${orgId}`);
  }

  async updateSuperAdminWorkspace(orgId, data) {
    return this.request(`/api/superadmin/workspaces/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getEmailTemplates() {
    return this.request('/api/superadmin/email-templates');
  }

  async getEmailTemplate(key) {
    return this.request(`/api/superadmin/email-templates/${key}`);
  }

  async updateEmailTemplate(key, data) {
    return this.request(`/api/superadmin/email-templates/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async previewEmailTemplate(key, sampleData) {
    return this.request(`/api/superadmin/email-templates/${key}/preview`, {
      method: 'POST',
      body: JSON.stringify({ sampleData }),
    });
  }

  // ── Workspace Recovery ──
  async findWorkspace(email) {
    return this.request('/api/auth/find-workspace', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async checkDomain(email) {
    return this.request(`/api/auth/check-domain?email=${encodeURIComponent(email)}`);
  }

  async resendWelcomeEmail() {
    return this.request('/api/user/resend-welcome', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
export default api;