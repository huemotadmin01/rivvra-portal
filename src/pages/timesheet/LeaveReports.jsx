import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { getLeaveReportSummary, getLeaveReportUtilization, exportLeaveReport } from '../../utils/timesheetApi';
import { PageSkeleton } from '../../components/Skeletons';
import { Download, Loader2, Users, TrendingUp, Search, ChevronLeft, ChevronRight } from 'lucide-react';

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

const ITEMS_PER_PAGE = 15;

export default function LeaveReports() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [utilizationData, setUtilizationData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fy, setFy] = useState(`${currentFYStart}-${currentFYStart + 1}`);
  const [utilYear, setUtilYear] = useState(now.getFullYear());

  const loadSummary = async () => {
    setLoading(true);
    setSummaryData(null);
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
    setUtilizationData(null);
    try {
      const res = await getLeaveReportUtilization({ year: utilYear });
      setUtilizationData(res);
    } catch {
      showToast('Failed to load utilization', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'summary') loadSummary();
    else loadUtilization();
  }, [tab, fy, utilYear, currentCompany?._id]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportLeaveReport({ financialYear: fy });
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

  // Client-side search + pagination for summary tab
  const filteredSummary = (summaryData?.summary || []).filter(row =>
    !search ||
    row.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
    row.employeeCode?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredSummary.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedSummary = filteredSummary.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // Aggregated stats from filtered data
  const filteredAgg = filteredSummary.reduce((acc, s) => {
    Object.entries(s.balances || {}).forEach(([type, bal]) => {
      if (!acc[type]) acc[type] = { used: 0, available: 0 };
      acc[type].used += bal.used || 0;
      acc[type].available += bal.available || 0;
    });
    return acc;
  }, {});

  const tabs = [
    { id: 'summary', label: 'Balance Summary', icon: Users },
    { id: 'utilization', label: 'Utilization Trends', icon: TrendingUp },
  ];

  // Pagination page numbers (max 5 visible)
  const pageNumbers = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else if (safePage <= 3) {
    for (let i = 1; i <= 5; i++) pageNumbers.push(i);
  } else if (safePage >= totalPages - 2) {
    for (let i = totalPages - 4; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    for (let i = safePage - 2; i <= safePage + 2; i++) pageNumbers.push(i);
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 min-w-0 overflow-hidden">
      {/* Header — centered, compact */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-white">Leave Reports</h1>
        <p className="text-dark-400 text-sm">Analyze leave balances and utilization across your organization.</p>
      </div>

      {/* Toolbar: FY/Year + Export on left, Tabs on right */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'summary' ? (
            <>
              <select value={fy} onChange={e => { setFy(e.target.value); setPage(1); }}
                className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500">
                {Array.from({ length: 5 }, (_, i) => {
                  const y = currentFYStart - 2 + i;
                  return <option key={y} value={`${y}-${y + 1}`}>FY {y}-{y + 1}</option>;
                })}
              </select>
              <button onClick={handleExport} disabled={exporting}
                className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-sm hover:text-white flex items-center gap-1.5 disabled:opacity-50 transition-colors">
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
              </button>
            </>
          ) : (
            <select value={utilYear} onChange={e => setUtilYear(parseInt(e.target.value))}
              className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500">
              {Array.from({ length: 3 }, (_, i) => {
                const y = now.getFullYear() - 1 + i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          )}
        </div>
        <div className="flex gap-1.5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${tab === t.id ? 'bg-rivvra-500 text-white' : 'bg-dark-800 border border-dark-700 text-dark-400 hover:text-white'}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <PageSkeleton /> : tab === 'summary' ? (
        /* ── Balance Summary ── */
        <div className="space-y-3">
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <p className="text-dark-400 text-xs">Total Employees</p>
              <p className="text-white text-2xl font-bold mt-1">{filteredSummary.length}</p>
            </div>
            {Object.entries(filteredAgg).slice(0, 3).map(([type, agg]) => (
              <div key={type} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                <p className={`text-xs ${leaveTypeColors[type] || 'text-dark-400'}`}>{leaveTypeLabels[type] || type}</p>
                <p className="text-white text-2xl font-bold mt-1">{agg.used}</p>
                <p className="text-dark-500 text-xs">days used</p>
              </div>
            ))}
          </div>

          {/* Search bar — right below cards */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input type="text" placeholder="Search by employee name or code..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-dark-800/50 border border-dark-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-dark-500 outline-none focus:border-rivvra-500 focus:ring-2 focus:ring-rivvra-500/20" />
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
                      <React.Fragment key={type}><th className="px-2 py-1 text-center">Used</th><th className="px-2 py-1 text-center">Avail</th></React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedSummary.map((row, i) => (
                    <tr key={i} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                      <td className="px-4 py-2.5">
                        <p className="text-white text-sm">{row.employeeName}</p>
                        <p className="text-dark-500 text-xs">{row.employeeCode}</p>
                      </td>
                      <td className="px-4 py-2.5 text-dark-400 text-xs">{row.employmentType}</td>
                      {['sick_leave', 'casual_leave', 'comp_off'].map(type => {
                        const bal = row.balances?.[type];
                        return (
                          <React.Fragment key={type}>
                            <td className="px-2 py-2.5 text-center text-dark-300">{bal?.used ?? '-'}</td>
                            <td className={`px-2 py-2.5 text-center font-medium ${(bal?.available || 0) <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {bal?.available ?? '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredSummary.length === 0 && (
              <div className="py-8 text-center text-dark-500 text-sm">
                {search ? 'No employees match your search.' : 'No leave data found for this financial year.'}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
                <p className="text-sm text-dark-500">
                  Showing {((safePage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filteredSummary.length)} of {filteredSummary.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                    className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 text-dark-400">
                    <ChevronLeft size={16} />
                  </button>
                  {pageNumbers.map(num => (
                    <button key={num} onClick={() => setPage(num)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        safePage === num ? 'bg-rivvra-500 text-white' : 'text-dark-400 hover:bg-dark-700'
                      }`}>
                      {num}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                    className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 text-dark-400">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Utilization Trends ── */
        <div className="space-y-3">
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
