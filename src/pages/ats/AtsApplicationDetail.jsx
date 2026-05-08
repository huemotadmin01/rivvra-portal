import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { formatCurrency } from '../../utils/formatCurrency';
import atsApi from '../../utils/atsApi';
import ActivityPanel from '../../components/shared/ActivityPanel';
import signApi from '../../utils/signApi';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import SkillsPicker from '../../components/ats/SkillsPicker';
import AttachmentsPanel from '../../components/ats/AttachmentsPanel';
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, Star, X, ChevronDown,
  User, Briefcase, FileText, Tag, Calendar,
  XCircle, Award,
  Plus, ExternalLink,
  PenTool, FileSignature, UserPlus, UserCheck,
  DollarSign,
  Archive, ArchiveRestore, MoreHorizontal, Trash2,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';

/* ── Kanban State Dot ─────────────────────────────────────────────────── */
const KANBAN_STATES = ['normal', 'done', 'blocked'];
const KANBAN_COLORS = { normal: 'bg-gray-400', done: 'bg-emerald-400', blocked: 'bg-red-400' };
const KANBAN_LABELS = { normal: 'Normal', done: 'Done', blocked: 'Blocked' };

function KanbanDot({ state = 'normal', onClick }) {
  const color = KANBAN_COLORS[state] || KANBAN_COLORS.normal;
  const label = KANBAN_LABELS[state] || 'Normal';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Kanban: ${label} (click to toggle)`}
      className="group relative flex items-center"
    >
      <span className={`inline-block w-3 h-3 rounded-full ${color} transition-colors ring-2 ring-dark-800 group-hover:ring-dark-600`} />
      <span className="ml-1.5 text-xs text-dark-400 hidden sm:inline">{label}</span>
    </button>
  );
}

/* ── Stage Progression Bar ────────────────────────────────────────────── */
function StageBar({ stages, currentStageId, onStageClick }) {
  const currentIdx = stages.findIndex((s) => s._id === currentStageId);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((stage, idx) => {
        let cls = 'bg-dark-700 text-dark-400';
        if (idx < currentIdx) cls = 'bg-emerald-500/20 text-emerald-400';
        if (idx === currentIdx) cls = 'bg-rivvra-500 text-white';
        return (
          <button
            key={stage._id}
            onClick={() => onStageClick?.(stage._id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all hover:opacity-80 ${cls}`}
          >
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}

/* ── Refuse Modal ─────────────────────────────────────────────────────── */
function RefuseModal({ show, onClose, onConfirm, reasons, saving }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (show) setReason(''); }, [show]);
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Refuse Application</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Reason for refusal</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="input-field">
              <option value="">Select reason...</option>
              {reasons.map((r) => (
                <option key={r._id || r} value={r.name || r}>{r.name || r}</option>
              ))}
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
            <button onClick={() => onConfirm(reason)} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              {saving && <Loader2 size={16} className="animate-spin" />}
              Refuse Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Hire Confirm Modal ───────────────────────────────────────────────── */
function HireModal({ show, onClose, onConfirm, saving }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-modal="true" className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Hire Candidate</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <p className="text-dark-300 text-sm mb-6">
          Mark this candidate as hired? This will update their application status.
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            {saving && <Loader2 size={16} className="animate-spin" />}
            Confirm Hire
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Move-to-Stage Dropdown ───────────────────────────────────────────── */
function MoveStageDropdown({ stages, currentStageId, isOpen, onToggle, onSelect }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200"
      >
        Move to...
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-1.5 min-w-[180px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20 max-h-60 overflow-y-auto">
            {stages.filter((s) => s._id !== currentStageId).map((s) => (
              <button
                key={s._id}
                onClick={() => onSelect(s._id)}
                className="w-full text-left px-3 py-2 text-sm text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Sign Requests Panel ─────────────────────────────────────────────── */
function SignRequestsPanel({ orgSlug, applicationId, orgPath }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgSlug || !applicationId) return;
    (async () => {
      try {
        const res = await signApi.listRequests(orgSlug, { linkedModel: 'ats_application', linkedId: applicationId });
        if (res.success) setRequests(res.requests || []);
      } catch (_) {}
      setLoading(false);
    })();
  }, [orgSlug, applicationId]);

  if (loading) return <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-dark-500" /></div>;
  if (!requests.length) return <p className="text-dark-500 text-xs py-1">No signature requests yet.</p>;

  const stateColors = {
    draft: 'bg-dark-700 text-dark-300',
    sent: 'bg-blue-500/10 text-blue-400',
    signed: 'bg-emerald-500/10 text-emerald-400',
    refused: 'bg-red-500/10 text-red-400',
    cancelled: 'bg-dark-700 text-dark-400',
    expired: 'bg-amber-500/10 text-amber-400',
  };

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <Link
          key={r._id}
          to={orgPath('/sign/requests/' + r._id)}
          className="flex items-center justify-between p-2.5 rounded-lg bg-dark-800/50 hover:bg-dark-800 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-sm text-white truncate group-hover:text-rivvra-400 transition-colors">
              {r.reference || r.templateName || 'Untitled'}
            </p>
            <p className="text-xs text-dark-500 mt-0.5">
              {r.progress?.completed || 0}/{r.progress?.total || 0} signed
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${stateColors[r.state] || stateColors.draft}`}>
            {r.state?.charAt(0).toUpperCase() + r.state?.slice(1)}
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ── Result options for interview rounds ─────────────────────────────── */
const RESULT_OPTIONS = [
  { value: 'awaited', label: 'Awaited' },
  { value: 'selected', label: 'Selected' },
  { value: 'rejected', label: 'Rejected' },
];

const EVAL_OPTIONS = [
  { value: 0, label: 'No rating' },
  { value: 1, label: '★ Good' },
  { value: 2, label: '★★ Very good' },
  { value: 3, label: '★★★ Excellent' },
];

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsApplicationDetail() {
  const { applicationId } = useParams();
  const { currentOrg, getAppRole, isOrgAdmin } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const companyCurrency = currentCompany?.currency || 'INR';
  const fmtSalary = (v) =>
    v == null || v === '' ? null : formatCurrency(v, companyCurrency);

  const [application, setApplication] = useState(null);
  usePageTitle(application?.candidateName);
  const [loading, setLoading] = useState(true);

  // Dropdown data
  const [stages, setStages] = useState([]);
  const [refuseReasons, setRefuseReasons] = useState([]);
  const [recruiters, setRecruiters] = useState([]);

  // Modal / action UI state
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;
  // Canonical status field on ats_applications is `applicationStatus`
  // ('ongoing' | 'hired' | 'refused'). Tolerate the legacy `status` alias
  // in case any caller still emits it, but prefer the canonical one.
  const appStatus = application?.applicationStatus || application?.status;
  const isTerminal = appStatus === 'hired' || appStatus === 'refused';
  const canEdit = isAdmin && !application?.archived && !isTerminal;

  // ── Fetch application ─────────────────────────────────────────────────
  const fetchApplication = useCallback(async () => {
    if (!orgSlug || !applicationId) return;
    setLoading(true);
    try {
      const res = await atsApi.getApplication(orgSlug, applicationId);
      if (res.success) {
        // Merge enriched fields onto the doc so InlineField can read
        // them as plain properties.
        const merged = {
          ...res.application,
          jobName: res.jobName || res.application.jobName,
          jobDepartment: res.jobDepartment || res.application.department,
          jobClient: res.jobClientName || null,
          stageName: res.stageName || res.application.stageName,
          recruiterName: res.recruiterName || res.application.recruiterName,
          accountOwnerName: res.accountOwnerName || null,
          accountManagerName: res.accountManagerName || null,
          submittedByName: res.submittedByName || null,
        };
        setApplication(merged);
      }
    } catch (err) {
      console.error('Failed to load application:', err);
      showToast('Failed to load application', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, applicationId, showToast]);

  // ── Fetch dropdown data ───────────────────────────────────────────────
  const fetchDropdowns = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const [stagesRes, reasonsRes, recruitersRes] = await Promise.all([
        atsApi.listStages(orgSlug),
        atsApi.listConfig(orgSlug, 'refuse-reasons').catch(() => ({ success: true, items: [] })),
        atsApi.listRecruiters(orgSlug).catch(() => ({ success: true, recruiters: [] })),
      ]);
      if (stagesRes.success) setStages(stagesRes.stages || []);
      if (reasonsRes.success) setRefuseReasons(reasonsRes.items || reasonsRes.reasons || []);
      if (recruitersRes.success) setRecruiters(recruitersRes.recruiters || recruitersRes.users || []);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
  }, [orgSlug]);

  useEffect(() => { fetchApplication(); }, [fetchApplication]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  const recruiterOptions = useMemo(
    () => recruiters.map((r) => ({ value: r._id, label: r.name || r.email || r._id })),
    [recruiters]
  );

  // ── Generic per-field inline-save ────────────────────────────────────
  const saveField = async (field, value) => {
    let coerced = value;
    if (field === 'evaluation') {
      const n = Number(value);
      coerced = [0, 1, 2, 3].includes(n) ? n : 0;
    } else if (field === 'salaryExpected' || field === 'salaryProposed') {
      if (value === '' || value == null) {
        coerced = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Must be a positive number');
        coerced = n;
      }
    }
    const res = await atsApi.updateApplication(orgSlug, applicationId, { [field]: coerced });
    if (res?.application) {
      setApplication((prev) => ({ ...prev, ...res.application }));
    } else {
      setApplication((prev) => ({ ...prev, [field]: coerced }));
    }
  };

  // ── Stage / refuse / hire / archive / delete actions ─────────────────
  const handleMoveStage = async (stageId) => {
    setShowMoveDropdown(false);
    try {
      setActionSaving(true);
      await atsApi.moveStage(orgSlug, applicationId, stageId);
      showToast('Stage updated');
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to move stage', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  const handleRefuse = async (reason) => {
    try {
      setActionSaving(true);
      await atsApi.refuseApplication(orgSlug, applicationId, { reason });
      showToast('Application refused');
      setShowRefuseModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to refuse application', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  const handleHire = async () => {
    try {
      setActionSaving(true);
      await atsApi.hireApplication(orgSlug, applicationId);
      showToast('Candidate hired!');
      setShowHireModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to hire candidate', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  const handleArchiveApp = async () => {
    setArchiving(true);
    try {
      await atsApi.archiveApplication(orgSlug, applicationId);
      setApplication((a) => ({ ...a, archived: true }));
      showToast('Archived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to archive application', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchiveApp = async () => {
    try {
      await atsApi.unarchiveApplication(orgSlug, applicationId);
      setApplication((a) => ({ ...a, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive application', 'error');
    }
  };

  const handleDeleteApp = async () => {
    setDeleting(true);
    try {
      await atsApi.deleteApplication(orgSlug, applicationId);
      showToast('Application deleted', 'success');
      navigate(orgPath('/ats/applications'));
    } catch (err) {
      setDeleting(false);
      showToast(err.message || 'Failed to delete application', 'error');
    }
  };

  const handleCreateEmployee = async () => {
    try {
      setCreatingEmployee(true);
      const res = await atsApi.createEmployeeFromApplication(orgSlug, applicationId);
      if (res.success) {
        showToast(res.existing ? 'Linked to existing employee' : `Employee "${res.employeeName}" created!`);
        fetchApplication();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create employee', 'error');
    } finally {
      setCreatingEmployee(false);
    }
  };

  const handleToggleKanban = async () => {
    const current = application?.kanbanState || 'normal';
    const nextIdx = (KANBAN_STATES.indexOf(current) + 1) % KANBAN_STATES.length;
    const next = KANBAN_STATES[nextIdx];
    try {
      await atsApi.updateApplication(orgSlug, applicationId, { kanbanState: next });
      showToast(`Kanban state: ${KANBAN_LABELS[next]}`);
      setApplication((a) => ({ ...a, kanbanState: next }));
    } catch (err) {
      showToast(err.message || 'Failed to update kanban state', 'error');
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const formatDate = (dateStr) => formatDateUTC(dateStr) || '—';

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20">
          <h3 className="text-lg font-semibold text-white mb-2">Application not found</h3>
          <p className="text-dark-400 text-sm">The application may have been deleted or you don't have access.</p>
        </div>
      </div>
    );
  }

  const currentStageId = application.stageId?._id || application.stageId;
  const currentStageName = application.stageName || application.stageId?.name || 'Unknown';

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">
              {application.candidateName || 'Unnamed Candidate'}
            </h1>
            {application.archived && (
              <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                <Archive size={11} /> ARCHIVED
              </span>
            )}
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              appStatus === 'hired'
                ? 'bg-emerald-500/10 text-emerald-400'
                : appStatus === 'refused'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-rivvra-500/10 text-rivvra-400'
            }`}>
              {appStatus === 'hired' ? 'Hired' : appStatus === 'refused' ? 'Refused' : currentStageName}
            </span>
            <KanbanDot
              state={application.kanbanState || 'normal'}
              onClick={canEdit ? handleToggleKanban : undefined}
            />
          </div>
          <p className="text-dark-400 text-sm">
            {application.jobName || application.jobId?.name || 'No position assigned'}
          </p>
        </div>

        {/* Action buttons */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <>
                <button
                  onClick={() => navigate(orgPath('/sign/requests?create=true&linkedModel=ats_application&linkedId=' + applicationId))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20"
                >
                  <PenTool size={14} /> Request Signature
                </button>
                <MoveStageDropdown
                  stages={stages}
                  currentStageId={currentStageId}
                  isOpen={showMoveDropdown}
                  onToggle={() => setShowMoveDropdown((p) => !p)}
                  onSelect={handleMoveStage}
                />
                <button
                  onClick={() => setShowRefuseModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                >
                  <XCircle size={14} /> Refuse
                </button>
                <button
                  onClick={() => setShowHireModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                >
                  <Award size={14} /> Hire
                </button>
              </>
            )}
            {application.hireDate && !application.employeeId && (
              <button
                onClick={handleCreateEmployee}
                disabled={creatingEmployee}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50"
              >
                {creatingEmployee ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Create Employee
              </button>
            )}
            {application.employeeId && (
              <button
                onClick={() => navigate(`/org/${orgSlug}/employee/${application.employeeId}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
              >
                <ExternalLink size={14} /> Employee
              </button>
            )}
            {application.archived ? (
              <button
                onClick={handleUnarchiveApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
              >
                <ArchiveRestore size={14} /> Unarchive
              </button>
            ) : (
              <button
                onClick={handleArchiveApp}
                disabled={archiving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all text-dark-300 border-transparent hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30 disabled:opacity-50"
              >
                {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                Archive
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete Application</h2>
            <p className="text-xs text-dark-400 mb-1">
              Permanently delete this application for <span className="text-dark-200 font-medium">{application.candidateName}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">
              All attachments (résumé, documents) and activity history will also be deleted. Cannot be recovered.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">Cancel</button>
              <button onClick={handleDeleteApp} disabled={deleting} className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Progression Bar (in-pipeline only) */}
      {stages.length > 0 && !isTerminal && (
        <StageBar
          stages={stages}
          currentStageId={currentStageId}
          onStageClick={canEdit ? handleMoveStage : undefined}
        />
      )}

      {/* Body: main + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Candidate" icon={User}>
            <InlineField label="Name" field="candidateName" value={application.candidateName} editable={canEdit} onSave={saveField} required />
            <InlineField label="Email" field="email" value={application.email} type="email" editable={canEdit} onSave={saveField} placeholder="Add email" />
            <InlineField label="Phone" field="phone" value={application.phone} type="phone" editable={canEdit} onSave={saveField} placeholder="Add phone" />
            <InlineField label="LinkedIn" field="linkedinProfile" value={application.linkedinProfile} type="url" editable={canEdit} onSave={saveField} placeholder="LinkedIn URL" />
            <InlineField
              label="Evaluation"
              field="evaluation"
              value={application.evaluation ?? 0}
              type="select"
              options={EVAL_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={application.evaluation > 0
                ? <span className="text-amber-400">{'★'.repeat(application.evaluation)}</span>
                : undefined}
            />
            {application.candidateId && (
              <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                <span className="text-dark-400 text-sm">Profile</span>
                <Link
                  to={orgPath(`/ats/candidates/${application.candidateId}`)}
                  className="text-rivvra-400 hover:text-rivvra-300 text-sm underline-offset-2 hover:underline"
                >
                  Open candidate record →
                </Link>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Job" icon={Briefcase}>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Position</span>
              {application.jobPositionId ? (
                <Link
                  to={orgPath(`/ats/jobs/${application.jobPositionId}`)}
                  className="text-rivvra-400 hover:text-rivvra-300 text-sm underline-offset-2 hover:underline truncate"
                >
                  {application.jobName || 'View job'} <ExternalLink size={11} className="inline ml-0.5" />
                </Link>
              ) : (
                <span className="text-dark-600 text-sm">—</span>
              )}
            </div>
            <InlineField label="Department" field="jobDepartment" value={application.jobDepartment} editable={false} />
            <InlineField label="Recruiter" field="recruiterName" value={application.recruiterName} editable={false} />
            <InlineField label="Account Owner" field="accountOwnerName" value={application.accountOwnerName} editable={false} />
            <InlineField
              label="Account Mgr."
              field="accountManagerId"
              value={application.accountManagerId}
              type="select"
              options={recruiterOptions}
              editable={canEdit}
              onSave={saveField}
              displayValue={application.accountManagerName || undefined}
            />
            <InlineField
              label="Submitted By"
              field="submittedById"
              value={application.submittedById}
              type="select"
              options={recruiterOptions}
              editable={canEdit}
              onSave={saveField}
              displayValue={application.submittedByName || undefined}
            />
            <InlineField label="Employment" field="employmentType" value={application.employmentType} editable={canEdit} onSave={saveField} placeholder="e.g. Permanent, Contract" />
            <InlineField label="Client Role" field="isClientRole" value={!!application.isClientRole} type="toggle" editable={canEdit} onSave={saveField} />
            <InlineField
              label="Client Name"
              field="clientName"
              value={application.clientName}
              editable={canEdit && !!application.isClientRole}
              onSave={saveField}
              placeholder={application.isClientRole ? 'Client company name' : 'Toggle Client Role first'}
            />
          </SectionCard>

          <SectionCard title="Compensation" icon={DollarSign}>
            <InlineField
              label="Salary Expected"
              field="salaryExpected"
              value={application.salaryExpected}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtSalary(application.salaryExpected) || undefined}
            />
            <InlineField
              label="Salary Proposed"
              field="salaryProposed"
              value={application.salaryProposed}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtSalary(application.salaryProposed) || undefined}
            />
          </SectionCard>

          <SectionCard title="Sourcing" icon={FileText}>
            <InlineField label="Source" field="source" value={application.source} editable={canEdit} onSave={saveField} placeholder="e.g. Naukri, Referral" />
            <InlineField label="Medium" field="medium" value={application.medium} editable={canEdit} onSave={saveField} placeholder="e.g. Online, Email" />
            <InlineField label="Degree" field="degree" value={application.degree} editable={canEdit} onSave={saveField} placeholder="e.g. B.Tech, MBA" />
            <InlineField label="Availability" field="availability" value={application.availability} editable={canEdit} onSave={saveField} placeholder="e.g. 30 days notice" />
            <InlineField label="Applied On" field="appliedOn" value={application.appliedOn} type="date" editable={canEdit} onSave={saveField} />
            <InlineField label="Notes" field="note" value={application.note} type="textarea" editable={canEdit} onSave={saveField} placeholder="Internal notes…" />
          </SectionCard>

          <SectionCard title="Skills" icon={Award}>
            {application.candidateId ? (
              <SkillsPicker orgSlug={orgSlug} candidateId={application.candidateId} readOnly={!isAdmin} />
            ) : (
              <p className="text-dark-500 text-sm py-2">No candidate linked.</p>
            )}
          </SectionCard>

          <SectionCard title="Attachments" icon={FileSignature}>
            <AttachmentsPanel orgSlug={orgSlug} applicationId={applicationId} readOnly={!isAdmin} />
          </SectionCard>

          <SectionCard
            title="Signature Requests"
            icon={FileSignature}
            action={isAdmin && (
              <button
                onClick={() => navigate(orgPath('/sign/requests?create=true&linkedModel=ats_application&linkedId=' + applicationId))}
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
                title="Request Signature"
              >
                <Plus size={14} />
              </button>
            )}
          >
            <SignRequestsPanel orgSlug={orgSlug} applicationId={applicationId} orgPath={orgPath} />
            <SignRequestWidget
              orgSlug={orgSlug}
              linkedModel="ats_application"
              linkedId={applicationId}
              prefillData={{
                name: application.candidateName || '',
                email: application.email || '',
                phone: application.phone || '',
              }}
            />
          </SectionCard>

          <SectionCard title="Interview" icon={Calendar}>
            <InterviewRound
              label="L1"
              resultField="l1Result"
              dateField="l1DateTime"
              feedbackField="l1Feedback"
              application={application}
              canEdit={canEdit}
              saveField={saveField}
            />
            <div className="border-t border-dark-700 my-3" />
            <InterviewRound
              label="L2"
              resultField="l2Result"
              dateField="l2DateTime"
              feedbackField="l2Feedback"
              application={application}
              canEdit={canEdit}
              saveField={saveField}
            />
            <div className="border-t border-dark-700 my-3" />
            <InterviewRound
              label="HR"
              resultField="hrResult"
              dateField="hrDateTime"
              feedbackField="hrRoundFeedback"
              application={application}
              canEdit={canEdit}
              saveField={saveField}
            />
            <div className="border-t border-dark-700 my-3" />
            <InlineField
              label="Hire Date"
              field="hireDate"
              value={application.hireDate}
              type="date"
              editable={canEdit}
              onSave={saveField}
            />
          </SectionCard>

        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <SectionCard title="Activity" icon={Star}>
            <ActivityPanel orgSlug={orgSlug} entityType="ats_application" entityId={applicationId} />
          </SectionCard>

          <SectionCard title="Tags" icon={Tag}>
            {(application.tags && application.tags.length > 0) ? (
              <div className="flex flex-wrap gap-1.5 py-2">
                {application.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 text-dark-300">
                    {typeof tag === 'string' ? tag : tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-dark-500 text-xs py-1">No tags.</p>
            )}
          </SectionCard>

          {appStatus === 'refused' && (
            <SectionCard className="border-red-500/20" title="Refused" icon={XCircle}>
              <p className="text-dark-300 text-sm py-1">
                {application.refuseReason || 'No reason provided'}
              </p>
              {application.refusedAt && (
                <p className="text-dark-500 text-xs mt-2">
                  Refused on {formatDate(application.refusedAt)}
                </p>
              )}
            </SectionCard>
          )}

          <SectionCard title="Pipeline" icon={UserCheck}>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Status</span>
              <span className="text-white text-sm capitalize">{application.applicationStatus || 'ongoing'}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Kanban</span>
              <span className="text-white text-sm">{KANBAN_LABELS[application.kanbanState] || 'Normal'}</span>
            </div>
          </SectionCard>

          <SectionCard>
            <RecordMeta
              createdAt={application.createdAt}
              createdByName={application.createdByName}
              updatedAt={application.updatedAt}
              updatedByName={application.updatedByName}
            />
          </SectionCard>
        </div>
      </div>

      {/* Modals */}
      <RefuseModal
        show={showRefuseModal}
        onClose={() => setShowRefuseModal(false)}
        onConfirm={handleRefuse}
        reasons={refuseReasons}
        saving={actionSaving}
      />
      <HireModal
        show={showHireModal}
        onClose={() => setShowHireModal(false)}
        onConfirm={handleHire}
        saving={actionSaving}
      />
    </div>
  );
}

/* ── Interview round helper ──────────────────────────────────────────── */
function InterviewRound({ label, resultField, dateField, feedbackField, application, canEdit, saveField }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1 px-1">
        {label} Interview
      </h4>
      <InlineField
        label="Result"
        field={resultField}
        value={application[resultField]}
        type="select"
        options={RESULT_OPTIONS}
        editable={canEdit}
        onSave={saveField}
      />
      <InlineField
        label="Date & Time"
        field={dateField}
        value={application[dateField]}
        type="datetime-local"
        editable={canEdit}
        onSave={saveField}
      />
      <InlineField
        label="Feedback"
        field={feedbackField}
        value={application[feedbackField]}
        type="textarea"
        editable={canEdit}
        onSave={saveField}
        placeholder="Add feedback notes…"
      />
    </div>
  );
}
