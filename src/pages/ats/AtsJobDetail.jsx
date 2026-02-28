import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  ArrowLeft, Loader2, Star, ChevronDown, X,
  Edit3, Check, Briefcase, Users, Calendar,
  DollarSign, MapPin, Shield, UserCheck,
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
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Unknown'}
    </span>
  );
}

/* ── Approval status badge helper ─────────────────────────────────────── */
function ApprovalBadge({ status }) {
  const styles = {
    pending: 'bg-amber-500/10 text-amber-400',
    approved: 'bg-emerald-500/10 text-emerald-400',
    rejected: 'bg-red-500/10 text-red-400',
  };
  const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  const key = (status || '').toLowerCase();

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Not Set'}
    </span>
  );
}

/* ── Stage badge helper ──────────────────────────────────────────────── */
function StageBadge({ stageName }) {
  const colors = [
    'bg-blue-500/10 text-blue-400',
    'bg-purple-500/10 text-purple-400',
    'bg-amber-500/10 text-amber-400',
    'bg-emerald-500/10 text-emerald-400',
    'bg-pink-500/10 text-pink-400',
    'bg-cyan-500/10 text-cyan-400',
    'bg-orange-500/10 text-orange-400',
  ];
  const name = stageName || 'Unknown';
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

/* ── Change Status Dropdown ───────────────────────────────────────────── */
function ChangeStatusDropdown({ currentStatus, isOpen, onToggle, onSelect }) {
  const statuses = [
    { value: 'open', label: 'Open' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'closed', label: 'Closed' },
  ];

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200"
      >
        Change Status
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-1.5 min-w-[150px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20">
            {statuses
              .filter((s) => s.value !== currentStatus)
              .map((s) => (
                <button
                  key={s.value}
                  onClick={() => onSelect(s.value)}
                  className="w-full text-left px-3 py-2 text-sm text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
                >
                  {s.label}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Mini Pipeline (stage counts) ─────────────────────────────────────── */
function MiniPipeline({ stageCounts }) {
  if (!stageCounts || stageCounts.length === 0) return null;

  const maxCount = Math.max(...stageCounts.map((s) => s.count), 1);

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-4">
        Applications by Stage
      </h2>
      <div className="space-y-3">
        {stageCounts.map((s) => (
          <div key={s.stageId || s.name} className="flex items-center gap-3">
            <span className="text-dark-300 text-sm w-28 truncate flex-shrink-0">{s.name}</span>
            <div className="flex-1 h-6 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-rivvra-500/30 rounded-full flex items-center justify-end pr-2 transition-all"
                style={{ width: `${Math.max((s.count / maxCount) * 100, 8)}%` }}
              >
                <span className="text-xs font-medium text-rivvra-400">{s.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Enum option constants ────────────────────────────────────────────── */
const EXPERIENCE_OPTIONS = [
  '0-2 Years', '2-5 Years', '5-8 Years', '8-11 Years', '11-14 Years', '14+ Years',
];

const HIRING_MODE_OPTIONS = [
  'C2C', 'C2H', 'Full-time Hire', 'C2C or Full-time Hire',
];

const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsJobDetail() {
  const { jobId } = useParams();
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Recruiters list for user dropdowns
  const [recruiters, setRecruiters] = useState([]);

  // Applications for this job
  const [applications, setApplications] = useState([]);
  const [appsTotal, setAppsTotal] = useState(0);
  const [appsPage, setAppsPage] = useState(1);
  const [appsTotalPages, setAppsTotalPages] = useState(1);
  const [appsLoading, setAppsLoading] = useState(false);

  // Stage counts for mini pipeline
  const [stageCounts, setStageCounts] = useState([]);

  // UI
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  // ── Fetch recruiters for dropdowns ──────────────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    atsApi.listRecruiters(orgSlug)
      .then((res) => {
        if (res.success) setRecruiters(res.recruiters || []);
      })
      .catch((err) => console.error('Failed to load recruiters:', err));
  }, [orgSlug]);

  // ── Fetch job ──────────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    setLoading(true);
    try {
      const res = await atsApi.getJob(orgSlug, jobId);
      if (res.success) {
        setJob(res.job);
        setEditForm(res.job);
        // If the API returns stage counts, use them
        if (res.stageCounts) setStageCounts(res.stageCounts);
      }
    } catch (err) {
      console.error('Failed to load job:', err);
      showToast('Failed to load job position', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId, showToast]);

  // ── Fetch applications for this job ────────────────────────────────────
  const fetchApplications = useCallback(async (params = {}) => {
    if (!orgSlug || !jobId) return;
    setAppsLoading(true);
    try {
      const res = await atsApi.listApplications(orgSlug, {
        jobId,
        page: params.page || appsPage,
        limit: 15,
        sort: 'appliedOn',
        order: 'desc',
      });
      if (res.success) {
        setApplications(res.applications || []);
        setAppsTotal(res.total || 0);
        setAppsTotalPages(res.totalPages || 1);

        // Build stage counts from applications if not provided by getJob
        if (stageCounts.length === 0) {
          const counts = {};
          (res.applications || []).forEach((app) => {
            const name = app.stageName || app.stageId?.name || 'Unknown';
            const id = app.stageId?._id || app.stageId || name;
            if (!counts[id]) counts[id] = { stageId: id, name, count: 0 };
            counts[id].count++;
          });
          setStageCounts(Object.values(counts));
        }
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [orgSlug, jobId, appsPage, stageCounts.length]);

  useEffect(() => { fetchJob(); }, [fetchJob]);
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleChangeStatus = async (status) => {
    setShowStatusDropdown(false);
    try {
      setSaving(true);
      await atsApi.changeJobStatus(orgSlug, jobId, status);
      showToast('Status updated');
      fetchJob();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      const payload = {
        name: editForm.name?.trim(),
        department: editForm.department?.trim(),
        description: editForm.description?.trim(),
        requirements: editForm.requirements?.trim(),
        recruiter: editForm.recruiter?.trim(),
        client: editForm.client?.trim(),
        expectedHires: Number(editForm.expectedHires) || 1,
        employmentType: editForm.employmentType?.trim(),
        location: editForm.location?.trim(),
        // New fields
        requiredExperience: editForm.requiredExperience || '',
        approvalStatus: editForm.approvalStatus || '',
        approverId: editForm.approverId || '',
        clientBudget: editForm.clientBudget !== '' && editForm.clientBudget != null ? Number(editForm.clientBudget) : null,
        maxBudget: editForm.maxBudget !== '' && editForm.maxBudget != null ? Number(editForm.maxBudget) : null,
        hiringMode: editForm.hiringMode || '',
        accountOwnerId: editForm.accountOwnerId || '',
        accountManagerId: editForm.accountManagerId || '',
      };
      const res = await atsApi.updateJob(orgSlug, jobId, payload);
      if (res.success) {
        showToast('Job position updated');
        setEditing(false);
        fetchJob();
      }
    } catch (err) {
      showToast(err.message || 'Failed to update job position', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (val) => {
    if (val == null || val === '') return '\u2014';
    return `$${Number(val).toLocaleString()}`;
  };

  /** Resolve a recruiter/user ID to a display name from the recruiters list */
  const resolveUserName = (userId, fallbackName) => {
    if (fallbackName) return fallbackName;
    if (!userId) return '\u2014';
    const user = recruiters.find((r) => r._id === userId);
    return user ? user.name : '\u2014';
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 md:p-8">
        <button
          onClick={() => navigate(orgPath('/ats/jobs'))}
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to Job Positions
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <h3 className="text-lg font-semibold text-white mb-2">Job position not found</h3>
          <p className="text-dark-400 text-sm">The position may have been deleted or you don't have access.</p>
        </div>
      </div>
    );
  }

  const statusKey = (job.status || '').toLowerCase().replace(/\s+/g, '_');

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => navigate(orgPath('/ats/jobs'))}
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back to Job Positions
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">{job.name}</h1>
              <StatusBadge status={job.status} />
              {job.approvalStatus && <ApprovalBadge status={job.approvalStatus} />}
            </div>
            <p className="text-dark-400 text-sm">
              {job.department || 'No department'}{job.location ? ` \u00B7 ${job.location}` : ''}
            </p>
          </div>

          {/* Action buttons */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <ChangeStatusDropdown
                currentStatus={statusKey}
                isOpen={showStatusDropdown}
                onToggle={() => setShowStatusDropdown((p) => !p)}
                onSelect={handleChangeStatus}
              />
              <button
                onClick={() => {
                  if (editing) {
                    handleSaveEdit();
                  } else {
                    setEditing(true);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200"
              >
                {editing ? (
                  <>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save
                  </>
                ) : (
                  <>
                    <Edit3 size={14} />
                    Edit
                  </>
                )}
              </button>
              {editing && (
                <button
                  onClick={() => { setEditing(false); setEditForm(job); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-400 hover:text-white"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Job info card */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-4">
          Job Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-dark-500 text-xs mb-1">Position Name</p>
            {editing ? (
              <input
                type="text"
                value={editForm.name || ''}
                onChange={(e) => handleEditChange('name', e.target.value)}
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.name || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Department</p>
            {editing ? (
              <input
                type="text"
                value={editForm.department || ''}
                onChange={(e) => handleEditChange('department', e.target.value)}
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.department || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Employment Type</p>
            {editing ? (
              <input
                type="text"
                value={editForm.employmentType || ''}
                onChange={(e) => handleEditChange('employmentType', e.target.value)}
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.employmentType || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Recruiter</p>
            {editing ? (
              <input
                type="text"
                value={editForm.recruiter || ''}
                onChange={(e) => handleEditChange('recruiter', e.target.value)}
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.recruiterName || job.recruiter || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Client</p>
            {editing ? (
              <input
                type="text"
                value={editForm.client || ''}
                onChange={(e) => handleEditChange('client', e.target.value)}
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.client || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Expected Hires</p>
            {editing ? (
              <input
                type="number"
                value={editForm.expectedHires || 1}
                onChange={(e) => handleEditChange('expectedHires', e.target.value)}
                min="1"
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.expectedHires ?? '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Hired</p>
            <p className="text-white text-sm">{job.hiredCount ?? 0}</p>
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Created</p>
            <p className="text-white text-sm">{formatDate(job.createdAt)}</p>
          </div>
        </div>

        {/* Description */}
        <div className="mt-5 pt-5 border-t border-dark-700">
          <p className="text-dark-500 text-xs mb-1">Description</p>
          {editing ? (
            <textarea
              value={editForm.description || ''}
              onChange={(e) => handleEditChange('description', e.target.value)}
              rows={4}
              className="input-field resize-none text-sm"
            />
          ) : (
            <p className="text-dark-300 text-sm whitespace-pre-wrap">
              {job.description || 'No description provided.'}
            </p>
          )}
        </div>

        {/* Requirements */}
        <div className="mt-4">
          <p className="text-dark-500 text-xs mb-1">Requirements</p>
          {editing ? (
            <textarea
              value={editForm.requirements || ''}
              onChange={(e) => handleEditChange('requirements', e.target.value)}
              rows={4}
              className="input-field resize-none text-sm"
            />
          ) : (
            <p className="text-dark-300 text-sm whitespace-pre-wrap">
              {job.requirements || 'No requirements listed.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Staffing Details ──────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase size={14} className="text-dark-400" />
          <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider">
            Staffing Details
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-dark-500 text-xs mb-1">Required Experience</p>
            {editing ? (
              <select
                value={editForm.requiredExperience || ''}
                onChange={(e) => handleEditChange('requiredExperience', e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <p className="text-white text-sm">{job.requiredExperience || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Hiring Mode</p>
            {editing ? (
              <select
                value={editForm.hiringMode || ''}
                onChange={(e) => handleEditChange('hiringMode', e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                {HIRING_MODE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <p className="text-white text-sm">{job.hiringMode || '\u2014'}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Location</p>
            {editing ? (
              <input
                type="text"
                value={editForm.location || ''}
                onChange={(e) => handleEditChange('location', e.target.value)}
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{job.location || '\u2014'}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Financial ─────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={14} className="text-dark-400" />
          <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider">
            Financial
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-dark-500 text-xs mb-1">Client Budget</p>
            {editing ? (
              <input
                type="number"
                value={editForm.clientBudget ?? ''}
                onChange={(e) => handleEditChange('clientBudget', e.target.value)}
                min="0"
                placeholder="0"
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{formatCurrency(job.clientBudget)}</p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Max Budget</p>
            {editing ? (
              <input
                type="number"
                value={editForm.maxBudget ?? ''}
                onChange={(e) => handleEditChange('maxBudget', e.target.value)}
                min="0"
                placeholder="0"
                className="input-field text-sm"
              />
            ) : (
              <p className="text-white text-sm">{formatCurrency(job.maxBudget)}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── People ────────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck size={14} className="text-dark-400" />
          <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider">
            People
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-dark-500 text-xs mb-1">Account Owner</p>
            {editing ? (
              <select
                value={editForm.accountOwnerId || ''}
                onChange={(e) => handleEditChange('accountOwnerId', e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-white text-sm">
                {resolveUserName(job.accountOwnerId, job.accountOwnerName)}
              </p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Account Manager</p>
            {editing ? (
              <select
                value={editForm.accountManagerId || ''}
                onChange={(e) => handleEditChange('accountManagerId', e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-white text-sm">
                {resolveUserName(job.accountManagerId, job.accountManagerName)}
              </p>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Approver</p>
            {editing ? (
              <select
                value={editForm.approverId || ''}
                onChange={(e) => handleEditChange('approverId', e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                {recruiters.map((r) => (
                  <option key={r._id} value={r._id}>{r.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-white text-sm">
                {resolveUserName(job.approverId, job.approverName)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Approval ──────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={14} className="text-dark-400" />
          <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider">
            Approval
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-dark-500 text-xs mb-1">Approval Status</p>
            {editing ? (
              <select
                value={editForm.approvalStatus || ''}
                onChange={(e) => handleEditChange('approvalStatus', e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                {APPROVAL_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div className="pt-0.5">
                <ApprovalBadge status={job.approvalStatus} />
              </div>
            )}
          </div>
          <div>
            <p className="text-dark-500 text-xs mb-1">Approver</p>
            <p className="text-white text-sm">
              {resolveUserName(job.approverId, job.approverName)}
            </p>
          </div>
        </div>
      </div>

      {/* Mini Pipeline */}
      <MiniPipeline stageCounts={stageCounts} />

      {/* Applications table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Applications
            <span className="ml-2 text-dark-400 text-sm font-normal">({appsTotal})</span>
          </h2>
        </div>

        {appsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
          </div>
        ) : applications.length === 0 ? (
          <div className="card p-8 flex flex-col items-center justify-center">
            <Users className="w-8 h-8 text-dark-500 mb-2" />
            <p className="text-dark-400 text-sm">No applications for this position yet.</p>
          </div>
        ) : (
          <>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-700">
                      <th className="text-left px-4 py-3 text-dark-400 font-medium">Candidate</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium">Stage</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                      <th className="text-center px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Evaluation</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr
                        key={app._id}
                        onClick={() => navigate(orgPath(`/ats/applications/${app._id}`))}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-rivvra-400 text-xs font-semibold">
                                {(app.candidateName || '?')[0].toUpperCase()}
                              </span>
                            </div>
                            <p className="text-white font-medium truncate">{app.candidateName || 'Unnamed'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                          <span className="truncate block max-w-[180px]">{app.candidateEmail || '\u2014'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StageBadge stageName={app.stageName || app.stageId?.name} />
                        </td>
                        <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                          {app.recruiterName || '\u2014'}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex justify-center">
                            <EvalStars value={app.evaluation || 0} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                          {formatDate(app.appliedOn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {appsTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-dark-400 text-sm">
                  Showing {appsTotal === 0 ? 0 : (appsPage - 1) * 15 + 1}\u2013{Math.min(appsPage * 15, appsTotal)} of {appsTotal}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAppsPage((p) => Math.max(1, p - 1))}
                    disabled={appsPage === 1}
                    className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown size={16} className="rotate-90" />
                  </button>

                  {Array.from({ length: appsTotalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === appsTotalPages || Math.abs(p - appsPage) <= 1)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`dots-${i}`} className="px-2 text-dark-500 text-sm">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setAppsPage(p)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                            p === appsPage
                              ? 'bg-rivvra-500 text-dark-950'
                              : 'text-dark-400 hover:text-white hover:bg-dark-800'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}

                  <button
                    onClick={() => setAppsPage((p) => Math.min(appsTotalPages, p + 1))}
                    disabled={appsPage === appsTotalPages}
                    className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
