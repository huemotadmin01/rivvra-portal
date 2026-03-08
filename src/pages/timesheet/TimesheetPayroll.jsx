import { useState, useEffect, useMemo, Fragment } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { generatePayslipPDF } from '../../utils/payslipPdf';
import {
  Loader2, Download, ChevronDown, ChevronUp,
  IndianRupee, Users, TrendingUp, Search, FileSpreadsheet, Package,
  ChevronLeft, ChevronRight, ShieldCheck, CalendarDays,
} from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortMonths = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const typeLabels = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal',
  external_consultant: 'External',
  intern: 'Intern',
};

const typeBadgeColors = {
  confirmed: 'bg-blue-500/10 text-blue-400',
  internal_consultant: 'bg-purple-500/10 text-purple-400',
  external_consultant: 'bg-amber-500/10 text-amber-400',
  intern: 'bg-emerald-500/10 text-emerald-400',
};

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDecimal = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TimesheetPayroll() {
  const { timesheetUser } = useTimesheetContext();
  const { showToast } = useToast();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadingPayslip, setDownloadingPayslip] = useState(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Check admin access
  if (timesheetUser && timesheetUser.role !== 'admin') {
    return <div className="p-6 text-center text-dark-400">Access denied. Admin only.</div>;
  }

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const res = await timesheetApi.get('/payroll/summary', { params: { month, year } });
      setData(res.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load payroll', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayroll(); setCurrentPage(1); }, [month, year]);
  // Reset page on filter/search change
  useEffect(() => { setCurrentPage(1); }, [activeTab, searchQuery]);

  // Filtering
  const filteredEmployees = useMemo(() => {
    if (!data?.employees) return [];
    let list = data.employees;
    if (activeTab !== 'all') {
      list = list.filter(e => e.employmentType === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.employeeId || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, activeTab, searchQuery]);

  // Filtered summary
  const filteredSummary = useMemo(() => {
    const totalPayable = filteredEmployees.reduce((s, e) => s + e.grossPay, 0);
    const paidCount = filteredEmployees.filter(e => e.paymentStatus === 'paid').length;
    return {
      totalPayable: Math.round(totalPayable),
      employeeCount: filteredEmployees.length,
      paidCount,
      unpaidCount: filteredEmployees.length - paidCount,
    };
  }, [filteredEmployees]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEmployees.slice(start, start + PAGE_SIZE);
  }, [filteredEmployees, currentPage]);

  const tabCounts = useMemo(() => {
    if (!data?.employees) return {};
    const counts = { all: data.employees.length };
    for (const e of data.employees) {
      counts[e.employmentType] = (counts[e.employmentType] || 0) + 1;
    }
    return counts;
  }, [data]);

  const handleDownloadPayslip = async (emp) => {
    setDownloadingPayslip(emp.employeeObjId);
    try {
      const res = await timesheetApi.get('/payroll/payslip-data', {
        params: { month, year, employeeId: emp.employeeObjId },
      });
      await generatePayslipPDF(res.data);
      showToast('Payslip downloaded');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to download payslip', 'error');
    } finally {
      setDownloadingPayslip(null);
    }
  };

  const handleBatchDownloadPayslips = async () => {
    if (filteredEmployees.length === 0) return;
    setBatchDownloading(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      let count = 0;

      for (const emp of filteredEmployees) {
        try {
          const res = await timesheetApi.get('/payroll/payslip-data', {
            params: { month, year, employeeId: emp.employeeObjId },
          });
          const blob = await generatePayslipPDF(res.data, { download: false });
          const safeName = (emp.name || 'Employee').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
          zip.file(`Payslip_${safeName}_${shortMonths[month]}_${year}.pdf`, blob);
          count++;
        } catch {
          // Skip individual failures
        }
      }

      if (count === 0) {
        showToast('No payslips could be generated', 'error');
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Payslips_${shortMonths[month]}_${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${count} payslip(s) downloaded as zip`);
    } catch (err) {
      showToast('Batch download failed', 'error');
    } finally {
      setBatchDownloading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await timesheetApi.get('/payroll/export-csv', {
        params: { month, year },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_${shortMonths[month]}_${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported');
    } catch (err) {
      showToast('Export failed', 'error');
    }
  };

  // Month navigation
  const goMonth = (dir) => {
    let m = month + dir, y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m); setYear(y);
    setExpandedEmployee(null);
  };

  if (loading) return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-dark-800 rounded-lg" />
          <div className="h-4 w-56 bg-dark-800/60 rounded" />
        </div>
        <div className="flex items-center">
          <div className="h-10 w-10 bg-dark-800 rounded-l-xl" />
          <div className="h-10 w-48 bg-dark-800/80 border-x border-dark-700" />
          <div className="h-10 w-10 bg-dark-800 rounded-r-xl" />
        </div>
      </div>
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[0, 1].map(i => (
          <div key={i} className="card p-4 sm:p-5 space-y-3">
            <div className="flex justify-between">
              <div className="h-4 w-24 bg-dark-800 rounded" />
              <div className="h-4 w-4 bg-dark-800 rounded" />
            </div>
            <div className="h-8 w-32 bg-dark-800 rounded-lg" />
          </div>
        ))}
      </div>
      {/* Filter tabs skeleton */}
      <div className="flex gap-2">
        {[72, 80, 64, 72, 56].map((w, i) => (
          <div key={i} className="h-8 bg-dark-800 rounded-lg" style={{ width: w }} />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="card overflow-hidden">
        <div className="bg-dark-800/80 h-10" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-t border-dark-800/30">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-dark-800 rounded w-36" />
              <div className="h-3 bg-dark-800/50 rounded w-24" />
            </div>
            <div className="h-5 w-16 bg-dark-800 rounded-full" />
            <div className="h-4 w-12 bg-dark-800/60 rounded hidden sm:block" />
            <div className="h-4 w-20 bg-dark-800 rounded hidden sm:block" />
            <div className="h-4 w-20 bg-emerald-500/5 rounded hidden sm:block" />
            <div className="h-5 w-14 bg-dark-800 rounded-full hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header + Month Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Payroll</h1>
          <p className="text-dark-400 text-sm">Salary overview for approved timesheets</p>
        </div>
        <div className="flex items-center">
          <button onClick={() => goMonth(-1)} className="p-2.5 rounded-l-xl bg-dark-800/80 border border-dark-700 border-r-0 text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <ChevronLeft size={18} />
          </button>
          <div className="relative bg-gradient-to-b from-dark-800 to-dark-900 border-y border-dark-700 px-5 py-2 flex items-center gap-3 min-w-[200px] justify-center">
            <CalendarDays size={18} className="text-rivvra-500 shrink-0" />
            <div className="flex items-baseline gap-2">
              <select value={month} onChange={e => { setMonth(Number(e.target.value)); setExpandedEmployee(null); }}
                className="bg-transparent text-white font-semibold text-base outline-none cursor-pointer appearance-none pr-4 hover:text-rivvra-400 transition-colors"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2366666680' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}>
                {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1} className="bg-dark-900">{m}</option>)}
              </select>
              <select value={year} onChange={e => { setYear(Number(e.target.value)); setExpandedEmployee(null); }}
                className="bg-transparent text-dark-400 font-medium text-sm outline-none cursor-pointer appearance-none pr-4 hover:text-dark-200 transition-colors"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2366666680' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => <option key={y} value={y} className="bg-dark-900">{y}</option>)}
              </select>
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-rivvra-500/50 rounded-full" />
          </div>
          <button onClick={() => goMonth(1)} className="p-2.5 rounded-r-xl bg-dark-800/80 border border-dark-700 border-l-0 text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm text-dark-400">Total Payable</span>
            <IndianRupee size={16} className="text-amber-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{'\u20B9'}{fmt(filteredSummary.totalPayable)}</p>
        </div>
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm text-dark-400">Employees</span>
            <Users size={16} className="text-purple-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{filteredSummary.employeeCount}</p>
          <p className="text-xs text-dark-500 mt-1">
            <span className="text-emerald-400">{filteredSummary.paidCount} paid</span>
            {filteredSummary.unpaidCount > 0 && <span className="text-amber-400 ml-2">{filteredSummary.unpaidCount} unpaid</span>}
          </p>
        </div>
      </div>

      {/* Approved timesheets indicator */}
      {data?.employees?.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-dark-400">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Showing payroll data from <span className="text-emerald-400 font-medium">{data.employees.reduce((s, e) => s + e.projects.length, 0)} approved timesheet{data.employees.reduce((s, e) => s + e.projects.length, 0) !== 1 ? 's' : ''}</span> for {monthNames[month]} {year}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {['all', 'confirmed', 'internal_consultant', 'external_consultant', 'intern'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700'
            }`}>
            {tab === 'all' ? 'All' : typeLabels[tab] || tab} ({tabCounts[tab] || 0})
          </button>
        ))}
      </div>

      {/* Search + Batch Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input type="text" placeholder="Search employees..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-dark-800/50 border border-dark-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-dark-500 outline-none focus:border-rivvra-500 focus:ring-2 focus:ring-rivvra-500/20" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleBatchDownloadPayslips} disabled={batchDownloading || filteredEmployees.length === 0}
            className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors disabled:opacity-50">
            {batchDownloading ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            All Payslips
          </button>
          <button onClick={handleExportCSV}
            className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors">
            <FileSpreadsheet size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Payroll Table */}
      {filteredEmployees.length === 0 ? (
        <div className="card p-8 text-center text-dark-500">
          {data?.employees?.length === 0
            ? `No approved timesheets for ${monthNames[month]} ${year}`
            : 'No employees match the current filter'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-dark-800/80">
                <th className="text-left px-4 py-3 font-medium text-dark-400">Employee</th>
                <th className="text-left px-3 py-3 font-medium text-dark-400">Type</th>
                <th className="text-left px-3 py-3 font-medium text-dark-400">Project(s)</th>
                <th className="text-right px-3 py-3 font-medium text-dark-400">Days</th>
                <th className="text-right px-3 py-3 font-medium text-dark-400">Gross</th>
                <th className="text-right px-3 py-3 font-medium text-dark-400">TDS</th>
                <th className="text-right px-3 py-3 font-medium text-dark-400">Net Pay</th>
                <th className="text-center px-3 py-3 font-medium text-dark-400">Disbursement</th>
                <th className="text-center px-3 py-3 font-medium text-dark-400">Status</th>
                <th className="px-2 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/50">
              {paginatedEmployees.map(emp => {
                const isExpanded = expandedEmployee === emp.employeeObjId;
                return (
                  <Fragment key={emp.employeeObjId}>
                    <tr className="hover:bg-dark-800/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedEmployee(isExpanded ? null : emp.employeeObjId)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{emp.name}</p>
                        <p className="text-xs text-dark-500">{emp.employeeId || emp.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${typeBadgeColors[emp.employmentType] || 'bg-dark-700 text-dark-400'}`}>
                          {typeLabels[emp.employmentType] || emp.employmentType}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-dark-300 text-xs max-w-[150px] truncate">
                        {emp.projects.map(p => p.projectName).join(', ')}
                      </td>
                      <td className="px-3 py-3 text-right text-dark-300">{emp.totalWorkingDays}</td>
                      <td className="px-3 py-3 text-right text-dark-300">{'\u20B9'}{fmt(emp.grossPay)}</td>
                      <td className="px-3 py-3 text-right text-red-400 text-xs">-{'\u20B9'}{fmt(emp.tdsAmount)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-400">{'\u20B9'}{fmt(emp.netPay)}</td>
                      <td className="px-3 py-3 text-center text-dark-400 text-xs">
                        {emp.disbursementDate ? new Date(emp.disbursementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '\u2014'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          emp.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {emp.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-dark-500">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>

                    {/* Accordion Detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan="10" className="p-0">
                          <div className="border-t border-dark-800 bg-dark-950/50 p-4 sm:p-6 space-y-4">
                            {/* Two-column: Salary Calc + Bank Details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Salary Calculation</h4>
                                <div className="bg-dark-900 rounded-lg p-3 space-y-1.5 text-sm">
                                  <div className="flex justify-between"><span className="text-dark-400">Pay Type</span><span className="text-dark-200">{emp.payType === 'monthly' ? 'Monthly' : 'Daily'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">Rate</span>
                                    <span className="text-dark-200">
                                      {emp.payType === 'monthly'
                                        ? `${'\u20B9'}${fmt(emp.monthlyRate)}/month`
                                        : `${'\u20B9'}${fmt(emp.dailyRate)}/day`}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="text-dark-400">Working Days</span><span className="text-dark-200">{emp.totalWorkingDays} of {emp.totalWorkingDaysInMonth}</span></div>
                                  {emp.paidLeavePerMonth > 0 && (
                                    <div className="flex justify-between"><span className="text-dark-400">Paid Leave/Month</span><span className="text-dark-200">{emp.paidLeavePerMonth}</span></div>
                                  )}
                                  {emp.leaveDays > 0 && (
                                    <div className="flex justify-between"><span className="text-dark-400">Leave Days</span><span className="text-red-400">{emp.leaveDays}</span></div>
                                  )}
                                  {emp.holidayDays > 0 && (
                                    <div className="flex justify-between"><span className="text-dark-400">Holidays</span><span className="text-purple-400">{emp.holidayDays}</span></div>
                                  )}
                                  <hr className="border-dark-800 my-1" />
                                  <div className="flex justify-between font-medium"><span className="text-dark-300">Gross Pay</span><span className="text-white">{'\u20B9'}{fmtDecimal(emp.grossPay)}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">TDS ({(emp.tdsRate * 100)}%)</span><span className="text-red-400">-{'\u20B9'}{fmtDecimal(emp.tdsAmount)}</span></div>
                                  <div className="flex justify-between font-bold text-base"><span className="text-dark-200">Net Pay</span><span className="text-emerald-400">{'\u20B9'}{fmtDecimal(emp.netPay)}</span></div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Bank Details</h4>
                                <div className="bg-dark-900 rounded-lg p-3 space-y-1.5 text-sm">
                                  <div className="flex justify-between"><span className="text-dark-400">Bank</span><span className="text-dark-200">{emp.bankDetails?.bankName || '\u2014'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">A/c No.</span><span className="text-dark-200">{emp.bankDetails?.accountNumber || '\u2014'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">IFSC</span><span className="text-dark-200">{emp.bankDetails?.ifscCode || '\u2014'}</span></div>
                                  <div className="flex justify-between"><span className="text-dark-400">PAN</span><span className="text-dark-200">{emp.bankDetails?.pan || '\u2014'}</span></div>
                                </div>

                                {emp.disbursementDate && (
                                  <div className="bg-dark-900 rounded-lg p-3 text-sm mt-2">
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Disbursement Date</span>
                                      <span className="text-dark-200">
                                        {new Date(emp.disbursementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                      </span>
                                    </div>
                                    {emp.disbursementNote && (
                                      <p className="text-xs text-dark-500 mt-1">{emp.disbursementNote}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Multi-project breakdown */}
                            {emp.projects.length > 1 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Project-wise Breakdown</h4>
                                <div className="bg-dark-900 rounded-lg overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-dark-800/60">
                                        <th className="text-left px-3 py-2 text-dark-400 font-medium text-xs">Project</th>
                                        <th className="text-left px-3 py-2 text-dark-400 font-medium text-xs">Client</th>
                                        <th className="text-right px-3 py-2 text-dark-400 font-medium text-xs">Days</th>
                                        <th className="text-right px-3 py-2 text-dark-400 font-medium text-xs">Payable</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-dark-800/50">
                                      {emp.projects.map(p => (
                                        <tr key={p.timesheetId}>
                                          <td className="px-3 py-2 text-white">{p.projectName}</td>
                                          <td className="px-3 py-2 text-dark-300">{p.clientName}</td>
                                          <td className="px-3 py-2 text-right text-dark-300">{p.workingDays}</td>
                                          <td className="px-3 py-2 text-right text-dark-200">{'\u20B9'}{fmt(p.contractorPayable)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Pro-rata note */}
                            {emp.projects.some(p => p.revisionData?.revisionApplied) && (
                              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                                <TrendingUp size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                <div className="text-sm">
                                  <p className="text-amber-400 font-medium">Salary Pro-rated</p>
                                  <p className="text-dark-400 text-xs mt-0.5">
                                    Rate was revised mid-month. Pay has been calculated proportionally across rate periods.
                                  </p>
                                  {emp.projects.filter(p => p.revisionData?.revisionApplied).map(p => (
                                    <div key={p.timesheetId} className="mt-2 text-xs text-dark-400">
                                      <span className="text-dark-300 font-medium">{p.projectName}:</span>
                                      {(p.revisionData?.ratePeriods || []).map((rp, i) => (
                                        <span key={i} className="ml-2">
                                          Day {rp.startDay}-{rp.endDay}: {'\u20B9'}{fmt(rp.amount)}
                                        </span>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadPayslip(emp); }}
                                disabled={downloadingPayslip === emp.employeeObjId}
                                className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                                {downloadingPayslip === emp.employeeObjId ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                Download Payslip
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {/* Totals Footer */}
            <tfoot>
              <tr className="bg-dark-800/80 font-medium">
                <td className="px-4 py-3 text-dark-300" colSpan="3">Total ({filteredEmployees.length} employees)</td>
                <td className="px-3 py-3 text-right text-dark-300">{filteredEmployees.reduce((s, e) => s + e.totalWorkingDays, 0)}</td>
                <td className="px-3 py-3 text-right text-white">{'\u20B9'}{fmt(filteredSummary.totalPayable)}</td>
                <td className="px-3 py-3 text-right text-red-400 text-xs">-{'\u20B9'}{fmt(filteredEmployees.reduce((s, e) => s + e.tdsAmount, 0))}</td>
                <td className="px-3 py-3 text-right text-emerald-400 font-semibold">{'\u20B9'}{fmt(filteredEmployees.reduce((s, e) => s + e.netPay, 0))}</td>
                <td colSpan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredEmployees.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-dark-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '...' ? (
                  <span key={`dot-${i}`} className="px-1 text-dark-500 text-sm">...</span>
                ) : (
                  <button key={p} onClick={() => setCurrentPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      currentPage === p
                        ? 'bg-rivvra-500 text-dark-950'
                        : 'bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700'
                    }`}>
                    {p}
                  </button>
                )
              )}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
