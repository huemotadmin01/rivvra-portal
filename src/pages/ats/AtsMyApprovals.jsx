import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Clock, XCircle, Briefcase } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
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
  const { orgPath } = usePlatform();
  const orgSlug = currentOrg?.slug;

  // Tabs: pending is the day-to-day inbox, decided keeps a record of
  // what the user has approved or rejected so they can recall context.
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLists = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const [pRes, aRes, rRes] = await Promise.all([
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'pending', limit: 100 }),
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'approved', limit: 50, sort: 'updatedAt', dir: 'desc' }),
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'rejected', limit: 50, sort: 'updatedAt', dir: 'desc' }),
      ]);
      setPending(pRes?.jobs || pRes?.data || []);
      const a = aRes?.jobs || aRes?.data || [];
      const r = rRes?.jobs || rRes?.data || [];
      // Merge approved + rejected, newest first by updatedAt.
      const merged = [...a, ...r].sort((x, y) => new Date(y.updatedAt || 0) - new Date(x.updatedAt || 0));
      setDecided(merged);
    } catch (err) {
      console.error('Failed to load My Approvals:', err);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

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
        </div>
      )}
    </div>
  );
}
