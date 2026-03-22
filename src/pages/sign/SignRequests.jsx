import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  Loader2, Plus, FileText, Search, X,
  ChevronLeft, ChevronRight, ChevronDown,
  Bell, XCircle, Send, User, Calendar,
  ArrowRight, ArrowLeft, Check, Mail,
  MessageSquare, GripVertical,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ── Status badge helper ──────────────────────────────────────────────── */
const STATUS_STYLES = {
  sent:      'bg-blue-500/10 text-blue-400',
  signed:    'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-red-500/10 text-red-400',
  expired:   'bg-orange-500/10 text-orange-400',
  draft:     'bg-dark-700 text-dark-400',
  refused:   'bg-red-500/10 text-red-400',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.draft;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

/* ── FilterChip ───────────────────────────────────────────────────────── */
function FilterChip({ label, value, options, isOpen, onToggle, onSelect }) {
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption && value ? selectedOption.label : label;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
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
                    ? 'bg-indigo-500/10 text-indigo-400'
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

/* ── Sortable Signer Card (drag-to-reorder) ──────────────────────────── */
function SortableSignerCard({ signer, idx, totalSigners, updateSigner, removeSigner, roles }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: signer._dragId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-dark-900 rounded-xl p-4 border border-dark-700 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-dark-500 hover:text-dark-300 transition-colors touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center">
            {idx + 1}
          </span>
          <span className="text-xs font-semibold text-dark-400 uppercase tracking-wide">
            Signer {idx + 1}
            {signer.roleName ? ` \u2014 ${signer.roleName}` : ''}
          </span>
        </div>
        {totalSigners > 1 && (
          <button
            onClick={() => removeSigner(idx)}
            className="text-dark-500 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            value={signer.name}
            onChange={(e) => updateSigner(idx, 'name', e.target.value)}
            placeholder="John Doe"
            className="input-field text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            required
            value={signer.email}
            onChange={(e) => updateSigner(idx, 'email', e.target.value)}
            placeholder="john@example.com"
            className="input-field text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1">Role</label>
        {signer.roleId ? (
          <div className="px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-300 flex items-center gap-2">
            <User size={14} className="text-indigo-400" />
            {signer.roleName || 'Assigned Role'}
          </div>
        ) : (
          <select
            value={signer.roleId || ''}
            onChange={(e) => {
              const role = roles.find((r) => (r._id || r.id) === e.target.value);
              updateSigner(idx, 'roleId', e.target.value);
              updateSigner(idx, 'roleName', role?.name || '');
            }}
            className="input-field text-sm"
          >
            <option value="">Select role (optional)</option>
            {roles.map((r) => (
              <option key={r._id || r.id} value={r._id || r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/* ── New Request Modal ────────────────────────────────────────────────── */
let _signerIdCounter = 0;
const makeSignerId = () => `signer_${++_signerIdCounter}_${Date.now()}`;
const EMPTY_SIGNER = () => ({ _dragId: makeSignerId(), name: '', email: '', roleId: '', roleName: '' });

function NewRequestModal({ show, onClose, onSaved, orgSlug }) {
  const modalRef = useRef(null);
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [signers, setSigners] = useState([EMPTY_SIGNER()]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show && orgSlug) {
      setStep(1);
      setSelectedTemplate(null);
      setSigners([EMPTY_SIGNER()]);
      setSubject('');
      setMessage('');
      setValidityDate('');
      setCcEmails('');
      setLoadingTemplates(true);
      Promise.all([
        signApi.listTemplates(orgSlug).then((res) => res.templates || []).catch(() => []),
        signApi.listRoles(orgSlug).then((res) => res.roles || []).catch(() => []),
      ]).then(([tmpls, rls]) => {
        setTemplates(tmpls);
        setRoles(rls);
      }).finally(() => setLoadingTemplates(false));
    }
  }, [show, orgSlug]);

  // When template is selected, prefill signers from template's signItem roles
  useEffect(() => {
    if (selectedTemplate) {
      // Extract unique roleIds from this template's signItems
      const roleIdSet = new Set();
      (selectedTemplate.signItems || []).forEach((item) => {
        if (item.roleId) roleIdSet.add(item.roleId);
      });
      const uniqueRoleIds = [...roleIdSet];

      if (uniqueRoleIds.length > 0) {
        setSigners(uniqueRoleIds.map((rid) => {
          const role = roles.find((r) => (r._id || r.id) === rid);
          return { _dragId: makeSignerId(), name: '', email: '', roleId: rid, roleName: role?.name || 'Signer' };
        }));
      } else {
        setSigners([EMPTY_SIGNER()]);
      }
      setSubject(selectedTemplate.name ? `Please sign: ${selectedTemplate.name}` : '');
    }
  }, [selectedTemplate, roles]);

  const updateSigner = (idx, field, value) => {
    setSigners((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addSigner = () => {
    setSigners((prev) => [...prev, EMPTY_SIGNER()]);
  };

  // dnd-kit sensors — require 8px drag before activating (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSigners((prev) => {
      const oldIdx = prev.findIndex((s) => s._dragId === active.id);
      const newIdx = prev.findIndex((s) => s._dragId === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(oldIdx, 1);
      updated.splice(newIdx, 0, moved);
      return updated;
    });
  };

  const removeSigner = (idx) => {
    if (signers.length <= 1) return;
    setSigners((prev) => prev.filter((_, i) => i !== idx));
  };

  const canGoNext = () => {
    if (step === 1) return !!selectedTemplate;
    if (step === 2) return signers.every((s) => s.name.trim() && s.email.trim());
    if (step === 3) return true;
    return true;
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const data = {
        templateId: selectedTemplate._id,
        signers: signers.map((s) => ({
          name: s.name.trim(),
          email: s.email.trim(),
          roleId: s.roleId || undefined,
          roleName: s.roleName || undefined,
        })),
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        validity: validityDate || undefined,
        ccEmails: ccEmails
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
      };
      const res = await signApi.createRequest(orgSlug, data);
      if (res.success !== false) {
        showToast('Signature request created and sent');
        onSaved();
        onClose();
      } else {
        showToast(res.message || 'Failed to create request', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to create request', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  const stepLabels = ['Select Template', 'Add Signers', 'Options', 'Review & Send'];

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
        aria-labelledby="request-modal-title"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-2xl my-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="request-modal-title" className="text-lg font-semibold text-white">
            New Signature Request
          </h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6">
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === step;
            const isDone = stepNum < step;
            return (
              <div key={stepNum} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isActive
                      ? 'bg-indigo-500 text-white'
                      : isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-dark-700 text-dark-500'
                  }`}
                >
                  {isDone ? <Check size={12} /> : stepNum}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${
                    isActive ? 'text-white' : 'text-dark-500'
                  }`}
                >
                  {label}
                </span>
                {i < stepLabels.length - 1 && (
                  <div className="flex-1 h-px bg-dark-700 hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Select Template */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Choose a template <span className="text-red-400">*</span>
            </label>
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <FileText size={32} className="text-dark-500 mx-auto mb-2" />
                <p className="text-dark-400 text-sm">No templates available. Upload a template first.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {templates.map((tpl) => (
                  <button
                    key={tpl._id}
                    onClick={() => setSelectedTemplate(tpl)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${
                      selectedTemplate?._id === tpl._id
                        ? 'bg-indigo-500/10 border-indigo-500/30'
                        : 'bg-dark-900 border-dark-700 hover:border-dark-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                      <FileText size={18} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium truncate">{tpl.name}</p>
                      <p className="text-dark-400 text-xs mt-0.5">
                        {tpl.numPages || tpl.pageCount || tpl.pages || 0} pages
                        {tpl.signItems?.length ? ` \u2022 ${tpl.signItems.length} fields` : ''}
                      </p>
                    </div>
                    {selectedTemplate?._id === tpl._id && (
                      <Check size={18} className="text-indigo-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Add Signers (drag to reorder) */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-dark-400 mb-2">
              Add signers and drag to reorder. They will sign in this order.
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={signers.map((s) => s._dragId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {signers.map((signer, idx) => (
                    <SortableSignerCard
                      key={signer._dragId}
                      signer={signer}
                      idx={idx}
                      totalSigners={signers.length}
                      updateSigner={updateSigner}
                      removeSigner={removeSigner}
                      roles={roles}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <button
              type="button"
              onClick={addSigner}
              className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Plus size={14} />
              Add another signer
            </button>
          </div>
        )}

        {/* Step 3: Options */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Please sign: NDA Agreement"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional message to include in the signing email..."
                rows={3}
                className="input-field resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Validity Date</label>
                <input
                  type="date"
                  value={validityDate}
                  onChange={(e) => setValidityDate(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">CC Emails</label>
                <input
                  type="text"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="comma separated emails"
                  className="input-field"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review & Send */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-dark-900 rounded-xl p-5 border border-dark-700 space-y-4">
              {/* Template */}
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-indigo-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-dark-500 uppercase tracking-wide">Template</p>
                  <p className="text-white font-medium">{selectedTemplate?.name || 'None'}</p>
                </div>
              </div>

              {/* Subject */}
              {subject && (
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-dark-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-dark-500 uppercase tracking-wide">Subject</p>
                    <p className="text-dark-300 text-sm">{subject}</p>
                  </div>
                </div>
              )}

              {/* Message */}
              {message && (
                <div className="flex items-start gap-3">
                  <MessageSquare size={16} className="text-dark-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-dark-500 uppercase tracking-wide">Message</p>
                    <p className="text-dark-300 text-sm whitespace-pre-wrap">{message}</p>
                  </div>
                </div>
              )}

              {/* Validity */}
              {validityDate && (
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-dark-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-dark-500 uppercase tracking-wide">Valid Until</p>
                    <p className="text-dark-300 text-sm">{validityDate}</p>
                  </div>
                </div>
              )}

              {/* Signers (with signing order) */}
              <div>
                <p className="text-xs text-dark-500 uppercase tracking-wide mb-2">
                  Signing Order ({signers.length} {signers.length === 1 ? 'signer' : 'signers'})
                </p>
                <div className="space-y-2">
                  {signers.map((s, i) => (
                    <div key={s._dragId || i} className="flex items-center gap-3 bg-dark-800 rounded-lg px-3 py-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{s.name}</p>
                        <p className="text-dark-400 text-xs truncate">{s.email}</p>
                      </div>
                      {s.roleName && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-dark-700 text-dark-400">
                          {s.roleName}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* CC */}
              {ccEmails && (
                <div>
                  <p className="text-xs text-dark-500 uppercase tracking-wide mb-1">CC</p>
                  <p className="text-dark-400 text-sm">{ccEmails}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-3 pt-5 mt-5 border-t border-dark-700">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-dark-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canGoNext()}
                className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                <Send size={14} />
                Send Request
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main SignRequests Component ───────────────────────────────────────── */
export default function SignRequests() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const orgSlug = currentOrg?.slug;

  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [openFilter, setOpenFilter] = useState(null);

  // Dropdown data
  const [templates, setTemplates] = useState([]);

  // Modal
  const [showModal, setShowModal] = useState(false);

  // Action loading
  const [cancellingId, setCancellingId] = useState(null);
  const [remindingId, setRemindingId] = useState(null);

  const debounceRef = useRef(null);

  // Check if ?create=true in URL
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowModal(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const activeFilterCount = [statusFilter, templateFilter].filter(Boolean).length;

  // ── Fetch requests ─────────────────────────────────────────────────────
  const fetchRequests = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await signApi.listRequests(orgSlug, {
        page: params.page || page,
        limit: 20,
        search: params.search !== undefined ? params.search : search,
        state: params.status !== undefined ? params.status : statusFilter,
        templateId: params.templateId !== undefined ? params.templateId : templateFilter,
      });
      if (res.success !== false) {
        setRequests(res.requests || []);
        setTotal(res.total || 0);
        setTotalPages(res.pages || res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load requests:', err);
      showToast('Failed to load requests', 'error');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, search, statusFilter, templateFilter, showToast]);

  const fetchTemplates = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const res = await signApi.listTemplates(orgSlug);
      if (res.success !== false) setTemplates(res.templates || []);
    } catch {
      /* ignore */
    }
  }, [orgSlug]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchRequests({ search: value, page: 1 });
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
    setTemplateFilter('');
    setPage(1);
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

  // Actions
  const handleCancel = async (e, requestId) => {
    e.stopPropagation();
    if (!window.confirm('Cancel this signature request? This cannot be undone.')) return;
    try {
      setCancellingId(requestId);
      const res = await signApi.cancelRequest(orgSlug, requestId);
      if (res.success !== false) {
        showToast('Request cancelled');
        fetchRequests();
      } else {
        showToast(res.message || 'Failed to cancel', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to cancel request', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const handleRemind = async (e, requestId) => {
    e.stopPropagation();
    try {
      setRemindingId(requestId);
      const res = await signApi.remindSigners(orgSlug, requestId);
      if (res.success !== false) {
        showToast('Reminder sent to pending signers');
      } else {
        showToast(res.message || 'Failed to send reminder', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send reminder', 'error');
    } finally {
      setRemindingId(null);
    }
  };

  // Filter options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'sent', label: 'Sent' },
    { value: 'signed', label: 'Signed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'expired', label: 'Expired' },
    { value: 'refused', label: 'Refused' },
  ];

  const templateOptions = [
    { value: '', label: 'All Templates' },
    ...templates.map((t) => ({ value: t._id, label: t.name })),
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const pageStart = total === 0 ? 0 : (page - 1) * 20 + 1;
  const pageEnd = Math.min(page * 20, total);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Signature Requests</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'request' : 'requests'} total
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2 self-start"
        >
          <Plus size={16} />
          New Request
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search by document name or signer..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="input-field w-full pl-10"
          aria-label="Search requests"
        />
      </div>

      {/* Filter chips */}
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
          label="Template"
          value={templateFilter}
          options={templateOptions}
          isOpen={openFilter === 'template'}
          onToggle={() => toggleFilter('template')}
          onSelect={handleFilterSelect(setTemplateFilter)}
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
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No requests found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {search || statusFilter || templateFilter
              ? 'Try adjusting your search or filters.'
              : 'Create your first signature request to get started.'}
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
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Document</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Template</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Signers</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Created</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Created By</th>
                    <th className="text-right px-4 py-3 text-dark-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => {
                    const totalSigners = req.signers?.length || 0;
                    const signedCount = req.signers?.filter((s) => s.state === 'completed').length || 0;

                    return (
                      <tr
                        key={req._id}
                        onClick={() => navigate(orgPath(`/sign/requests/${req._id}`))}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                              <FileText size={14} className="text-indigo-400" />
                            </div>
                            <span className="text-white font-medium truncate max-w-[180px]">
                              {req.reference || req.name || 'Untitled'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                          <span className="truncate block max-w-[150px]">
                            {req.templateName || req.template?.name || '\u2014'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.state} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-dark-700 rounded-full h-1.5 w-16">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all"
                                style={{ width: totalSigners > 0 ? `${(signedCount / totalSigners) * 100}%` : '0%' }}
                              />
                            </div>
                            <span className="text-dark-400 text-xs whitespace-nowrap">
                              {signedCount}/{totalSigners}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-xs hidden sm:table-cell">
                          {formatDate(req.createdAt)}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-dark-300 text-xs truncate block max-w-[120px]">
                            {req.createdByName || req.createdBy?.name || '\u2014'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {req.state === 'sent' && (
                              <>
                                <button
                                  onClick={(e) => handleRemind(e, req._id)}
                                  disabled={remindingId === req._id}
                                  className="text-dark-400 hover:text-blue-400 transition-colors p-1.5 rounded hover:bg-dark-700 disabled:opacity-30"
                                  title="Send reminder"
                                >
                                  {remindingId === req._id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Bell size={14} />
                                  )}
                                </button>
                                <button
                                  onClick={(e) => handleCancel(e, req._id)}
                                  disabled={cancellingId === req._id}
                                  className="text-dark-400 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-dark-700 disabled:opacity-30"
                                  title="Cancel request"
                                >
                                  {cancellingId === req._id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <XCircle size={14} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                            ? 'bg-indigo-500 text-white'
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

      {/* New Request Modal */}
      <NewRequestModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => fetchRequests({ page: 1 })}
        orgSlug={orgSlug}
      />
    </div>
  );
}
