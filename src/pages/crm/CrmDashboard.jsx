import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import {
  Briefcase, Trophy, XCircle, ArrowRight, IndianRupee,
  Clock, Users, BarChart3, Loader2, Calendar, User,
} from 'lucide-react';

function KPICard({ label, value, icon: Icon, color = 'dark', subtitle }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dark: 'bg-dark-800 text-dark-200 border-dark-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs opacity-70">{label}</span>
        <Icon size={16} className="opacity-50" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-[10px] opacity-60 mt-0.5">{subtitle}</p>}
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
          <span className="text-[10px] text-dark-500 w-16">₹{(d.revenue || 0).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
}

export default function CrmDashboard() {
  const { orgSlug: slug } = useOrg();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    crmApi.getDashboard(slug).then(res => {
      if (res.success) setData(res);
    }).catch(() => addToast('Failed to load dashboard', 'error'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }

  if (!data) return null;

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-lg font-semibold text-dark-100">CRM Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Total Opportunities" value={data.total} icon={Briefcase} color="dark" />
        <KPICard label="Active" value={data.active} icon={Clock} color="blue" />
        <KPICard label="Won" value={data.won} icon={Trophy} color="amber" />
        <KPICard label="Lost" value={data.lost} icon={XCircle} color="red" />
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
                  <span className="text-[10px] text-emerald-400 flex-shrink-0">₹{Number(opp.expectedRevenue).toLocaleString('en-IN')}</span>
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
                  {a.type?.[0]?.toUpperCase()}
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
    </div>
  );
}
