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
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import SectionCard from '../../components/platform/detail/SectionCard';
import SkillsPicker from '../../components/ats/SkillsPicker';
import StageBadge from '../../components/ats/StageBadge';
import AiResumeInsights from '../../components/ats/AiResumeInsights';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import { withFromContext } from '../../utils/entityDescribe';
import {
  Loader2, ChevronLeft, User, FileText, UserCheck, Star,
  Award, Archive, ArchiveRestore, Briefcase, Building2,
} from 'lucide-react';

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

export default function AtsCandidateDetail() {
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!candidate) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <button
        onClick={() => navigate(orgPath('/ats/candidates'))}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Candidates
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-orange-400">{getInitials(candidate.name)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-white">{candidate.name || 'Unnamed Candidate'}</h1>
              {candidate.archived && (
                <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                  <Archive size={11} /> ARCHIVED
                </span>
              )}
              {isViewOnly && !isCrossCompany && (
                <span
                  className="text-xs bg-amber-500/10 text-amber-300 rounded-full px-2 py-0.5 border border-amber-500/30"
                  title="You can view this candidate but only the assigned manager or an admin can edit."
                >
                  View only
                </span>
              )}
              {isCrossCompany && (
                <span
                  className="text-xs bg-amber-500/10 text-amber-300 rounded-full px-2 py-0.5 border border-amber-500/30 inline-flex items-center gap-1"
                  title="This candidate belongs to another company in your organization. Open them from that company to edit, or use Copy & Create on a job to bring them into this company."
                >
                  <Building2 size={11} /> {crossCompanyName} · read-only
                </span>
              )}
            </div>
            <p className="text-dark-400 text-sm">
              {/* 2026-05-17 health-check I.2: use applications.length so
                  the header count matches the Applications section below
                  it. candidate.applicationCount is a denorm that can
                  drift on archive cascade and emails-change edge cases;
                  the fresh listApplications result is authoritative. */}
              {applications.length} application{applications.length === 1 ? '' : 's'}
              {candidate.evaluation > 0 && (
                // 2026-05-17 health-check E.2: clamp evaluation to 0..3.
                // A corrupt value used to print a long star strip and
                // wrap the header line.
                <span className="ml-2 text-amber-400">{'★'.repeat(Math.max(0, Math.min(3, Number(candidate.evaluation) || 0)))}</span>
              )}
            </p>
          </div>
        </div>

        {/* 2026-05-18 RBAC: Archive available to all recruiters; Unarchive
            stays admin-only. 2026-05-18 PM: action bar hidden entirely for
            non-managers (matches the read-all + manager-write gate). */}
        {canRecruit && canActOnThis && crossCompanySafe && (
          <div className="flex items-center gap-2 flex-wrap">
            {candidate.archived ? (
              isAdmin && (
                <button
                  onClick={handleUnarchive}
                  disabled={unarchiving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unarchiving ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />} Unarchive
                </button>
              )
            ) : (
              <button
                onClick={openArchiveModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all text-dark-300 border-transparent hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30"
              >
                <Archive size={14} /> Archive
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cross-company: this candidate's applications, skills and edits live
          in their own company. The counts here read 0 because the page is
          scoped to the active company — prompt the user to switch. Rendered
          full-width below the header (not inside its flex row, where it got
          squeezed between the title and the action buttons). */}
      {isCrossCompany && (
        <div className="rounded-xl bg-amber-500/[0.07] ring-1 ring-amber-500/25 px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
          <Building2 size={16} className="text-amber-300 mt-0.5 shrink-0 hidden sm:block" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-100 font-medium">This candidate belongs to {crossCompanyName}</p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              You're viewing them read-only from {companies.find((c) => String(c._id) === String(currentCompanyId))?.name || 'your current company'}.
              Their applications, skills and full history live in {crossCompanyName} — switch companies to see and edit them.
            </p>
          </div>
          <button
            onClick={() => switchCompany(String(candidate.companyId))}
            className="shrink-0 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 hover:bg-amber-500/25 transition-colors"
          >
            <Building2 size={13} /> Switch to {crossCompanyName}
          </button>
        </div>
      )}

      {/* Body: main + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Contact" icon={User}>
            <InlineField label="Full Name" field="name" value={candidate.name} editable={canEdit} onSave={saveField} required />
            <InlineField label="Email" field="email" value={candidate.email} type="email" editable={canEdit} onSave={saveField} placeholder="Add email" />
            <InlineField label="Phone" field="phone" value={candidate.phone} type="phone" editable={canEdit} onSave={saveField} placeholder="Add phone" />
            <InlineField label="Mobile" field="mobile" value={candidate.mobile} type="phone" editable={canEdit} onSave={saveField} placeholder="Add mobile" />
            <InlineField label="LinkedIn" field="linkedinProfile" value={candidate.linkedinProfile} type="url" editable={canEdit} onSave={saveField} placeholder="LinkedIn URL" />
          </SectionCard>

          <SectionCard title="Description" icon={FileText}>
            <InlineField
              label="Description"
              field="description"
              value={candidate.description}
              type="textarea"
              editable={canEdit}
              onSave={saveField}
              placeholder="Background, summary, recruiter notes…"
            />
          </SectionCard>

          {/* Skills — same SkillsPicker the application detail uses, so
              admins can add/remove skills inline without bouncing to a
              separate sub-route. Read-only when canEdit is false. */}
          <SectionCard title="Skills" icon={Award}>
            <SkillsPicker orgSlug={slug} candidateId={candidateId} readOnly={!canEdit} />
          </SectionCard>

          {/* 2026-05-28: AI-extracted resume insights (summary, skills, years,
              work history, education, quality score). Renders nothing when no
              data yet — backfill / new-application processing populates it. */}
          <AiResumeInsights
            candidate={candidate}
            canRescore={isAdmin && crossCompanySafe}
            rescoring={aiRescoring}
            onRescore={handleAiRescore}
          />

          {/* Applications */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Applications
                <span className="ml-2 text-dark-400 text-sm font-normal">({applications.length})</span>
              </h2>
            </div>
            {applications.length === 0 ? (
              <div className="card p-8 flex flex-col items-center justify-center">
                <Briefcase className="w-8 h-8 text-dark-500 mb-2" />
                <p className="text-dark-400 text-sm">This candidate has no applications yet.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-700 text-dark-400 text-xs uppercase">
                        <th className="text-left px-4 py-3 font-medium">Job</th>
                        <th className="text-left px-4 py-3 font-medium">Stage</th>
                        <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => (
                        <tr
                          key={app._id}
                          onClick={() => navigate(withFromContext(orgPath(`/ats/applications/${app._id}`), 'ats_candidate', candidateId))}
                          className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                        >
                          {/* 2026-05-17 Phase N: inner Link to the job when
                              jobPositionId is present. Row's onClick still
                              navigates to the application; stopPropagation
                              makes the inner Link win on direct click. */}
                          <td className="px-4 py-3 text-white">
                            {app.jobPositionId && app.jobName ? (
                              <Link
                                to={withFromContext(orgPath(`/ats/jobs/${app.jobPositionId}`), 'ats_candidate', candidateId)}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-rivvra-300 hover:underline"
                              >
                                {app.jobName}
                              </Link>
                            ) : (
                              app.jobName || '—'
                            )}
                          </td>
                          <td className="px-4 py-3"><StageBadge stageName={app.stageName} /></td>
                          <td className="px-4 py-3 text-dark-400 text-xs hidden md:table-cell">{formatDate(app.createdAt || app.appliedOn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <SectionCard title="Owner" icon={UserCheck}>
            <EmployeeLookup
              orgSlug={slug}
              label="Manager"
              currentValue={candidate.managerId}
              currentName={candidate.managerName}
              editable={canEdit}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_candidate', candidateId)}
              onSelect={(id, name) => savePerson('managerId', 'managerName', id, name)}
            />
          </SectionCard>

          <SectionCard title="Evaluation" icon={Star}>
            <InlineField
              label="Rating"
              field="evaluation"
              value={candidate.evaluation ?? 0}
              type="select"
              options={EVAL_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={candidate.evaluation > 0
                ? <span className="text-amber-400">{'★'.repeat(Math.max(0, Math.min(3, Number(candidate.evaluation) || 0)))}</span>
                : undefined}
            />
          </SectionCard>

          {candidate.employeeId && (
            <SectionCard title="Hired" icon={UserCheck}>
              <button
                onClick={() => navigate(withFromContext(orgPath(`/employee/${candidate.employeeId}`), 'ats_candidate', candidateId))}
                className="text-left w-full text-rivvra-400 hover:text-rivvra-300 text-sm py-2 underline-offset-2 hover:underline"
              >
                View linked employee →
              </button>
            </SectionCard>
          )}

          <SectionCard>
            <RecordMeta
              createdAt={candidate.createdAt}
              createdByName={candidate.createdByName}
              updatedAt={candidate.updatedAt}
              updatedByName={candidate.updatedByName}
            />
          </SectionCard>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <Archive size={16} /> Archive Candidate
            </h2>
            <p className="text-sm text-dark-400 mb-3">
              Archive <span className="text-white font-medium">{candidate.name}</span>? Hidden from list views, can be restored at any time.
            </p>
            {archivePreview === null ? (
              <div className="text-xs text-dark-500 mb-4 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking linked records…</div>
            ) : archivePreview.activeApplications > 0 ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-300 font-medium mb-1">Linked records:</p>
                <p className="text-xs text-dark-200">
                  {archivePreview.activeApplications} active application{archivePreview.activeApplications === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-dark-500 mt-2">
                  {/* 2026-05-23: non-admins can't archive a candidate with
                      active applications. Mirrors the backend gate
                      (CANDIDATE_HAS_ACTIVE_APPLICATIONS) so recruiters see
                      the restriction up front rather than discovering it
                      via a failed PATCH. */}
                  {!isAdmin
                    ? 'Only an org admin can archive a candidate with active applications. Refuse or archive the applications first, or ask an admin.'
                    : 'Choose whether to archive the applications too.'}
                </p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleArchive(false)}
                disabled={archiving || (!isAdmin && (archivePreview?.activeApplications ?? 0) > 0)}
                className="w-full px-3 py-2 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                Archive candidate only
              </button>
              {archivePreview?.activeApplications > 0 && (
                <button
                  onClick={() => handleArchive(true)}
                  disabled={archiving || !isAdmin}
                  className="w-full px-3 py-2 text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg hover:bg-amber-500/35 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive candidate + {archivePreview.activeApplications} application{archivePreview.activeApplications === 1 ? '' : 's'}
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
    </div>
  );
}
