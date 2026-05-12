import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { ATS_EMPLOYMENT_TYPE_KEYS } from '../../utils/atsEmploymentTypes';
import FilterBar, { FilterChip, GroupByChip, MoreFiltersPopover, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';

const JOB_GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'client', label: 'Client' },
  { value: 'status', label: 'Status' },
  { value: 'department', label: 'Department' },
];

const JOB_APPROVAL_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const JOB_HIRING_MODE_OPTIONS = [
  { value: 'C2C', label: 'C2C' },
  { value: 'Full-time Hire', label: 'Full-time Hire' },
  { value: 'Contract', label: 'Contract' },
];

const JOB_EXPERIENCE_OPTIONS = [
  { value: '0-2', label: '0–2 years' },
  { value: '3-4', label: '3–4 years' },
  { value: '5+', label: '5+ years' },
  { value: '7-8', label: '7–8 years' },
  { value: '8-10', label: '8–10 years' },
];
import {
  Plus, Loader2, Briefcase,
  ChevronLeft, ChevronRight, ChevronDown, X,
} from 'lucide-react';

/* ── Status badge helper ──────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const styles = {
    open: 'bg-emerald-500/10 text-emerald-400',
    on_hold: 'bg-amber-500/10 text-amber-400',
    closed: 'bg-red-500/10 text-red-400',
  };
  const labels = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Unknown'}
    </span>
  );
}

/* ── Approval status badge helper ─────────────────────────────────────── */
function ApprovalBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    approved: 'bg-emerald-500/20 text-emerald-400',
    rejected: 'bg-red-500/20 text-red-400',
  };
  const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  const key = (status || 'pending').toLowerCase();

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Pending'}
    </span>
  );
}

/* ── New Job Modal ────────────────────────────────────────────────────── */
const EMPTY_JOB = {
  name: '',
  department: '',
  description: '',
  recruiterId: '',
  clientName: '',
  expectedHires: 1,
  employmentType: '',
  location: '',
  requiredExperience: '',
  approvalStatus: 'pending',
  approverId: '',
  clientBudget: '',
  maxBudget: '',
  hiringMode: '',
  accountOwnerId: '',
  accountManagerId: '',
};

const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Select Experience' },
  { value: '0-2 Years', label: '0-2 Years' },
  { value: '2-5 Years', label: '2-5 Years' },
  { value: '5-8 Years', label: '5-8 Years' },
  { value: '8-11 Years', label: '8-11 Years' },
  { value: '11-14 Years', label: '11-14 Years' },
  { value: '14+ Years', label: '14+ Years' },
];

const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const HIRING_MODE_OPTIONS = [
  { value: '', label: 'Select Hiring Mode' },
  { value: 'C2C', label: 'C2C' },
  { value: 'C2H', label: 'C2H' },
  { value: 'Full-time Hire', label: 'Full-time Hire' },
  { value: 'C2C or Full-time Hire', label: 'C2C or Full-time Hire' },
];

function NewJobModal({ show, onClose, onSaved, orgSlug }) {
  const modalRef = useRef(null);
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_JOB);
  const [saving, setSaving] = useState(false);
  const [recruiters, setRecruiters] = useState([]);

  // Fetch recruiters for user dropdowns
  useEffect(() => {
    if (!orgSlug) return;
    atsApi.listRecruiters(orgSlug).then((res) => {
      if (res.success && res.recruiters) {
        setRecruiters(res.recruiters);
      }
    }).catch(() => {});
  }, [orgSlug]);

  useEffect(() => {
    if (show) {
      setForm(EMPTY_JOB);
      setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
    }
  }, [show]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        department: form.department.trim(),
        description: form.description.trim(),
        recruiterId: form.recruiterId || undefined,
        clientName: form.clientName.trim(),
        expectedHires: Number(form.expectedHires) || 1,
        employmentType: form.employmentType.trim(),
        location: form.location.trim(),
        requiredExperience: form.requiredExperience,
        approvalStatus: form.approvalStatus,
        approverId: form.approverId || undefined,
        clientBudget: form.clientBudget ? Number(form.clientBudget) : undefined,
        maxBudget: form.maxBudget ? Number(form.maxBudget) : undefined,
        hiringMode: form.hiringMode,
        accountOwnerId: form.accountOwnerId || undefined,
        accountManagerId: form.accountManagerId || undefined,
      };
      const res = await atsApi.createJob(orgSlug, payload);
      if (res.success) {
        showToast('Job position created');
        onSaved();
        onClose();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create job position', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-modal-title"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-2xl my-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="job-modal-title" className="text-lg font-semibold text-white">
            New Job Position
          </h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Position Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              className="input-field"
            />
          </div>

          {/* Department & Employment Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => handleChange('department', e.target.value)}
                placeholder="e.g. Engineering"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Employment Type</label>
              <select
                value={form.employmentType}
                onChange={(e) => handleChange('employmentType', e.target.value)}
                className="input-field"
              >
                <option value="">Pick employment type…</option>
                {ATS_EMPLOYMENT_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recruiter & Client */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Recruiter</label>
              <select
                value={form.recruiterId}
                onChange={(e) => handleChange('recruiterId', e.target.value)}
                className="input-field"
              >
                <option value="">Select Recruiter</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name || r.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Client</label>
              <input
                type="text"
                value={form.clientName}
                onChange={(e) => handleChange('clientName', e.target.value)}
                placeholder="Client / Company"
                className="input-field"
              />
            </div>
          </div>

          {/* Location & Expected Hires */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="e.g. Remote, NYC"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Expected Hires</label>
              <input
                type="number"
                value={form.expectedHires}
                onChange={(e) => handleChange('expectedHires', e.target.value)}
                min="1"
                className="input-field"
              />
            </div>
          </div>

          {/* Required Experience & Hiring Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Required Experience</label>
              <select
                value={form.requiredExperience}
                onChange={(e) => handleChange('requiredExperience', e.target.value)}
                className="input-field"
              >
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Hiring Mode</label>
              <select
                value={form.hiringMode}
                onChange={(e) => handleChange('hiringMode', e.target.value)}
                className="input-field"
              >
                {HIRING_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Client Budget & Max Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Client Budget</label>
              <input
                type="number"
                value={form.clientBudget}
                onChange={(e) => handleChange('clientBudget', e.target.value)}
                placeholder="e.g. 80000"
                min="0"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Max Budget (Candidate)</label>
              <input
                type="number"
                value={form.maxBudget}
                onChange={(e) => handleChange('maxBudget', e.target.value)}
                placeholder="e.g. 120000"
                min="0"
                className="input-field"
              />
            </div>
          </div>

          {/* Approval Status & Approver */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Approval Status</label>
              <select
                value={form.approvalStatus}
                onChange={(e) => handleChange('approvalStatus', e.target.value)}
                className="input-field"
              >
                {APPROVAL_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Approver</label>
              <select
                value={form.approverId}
                onChange={(e) => handleChange('approverId', e.target.value)}
                className="input-field"
              >
                <option value="">Select Approver</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name || r.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Account Owner & Account Manager */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Account Owner</label>
              <select
                value={form.accountOwnerId}
                onChange={(e) => handleChange('accountOwnerId', e.target.value)}
                className="input-field"
              >
                <option value="">Select Account Owner</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name || r.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Account Manager</label>
              <select
                value={form.accountManagerId}
                onChange={(e) => handleChange('accountManagerId', e.target.value)}
                className="input-field"
              >
                <option value="">Select Account Manager</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name || r.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Job description..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Create Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsJobPositions() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams([
    'search', 'status', 'department', 'archived',
    'approvalStatus', 'hiringMode', 'requiredExperience', 'clientName', 'groupBy',
  ]);
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // ── Fetch jobs ─────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setJobs([]);
    setTotal(0);
    setTotalPages(1);
    try {
      const res = await atsApi.listJobs(orgSlug, { page, ...filterParams });
      if (res.success) {
        setJobs(res.jobs || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);

        // Build departments list from job data (per-company switches reset).
        const deptSet = new Set();
        (res.jobs || []).forEach((j) => { if (j.department) deptSet.add(j.department); });
        setDepartments([...deptSet].sort());
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
      showToast('Failed to load job positions', 'error');
      setJobs([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, JSON.stringify(filterParams), showToast]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Archived count for the segmented Active/Archived chip.
  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    atsApi.listJobs(orgSlug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined })]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Filter options
  const statusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'closed', label: 'Closed' },
  ];
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d, label: d })),
    [departments],
  );
  // Derive client list from the loaded jobs (denorm'd clientName field).
  // Sorted alphabetically. Same pattern as departmentOptions.
  const clientOptions = useMemo(() => {
    const unique = new Set(jobs.map((j) => j.clientName).filter(Boolean));
    return [...unique].sort().map((n) => ({ value: n, label: n }));
  }, [jobs]);

  // ── Grouped data (Phase 1: client / status / department) ─────────────
  const groupedJobs = useMemo(() => {
    if (!groupBy) return null;
    const extractor = (job) => {
      if (groupBy === 'client') {
        return [{
          key: job.clientName || job.partnerId || '__unknown__',
          label: job.clientName || (job.partnerId ? 'Unknown client' : 'No client'),
        }];
      }
      if (groupBy === 'status') {
        const labelMap = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };
        return [{
          key: job.status || '__unknown__',
          label: labelMap[job.status] || job.status || 'Unknown',
        }];
      }
      if (groupBy === 'department') {
        return [{
          key: job.department || '__unknown__',
          label: job.department || 'No department',
        }];
      }
      return [];
    };
    return sortGroupsByCount(groupRecords(jobs, extractor));
  }, [jobs, groupBy]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Pagination
  const pageStart = total === 0 ? 0 : (page - 1) * 20 + 1;
  const pageEnd = Math.min(page * 20, total);

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Positions</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'position' : 'positions'} total
          </p>
        </div>
        {/* New Job creation is intentionally not surfaced here. Jobs come
            from converting a Won opportunity via "Convert to Job" on
            CrmOpportunityDetail — the canonical funnel since 2026-05-10.
            The API endpoint stays open so superadmin scripts and the
            Odoo importer can still seed jobs directly. */}
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <FilterBar searchPlaceholder="Search by position name, department, or client…">
        <FilterChip type="select" paramKey="status" label="Status" options={statusOptions} />
        <FilterChip type="select" paramKey="department" label="Department" options={departmentOptions} />
        <FilterChip type="select" paramKey="clientName" label="Client" options={clientOptions} placeholder="No clients" />
        <FilterChip type="select" paramKey="approvalStatus" label="Approval" options={JOB_APPROVAL_OPTIONS} />
        <GroupByChip options={JOB_GROUP_BY_OPTIONS} />
        <MoreFiltersPopover paramKeys={['hiringMode', 'requiredExperience']}>
          <FilterChip type="select" paramKey="hiringMode" label="Hiring Mode" options={JOB_HIRING_MODE_OPTIONS} />
          <FilterChip type="select" paramKey="requiredExperience" label="Experience" options={JOB_EXPERIENCE_OPTIONS} />
        </MoreFiltersPopover>
        <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
      </FilterBar>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No job positions found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {Object.values(filterParams).some(Boolean)
              ? 'Try adjusting your search or filters.'
              : 'Job positions are created from CRM opportunities once they\'re won. Open an opportunity in CRM and use Convert to Job Position to add one here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Department</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Experience</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Hiring Mode</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Approval</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Client</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Published</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Applications</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Expected</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                  const renderRow = (job, keySuffix = '') => (
                    <tr
                      key={`${job._id}${keySuffix}`}
                      onClick={() => navigate(orgPath(`/ats/jobs/${job._id}`))}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                            <Briefcase size={14} className="text-rivvra-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{job.name}</p>
                            {job.location && (
                              <p className="text-dark-500 text-xs truncate">{job.location}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        {job.department || '\u2014'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <StatusBadge status={job.status} />
                      </td>

                      {/* Required Experience */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.requiredExperience || '\u2014'}
                      </td>

                      {/* Hiring Mode */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.hiringMode || '\u2014'}
                      </td>

                      {/* Approval Status */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <ApprovalBadge status={job.approvalStatus} />
                      </td>

                      {/* Recruiter */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.recruiterName || '\u2014'}
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {job.clientName || '\u2014'}
                      </td>

                      {/* Published */}
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          job.published ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-500'
                        }`}>
                          {job.published ? 'Yes' : 'No'}
                        </span>
                      </td>

                      {/* Applications count */}
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        <span className="bg-dark-700 text-dark-300 text-xs px-2 py-0.5 rounded-full">
                          {job.applicationCount ?? job.applications ?? 0}
                        </span>
                      </td>

                      {/* Expected Hires */}
                      <td className="px-4 py-3 text-center text-dark-300 hidden xl:table-cell">
                        {job.expectedHires ?? '\u2014'}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        {formatDate(job.createdAt)}
                      </td>
                    </tr>
                  );
                  // 2026-05-12 ATS audit Q2 = A: when groupBy is set, wrap
                  // row stream in collapsible group sections.
                  if (!isGrouped) {
                    return jobs.map((j) => renderRow(j));
                  }
                  return (groupedJobs || []).flatMap(([key, group]) => {
                    const collapsed = collapsedGroups.has(key);
                    const header = (
                      <tr key={`__group__${key}`} className="bg-dark-800/40">
                        <td colSpan={12} className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => toggleGroup(key)}
                            className="flex items-center gap-2 text-sm font-semibold text-dark-100 hover:text-white w-full text-left"
                          >
                            <ChevronDown
                              size={14}
                              className={`text-dark-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                            />
                            <span>{group.label}</span>
                            <span className="text-xs text-dark-400 font-normal">
                              {group.records.length} job{group.records.length === 1 ? '' : 's'}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                    const rows = collapsed ? [] : group.records.map((j) => renderRow(j, `__${key}`));
                    return [header, ...rows];
                  });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {!isGrouped && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-dark-400 text-sm">
                Showing {pageStart}\u2013{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-2 text-dark-500 text-sm">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          p === page
                            ? 'bg-rivvra-500 text-dark-950'
                            : 'text-dark-400 hover:text-white hover:bg-dark-800'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Job Modal */}
      <NewJobModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => fetchJobs({ page: 1 })}
        orgSlug={orgSlug}
      />
    </div>
  );
}
