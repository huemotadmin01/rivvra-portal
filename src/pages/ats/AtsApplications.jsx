import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Search, Plus, Loader2, Users,
  ChevronLeft, ChevronRight, ChevronDown, X,
  Star, Mail, Calendar,
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

/* ── Stage badge helper ──────────────────────────────────────────────── */
function StageBadge({ stage, stageName }) {
  // Assign colors based on stage order or name
  const colors = [
    'bg-blue-500/10 text-blue-400',
    'bg-purple-500/10 text-purple-400',
    'bg-amber-500/10 text-amber-400',
    'bg-emerald-500/10 text-emerald-400',
    'bg-pink-500/10 text-pink-400',
    'bg-cyan-500/10 text-cyan-400',
    'bg-orange-500/10 text-orange-400',
  ];

  // Use stage order or hash the name for consistent color
  const name = stageName || stage?.name || 'Unknown';
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colorClass = colors[hash % colors.length];

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {name}
    </span>
  );
}

/* ── Evaluation Stars (read-only) ─────────────────────────────────────── */
function EvalStars({ value = 0, max = 3 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
        />
      ))}
    </div>
  );
}

/* ── New Application Modal ────────────────────────────────────────────── */
const EMPTY_APP = {
  candidateName: '',
  candidateEmail: '',
  candidatePhone: '',
  linkedinProfile: '',
  jobId: '',
  stageId: '',
  recruiter: '',
  employmentType: '',
  source: '',
  evaluation: 0,
};

function NewApplicationModal({ show, onClose, onSaved, orgSlug, jobs, stages, recruiters }) {
  const modalRef = useRef(null);
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_APP);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setForm({
        ...EMPTY_APP,
        stageId: stages.length > 0 ? stages[0]._id : '',
      });
      setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
    }
  }, [show, stages]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEvalChange = (val) => {
    setForm((prev) => ({ ...prev, evaluation: val === prev.evaluation ? 0 : val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.candidateName.trim()) return;

    try {
      setSaving(true);
      const payload = {
        candidateName: form.candidateName.trim(),
        email: form.candidateEmail.trim(),
        phone: form.candidatePhone.trim(),
        linkedinProfile: form.linkedinProfile.trim(),
        jobPositionId: form.jobId || undefined,
        stageId: form.stageId || undefined,
        recruiterId: form.recruiter || undefined,
        employmentType: form.employmentType.trim(),
        source: form.source.trim(),
        evaluation: form.evaluation,
      };
      const res = await atsApi.createApplication(orgSlug, payload);
      if (res.success) {
        showToast('Application created');
        onSaved();
        onClose();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create application', 'error');
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
        aria-labelledby="app-modal-title"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg my-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="app-modal-title" className="text-lg font-semibold text-white">
            New Application
          </h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Candidate Name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Candidate Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.candidateName}
              onChange={(e) => handleChange('candidateName', e.target.value)}
              placeholder="e.g. John Doe"
              className="input-field"
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Email</label>
              <input
                type="email"
                value={form.candidateEmail}
                onChange={(e) => handleChange('candidateEmail', e.target.value)}
                placeholder="john@example.com"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
              <input
                type="text"
                value={form.candidatePhone}
                onChange={(e) => handleChange('candidatePhone', e.target.value)}
                placeholder="+1 555-0100"
                className="input-field"
              />
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">LinkedIn Profile</label>
            <input
              type="url"
              value={form.linkedinProfile}
              onChange={(e) => handleChange('linkedinProfile', e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="input-field"
            />
          </div>

          {/* Job Position & Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Job Position</label>
              <select
                value={form.jobId}
                onChange={(e) => handleChange('jobId', e.target.value)}
                className="input-field"
              >
                <option value="">Select position...</option>
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>{j.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Stage</label>
              <select
                value={form.stageId}
                onChange={(e) => handleChange('stageId', e.target.value)}
                className="input-field"
              >
                {stages.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recruiter & Employment Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Recruiter</label>
              <select
                value={form.recruiter}
                onChange={(e) => handleChange('recruiter', e.target.value)}
                className="input-field"
              >
                <option value="">Select recruiter...</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name}</option>
                ))}
              </select>
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

          {/* Source & Evaluation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Source</label>
              <input
                type="text"
                value={form.source}
                onChange={(e) => handleChange('source', e.target.value)}
                placeholder="e.g. LinkedIn, Referral"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Evaluation</label>
              <div className="flex items-center gap-1 h-[42px]">
                {[1, 2, 3].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleEvalChange(v)}
                    className="cursor-pointer"
                  >
                    <Star
                      size={16}
                      className={v <= form.evaluation ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
                    />
                  </button>
                ))}
              </div>
            </div>
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
              Create Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsApplications() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [openFilter, setOpenFilter] = useState(null);

  // Dropdown data
  const [jobs, setJobs] = useState([]);
  const [stages, setStages] = useState([]);
  const [recruiters, setRecruiters] = useState([]);

  // Modal
  const [showModal, setShowModal] = useState(false);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const activeFilterCount = [stageFilter, jobFilter, recruiterFilter].filter(Boolean).length;

  // ── Fetch applications ─────────────────────────────────────────────────
  const fetchApplications = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.listApplications(orgSlug, {
        page: params.page || page,
        limit: 25,
        search: params.search !== undefined ? params.search : search,
        stageId: params.stageId !== undefined ? params.stageId : stageFilter,
        jobId: params.jobId !== undefined ? params.jobId : jobFilter,
        recruiter: params.recruiter !== undefined ? params.recruiter : recruiterFilter,
        sort: 'appliedOn',
        order: 'desc',
      });
      if (res.success) {
        setApplications(res.applications || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
      showToast('Failed to load applications', 'error');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, search, stageFilter, jobFilter, recruiterFilter, showToast]);

  // ── Fetch dropdown data ────────────────────────────────────────────────
  const fetchDropdowns = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const [jobsRes, stagesRes, recruitersRes] = await Promise.all([
        atsApi.listJobs(orgSlug, { limit: 200 }),
        atsApi.listStages(orgSlug),
        atsApi.listRecruiters(orgSlug),
      ]);
      if (jobsRes.success) setJobs(jobsRes.jobs || []);
      if (stagesRes.success) setStages(stagesRes.stages || []);
      if (recruitersRes.success) setRecruiters(recruitersRes.recruiters || recruitersRes.members || []);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
  }, [orgSlug]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchApplications({ search: value, page: 1 });
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
    setStageFilter('');
    setJobFilter('');
    setRecruiterFilter('');
    setPage(1);
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

  // Build filter options
  const stageOptions = [
    { value: '', label: 'All Stages' },
    ...stages.map((s) => ({ value: s._id, label: s.name })),
  ];

  const jobOptions = [
    { value: '', label: 'All Positions' },
    ...jobs.map((j) => ({ value: j._id, label: j.name })),
  ];

  const recruiterOptions = [
    { value: '', label: 'All Recruiters' },
    ...recruiters.map((r) => ({ value: r._id, label: r.name })),
  ];

  // Pagination
  const pageStart = total === 0 ? 0 : (page - 1) * 25 + 1;
  const pageEnd = Math.min(page * 25, total);

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
          <h1 className="text-2xl font-bold text-white">All Applications</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'application' : 'applications'} total
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary flex items-center gap-2 self-start"
          >
            <Plus size={16} />
            New Application
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search by candidate name, email, or job position..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="input-field w-full pl-10"
          aria-label="Search applications"
        />
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Stage"
          value={stageFilter}
          options={stageOptions}
          isOpen={openFilter === 'stage'}
          onToggle={() => toggleFilter('stage')}
          onSelect={handleFilterSelect(setStageFilter)}
        />
        <FilterChip
          label="Job Position"
          value={jobFilter}
          options={jobOptions}
          isOpen={openFilter === 'job'}
          onToggle={() => toggleFilter('job')}
          onSelect={handleFilterSelect(setJobFilter)}
        />
        <FilterChip
          label="Recruiter"
          value={recruiterFilter}
          options={recruiterOptions}
          isOpen={openFilter === 'recruiter'}
          onToggle={() => toggleFilter('recruiter')}
          onSelect={handleFilterSelect(setRecruiterFilter)}
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
      ) : applications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No applications found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {search || stageFilter || jobFilter || recruiterFilter
              ? 'Try adjusting your search or filters.'
              : 'Create your first application or use the Pipeline view to add candidates.'}
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
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Candidate</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Job Position</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Stage</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Evaluation</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Applied</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">L1 Feedback</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">L2 Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr
                      key={app._id}
                      onClick={() => navigate(orgPath(`/ats/applications/${app._id}`))}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      {/* Candidate */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-rivvra-400 text-xs font-semibold">
                              {(app.candidateName || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{app.candidateName || 'Unnamed'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        <span className="truncate block max-w-[180px]">
                          {app.candidateEmail || '\u2014'}
                        </span>
                      </td>

                      {/* Job Position */}
                      <td className="px-4 py-3 text-dark-300 hidden sm:table-cell">
                        {app.jobName || app.jobId?.name || '\u2014'}
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-3">
                        <StageBadge stageName={app.stageName || app.stageId?.name} />
                      </td>

                      {/* Recruiter */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {app.recruiterName || '\u2014'}
                      </td>

                      {/* Evaluation */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex justify-center">
                          <EvalStars value={app.evaluation || 0} />
                        </div>
                      </td>

                      {/* Applied */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        {formatDate(app.appliedOn)}
                      </td>

                      {/* L1 Feedback */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        <span className="truncate block max-w-[120px]">
                          {app.l1Feedback || '\u2014'}
                        </span>
                      </td>

                      {/* L2 Feedback */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        <span className="truncate block max-w-[120px]">
                          {app.l2Feedback || '\u2014'}
                        </span>
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

      {/* New Application Modal */}
      <NewApplicationModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => fetchApplications({ page: 1 })}
        orgSlug={orgSlug}
        jobs={jobs}
        stages={stages}
        recruiters={recruiters}
      />
    </div>
  );
}
