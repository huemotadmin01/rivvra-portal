/**
 * AiResumeInsights — renders OpenAI-extracted resume insights for a
 * candidate (summary, skills, years, work history, education, quality
 * score) and optionally a job-fit score from the linked application.
 *
 * 2026-05-28 — shipped with the AI resume scorer feature. Reusable across
 * AtsApplicationDetail (with application + candidate props) and
 * AtsCandidateDetail (candidate only).
 */

import { useState } from 'react';

export function aiScoreClass(score) {
  if (typeof score !== 'number') return 'bg-dark-700 text-dark-300';
  if (score >= 80) return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
  if (score >= 60) return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
  return 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
}

export function AiScoreBadge({ score, label, size = 'md' }) {
  if (typeof score !== 'number') return null;
  const sz = size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1 rounded ${sz} font-medium ${aiScoreClass(score)}`}>
      {label ? <span className="opacity-80">{label}</span> : null}
      <span>{Math.round(score)}</span>
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export default function AiResumeInsights({
  candidate,
  application,
  onRescore,
  rescoring = false,
  canRescore = false,
}) {
  const [expanded, setExpanded] = useState(false);

  const candStatus = candidate?.aiProcessingStatus;
  const appStatus = application?.aiJobFitStatus;
  const hasAnyData = candidate?.aiProfileSummary
    || candidate?.aiQualityScore != null
    || (candidate?.aiSkills && candidate.aiSkills.length)
    || application?.aiJobFitScore != null;

  if (!hasAnyData && !candStatus && !appStatus) {
    return null; // No AI data at all yet — render nothing rather than empty card.
  }

  const statusPill = (status) => {
    if (status === 'pending') return <span className="text-[11px] text-amber-300">Processing…</span>;
    if (status === 'failed') return <span className="text-[11px] text-rose-300">Failed</span>;
    if (status === 'skipped_no_resume' || status === 'skipped') return <span className="text-[11px] text-dark-500">No resume</span>;
    return null;
  };

  return (
    <div className="rounded-lg border border-dark-700/70 bg-dark-900/40 p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold text-dark-400 uppercase tracking-wider flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-rivvra-300">
              <path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z"/>
            </svg>
            AI Resume Insights
          </div>
          {application?.aiJobFitScore != null && (
            <AiScoreBadge score={application.aiJobFitScore} label="Job fit" />
          )}
          {candidate?.aiQualityScore != null && (
            <AiScoreBadge score={candidate.aiQualityScore} label="Quality" size="sm" />
          )}
          {statusPill(candStatus) || statusPill(appStatus)}
        </div>
        {canRescore && onRescore && (
          <button
            type="button"
            onClick={onRescore}
            disabled={rescoring}
            className="text-[11px] text-dark-400 hover:text-dark-200 disabled:opacity-50 underline-offset-2 hover:underline"
          >
            {rescoring ? 'Re-scoring…' : 'Re-score'}
          </button>
        )}
      </div>

      {candidate?.aiProfileSummary && (
        <div className="text-sm text-dark-200 leading-relaxed mb-3">{candidate.aiProfileSummary}</div>
      )}

      {application?.aiJobFitReasoning && (
        <div className="text-xs text-dark-400 mb-3 italic">"{application.aiJobFitReasoning}"</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {candidate?.aiTotalYearsExp != null && (
          <Section title="Total experience">
            <div className="text-sm text-dark-200">{candidate.aiTotalYearsExp} {candidate.aiTotalYearsExp === 1 ? 'year' : 'years'}</div>
          </Section>
        )}
        {Array.isArray(candidate?.aiSkills) && candidate.aiSkills.length > 0 && (
          <Section title="Extracted skills">
            <div className="flex flex-wrap gap-1">
              {candidate.aiSkills.slice(0, expanded ? undefined : 8).map((s) => (
                <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-dark-700/60 text-dark-300">{s}</span>
              ))}
              {!expanded && candidate.aiSkills.length > 8 && (
                <button type="button" onClick={() => setExpanded(true)} className="text-[11px] text-dark-500 hover:text-dark-300">
                  +{candidate.aiSkills.length - 8} more
                </button>
              )}
            </div>
          </Section>
        )}
      </div>

      {Array.isArray(candidate?.aiWorkHistory) && candidate.aiWorkHistory.length > 0 && (
        <div className="mt-3">
          <Section title="Work history">
            <ul className="space-y-1.5 text-xs">
              {candidate.aiWorkHistory.slice(0, expanded ? undefined : 4).map((w, i) => (
                <li key={i} className="text-dark-300">
                  <span className="text-dark-200 font-medium">{w.title}</span>
                  <span className="text-dark-500"> at </span>
                  <span className="text-dark-200">{w.company}</span>
                  {(w.fromMonth || w.toMonth) && (
                    <span className="text-dark-500"> · {w.fromMonth || '?'} → {w.toMonth || '?'}</span>
                  )}
                </li>
              ))}
            </ul>
            {!expanded && candidate.aiWorkHistory.length > 4 && (
              <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-[11px] text-dark-500 hover:text-dark-300">
                Show all ({candidate.aiWorkHistory.length})
              </button>
            )}
          </Section>
        </div>
      )}

      {Array.isArray(candidate?.aiEducation) && candidate.aiEducation.length > 0 && (
        <div className="mt-3">
          <Section title="Education">
            <ul className="space-y-1 text-xs">
              {candidate.aiEducation.map((e, i) => (
                <li key={i} className="text-dark-300">
                  <span className="text-dark-200">{e.degree}</span>
                  {e.institution && <span className="text-dark-500"> · {e.institution}</span>}
                  {e.year && <span className="text-dark-500"> · {e.year}</span>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {candStatus === 'failed' && candidate?.aiLastError && (
        <div className="mt-3 text-[11px] text-rose-400/80">Last error: {candidate.aiLastError}</div>
      )}
    </div>
  );
}
