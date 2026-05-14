import { useState, useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import api from '../../utils/api';
import { useOrg } from '../../context/OrgContext';

/**
 * MyTeamWidget — compact per-member performance card shown on CRM/ATS dashboards.
 *
 * Renders only when the caller is a team lead (backend returns empty members[]
 * for admins and regular members; the widget hides itself in those cases).
 *
 * Props:
 *   type      'crm' | 'ats'
 *   currency  ISO currency code for CRM money formatting (optional, defaults INR)
 */
export default function MyTeamWidget({ type, currency = 'INR' }) {
  const { currentOrg } = useOrg();
  const orgSlug = currentOrg?.slug;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    setLoading(true);
    const fetcher = type === 'ats' ? api.getAtsMyTeam(orgSlug) : api.getCrmMyTeam(orgSlug);
    fetcher
      .then((res) => {
        if (cancelled) return;
        if (res?.success) setMembers(res.members || []);
        else setMembers([]);
      })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug, type]);

  // Lead-only — admins and members get empty members[] from the backend.
  if (!loading && members.length === 0) return null;

  const moneyFmt = (n) => {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency, maximumFractionDigits: 0,
      }).format(n || 0);
    } catch {
      return `${currency} ${Math.round(n || 0).toLocaleString('en-IN')}`;
    }
  };

  const headerLabel = type === 'ats' ? 'My Recruitment Team' : 'My Sales Team';

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-dark-400" />
        <h2 className="text-sm font-semibold text-dark-100 uppercase tracking-wider">{headerLabel}</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-dark-400 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Member</th>
                {type === 'crm' ? (
                  <>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Open Pipeline</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Won this month</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Conversion</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Active candidates</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Interviews this week</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Hired this month</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.employeeId} className="border-b border-dark-700/50">
                  <td className="px-3 py-2.5 text-sm text-dark-100">{m.name || 'Unknown'}</td>
                  {type === 'crm' ? (
                    <>
                      <td className="px-3 py-2.5 text-xs text-dark-200 text-right tabular-nums">{moneyFmt(m.openPipelineValue)}</td>
                      <td className="px-3 py-2.5 text-xs text-dark-200 text-right tabular-nums">{m.wonThisMonth || 0}</td>
                      <td className="px-3 py-2.5 text-xs text-dark-200 text-right tabular-nums">
                        {m.conversionPct == null ? <span className="text-dark-500">—</span> : `${m.conversionPct}%`}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-xs text-dark-200 text-right tabular-nums">{m.activeCandidates || 0}</td>
                      <td className="px-3 py-2.5 text-xs text-dark-200 text-right tabular-nums">{m.interviewsThisWeek || 0}</td>
                      <td className="px-3 py-2.5 text-xs text-dark-200 text-right tabular-nums">{m.hiredThisMonth || 0}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
