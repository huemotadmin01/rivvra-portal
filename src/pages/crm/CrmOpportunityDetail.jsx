import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { toDateInputValue } from '../../utils/dateUtils';
import { formatMoney, currencySymbol } from '../../utils/currency';
import ActivityPanel from '../../components/shared/ActivityPanel';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import {
  Building2, User, Phone, Mail, Briefcase, Trophy,
  Linkedin, Calendar, Tag, Megaphone,
  Check, X, Edit3, Trash2, Loader2, XCircle, RotateCcw,
  ExternalLink, Unlink,
} from 'lucide-react';

function StageBar({ stages, currentStageId, isLost, isWon, stageHistory = [], onStageClick }) {
  const currentIdx = stages.findIndex(s => s._id === currentStageId);
  const enteredAtByStage = useMemo(() => {
    const map = {};
    for (const sh of stageHistory) {
      // last entry wins (most recent visit)
      if (sh?.stageId) map[sh.stageId] = sh.enteredAt;
    }
    return map;
  }, [stageHistory]);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((s, i) => {
        const isActive = s._id === currentStageId;
        const isPast = i < currentIdx;
        let colorClass = 'bg-dark-700 text-dark-400 border-dark-600';
        if (isLost) colorClass = isActive ? 'bg-red-500/20 text-red-400 border-red-500/30' : isPast ? 'bg-dark-600 text-dark-400 border-dark-500' : 'bg-dark-700 text-dark-500 border-dark-600';
        else if (isActive) colorClass = s.isWonStage ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-rivvra-500/20 text-rivvra-400 border-rivvra-500/30';
        else if (isPast) colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

        const enteredAt = enteredAtByStage[s._id];
        const tooltip = enteredAt ? `${s.name} · entered ${new Date(enteredAt).toLocaleDateString()}` : s.name;

        return (
          <button
            key={s._id}
            onClick={() => onStageClick(s._id)}
            title={tooltip}
            className={`px-3 py-1 text-xs rounded-full border transition-colors hover:opacity-80 ${colorClass}`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

export default function CrmOpportunityDetail() {
  const { orgSlug: slug } = useOrg();
  const { opportunityId } = useParams();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [opp, setOpp] = useState(null);
  const [stages, setStages] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showLostModal, setShowLostModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetachModal, setShowDetachModal] = useState(false);
  const [showStageDetachModal, setShowStageDetachModal] = useState(null); // pendingStageId
  const [errorFields, setErrorFields] = useState(new Set());
  const [notesDraft, setNotesDraft] = useState('');
  const fieldRefs = useRef({});

  const fetchAll = useCallback(async () => {
    try {
      const [oppRes, stagesRes, reasonsRes] = await Promise.all([
        crmApi.getOpportunity(slug, opportunityId),
        crmApi.listStages(slug),
        crmApi.listLostReasons(slug),
      ]);
      if (oppRes.success) {
        setOpp(oppRes.opportunity);
        setNotesDraft(oppRes.opportunity?.notes || '');
      }
      if (stagesRes.success) setStages(stagesRes.stages || []);
      if (reasonsRes.success) setLostReasons(reasonsRes.reasons || []);
    } catch {
      addToast('Failed to load opportunity', 'error');
    } finally {
      setLoading(false);
    }
  }, [slug, opportunityId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const clearErrorField = (field) => {
    setErrorFields(prev => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const handleFieldSave = async (field, rawValue) => {
    let value = rawValue;
    // Numeric coercion for known number fields
    if (field === 'expectedRevenue') {
      if (rawValue === '' || rawValue == null) {
        value = null;
      } else {
        const n = Number(rawValue);
        if (!Number.isFinite(n) || n < 0) {
          addToast('Expected Revenue must be a positive number', 'error');
          return;
        }
        value = n;
      }
    }
    try {
      await crmApi.updateOpportunity(slug, opportunityId, { [field]: value });
      setOpp(prev => ({ ...prev, [field]: value }));
      setEditing(null);
      clearErrorField(field);
      addToast('Updated', 'success');
    } catch {
      addToast('Failed to update', 'error');
    }
  };

  const performStageChange = async (stageId) => {
    try {
      const res = await crmApi.moveStage(slug, opportunityId, stageId);
      await fetchAll();
      if (res.jobCreated) {
        addToast(`Won! Job Position "${res.jobCreated.jobName}" created in ATS`, 'success');
      } else if (res.isWonStage) {
        addToast('Marked as Won!', 'success');
      } else {
        addToast('Stage updated', 'success');
      }
    } catch {
      addToast('Failed to move stage', 'error');
    }
  };

  const handleStageChange = (stageId) => {
    const targetStage = stages.find(s => s._id === stageId);
    const currentStage = stages.find(s => s._id === opp?.stageId);
    // Confirm before detaching: leaving Won stage on a converted opp
    if (
      opp?.isConverted &&
      currentStage?.isWonStage &&
      targetStage &&
      !targetStage.isWonStage
    ) {
      setShowStageDetachModal(stageId);
      return;
    }
    performStageChange(stageId);
  };

  const handleWon = () => {
    const wonStage = stages.find(s => s.isWonStage);
    if (!wonStage) {
      addToast('No Won stage configured', 'error');
      return;
    }
    handleStageChange(wonStage._id);
  };

  const handleLost = async (reasonId) => {
    try {
      await crmApi.markLost(slug, opportunityId, reasonId);
      setShowLostModal(false);
      fetchAll();
      addToast('Marked as Lost', 'success');
    } catch {
      addToast('Failed', 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await crmApi.restore(slug, opportunityId);
      fetchAll();
      addToast('Restored', 'success');
    } catch {
      addToast('Failed', 'error');
    }
  };

  const focusFieldEditor = (field) => {
    const node = fieldRefs.current[field];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Click triggers EditableField's edit mode
    setTimeout(() => node.click?.(), 250);
  };

  const handleConvert = async () => {
    const missing = [];
    if (!opp.expectedRole?.trim()) missing.push('expectedRole');
    if (!opp.expectedRevenue) missing.push('expectedRevenue');
    if (missing.length > 0) {
      setErrorFields(new Set(missing));
      addToast(`Missing required field: ${missing[0] === 'expectedRole' ? 'Expected Role' : 'Expected Revenue'}`, 'error');
      focusFieldEditor(missing[0]);
      return;
    }
    setConverting(true);
    try {
      const res = await crmApi.convertToJob(slug, opportunityId);
      if (res.success) {
        fetchAll();
        addToast(`Job Position "${res.jobName}" created!`, 'success');
      }
    } catch (err) {
      addToast(err?.error || 'Failed to convert', 'error');
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await crmApi.deleteOpportunity(slug, opportunityId);
      setShowDeleteModal(false);
      navigate(`/org/${slug}/crm/opportunities`, { replace: true });
      addToast('Opportunity deleted successfully', 'success');
    } catch {
      addToast('Failed to delete opportunity', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDetach = async () => {
    try {
      await crmApi.detachJob(slug, opportunityId);
      setShowDetachModal(false);
      fetchAll();
      addToast('Detached from Job Position', 'success');
    } catch {
      addToast('Failed to detach', 'error');
    }
  };

  const handleStageDetachConfirm = async (stageId) => {
    setShowStageDetachModal(null);
    try {
      await crmApi.detachJob(slug, opportunityId);
    } catch {
      addToast('Failed to detach job link before stage move', 'error');
      return;
    }
    performStageChange(stageId);
  };

  const saveNotes = () => {
    if (notesDraft === (opp?.notes || '')) return;
    handleFieldSave('notes', notesDraft);
  };

  // Inline editable field with error-state styling + ref handle for autofocus
  const EditableField = ({ label, field, value, icon: Icon, type = 'text' }) => {
    const isEditing = editing === field;
    const hasError = errorFields.has(field);
    const inputType = type === 'email' ? 'email' : type === 'tel' ? 'tel' : type === 'url' ? 'url' : type;

    const startEdit = () => {
      setEditing(field);
      setEditValue(value ?? '');
      clearErrorField(field);
    };

    return (
      <div
        ref={el => { fieldRefs.current[field] = el; }}
        onClick={!isEditing ? startEdit : undefined}
        className={`flex items-start gap-2 py-1.5 ${hasError ? 'rounded-md ring-1 ring-red-500/60 bg-red-500/5 px-2' : ''}`}
      >
        {Icon && <Icon size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-dark-500 uppercase tracking-wider">
            {label}
            {hasError && <span className="ml-1 text-red-400 normal-case">required</span>}
          </p>
          {isEditing ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                type={inputType}
                {...(type === 'number' ? { min: 0, step: 'any' } : {})}
                className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
                autoFocus
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFieldSave(field, editValue);
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
              <button onClick={e => { e.stopPropagation(); handleFieldSave(field, editValue); }} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
              <button onClick={e => { e.stopPropagation(); setEditing(null); }} className="text-dark-500 hover:text-dark-300"><X size={14} /></button>
            </div>
          ) : (
            <p className="text-xs text-dark-200 cursor-pointer hover:text-rivvra-400 transition-colors flex items-center gap-1 group">
              {value || <span className="text-dark-600 italic">Not set</span>}
              <Edit3 size={10} className="opacity-0 group-hover:opacity-100 text-dark-500" />
            </p>
          )}
        </div>
      </div>
    );
  };

  if (!slug || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }

  if (!opp) {
    return <div className="text-center py-20 text-dark-500">Opportunity not found</div>;
  }

  const showWonLost = !opp.isConverted && !opp.isLost && !opp.wonAt;
  const showRestore = !opp.isConverted && (opp.isLost || opp.wonAt);
  const showConvert = !opp.isConverted && opp.requirementType !== 'Project Based' && (opp.wonAt || !opp.isLost);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-dark-100 truncate" title={opp.name}>{opp.name}</h1>
            {opp.isLost && <span className="text-xs bg-red-500/15 text-red-400 rounded-full px-2 py-0.5 border border-red-500/20">LOST</span>}
            {opp.wonAt && !opp.isLost && !opp.isConverted && <span className="text-xs bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5 border border-amber-500/20 flex items-center gap-1"><Trophy size={10} /> WON</span>}
            {opp.isConverted && <span className="text-xs bg-emerald-500/15 text-emerald-400 rounded-full px-2 py-0.5 border border-emerald-500/20">CONVERTED</span>}
          </div>
        </div>
      </div>

      {/* Stage Bar */}
      <div className="mb-4">
        <StageBar
          stages={stages}
          currentStageId={opp.stageId}
          isLost={opp.isLost}
          isWon={!!opp.wonAt}
          stageHistory={opp.stageHistory || []}
          onStageClick={handleStageChange}
        />
      </div>

      {/* Action Row */}
      <div className="flex items-center gap-2 mb-6">
        {showWonLost && (
          <>
            <button onClick={handleWon} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/25">
              <Trophy size={12} /> Won
            </button>
            <button onClick={() => setShowLostModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/15 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/25">
              <XCircle size={12} /> Lost
            </button>
          </>
        )}
        {showRestore && (
          <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-700 text-dark-300 rounded-lg hover:bg-dark-600">
            <RotateCcw size={12} /> Restore
          </button>
        )}
        {showConvert && (
          <button onClick={handleConvert} disabled={converting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/25 disabled:opacity-50">
            {converting ? <Loader2 size={12} className="animate-spin" /> : <Briefcase size={12} />}
            Convert to Job
          </button>
        )}

        {/* Post-conversion: bold "Open Job" CTA + small detach link */}
        {opp.isConverted && opp.relatedJobId && (
          <>
            <button
              onClick={() => navigate(`/org/${slug}/ats/jobs/${opp.relatedJobId}`)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-400 transition-colors shadow-sm"
            >
              <Briefcase size={14} /> Open Job{opp.relatedJob?.name ? `: ${opp.relatedJob.name}` : ''} <ExternalLink size={12} />
            </button>
            <button
              onClick={() => setShowDetachModal(true)}
              className="text-[11px] text-dark-500 hover:text-red-400 underline-offset-2 hover:underline transition-colors"
            >
              Detach
            </button>
          </>
        )}

        <div className="flex-1" />
        <button onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg transition-colors">
          <Trash2 size={12} /> Delete
        </button>
      </div>

      {/* Layout: main column + narrow Quick Info sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main column */}
        <div className="lg:col-span-3 space-y-4">
          {/* Contact & Company */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Contact & Company</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {opp.contactId ? (
                <div className="flex items-start gap-2 py-1.5">
                  <User size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Contact Name</p>
                    <Link
                      to={`/org/${slug}/contacts/${opp.contactId}`}
                      className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors flex items-center gap-1"
                    >
                      {opp.contactName || 'View Contact'} <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              ) : (
                <EditableField label="Contact Name" field="contactName" value={opp.contactName} icon={User} />
              )}
              {opp.contactCompanyId ? (
                <div className="flex items-start gap-2 py-1.5">
                  <Building2 size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Company</p>
                    <Link
                      to={`/org/${slug}/contacts/${opp.contactCompanyId}`}
                      className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors flex items-center gap-1"
                    >
                      {opp.companyName || 'View Company'} <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              ) : (
                <EditableField label="Company" field="companyName" value={opp.companyName} icon={Building2} />
              )}
              <EditableField label="Email" field="contactEmail" value={opp.contactEmail} icon={Mail} type="email" />
              <EditableField label="Phone" field="contactPhone" value={opp.contactPhone} icon={Phone} type="tel" />
              <EditableField label="LinkedIn" field="linkedinUrl" value={opp.linkedinUrl} icon={Linkedin} type="url" />
            </div>
          </div>

          {/* Opportunity Details */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Opportunity Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <EditableField label="Expected Role" field="expectedRole" value={opp.expectedRole} icon={Briefcase} />
              <div className="flex items-start gap-2 py-1.5">
                <Tag size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Requirement Type</p>
                  <select
                    value={opp.requirementType || ''}
                    onChange={e => handleFieldSave('requirementType', e.target.value || null)}
                    className="bg-dark-900 border border-dark-600 rounded px-2 py-0.5 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none mt-0.5"
                  >
                    <option value="">Not set</option>
                    <option value="Staff Augmentation">Staff Augmentation</option>
                    <option value="Project Based">Project Based</option>
                    <option value="Full-time Hire">Full-time Hire</option>
                  </select>
                </div>
              </div>
              {/* Expected Revenue — currency-aware (client currency → internal company fallback) */}
              {(() => {
                const code = opp.effectiveCurrency || 'INR';
                const sym = currencySymbol(code).trim() || code;
                const isEditing = editing === 'expectedRevenue';
                const hasError = errorFields.has('expectedRevenue');
                return (
                  <div
                    ref={el => { fieldRefs.current['expectedRevenue'] = el; }}
                    onClick={!isEditing ? () => { setEditing('expectedRevenue'); setEditValue(opp.expectedRevenue ?? ''); clearErrorField('expectedRevenue'); } : undefined}
                    className={`flex items-start gap-2 py-1.5 ${hasError ? 'rounded-md ring-1 ring-red-500/60 bg-red-500/5 px-2' : ''}`}
                  >
                    <span className="text-[11px] font-semibold text-dark-500 mt-0.5 flex-shrink-0 w-[13px] text-center">{sym}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-dark-500 uppercase tracking-wider">
                        Expected Revenue <span className="text-dark-600 normal-case">({code})</span>
                        {hasError && <span className="ml-1 text-red-400 normal-case">required</span>}
                      </p>
                      {isEditing ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            type="number"
                            min={0}
                            step="any"
                            className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleFieldSave('expectedRevenue', editValue);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                          <button onClick={e => { e.stopPropagation(); handleFieldSave('expectedRevenue', editValue); }} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
                          <button onClick={e => { e.stopPropagation(); setEditing(null); }} className="text-dark-500 hover:text-dark-300"><X size={14} /></button>
                        </div>
                      ) : (
                        <p className="text-xs text-dark-200 cursor-pointer hover:text-rivvra-400 transition-colors flex items-center gap-1 group">
                          {opp.expectedRevenue != null && opp.expectedRevenue !== ''
                            ? formatMoney(opp.expectedRevenue, code)
                            : <span className="text-dark-600 italic">Not set</span>}
                          <Edit3 size={10} className="opacity-0 group-hover:opacity-100 text-dark-500" />
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-start gap-2 py-1.5">
                <Tag size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Client Type</p>
                  <select
                    value={opp.clientType || 'new'}
                    onChange={e => handleFieldSave('clientType', e.target.value)}
                    className="bg-dark-900 border border-dark-600 rounded px-2 py-0.5 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none mt-0.5"
                  >
                    <option value="new">New</option>
                    <option value="existing">Existing</option>
                  </select>
                </div>
              </div>
              <EditableField label="Expected Closing" field="expectedClosing"
                value={toDateInputValue(opp.expectedClosing)} icon={Calendar} type="date" />
              <EditableField label="Source" field="source" value={opp.source} icon={Megaphone} />
            </div>
          </div>

          {/* Internal Notes */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Internal Notes</h3>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none min-h-[80px] resize-y"
              placeholder="Add notes..."
            />
          </div>

          {/* Activities (moved here for breathing room) */}
          <ActivityPanel orgSlug={slug} entityType="crm_opportunity" entityId={opportunityId} />
        </div>

        {/* Right: Quick Info + (conditionally) Signature Requests */}
        <div className="space-y-4">
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-2 items-center">
                <span className="text-dark-500 flex-shrink-0">Salesperson</span>
                <div className="text-dark-200 min-w-0 max-w-[60%] text-right">
                  <EmployeeLookup
                    orgSlug={slug}
                    variant="inline"
                    currentValue={opp.salespersonId}
                    currentName={opp.salespersonName}
                    onSelect={async (id, name) => {
                      try {
                        await crmApi.updateOpportunity(slug, opportunityId, {
                          salespersonId: id || null,
                          salespersonName: name || null,
                        });
                        setOpp(prev => ({ ...prev, salespersonId: id || null, salespersonName: name || null }));
                        addToast('Salesperson updated', 'success');
                      } catch {
                        addToast('Failed to update salesperson', 'error');
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-dark-500 flex-shrink-0">Created</span>
                <span className="text-dark-200">{new Date(opp.createdAt).toLocaleDateString()}</span>
              </div>
              {opp.wonAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-dark-500 flex-shrink-0">Won At</span>
                  <span className="text-amber-400">{new Date(opp.wonAt).toLocaleDateString()}</span>
                </div>
              )}
              {opp.isConverted && opp.convertedAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-dark-500 flex-shrink-0">Converted</span>
                  <span className="text-emerald-400">{new Date(opp.convertedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {!opp.isConverted && (
            <SignRequestWidget
              orgSlug={slug}
              linkedModel="crm_opportunity"
              linkedId={opportunityId}
              prefillData={{ name: opp?.contactName || '', email: opp?.contactEmail || '', phone: opp?.contactPhone || '', company: opp?.company || '' }}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete Opportunity</h2>
            <p className="text-xs text-dark-400 mb-1">
              Are you sure you want to permanently delete <span className="text-dark-200 font-medium">{opp.name}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">This will also remove all related activities. Linked contacts will not be affected.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detach Confirmation Modal */}
      {showDetachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Detach from Job Position</h2>
            <p className="text-xs text-dark-400 mb-5">
              The linked Job Position will not be deleted, but this opportunity will no longer be linked to it. You can reconvert later.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDetachModal(false)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDetach}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors flex items-center justify-center gap-1.5">
                <Unlink size={12} /> Detach
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage move (Won → other) confirm — protects linked Job Position */}
      {showStageDetachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Move out of Won?</h2>
            <p className="text-xs text-dark-400 mb-5">
              This opportunity is converted to a Job Position. Moving it out of the Won stage will detach the link. The Job Position itself will not be deleted.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowStageDetachModal(null)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleStageDetachConfirm(showStageDetachModal)}
                className="flex-1 px-3 py-2 text-xs text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors">
                Detach & move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-3">Mark as Lost</h2>
            <p className="text-xs text-dark-400 mb-4">Select a reason for losing this opportunity.</p>
            <div className="space-y-1.5">
              {lostReasons.map(r => (
                <button key={r._id} onClick={() => handleLost(r._id)}
                  className="w-full text-left px-3 py-2 text-xs text-dark-200 bg-dark-900 border border-dark-600 rounded-lg hover:border-red-500/40 hover:bg-red-500/5 transition-colors">
                  {r.name}
                </button>
              ))}
              <button onClick={() => handleLost(null)}
                className="w-full text-left px-3 py-2 text-xs text-dark-400 bg-dark-900 border border-dark-600 rounded-lg hover:border-dark-500">
                No reason
              </button>
            </div>
            <button onClick={() => setShowLostModal(false)} className="w-full mt-3 px-3 py-2 text-xs text-dark-400 hover:text-dark-200 text-center">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
