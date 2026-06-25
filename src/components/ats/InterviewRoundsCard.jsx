import { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, Minus, Lock } from 'lucide-react';
import SectionCard from '../platform/detail/SectionCard';
import atsApi from '../../utils/atsApi';

/**
 * InterviewRoundsCard — per-job technical interview rounds editor.
 *
 * Most requirements run L1 + L2 (the workspace default). Some need more
 * rounds (L3, L4, L5 …). The job's Account Owner (or an ATS admin) can add
 * rounds here for THIS requirement only; base rounds are shared and fixed,
 * and an extra round can't be removed once an application has reached it.
 *
 * 2026-06-26 — per_job_interview_rounds_plan.md
 */
export default function InterviewRoundsCard({ orgSlug, jobId }) {
  const [rounds, setRounds] = useState([]);
  const [baseCount, setBaseCount] = useState(2);
  const [maxRounds, setMaxRounds] = useState(10);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    try {
      const res = await atsApi.listInterviewRounds(orgSlug, jobId);
      if (res?.success) {
        setRounds(res.rounds || []);
        setBaseCount(res.baseCount ?? 2);
        setMaxRounds(res.maxRounds ?? 10);
        setCanEdit(res.canEdit === true);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load interview rounds');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId]);

  useEffect(() => { load(); }, [load]);

  const total = rounds.length;
  const lastRound = rounds[rounds.length - 1];
  const canAdd = canEdit && total < maxRounds;
  // The last round is removable only if it's an extra (job-scoped) round
  // that no application has reached/scheduled yet.
  const canRemove = canEdit && total > baseCount && lastRound?.isExtra && !lastRound?.inUse;

  const setTotal = useCallback(async (next) => {
    setSaving(true);
    setError('');
    try {
      const res = await atsApi.setInterviewRounds(orgSlug, jobId, next);
      if (res?.success) {
        await load();
      } else {
        setError(res?.error || 'Failed to update interview rounds');
      }
    } catch (e) {
      setError(e?.message || 'Failed to update interview rounds');
    } finally {
      setSaving(false);
    }
  }, [orgSlug, jobId, load]);

  return (
    <SectionCard id="card-interview-rounds" title="Interview Rounds" icon={Layers}>
      {loading ? (
        <div className="text-sm text-dark-500">Loading…</div>
      ) : (
        <>
          <p className="text-[13px] text-dark-400 mb-3">
            Technical interview rounds for this requirement. The first {baseCount}{' '}
            (L1, L2) are the workspace standard; add more (L3, L4 …) only if this role needs them.
            <span className="text-dark-500"> HR Discussion always follows the last round.</span>
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {rounds.map((r) => (
              <span
                key={r.key}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium border ${
                  r.isExtra
                    ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-300'
                    : 'bg-dark-800 border-dark-700 text-dark-200'
                }`}
                title={r.isExtra ? (r.inUse ? 'Extra round — in use by an application' : 'Extra round for this job') : 'Standard round'}
              >
                {r.label}
                {r.isExtra && r.inUse && <Lock className="w-3 h-3 opacity-70" />}
              </span>
            ))}
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTotal(total + 1)}
                disabled={!canAdd || saving}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium bg-rivvra-500/15 text-rivvra-300 border border-rivvra-500/30 hover:bg-rivvra-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" /> Add round (L{total + 1})
              </button>
              <button
                type="button"
                onClick={() => setTotal(total - 1)}
                disabled={!canRemove || saving}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium bg-dark-800 text-dark-300 border border-dark-700 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  total <= baseCount ? 'Standard rounds cannot be removed'
                    : !lastRound?.isExtra ? 'Standard rounds cannot be removed'
                    : lastRound?.inUse ? 'In use by an application — move it back first'
                    : 'Remove the last round'
                }
              >
                <Minus className="w-3.5 h-3.5" /> Remove last
              </button>
              {saving && <span className="text-[13px] text-dark-500">Saving…</span>}
            </div>
          ) : (
            <p className="text-[13px] text-dark-500">
              Only the Account Owner or an ATS admin can change interview rounds.
            </p>
          )}

          {error && <p className="mt-2 text-[13px] text-red-400">{error}</p>}
        </>
      )}
    </SectionCard>
  );
}
