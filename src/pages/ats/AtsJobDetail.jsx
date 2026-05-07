import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import contactsApi from '../../utils/contactsApi';
import ComboSelect from '../../components/ComboSelect';
import { usePageTitle } from '../../hooks/usePageTitle';
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import SectionCard from '../../components/platform/detail/SectionCard';
import {
  Loader2, Star, ChevronDown,
  Briefcase, Users, FileText, Tag, Globe,
  DollarSign, MapPin, Shield, UserCheck, Trash2, Archive, ArchiveRestore, MoreHorizontal,
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
            {statuses.filter((s) => s.value !== currentStatus).map((s) => (
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
    <SectionCard title="Applications by Stage" icon={Users}>
      <div className="space-y-3 pt-1">
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
    </SectionCard>
  );
}

/* ── Enum option constants (InlineField select shape) ─────────────────── */
const EXPERIENCE_OPTIONS = ['0-2 Years', '2-5 Years', '5-8 Years', '8-11 Years', '11-14 Years', '14+ Years']
  .map((v) => ({ value: v, label: v }));

const HIRING_MODE_OPTIONS = ['C2C', 'C2H', 'Full-time Hire', 'C2C or Full-time Hire']
  .map((v) => ({ value: v, label: v }));

const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (val) => {
  if (val == null || val === '') return null;
  return `$${Number(val).toLocaleString()}`;
};

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsJobDetail() {
  const { jobId } = useParams();
  const { currentOrg, getAppRole, isOrgAdmin } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  usePageTitle(job?.name);
  const [loading, setLoading] = useState(true);

  const [recruiters, setRecruiters] = useState([]);
  const [companyContacts, setCompanyContacts] = useState([]);
  const [editingClient, setEditingClient] = useState(false);

  // Applications for this job
  const [applications, setApplications] = useState([]);
  const [appsTotal, setAppsTotal] = useState(0);
  const [appsPage, setAppsPage] = useState(1);
  const [appsTotalPages, setAppsTotalPages] = useState(1);
  const [appsLoading, setAppsLoading] = useState(false);

  const [stageCounts, setStageCounts] = useState([]);

  // UI / modal state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;
  const canEdit = isAdmin && !job?.archived;

  // ── Fetch recruiters for user-pickers ─────────────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    atsApi.listRecruiters(orgSlug)
      .then((res) => { if (res.success) setRecruiters(res.recruiters || []); })
      .catch((err) => console.error('Failed to load recruiters:', err));
  }, [orgSlug]);

  // ── Fetch company contacts for client lookup ─────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    contactsApi.listCompanies(orgSlug)
      .then((res) => { if (res.success) setCompanyContacts(res.companies || []); })
      .catch(() => {});
  }, [orgSlug]);

  // Save client picker selection — writes both clientContactId + clientName
  // so the page label stays in sync with the linked contact.
  const handleClientSelect = async (id, name) => {
    setEditingClient(false);
    if (!id && !name) return;
    try {
      await atsApi.updateJob(orgSlug, jobId, { clientContactId: id || null, clientName: name || '' });
      setJob((prev) => ({ ...prev, clientContactId: id || null, clientName: name || '' }));
    } catch (err) {
      showToast(err.message || 'Failed to update client', 'error');
    }
  };

  const recruiterOptions = useMemo(
    () => recruiters.map((r) => ({ value: r._id, label: r.name || r.email || r._id })),
    [recruiters]
  );

  // ── Fetch job ─────────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    setLoading(true);
    try {
      const res = await atsApi.getJob(orgSlug, jobId);
      if (res.success) {
        setJob(res.job);
        if (res.stageCounts) setStageCounts(res.stageCounts);
      }
    } catch (err) {
      console.error('Failed to load job:', err);
      showToast('Failed to load job position', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId, showToast]);

  // ── Fetch applications for this job ──────────────────────────────────
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

  // ── Generic inline-field save handler ─────────────────────────────────
  // Coerces numeric fields and validates ranges. Throws on error so
  // InlineField can flash a red status indicator on the row.
  const saveField = async (field, value) => {
    let coerced = value;
    if (field === 'expectedHires') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1) throw new Error('Must be at least 1');
      coerced = n;
    } else if (field === 'clientBudget' || field === 'maxBudget') {
      if (value === '' || value == null) {
        coerced = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Must be a positive number');
        coerced = n;
      }
    }
    const res = await atsApi.updateJob(orgSlug, jobId, { [field]: coerced });
    // updateJob returns { success, job } — use the server-echoed doc when
    // present so denormalized fields (e.g. recruiterName) refresh too.
    if (res?.job) {
      setJob(res.job);
    } else {
      setJob((prev) => ({ ...prev, [field]: coerced }));
    }
  };

  // ── Status / archive / delete handlers ────────────────────────────────
  const handleChangeStatus = async (status) => {
    setShowStatusDropdown(false);
    try {
      await atsApi.changeJobStatus(orgSlug, jobId, status);
      showToast('Status updated');
      fetchJob();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const openArchiveModal = async () => {
    setShowKebab(false);
    setShowArchiveModal(true);
    setArchivePreview(null);
    try {
      const res = await atsApi.archiveJobPreview(orgSlug, jobId);
      setArchivePreview(res || { dependencies: [] });
    } catch {
      setArchivePreview({ dependencies: [] });
    }
  };

  const handleArchiveJob = async (cascade = false) => {
    setArchiving(true);
    try {
      const res = await atsApi.archiveJob(orgSlug, jobId, { cascade });
      setShowArchiveModal(false);
      setJob((j) => ({ ...j, archived: true }));
      const cascadedCount = res?.cascadedAppCount || 0;
      showToast(
        cascade && cascadedCount > 0
          ? `Archived (with ${cascadedCount} application${cascadedCount === 1 ? '' : 's'})`
          : 'Archived',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Failed to archive job position', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchiveJob = async () => {
    try {
      await atsApi.unarchiveJob(orgSlug, jobId);
      setJob((j) => ({ ...j, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive job position', 'error');
    }
  };

  const handleDeleteJob = async () => {
    setDeleting(true);
    try {
      await atsApi.deleteJob(orgSlug, jobId);
      showToast('Job position deleted', 'success');
      navigate(orgPath('/ats/jobs'));
    } catch (err) {
      setDeleting(false);
      showToast(err.message || 'Failed to delete job position', 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{job.name}</h1>
            {job.archived && (
              <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                <Archive size={11} /> ARCHIVED
              </span>
            )}
            <StatusBadge status={job.status} />
            {job.approvalStatus && <ApprovalBadge status={job.approvalStatus} />}
          </div>
          <p className="text-dark-400 text-sm">
            {job.department || 'No department'}{job.location ? ` · ${job.location}` : ''}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {!job.archived && (
              <ChangeStatusDropdown
                currentStatus={statusKey}
                isOpen={showStatusDropdown}
                onToggle={() => setShowStatusDropdown((p) => !p)}
                onSelect={handleChangeStatus}
              />
            )}
            {job.archived ? (
              <button
                onClick={handleUnarchiveJob}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
              >
                <ArchiveRestore size={14} /> Unarchive
              </button>
            ) : (
              <button
                onClick={openArchiveModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all text-dark-300 border-transparent hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30"
              >
                <Archive size={14} /> Archive
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowKebab((o) => !o)}
                className="p-1.5 text-dark-500 hover:text-dark-300 rounded-lg hover:bg-dark-800"
                aria-label="More actions"
              >
                <MoreHorizontal size={16} />
              </button>
              {showKebab && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowKebab(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1">
                    {isOrgAdmin ? (
                      <button
                        onClick={() => { setShowKebab(false); setShowDeleteModal(true); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 size={12} />
                        <div className="flex-1">
                          <div className="font-medium">Delete permanently</div>
                          <div className="text-[10px] text-dark-500 mt-0.5">Cannot be recovered. Use Archive instead.</div>
                        </div>
                      </button>
                    ) : (
                      <div className="px-3 py-2 text-[11px] text-dark-500 italic">No admin actions available.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Body: main column + narrow sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Overview" icon={Briefcase}>
            <InlineField label="Position Name" field="name" value={job.name} editable={canEdit} onSave={saveField} required />
            <InlineField label="Department" field="department" value={job.department} editable={canEdit} onSave={saveField} placeholder="e.g. Engineering" />
            <InlineField label="Employment Type" field="employmentType" value={job.employmentType} editable={canEdit} onSave={saveField} placeholder="e.g. Permanent, Contract" />
            <InlineField label="Location" field="location" value={job.location} editable={canEdit} onSave={saveField} placeholder="Office / city" />
            <InlineField label="Expected Hires" field="expectedHires" value={job.expectedHires ?? 1} editable={canEdit} onSave={saveField} />
            <InlineField label="Hired" field="hiredCount" value={job.hiredCount ?? 0} editable={false} />
          </SectionCard>

          <SectionCard title="Description" icon={FileText}>
            <InlineField label="Description" field="description" value={job.description} type="textarea" editable={canEdit} onSave={saveField} placeholder="Internal role description" />
            <InlineField label="Requirements" field="requirements" value={job.requirements} type="textarea" editable={canEdit} onSave={saveField} placeholder="Must-have skills, certifications…" />
            <InlineField label="Process Details" field="processDetails" value={job.processDetails} type="textarea" editable={canEdit} onSave={saveField} placeholder="Recruiter-facing process notes (rounds, panels, screening…)" />
            <InlineField label="Public Description" field="websiteDescription" value={job.websiteDescription} type="textarea" editable={canEdit} onSave={saveField} placeholder="Candidate-facing description for the careers page" />
          </SectionCard>

          <SectionCard title="Staffing" icon={MapPin}>
            <InlineField label="Required Exp." field="requiredExperience" value={job.requiredExperience} type="select" options={EXPERIENCE_OPTIONS} editable={canEdit} onSave={saveField} />
            <InlineField label="Hiring Mode" field="hiringMode" value={job.hiringMode} type="select" options={HIRING_MODE_OPTIONS} editable={canEdit} onSave={saveField} />
            <InlineField label="Client Job Loc." field="clientJobLocation" value={job.clientJobLocation} editable={canEdit} onSave={saveField} placeholder="e.g. Remote, Bangalore on-site" />
            <InlineField label="Website URL" field="websiteUrl" value={job.websiteUrl} type="url" editable={canEdit} onSave={saveField} placeholder="https://…" />
          </SectionCard>

          <SectionCard title="Financial" icon={DollarSign}>
            <InlineField
              label="Client Budget"
              field="clientBudget"
              value={job.clientBudget}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={formatCurrency(job.clientBudget) || undefined}
            />
            <InlineField
              label="Max Budget"
              field="maxBudget"
              value={job.maxBudget}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={formatCurrency(job.maxBudget) || undefined}
            />
          </SectionCard>

          <SectionCard title="Approval" icon={Shield}>
            <InlineField
              label="Approval Status"
              field="approvalStatus"
              value={job.approvalStatus}
              type="select"
              options={APPROVAL_STATUS_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={job.approvalStatus ? <ApprovalBadge status={job.approvalStatus} /> : undefined}
            />
            <InlineField
              label="Approver Comment"
              field="approverComment"
              value={job.approverComment}
              type="textarea"
              editable={canEdit}
              onSave={saveField}
              placeholder="Approval notes…"
            />
          </SectionCard>

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
                              <span className="truncate block max-w-[180px]">{app.candidateEmail || '—'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <StageBadge stageName={app.stageName || app.stageId?.name} />
                            </td>
                            <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                              {app.recruiterName || '—'}
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
                      Showing {appsTotal === 0 ? 0 : (appsPage - 1) * 15 + 1}–{Math.min(appsPage * 15, appsTotal)} of {appsTotal}
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

        {/* Sidebar */}
        <div className="space-y-5">
          <SectionCard title="People" icon={UserCheck}>
            <InlineField
              label="Recruiter"
              field="recruiterId"
              value={job.recruiterId}
              type="select"
              options={recruiterOptions}
              editable={canEdit}
              onSave={saveField}
              displayValue={job.recruiterName || undefined}
            />
            <InlineField
              label="Account Owner"
              field="accountOwnerId"
              value={job.accountOwnerId}
              type="select"
              options={recruiterOptions}
              editable={canEdit}
              onSave={saveField}
              displayValue={job.accountOwnerName || undefined}
            />
            <InlineField
              label="Approver"
              field="approverId"
              value={job.approverId}
              type="select"
              options={recruiterOptions}
              editable={canEdit}
              onSave={saveField}
              displayValue={job.approverName || undefined}
            />
          </SectionCard>

          <SectionCard title="Client" icon={Tag}>
            <InlineField
              label="Client Role"
              field="isClientRole"
              value={!!job.isClientRole}
              type="toggle"
              editable={canEdit}
              onSave={saveField}
            />
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2 group items-start">
              <span className="text-dark-400 text-sm pt-1.5">Client Name</span>
              <div className="min-w-0">
                {editingClient && canEdit && job.isClientRole ? (
                  <ComboSelect
                    value={job.clientContactId || ''}
                    displayValue={job.clientName || ''}
                    options={companyContacts}
                    onChange={handleClientSelect}
                    placeholder="Search or type a company name…"
                  />
                ) : (
                  <div
                    className={`flex items-center gap-1.5 rounded px-1 -mx-1 min-h-[28px] ${canEdit && job.isClientRole ? 'cursor-pointer hover:bg-dark-800' : ''}`}
                    onClick={canEdit && job.isClientRole ? () => setEditingClient(true) : undefined}
                  >
                    <span className="text-white text-sm">
                      {job.clientName || (
                        <span className="text-dark-500 italic">
                          {job.isClientRole ? 'Search or type a company name…' : 'Toggle Client Role first'}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Visibility" icon={Globe}>
            <InlineField
              label="Published"
              field="published"
              value={!!job.published}
              type="toggle"
              editable={canEdit}
              onSave={saveField}
            />
            <p className="text-[11px] text-dark-500 mt-1 px-1">
              When on, the role appears on the public careers page.
            </p>
          </SectionCard>

          <SectionCard>
            <RecordMeta
              createdAt={job.createdAt}
              createdByName={job.createdByName}
              updatedAt={job.updatedAt}
              updatedByName={job.updatedByName}
            />
          </SectionCard>
        </div>
      </div>

      {/* Archive Confirmation Modal — soft cascade with explicit user choice */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <Archive size={16} /> Archive Job Position
            </h2>
            <p className="text-sm text-dark-400 mb-3">
              Archive <span className="text-white font-medium">{job.name}</span>? It will be hidden from list views but can be restored at any time.
            </p>
            {archivePreview === null ? (
              <div className="text-xs text-dark-500 mb-4 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking linked records…</div>
            ) : (archivePreview.activeApplications > 0 || archivePreview.linkedOpportunity) ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-300 font-medium mb-2">Linked records:</p>
                <ul className="space-y-1.5 text-xs text-dark-200">
                  {archivePreview.activeApplications > 0 && (
                    <li className="flex items-center gap-1.5">
                      <Users size={11} className="text-dark-500 flex-shrink-0" />
                      {archivePreview.activeApplications} active application{archivePreview.activeApplications === 1 ? '' : 's'}
                    </li>
                  )}
                  {archivePreview.linkedOpportunity && (
                    <li className="flex items-center gap-1.5">
                      <Briefcase size={11} className="text-dark-500 flex-shrink-0" />
                      <span className="flex-1 truncate">CRM opp: {archivePreview.linkedOpportunity.name}</span>
                      <span className="text-[10px] text-dark-500">won't be archived</span>
                    </li>
                  )}
                </ul>
                {archivePreview.activeApplications > 0 && (
                  <p className="text-[11px] text-dark-500 mt-2">Choose whether to archive the applications too.</p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleArchiveJob(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                Archive job only
              </button>
              {archivePreview?.activeApplications > 0 && (
                <button
                  onClick={() => handleArchiveJob(true)}
                  disabled={archiving}
                  className="w-full px-3 py-2 text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg hover:bg-amber-500/35 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive job + {archivePreview.activeApplications} application{archivePreview.activeApplications === 1 ? '' : 's'}
                </button>
              )}
              <button
                onClick={() => setShowArchiveModal(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete Job Position</h2>
            <p className="text-xs text-dark-400 mb-1">
              Are you sure you want to permanently delete <span className="text-dark-200 font-medium">{job.name}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">This action cannot be undone. Jobs with existing applications cannot be deleted.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteJob}
                disabled={deleting}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
