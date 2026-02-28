import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  ArrowLeft, Loader2, Star, X, ChevronDown,
  Mail, Phone, Linkedin, User, Briefcase,
  Calendar, Edit3, Check, XCircle, Award,
  Clock, Tag, MessageSquare, Plus, CheckCircle2,
  DollarSign, Circle,
} from 'lucide-react';

/* ── Evaluation Stars ─────────────────────────────────────────────────── */
function EvalStars({ value = 0, max = 3, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i + 1 === value ? 0 : i + 1)}
          className={`transition-colors ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <Star
            size={16}
            className={i < value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
          />
        </button>
      ))}
    </div>
  );
}

/* ── Kanban State Dot ─────────────────────────────────────────────────── */
const KANBAN_STATES = ['normal', 'done', 'blocked'];
const KANBAN_COLORS = {
  normal: 'bg-gray-400',
  done: 'bg-emerald-400',
  blocked: 'bg-red-400',
};
const KANBAN_LABELS = {
  normal: 'Normal',
  done: 'Done',
  blocked: 'Blocked',
};

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

/* ── Interview Result Badge ───────────────────────────────────────────── */
const RESULT_STYLES = {
  awaited: 'bg-yellow-500/20 text-yellow-400',
  selected: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
};

function ResultBadge({ result }) {
  if (!result) return null;
  const cls = RESULT_STYLES[result] || RESULT_STYLES.awaited;
  const label = result.charAt(0).toUpperCase() + result.slice(1);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

/* ── Stage Progression Bar ────────────────────────────────────────────── */
function StageBar({ stages, currentStageId, onStageClick }) {
  const currentIdx = stages.findIndex((s) => s._id === currentStageId);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((stage, idx) => {
        let cls = 'bg-dark-700 text-dark-400'; // future
        if (idx < currentIdx) cls = 'bg-emerald-500/20 text-emerald-400'; // completed
        if (idx === currentIdx) cls = 'bg-rivvra-500 text-white'; // current

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

  useEffect(() => {
    if (show) setReason('');
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Refuse Application</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Reason for refusal
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
            >
              <option value="">Select reason...</option>
              {reasons.map((r) => (
                <option key={r._id || r} value={r.name || r}>
                  {r.name || r}
                </option>
              ))}
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
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
      <div
        role="dialog"
        aria-modal="true"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Hire Candidate</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <p className="text-dark-300 text-sm mb-6">
          Are you sure you want to mark this candidate as hired? This will update their application status.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Confirm Hire
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Activity Modal ───────────────────────────────────────────────── */
function AddActivityModal({ show, onClose, onSaved, orgSlug, applicationId }) {
  const modalRef = useRef(null);
  const { showToast } = useToast();
  const [summary, setSummary] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setSummary('');
      setDueDate('');
      setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
    }
  }, [show]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!summary.trim()) return;

    try {
      setSaving(true);
      const res = await atsApi.createActivity(orgSlug, {
        applicationId,
        summary: summary.trim(),
        dueDate: dueDate || undefined,
      });
      if (res.success) {
        showToast('Activity added');
        onSaved();
        onClose();
      }
    } catch (err) {
      showToast(err.message || 'Failed to add activity', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Add Activity</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Summary <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Schedule interview, Follow up..."
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input-field"
            />
          </div>
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
              Add Activity
            </button>
          </div>
        </form>
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
            {stages
              .filter((s) => s._id !== currentStageId)
              .map((s) => (
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

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsApplicationDetail() {
  const { applicationId } = useParams();
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Tabs
  const [activeTab, setActiveTab] = useState('details');

  // Dropdown data
  const [stages, setStages] = useState([]);
  const [refuseReasons, setRefuseReasons] = useState([]);
  const [recruiters, setRecruiters] = useState([]);

  // Activities
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Modals
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  // ── Fetch application ──────────────────────────────────────────────────
  const fetchApplication = useCallback(async () => {
    if (!orgSlug || !applicationId) return;
    setLoading(true);
    try {
      const res = await atsApi.getApplication(orgSlug, applicationId);
      if (res.success) {
        setApplication(res.application);
        setEditForm(res.application);
      }
    } catch (err) {
      console.error('Failed to load application:', err);
      showToast('Failed to load application', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, applicationId, showToast]);

  // ── Fetch dropdown data ────────────────────────────────────────────────
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

  // ── Fetch activities ───────────────────────────────────────────────────
  const fetchActivities = useCallback(async () => {
    if (!orgSlug || !applicationId) return;
    setActivitiesLoading(true);
    try {
      const res = await atsApi.listActivities(orgSlug, applicationId);
      if (res.success) {
        setActivities(res.activities || []);
      }
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setActivitiesLoading(false);
    }
  }, [orgSlug, applicationId]);

  useEffect(() => { fetchApplication(); }, [fetchApplication]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
  useEffect(() => {
    if (activeTab === 'activities') fetchActivities();
  }, [activeTab, fetchActivities]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleMoveStage = async (stageId) => {
    setShowMoveDropdown(false);
    try {
      setSaving(true);
      await atsApi.moveStage(orgSlug, applicationId, stageId);
      showToast('Stage updated');
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to move stage', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefuse = async (reason) => {
    try {
      setSaving(true);
      await atsApi.refuseApplication(orgSlug, applicationId, { reason });
      showToast('Application refused');
      setShowRefuseModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to refuse application', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleHire = async () => {
    try {
      setSaving(true);
      await atsApi.hireApplication(orgSlug, applicationId);
      showToast('Candidate hired!');
      setShowHireModal(false);
      fetchApplication();
    } catch (err) {
      showToast(err.message || 'Failed to hire candidate', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      const payload = {
        candidateName: editForm.candidateName,
        candidateEmail: editForm.candidateEmail,
        candidatePhone: editForm.candidatePhone,
        linkedinProfile: editForm.linkedinProfile,
        evaluation: editForm.evaluation,
        recruiterName: editForm.recruiterName,
        employmentType: editForm.employmentType,
        source: editForm.source,
        medium: editForm.medium,
        degree: editForm.degree,
        availability: editForm.availability,
        notes: editForm.notes,
        // New salary fields
        salaryExpected: editForm.salaryExpected,
        salaryProposed: editForm.salaryProposed,
        // New user reference fields
        accountManagerId: editForm.accountManagerId,
        submittedById: editForm.submittedById,
        // Kanban state
        kanbanState: editForm.kanbanState,
        // Interview fields — updated
        l1Result: editForm.l1Result,
        l1DateTime: editForm.l1DateTime,
        l1Feedback: editForm.l1Feedback,
        l2Result: editForm.l2Result,
        l2DateTime: editForm.l2DateTime,
        l2Feedback: editForm.l2Feedback,
        hrResult: editForm.hrResult,
        hrDateTime: editForm.hrDateTime,
        hrRoundFeedback: editForm.hrRoundFeedback,
        hireDate: editForm.hireDate,
      };
      const res = await atsApi.updateApplication(orgSlug, applicationId, payload);
      if (res.success) {
        showToast('Application updated');
        setEditing(false);
        fetchApplication();
      }
    } catch (err) {
      showToast(err.message || 'Failed to update application', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkActivityDone = async (activityId) => {
    try {
      await atsApi.markActivityDone(orgSlug, activityId);
      showToast('Activity marked as done');
      fetchActivities();
    } catch (err) {
      showToast(err.message || 'Failed to update activity', 'error');
    }
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleKanban = async () => {
    const current = application?.kanbanState || 'normal';
    const nextIdx = (KANBAN_STATES.indexOf(current) + 1) % KANBAN_STATES.length;
    const next = KANBAN_STATES[nextIdx];
    try {
      setSaving(true);
      const res = await atsApi.updateApplication(orgSlug, applicationId, { kanbanState: next });
      if (res.success) {
        showToast(`Kanban state: ${KANBAN_LABELS[next]}`);
        fetchApplication();
      }
    } catch (err) {
      showToast(err.message || 'Failed to update kanban state', 'error');
    } finally {
      setSaving(false);
    }
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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const currentStageId = application?.stageId?._id || application?.stageId;
  const currentStageName = application?.stageName || application?.stageId?.name || 'Unknown';

  // Resolve display names for account manager / submitted by
  const resolveUserName = (userId) => {
    if (!userId) return '\u2014';
    const found = recruiters.find((r) => r._id === userId);
    return found ? (found.name || found.email || '\u2014') : '\u2014';
  };

  // ── Render ─────────────────────────────────────────────────────────────
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
        <button
          onClick={() => navigate(orgPath('/ats/applications'))}
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to Applications
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <h3 className="text-lg font-semibold text-white mb-2">Application not found</h3>
          <p className="text-dark-400 text-sm">The application may have been deleted or you don't have access.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'details', label: 'Details' },
    { key: 'interview', label: 'Interview' },
    { key: 'activities', label: 'Activities' },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => navigate(orgPath('/ats/applications'))}
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back to Applications
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">
                {application.candidateName || 'Unnamed Candidate'}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                application.status === 'hired'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : application.status === 'refused'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-rivvra-500/10 text-rivvra-400'
              }`}>
                {application.status === 'hired' ? 'Hired' : application.status === 'refused' ? 'Refused' : currentStageName}
              </span>
              {/* Kanban State Dot */}
              <KanbanDot
                state={application.kanbanState || 'normal'}
                onClick={isAdmin ? handleToggleKanban : undefined}
              />
            </div>
            <p className="text-dark-400 text-sm">
              {application.jobName || application.jobId?.name || 'No position assigned'}
            </p>
          </div>

          {/* Action buttons */}
          {isAdmin && application.status !== 'hired' && application.status !== 'refused' && (
            <div className="flex items-center gap-2 flex-wrap">
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
                <XCircle size={14} />
                Refuse
              </button>
              <button
                onClick={() => setShowHireModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              >
                <Award size={14} />
                Hire
              </button>
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
                  onClick={() => { setEditing(false); setEditForm(application); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-400 hover:text-white"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stage Progression Bar */}
      {stages.length > 0 && application.status !== 'hired' && application.status !== 'refused' && (
        <StageBar
          stages={stages}
          currentStageId={currentStageId}
          onStageClick={isAdmin ? handleMoveStage : undefined}
        />
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Candidate info card */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-4">
              Candidate Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User size={16} className="text-dark-500 flex-shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Name</p>
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.candidateName || ''}
                      onChange={(e) => handleEditChange('candidateName', e.target.value)}
                      className="input-field text-sm mt-0.5"
                    />
                  ) : (
                    <p className="text-white text-sm">{application.candidateName || '\u2014'}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-dark-500 flex-shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Email</p>
                  {editing ? (
                    <input
                      type="email"
                      value={editForm.candidateEmail || ''}
                      onChange={(e) => handleEditChange('candidateEmail', e.target.value)}
                      className="input-field text-sm mt-0.5"
                    />
                  ) : (
                    <p className="text-white text-sm">{application.candidateEmail || '\u2014'}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-dark-500 flex-shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Phone</p>
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.candidatePhone || ''}
                      onChange={(e) => handleEditChange('candidatePhone', e.target.value)}
                      className="input-field text-sm mt-0.5"
                    />
                  ) : (
                    <p className="text-white text-sm">{application.candidatePhone || '\u2014'}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Linkedin size={16} className="text-dark-500 flex-shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">LinkedIn</p>
                  {editing ? (
                    <input
                      type="url"
                      value={editForm.linkedinProfile || ''}
                      onChange={(e) => handleEditChange('linkedinProfile', e.target.value)}
                      className="input-field text-sm mt-0.5"
                    />
                  ) : application.linkedinProfile ? (
                    <a
                      href={application.linkedinProfile}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rivvra-400 hover:underline text-sm"
                    >
                      View Profile
                    </a>
                  ) : (
                    <p className="text-white text-sm">{'\u2014'}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Star size={16} className="text-dark-500 flex-shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Evaluation</p>
                  <div className="mt-0.5">
                    <EvalStars
                      value={editing ? (editForm.evaluation || 0) : (application.evaluation || 0)}
                      onChange={editing ? (val) => handleEditChange('evaluation', val) : undefined}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Job info card */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-4">
              Job Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Briefcase size={16} className="text-dark-500 flex-shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Position</p>
                  <p className="text-white text-sm">{application.jobName || application.jobId?.name || '\u2014'}</p>
                </div>
              </div>
              <div>
                <p className="text-dark-500 text-xs">Department</p>
                <p className="text-white text-sm">{application.department || application.jobId?.department || '\u2014'}</p>
              </div>
              <div>
                <p className="text-dark-500 text-xs">Recruiter</p>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.recruiterName || editForm.recruiter || ''}
                    onChange={(e) => handleEditChange('recruiterName', e.target.value)}
                    className="input-field text-sm mt-0.5"
                  />
                ) : (
                  <p className="text-white text-sm">{application.recruiterName || '\u2014'}</p>
                )}
              </div>
              <div>
                <p className="text-dark-500 text-xs">Account Owner</p>
                <p className="text-white text-sm">{application.accountOwner || '\u2014'}</p>
              </div>
              <div>
                <p className="text-dark-500 text-xs">Employment Type</p>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.employmentType || ''}
                    onChange={(e) => handleEditChange('employmentType', e.target.value)}
                    className="input-field text-sm mt-0.5"
                  />
                ) : (
                  <p className="text-white text-sm">{application.employmentType || '\u2014'}</p>
                )}
              </div>
              <div>
                <p className="text-dark-500 text-xs">Client</p>
                <p className="text-white text-sm">{application.client || application.jobId?.client || '\u2014'}</p>
              </div>

              {/* Salary Expected */}
              <div className="flex items-center gap-3">
                <DollarSign size={16} className="text-dark-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-dark-500 text-xs">Salary Expected</p>
                  {editing ? (
                    <input
                      type="number"
                      value={editForm.salaryExpected ?? ''}
                      onChange={(e) => handleEditChange('salaryExpected', e.target.value ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="input-field text-sm mt-0.5"
                    />
                  ) : (
                    <p className="text-white text-sm">
                      {application.salaryExpected ? `$${Number(application.salaryExpected).toLocaleString()}` : '\u2014'}
                    </p>
                  )}
                </div>
              </div>

              {/* Salary Proposed */}
              <div className="flex items-center gap-3">
                <DollarSign size={16} className="text-dark-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-dark-500 text-xs">Salary Proposed</p>
                  {editing ? (
                    <input
                      type="number"
                      value={editForm.salaryProposed ?? ''}
                      onChange={(e) => handleEditChange('salaryProposed', e.target.value ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="input-field text-sm mt-0.5"
                    />
                  ) : (
                    <p className="text-white text-sm">
                      {application.salaryProposed ? `$${Number(application.salaryProposed).toLocaleString()}` : '\u2014'}
                    </p>
                  )}
                </div>
              </div>

              {/* Account Manager */}
              <div className="flex items-center gap-3">
                <User size={16} className="text-dark-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-dark-500 text-xs">Account Manager</p>
                  {editing ? (
                    <select
                      value={editForm.accountManagerId || ''}
                      onChange={(e) => handleEditChange('accountManagerId', e.target.value || null)}
                      className="input-field text-sm mt-0.5"
                    >
                      <option value="">Select...</option>
                      {recruiters.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.name || r.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-white text-sm">
                      {application.accountManagerName || resolveUserName(application.accountManagerId)}
                    </p>
                  )}
                </div>
              </div>

              {/* Submitted By */}
              <div className="flex items-center gap-3">
                <User size={16} className="text-dark-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-dark-500 text-xs">Submitted By</p>
                  {editing ? (
                    <select
                      value={editForm.submittedById || ''}
                      onChange={(e) => handleEditChange('submittedById', e.target.value || null)}
                      className="input-field text-sm mt-0.5"
                    >
                      <option value="">Select...</option>
                      {recruiters.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.name || r.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-white text-sm">
                      {application.submittedByName || resolveUserName(application.submittedById)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div>
            <div className="flex items-center gap-1 border-b border-dark-700 mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.key
                      ? 'border-rivvra-500 text-rivvra-400'
                      : 'border-transparent text-dark-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Details Tab */}
            {activeTab === 'details' && (
              <div className="card p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-dark-500 text-xs mb-1">Source</p>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.source || ''}
                        onChange={(e) => handleEditChange('source', e.target.value)}
                        className="input-field text-sm"
                      />
                    ) : (
                      <p className="text-white text-sm">{application.source || '\u2014'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs mb-1">Medium</p>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.medium || ''}
                        onChange={(e) => handleEditChange('medium', e.target.value)}
                        className="input-field text-sm"
                      />
                    ) : (
                      <p className="text-white text-sm">{application.medium || '\u2014'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs mb-1">Degree</p>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.degree || ''}
                        onChange={(e) => handleEditChange('degree', e.target.value)}
                        className="input-field text-sm"
                      />
                    ) : (
                      <p className="text-white text-sm">{application.degree || '\u2014'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs mb-1">Availability</p>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.availability || ''}
                        onChange={(e) => handleEditChange('availability', e.target.value)}
                        className="input-field text-sm"
                      />
                    ) : (
                      <p className="text-white text-sm">{application.availability || '\u2014'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs mb-1">Applied Date</p>
                    <p className="text-white text-sm">{formatDate(application.appliedOn)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-dark-500 text-xs mb-1">Notes</p>
                  {editing ? (
                    <textarea
                      value={editForm.notes || ''}
                      onChange={(e) => handleEditChange('notes', e.target.value)}
                      rows={3}
                      className="input-field resize-none text-sm"
                    />
                  ) : (
                    <p className="text-dark-300 text-sm whitespace-pre-wrap">
                      {application.notes || 'No notes added.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Interview Tab */}
            {activeTab === 'interview' && (
              <div className="card p-5 space-y-5">
                {/* L1 Interview */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-white">L1 Interview</h3>
                    {!editing && <ResultBadge result={application.l1Result} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-dark-500 text-xs mb-1">Result</p>
                      {editing ? (
                        <select
                          value={editForm.l1Result || ''}
                          onChange={(e) => handleEditChange('l1Result', e.target.value || null)}
                          className="input-field text-sm"
                        >
                          <option value="">Select...</option>
                          <option value="awaited">Awaited</option>
                          <option value="selected">Selected</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      ) : (
                        <p className="text-white text-sm capitalize">{application.l1Result || '\u2014'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-dark-500 text-xs mb-1">Date &amp; Time</p>
                      {editing ? (
                        <input
                          type="datetime-local"
                          value={editForm.l1DateTime || ''}
                          onChange={(e) => handleEditChange('l1DateTime', e.target.value)}
                          className="input-field text-sm"
                        />
                      ) : (
                        <p className="text-white text-sm">{formatDateTime(application.l1DateTime)}</p>
                      )}
                    </div>
                    <div className="sm:col-span-1">
                      <p className="text-dark-500 text-xs mb-1">Notes</p>
                      {editing ? (
                        <textarea
                          value={editForm.l1Feedback || ''}
                          onChange={(e) => handleEditChange('l1Feedback', e.target.value)}
                          rows={2}
                          placeholder="Add feedback notes..."
                          className="input-field resize-none text-sm"
                        />
                      ) : (
                        <p className="text-dark-300 text-sm">{application.l1Feedback || '\u2014'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* L2 Interview */}
                <div className="border-t border-dark-700 pt-5">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-white">L2 Interview</h3>
                    {!editing && <ResultBadge result={application.l2Result} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-dark-500 text-xs mb-1">Result</p>
                      {editing ? (
                        <select
                          value={editForm.l2Result || ''}
                          onChange={(e) => handleEditChange('l2Result', e.target.value || null)}
                          className="input-field text-sm"
                        >
                          <option value="">Select...</option>
                          <option value="awaited">Awaited</option>
                          <option value="selected">Selected</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      ) : (
                        <p className="text-white text-sm capitalize">{application.l2Result || '\u2014'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-dark-500 text-xs mb-1">Date &amp; Time</p>
                      {editing ? (
                        <input
                          type="datetime-local"
                          value={editForm.l2DateTime || ''}
                          onChange={(e) => handleEditChange('l2DateTime', e.target.value)}
                          className="input-field text-sm"
                        />
                      ) : (
                        <p className="text-white text-sm">{formatDateTime(application.l2DateTime)}</p>
                      )}
                    </div>
                    <div className="sm:col-span-1">
                      <p className="text-dark-500 text-xs mb-1">Notes</p>
                      {editing ? (
                        <textarea
                          value={editForm.l2Feedback || ''}
                          onChange={(e) => handleEditChange('l2Feedback', e.target.value)}
                          rows={2}
                          placeholder="Add feedback notes..."
                          className="input-field resize-none text-sm"
                        />
                      ) : (
                        <p className="text-dark-300 text-sm">{application.l2Feedback || '\u2014'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* HR Interview */}
                <div className="border-t border-dark-700 pt-5">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-white">HR Interview</h3>
                    {!editing && <ResultBadge result={application.hrResult} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-dark-500 text-xs mb-1">Result</p>
                      {editing ? (
                        <select
                          value={editForm.hrResult || ''}
                          onChange={(e) => handleEditChange('hrResult', e.target.value || null)}
                          className="input-field text-sm"
                        >
                          <option value="">Select...</option>
                          <option value="awaited">Awaited</option>
                          <option value="selected">Selected</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      ) : (
                        <p className="text-white text-sm capitalize">{application.hrResult || '\u2014'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-dark-500 text-xs mb-1">Date &amp; Time</p>
                      {editing ? (
                        <input
                          type="datetime-local"
                          value={editForm.hrDateTime || ''}
                          onChange={(e) => handleEditChange('hrDateTime', e.target.value)}
                          className="input-field text-sm"
                        />
                      ) : (
                        <p className="text-white text-sm">{formatDateTime(application.hrDateTime)}</p>
                      )}
                    </div>
                    <div className="sm:col-span-1">
                      <p className="text-dark-500 text-xs mb-1">Notes</p>
                      {editing ? (
                        <textarea
                          value={editForm.hrRoundFeedback || ''}
                          onChange={(e) => handleEditChange('hrRoundFeedback', e.target.value)}
                          rows={2}
                          placeholder="Add feedback notes..."
                          className="input-field resize-none text-sm"
                        />
                      ) : (
                        <p className="text-dark-300 text-sm">{application.hrRoundFeedback || '\u2014'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hire Date */}
                <div className="border-t border-dark-700 pt-5">
                  <div>
                    <p className="text-dark-500 text-xs mb-1">Hire Date</p>
                    {editing ? (
                      <input
                        type="date"
                        value={editForm.hireDate || ''}
                        onChange={(e) => handleEditChange('hireDate', e.target.value)}
                        className="input-field text-sm max-w-xs"
                      />
                    ) : (
                      <p className="text-white text-sm">{formatDate(application.hireDate)}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Activities Tab */}
            {activeTab === 'activities' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-dark-400 uppercase tracking-wider">
                    Activities
                  </h3>
                  {isAdmin && (
                    <button
                      onClick={() => setShowActivityModal(true)}
                      className="flex items-center gap-1.5 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
                    >
                      <Plus size={14} />
                      Add Activity
                    </button>
                  )}
                </div>

                {activitiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
                  </div>
                ) : activities.length === 0 ? (
                  <div className="card p-8 text-center">
                    <MessageSquare className="w-8 h-8 text-dark-500 mx-auto mb-2" />
                    <p className="text-dark-400 text-sm">No activities yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activities.map((activity) => (
                      <div
                        key={activity._id}
                        className={`card p-4 flex items-start gap-3 ${
                          activity.done ? 'opacity-60' : ''
                        }`}
                      >
                        <button
                          onClick={() => !activity.done && handleMarkActivityDone(activity._id)}
                          disabled={activity.done}
                          className={`mt-0.5 flex-shrink-0 transition-colors ${
                            activity.done
                              ? 'text-emerald-400'
                              : 'text-dark-600 hover:text-emerald-400'
                          }`}
                        >
                          <CheckCircle2 size={18} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${activity.done ? 'text-dark-400 line-through' : 'text-white'}`}>
                            {activity.summary}
                          </p>
                          {activity.dueDate && (
                            <div className="flex items-center gap-1 mt-1">
                              <Clock size={10} className="text-dark-500" />
                              <span className="text-dark-500 text-xs">
                                Due {formatDate(activity.dueDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Quick info */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-4">
              Quick Info
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-dark-500" />
                <div>
                  <p className="text-dark-500 text-xs">Applied</p>
                  <p className="text-white text-sm">{formatDate(application.appliedOn)}</p>
                </div>
              </div>
              <div>
                <p className="text-dark-500 text-xs">Source</p>
                <p className="text-white text-sm">{application.source || '\u2014'}</p>
              </div>
              <div>
                <p className="text-dark-500 text-xs">Last Updated</p>
                <p className="text-white text-sm">{formatDate(application.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={14} className="text-dark-500" />
              <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider">
                Tags
              </h2>
            </div>
            {(application.tags && application.tags.length > 0) ? (
              <div className="flex flex-wrap gap-1.5">
                {application.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 text-dark-300"
                  >
                    {typeof tag === 'string' ? tag : tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-dark-500 text-xs">No tags</p>
            )}
          </div>

          {/* Refuse reason (if refused) */}
          {application.status === 'refused' && (
            <div className="card p-5 border-red-500/20">
              <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">
                Refused
              </h2>
              <p className="text-dark-300 text-sm">
                {application.refuseReason || 'No reason provided'}
              </p>
              {application.refusedAt && (
                <p className="text-dark-500 text-xs mt-2">
                  Refused on {formatDate(application.refusedAt)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <RefuseModal
        show={showRefuseModal}
        onClose={() => setShowRefuseModal(false)}
        onConfirm={handleRefuse}
        reasons={refuseReasons}
        saving={saving}
      />
      <HireModal
        show={showHireModal}
        onClose={() => setShowHireModal(false)}
        onConfirm={handleHire}
        saving={saving}
      />
      <AddActivityModal
        show={showActivityModal}
        onClose={() => setShowActivityModal(false)}
        onSaved={fetchActivities}
        orgSlug={orgSlug}
        applicationId={applicationId}
      />
    </div>
  );
}
