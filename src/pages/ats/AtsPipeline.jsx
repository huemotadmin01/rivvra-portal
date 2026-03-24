import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Search, Plus, Loader2, GripVertical, ChevronDown,
  Star, X, Calendar, User, Mail, Briefcase,
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
            size={14}
            className={i < value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
          />
        </button>
      ))}
    </div>
  );
}

/* ── Kanban Card (draggable) ──────────────────────────────────────────── */
function KanbanCard({ application, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-dark-800 rounded-lg p-3 border border-dark-700 hover:border-dark-600 cursor-grab active:cursor-grabbing transition-colors group ${
        isDragging ? 'opacity-50' : ''
      }`}
      onClick={(e) => {
        // Don't navigate when dragging
        if (!isDragging) onClick?.(application);
      }}
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 text-dark-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate flex items-center gap-1.5">
            {application.candidateName || 'Unnamed'}
            {application.kanbanState === 'done' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
            )}
            {application.kanbanState === 'blocked' && (
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block flex-shrink-0" />
            )}
          </p>
          {application.jobName && (
            <p className="text-dark-400 text-xs truncate mt-0.5">
              {application.jobName}
            </p>
          )}
          {application.candidateEmail && (
            <div className="flex items-center gap-1 mt-1">
              <Mail size={10} className="text-dark-500" />
              <p className="text-dark-500 text-xs truncate">{application.candidateEmail}</p>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <EvalStars value={application.evaluation || 0} />
            <div className="flex items-center gap-2">
              {application.recruiterName && (
                <div className="flex items-center gap-1">
                  <User size={10} className="text-dark-500" />
                  <span className="text-dark-500 text-xs truncate max-w-[60px]">
                    {application.recruiterName}
                  </span>
                </div>
              )}
              {application.appliedOn && (
                <div className="flex items-center gap-1">
                  <Calendar size={10} className="text-dark-500" />
                  <span className="text-dark-500 text-xs">{formatDate(application.appliedOn)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Kanban Card Overlay (shown while dragging) ───────────────────────── */
function KanbanCardOverlay({ application }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-dark-800 rounded-lg p-3 border border-rivvra-500/40 shadow-lg shadow-rivvra-500/10 w-[268px]">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-dark-600 flex-shrink-0">
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {application.candidateName || 'Unnamed'}
          </p>
          {application.jobName && (
            <p className="text-dark-400 text-xs truncate mt-0.5">{application.jobName}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <EvalStars value={application.evaluation || 0} />
            {application.appliedOn && (
              <span className="text-dark-500 text-xs">{formatDate(application.appliedOn)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Kanban Column ────────────────────────────────────────────────────── */
function KanbanColumn({ stage, applications, totalCount, onCardClick, onLoadMore }) {
  const ids = applications.map((a) => a._id);
  const hasMore = totalCount > applications.length;

  return (
    <div className="bg-dark-900/50 rounded-lg min-w-[300px] max-w-[300px] flex flex-col max-h-[calc(100vh-220px)]">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-dark-700/50">
        <h3 className="text-white font-semibold text-sm truncate">{stage.name}</h3>
        <span className="bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 text-xs font-medium">
          {totalCount}
        </span>
      </div>

      {/* Droppable card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {applications.map((app) => (
            <KanbanCard key={app._id} application={app} onClick={onCardClick} />
          ))}
        </SortableContext>

        {applications.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-dark-500 text-xs">No applications</p>
          </div>
        )}

        {hasMore && (
          <button
            onClick={() => onLoadMore?.(stage._id)}
            className="w-full py-2 text-xs text-dark-400 hover:text-rivvra-400 transition-colors rounded-lg hover:bg-dark-800"
          >
            Load more ({totalCount - applications.length} remaining)
          </button>
        )}
      </div>
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
  salaryExpected: '',
  salaryProposed: '',
  kanbanState: 'normal',
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
        salaryExpected: form.salaryExpected ? Number(form.salaryExpected) : undefined,
        salaryProposed: form.salaryProposed ? Number(form.salaryProposed) : undefined,
        kanbanState: form.kanbanState || 'normal',
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

          {/* LinkedIn Profile */}
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
              <div className="flex items-center h-[42px]">
                <EvalStars
                  value={form.evaluation}
                  onChange={(val) => handleChange('evaluation', val)}
                />
              </div>
            </div>
          </div>

          {/* Expected & Proposed Salary */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Expected Salary</label>
              <input
                type="number"
                value={form.salaryExpected}
                onChange={(e) => handleChange('salaryExpected', e.target.value)}
                placeholder="e.g. 80000"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Proposed Salary</label>
              <input
                type="number"
                value={form.salaryProposed}
                onChange={(e) => handleChange('salaryProposed', e.target.value)}
                placeholder="e.g. 75000"
                className="input-field"
              />
            </div>
          </div>

          {/* Kanban State */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Kanban State</label>
            <select
              value={form.kanbanState}
              onChange={(e) => handleChange('kanbanState', e.target.value)}
              className="input-field"
            >
              <option value="normal">Normal</option>
              <option value="done">Ready</option>
              <option value="blocked">Blocked</option>
            </select>
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
export default function AtsPipeline() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // ── Fetch kanban data ──────────────────────────────────────────────────
  const fetchKanban = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.getKanban(orgSlug, {
        search: params.search !== undefined ? params.search : search,
        jobId: params.jobId !== undefined ? params.jobId : jobFilter,
        recruiter: params.recruiter !== undefined ? params.recruiter : recruiterFilter,
      });
      if (res.success) {
        setColumns(res.kanban || []);
      }
    } catch (err) {
      console.error('Failed to load pipeline:', err);
      showToast('Failed to load pipeline', 'error');
      setColumns([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, search, jobFilter, recruiterFilter, showToast]);

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

  useEffect(() => { fetchKanban(); }, [fetchKanban]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchKanban({ search: value });
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFilterSelect = (setter, key) => (val) => {
    setter(val);
    setOpenFilter(null);
    fetchKanban({ [key]: val });
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

  // Build filter options
  const jobOptions = [
    { value: '', label: 'All Positions' },
    ...jobs.map((j) => ({ value: j._id, label: j.name })),
  ];

  const recruiterOptions = [
    { value: '', label: 'All Recruiters' },
    ...recruiters.map((r) => ({ value: r._id, label: r.name })),
  ];

  // ── Drag handlers ──────────────────────────────────────────────────────
  const findAppInColumns = (appId) => {
    for (const col of columns) {
      const app = (col.applications || []).find((a) => a._id === appId);
      if (app) return { app, stageId: col.stage?._id || col._id };
    }
    return null;
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const found = findAppInColumns(active.id);
    if (found) setActiveCard(found.app);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over || !active) return;

    const sourceInfo = findAppInColumns(active.id);
    if (!sourceInfo) return;

    // Determine the target stage: if dropped on another card, find its column
    // If dropped on a column droppable, use that stage
    let targetStageId = null;

    // Check if "over" is a card in another column
    const overInfo = findAppInColumns(over.id);
    if (overInfo) {
      targetStageId = overInfo.stageId;
    } else {
      // over.id might be a stage/column id
      targetStageId = over.id;
    }

    if (!targetStageId || targetStageId === sourceInfo.stageId) return;

    // Optimistic update: move card in local state
    const prevColumns = [...columns];
    setColumns((prev) =>
      prev.map((col) => {
        const colStageId = col.stage?._id || col._id;
        if (colStageId === sourceInfo.stageId) {
          return {
            ...col,
            applications: (col.applications || []).filter((a) => a._id !== active.id),
            totalCount: (col.totalCount || 0) - 1,
          };
        }
        if (colStageId === targetStageId) {
          return {
            ...col,
            applications: [...(col.applications || []), sourceInfo.app],
            totalCount: (col.totalCount || 0) + 1,
          };
        }
        return col;
      })
    );

    try {
      await atsApi.moveStage(orgSlug, active.id, targetStageId);
      showToast('Application moved');
    } catch (err) {
      // Revert on error
      setColumns(prevColumns);
      showToast(err.message || 'Failed to move application', 'error');
    }
  };

  const handleDragCancel = () => {
    setActiveCard(null);
  };

  // Navigate to application detail
  const handleCardClick = (application) => {
    navigate(orgPath(`/ats/applications/${application._id}`));
  };

  // Load more for a column
  const handleLoadMore = async (stageId) => {
    if (!orgSlug) return;
    const col = columns.find((c) => (c.stage?._id || c._id) === stageId);
    if (!col) return;
    const currentCount = (col.applications || []).length;

    try {
      const res = await atsApi.getKanban(orgSlug, {
        search,
        jobId: jobFilter,
        recruiter: recruiterFilter,
        stageId,
        offset: currentCount,
      });
      if (res.success && res.kanban) {
        const stageData = res.kanban.find((s) => (s.stage?._id || s._id) === stageId);
        if (stageData) {
          setColumns((prev) =>
            prev.map((c) => {
              const cId = c.stage?._id || c._id;
              if (cId === stageId) {
                return {
                  ...c,
                  applications: [...(c.applications || []), ...(stageData.applications || [])],
                };
              }
              return c;
            })
          );
        }
      }
    } catch (err) {
      showToast('Failed to load more applications', 'error');
    }
  };

  // Collect all application IDs for DndContext
  const allAppIds = columns.flatMap((col) => (col.applications || []).map((a) => a._id));

  return (
    <div className="p-6 md:p-8 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline</h1>
          <p className="text-dark-400 text-sm mt-1">
            Drag and drop candidates across stages
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

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-field w-full pl-9 text-sm"
            aria-label="Search candidates"
          />
        </div>
        <FilterChip
          label="Job Position"
          value={jobFilter}
          options={jobOptions}
          isOpen={openFilter === 'job'}
          onToggle={() => toggleFilter('job')}
          onSelect={handleFilterSelect(setJobFilter, 'jobId')}
        />
        <FilterChip
          label="Recruiter"
          value={recruiterFilter}
          options={recruiterOptions}
          isOpen={openFilter === 'recruiter'}
          onToggle={() => toggleFilter('recruiter')}
          onSelect={handleFilterSelect(setRecruiterFilter, 'recruiter')}
        />
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : columns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No stages configured</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            Set up pipeline stages in ATS Settings to start tracking candidates.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {columns.map((col) => {
              const stageId = col.stage?._id || col._id;
              const stageName = col.stage?.name || col.name || 'Unknown';
              return (
                <KanbanColumn
                  key={stageId}
                  stage={{ _id: stageId, name: stageName }}
                  applications={col.applications || []}
                  totalCount={col.totalCount || (col.applications || []).length}
                  onCardClick={handleCardClick}
                  onLoadMore={handleLoadMore}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeCard ? <KanbanCardOverlay application={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* New Application Modal */}
      <NewApplicationModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => fetchKanban()}
        orgSlug={orgSlug}
        jobs={jobs}
        stages={stages}
        recruiters={recruiters}
      />
    </div>
  );
}
