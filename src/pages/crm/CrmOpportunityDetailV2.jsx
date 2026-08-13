import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import { formatMoney, currencySymbol, SUPPORTED_CURRENCIES } from '../../utils/currency';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import { withFromContext } from '../../utils/entityDescribe';
import {
  Button, Chip, ConfirmDialog, EmptyState, EntityLookup, InlineField, Modal, Panel,
  RecordMeta, SkeletonHeader, SkeletonPage, SkeletonTwoCard, Spinner, StageBar,
} from '../../components/ds';
import ActivityPanelV2 from '../../components/shared/v2/ActivityPanelV2';
// Legacy island: dark-only, belongs to the Sign surface and migrates with it.
import SignRequestWidgetV2 from '../../components/shared/v2/SignRequestWidgetV2';
import {
  Archive, ArchiveRestore, Briefcase, ExternalLink, FileText, MapPin,
  MoreHorizontal, RotateCcw, Tag, Trash2, Trophy, Unlink, User, XCircle,
} from 'lucide-react';

const FONT = "'Inter', system-ui, sans-serif";

const REQUIREMENT_OPTIONS = [
  { value: 'Staff Augmentation', label: 'Staff Augmentation' },
  { value: 'Project Based', label: 'Project Based' },
  { value: 'Full-time Hire', label: 'Full-time Hire' },
];
const CLIENT_TYPE_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'existing', label: 'Existing' },
];

// The three fields the server's Won-gate requires. Kept as one table so the
// preflight, the server's error payload and the field highlighting can't
// drift apart — they did in the legacy page, which spelled the mapping out
// three separate times.
const WON_REQUIRED = [
  { field: 'expectedRole', label: 'Expected Role' },
  { field: 'expectedRevenue', label: 'Expected Revenue' },
  { field: 'requirementType', label: 'Requirement Type' },
];
const WON_FIELD_BY_LABEL = Object.fromEntries(WON_REQUIRED.map((w) => [w.label, w.field]));

const CONVERT_HINT = 'Required to convert to a Job Position';

/* v2 CRM Opportunity Detail (phase 5a) — the detail archetype from
   ContactDetailV2, plus a stage pipeline and a wider action row.

   The Details body is fully migrated, and SignRequestWidgetV2 came with the
   Sign surface in phase 10. */
export default function CrmOpportunityDetailV2() {
  const { orgSlug: slug, isOrgAdmin } = useOrg();
  const { opportunityId } = useParams();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const handleScoped404 = useCompanyScoped404('opportunity');

  const [opp, setOpp] = useState(null);
  const [stages, setStages] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const [showLostModal, setShowLostModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetachModal, setShowDetachModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [stageDetachTarget, setStageDetachTarget] = useState(null);
  const [errorFields, setErrorFields] = useState(new Set());

  const fieldRefs = useRef({});
  const bumpTimerRef = useRef(null);
  const mountedRef = useRef(true);

  usePageTitle(opp?.name);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    };
  }, []);

  // Bump twice: immediately for synchronous audit rows, then after ~2s for
  // fire-and-forget rows the server writes after responding (email_sent).
  const bumpActivities = useCallback(() => {
    setActivityRefreshKey((k) => k + 1);
    if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    bumpTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setActivityRefreshKey((k) => k + 1);
    }, 2000);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [oppRes, stagesRes] = await Promise.all([
        crmApi.getOpportunity(slug, opportunityId),
        crmApi.listStages(slug),
      ]);
      if (oppRes.success) setOpp(oppRes.opportunity); else setNotFound(true);
      if (stagesRes.success) setStages(stagesRes.stages || []);
    } catch (err) {
      if (handleScoped404(err)) return;
      addToast('Failed to load opportunity', 'error');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug, opportunityId, handleScoped404]); // eslint-disable-line react-hooks/exhaustive-deps

  // Post-action refetch. Drops the stages round-trip — stages don't change in
  // response to anything the user can do here.
  const fetchOpp = useCallback(async () => {
    try {
      const res = await crmApi.getOpportunity(slug, opportunityId);
      if (res.success) setOpp(res.opportunity);
    } catch {
      // Non-fatal: the optimistic update already moved local state.
    }
  }, [slug, opportunityId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Lost reasons are only needed once the Lost modal opens, and most opps are
  // never marked lost.
  useEffect(() => {
    if (!showLostModal || lostReasons.length > 0) return;
    crmApi.listLostReasons(slug)
      .then((res) => { if (res?.success) setLostReasons(res.reasons || []); })
      .catch(() => {});
  }, [showLostModal, lostReasons.length, slug]);

  const clearErrorField = (field) => setErrorFields((prev) => {
    if (!prev.has(field)) return prev;
    const next = new Set(prev);
    next.delete(field);
    return next;
  });

  const focusField = (field) => {
    fieldRefs.current[field]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Rejects on failure — InlineField is pessimistic and needs that to keep
  // the editor open with the user's text.
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
    setOpp((prev) => ({ ...prev, [field]: coerced }));
    clearErrorField(field);
    bumpActivities();
  };

  const missingWonFields = (o) => WON_REQUIRED.filter(({ field }) => {
    const v = o?.[field];
    if (field === 'expectedRevenue') return v == null || v === '';
    return !v?.toString().trim();
  });

  const performStageChange = async (stageId) => {
    // Optimistic: flip the chip before the round-trip, roll back on reject.
    const previousStageId = opp?.stageId;
    setOpp((prev) => (prev ? { ...prev, stageId } : prev));
    try {
      const res = await crmApi.moveStage(slug, opportunityId, stageId);
      fetchOpp();
      bumpActivities();
      if (res.jobCreated) addToast(`Won! Job Position "${res.jobCreated.jobName}" created in ATS`, 'success');
      else if (res.isWonStage) addToast('Marked as Won!', 'success');
      else addToast('Stage updated', 'success');
    } catch (err) {
      setOpp((prev) => (prev ? { ...prev, stageId: previousStageId } : prev));
      const payload = err?.payload || err?.body;
      const missing = Array.isArray(payload?.missing) ? payload.missing : [];
      if (missing.length) {
        const fields = missing.map((l) => WON_FIELD_BY_LABEL[l]).filter(Boolean);
        setErrorFields(new Set(fields));
        focusField(fields[0]);
      }
      addToast(payload?.error || err?.message || 'Failed to move stage', 'error');
    }
  };

  const handleStageChange = (stageId) => {
    const target = stages.find((s) => s._id === stageId);
    const current = stages.find((s) => s._id === opp?.stageId);
    if (opp?.isConverted && current?.isWonStage && target && !target.isWonStage) {
      setStageDetachTarget(stageId);
      return;
    }
    // Pre-validate the Won gate so the user gets feedback without the
    // optimistic-then-rollback flicker.
    if (target?.isWonStage && !opp?.isConverted) {
      const missing = missingWonFields(opp);
      if (missing.length) {
        setErrorFields(new Set(missing.map((m) => m.field)));
        focusField(missing[0].field);
        addToast(`Fill before Won: ${missing.map((m) => m.label).join(', ')}`, 'error');
        return;
      }
      if (opp?.requirementType === 'Project Based') {
        addToast("Project Based opportunities can't be converted to a Job Position.", 'error');
        return;
      }
    }
    performStageChange(stageId);
  };

  const handleWon = () => {
    const wonStage = stages.find((s) => s.isWonStage);
    if (!wonStage) { addToast('No Won stage configured', 'error'); return; }
    handleStageChange(wonStage._id);
  };

  const handleLost = async (reasonId) => {
    try {
      await crmApi.markLost(slug, opportunityId, reasonId);
      setShowLostModal(false);
      fetchOpp();
      bumpActivities();
      addToast('Marked as Lost', 'success');
    } catch (err) {
      addToast(err?.message || 'Failed to mark lost', 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await crmApi.restore(slug, opportunityId);
      fetchOpp();
      bumpActivities();
      addToast('Restored', 'success');
    } catch (err) {
      addToast(err?.message || 'Failed to restore', 'error');
    }
  };

  const handleConvert = async () => {
    // Mirrors the server's gate exactly, so the recruiter sees the same
    // verdict before the round-trip.
    const missing = missingWonFields(opp);
    if (missing.length) {
      setErrorFields(new Set(missing.map((m) => m.field)));
      addToast(`Missing required field: ${missing[0].label}`, 'error');
      focusField(missing[0].field);
      return;
    }
    if (opp.requirementType === 'Project Based') {
      addToast("Project Based opportunities can't convert to a hire job — change Requirement Type first.", 'error');
      setErrorFields(new Set(['requirementType']));
      focusField('requirementType');
      return;
    }
    setConverting(true);
    try {
      const res = await crmApi.convertToJob(slug, opportunityId);
      if (res.success) {
        fetchOpp();
        bumpActivities();
        addToast(`Job Position "${res.jobName}" created!`, 'success');
      }
    } catch (err) {
      addToast(err?.error || err?.message || 'Failed to convert', 'error');
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
    } catch (err) {
      addToast(err?.message || 'Failed to delete opportunity', 'error');
      setDeleting(false);
    }
  };

  const handleDetach = async () => {
    try {
      await crmApi.detachJob(slug, opportunityId);
      setShowDetachModal(false);
      fetchOpp();
      bumpActivities();
      addToast('Detached from Job Position', 'success');
    } catch (err) {
      addToast(err?.message || 'Failed to detach', 'error');
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
      setArchivePreview([]); // non-fatal — archiving still works without it
    }
  };

  const handleArchive = async (cascade = false) => {
    setArchiving(true);
    try {
      await crmApi.archiveOpportunity(slug, opportunityId, { cascade });
      setShowArchiveModal(false);
      fetchOpp();
      bumpActivities();
      addToast(cascade ? 'Archived (with linked Job)' : 'Archived', 'success');
    } catch (err) {
      addToast(err?.message || 'Failed to archive', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    try {
      await crmApi.unarchiveOpportunity(slug, opportunityId);
      fetchOpp();
      bumpActivities();
      addToast('Unarchived', 'success');
    } catch (err) {
      addToast(err?.message || 'Failed to unarchive', 'error');
    }
  };

  const handleStageDetachConfirm = async () => {
    const stageId = stageDetachTarget;
    setStageDetachTarget(null);
    try {
      await crmApi.detachJob(slug, opportunityId);
    } catch {
      addToast('Failed to detach job link before stage move', 'error');
      return;
    }
    performStageChange(stageId);
  };

  const searchSalespersons = useCallback(async (query) => {
    const res = await contactsApi.listSalespersons(slug, query);
    return (res?.salespersons || []).map((sp) => ({ value: sp._id, label: sp.name, sub: sp.email || '' }));
  }, [slug]);

  // Won stages are a terminal state shown by the Won/Lost buttons, not a step
  // in the row — imported Odoo stages with is_won would otherwise appear
  // mid-pipeline.
  const visibleStages = useMemo(() => stages.filter((s) => !s.isWonStage), [stages]);
  const stageHints = useMemo(() => {
    const map = {};
    for (const sh of opp?.stageHistory || []) {
      if (sh?.stageId) map[sh.stageId] = `entered ${new Date(sh.enteredAt).toLocaleDateString()}`;
    }
    return map;
  }, [opp?.stageHistory]);

  if (!slug || loading) {
    return (
      <SkeletonPage style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180 }}>
        <SkeletonHeader withButton />
        <SkeletonTwoCard />
      </SkeletonPage>
    );
  }

  if (notFound || !opp) {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)' }}>
        <EmptyState
          icon={<Briefcase size={22} />}
          title="Opportunity not found"
          actions={<Button variant="secondary" size="sm" onClick={() => navigate(`/org/${slug}/crm/opportunities`)}>Back to opportunities</Button>}
        >
          It may have been deleted, or it belongs to another company.
        </EmptyState>
      </div>
    );
  }

  const isArchived = !!opp.archived;
  const canEdit = !isArchived;
  const showWonLost = canEdit && !opp.isConverted && !opp.isLost && !opp.wonAt;
  const showRestore = canEdit && !opp.isConverted && (opp.isLost || opp.wonAt);
  // Convert is strictly post-close: requires wonAt, not already converted,
  // not Project Based.
  const showConvert = canEdit && !opp.isConverted && opp.requirementType !== 'Project Based' && !!opp.wonAt;

  const currencyCode = opp.effectiveCurrency || 'INR';
  const currencySym = currencySymbol(currencyCode).trim() || currencyCode;
  const currencyOptions = SUPPORTED_CURRENCIES.map((code) => ({
    value: code,
    label: `${code} (${currencySymbol(code).trim() || code})`,
  }));

  const isWonRow = opp.isWon || !!opp.wonAt;
  const currentIsHidden = !!opp.stageId && !visibleStages.some((s) => s._id === opp.stageId);

  // Anchor for scroll-into-view when a preflight flags a field.
  const fieldAnchor = (field) => ({ ref: (el) => { fieldRefs.current[field] = el; } });
  const errFor = (field) => (errorFields.has(field) ? CONVERT_HINT : '');

  const linkedRow = (label, to, name, fallback) => (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, padding: '8px 0' }}>
      <span style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-4, #828e9f)' }}>{label}</span>
      <Link to={to} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, font: `450 13px/1.5 ${FONT}`, color: 'var(--brand, #22c55e)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || fallback}</span>
        <ExternalLink size={12} style={{ flexShrink: 0 }} />
      </Link>
    </div>
  );

  const staticRow = (label, node) => (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, padding: '8px 0' }}>
      <span style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-4, #828e9f)' }}>{label}</span>
      <span style={{ font: `450 13px/1.5 ${FONT}` }}>{node}</span>
    </div>
  );

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ font: `650 22px/1.2 ${FONT}`, letterSpacing: '-0.015em', color: 'var(--fg, #eef2f6)', minWidth: 0 }} title={opp.name}>
          {opp.name}
        </h1>
        {opp.archived && <Chip tone="warn" uppercase dot>Archived</Chip>}
        {opp.isLost && <Chip tone="danger" uppercase>Lost</Chip>}
        {opp.wonAt && !opp.isLost && !opp.isConverted && <Chip tone="warn" uppercase>Won</Chip>}
        {opp.isConverted && <Chip tone="brand" uppercase>Converted</Chip>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <StageBar
          stages={visibleStages.map((s) => ({ id: s._id, label: s.name }))}
          value={opp.stageId}
          allPast={isWonRow || currentIsHidden}
          tone={opp.isLost ? 'lost' : 'default'}
          interactive={canEdit}
          hints={stageHints}
          onSelect={handleStageChange}
        />
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {showWonLost && (
          <>
            <Button variant="secondary" size="sm" iconLeft={<Trophy size={14} />} onClick={handleWon}>Won</Button>
            <Button variant="secondary" size="sm" iconLeft={<XCircle size={14} />} onClick={() => setShowLostModal(true)}>Lost</Button>
          </>
        )}
        {showRestore && (
          <Button variant="secondary" size="sm" iconLeft={<RotateCcw size={14} />} onClick={handleRestore}>Restore</Button>
        )}
        {showConvert && (
          <Button variant="primary" size="sm" disabled={converting} iconLeft={<Briefcase size={14} />} onClick={handleConvert}>
            {converting ? 'Converting…' : 'Convert to Job'}
          </Button>
        )}
        {opp.isConverted && opp.relatedJobId && (
          <>
            <Button
              variant="primary" size="sm" iconLeft={<Briefcase size={14} />} iconRight={<ExternalLink size={12} />}
              onClick={() => navigate(withFromContext(`/org/${slug}/ats/jobs/${opp.relatedJobId}`, 'crm_opportunity', opportunityId))}
            >
              Open Job{opp.relatedJob?.name ? `: ${opp.relatedJob.name}` : ''}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDetachModal(true)}>Detach</Button>
          </>
        )}

        <span style={{ flex: 1 }} />

        {opp.archived ? (
          <Button variant="secondary" size="sm" iconLeft={<ArchiveRestore size={14} />} onClick={handleUnarchive}>Unarchive</Button>
        ) : (
          <Button variant="ghost" size="sm" iconLeft={<Archive size={14} />} onClick={openArchiveModal}>Archive</Button>
        )}
        <div style={{ position: 'relative' }}>
          <Button variant="ghost" size="sm" aria-label="More actions" onClick={() => setShowKebab((o) => !o)}>
            <MoreHorizontal size={16} />
          </Button>
          {showKebab && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowKebab(false)} />
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, width: 232, padding: 4,
                background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-2, 10px)',
                boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.11)), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6))',
              }}>
                {isOrgAdmin ? (
                  <button
                    type="button"
                    onClick={() => { setShowKebab(false); setShowDeleteModal(true); }}
                    style={{
                      width: '100%', display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left',
                      padding: '8px 10px', borderRadius: 'var(--r-1, 7px)', background: 'transparent', color: 'var(--danger, #ef4444)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Trash2 size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>
                      <span style={{ display: 'block', font: `550 12px/1.4 ${FONT}` }}>Delete permanently</span>
                      <span style={{ display: 'block', font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-4, #828e9f)', marginTop: 1 }}>
                        Cannot be recovered. Use Archive instead.
                      </span>
                    </span>
                  </button>
                ) : (
                  <div style={{ padding: '8px 10px', font: `450 11px/1.4 ${FONT}`, fontStyle: 'italic', color: 'var(--fg-4, #828e9f)' }}>
                    No admin actions available.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, gridColumn: 'span 2', minWidth: 0 }}>
          <Panel icon={<User size={14} />} title="Contact & Company">
            {opp.contactId
              ? linkedRow('Contact Name', withFromContext(`/org/${slug}/contacts/${opp.contactId}`, 'crm_opportunity', opportunityId), opp.contactName, 'View Contact')
              : <InlineField label="Contact Name" field="contactName" value={opp.contactName} editable={canEdit} onSave={saveField} />}
            {opp.contactCompanyId
              ? linkedRow('Company', withFromContext(`/org/${slug}/contacts/${opp.contactCompanyId}`, 'crm_opportunity', opportunityId), opp.companyName, 'View Company')
              : <InlineField label="Company" field="companyName" value={opp.companyName} editable={canEdit} onSave={saveField} />}
            <InlineField label="Email" field="contactEmail" type="email" value={opp.contactEmail} editable={canEdit} onSave={saveField} placeholder="Add email" />
            <InlineField label="Phone" field="contactPhone" type="phone" value={opp.contactPhone} editable={canEdit} onSave={saveField} placeholder="Add phone" />
            <InlineField label="Mobile" field="contactMobile" type="phone" value={opp.contactMobile} editable={canEdit} onSave={saveField} placeholder="Add mobile" />
            <InlineField label="LinkedIn" field="linkedinUrl" type="url" value={opp.linkedinUrl} editable={canEdit} onSave={saveField} placeholder="LinkedIn URL" />
          </Panel>

          <Panel icon={<MapPin size={14} />} title="Address">
            <InlineField label="Street" field="street" value={opp.street} editable={canEdit} onSave={saveField} placeholder="Street" />
            <InlineField label="Street 2" field="street2" value={opp.street2} editable={canEdit} onSave={saveField} placeholder="Apt, suite, etc." />
            <InlineField label="City" field="city" value={opp.city} editable={canEdit} onSave={saveField} placeholder="City" />
            <InlineField label="State" field="stateId" value={opp.stateId} editable={canEdit} onSave={saveField} placeholder="State / Region" />
            <InlineField label="ZIP" field="zip" value={opp.zip} editable={canEdit} onSave={saveField} placeholder="ZIP / Postal code" />
            <InlineField label="Country" field="countryId" value={opp.countryId} editable={canEdit} onSave={saveField} placeholder="Country" />
          </Panel>

          <Panel icon={<Briefcase size={14} />} title="Opportunity Details">
            {/* The three Won-gated fields carry `error` straight from the
                preflight — no wrapper div, unlike legacy's ErrorWrap. */}
            <div {...fieldAnchor('expectedRole')}>
              <InlineField
                label="Expected Role" field="expectedRole" value={opp.expectedRole}
                editable={canEdit} onSave={saveField} placeholder="e.g. Java Developer"
                error={errFor('expectedRole')}
              />
            </div>
            <div {...fieldAnchor('requirementType')}>
              <InlineField
                label="Requirement Type" field="requirementType" type="select" options={REQUIREMENT_OPTIONS}
                value={opp.requirementType} editable={canEdit} onSave={saveField}
                error={errFor('requirementType')}
              />
            </div>
            <InlineField
              label="Currency" field="currency" type="select" options={currencyOptions}
              value={opp.currency || currencyCode} editable={canEdit} onSave={saveField}
            />
            <div {...fieldAnchor('expectedRevenue')}>
              <InlineField
                label={`Expected Revenue (${currencyCode})`}
                field="expectedRevenue"
                value={opp.expectedRevenue}
                editable={canEdit}
                onSave={saveField}
                placeholder={`e.g. ${currencySym}900,000`}
                error={errFor('expectedRevenue')}
                // 0 reads as unset: imported Odoo opps were written with
                // expectedRevenue=0 where Odoo had no value, and "₹0" is a
                // different claim from "not filled in". Explicit dash so
                // InlineField doesn't fall back to the raw value. Saving an
                // explicit 0 still works.
                displayValue={
                  opp.expectedRevenue != null && opp.expectedRevenue !== '' && Number(opp.expectedRevenue) !== 0
                    ? <span>{formatMoney(opp.expectedRevenue, currencyCode)}</span>
                    : <span style={{ color: 'var(--fg-faint, #4a5563)' }}>—</span>
                }
              />
            </div>
            <InlineField
              label="Client Type" field="clientType" type="select" options={CLIENT_TYPE_OPTIONS}
              value={opp.clientType || 'new'} editable={canEdit} onSave={saveField}
            />
            <InlineField label="Expected Closing" field="expectedClosing" type="date" value={opp.expectedClosing} editable={canEdit} onSave={saveField} />
            <InlineField label="Source" field="source" value={opp.source} editable={canEdit} onSave={saveField} placeholder="e.g. Outreach, Referral" />
          </Panel>

          <Panel icon={<FileText size={14} />} title="Internal Notes">
            <InlineField label="Notes" field="notes" type="textarea" value={opp.notes} editable={canEdit} onSave={saveField} placeholder="Add notes…" />
          </Panel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Panel icon={<Tag size={14} />} title="Owner">
            <EntityLookup
              label="Salesperson"
              field="salespersonId"
              value={opp.salespersonId || ''}
              displayValue={opp.salespersonName}
              editable={canEdit}
              search={searchSalespersons}
              placeholder="Search employees…"
              onSelect={async (_field, id) => {
                // salespersonId stores employees._id per the People-fields
                // rule. The guard catches any future regression that would
                // write a portal_user._id or a name string instead.
                const safeId = id === '' ? null : id;
                if (safeId && !/^[a-f0-9]{24}$/i.test(String(safeId))) {
                  throw new Error('That salesperson id looks invalid — refusing to save.');
                }
                const name = safeId
                  ? (await searchSalespersons('')).find((o) => o.value === safeId)?.label ?? opp.salespersonName
                  : null;
                await crmApi.updateOpportunity(slug, opportunityId, { salespersonId: safeId, salespersonName: name || null });
                setOpp((prev) => ({ ...prev, salespersonId: safeId, salespersonName: name || null }));
                addToast('Salesperson updated', 'success');
              }}
            />
            {opp.wonAt && staticRow('Won At', <span style={{ color: 'var(--warn, #f59e0b)' }}>{new Date(opp.wonAt).toLocaleDateString()}</span>)}
            {opp.isConverted && opp.convertedAt && staticRow('Converted', <span style={{ color: 'var(--brand, #22c55e)' }}>{new Date(opp.convertedAt).toLocaleDateString()}</span>)}
            <RecordMeta
              style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line, rgba(255,255,255,.07))' }}
              createdAt={opp.createdAt}
              createdByName={opp.createdByName}
              updatedAt={opp.updatedAt}
              updatedByName={opp.updatedByName}
            />
          </Panel>

          {!opp.isConverted && (
            <SignRequestWidgetV2
              orgSlug={slug}
              linkedModel="crm_opportunity"
              linkedId={opportunityId}
              prefillData={{
                name: opp.contactName || '', email: opp.contactEmail || '',
                phone: opp.contactPhone || '', company: opp.companyName || '',
              }}
            />
          )}

          <ActivityPanelV2
            orgSlug={slug}
            entityType="crm_opportunity"
            entityId={opportunityId}
            refreshKey={activityRefreshKey}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* ── Delete ── */}
      <ConfirmDialog
        open={showDeleteModal}
        danger
        busy={deleting}
        title="Delete opportunity"
        message={`${opp.name} will be permanently removed, along with its activities. Linked contacts are not affected. This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />

      {/* ── Detach ── */}
      <ConfirmDialog
        open={showDetachModal}
        danger
        title="Detach from Job Position"
        message="The Job Position is preserved; this opportunity will simply no longer link to it. You can reconvert later."
        confirmLabel="Detach"
        onCancel={() => setShowDetachModal(false)}
        onConfirm={handleDetach}
      />

      {/* ── Move out of Won ── */}
      <ConfirmDialog
        open={!!stageDetachTarget}
        danger
        title="Move out of Won?"
        message="This opportunity is converted to a Job Position. Moving it out of the Won stage will detach the link. The Job Position itself is not deleted."
        confirmLabel="Detach & move"
        onCancel={() => setStageDetachTarget(null)}
        onConfirm={handleStageDetachConfirm}
      />

      {/* ── Archive ── */}
      <Modal
        open={showArchiveModal}
        onClose={archiving ? undefined : () => setShowArchiveModal(false)}
        tone="warn"
        icon={<Archive size={16} />}
        title="Archive opportunity"
        sub={`${opp.name} will be hidden from list views and become read-only. You can restore it at any time.`}
        footer={(
          <>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" disabled={archiving} onClick={() => setShowArchiveModal(false)}>Cancel</Button>
            <Button variant="secondary" size="sm" disabled={archiving} onClick={() => handleArchive(false)}>Archive opportunity only</Button>
            {archivePreview?.length > 0 && (
              <Button variant="primary" size="sm" disabled={archiving} onClick={() => handleArchive(true)}>Archive with linked Job</Button>
            )}
          </>
        )}
      >
        {archivePreview === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-4, #828e9f)' }}>
            <Spinner size={13} /> Checking linked records…
          </div>
        ) : archivePreview.length > 0 ? (
          <div style={{
            padding: 12, borderRadius: 'var(--r-2, 10px)',
            background: 'color-mix(in srgb, var(--warn, #f59e0b) 8%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--warn, #f59e0b) 22%, transparent)',
          }}>
            <p style={{ font: `550 11.5px/1.4 ${FONT}`, color: 'var(--warn, #f59e0b)', marginBottom: 6 }}>Linked records</p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {archivePreview.map((d) => (
                <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-2, #c3ccd6)' }}>
                  <Briefcase size={11} style={{ color: 'var(--fg-4, #828e9f)', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  {d.activeApplications > 0 && (
                    <span style={{ font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-4, #828e9f)' }}>
                      {d.activeApplications} active app{d.activeApplications !== 1 ? 's' : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      {/* ── Lost ── */}
      <Modal
        open={showLostModal}
        onClose={() => setShowLostModal(false)}
        tone="danger"
        icon={<XCircle size={16} />}
        title="Mark as Lost"
        sub="Pick a reason so the pipeline report can explain the loss."
        footer={<><span style={{ flex: 1 }} /><Button variant="ghost" size="sm" onClick={() => setShowLostModal(false)}>Cancel</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lostReasons.map((r) => (
            <button
              key={r._id}
              type="button"
              onClick={() => handleLost(r._id)}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--r-2, 10px)',
                background: 'var(--surface-2, #141b24)', boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
                font: `450 13px/1.4 ${FONT}`, color: 'var(--fg, #eef2f6)',
              }}
            >
              {r.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleLost(null)}
            style={{
              width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--r-2, 10px)',
              background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
              font: `450 13px/1.4 ${FONT}`, fontStyle: 'italic', color: 'var(--fg-4, #828e9f)',
            }}
          >
            No reason
          </button>
        </div>
      </Modal>
    </div>
  );
}
