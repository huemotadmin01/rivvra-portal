// ============================================================================
// AlumniDirectory.jsx — Admin view of all alumni/archived memberships
// ============================================================================
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import alumniApi from '../../utils/alumniApi';
import { Users, RotateCcw, XCircle, AlertCircle, Shield, Clock } from 'lucide-react';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function phaseBadge(row) {
  if (row.status === 'archived') {
    return <span className="px-2 py-0.5 rounded text-[11px] bg-red-500/15 text-red-400 border border-red-500/30">Archived</span>;
  }
  if (row.phase === 'a') {
    return <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/30">Phase A</span>;
  }
  if (row.phase === 'b') {
    return <span className="px-2 py-0.5 rounded text-[11px] bg-orange-500/15 text-orange-400 border border-orange-500/30">Phase B (Tax)</span>;
  }
  if (row.phase === 'archived') {
    return <span className="px-2 py-0.5 rounded text-[11px] bg-red-500/15 text-red-400 border border-red-500/30">Pending archive</span>;
  }
  return <span className="px-2 py-0.5 rounded text-[11px] bg-dark-700/50 text-dark-300">Unknown</span>;
}

export default function AlumniDirectory() {
  const { orgSlug } = usePlatform();
  const { isOrgAdmin, currentOrg } = useOrg();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [busyUserId, setBusyUserId] = useState(null);

  const load = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      setError(null);
      const res = await alumniApi.list(orgSlug);
      setRows(res?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load alumni directory');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (isOrgAdmin) load();
  }, [isOrgAdmin, load]);

  const reactivate = async (row) => {
    if (!confirm(`Reactivate ${row.fullName} for 7 days?`)) return;
    try {
      setBusyUserId(row.userId);
      await alumniApi.reactivate(orgSlug, row.userId);
      showToast('Alumnus reactivated', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to reactivate', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const revoke = async (row) => {
    if (!confirm(`Revoke access for ${row.fullName} immediately? They will be archived.`)) return;
    try {
      setBusyUserId(row.userId);
      await alumniApi.revoke(orgSlug, row.userId);
      showToast('Access revoked', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to revoke', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  if (!isOrgAdmin) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> Admin access required
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-rivvra-400" />
          <h1 className="text-xl font-bold text-white">Alumni Directory</h1>
        </div>
        <Link
          to={`/org/${orgSlug}/settings/alumni-policy`}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded text-xs text-dark-300"
        >
          <Shield className="w-3.5 h-3.5" /> Policy
        </Link>
      </div>

      <p className="text-sm text-dark-400">
        Former employees of {currentOrg?.name || 'your organization'} with active read-only access.
        Alumni don't count against your billing seats.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-dark-500">Loading alumni...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 border border-dark-700 bg-dark-900/40 rounded-md text-center text-sm text-dark-500">
          No alumni yet. Separated employees will appear here during their read-only access window.
        </div>
      ) : (
        <div className="border border-dark-700 rounded-md overflow-hidden bg-dark-900/40">
          <table className="w-full text-sm">
            <thead className="bg-dark-900 border-b border-dark-700">
              <tr className="text-left text-[11px] uppercase tracking-wider text-dark-500">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phase</th>
                <th className="px-3 py-2">LWD</th>
                <th className="px-3 py-2">Cutoff</th>
                <th className="px-3 py-2">Days left</th>
                <th className="px-3 py-2">Personal email</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {rows.map((row) => {
                const busy = busyUserId === row.userId;
                const isArchived = row.status === 'archived';
                return (
                  <tr key={row.userId} className="hover:bg-dark-800/30">
                    <td className="px-3 py-2">
                      <div className="text-white">{row.fullName}</div>
                      <div className="text-[11px] text-dark-500">{row.email}</div>
                    </td>
                    <td className="px-3 py-2">{phaseBadge(row)}</td>
                    <td className="px-3 py-2 text-dark-300">{fmtDate(row.lastWorkingDate)}</td>
                    <td className="px-3 py-2 text-dark-300">{fmtDate(row.alumniCutoffAt)}</td>
                    <td className="px-3 py-2 text-dark-300">
                      {row.daysRemaining !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {row.daysRemaining}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row.privateEmailOnFile ? (
                        <span className="text-emerald-400 text-[11px]">On file</span>
                      ) : (
                        <span className="text-amber-400 text-[11px]">Missing</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        onClick={() => reactivate(row)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded text-[11px] text-amber-300 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reactivate 7d
                      </button>
                      {!isArchived && (
                        <button
                          onClick={() => revoke(row)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 rounded text-[11px] text-red-300 disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
