import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import {
  BarChart3, Trophy, XCircle, Briefcase, IndianRupee,
  Loader2, TrendingUp, Users, ArrowRight,
} from 'lucide-react';

export default function CrmReporting() {
  const { orgSlug: slug } = useOrg();
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    crmApi.getDashboard(slug).then(res => {
      if (res.success) setData(res);
    }).catch(() => addToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }
  if (!data) return null;

  const winRate = data.total > 0 ? ((data.won / data.total) * 100).toFixed(1) : 0;
  const lossRate = data.total > 0 ? ((data.lost / data.total) * 100).toFixed(1) : 0;
  const conversionRate = data.total > 0 ? ((data.converted / data.total) * 100).toFixed(1) : 0;
  const totalRevenue = (data.byStage || []).reduce((sum, s) => sum + (s.revenue || 0), 0);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 size={18} className="text-dark-400" />
        <h1 className="text-lg font-semibold text-dark-100">CRM Reporting</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <p className="text-[10px] text-dark-500 uppercase">Total</p>
          <p className="text-xl font-bold text-dark-100">{data.total}</p>
        </div>
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
          <p className="text-xl font-bold text-dark-100">₹{totalRevenue.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Pipeline Breakdown */}
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
                    <td className="px-3 py-2.5 text-xs text-emerald-400 text-right">₹{(s.revenue || 0).toLocaleString('en-IN')}</td>
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

      {/* Salesperson Performance */}
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
  );
}
