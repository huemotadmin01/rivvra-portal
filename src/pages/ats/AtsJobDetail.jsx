import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import contactsApi from '../../utils/contactsApi';
import ComboSelect from '../../components/ComboSelect';
import { usePageTitle } from '../../hooks/usePageTitle';
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import ActivityPanel from '../../components/shared/ActivityPanel';
import SectionCard from '../../components/platform/detail/SectionCard';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  Loader2, Star, ChevronDown, ExternalLink,
  Briefcase, Users, FileText, Tag, Globe, Plus,
  MapPin, UserCheck, Trash2, Archive, ArchiveRestore, MoreHorizontal,
  CheckCircle2, Clock, XCircle, Eye, EyeOff,
} from 'lucide-react';

/* ── Job-status pill ─────────────────────────────────────────────────────
 * Q7-B: status uses blue/amber/red so it doesn't visually collide with the
 * approval indicator (green check / amber clock / red X icon-text).
 */
function StatusBadge({ status }) {
  const styles = {
    open:    'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/20',
    on_hold: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20',
    closed:  'bg-zinc-500/10 text-zinc-300 ring-1 ring-zinc-500/20',
  };
  const labels = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Unknown'}
    </span>
  );
}

/* ── Approval indicator — icon + text, no full pill (Q7-B) ───────────── */
function ApprovalIndicator({ status }) {
  const key = (status || '').toLowerCase();
  if (!key) return null;
  const map = {
    approved: { Icon: CheckCircle2, color: 'text-emerald-400', label: 'Approved' },
    pending:  { Icon: Clock,        color: 'text-amber-400',   label: 'Pending'  },
    rejected: { Icon: XCircle,      color: 'text-red-400',     label: 'Rejected' },
  };
  const m = map[key];
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${m.color}`}>
      <m.Icon size={13} /> {m.label}
    </span>
  );
}

/* ── Stage badge (Applications table) ─────────────────────────────────── */
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

/* ── Description tabs (Q2-C: Internal | Public-facing) ───────────────── */
function DescriptionTabs({ internal, publicDesc, canEdit, onSave }) {
  const [tab, setTab] = useState('internal');
  return (
    <div>
      <div className="flex items-center gap-1 mb-3 border-b border-dark-700">
        {[
          { key: 'internal', label: 'Internal' },
          { key: 'public',   label: 'Public-facing' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'text-white border-rivvra-500'
                : 'text-dark-400 border-transparent hover:text-dark-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'internal' ? (
        <DescriptionBody
          field="description"
          value={internal}
          canEdit={canEdit}
          onSave={onSave}
          placeholder="Internal role description (recruiters only)"
        />
      ) : (
        <DescriptionBody
          field="websiteDescription"
          value={publicDesc}
          canEdit={canEdit}
          onSave={onSave}
          placeholder="Candidate-facing description for the public careers page"
        />
      )}
    </div>
  );
}

/* ── DescriptionBody — read-mode renders bullets/newlines properly,
 *   click-to-edit swaps in a textarea. The Odoo import dumps `•` bullets
 *   as inline characters; whitespace-pre-line + a regex split keeps them
 *   readable without paying for a full markdown parser.
 */
function DescriptionBody({ field, value, canEdit, onSave, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value || ''); }, [value]);

  const handleSave = async () => {
    if ((draft || '') === (value || '')) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(field, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          autoFocus
          placeholder={placeholder}
          className="w-full bg-dark-900 border border-dark-600 rounded px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none resize-y"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setDraft(value || ''); setEditing(false); }}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-dark-300 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div
        onClick={canEdit ? () => setEditing(true) : undefined}
        className={`text-sm text-dark-500 italic ${canEdit ? 'cursor-pointer hover:text-dark-300' : ''}`}
      >
        {canEdit ? `Click to add ${placeholder.toLowerCase()}` : '—'}
      </div>
    );
  }

  // Render: bullets + newlines preserved. Lines starting with `•` get a
  // hanging-indent so multi-line bullets wrap nicely.
  const lines = String(value).split(/\r?\n|(?<=\.)\s+(?=•)/g);
  return (
    <div
      onClick={canEdit ? () => setEditing(true) : undefined}
      className={`text-sm text-dark-200 leading-relaxed space-y-1.5 ${canEdit ? 'cursor-text hover:bg-dark-800/40 -mx-2 px-2 py-1 rounded' : ''}`}
    >
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('•')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-rivvra-400 flex-shrink-0">•</span>
              <span className="flex-1">{trimmed.slice(1).trim()}</span>
            </div>
          );
        }
        return <p key={i} className="whitespace-pre-line">{trimmed}</p>;
      })}
    </div>
  );
}

/* ── Optional InlineField wrapper — hides empty fields in display mode
 *   when `hideWhenEmpty` is true (Q15-C). Lets the page show a single
 *   "Show empty fields" toggle to reveal them on demand.
 */
function MaybeInlineField({ hideWhenEmpty, value, ...props }) {
  if (hideWhenEmpty && (value == null || value === '')) return null;
  return <InlineField {...props} value={value} />;
}

/* ── Hiring-mode tooltip helper (Q11-B: keep abbrev, tooltip with full form) */
const HIRING_MODE_FULL = {
  'C2C':                  'Contract-to-Contract',
  'C2H':                  'Contract-to-Hire',
  'Full-time Hire':       'Full-time Hire',
  'C2C or Full-time Hire':'Contract-to-Contract or Full-time Hire',
};

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

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsJobDetail() {
  const { jobId } = useParams();
  const { currentOrg, getAppRole, isOrgAdmin } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const companyCurrency = currentCompany?.currency || 'INR';

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

  // UI / modal state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);

  // Q15-C: page-level "show empty fields" toggle
  const [showEmpty, setShowEmpty] = useState(false);
  // Q14-D: optional Approval comment expansion in Meta card
  const [showApprovalComment, setShowApprovalComment] = useState(false);

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

  // Resolve a recruiter id → portal-user id for profile links. The job
  // stores the recruiter as a recruiter._id which itself maps 1:1 to
  // portal_users._id (same id space) on this platform — but we keep the
  // resolution explicit so a future schema split doesn't silently break.
  const userIdFor = useCallback((recId) => {
    if (!recId) return null;
    const r = recruiters.find((x) => String(x._id) === String(recId));
    return r?.userId || r?._id || null;
  }, [recruiters]);

  // ── Fetch job ─────────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    setLoading(true);
    try {
      const res = await atsApi.getJob(orgSlug, jobId);
      if (res.success) setJob(res.job);
    } catch (err) {
      console.error('Failed to load job:', err);
      showToast('Failed to load job position', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId, showToast]);

  // ── Fetch applications for this job ──────────────────────────────────
  const fetchApplications = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    setAppsLoading(true);
    try {
      const res = await atsApi.listApplications(orgSlug, {
        jobId,
        page: appsPage,
        limit: 15,
        sort: 'appliedOn',
        order: 'desc',
      });
      if (res.success) {
        setApplications(res.applications || []);
        setAppsTotal(res.total || 0);
        setAppsTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [orgSlug, jobId, appsPage]);

  useEffect(() => { fetchJob(); }, [fetchJob]);
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // ── Generic inline-field save handler ─────────────────────────────────
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
    if (res?.job) setJob(res.job);
    else setJob((prev) => ({ ...prev, [field]: coerced }));
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
  const fmtBudget = (v) => (v == null || v === '' ? null : formatCurrency(v, companyCurrency));
  const hiringModeFull = HIRING_MODE_FULL[job.hiringMode] || job.hiringMode;
  const requiredExpDisplay = job.requiredExperience || null;

  // Q9-A: row click handler — guard against link-cell propagation.
  const openApp = (appId) => navigate(orgPath(`/ats/applications/${appId}`));

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate">{job.name}</h1>
            {job.archived && (
              <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                <Archive size={11} /> ARCHIVED
              </span>
            )}
            <StatusBadge status={job.status} />
            <ApprovalIndicator status={job.approvalStatus} />
          </div>
          {/* Q6-B: department dropped from header subtitle (kept linkified in
              Overview below). Header stays clean. */}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Q13-D: + New Application + Change Status as primary actions */}
            {!job.archived && (
              <button
                onClick={() => navigate(orgPath(`/ats/applications?action=new&jobId=${jobId}`))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 transition-colors"
              >
                <Plus size={14} /> New Application
              </button>
            )}
            {!job.archived && (
              <ChangeStatusDropdown
                currentStatus={statusKey}
                isOpen={showStatusDropdown}
                onToggle={() => setShowStatusDropdown((p) => !p)}
                onSelect={handleChangeStatus}
              />
            )}
            {/* Show-empty toggle (Q15-C) */}
            <button
              onClick={() => setShowEmpty((s) => !s)}
              title={showEmpty ? 'Hide empty fields' : 'Show empty fields'}
              className="p-1.5 text-dark-500 hover:text-dark-300 rounded-lg hover:bg-dark-800"
            >
              {showEmpty ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            {/* Overflow — Archive lives here (Q13-D) */}
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
                    {!job.archived ? (
                      <button
                        onClick={() => { setShowKebab(false); openArchiveModal(); }}
                        className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 flex items-center gap-2"
                      >
                        <Archive size={12} /> Archive
                      </button>
                    ) : (
                      <button
                        onClick={() => { setShowKebab(false); handleUnarchiveJob(); }}
                        className="w-full text-left px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-2"
                      >
                        <ArchiveRestore size={12} /> Unarchive
                      </button>
                    )}
                    {isOrgAdmin && (
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
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Body: 2-col grid (left = main flow, right = sidebar) ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main flow */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Overview" icon={Briefcase}>
            <InlineField label="Position Name" field="name" value={job.name} editable={canEdit} onSave={saveField} required />
            <InlineField
              label="Department"
              field="department"
              value={job.department}
              editable={canEdit}
              onSave={saveField}
              placeholder="e.g. Engineering"
              displayValue={
                job.department ? (
                  <Link
                    to={orgPath(`/ats/jobs?department=${encodeURIComponent(job.department)}`)}
                    onClick={(e) => e.stopPropagation()}
                    className="text-rivvra-300 hover:text-rivvra-200 hover:underline"
                  >
                    {job.department}
                  </Link>
                ) : undefined
              }
            />
            <InlineField label="Employment Type" field="employmentType" value={job.employmentType} editable={canEdit} onSave={saveField} placeholder="e.g. Permanent, Contract" />
            <InlineField label="Expected Hires" field="expectedHires" value={job.expectedHires ?? 1} editable={canEdit} onSave={saveField} />
            <InlineField label="Hired" field="hiredCount" value={job.hiredCount ?? 0} editable={false} />
          </SectionCard>

          <SectionCard title="Description" icon={FileText}>
            <DescriptionTabs
              internal={job.description}
              publicDesc={job.websiteDescription}
              canEdit={canEdit}
              onSave={saveField}
            />
          </SectionCard>

          <SectionCard title="Staffing & Compensation" icon={MapPin}>
            <InlineField
              label="Required Exp."
              field="requiredExperience"
              value={job.requiredExperience}
              type="select"
              options={EXPERIENCE_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={requiredExpDisplay || undefined}
            />
            <InlineField
              label="Hiring Mode"
              field="hiringMode"
              value={job.hiringMode}
              type="select"
              options={HIRING_MODE_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={
                job.hiringMode ? (
                  <span title={hiringModeFull} className="cursor-help underline decoration-dotted decoration-dark-500 underline-offset-2">
                    {job.hiringMode}
                  </span>
                ) : undefined
              }
            />
            <InlineField
              label="Work Location"
              field="clientJobLocation"
              value={job.clientJobLocation}
              editable={canEdit}
              onSave={saveField}
              placeholder="e.g. Remote, Bangalore on-site"
            />
            <MaybeInlineField
              hideWhenEmpty={!showEmpty}
              label="Client Budget"
              field="clientBudget"
              value={job.clientBudget}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtBudget(job.clientBudget) || undefined}
            />
            <MaybeInlineField
              hideWhenEmpty={!showEmpty}
              label="Candidate Max Budget"
              field="maxBudget"
              value={job.maxBudget}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtBudget(job.maxBudget) || undefined}
            />
            {(showEmpty || !job.approvalStatus || job.approvalStatus === 'pending') && (
              <InlineField
                label="Approval Status"
                field="approvalStatus"
                value={job.approvalStatus}
                type="select"
                options={APPROVAL_STATUS_OPTIONS}
                editable={canEdit}
                onSave={saveField}
                displayValue={job.approvalStatus ? <ApprovalIndicator status={job.approvalStatus} /> : undefined}
              />
            )}
            {showEmpty && (
              <InlineField
                label="Approver Comment"
                field="approverComment"
                value={job.approverComment}
                type="textarea"
                editable={canEdit}
                onSave={saveField}
                placeholder="Approval notes…"
              />
            )}
          </SectionCard>

          {/* Applications */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Applications
                <span className="ml-2 text-dark-400 text-sm font-normal">({appsTotal})</span>
              </h2>
              {isAdmin && !job.archived && appsTotal > 0 && (
                <button
                  onClick={() => navigate(orgPath(`/ats/applications?action=new&jobId=${jobId}`))}
                  className="flex items-center gap-1.5 text-sm text-rivvra-300 hover:text-rivvra-200"
                >
                  <Plus size={14} /> Add Application
                </button>
              )}
            </div>

            {appsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
              </div>
            ) : applications.length === 0 ? (
              <div className="card p-8 flex flex-col items-center justify-center">
                <Users className="w-8 h-8 text-dark-500 mb-2" />
                <p className="text-dark-400 text-sm mb-3">No applications for this position yet.</p>
                {isAdmin && !job.archived && (
                  <button
                    onClick={() => navigate(orgPath(`/ats/applications?action=new&jobId=${jobId}`))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400"
                  >
                    <Plus size={12} /> New Application
                  </button>
                )}
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
                        {applications.map((app) => {
                          const recId = app.recruiter || app.recruiterId;
                          const recUserId = userIdFor(recId);
                          return (
                            <tr
                              key={app._id}
                              onClick={() => openApp(app._id)}
                              className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-rivvra-400 text-xs font-semibold">
                                      {(app.candidateName || '?')[0].toUpperCase()}
                                    </span>
                                  </div>
                                  {app.candidateId ? (
                                    <Link
                                      to={orgPath(`/ats/candidates/${app.candidateId}`)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-white font-medium truncate hover:text-rivvra-300 hover:underline"
                                    >
                                      {app.candidateName || 'Unnamed'}
                                    </Link>
                                  ) : (
                                    <p className="text-white font-medium truncate">{app.candidateName || 'Unnamed'}</p>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                                <span className="truncate block max-w-[180px]">{app.candidateEmail || '—'}</span>
                              </td>
                              <td className="px-4 py-3">
                                <StageBadge stageName={app.stageName || app.stageId?.name} />
                              </td>
                              <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                                {recUserId && app.recruiterName ? (
                                  <Link
                                    to={orgPath(`/settings/users/${recUserId}`)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="hover:text-rivvra-300 hover:underline"
                                  >
                                    {app.recruiterName}
                                  </Link>
                                ) : (
                                  app.recruiterName || '—'
                                )}
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

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

          {/* Q4-A: Activity panel sits at the bottom of the main flow */}
          <ActivityPanel orgSlug={orgSlug} entityType="ats_job" entityId={jobId} />
        </div>

        {/* Sidebar — People, Client, Visibility, Meta */}
        <div className="space-y-5">
          <SectionCard title="People" icon={UserCheck}>
            <PersonField
              label="Recruiter"
              field="recruiterId"
              jobId={job.recruiterId}
              jobName={job.recruiterName}
              recruiterOptions={recruiterOptions}
              orgPath={orgPath}
              userIdFor={userIdFor}
              canEdit={canEdit}
              saveField={saveField}
            />
            <PersonField
              label="Account Owner"
              field="accountOwnerId"
              jobId={job.accountOwnerId}
              jobName={job.accountOwnerName}
              recruiterOptions={recruiterOptions}
              orgPath={orgPath}
              userIdFor={userIdFor}
              canEdit={canEdit}
              saveField={saveField}
              hideWhenEmpty={!showEmpty}
            />
            <PersonField
              label="Approver"
              field="approverId"
              jobId={job.approverId}
              jobName={job.approverName}
              recruiterOptions={recruiterOptions}
              orgPath={orgPath}
              userIdFor={userIdFor}
              canEdit={canEdit}
              saveField={saveField}
              hideWhenEmpty={!showEmpty}
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
            {/* Q4-A: lookup field; selected name renders as a hyperlink to
                the contact record. Pencil/clear icon swaps to edit mode. */}
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
                ) : job.clientName ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    {job.clientContactId ? (
                      <Link
                        to={orgPath(`/contacts/${job.clientContactId}`)}
                        className="text-rivvra-300 hover:text-rivvra-200 hover:underline truncate"
                      >
                        {job.clientName}
                      </Link>
                    ) : (
                      <span className="text-white truncate">{job.clientName}</span>
                    )}
                    {canEdit && job.isClientRole && (
                      <button
                        onClick={() => setEditingClient(true)}
                        className="text-dark-500 hover:text-dark-300 flex-shrink-0"
                        title="Change client"
                        aria-label="Change client"
                      >
                        <ChevronDown size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={canEdit && job.isClientRole ? () => setEditingClient(true) : undefined}
                    className={`text-sm rounded px-1 -mx-1 ${canEdit && job.isClientRole ? 'cursor-pointer hover:bg-dark-800' : ''}`}
                  >
                    <span className="text-dark-500 italic">
                      {job.isClientRole ? 'Search or type a company name…' : 'Toggle Client Role first'}
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
            {/* Q10-C: "Public Page" button — disabled when unpublished */}
            {job.websiteUrl && (
              <a
                href={job.published ? job.websiteUrl : undefined}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => { if (!job.published) e.preventDefault(); }}
                className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  job.published
                    ? 'text-rivvra-300 border-rivvra-500/30 hover:bg-rivvra-500/10'
                    : 'text-dark-500 border-dark-700 cursor-not-allowed opacity-60'
                }`}
                title={job.published ? 'Open public careers page' : 'Publish to enable public link'}
              >
                <ExternalLink size={12} /> Public Page
              </a>
            )}
          </SectionCard>

          {/* Q14-D + Q8-A: Meta card — Created/Updated/Source + folded Approval */}
          <SectionCard>
            <RecordMeta
              createdAt={job.createdAt}
              createdByName={job.createdByName}
              updatedAt={job.updatedAt}
              updatedByName={job.updatedByName}
            />
            {(job.approvalStatus || job.approverName) && (
              <div className="text-[11px] text-dark-500 mt-2 pt-2 border-t border-dark-700/50 space-y-1">
                <div className="flex items-center gap-1.5">
                  <ApprovalIndicator status={job.approvalStatus} />
                  {job.approverName && (
                    <span>
                      &nbsp;by <span className="text-dark-300">{job.approverName}</span>
                    </span>
                  )}
                </div>
                {job.approverComment && (
                  <button
                    onClick={() => setShowApprovalComment((s) => !s)}
                    className="text-[10px] text-dark-500 hover:text-dark-300 underline"
                  >
                    {showApprovalComment ? 'Hide comment' : 'Show comment'}
                  </button>
                )}
                {showApprovalComment && job.approverComment && (
                  <p className="text-dark-300 italic">{job.approverComment}</p>
                )}
              </div>
            )}
            {job.odooId && (
              <p className="text-[11px] text-dark-500 mt-2 pt-2 border-t border-dark-700/50">
                Source: Odoo import (#{job.odooId})
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
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

/* ── PersonField — InlineField with displayValue rendered as a profile link
 *   (Q5-A). Keeps editing via the existing select dropdown. */
function PersonField({
  label, field, jobId, jobName, recruiterOptions, orgPath, userIdFor,
  canEdit, saveField, hideWhenEmpty,
}) {
  if (hideWhenEmpty && !jobId) return null;
  const userId = userIdFor(jobId);
  return (
    <InlineField
      label={label}
      field={field}
      value={jobId}
      type="select"
      options={recruiterOptions}
      editable={canEdit}
      onSave={saveField}
      displayValue={
        jobName && userId ? (
          <Link
            to={orgPath(`/settings/users/${userId}`)}
            onClick={(e) => e.stopPropagation()}
            className="text-rivvra-300 hover:text-rivvra-200 hover:underline"
          >
            {jobName}
          </Link>
        ) : jobName ? (
          <span>{jobName}</span>
        ) : undefined
      }
    />
  );
}
