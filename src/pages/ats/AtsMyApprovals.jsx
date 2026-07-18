import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Clock, XCircle, Briefcase, AlertTriangle } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { usePageTitle } from '../../hooks/usePageTitle';
import atsApi from '../../utils/atsApi';

/* ── Approval pill (matches AtsJobDetail's ApprovalIndicator palette) ── */
function ApprovalPill({ status }) {
  const map = {
    approved: { Icon: CheckCircle2, color: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30', label: 'Approved' },
    pending:  { Icon: Clock,        color: 'text-amber-300 bg-amber-500/10 ring-amber-500/30',     label: 'Pending'  },
    rejected: { Icon: XCircle,      color: 'text-red-300 bg-red-500/10 ring-red-500/30',           label: 'Rejected' },
  };
  const m = map[(status || '').toLowerCase()] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ring-1 ${m.color}`}>
      <m.Icon size={11} /> {m.label}
    </span>
  );
}

/* ── Hours-since helper (mirrors AtsDashboard alert card) ─────────────── */
function hoursSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const h = Math.floor(ms / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AtsMyApprovals() {
  usePageTitle('My Approvals');
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const orgSlug = currentOrg?.slug;

  // Tabs: pending is the day-to-day inbox, decided keeps a record of
  // what the user has approved or rejected so they can recall context.
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [loading, setLoading] = useState(true);
  // F-P2-9: track first-load separately so refetches (e.g. showFull toggle)
  // don't blank-flash the displayed rows. Initial load still shows the
  // skeleton; subsequent refetches keep the prior list visible.
  // 2026-05-17 health-check H.3: surface truncation when the API totals
  // exceed what we pulled in the first page. Previously a org with >50
  // approved jobs silently lost rows past the limit; recruiters had no
  // way to see them. Now we show "showing N of M" + a quick toggle to
  // pull the full list (limit raised to 500).
  const [pendingTotal, setPendingTotal] = useState(0);
  const [decidedTotal, setDecidedTotal] = useState(0);
  const [showFull, setShowFull] = useState(false);
  // 2026-07-18 audit D2: surface fetch failures instead of a false
  // "Nothing waiting on you" empty state.
  const [error, setError] = useState(null);
  // 2026-07-18 audit D15: track background refetches (showFull toggle,
  // company switch) separately from the first load so the truncation
  // footer knows when "Show all" finished — beyond 500 rows the button
  // previously stuck at "Loading…" forever.
  const [refetching, setRefetching] = useState(false);

  // `hasLoaded` is read via ref, NOT a dep — with it in the deps, the first
  // fetch's setHasLoaded(true) recreated this callback and the effect below
  // re-fired a full second round of the 3 requests on every mount.
  const hasLoadedRef = useRef(false);
  const fetchLists = useCallback(async () => {
    if (!orgSlug) return;
    if (!hasLoadedRef.current) setLoading(true); else setRefetching(true);
    setError(null);
    try {
      const cap = showFull ? 500 : 100;
      const [pRes, aRes, rRes] = await Promise.all([
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'pending', limit: cap }),
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'approved', limit: cap, sort: 'updatedAt', dir: 'desc' }),
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'rejected', limit: cap, sort: 'updatedAt', dir: 'desc' }),
      ]);
      setPending(pRes?.jobs || pRes?.data || []);
      setPendingTotal(pRes?.total ?? (pRes?.jobs || pRes?.data || []).length);
      const a = aRes?.jobs || aRes?.data || [];
      const r = rRes?.jobs || rRes?.data || [];
      const merged = [...a, ...r].sort((x, y) => new Date(y.updatedAt || 0) - new Date(x.updatedAt || 0));
      setDecided(merged);
      setDecidedTotal((aRes?.total ?? a.length) + (rRes?.total ?? r.length));
    } catch (err) {
      console.error('Failed to load My Approvals:', err);
      // D2: keep any previously loaded rows off-screen replacement — show
      // an explicit error + Retry instead of the empty state.
      setError(err?.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
      setRefetching(false);
      hasLoadedRef.current = true;
    }
    // D3: currentCompany?._id is a dep so a company switch refetches —
    // approvals are company-scoped server-side via the session company.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, showFull, currentCompany?._id]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const rows = tab === 'pending' ? pending : decided;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Approvals</h1>
        <p className="text-sm text-dark-400 mt-1">
          Job positions assigned to you for approval. Recruiters cannot add applications until you approve.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-dark-700">
        {[
          { key: 'pending', label: 'Pending', count: pending.length },
          { key: 'decided', label: 'Decided', count: decided.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-rivvra-500 text-white'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-dark-500">({t.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
        </div>
      ) : error ? (
        /* 2026-07-18 audit D2: fetch failure previously fell through to the
           "Nothing waiting on you" empty state. Show the error + Retry. */
        <div className="card p-10 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">Couldn't load your approvals</h3>
          <p className="text-sm text-dark-400 max-w-md mb-4">{error}</p>
          <button
            type="button"
            onClick={() => fetchLists()}
            className="px-4 py-2 rounded-lg bg-rivvra-500/10 text-rivvra-300 ring-1 ring-rivvra-500/30 text-sm font-medium hover:bg-rivvra-500/20 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-10 flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="w-10 h-10 text-dark-600 mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">
            {tab === 'pending' ? 'Nothing waiting on you' : 'No decisions yet'}
          </h3>
          <p className="text-sm text-dark-400 max-w-md">
            {tab === 'pending'
              ? 'When a recruiter assigns you as the approver on a job position, it will show up here.'
              : 'Positions you approve or reject will appear here for your reference.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-900/40">
                  <th className="text-left px-4 py-3 text-dark-400 font-medium">Position</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">
                    {tab === 'pending' ? 'Waiting' : 'Decided'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j._id} className="border-b border-dark-800 last:border-0 hover:bg-dark-800/40">
                    <td className="px-4 py-3">
                      <Link
                        to={orgPath(`/ats/jobs/${j._id}`)}
                        className="flex items-center gap-2 text-rivvra-300 hover:text-rivvra-200 hover:underline"
                      >
                        <Briefcase size={13} className="text-dark-500 flex-shrink-0" />
                        <span className="truncate">{j.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-dark-300 hidden md:table-cell">{j.department || '—'}</td>
                    <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">{j.recruiterName || '—'}</td>
                    <td className="px-4 py-3"><ApprovalPill status={j.approvalStatus} /></td>
                    <td className="px-4 py-3 text-dark-400 hidden md:table-cell">
                      {hoursSince(tab === 'pending' ? j.createdAt : j.updatedAt) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 2026-05-17 health-check H.3: truncation footer. Show "N of M"
              + a Show all toggle if the API total exceeds the loaded rows. */}
          {(() => {
            const total = tab === 'pending' ? pendingTotal : decidedTotal;
            const shown = rows.length;
            if (total <= shown) return null;
            return (
              <div className="flex items-center justify-between px-4 py-2 text-[11px] text-dark-400 border-t border-dark-800 bg-dark-900/40">
                <span>Showing first {shown} of {total}.</span>
                {/* 2026-07-18 audit D15: once the full-cap fetch has
                    completed (showFull && !refetching) there is nothing
                    more to load — beyond 500 rows the button used to
                    stick at "Loading…" forever. Show a static note. */}
                {showFull && !refetching ? (
                  <span className="text-dark-500">Showing the maximum of {shown} rows</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowFull(true)}
                    disabled={showFull}
                    className="text-rivvra-400 hover:text-rivvra-300 disabled:opacity-40"
                  >
                    {showFull ? 'Loading…' : 'Show all'}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
