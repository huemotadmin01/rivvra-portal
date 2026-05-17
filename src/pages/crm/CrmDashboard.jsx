import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { formatMoney } from '../../utils/currency';
import {
  Briefcase, Trophy, XCircle, ArrowRight,
  Clock, Loader2, Calendar, BarChart3,
} from 'lucide-react';
import MyTeamWidget from '../../components/shared/MyTeamWidget';

function KPICard({ label, value, icon: Icon, color = 'dark', subtitle, to }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dark: 'bg-dark-800 text-dark-200 border-dark-700',
  };
  // 2026-05-17 CRM-C: KPI tiles now optionally render as a Link so the
  // dashboard becomes the primary navigation hub into the filtered list.
  const inner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs opacity-70">{label}</span>
        <Icon size={16} className="opacity-50" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-[10px] opacity-60 mt-0.5">{subtitle}</p>}
    </>
  );
  const cls = `block rounded-xl border p-4 transition-colors ${colorMap[color]} ${to ? 'hover:brightness-110' : ''}`;
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// 2026-05-17 CRM-B: per-currency revenue renderer. Multi-company tenants
// (Huemot India + Inc + PSA + Canada) have mixed-currency pipelines;
// rendering a single number with one symbol was misleading. Show one
// line per currency. Empty list → em-dash.
function RevenueByCurrency({ rows, className = '' }) {
  const nonZero = (rows || []).filter(r => (r.total || 0) > 0);
  if (nonZero.length === 0) return <span className={`text-[10px] text-dark-600 ${className}`}>—</span>;
  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      {nonZero.map((r, i) => (
        <span key={`${r.currency}-${i}`} className="text-[10px] text-dark-500 whitespace-nowrap" title={r.currency === '(unspecified)' ? 'No currency on record' : r.currency}>
          {r.currency === '(unspecified)' ? formatMoney(r.total, 'INR').replace(/^₹/, '~') : formatMoney(r.total, r.currency)}
        </span>
      ))}
    </div>
  );
}

function PipelineBar({ data }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.stageId} className="flex items-center gap-3">
          <span className="text-xs text-dark-400 w-28 text-right truncate">{d.stageName}</span>
          <div className="flex-1 bg-dark-800 rounded-full h-5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rivvra-500 to-emerald-500 rounded-full flex items-center justify-end px-2 transition-all duration-500"
              style={{ width: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 8 : 0)}%` }}
            >
              {d.count > 0 && <span className="text-[10px] text-white font-medium">{d.count}</span>}
            </div>
          </div>
          <RevenueByCurrency rows={d.revenueByCurrency} className="w-24" />
        </div>
      ))}
    </div>
  );
}

export default function CrmDashboard() {
  const { orgSlug: slug, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { addToast } = useToast();
  const currency = currentCompany?.currency || 'INR';
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 2026-05-14: CRM Reporting page merged into Dashboard. The analytical
  // section (win/loss/conversion rates, salesperson performance) renders
  // only for admin or team-lead — same gate the old Reporting route had.
  // The per-app role check is the canonical source; the user.role global
  // fallback the merge initially included was inconsistent with how other
  // pages compute this and could over-grant across tenants.
  const crmRole = getAppRole('crm');
  const isAdminOrLead = crmRole === 'admin' || crmRole === 'team_lead';

  useEffect(() => {
    setLoading(true);
    crmApi.getDashboard(slug).then(res => {
      if (res.success) setData(res);
    }).catch(() => addToast('Failed to load dashboard', 'error'))
      .finally(() => setLoading(false));
    // currentCompany?._id is included so a company switch refreshes
    // the dashboard — backend filters by req.companyId server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentCompany?._id]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }

  if (!data) return null;

  // Derived analytics — only rendered inside the admin/lead gate, but
  // computed unconditionally because they're cheap and the gate is on
  // the JSX, not the data.
  const winRate = data.total > 0 ? ((data.won / data.total) * 100).toFixed(1) : 0;
  const lossRate = data.total > 0 ? ((data.lost / data.total) * 100).toFixed(1) : 0;
  const conversionRate = data.total > 0 ? ((data.converted / data.total) * 100).toFixed(1) : 0;
  // 2026-05-17 CRM-B: per-currency aggregation. The legacy totalRevenue
  // collapsed every currency into one scalar. Build a single
  // currency → total map from every stage's revenueByCurrency rows.
  const totalRevenueByCurrency = (() => {
    const acc = new Map();
    for (const s of data.byStage || []) {
      for (const r of s.revenueByCurrency || []) {
        if (!r.currency) continue;
        acc.set(r.currency, (acc.get(r.currency) || 0) + (r.total || 0));
      }
    }
    return Array.from(acc, ([currency, total]) => ({ currency, total }));
  })();

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-lg font-semibold text-dark-100">CRM Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 2026-05-17 CRM-C: KPI tiles deep-link into the matching
            filtered Opportunities list. The status filter is hosted on
            opportunities.jsx via filterParams; verify allow-list
            includes `status` (it does — opps list reads status via
            useSearchParams). */}
        <KPICard label="Total Opportunities" value={data.total} icon={Briefcase} color="dark"
          to={`/org/${slug}/crm/opportunities`} />
        <KPICard label="Active" value={data.active} icon={Clock} color="blue"
          to={`/org/${slug}/crm/opportunities?status=active`} />
        <KPICard label="Won" value={data.won} icon={Trophy} color="amber"
          to={`/org/${slug}/crm/opportunities?status=won`} />
        <KPICard label="Lost" value={data.lost} icon={XCircle} color="red"
          to={`/org/${slug}/crm/opportunities?status=lost`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline Funnel */}
        <div className="lg:col-span-2 bg-dark-850 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-dark-200">Pipeline Overview</h3>
            <button onClick={() => navigate(`/org/${slug}/crm/pipeline`)} className="text-xs text-rivvra-400 hover:text-rivvra-300 flex items-center gap-1">
              View Pipeline <ArrowRight size={12} />
            </button>
          </div>
          <PipelineBar data={data.byStage || []} />
        </div>

        {/* By Salesperson */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-dark-200 mb-3">By Salesperson</h3>
          <div className="space-y-2">
            {(data.bySalesperson || []).map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center text-[10px] text-dark-400">
                    {(s.name || 'U')[0]}
                  </div>
                  <span className="text-xs text-dark-300">{s.name}</span>
                </div>
                <span className="text-xs text-dark-400 bg-dark-800 rounded-full px-2 py-0.5">{s.count}</span>
              </div>
            ))}
            {(!data.bySalesperson || data.bySalesperson.length === 0) && (
              <p className="text-xs text-dark-600 text-center py-4">No data yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Opportunities */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-dark-200 mb-3">Recent Opportunities</h3>
          <div className="space-y-2">
            {(data.recentOpportunities || []).map(opp => (
              <div
                key={opp._id}
                onClick={() => navigate(`/org/${slug}/crm/opportunities/${opp._id}`)}
                className="flex items-center justify-between px-3 py-2 bg-dark-800/50 rounded-lg cursor-pointer hover:bg-dark-800 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs text-dark-200 font-medium truncate">{opp.name}</p>
                  <p className="text-[10px] text-dark-500">{opp.companyName || 'No company'} · {opp.stageName}</p>
                </div>
                {opp.expectedRevenue && (
                  <span className="text-[10px] text-emerald-400 flex-shrink-0">{formatMoney(opp.expectedRevenue, opp.currency || currency)}</span>
                )}
              </div>
            ))}
            {(!data.recentOpportunities || data.recentOpportunities.length === 0) && (
              <p className="text-xs text-dark-600 text-center py-4">No opportunities yet</p>
            )}
          </div>
        </div>

        {/* Upcoming Activities */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-dark-200 mb-3">Upcoming Activities</h3>
          <div className="space-y-2">
            {(data.upcomingActivities || []).map(a => (
              <div key={a._id} className="flex items-center gap-3 px-3 py-2 bg-dark-800/50 rounded-lg">
                <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] flex-shrink-0 ${
                  a.type === 'call' ? 'bg-blue-500/10 text-blue-400' :
                  a.type === 'meeting' ? 'bg-purple-500/10 text-purple-400' :
                  a.type === 'email' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-dark-700 text-dark-400'
                }`}>
                  {a.type?.[0]?.toUpperCase() || '•'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-dark-200 truncate">{a.summary || a.note || 'Activity'}</p>
                  <p className="text-[10px] text-dark-500 flex items-center gap-1">
                    <Calendar size={9} /> {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'No date'}
                  </p>
                </div>
              </div>
            ))}
            {(!data.upcomingActivities || data.upcomingActivities.length === 0) && (
              <p className="text-xs text-dark-600 text-center py-4">No upcoming activities</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── My Sales Team (lead-only; hides itself for admins/members) ─── */}
      <MyTeamWidget type="crm" currency={data?.currency} />

      {/* ─── Team Performance (admin / team-lead only) ─────────────────────
          Merged 2026-05-14 from the old /crm/reporting page. Same data
          source (GET /crm/dashboard), same gate (admin || team_lead) the
          standalone route had — now inline so managers see metrics on the
          same Monday-morning page as everyone else's working view. */}
      {isAdminOrLead && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 border-t border-dark-700 pt-5">
            <BarChart3 size={16} className="text-dark-400" />
            <h2 className="text-sm font-semibold text-dark-100 uppercase tracking-wider">Team Performance</h2>
          </div>

          {/* Analytical KPIs — rates + pipeline value */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-dark-850 border border-amber-500/20 rounded-xl p-4">
              <p className="text-[10px] text-dark-500 uppercase">Win Rate</p>
              <p className="text-xl font-bold text-amber-400">{winRate}%</p>
              <p className="text-[10px] text-dark-500">{data.won} won</p>
            </div>
            <div className="bg-dark-850 border border-red-500/20 rounded-xl p-4">
              <p className="text-[10px] text-dark-500 uppercase">Loss Rate</p>
              <p className="text-xl font-bold text-red-400">{lossRate}%</p>
              <p className="text-[10px] text-dark-500">{data.lost} lost</p>
            </div>
            <div className="bg-dark-850 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-[10px] text-dark-500 uppercase">Conversion</p>
              <p className="text-xl font-bold text-emerald-400">{conversionRate}%</p>
              <p className="text-[10px] text-dark-500">{data.converted} converted</p>
            </div>
            <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
              <p className="text-[10px] text-dark-500 uppercase">Pipeline Value</p>
              {/* 2026-05-17 CRM-B: per-currency. Mixed pipelines used
                  to be summed with a single currency symbol that picked
                  the company default — INR even for opps in USD. */}
              {totalRevenueByCurrency.length === 0 ? (
                <p className="text-xl font-bold text-dark-500">—</p>
              ) : (
                <div className="space-y-0.5">
                  {totalRevenueByCurrency.map((r) => (
                    <p key={r.currency} className="text-xl font-bold text-dark-100" title={r.currency}>
                      {r.currency === '(unspecified)'
                        ? `~ ${formatMoney(r.total, 'INR').replace(/^₹/, '')}`
                        : formatMoney(r.total, r.currency)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Breakdown — distribution table */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-dark-200 mb-4">Pipeline Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Stage</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Opportunities</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Revenue</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-dark-400 uppercase">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.byStage || []).map(s => {
                    const pct = data.active > 0 ? ((s.count / data.active) * 100).toFixed(0) : 0;
                    return (
                      <tr key={s.stageId} className="border-b border-dark-700/50">
                        <td className="px-3 py-2.5 text-xs text-dark-200">{s.stageName}</td>
                        <td className="px-3 py-2.5 text-xs text-dark-300 text-right">{s.count}</td>
                        <td className="px-3 py-2.5 text-xs text-emerald-400 text-right">{formatMoney(s.revenue || 0, currency)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-dark-800 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-rivvra-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-dark-500 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Salesperson Performance — progress bars (richer than the
              count-badge list above; kept distinct because managers care
              about share-of-pipeline, not just absolute count). */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-dark-200 mb-4">Salesperson Performance</h3>
            {(data.bySalesperson || []).length > 0 ? (
              <div className="space-y-3">
                {data.bySalesperson.map((s, i) => {
                  const pct = data.active > 0 ? ((s.count / data.active) * 100).toFixed(0) : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center text-xs text-dark-400 flex-shrink-0">
                        {(s.name || 'U')[0]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-dark-200">{s.name}</span>
                          <span className="text-xs text-dark-400">{s.count} ({pct}%)</span>
                        </div>
                        <div className="bg-dark-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-rivvra-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-dark-600 text-center py-6">No data yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
