import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import SectionCard from '../../components/platform/detail/SectionCard';
import SkillsPicker from '../../components/ats/SkillsPicker';
import StageBadge from '../../components/ats/StageBadge';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import {
  Loader2, ChevronLeft, User, FileText, UserCheck, Star,
  Award, Archive, ArchiveRestore, Briefcase,
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
  const { getAppRole } = useOrg();

  const [candidate, setCandidate] = useState(null);
  const [applications, setApplications] = useState([]);
  const [skills, setSkills] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);

  usePageTitle(candidate?.name);

  const isAdmin = getAppRole('ats') === 'admin';
  const canEdit = isAdmin && !candidate?.archived;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await atsApi.getCandidate(slug, candidateId);
      if (!res?.success || !res.candidate) {
        showToast('Candidate not found', 'error');
        navigate(orgPath('/ats/candidates'), { replace: true });
        return;
      }
      setCandidate(res.candidate);
      setApplications(res.applications || []);
      try {
        const sk = await atsApi.listCandidateSkills(slug, candidateId);
        if (sk?.success) setSkills(sk.candidateSkills || sk.skills || sk.data || []);
      } catch { /* skills are optional */ }
    } catch (err) {
      console.error('Failed to load candidate:', err);
      showToast(err.message || 'Failed to load candidate', 'error');
      navigate(orgPath('/ats/candidates'), { replace: true });
    } finally {
      setLoading(false);
    }
  }, [slug, candidateId, navigate, orgPath, showToast]);

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
    try {
      await atsApi.unarchiveCandidate(slug, candidateId);
      setCandidate((c) => ({ ...c, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive', 'error');
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
            </div>
            <p className="text-dark-400 text-sm">
              {candidate.applicationCount || 0} application{candidate.applicationCount === 1 ? '' : 's'}
              {candidate.evaluation > 0 && (
                // 2026-05-17 health-check E.2: clamp evaluation to 0..3.
                // A corrupt value used to print a long star strip and
                // wrap the header line.
                <span className="ml-2 text-amber-400">{'★'.repeat(Math.max(0, Math.min(3, Number(candidate.evaluation) || 0)))}</span>
              )}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {candidate.archived ? (
              <button
                onClick={handleUnarchive}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
              >
                <ArchiveRestore size={14} /> Unarchive
              </button>
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
                          onClick={() => navigate(orgPath(`/ats/applications/${app._id}`))}
                          className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-white">{app.jobName || '—'}</td>
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
              linkTo={(id) => orgPath(`/employee/${id}`)}
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
                onClick={() => navigate(orgPath(`/employee/${candidate.employeeId}`))}
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
                <p className="text-[11px] text-dark-500 mt-2">Choose whether to archive the applications too.</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleArchive(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                Archive candidate only
              </button>
              {archivePreview?.activeApplications > 0 && (
                <button
                  onClick={() => handleArchive(true)}
                  disabled={archiving}
                  className="w-full px-3 py-2 text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg hover:bg-amber-500/35 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
