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
 *   type        'crm' | 'ats'
 *   currency    ISO currency code for CRM money formatting (optional, defaults INR)
 *   dateFrom    ISO string — start of the dashboard range window (optional)
 *   dateTo      ISO string — end of the dashboard range window (optional)
 *   rangeLabel  Human label for the active range (e.g. "Last 30 days"). Used to
 *               render the column header dynamically — e.g. "Won in Last 30 days"
 *               instead of the legacy hardcoded "Won this month".
 *
 * 2026-05-18: range support added. Without dateFrom/dateTo the widget falls
 * back to month-to-date (server default) and shows "this month" labels so
 * the legacy behaviour is preserved for any caller that hasn't been
 * upgraded.
 */
export default function MyTeamWidget({ type, currency = 'INR', dateFrom, dateTo, rangeLabel }) {
  const { currentOrg } = useOrg();
  const orgSlug = currentOrg?.slug;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    // Initial load uses the spinner state; subsequent range changes use
    // refreshing so the table stays visible during the refetch.
    if (members.length > 0) setRefreshing(true);
    else setLoading(true);
    const params = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
    const fetcher = type === 'ats'
      ? api.getAtsMyTeam(orgSlug, params)
      : api.getCrmMyTeam(orgSlug, params);
    fetcher
      .then((res) => {
        if (cancelled) return;
        if (res?.success) setMembers(res.members || []);
        else setMembers([]);
      })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, type, dateFrom, dateTo]);

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
  // 2026-05-18: dynamic range-aware column header. Falls back to legacy
  // "this month" when no rangeLabel is passed in.
  const rangeColLabel = rangeLabel
    ? (type === 'ats' ? `Hired in ${rangeLabel}` : `Won in ${rangeLabel}`)
    : (type === 'ats' ? 'Hired this month' : 'Won this month');

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-dark-400" />
        <h2 className="text-sm font-semibold text-dark-100 uppercase tracking-wider">{headerLabel}</h2>
        {refreshing && <Loader2 size={12} className="text-dark-500 animate-spin" />}
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
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">{rangeColLabel}</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Conversion</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Active candidates</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Interviews this week</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">{rangeColLabel}</th>
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
