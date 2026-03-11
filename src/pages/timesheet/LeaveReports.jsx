import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { getLeaveReportSummary, getLeaveReportUtilization, exportLeaveReport } from '../../utils/timesheetApi';
import { PageSkeleton } from '../../components/Skeletons';
import { BarChart3, Download, Loader2, Users, TrendingUp, AlertTriangle } from 'lucide-react';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const leaveTypeLabels = {
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  comp_off: 'Comp Off',
  lop: 'LOP',
};

const leaveTypeColors = {
  sick_leave: 'text-red-400',
  casual_leave: 'text-blue-400',
  comp_off: 'text-purple-400',
  lop: 'text-orange-400',
};

export default function LeaveReports() {
  const { showToast } = useToast();
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [utilizationData, setUtilizationData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fy, setFy] = useState(`${currentFYStart}-${currentFYStart + 1}`);
  const [utilYear, setUtilYear] = useState(now.getFullYear());

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await getLeaveReportSummary({ financialYear: fy });
      setSummaryData(res);
    } catch {
      showToast('Failed to load summary', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUtilization = async () => {
    setLoading(true);
    try {
      const res = await getLeaveReportUtilization({ year: utilYear });
      setUtilizationData(res);
    } catch {
      showToast('Failed to load utilization', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'summary') loadSummary();
    else loadUtilization();
  }, [tab, fy, utilYear]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportLeaveReport({ financialYear: fy });
      // Create download from blob
      const blob = res.data || res;
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `leave-report-${fy}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Report exported', 'success');
    } catch {
      showToast('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { id: 'summary', label: 'Balance Summary', icon: Users },
    { id: 'utilization', label: 'Utilization Trends', icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Leave Reports</h1>
          <p className="text-dark-400 text-sm mt-1">Analyze leave balances and utilization across your organization.</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-sm hover:text-white flex items-center gap-1.5 disabled:opacity-50 self-start">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${tab === t.id ? 'bg-rivvra-500 text-white' : 'bg-dark-800 border border-dark-700 text-dark-400 hover:text-white'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? <PageSkeleton /> : tab === 'summary' ? (
        /* ── Balance Summary ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-dark-400 text-sm">Financial Year:</label>
            <select value={fy} onChange={e => setFy(e.target.value)}
              className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500">
              {Array.from({ length: 5 }, (_, i) => {
                const y = currentFYStart - 2 + i;
                return <option key={y} value={`${y}-${y + 1}`}>{y}-{y + 1}</option>;
              })}
            </select>
          </div>

          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <p className="text-dark-400 text-xs">Total Employees</p>
              <p className="text-white text-2xl font-bold mt-1">{summaryData?.summary?.length || 0}</p>
            </div>
            {Object.entries(
              (summaryData?.summary || []).reduce((acc, s) => {
                Object.entries(s.balances || {}).forEach(([type, bal]) => {
                  if (!acc[type]) acc[type] = { used: 0, available: 0 };
                  acc[type].used += bal.used || 0;
                  acc[type].available += bal.available || 0;
                });
                return acc;
              }, {})
            ).slice(0, 3).map(([type, agg]) => (
              <div key={type} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                <p className={`text-xs ${leaveTypeColors[type] || 'text-dark-400'}`}>{leaveTypeLabels[type] || type}</p>
                <p className="text-white text-2xl font-bold mt-1">{agg.used}</p>
                <p className="text-dark-500 text-xs">days used</p>
              </div>
            ))}
          </div>

          {/* Employee table */}
          <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left text-dark-400 font-medium px-4 py-3">Employee</th>
                    <th className="text-left text-dark-400 font-medium px-4 py-3">Type</th>
                    {['sick_leave', 'casual_leave', 'comp_off'].map(type => (
                      <th key={type} className="text-center text-dark-400 font-medium px-2 py-3" colSpan={2}>
                        {leaveTypeLabels[type]}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-dark-700/50 text-[10px] text-dark-500">
                    <th></th><th></th>
                    {['sick_leave', 'casual_leave', 'comp_off'].map(type => (
                      <><th key={`${type}-u`} className="px-2 py-1 text-center">Used</th><th key={`${type}-a`} className="px-2 py-1 text-center">Avail</th></>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(summaryData?.summary || []).map((row, i) => (
                    <tr key={i} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                      <td className="px-4 py-2.5">
                        <p className="text-white text-sm">{row.employeeName}</p>
                        <p className="text-dark-500 text-xs">{row.employeeCode}</p>
                      </td>
                      <td className="px-4 py-2.5 text-dark-400 text-xs">{row.employmentType}</td>
                      {['sick_leave', 'casual_leave', 'comp_off'].map(type => {
                        const bal = row.balances?.[type];
                        return (
                          <>
                            <td key={`${type}-u`} className="px-2 py-2.5 text-center text-dark-300">{bal?.used ?? '-'}</td>
                            <td key={`${type}-a`} className={`px-2 py-2.5 text-center font-medium ${(bal?.available || 0) <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {bal?.available ?? '-'}
                            </td>
                          </>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(!summaryData?.summary?.length) && (
              <div className="py-8 text-center text-dark-500 text-sm">No leave data found for this financial year.</div>
            )}
          </div>
        </div>
      ) : (
        /* ── Utilization Trends ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-dark-400 text-sm">Year:</label>
            <select value={utilYear} onChange={e => setUtilYear(parseInt(e.target.value))}
              className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500">
              {Array.from({ length: 3 }, (_, i) => {
                const y = now.getFullYear() - 1 + i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <p className="text-dark-400 text-xs">Total Requests</p>
              <p className="text-white text-2xl font-bold mt-1">{utilizationData?.totalRequests || 0}</p>
            </div>
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <p className="text-dark-400 text-xs">Total Days</p>
              <p className="text-white text-2xl font-bold mt-1">{utilizationData?.totalDays || 0}</p>
            </div>
            {Object.entries(utilizationData?.byType || {}).slice(0, 2).map(([type, days]) => (
              <div key={type} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                <p className={`text-xs ${leaveTypeColors[type] || 'text-dark-400'}`}>{leaveTypeLabels[type] || type}</p>
                <p className="text-white text-2xl font-bold mt-1">{days}</p>
                <p className="text-dark-500 text-xs">days</p>
              </div>
            ))}
          </div>

          {/* Monthly bar chart (text-based) */}
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <h3 className="text-white font-medium text-sm mb-4">Monthly Leave Distribution</h3>
            <div className="space-y-2">
              {(utilizationData?.monthly || []).map(m => {
                const maxDays = Math.max(...(utilizationData?.monthly || []).map(x => x.totalDays), 1);
                const pct = (m.totalDays / maxDays) * 100;
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-dark-400 text-xs w-8 shrink-0">{monthNames[m.month - 1]}</span>
                    <div className="flex-1 bg-dark-700 rounded-full h-5 overflow-hidden">
                      <div className="bg-rivvra-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, m.totalDays > 0 ? 8 : 0)}%` }}>
                        {m.totalDays > 0 && <span className="text-[10px] text-white font-medium">{m.totalDays}d</span>}
                      </div>
                    </div>
                    <span className="text-dark-500 text-xs w-12 text-right">{m.count} req</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Type breakdown */}
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <h3 className="text-white font-medium text-sm mb-3">By Leave Type</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(utilizationData?.byType || {}).map(([type, days]) => (
                <div key={type} className="text-center">
                  <p className={`text-lg font-bold ${leaveTypeColors[type] || 'text-white'}`}>{days}</p>
                  <p className="text-dark-400 text-xs">{leaveTypeLabels[type] || type}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
