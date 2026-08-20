// ============================================================================
// AtsCandidateDetailV2.jsx — candidate record, on ds
// ============================================================================
//
// Route: /org/:slug/ats/candidates/:candidateId, behind PageSwitch.
//
// The interesting thing on this page is not the layout, it is the permission
// lattice. Nine derived booleans decide who can see what and who can write,
// and they are spliced in byte-identically because getting any one of them
// backwards either leaks another company's data or lets the wrong person edit
// a record:
//
//   isAdmin / canRecruit  — the 2026-05-18 two-tier RBAC. Any ATS user may
//                           edit and archive; delete and unarchive stay admin.
//   isMine                — managerId === my employee._id. Note both sides are
//                           String()-coerced: this is the ObjectId-vs-string
//                           comparison that has already caused one visibility
//                           bug elsewhere in the platform.
//   canActOnThis          — isAdmin || isMine. Read is open to all; writes are
//                           not.
//   isCrossCompany        — the candidate lives in a different company in this
//                           org, reached via cross-company suggestions.
//   crossCompanySafe      — `!!currentCompanyId && !isCrossCompany`. The
//                           `!!currentCompanyId` half is the load-race fix: an
//                           UNRESOLVED company context must not count as
//                           writable, or a cross-company candidate is editable
//                           for the moment before the context settles.
//   canEdit               — every gate above, AND not archived.
//   isViewOnly            — drives the badge, so the reason for read-only is
//                           visible rather than mysterious.
//
// Also carried across unchanged:
//   • `load`'s `_requestKey` de-dupe and its `aborted` flag, which is why the
//     `finally` does not clear loading for a cancelled request — without it a
//     company switch mid-flight leaves the page stuck.
//   • `saveField`'s evaluation coercion. The select hands back strings and the
//     whitelist `[0,1,2,3].includes(n)` is what stops a junk value reaching the
//     API; it also feeds the two `Math.max(0, Math.min(3, …))` star clamps,
//     added after a corrupt value printed a star strip that wrapped the header.
//   • `handleUnarchive`'s in-flight guard — a double-click used to fire twice.
//   • The archive gate: non-admins cannot archive a candidate with active
//     applications, mirroring the backend's CANDIDATE_HAS_ACTIVE_APPLICATIONS
//     so the restriction shows up front instead of as a failed PATCH.
//
// ── Two components deliberately NOT swapped ────────────────────────────────
// 1. `shared/EmployeeLookup` stays. ds `EntityLookup` nominally supersedes it,
//    but EmployeeLookup carries a `probeSalesperson` check that decides whether
//    the selected person renders as a hyperlink — precisely so a legacy
//    managerId with no employee record (a portal_user id, say) does not link to
//    a 404. `EntityLookup` has no equivalent, so swapping would either drop the
//    gate or fork the picker. Every other migrated ATS page
//    (AtsApplicationDetailV2, AtsJobDetailV2, AtsApplicationNewV2) keeps
//    EmployeeLookup too; a manager picker that behaves differently here than on
//    the application page is the "two places disagreed" shape PageSwitch itself
//    was extracted to avoid.
// 2. `SkillsPicker`, `StageBadge` and `AiResumeInsights` are ATS-domain
//    components shared with the other ATS pages, not chrome. They stay.
//
// The archive dialog moves to ds `Modal` rather than `ConfirmDialog`: it has
// three actions (candidate only / candidate + applications / cancel), not two.
// `onClose` is passed as undefined while archiving, which is how ds Modal is
// told to be non-dismissible — preserving legacy's rule that neither Escape nor
// a scrim click can hide an archive in flight.
//
// Not triggered: archive, unarchive, AI re-score, or any inline field save.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import SkillsPicker from '../../components/ats/SkillsPicker';
import StageBadge from '../../components/ats/StageBadge';
import AiResumeInsights from '../../components/ats/AiResumeInsights';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import { withFromContext } from '../../utils/entityDescribe';
import {
  Loader2, ChevronLeft, User, FileText, UserCheck, Star,
  Award, Archive, ArchiveRestore, Briefcase, Building2,
} from 'lucide-react';
import {
  Panel, Button, Chip, Callout, Modal, DataTable, EmptyState,
  InlineField, RecordMeta, Avatar, Spinner,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const metaStyle = { font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 };
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function getInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
}

// StageBadge moved to ../../components/ats/StageBadge.jsx — shared
// component so the same stage renders in the same colour across
// Applications list / Job detail / Candidate detail (audit P1 #12).

const EVAL_OPTIONS = [
  { value: 0, label: 'No rating' },
  { value: 1, label: '★ Good' },
  { value: 2, label: '★★ Very good' },
  { value: 3, label: '★★★ Excellent' },
];
// ── Main Page ──────────────────────────────────────────────────────────────
function AtsCandidateDetailV2() {
  const { slug, candidateId } = useParams();
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const handleScoped404 = useCompanyScoped404('candidate');
  const { getAppRole } = useOrg();

  const [candidate, setCandidate] = useState(null);
  const [applications, setApplications] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [unarchiving, setUnarchiving] = useState(false);
  const [aiRescoring, setAiRescoring] = useState(false);

  const handleAiRescore = useCallback(async () => {
    if (!candidateId) return;
    setAiRescoring(true);
    try {
      const res = await atsApi.rescoreCandidateAi(slug, candidateId);
      if (res?.success) {
        showToast('AI re-score complete', 'success');
        const fresh = await atsApi.getCandidate(slug, candidateId);
        if (fresh?.success) setCandidate(fresh.candidate);
      } else {
        showToast(res?.error || 'AI re-score failed', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'AI re-score failed', 'error');
    } finally {
      setAiRescoring(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, candidateId]);

  usePageTitle(candidate?.name);

  const isAdmin = getAppRole('ats') === 'admin';
  // 2026-05-18 RBAC two-tier: any ATS user can edit candidates + archive.
  // Delete remains admin-only and is gated separately in the kebab menu.
  const canRecruit = !!getAppRole('ats');

  // 2026-05-18 PM: read-all opened for candidates. Writes still gated to
  // managerId === me OR admin. Mirrors AtsApplicationDetail's isMine.
  const [myEmployeeId, setMyEmployeeId] = useState(null);
  useEffect(() => {
    if (!slug) return;
    employeeApi.getMyProfile(slug)
      .then((res) => { if (res?.success && res.employee) setMyEmployeeId(res.employee._id); })
      .catch(() => {});
  }, [slug]);
  const isMine = !!(candidate?.managerId && myEmployeeId && String(candidate.managerId) === String(myEmployeeId));
  const canActOnThis = isAdmin || isMine;
  // Cross-company: the candidate belongs to a different company in the org
  // (reached via org-wide / cross-company suggestions). Read-only — edits/
  // skills/archive would target the wrong company. 2026-06-26.
  const { currentCompanyId, companies, switchCompany } = useCompany();
  const isCrossCompany = !!(candidate?.companyId && currentCompanyId
    && String(candidate.companyId) !== String(currentCompanyId));
  const crossCompanyName = isCrossCompany
    ? (companies.find((c) => String(c._id) === String(candidate.companyId))?.name || 'another company')
    : null;
  // Writes are safe only when the company context is RESOLVED and the
  // candidate is in the active company. Treating an unresolved currentCompanyId
  // as not-writable closes the load-race where a cross-company candidate could
  // be edited before the company context settles. 2026-06-26 audit fix.
  const crossCompanySafe = !!currentCompanyId && !isCrossCompany;
  const canEdit = canRecruit && canActOnThis && !candidate?.archived && crossCompanySafe;
  const isViewOnly = !!(canRecruit && candidate && (!canActOnThis || isCrossCompany));

  const load = useCallback(async () => {
    setLoading(true);
    // _requestKey dedups rapid re-loads (route param churn / company switch)
    // by aborting the stale in-flight request — mirrors the list pages.
    // aborted-flag so finally skips setLoading(false) for the cancelled call.
    let aborted = false;
    try {
      const res = await atsApi.getCandidate(slug, candidateId, { _requestKey: 'ats:candidate:detail' });
      if (!res?.success || !res.candidate) {
        showToast('Candidate not found', 'error');
        navigate(orgPath('/ats/candidates'), { replace: true });
        return;
      }
      setCandidate(res.candidate);
      setApplications(res.applications || []);
      // (Skills are fetched by SkillsPicker itself — a duplicate
      // listCandidateSkills call here fed state nothing rendered.)
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      if (handleScoped404(err)) return;
      console.error('Failed to load candidate:', err);
      showToast(err.message || 'Failed to load candidate', 'error');
      navigate(orgPath('/ats/candidates'), { replace: true });
    } finally {
      if (!aborted) setLoading(false);
    }
  }, [slug, candidateId, navigate, orgPath, showToast, handleScoped404]);

  useEffect(() => { load(); }, [load]);

  // Recruiters list — fuels the manager dropdown.
  useEffect(() => {
    if (!slug) return;
    atsApi.listRecruiters(slug)
      .then((res) => { if (res.success) setRecruiters(res.recruiters || []); })
      .catch(() => { /* non-fatal */ });
  }, [slug]);

  // Escape dismisses the Archive modal (backdrop click added on the overlay
  // below). Mirrors AtsJobDetail.jsx — blocked while the archive is in flight
  // so a stray keypress can't hide an active operation.
  useEffect(() => {
    if (!showArchiveModal) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !archiving) setShowArchiveModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showArchiveModal, archiving]);

  const recruiterOptions = useMemo(
    () => recruiters.map((r) => ({ value: r._id, label: r.name || r.email || r._id })),
    [recruiters]
  );

  // Generic per-field inline-save. Coerces evaluation to a number (the
  // select sends strings); throws on validation error so InlineField can
  // flash a red status.
  const saveField = async (field, value) => {
    let coerced = value;
    if (field === 'evaluation') {
      const n = Number(value);
      coerced = [0, 1, 2, 3].includes(n) ? n : 0;
    }
    const res = await atsApi.updateCandidate(slug, candidateId, { [field]: coerced });
    if (res?.candidate) {
      setCandidate(res.candidate);
    } else {
      setCandidate((prev) => ({ ...prev, [field]: coerced }));
    }
  };

  // savePerson — atomic update of an id + denormalized name pair (e.g.
  // managerId + managerName). Mirrors AtsApplicationDetail.savePerson so
  // the EmployeeLookup picker behaves identically across detail pages.
  const savePerson = async (idField, nameField, id, name) => {
    try {
      const res = await atsApi.updateCandidate(slug, candidateId, {
        [idField]: id || null,
        [nameField]: name || '',
      });
      if (res?.candidate) {
        setCandidate(res.candidate);
      } else {
        setCandidate((prev) => ({ ...prev, [idField]: id || null, [nameField]: name || '' }));
      }
    } catch (err) {
      showToast(err?.message || `Failed to update ${nameField.replace('Name', '')}`, 'error');
    }
  };

  // ── Archive handlers ─────────────────────────────────────────────────
  const openArchiveModal = async () => {
    setShowArchiveModal(true);
    setArchivePreview(null);
    try {
      const res = await atsApi.archiveCandidatePreview(slug, candidateId);
      setArchivePreview(res || { activeApplications: 0 });
    } catch {
      setArchivePreview({ activeApplications: 0 });
    }
  };

  const handleArchive = async (cascade = false) => {
    setArchiving(true);
    try {
      const res = await atsApi.archiveCandidate(slug, candidateId, { cascade });
      setShowArchiveModal(false);
      setCandidate((c) => ({ ...c, archived: true }));
      const cnt = res?.cascadedAppCount || 0;
      showToast(
        cascade && cnt > 0
          ? `Archived (with ${cnt} application${cnt === 1 ? '' : 's'})`
          : 'Archived',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Failed to archive', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    if (unarchiving) return; // in-flight guard — double-click fired twice
    setUnarchiving(true);
    try {
      await atsApi.unarchiveCandidate(slug, candidateId);
      setCandidate((c) => ({ ...c, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive', 'error');
    } finally {
      setUnarchiving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (!candidate) return null;

  // Star strip, clamped 0..3. Extracted because legacy printed the identical
  // expression in two places (header + Evaluation card) and they must not
  // drift — a corrupt evaluation once printed a strip long enough to wrap the
  // header line.
  const stars = '★'.repeat(Math.max(0, Math.min(3, Number(candidate.evaluation) || 0)));

  const appColumns = [
    {
      key: 'jobName',
      header: 'Job',
      render: (app) => (app.jobPositionId && app.jobName ? (
        // Inner Link to the job. The row navigates to the APPLICATION, so
        // stopPropagation is what lets a direct click on the name win.
        <Link
          to={withFromContext(orgPath(`/ats/jobs/${app.jobPositionId}`), 'ats_candidate', candidateId)}
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--fg)', textDecoration: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          {app.jobName}
        </Link>
      ) : (app.jobName || '—')),
    },
    {
      key: 'stage',
      header: 'Stage',
      width: 170,
      // stageName is a denormalised cache, not the source of truth — see the
      // note in the page header. Rendered as legacy does; not re-derived here.
      render: (app) => <StageBadge stageName={app.stageName} />,
    },
    {
      key: 'applied',
      header: 'Applied',
      width: 140,
      muted: true,
      render: (app) => formatDate(app.createdAt || app.appliedOn),
    },
  ];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1280, display: 'grid', gap: 18 }}>
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(orgPath('/ats/candidates'))}
          iconLeft={<ChevronLeft size={16} />}
        >
          Back to Candidates
        </Button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
          <Avatar name={candidate.name} initials={getInitials(candidate.name)} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ font: "700 22px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
                {candidate.name || 'Unnamed Candidate'}
              </h1>
              {candidate.archived && (
                <Chip uppercase><Archive size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />Archived</Chip>
              )}
              {isViewOnly && !isCrossCompany && (
                <Chip tone="warn" title="You can view this candidate but only the assigned manager or an admin can edit.">
                  View only
                </Chip>
              )}
              {isCrossCompany && (
                <Chip
                  tone="warn"
                  title="This candidate belongs to another company in your organization. Open them from that company to edit, or use Copy & Create on a job to bring them into this company."
                >
                  <Building2 size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                  {crossCompanyName} · read-only
                </Chip>
              )}
            </div>
            <p style={metaStyle}>
              {/* applications.length, NOT candidate.applicationCount: the denorm
                  drifts on archive cascade and email-change edges, and this
                  header must agree with the table below it. */}
              {applications.length} application{applications.length === 1 ? '' : 's'}
              {candidate.evaluation > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--acc-amber)' }}>{stars}</span>
              )}
            </p>
          </div>
        </div>

        {/* Archive is open to any recruiter; Unarchive stays admin-only. The
            whole bar is hidden for non-managers, matching the read-all +
            manager-write gate. */}
        {canRecruit && canActOnThis && crossCompanySafe && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {candidate.archived ? (
              isAdmin && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUnarchive}
                  disabled={unarchiving}
                  iconLeft={unarchiving ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                >
                  Unarchive
                </Button>
              )
            ) : (
              <Button variant="ghost" size="sm" onClick={openArchiveModal} iconLeft={<Archive size={14} />}>
                Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Cross-company notice. Full-width below the header rather than inside
          its flex row, where it used to get squeezed between the title and the
          action buttons. The counts on this page read 0 because it is scoped to
          the active company — so the useful thing to offer is the switch. */}
      {isCrossCompany && (
        <Callout
          tone="warn"
          icon={<Building2 size={16} />}
          title={`This candidate belongs to ${crossCompanyName}`}
          actions={(
            <Button
              variant="secondary"
              size="sm"
              onClick={() => switchCompany(String(candidate.companyId))}
              iconLeft={<Building2 size={13} />}
            >
              Switch to {crossCompanyName}
            </Button>
          )}
        >
          You&apos;re viewing them read-only from {companies.find((c) => String(c._id) === String(currentCompanyId))?.name || 'your current company'}.
          Their applications, skills and full history live in {crossCompanyName} — switch companies to see and edit them.
        </Callout>
      )}

      {/* Body: main + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18, alignItems: 'start' }} className="max-lg:!grid-cols-1">
        {/* Main column */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <Panel title="Contact" icon={<User size={16} />}>
            <InlineField label="Full Name" field="name" value={candidate.name} editable={canEdit} onSave={saveField} required />
            <InlineField label="Email" field="email" value={candidate.email} type="email" editable={canEdit} onSave={saveField} placeholder="Add email" />
            <InlineField label="Phone" field="phone" value={candidate.phone} type="phone" editable={canEdit} onSave={saveField} placeholder="Add phone" />
            <InlineField label="Mobile" field="mobile" value={candidate.mobile} type="phone" editable={canEdit} onSave={saveField} placeholder="Add mobile" />
            <InlineField label="LinkedIn" field="linkedinProfile" value={candidate.linkedinProfile} type="url" editable={canEdit} onSave={saveField} placeholder="LinkedIn URL" />
          </Panel>

          <Panel title="Description" icon={<FileText size={16} />}>
            <InlineField
              label="Description"
              field="description"
              value={candidate.description}
              type="textarea"
              editable={canEdit}
              onSave={saveField}
              placeholder="Background, summary, recruiter notes…"
            />
          </Panel>

          {/* Same SkillsPicker the application detail uses, so skills can be
              edited inline without bouncing to a sub-route. */}
          <Panel title="Skills" icon={<Award size={16} />}>
            <SkillsPicker orgSlug={slug} candidateId={candidateId} readOnly={!canEdit} />
          </Panel>

          {/* AI-extracted resume insights. Renders nothing until backfill or
              new-application processing has populated them. */}
          <AiResumeInsights
            candidate={candidate}
            canRescore={isAdmin && crossCompanySafe}
            rescoring={aiRescoring}
            onRescore={handleAiRescore}
          />

          <Panel
            title="Applications"
            icon={<Briefcase size={16} />}
            actions={<Chip>{applications.length}</Chip>}
            flush
          >
            <DataTable
              columns={appColumns}
              rows={applications}
              rowKey="_id"
              onRowClick={(app) => navigate(withFromContext(orgPath(`/ats/applications/${app._id}`), 'ats_candidate', candidateId))}
              empty={(
                <EmptyState icon={<Briefcase size={24} />} title="No applications yet" compact>
                  This candidate has not applied to any job in this company.
                </EmptyState>
              )}
            />
          </Panel>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <Panel title="Owner" icon={<UserCheck size={16} />}>
            <EmployeeLookup
              orgSlug={slug}
              label="Manager"
              currentValue={candidate.managerId}
              currentName={candidate.managerName}
              editable={canEdit}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_candidate', candidateId)}
              onSelect={(id, name) => savePerson('managerId', 'managerName', id, name)}
            />
          </Panel>

          <Panel title="Evaluation" icon={<Star size={16} />}>
            <InlineField
              label="Rating"
              field="evaluation"
              value={candidate.evaluation ?? 0}
              type="select"
              options={EVAL_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={candidate.evaluation > 0
                ? <span style={{ color: 'var(--acc-amber)' }}>{stars}</span>
                : undefined}
            />
          </Panel>

          {candidate.employeeId && (
            <Panel title="Hired" icon={<UserCheck size={16} />}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(withFromContext(orgPath(`/employee/${candidate.employeeId}`), 'ats_candidate', candidateId))}
              >
                View linked employee →
              </Button>
            </Panel>
          )}

          <Panel>
            <RecordMeta
              createdAt={candidate.createdAt}
              createdByName={candidate.createdByName}
              updatedAt={candidate.updatedAt}
              updatedByName={candidate.updatedByName}
            />
          </Panel>
        </div>
      </div>

      {/* Archive confirmation. `onClose` is undefined while archiving — that is
          how ds Modal is told to be non-dismissible, preserving legacy's rule
          that neither Escape nor a scrim click can hide an archive in flight. */}
      <Modal
        open={showArchiveModal}
        onClose={archiving ? undefined : () => setShowArchiveModal(false)}
        size="sm"
        tone="warn"
        icon={<Archive size={16} />}
        title="Archive Candidate"
        sub={<>Archive <strong style={{ color: 'var(--fg)' }}>{candidate.name}</strong>? Hidden from list views, can be restored at any time.</>}
        footer={(
          <div style={{ display: 'grid', gap: 8, width: '100%' }}>
            <Button
              variant="secondary"
              block
              onClick={() => handleArchive(false)}
              disabled={archiving || (!isAdmin && (archivePreview?.activeApplications ?? 0) > 0)}
              iconLeft={archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
            >
              Archive candidate only
            </Button>
            {archivePreview?.activeApplications > 0 && (
              <Button
                variant="secondary"
                block
                onClick={() => handleArchive(true)}
                disabled={archiving || !isAdmin}
                iconLeft={archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
              >
                Archive candidate + {archivePreview.activeApplications} application{archivePreview.activeApplications === 1 ? '' : 's'}
              </Button>
            )}
            <Button variant="ghost" block onClick={() => setShowArchiveModal(false)} disabled={archiving}>
              Cancel
            </Button>
          </div>
        )}
      >
        {archivePreview === null ? (
          <span style={{ ...microStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={12} className="animate-spin" /> Checking linked records…
          </span>
        ) : archivePreview.activeApplications > 0 ? (
          <Callout tone="warn" title="Linked records:">
            <span style={{ display: 'block' }}>
              {archivePreview.activeApplications} active application{archivePreview.activeApplications === 1 ? '' : 's'}
            </span>
            <span style={{ ...microStyle, display: 'block', marginTop: 6 }}>
              {/* Mirrors the backend gate (CANDIDATE_HAS_ACTIVE_APPLICATIONS)
                  so a recruiter sees the restriction up front rather than
                  discovering it through a failed PATCH. */}
              {!isAdmin
                ? 'Only an org admin can archive a candidate with active applications. Refuse or archive the applications first, or ask an admin.'
                : 'Choose whether to archive the applications too.'}
            </span>
          </Callout>
        ) : null}
      </Modal>
    </div>
  );
}

export default AtsCandidateDetailV2;
