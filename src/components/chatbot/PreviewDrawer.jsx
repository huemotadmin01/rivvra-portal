/**
 * PreviewDrawer.jsx — slide-in left panel for previewing a candidate or
 * application without leaving the chatbot conversation.
 *
 * Shipped 2026-05-28 (Phase 3.3) — the biggest UX upgrade: recruiters can
 * now scan multiple results in chat, peek at each one with a single click,
 * and stay in flow. Clicking "Open in full →" navigates to the real detail
 * page if they want the full editor.
 *
 * Usage:
 *   <PreviewDrawer item={{kind:'candidate',id:'abc'}} onClose={…} />
 *   <PreviewDrawer item={{kind:'application',id:'xyz'}} onClose={…} />
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import atsApi from '../../utils/atsApi';
import AiResumeInsights from '../ats/AiResumeInsights';

function Pill({ children, tone = 'neutral' }) {
  const cls = {
    neutral: 'bg-dark-700/60 text-dark-300',
    success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  }[tone] || 'bg-dark-700/60 text-dark-300';
  return <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

export default function PreviewDrawer({ item, orgSlug, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!item?.id) return;
    let aborted = false;
    setLoading(true); setErr(null); setData(null);
    const fetcher = item.kind === 'application'
      ? atsApi.getApplication(orgSlug, item.id)
      : atsApi.getCandidate(orgSlug, item.id);
    fetcher
      .then((res) => {
        if (aborted) return;
        if (res?.success) setData(res);
        else setErr(res?.error || 'Failed to load');
      })
      .catch((e) => { if (!aborted) setErr(e.message || 'Network error'); })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [item?.id, item?.kind, orgSlug]);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;

  const candidate = item.kind === 'application' ? data?.candidate : data?.candidate;
  const application = item.kind === 'application' ? data?.application : null;
  const fullPath = item.kind === 'application'
    ? `/org/${orgSlug}/ats/applications/${item.id}`
    : `/org/${orgSlug}/ats/candidates/${item.id}`;

  return (
    <>
      {/* Click-outside backdrop. Click anywhere outside the drawer closes it. */}
      <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      {/* Drawer slides from LEFT so chatbot widget (bottom-right) stays visible
          and the recruiter can keep scanning results while previewing. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.kind} preview`}
        className="fixed left-0 top-0 bottom-0 z-30 w-full sm:w-[520px] max-w-full bg-dark-900 border-r border-dark-700 shadow-2xl shadow-black/40 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-dark-700 bg-dark-900/95 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 rounded text-dark-400 hover:text-white hover:bg-dark-800 flex items-center justify-center flex-shrink-0"
              aria-label="Close preview"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M14.3 5.7L10 10l4.3 4.3-1.4 1.4L8.6 11.4l-4.3 4.3L2.9 14.3 7.2 10 2.9 5.7 4.3 4.3l4.3 4.3 4.3-4.3z"/></svg>
            </button>
            <div className="text-[11px] uppercase tracking-wider text-dark-500 font-medium">
              {item.kind === 'application' ? 'Application' : 'Candidate'} preview
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(fullPath)}
            className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md text-dark-300 hover:text-white hover:bg-dark-800"
          >
            Open in full
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M4 10h10m0 0l-4-4m4 4l-4 4"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="inline-flex items-center gap-1.5 text-xs text-dark-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rivvra-400 animate-pulse" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rivvra-400 animate-pulse" style={{animationDelay:'150ms'}} />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rivvra-400 animate-pulse" style={{animationDelay:'300ms'}} />
                <span className="ml-1">Loading…</span>
              </div>
            </div>
          )}
          {err && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">{err}</div>
          )}
          {!loading && !err && data && (
            <div className="space-y-4">
              {/* Header summary */}
              <div>
                <h2 className="text-lg font-semibold text-white tracking-tight">
                  {item.kind === 'application' ? application?.candidateName : candidate?.name}
                </h2>
                <div className="text-xs text-dark-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {candidate?.email && <span>{candidate.email}</span>}
                  {candidate?.phone && <span>· {candidate.phone}</span>}
                </div>
                {/* Score row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {item.kind === 'application' && typeof application?.aiJobFitScore === 'number' && (
                    <Pill tone={application.aiJobFitScore >= 80 ? 'success' : application.aiJobFitScore >= 60 ? 'amber' : 'rose'}>
                      Job fit · {Math.round(application.aiJobFitScore)}
                    </Pill>
                  )}
                  {typeof candidate?.aiQualityScore === 'number' && (
                    <Pill tone={candidate.aiQualityScore >= 80 ? 'success' : candidate.aiQualityScore >= 60 ? 'amber' : 'rose'}>
                      Quality · {Math.round(candidate.aiQualityScore)}
                    </Pill>
                  )}
                  {typeof candidate?.aiTotalYearsExp === 'number' && (
                    <Pill>{candidate.aiTotalYearsExp} yrs</Pill>
                  )}
                  {item.kind === 'application' && data?.stageName && (
                    <Pill>Stage · {data.stageName}</Pill>
                  )}
                </div>
                {item.kind === 'application' && data?.jobName && (
                  <div className="text-sm text-dark-200 mt-2.5 leading-tight">
                    For <span className="font-medium text-white">{data.jobName}</span>
                  </div>
                )}
              </div>

              {/* Job-fit reasoning if application */}
              {item.kind === 'application' && application?.aiJobFitReasoning && (
                <div className="rounded-md border border-dark-700 bg-dark-800/40 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-1">Why this fit?</div>
                  <div className="text-xs text-dark-200 leading-relaxed italic">"{application.aiJobFitReasoning}"</div>
                </div>
              )}

              {/* AI insights card — reuse the existing component */}
              {candidate && (
                <AiResumeInsights candidate={candidate} application={application || undefined} />
              )}

              {/* Recent applications list (candidate preview only).
                  The candidate-detail endpoint returns enriched docs with
                  applicationStatus + jobName + stageName + aiJobFitScore,
                  so we surface all of those. Clicking a row closes the
                  drawer FIRST (otherwise the chatbot keeps blocking) then
                  navigates. */}
              {item.kind === 'candidate' && Array.isArray(data?.applications) && data.applications.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Applications ({data.applications.length})</div>
                  <ul className="space-y-1.5">
                    {data.applications.slice(0, 10).map((a) => {
                      const lifecycle = a.hireDate ? 'Hired' : a.refused ? 'Refused' : a.archived ? 'Archived' : (a.applicationStatus || 'Ongoing');
                      const lifecycleTone =
                        lifecycle === 'Hired' ? 'text-emerald-300'
                        : lifecycle === 'Refused' ? 'text-rose-300'
                        : lifecycle === 'Archived' ? 'text-dark-500'
                        : 'text-rivvra-300';
                      return (
                        <li key={a._id}>
                          <button
                            type="button"
                            onClick={() => {
                              const url = `/org/${orgSlug}/ats/applications/${a._id}`;
                              onClose();
                              setTimeout(() => navigate(url), 50);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-md bg-dark-800/40 hover:bg-dark-800 border border-dark-700/60 hover:border-rivvra-500/40 transition-colors group"
                          >
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-sm text-white font-medium truncate">{a.jobName || 'Untitled job'}</span>
                              {typeof a.aiJobFitScore === 'number' && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                  a.aiJobFitScore >= 80 ? 'bg-emerald-500/15 text-emerald-300'
                                  : a.aiJobFitScore >= 60 ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-rose-500/15 text-rose-300'
                                }`}>Fit {Math.round(a.aiJobFitScore)}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className={lifecycleTone}>{lifecycle}</span>
                              {a.stageName && <span className="text-dark-500">· {a.stageName}</span>}
                              <span className="ml-auto text-dark-500 group-hover:text-rivvra-300">→</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
