import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { formatMoney, currencySymbol } from '../../utils/currency';
import ActivityPanel from '../../components/shared/ActivityPanel';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import SectionCard from '../../components/platform/detail/SectionCard';
import {
  Building2, User, Briefcase, Trophy, FileText, Tag,
  Trash2, Loader2, XCircle, RotateCcw,
  ExternalLink, Unlink, Archive, ArchiveRestore, MoreHorizontal,
} from 'lucide-react';

function StageBar({ stages, currentStageId, isLost, stageHistory = [], onStageClick }) {
  const currentIdx = stages.findIndex(s => s._id === currentStageId);
  const enteredAtByStage = useMemo(() => {
    const map = {};
    for (const sh of stageHistory) {
      if (sh?.stageId) map[sh.stageId] = sh.enteredAt;
    }
    return map;
  }, [stageHistory]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
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
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors hover:opacity-80 ${colorClass}`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

// Read-only display row for fields linked to another record (Contact, Company).
// Matches InlineField's read-mode layout (140px label column) for visual alignment.
function LinkedRecordField({ label, to, name, fallback = 'View' }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm">{label}</span>
      <Link
        to={to}
        className="text-rivvra-400 hover:text-rivvra-300 transition-colors text-sm flex items-center gap-1.5 min-w-0"
      >
        <span className="truncate">{name || fallback}</span>
        <ExternalLink size={12} className="flex-shrink-0" />
      </Link>
    </div>
  );
}

export default function CrmOpportunityDetail() {
  const { orgSlug: slug, isOrgAdmin } = useOrg();
  const { opportunityId } = useParams();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [opp, setOpp] = useState(null);
  const [stages, setStages] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLostModal, setShowLostModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetachModal, setShowDetachModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [showStageDetachModal, setShowStageDetachModal] = useState(null);
  const [errorFields, setErrorFields] = useState(new Set());
  const fieldRefs = useRef({});

  const fetchAll = useCallback(async () => {
    try {
      const [oppRes, stagesRes, reasonsRes] = await Promise.all([
        crmApi.getOpportunity(slug, opportunityId),
        crmApi.listStages(slug),
        crmApi.listLostReasons(slug),
      ]);
      if (oppRes.success) setOpp(oppRes.opportunity);
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

  // Generic save handler used by every InlineField on the page. InlineField
  // is contract-strict: it expects this to throw on error so it can show an
  // error indicator. Numeric coercion for Expected Revenue happens here.
  const saveField = async (field, value) => {
    let coerced = value;
    if (field === 'expectedRevenue') {
      if (value === '' || value == null) {
        coerced = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Must be a positive number');
        coerced = n;
      }
    }
    await crmApi.updateOpportunity(slug, opportunityId, { [field]: coerced });
    setOpp(prev => ({ ...prev, [field]: coerced }));
    clearErrorField(field);
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
  };

  const handleConvert = async () => {
    const missing = [];
    if (!opp.expectedRole?.trim()) missing.push('expectedRole');
    if (!opp.expectedRevenue) missing.push('expectedRevenue');
    if (missing.length > 0) {
      setErrorFields(new Set(missing));
      const labels = { expectedRole: 'Expected Role', expectedRevenue: 'Expected Revenue' };
      addToast(`Missing required field: ${labels[missing[0]]}`, 'error');
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

  const openArchiveModal = async () => {
    setShowKebab(false);
    setShowArchiveModal(true);
    setArchivePreview(null);
    try {
      const res = await crmApi.archivePreview(slug, opportunityId);
      setArchivePreview(res?.dependencies || []);
    } catch {
      // Non-fatal — user can still archive without preview
      setArchivePreview([]);
    }
  };

  const handleArchive = async (cascade = false) => {
    setArchiving(true);
    try {
      await crmApi.archiveOpportunity(slug, opportunityId, { cascade });
      setShowArchiveModal(false);
      fetchAll();
      addToast(cascade ? 'Archived (with linked Job)' : 'Archived', 'success');
    } catch {
      addToast('Failed to archive', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    try {
      await crmApi.unarchiveOpportunity(slug, opportunityId);
      fetchAll();
      addToast('Unarchived', 'success');
    } catch {
      addToast('Failed to unarchive', 'error');
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

  if (!slug || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }
  if (!opp) {
    return <div className="text-center py-20 text-dark-500">Opportunity not found</div>;
  }

  // Archived = read-only across the page (Q-archive-edit, 2026-05-06).
  // All state actions, inline edits, stage clicks are gated on !isArchived;
  // only Unarchive remains available.
  const isArchived = !!opp.archived;
  const canEdit = !isArchived;
  const showWonLost = canEdit && !opp.isConverted && !opp.isLost && !opp.wonAt;
  const showRestore = canEdit && !opp.isConverted && (opp.isLost || opp.wonAt);
  const showConvert = canEdit && !opp.isConverted && opp.requirementType !== 'Project Based' && (opp.wonAt || !opp.isLost);
  const currencyCode = opp.effectiveCurrency || 'INR';
  const currencySym = currencySymbol(currencyCode).trim() || currencyCode;

  const requirementOptions = [
    { value: 'Staff Augmentation', label: 'Staff Augmentation' },
    { value: 'Project Based', label: 'Project Based' },
    { value: 'Full-time Hire', label: 'Full-time Hire' },
  ];
  const clientTypeOptions = [
    { value: 'new', label: 'New' },
    { value: 'existing', label: 'Existing' },
  ];

  // Wraps an InlineField with a red error highlight when its key is in
  // errorFields — used by the Convert preflight to flag missing fields.
  const ErrorWrap = ({ field, children }) => {
    const hasError = errorFields.has(field);
    return (
      <div
        ref={el => { fieldRefs.current[field] = el; }}
        className={hasError ? 'rounded-md ring-1 ring-red-500/60 bg-red-500/5 px-1.5 -mx-1.5' : ''}
      >
        {children}
        {hasError && (
          <p className="text-[11px] text-red-400 px-1.5 pb-1 -mt-1">Required to convert to Job Position</p>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate" title={opp.name}>{opp.name}</h1>
            {opp.archived && <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1"><Archive size={11} /> ARCHIVED</span>}
            {opp.isLost && <span className="text-xs bg-red-500/15 text-red-400 rounded-full px-2 py-0.5 border border-red-500/20">LOST</span>}
            {opp.wonAt && !opp.isLost && !opp.isConverted && (
              <span className="text-xs bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5 border border-amber-500/20 flex items-center gap-1">
                <Trophy size={11} /> WON
              </span>
            )}
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
          stageHistory={opp.stageHistory || []}
          onStageClick={canEdit ? handleStageChange : () => {}}
        />
      </div>

      {/* Action Row */}
      <div className="flex items-center gap-2 mb-5">
        {showWonLost && (
          <>
            <button onClick={handleWon} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/25 font-medium">
              <Trophy size={14} /> Won
            </button>
            <button onClick={() => setShowLostModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500/15 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/25 font-medium">
              <XCircle size={14} /> Lost
            </button>
          </>
        )}
        {showRestore && (
          <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-dark-700 text-dark-300 rounded-lg hover:bg-dark-600 font-medium">
            <RotateCcw size={14} /> Restore
          </button>
        )}
        {showConvert && (
          <button onClick={handleConvert} disabled={converting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/25 disabled:opacity-50 font-medium">
            {converting ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
            Convert to Job
          </button>
        )}
        {opp.isConverted && opp.relatedJobId && (
          <>
            <button
              onClick={() => navigate(`/org/${slug}/ats/jobs/${opp.relatedJobId}`)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-purple-500 text-white rounded-lg hover:bg-purple-400 transition-colors shadow-sm"
            >
              <Briefcase size={14} /> Open Job{opp.relatedJob?.name ? `: ${opp.relatedJob.name}` : ''} <ExternalLink size={12} />
            </button>
            <button
              onClick={() => setShowDetachModal(true)}
              className="text-xs text-dark-500 hover:text-red-400 underline-offset-2 hover:underline transition-colors"
            >
              Detach
            </button>
          </>
        )}

        <div className="flex-1" />
        {/* Archive primary, Delete behind admin-only kebab. Unarchive replaces
            both when the record is archived. */}
        {opp.archived ? (
          <button
            onClick={handleUnarchive}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 font-medium"
          >
            <ArchiveRestore size={14} /> Unarchive
          </button>
        ) : (
          <button
            onClick={openArchiveModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-dark-300 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 rounded-lg transition-colors"
          >
            <Archive size={14} /> Archive
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowKebab(o => !o)}
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

      {/* Body: main + narrow sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Contact & Company" icon={User}>
            {opp.contactId ? (
              <LinkedRecordField label="Contact Name" to={`/org/${slug}/contacts/${opp.contactId}`} name={opp.contactName} fallback="View Contact" />
            ) : (
              <InlineField label="Contact Name" field="contactName" value={opp.contactName} editable={canEdit} onSave={saveField} />
            )}
            {opp.contactCompanyId ? (
              <LinkedRecordField label="Company" to={`/org/${slug}/contacts/${opp.contactCompanyId}`} name={opp.companyName} fallback="View Company" />
            ) : (
              <InlineField label="Company" field="companyName" value={opp.companyName} editable={canEdit} onSave={saveField} />
            )}
            <InlineField label="Email" field="contactEmail" value={opp.contactEmail} type="email" editable={canEdit} onSave={saveField} placeholder="Add email" />
            <InlineField label="Phone" field="contactPhone" value={opp.contactPhone} type="phone" editable={canEdit} onSave={saveField} placeholder="Add phone" />
            <InlineField label="LinkedIn" field="linkedinUrl" value={opp.linkedinUrl} type="url" editable={canEdit} onSave={saveField} placeholder="LinkedIn URL" />
          </SectionCard>

          <SectionCard title="Opportunity Details" icon={Briefcase}>
            <ErrorWrap field="expectedRole">
              <InlineField label="Expected Role" field="expectedRole" value={opp.expectedRole} editable={canEdit} onSave={saveField} placeholder="e.g. Java Developer" />
            </ErrorWrap>
            <InlineField
              label="Requirement Type"
              field="requirementType"
              value={opp.requirementType}
              type="select"
              options={requirementOptions}
              editable={canEdit}
              onSave={saveField}
            />
            <ErrorWrap field="expectedRevenue">
              <InlineField
                label={`Expected Revenue (${currencyCode})`}
                field="expectedRevenue"
                value={opp.expectedRevenue}
                editable={canEdit}
                onSave={saveField}
                placeholder={`e.g. ${currencySym}900,000`}
                displayValue={
                  opp.expectedRevenue != null && opp.expectedRevenue !== ''
                    ? <span>{formatMoney(opp.expectedRevenue, currencyCode)}</span>
                    : undefined
                }
              />
            </ErrorWrap>
            <InlineField
              label="Client Type"
              field="clientType"
              value={opp.clientType || 'new'}
              type="select"
              options={clientTypeOptions}
              editable={canEdit}
              onSave={saveField}
            />
            <InlineField label="Expected Closing" field="expectedClosing" value={opp.expectedClosing} type="date" editable={canEdit} onSave={saveField} />
            <InlineField label="Source" field="source" value={opp.source} editable={canEdit} onSave={saveField} placeholder="e.g. Outreach, Referral" />
          </SectionCard>

          <SectionCard title="Internal Notes" icon={FileText}>
            <InlineField
              label="Notes"
              field="notes"
              value={opp.notes}
              type="textarea"
              editable={canEdit}
              onSave={saveField}
              placeholder="Add notes…"
            />
          </SectionCard>

          <ActivityPanel orgSlug={slug} entityType="crm_opportunity" entityId={opportunityId} />
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <SectionCard title="Owner" icon={Tag}>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
              <span className="text-dark-400 text-sm">Salesperson</span>
              <div className="min-w-0">
                <EmployeeLookup
                  orgSlug={slug}
                  variant="inline"
                  editable={canEdit}
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
            {opp.wonAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                <span className="text-dark-400 text-sm">Won At</span>
                <span className="text-amber-400 text-sm">{new Date(opp.wonAt).toLocaleDateString()}</span>
              </div>
            )}
            {opp.isConverted && opp.convertedAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                <span className="text-dark-400 text-sm">Converted</span>
                <span className="text-emerald-400 text-sm">{new Date(opp.convertedAt).toLocaleDateString()}</span>
              </div>
            )}
            <RecordMeta
              className="mt-3 pt-3 border-t border-dark-700"
              createdAt={opp.createdAt}
              createdByName={opp.createdByName}
              updatedAt={opp.updatedAt}
              updatedByName={opp.updatedByName}
            />
          </SectionCard>

          {!opp.isConverted && (
            <SignRequestWidget
              orgSlug={slug}
              linkedModel="crm_opportunity"
              linkedId={opportunityId}
              prefillData={{ name: opp?.contactName || '', email: opp?.contactEmail || '', phone: opp?.contactPhone || '', company: opp?.companyName || '' }}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2">Delete Opportunity</h2>
            <p className="text-sm text-dark-400 mb-1">
              Permanently delete <span className="text-white font-medium">{opp.name}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">Related activities will also be removed. Linked contacts are not affected.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-3 py-2 text-sm text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-3 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal — soft cascade with explicit user choice */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <Archive size={16} /> Archive Opportunity
            </h2>
            <p className="text-sm text-dark-400 mb-3">
              Archive <span className="text-white font-medium">{opp.name}</span>? It will be hidden from list views but can be restored at any time.
            </p>
            {archivePreview === null ? (
              <div className="text-xs text-dark-500 mb-4 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking linked records…</div>
            ) : archivePreview.length > 0 ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-300 font-medium mb-2">Linked records found:</p>
                <ul className="space-y-1.5">
                  {archivePreview.map(d => (
                    <li key={d.id} className="text-xs text-dark-200 flex items-center gap-1.5">
                      <Briefcase size={11} className="text-dark-500 flex-shrink-0" />
                      <span className="flex-1 truncate">{d.name}</span>
                      {d.activeApplications > 0 && (
                        <span className="text-[10px] text-dark-500">{d.activeApplications} active app{d.activeApplications !== 1 ? 's' : ''}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-dark-500 mt-2">Choose whether to archive these too.</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleArchive(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                Archive opportunity only
              </button>
              {archivePreview && archivePreview.length > 0 && (
                <button
                  onClick={() => handleArchive(true)}
                  disabled={archiving}
                  className="w-full px-3 py-2 text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg hover:bg-amber-500/35 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive opportunity + linked Job
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

      {/* Detach Confirmation Modal */}
      {showDetachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2">Detach from Job Position</h2>
            <p className="text-sm text-dark-400 mb-5">
              The Job Position is preserved; this opportunity will simply no longer link to it. You can reconvert later.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDetachModal(false)}
                className="flex-1 px-3 py-2 text-sm text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDetach}
                className="flex-1 px-3 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors flex items-center justify-center gap-1.5">
                <Unlink size={13} /> Detach
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage detach confirm */}
      {showStageDetachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2">Move out of Won?</h2>
            <p className="text-sm text-dark-400 mb-5">
              This opportunity is converted to a Job Position. Moving it out of the Won stage will detach the link. The Job Position itself will not be deleted.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowStageDetachModal(null)}
                className="flex-1 px-3 py-2 text-sm text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleStageDetachConfirm(showStageDetachModal)}
                className="flex-1 px-3 py-2 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors">
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
            <h2 className="text-base font-semibold text-white mb-3">Mark as Lost</h2>
            <p className="text-sm text-dark-400 mb-4">Select a reason for losing this opportunity.</p>
            <div className="space-y-1.5">
              {lostReasons.map(r => (
                <button key={r._id} onClick={() => handleLost(r._id)}
                  className="w-full text-left px-3 py-2 text-sm text-dark-200 bg-dark-900 border border-dark-600 rounded-lg hover:border-red-500/40 hover:bg-red-500/5 transition-colors">
                  {r.name}
                </button>
              ))}
              <button onClick={() => handleLost(null)}
                className="w-full text-left px-3 py-2 text-sm text-dark-400 bg-dark-900 border border-dark-600 rounded-lg hover:border-dark-500">
                No reason
              </button>
            </div>
            <button onClick={() => setShowLostModal(false)} className="w-full mt-3 px-3 py-2 text-sm text-dark-400 hover:text-dark-200 text-center">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
