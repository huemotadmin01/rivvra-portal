import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Search, Plus, Loader2, Briefcase,
  ChevronLeft, ChevronRight, ChevronDown, X,
} from 'lucide-react';

/* ── Inline FilterChip component ─────────────────────────────────────── */
function FilterChip({ label, value, options, isOpen, onToggle, onSelect }) {
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption && value ? selectedOption.label : label;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
            : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200'
        }`}
      >
        {displayLabel}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute left-0 top-full mt-1.5 min-w-[180px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20 max-h-60 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  opt.value === value
                    ? 'bg-rivvra-500/10 text-rivvra-400'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
              <input
                type="text"
                value={form.employmentType}
                onChange={(e) => handleChange('employmentType', e.target.value)}
                placeholder="e.g. Full-time"
                className="input-field"
              />
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
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [openFilter, setOpenFilter] = useState(null);

  // Dropdown data
  const [departments, setDepartments] = useState([]);

  // Modal
  const [showModal, setShowModal] = useState(false);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const activeFilterCount = [statusFilter, departmentFilter].filter(Boolean).length;

  // ── Fetch jobs ─────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.listJobs(orgSlug, {
        page: params.page || page,
        search: params.search !== undefined ? params.search : search,
        status: params.status !== undefined ? params.status : statusFilter,
        department: params.department !== undefined ? params.department : departmentFilter,
      });
      if (res.success) {
        setJobs(res.jobs || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);

        // Build departments list from job data
        const deptSet = new Set();
        (res.jobs || []).forEach((j) => { if (j.department) deptSet.add(j.department); });
        // Also merge with any pre-existing departments
        setDepartments((prev) => {
          const all = new Set([...prev, ...deptSet]);
          return [...all].sort();
        });
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
      showToast('Failed to load job positions', 'error');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, search, statusFilter, departmentFilter, showToast]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchJobs({ search: value, page: 1 });
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFilterSelect = (setter) => (val) => {
    setter(val);
    setPage(1);
    setOpenFilter(null);
  };

  const clearAllFilters = () => {
    setStatusFilter('');
    setDepartmentFilter('');
    setPage(1);
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

  // Filter options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'open', label: 'Open' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'closed', label: 'Closed' },
  ];

  const departmentOptions = [
    { value: '', label: 'All Departments' },
    ...departments.map((d) => ({ value: d, label: d })),
  ];

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
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary flex items-center gap-2 self-start"
          >
            <Plus size={16} />
            New Job
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search by position name, department, or client..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="input-field w-full pl-10"
          aria-label="Search job positions"
        />
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Status"
          value={statusFilter}
          options={statusOptions}
          isOpen={openFilter === 'status'}
          onToggle={() => toggleFilter('status')}
          onSelect={handleFilterSelect(setStatusFilter)}
        />
        <FilterChip
          label="Department"
          value={departmentFilter}
          options={departmentOptions}
          isOpen={openFilter === 'department'}
          onToggle={() => toggleFilter('department')}
          onSelect={handleFilterSelect(setDepartmentFilter)}
        />

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-dark-400 hover:text-white transition-colors rounded-lg hover:bg-dark-800"
          >
            <X className="w-3.5 h-3.5" />
            Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ''}
          </button>
        )}
      </div>

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
            {search || statusFilter || departmentFilter
              ? 'Try adjusting your search or filters.'
              : 'Create your first job position to start recruiting.'}
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
                  {jobs.map((job) => (
                    <tr
                      key={job._id}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-dark-400 text-sm">
                Showing {pageStart}\u2013{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
