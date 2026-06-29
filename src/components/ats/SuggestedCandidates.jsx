import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import { withFromContext } from '../../utils/entityDescribe';
import {
  Sparkles, Loader2, Plus, X, ExternalLink, Users, RefreshCw, Undo2,
  ThumbsUp, CheckCircle2, Building2,
} from 'lucide-react';

/**
 * SuggestedCandidates — rule-based "top-N preferred candidates" for an
 * approved + open job position. Role-aware on a shared Job Detail page:
 *
 *  - Account owner (canRecommend): "Recommend" — hands the candidate to the
 *    job's recruiter. Never creates an application (see feedback memory
 *    ats_application_creation_ownership: app creation is the recruiter's job).
 *  - Recruiter (canCreate): "Create application" — gated behind an explicit
 *    "candidate confirmed available/interested" check, because recruiters
 *    talk to an existing candidate before opening a new application.
 *  - Everyone: View profile, Dismiss, and a "Recommended by …" badge.
 *
 * Props: orgSlug, jobId, job, canCreate, canRecommend, onCreated, refreshKey.
 */
function fitTone(score) {
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
  if (score >= 50) return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  return 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30';
}

export default function SuggestedCandidates({
  orgSlug, jobId, job, canCreate = false, canRecommend = false, onCreated, refreshKey = 0,
}) {
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);          // candidate id with an in-flight action
  const [confirmId, setConfirmId] = useState(null);    // row showing the availability confirm
  const [availChecked, setAvailChecked] = useState(false);
  const [recentlyDismissed, setRecentlyDismissed] = useState(null);
  const [myEmployee, setMyEmployee] = useState(null); // caller's employee — last-resort recruiter fallback
  const [limit, setLimit] = useState(10); // top-10 default; "Show more" expands to 25

  // Resolve the caller's own employee once, used only as the final fallback
  // when neither the candidate's manager nor the job has a recruiter.
  useEffect(() => {
    if (!orgSlug || !canCreate) return;
    let alive = true;
    employeeApi.getMyProfile(orgSlug)
      .then((res) => {
        if (alive && res?.success && res.employee) {
          setMyEmployee({ id: res.employee._id, name: res.employee.fullName || res.employee.name || '' });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [orgSlug, canCreate]);

  const fetchSuggestions = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await atsApi.getSuggestedCandidates(orgSlug, jobId, { limit });
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId, limit]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions, refreshKey]);

  const candidates = data?.candidates || [];
  // Same-company matches first, then a separator, then cross-company ones.
  const sameCompany = candidates.filter((c) => !c.company?.isOther);
  const otherCompany = candidates.filter((c) => c.company?.isOther);
  const orderedCandidates = [...sameCompany, ...otherCompany];
  const firstOtherIndex = sameCompany.length;

  const patchCandidate = (id, patch) => setData((prev) => prev && {
    ...prev,
    candidates: prev.candidates.map((c) => (String(c._id) === String(id) ? { ...c, ...patch } : c)),
  });
  const removeCandidate = (id) => setData((prev) => prev && {
    ...prev,
    candidates: prev.candidates.filter((c) => String(c._id) !== String(id)),
  });

  // --- Recruiter: create application (availability-confirmed) ---
  const handleCreate = async (cand) => {
    try {
      setBusyId(cand._id);
      // Recruiter inherits the candidate's Manager — the real employee who
      // sourced/owns this candidate and made the availability call — rather
      // than the job's recruiter (often the shared "HR Team" placeholder).
      // Fallback chain: candidate manager → job recruiter → the creator.
      // accountOwner is still snapshotted from the job on the server side.
      const recruiterId = cand.managerId || job?.recruiterId || myEmployee?.id || null;
      const recruiterName = cand.managerName || job?.recruiterName || myEmployee?.name || '';
      await atsApi.createApplication(orgSlug, {
        candidateId: String(cand._id),
        candidateName: cand.name,
        email: cand.email || null,
        phone: cand.phone || null,
        linkedinProfile: cand.linkedinProfile || null,
        jobPositionId: jobId,
        recruiterId,
        recruiterName,
      });
      showToast(`${cand.name} added to this job`);
      setConfirmId(null);
      setAvailChecked(false);
      removeCandidate(cand._id);
      onCreated?.();
    } catch (err) {
      showToast(err.message || 'Failed to create application', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // --- Cross-company: copy the candidate into this company, then create ---
  const handleCopyCreate = async (cand) => {
    try {
      setBusyId(cand._id);
      const copy = await atsApi.copyCrossCompanyCandidate(orgSlug, jobId, String(cand._id));
      await atsApi.createApplication(orgSlug, {
        candidateId: copy.candidateId,
        candidateName: copy.candidateName || cand.name,
        email: copy.email || null,
        phone: copy.phone || null,
        linkedinProfile: copy.linkedinProfile || null,
        jobPositionId: jobId,
        // The copy is now owned in THIS company by the acting recruiter.
        recruiterId: myEmployee?.id || job?.recruiterId || null,
        recruiterName: myEmployee?.name || job?.recruiterName || '',
      });
      showToast(`${cand.name} copied to this company and added to the job`);
      setConfirmId(null);
      setAvailChecked(false);
      removeCandidate(cand._id);
      onCreated?.();
    } catch (err) {
      showToast(err.message || 'Failed to copy & create', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // --- Account owner: recommend to recruiter ---
  const handleRecommend = async (cand) => {
    try {
      setBusyId(cand._id);
      const res = await atsApi.recommendSuggestedCandidate(orgSlug, jobId, String(cand._id));
      patchCandidate(cand._id, { recommendation: res.recommendation || { by: 'you', at: new Date().toISOString() } });
      showToast(`Recommended ${cand.name} to the recruiter`);
    } catch (err) {
      showToast(err.message || 'Failed to recommend', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdrawRecommend = async (cand) => {
    try {
      setBusyId(cand._id);
      await atsApi.unrecommendSuggestedCandidate(orgSlug, jobId, String(cand._id));
      patchCandidate(cand._id, { recommendation: null });
    } catch (err) {
      showToast(err.message || 'Failed to withdraw', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (cand) => {
    try {
      setBusyId(cand._id);
      await atsApi.dismissSuggestedCandidate(orgSlug, jobId, String(cand._id));
      removeCandidate(cand._id);
      setRecentlyDismissed({ id: String(cand._id), name: cand.name });
    } catch (err) {
      showToast(err.message || 'Failed to dismiss', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleUndoDismiss = async () => {
    if (!recentlyDismissed) return;
    try {
      await atsApi.undismissSuggestedCandidate(orgSlug, jobId, recentlyDismissed.id);
      setRecentlyDismissed(null);
      fetchSuggestions();
    } catch (err) {
      showToast(err.message || 'Failed to undo', 'error');
    }
  };

  const openCandidate = (candidateId) =>
    navigate(withFromContext(orgPath(`/ats/candidates/${candidateId}`), 'ats_job', jobId));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-rivvra-300" />
          <h2 className="text-lg font-semibold text-white">Suggested Candidates</h2>
          {!loading && candidates.length > 0 && (
            <span className="text-dark-400 text-sm font-normal">({candidates.length})</span>
          )}
        </div>
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="text-dark-400 hover:text-white text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title="Refresh suggestions"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <p className="text-dark-500 text-xs mb-4">
        Best-fit people from your candidate database, ranked by skills, experience and profile.
        {canRecommend && !canCreate && ' Recommend a candidate and the recruiter will check availability before adding them.'}
        {canCreate && ' Confirm the candidate is available before creating an application.'}
      </p>

      {recentlyDismissed && (
        <div className="mb-3 flex items-center justify-between bg-dark-800/60 border border-dark-700 rounded-lg px-3 py-2 text-xs text-dark-300">
          <span>Dismissed <span className="text-white">{recentlyDismissed.name}</span>.</span>
          <button onClick={handleUndoDismiss} className="text-rivvra-300 hover:text-rivvra-200 flex items-center gap-1">
            <Undo2 size={12} /> Undo
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
        </div>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-dark-400 text-sm mb-2">{error}</p>
          <button onClick={fetchSuggestions} className="text-rivvra-300 hover:text-rivvra-200 text-xs">Retry</button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Users className="w-7 h-7 text-dark-500 mb-2" />
          <p className="text-dark-400 text-sm">No strong matches in your candidate database yet.</p>
          <p className="text-dark-500 text-xs mt-1">
            We only show candidates who genuinely fit the required skills. Add candidates or refine the job's required skills to surface more.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-dark-700/70">
          {orderedCandidates.map((c, i) => (
            <Fragment key={c._id}>
            {i === firstOtherIndex && otherCompany.length > 0 && (
              <li className="pt-5 pb-1">
                <div className="rounded-xl bg-amber-500/[0.07] ring-1 ring-amber-500/25 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30">
                      <Building2 size={13} className="text-amber-300" />
                    </span>
                    <span className="text-sm font-semibold text-amber-100">From other companies in your organization</span>
                    <span className="text-[11px] font-medium text-amber-300/80 bg-amber-500/10 rounded-full px-2 py-0.5">{otherCompany.length}</span>
                  </div>
                  <p className="text-[11px] text-amber-200/60 mt-1.5 leading-relaxed">
                    These candidates belong to a different company in your org. Use <span className="text-amber-200/90 font-medium">Recommend</span> to hand them to their owner — they can't be added to this job directly.
                  </p>
                </div>
              </li>
            )}
            <li className="py-3 flex items-start gap-3">
              <div className={`shrink-0 mt-0.5 w-12 h-12 rounded-lg ring-1 flex flex-col items-center justify-center ${fitTone(c.fitScore)}`}>
                <span className="text-base font-semibold leading-none">{c.fitScore}</span>
                <span className="text-[9px] uppercase tracking-wide opacity-70">fit</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => openCandidate(c._id)}
                    className="text-white font-medium text-sm hover:text-rivvra-300 transition-colors truncate"
                  >
                    {c.name}
                  </button>
                  {typeof c.aiTotalYearsExp === 'number' && (
                    <span className="text-[11px] text-dark-400">{c.aiTotalYearsExp} yrs exp</span>
                  )}
                  {c.managerName && (
                    <span className="text-[11px] text-dark-500">· Owner: {c.managerName}</span>
                  )}
                  {c.company?.isOther && c.company?.name && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20 px-1.5 py-0.5 rounded" title="Candidate from another company in your organization">
                      {c.company.name}
                    </span>
                  )}
                </div>

                {/* Recommended-by badge — the recruiter's cue to follow up */}
                {c.recommendation && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20 px-1.5 py-0.5 rounded">
                    <ThumbsUp size={10} />
                    Recommended{c.recommendation.by ? ` by ${c.recommendation.by}` : ''}
                    {canRecommend && (
                      <button
                        onClick={() => handleWithdrawRecommend(c)}
                        disabled={busyId === c._id}
                        className="ml-1 text-emerald-300/70 hover:text-red-400"
                        title="Withdraw recommendation"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                )}

                {c.aiProfileSummary && (
                  <p className="text-dark-400 text-xs mt-1 line-clamp-2">{c.aiProfileSummary}</p>
                )}

                {c.matchedSkills?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.matchedSkills.slice(0, 6).map((s) => (
                      <span key={s} className="text-[10px] bg-rivvra-500/10 text-rivvra-200 ring-1 ring-rivvra-500/20 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {c.matchedSkills.length > 6 && (
                      <span className="text-[10px] text-dark-500">+{c.matchedSkills.length - 6} more</span>
                    )}
                  </div>
                )}

                {/* Recruiter: inline availability confirm before creating */}
                {confirmId === c._id && (
                  <div className="mt-2 bg-dark-800/60 border border-dark-700 rounded-lg p-2.5">
                    <label className="flex items-start gap-2 text-xs text-dark-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={availChecked}
                        onChange={(e) => setAvailChecked(e.target.checked)}
                        className="mt-0.5 accent-rivvra-500"
                      />
                      <span>I've confirmed <span className="text-white">{c.name}</span> is still available and interested in this role.{c.company?.isOther ? ' They\'ll be copied into this company.' : ''}</span>
                    </label>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => (c.company?.isOther ? handleCopyCreate(c) : handleCreate(c))}
                        disabled={!availChecked || busyId === c._id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 disabled:opacity-40 transition-colors"
                      >
                        {busyId === c._id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        {c.company?.isOther ? 'Copy & create application' : 'Create application'}
                      </button>
                      <button
                        onClick={() => { setConfirmId(null); setAvailChecked(false); }}
                        className="text-dark-400 hover:text-white text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1.5">
                {/* Create only when this viewer can actually own the app for
                    this candidate (its manager / their lead / admin). Everyone
                    else recommends — the handoff to the candidate's manager. */}
                {canRecommend && !(canCreate && c.canCreate) && !c.recommendation && (
                  <button
                    onClick={() => handleRecommend(c)}
                    disabled={busyId === c._id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-dark-700 text-rivvra-200 hover:bg-dark-600 disabled:opacity-50 transition-colors"
                    title="Recommend this candidate to the candidate's manager"
                  >
                    {busyId === c._id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
                    Recommend
                  </button>
                )}
                {canCreate && c.canCreate && confirmId !== c._id && (
                  <button
                    onClick={() => { setConfirmId(c._id); setAvailChecked(false); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 transition-colors"
                    title="Create an application (after confirming availability)"
                  >
                    <Plus size={12} /> Create
                  </button>
                )}
                {canCreate && c.company?.isOther && confirmId !== c._id && (
                  <button
                    onClick={() => { setConfirmId(c._id); setAvailChecked(false); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 transition-colors"
                    title="Copy this candidate into this company and create an application"
                  >
                    <Plus size={12} /> Copy &amp; Create
                  </button>
                )}
                <button
                  onClick={() => openCandidate(c._id)}
                  className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                  title="View candidate profile"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={() => handleDismiss(c)}
                  disabled={busyId === c._id}
                  className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-50"
                  title="Dismiss this suggestion"
                >
                  <X size={14} />
                </button>
              </div>
            </li>
            </Fragment>
          ))}
        </ul>
      )}

      {/* Show more — expand the curated top-10 up to 25. Beyond that, the
          Candidates tab is the place for exhaustive, filterable search. */}
      {!loading && !error && limit < 25 && candidates.length >= limit && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setLimit(25)}
            className="text-rivvra-300 hover:text-rivvra-200 text-xs font-medium"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
