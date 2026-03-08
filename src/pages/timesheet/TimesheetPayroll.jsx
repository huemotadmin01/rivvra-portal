import { useState, useEffect, useMemo, Fragment } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { generatePayslipPDF } from '../../utils/payslipPdf';
import ExcelJS from 'exceljs';
import {
  Loader2, Download, ChevronDown, ChevronUp,
  IndianRupee, Users, TrendingUp, Search, FileSpreadsheet, Package,
  ChevronLeft, ChevronRight, ShieldCheck, CalendarDays, FileDown,
  X, AlertTriangle, UserX, Lock, Unlock, Play, CheckCircle2, Circle,
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

  // Payroll run lifecycle
  const [payrollRun, setPayrollRun] = useState({ status: 'open' });
  const [actionLoading, setActionLoading] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  // Missing submissions data + popup states
  const [missingData, setMissingData] = useState(null);
  const [showMissingPopup, setShowMissingPopup] = useState(false);
  const [showApprovedPopup, setShowApprovedPopup] = useState(false);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const [payrollRes, missingRes] = await Promise.all([
        timesheetApi.get('/payroll/summary', { params: { month, year } }),
        timesheetApi.get('/dashboard/missing-submissions').catch(() => null),
      ]);
      setData(payrollRes.data);
      setPayrollRun(payrollRes.data?.payrollRun || { status: 'open' });
      if (missingRes?.data?.months) {
        // Find the month matching current selection
        const match = missingRes.data.months.find(m => m.month === month && m.year === year);
        setMissingData(match || null);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load payroll', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayroll(); setCurrentPage(1); setShowMissingPopup(false); setShowApprovedPopup(false); }, [month, year]);
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

  // Process Payroll — generate Excel for internal/external consultants
  const [processingPayroll, setProcessingPayroll] = useState(false);

  const handleProcessPayroll = async () => {
    if (!data?.employees?.length) return;
    setProcessingPayroll(true);
    try {
      // Filter to internal + external consultants only
      const consultants = data.employees.filter(e =>
        e.employmentType === 'internal_consultant' || e.employmentType === 'external_consultant'
      );

      if (consultants.length === 0) {
        showToast('No consultant employees found for this month', 'error');
        setProcessingPayroll(false);
        return;
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Rivvra';
      wb.created = new Date();
      const ws = wb.addWorksheet('Salary Statement');

      const statusLabel = (t) => t === 'internal_consultant' ? 'Internal Consultant' : 'External Consultant';
      const fmtDate = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        if (isNaN(dt)) return '';
        return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      };

      // Row 1: Created On timestamp
      const createdRow = ws.addRow([`Created On: ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`]);
      createdRow.getCell(1).font = { italic: true, color: { argb: '888888' }, size: 10 };

      // Row 2: Title
      const titleRow = ws.addRow([`Salary Statement For The Month Of ${monthNames[month]} ${year}`]);
      titleRow.getCell(1).font = { bold: true, size: 14 };
      ws.mergeCells(2, 1, 2, 14);

      // Row 3: blank
      ws.addRow([]);

      // Row 4: Column headers
      const headers = [
        'Employee No', 'Name', 'Join Date', 'Status',
        'Days In Month', 'LOP', 'Effective Workdays',
        'Gross Pay', 'TDS (2%)', 'Other Deductions', 'Total Deductions', 'Net Pay',
        'Disbursement Date', 'Payment Status',
      ];
      const headerRow = ws.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2D5F2D' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
      });
      headerRow.height = 24;

      // Data rows
      let totDaysInMonth = 0, totLOP = 0, totEffective = 0;
      let totGross = 0, totTDS = 0, totOther = 0, totDeductions = 0, totNet = 0;

      consultants.forEach((emp) => {
        const daysInMonth = emp.totalWorkingDaysInMonth || 0;
        const lop = emp.leaveDays || 0;
        const effective = emp.totalWorkingDays || 0;
        const gross = emp.grossPay || 0;
        const tds = emp.tdsAmount || 0;
        const otherDed = 0; // Not tracked yet
        const totalDed = -(tds + otherDed);
        const net = emp.netPay || 0;

        totDaysInMonth += daysInMonth;
        totLOP += lop;
        totEffective += effective;
        totGross += gross;
        totTDS += tds;
        totOther += otherDed;
        totDeductions += totalDed;
        totNet += net;

        const row = ws.addRow([
          emp.employeeId || '',
          emp.name || '',
          fmtDate(emp.joiningDate),
          statusLabel(emp.employmentType),
          daysInMonth,
          lop,
          effective,
          Math.round(gross * 100) / 100,
          Math.round(tds * 100) / 100,
          otherDed,
          Math.round(totalDed * 100) / 100,
          Math.round(net * 100) / 100,
          fmtDate(emp.disbursementDate),
          emp.paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
        ]);

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'DDDDDD' } },
            bottom: { style: 'thin', color: { argb: 'DDDDDD' } },
            left: { style: 'thin', color: { argb: 'DDDDDD' } },
            right: { style: 'thin', color: { argb: 'DDDDDD' } },
          };
          // Currency columns (8-12)
          if (colNumber >= 8 && colNumber <= 12) {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          }
          // Number columns (5-7)
          if (colNumber >= 5 && colNumber <= 7) {
            cell.alignment = { horizontal: 'center' };
          }
          // Status column
          if (colNumber === 14) {
            cell.font = { color: { argb: cell.value === 'Paid' ? '228B22' : 'CC5500' }, bold: true };
            cell.alignment = { horizontal: 'center' };
          }
        });
      });

      // Grand Total row
      const totalRow = ws.addRow([
        '', '', '', 'Grand Total',
        totDaysInMonth, totLOP, totEffective,
        Math.round(totGross * 100) / 100,
        Math.round(totTDS * 100) / 100,
        totOther,
        Math.round(totDeductions * 100) / 100,
        Math.round(totNet * 100) / 100,
        '', '',
      ]);
      totalRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F0F0' } };
        cell.border = {
          top: { style: 'medium' }, bottom: { style: 'medium' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
        if (colNumber >= 8 && colNumber <= 12) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });

      // Auto-width columns
      const minWidths = [14, 30, 14, 20, 14, 8, 18, 14, 12, 16, 16, 14, 16, 14];
      ws.columns.forEach((col, i) => {
        col.width = minWidths[i] || 14;
      });

      // Freeze header row
      ws.views = [{ state: 'frozen', ySplit: 4 }];

      // Generate and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SalaryStatement_${monthNames[month]}_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Payroll processed — ${consultants.length} consultant(s) exported`);
    } catch (err) {
      console.error('Process payroll error:', err);
      showToast('Failed to process payroll', 'error');
    } finally {
      setProcessingPayroll(false);
    }
  };

  // ── Payroll Run Actions ──
  const handleLockPayroll = async () => {
    setActionLoading(true);
    try {
      await timesheetApi.post('/payroll/run/lock', { month, year });
      showToast(`Payroll locked for ${monthNames[month]} ${year}`);
      await loadPayroll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to lock payroll', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlockPayroll = async () => {
    setActionLoading(true);
    try {
      await timesheetApi.post('/payroll/run/unlock', { month, year });
      showToast(`Payroll unlocked for ${monthNames[month]} ${year}`);
      await loadPayroll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to unlock payroll', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessPayrollRun = async () => {
    setActionLoading(true);
    try {
      await timesheetApi.post('/payroll/run/process', { month, year });
      showToast(`Payroll processed for ${monthNames[month]} ${year}`);
      await loadPayroll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to process payroll', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalizePayroll = async () => {
    setActionLoading(true);
    try {
      await timesheetApi.post('/payroll/run/finalize', { month, year });
      showToast(`Payroll finalized for ${monthNames[month]} ${year}`);
      setShowFinalizeConfirm(false);
      await loadPayroll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to finalize payroll', 'error');
    } finally {
      setActionLoading(false);
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

      {/* ── Payroll Run Status Banner ── */}
      {(() => {
        const status = payrollRun?.status || 'open';
        const steps = [
          { key: 'open', label: 'Open' },
          { key: 'locked', label: 'Locked' },
          { key: 'processed', label: 'Processed' },
          { key: 'finalized', label: 'Finalized' },
        ];
        const statusIndex = steps.findIndex(s => s.key === status);

        const statusColors = {
          open: 'border-dark-700 bg-dark-800/50',
          locked: 'border-amber-500/30 bg-amber-500/5',
          processed: 'border-blue-500/30 bg-blue-500/5',
          finalized: 'border-emerald-500/30 bg-emerald-500/5',
        };

        const statusInfo = {
          open: { text: 'Lock payroll to freeze timesheet inputs before processing.', color: 'text-dark-400' },
          locked: { text: 'Inputs frozen. Employees cannot submit or edit timesheets for this period.', color: 'text-amber-400/80' },
          processed: { text: 'Payroll processed. Review and finalize to close the month.', color: 'text-blue-400/80' },
          finalized: { text: `Payroll finalized for ${monthNames[month]} ${year}. No further changes allowed.`, color: 'text-emerald-400/80' },
        };

        return (
          <div className={`card border ${statusColors[status]} p-4 space-y-3`}>
            {/* Step Indicator */}
            <div className="flex items-center gap-1 sm:gap-2">
              {steps.map((step, i) => {
                const isActive = step.key === status;
                const isPast = i < statusIndex;
                const isFuture = i > statusIndex;

                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex items-center gap-1.5 flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isActive ? 'bg-rivvra-500 text-dark-950 ring-2 ring-rivvra-500/30' :
                        isPast ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-dark-700 text-dark-500'
                      }`}>
                        {isPast ? <CheckCircle2 size={12} /> : isActive ? <Circle size={8} className="fill-current" /> : <Circle size={8} />}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        isActive ? 'text-white' : isPast ? 'text-emerald-400/70' : 'text-dark-500'
                      }`}>{step.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`flex-1 h-px mx-1 sm:mx-2 ${isPast ? 'bg-emerald-500/30' : 'bg-dark-700'}`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Info + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-xs ${statusInfo[status].color}`}>{statusInfo[status].text}</p>
              <div className="flex items-center gap-2">
                {status === 'open' && (
                  <button onClick={handleLockPayroll} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-dark-950 hover:bg-amber-400 transition-colors disabled:opacity-50">
                    {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                    Lock Payroll
                  </button>
                )}
                {status === 'locked' && (
                  <>
                    <button onClick={handleUnlockPayroll} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-50">
                      {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                      Unlock
                    </button>
                    <button onClick={handleProcessPayrollRun} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-400 transition-colors disabled:opacity-50">
                      {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Process Payroll
                    </button>
                  </>
                )}
                {status === 'processed' && (
                  <>
                    <button onClick={handleUnlockPayroll} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-50">
                      {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                      Unlock to Locked
                    </button>
                    <button onClick={() => setShowFinalizeConfirm(true)} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-dark-950 hover:bg-emerald-400 transition-colors disabled:opacity-50">
                      <CheckCircle2 size={12} />
                      Finalize
                    </button>
                  </>
                )}
                {status === 'finalized' && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 size={14} /> Finalized
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Approved timesheets indicator + missing submissions link */}
      {data?.employees?.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dark-400">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Showing payroll data from{' '}
              <button onClick={() => setShowApprovedPopup(true)} className="text-emerald-400 font-medium hover:underline hover:text-emerald-300 transition-colors">
                {data.employees.reduce((s, e) => s + e.projects.length, 0)} approved timesheet{data.employees.reduce((s, e) => s + e.projects.length, 0) !== 1 ? 's' : ''}
              </button>
              {' '}for {monthNames[month]} {year}
            </span>
          </div>
          {missingData && missingData.missingCount > 0 && (
            <div className="flex items-center gap-2">
              <UserX size={14} className="text-amber-500" />
              <button onClick={() => setShowMissingPopup(true)} className="text-amber-400 font-medium hover:underline hover:text-amber-300 transition-colors">
                {missingData.missingCount} of {missingData.totalBillable} billable haven't submitted
              </button>
            </div>
          )}
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
          <button onClick={handleProcessPayroll} disabled={processingPayroll || !data?.employees?.length}
            className="bg-dark-800 border border-dark-700 text-dark-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-dark-700 flex items-center gap-1.5 transition-colors disabled:opacity-50">
            {processingPayroll ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Export Excel
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

      {/* Missing Submissions Popup */}
      {showMissingPopup && missingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowMissingPopup(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <UserX size={16} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Missing Timesheets</h3>
                  <p className="text-[11px] text-dark-400">{missingData.missingCount} of {missingData.totalBillable} billable employees — {monthNames[month]} {year}</p>
                </div>
              </div>
              <button onClick={() => setShowMissingPopup(false)} className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {(missingData.missingEmployees || []).map((emp, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-800/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-xs font-bold shrink-0">
                    {(emp.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{emp.name}</p>
                    <p className="text-[11px] text-dark-500 truncate">{emp.employeeId || emp.email}</p>
                  </div>
                  {emp.employmentType && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${typeBadgeColors[emp.employmentType] || 'bg-dark-700 text-dark-300'}`}>
                      {typeLabels[emp.employmentType] || emp.employmentType}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Approved Timesheets Popup */}
      {showApprovedPopup && data?.employees && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowApprovedPopup(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <ShieldCheck size={16} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Approved Timesheets</h3>
                  <p className="text-[11px] text-dark-400">{data.employees.length} employees — {monthNames[month]} {year}</p>
                </div>
              </div>
              <button onClick={() => setShowApprovedPopup(false)} className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {data.employees.map((emp, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-800/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    {(emp.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{emp.name}</p>
                    <p className="text-[11px] text-dark-500 truncate">{emp.employeeId || emp.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${typeBadgeColors[emp.employmentType] || 'bg-dark-700 text-dark-300'}`}>
                    {typeLabels[emp.employmentType] || emp.employmentType}
                  </span>
                  <span className="text-emerald-400 text-xs font-medium shrink-0">₹{fmt(emp.grossPay)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowFinalizeConfirm(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Finalize Payroll?</h3>
                  <p className="text-xs text-dark-400">{monthNames[month]} {year}</p>
                </div>
              </div>
              <p className="text-sm text-dark-300 leading-relaxed">
                This will permanently close the payroll period. Once finalized, no further changes can be made to timesheets or payroll for this month.
              </p>
              {payrollRun?.snapshot && (
                <div className="bg-dark-800/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-dark-400">Employees</span><span className="text-white">{payrollRun.snapshot.totalEmployees}</span></div>
                  <div className="flex justify-between"><span className="text-dark-400">Total Gross</span><span className="text-white">{'\u20B9'}{fmt(payrollRun.snapshot.totalGross)}</span></div>
                  <div className="flex justify-between"><span className="text-dark-400">Total Net</span><span className="text-emerald-400 font-medium">{'\u20B9'}{fmt(payrollRun.snapshot.totalNet)}</span></div>
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => setShowFinalizeConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 border border-dark-700 text-dark-300 text-sm font-medium hover:bg-dark-700 transition-colors">
                  Cancel
                </button>
                <button onClick={handleFinalizePayroll} disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 text-dark-950 text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Finalize
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
