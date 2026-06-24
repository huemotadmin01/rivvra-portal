import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { withFromContext } from '../../utils/entityDescribe';
import {
  Sparkles, Loader2, Plus, X, ExternalLink, Users, RefreshCw, Undo2,
} from 'lucide-react';

/**
 * SuggestedCandidates — rule-based "top-N preferred candidates" for an
 * approved + open job position (shipped 2026-06-24). Lets the account owner
 * review the best-fit people in the candidate DB and one-click submit them
 * to this req, instead of hand-filtering the candidate tab / Ask-AI.
 *
 * The card only renders when the job is approved + open (the caller gates
 * on that), but the endpoint re-checks server-side.
 *
 * Props:
 *  - orgSlug, jobId
 *  - job: the job doc (used for default recruiter on submit + refetch key)
 *  - canSubmit: whether the viewer may submit (create application)
 *  - onSubmitted: callback after a successful submit (refresh the apps list)
 *  - refreshKey: bump to force a re-fetch (e.g. after editing required skills)
 */
function fitTone(score) {
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
  if (score >= 50) return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  return 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30';
}

export default function SuggestedCandidates({
  orgSlug, jobId, job, canSubmit = false, onSubmitted, refreshKey = 0,
}) {
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);          // full response
  const [submittingId, setSubmittingId] = useState(null);
  const [dismissingId, setDismissingId] = useState(null);
  const [recentlyDismissed, setRecentlyDismissed] = useState(null); // {id, name}

  const fetchSuggestions = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await atsApi.getSuggestedCandidates(orgSlug, jobId, { limit: 10 });
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions, refreshKey]);

  const candidates = data?.candidates || [];

  const handleSubmit = async (cand) => {
    try {
      setSubmittingId(cand._id);
      await atsApi.createApplication(orgSlug, {
        candidateId: String(cand._id),
        candidateName: cand.name,
        email: cand.email || null,
        phone: cand.phone || null,
        linkedinProfile: cand.linkedinProfile || null,
        jobPositionId: jobId,
        recruiterId: job?.recruiterId || null,
        recruiterName: job?.recruiterName || '',
      });
      showToast(`${cand.name} submitted to this job`);
      // Remove from the local list immediately; backend now excludes them.
      setData((prev) => prev && {
        ...prev,
        candidates: prev.candidates.filter((c) => String(c._id) !== String(cand._id)),
      });
      onSubmitted?.();
    } catch (err) {
      showToast(err.message || 'Failed to submit candidate', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDismiss = async (cand) => {
    try {
      setDismissingId(cand._id);
      await atsApi.dismissSuggestedCandidate(orgSlug, jobId, String(cand._id));
      setData((prev) => prev && {
        ...prev,
        candidates: prev.candidates.filter((c) => String(c._id) !== String(cand._id)),
      });
      setRecentlyDismissed({ id: String(cand._id), name: cand.name });
    } catch (err) {
      showToast(err.message || 'Failed to dismiss', 'error');
    } finally {
      setDismissingId(null);
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
          <p className="text-dark-400 text-sm">No matching candidates found yet.</p>
          <p className="text-dark-500 text-xs mt-1">
            Add required skills to this job or build up your candidate database to get suggestions.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-dark-700/70">
          {candidates.map((c) => (
            <li key={c._id} className="py-3 flex items-start gap-3">
              {/* Fit score */}
              <div className={`shrink-0 mt-0.5 w-12 h-12 rounded-lg ring-1 flex flex-col items-center justify-center ${fitTone(c.fitScore)}`}>
                <span className="text-base font-semibold leading-none">{c.fitScore}</span>
                <span className="text-[9px] uppercase tracking-wide opacity-70">fit</span>
              </div>

              {/* Body */}
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
                </div>

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
                {(!c.matchedSkills || c.matchedSkills.length === 0) && data?.usedJdFallback && (
                  <p className="text-[10px] text-dark-500 mt-1">Add required skills to this job for sharper matches.</p>
                )}
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1.5">
                {canSubmit && (
                  <button
                    onClick={() => handleSubmit(c)}
                    disabled={submittingId === c._id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 disabled:opacity-50 transition-colors"
                    title="Submit this candidate to the job"
                  >
                    {submittingId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Submit
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
                  disabled={dismissingId === c._id}
                  className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-50"
                  title="Dismiss this suggestion"
                >
                  {dismissingId === c._id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
