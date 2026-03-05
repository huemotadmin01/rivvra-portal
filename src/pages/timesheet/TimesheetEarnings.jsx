import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { Clock, Loader2, Download, FileText } from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Convert number to words (Indian format) */
function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);
  let words = '';
  if (whole >= 10000000) { words += ones[Math.floor(whole / 10000000)] + ' Crore '; }
  const lakhPart = Math.floor((whole % 10000000) / 100000);
  if (lakhPart > 0) { words += (lakhPart < 20 ? ones[lakhPart] : tens[Math.floor(lakhPart / 10)] + ' ' + ones[lakhPart % 10]) + ' Lakh '; }
  const thousandPart = Math.floor((whole % 100000) / 1000);
  if (thousandPart > 0) { words += (thousandPart < 20 ? ones[thousandPart] : tens[Math.floor(thousandPart / 10)] + ' ' + ones[thousandPart % 10]) + ' Thousand '; }
  const hundredPart = Math.floor((whole % 1000) / 100);
  if (hundredPart > 0) { words += ones[hundredPart] + ' Hundred '; }
  const remaining = whole % 100;
  if (remaining > 0) {
    if (words) words += 'and ';
    words += remaining < 20 ? ones[remaining] : tens[Math.floor(remaining / 10)] + ' ' + ones[remaining % 10];
  }
  words = words.trim() + ' Rupees';
  if (paise > 0) {
    words += ' and ' + (paise < 20 ? ones[paise] : tens[Math.floor(paise / 10)] + ' ' + ones[paise % 10]).trim() + ' Paise';
  }
  return words + ' Only';
}

/** Download payslip as PDF using jsPDF (programmatic — no html2canvas) */
async function downloadPayslipPDF(month, year, showToast) {
  const { jsPDF } = await import('jspdf');
  const res = await timesheetApi.get('/earnings/payslip', { params: { month, year } });
  const data = res.data;

  const emp = data.employee;
  const co = data.company || {};
  const brk = data.breakdown;
  const earn = data.earnings;

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const joinDate = emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';

  const s = {
    coName: (co.name) || 'Company', coAddr: co.address || '', coPhone: co.phone || '', coWebsite: co.website || '',
    empName: emp.name || '', empId: emp.employeeId || '\u2014',
    empDesig: emp.designation || '\u2014', empDept: emp.department || '\u2014',
    bankName: emp.bankDetails?.bankName || '\u2014', bankAcc: emp.bankDetails?.accountNumber || '\u2014',
    bankPan: emp.bankDetails?.pan || '\u2014',
  };

  let rateDisplay = '';
  if (emp.dailyRate > 0) rateDisplay = `Rs.${Number(emp.dailyRate).toLocaleString('en-IN')}/day`;
  else if (emp.monthlyRate > 0) rateDisplay = `Rs.${Number(emp.monthlyRate).toLocaleString('en-IN')}/month`;

  // --- Build PDF with jsPDF ---
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const margin = 15;
  const contentW = pageW - margin * 2;               // 180
  let y = margin;
  const primary = [26, 82, 118];  // #1a5276
  const gray = [102, 102, 102];
  const lightGray = [136, 136, 136];
  const black = [26, 26, 26];
  const white = [255, 255, 255];
  const lineColor = [220, 220, 220];
  const headerBg = [247, 249, 252];

  // Helper: draw a filled rect
  const fillRect = (x, yy, w, h, color) => { doc.setFillColor(...color); doc.rect(x, yy, w, h, 'F'); };
  // Helper: draw a line
  const drawLine = (x1, y1, x2, y2, color = lineColor, width = 0.3) => {
    doc.setDrawColor(...color); doc.setLineWidth(width); doc.line(x1, y1, x2, y2);
  };

  // ===== HEADER =====
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...primary);
  doc.text(s.coName, margin, y + 6);
  // Payslip title on right
  doc.setFontSize(15);
  doc.text('PAYSLIP', pageW - margin, y + 6, { align: 'right' });
  y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray);
  if (s.coAddr) { doc.text(s.coAddr, margin, y); y += 3.5; }
  if (s.coPhone) { doc.text('Phone: ' + s.coPhone, margin, y); y += 3.5; }
  if (s.coWebsite) { doc.text(s.coWebsite, margin, y); y += 3.5; }
  // Period on right
  doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`${monthNames[data.month]} ${data.year}`, pageW - margin, margin + 12, { align: 'right' });
  y = Math.max(y, margin + 16);
  // Header border
  drawLine(margin, y, pageW - margin, y, primary, 0.8);
  y += 6;

  // ===== EMPLOYEE DETAILS SECTION =====
  fillRect(margin, y, contentW, 7, primary);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...white);
  doc.text('EMPLOYEE DETAILS', margin + 4, y + 5);
  y += 9;

  // Helpers
  const rowH = 5.5;
  const truncate = (text, maxW) => {
    let val = String(text);
    if (doc.getTextWidth(val) <= maxW) return val;
    const dotW = doc.getTextWidth('..');
    while (doc.getTextWidth(val) + dotW > maxW && val.length > 1) val = val.slice(0, -1);
    return val.trim() + '..';
  };

  // --- Full-width name row (spans entire width — no overlap) ---
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lightGray);
  doc.text('Employee Name', margin + 3, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text(truncate(s.empName, contentW - 30), margin + 30, y);
  drawLine(margin, y + 1.5, margin + contentW, y + 1.5);
  y += rowH;

  // --- Two-column layout for remaining details ---
  const colGap = 8;
  const leftW = contentW * 0.52;
  const rightW = contentW - leftW - colGap;
  const col1X = margin;
  const col2X = margin + leftW + colGap;
  const lLblW = 22;
  const rLblW = 24;

  const drawRow = (x, yy, label, value, labelW, colWidth) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lightGray);
    doc.text(label, x + 3, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...black);
    doc.text(truncate(value, colWidth - labelW - 3), x + labelW, yy);
    drawLine(x, yy + 1.5, x + colWidth, yy + 1.5);
  };

  let workingDaysVal = `${brk.totalWorkingDays} of ${brk.totalWorkingDaysInMonth}`;
  if (brk.holidays) workingDaysVal += ` + ${brk.holidays} holiday${brk.holidays > 1 ? 's' : ''}`;
  if (brk.paidLeave) workingDaysVal += ` + ${brk.paidLeave} paid leave`;

  const leftRows = [
    ['Employee ID', s.empId], ['Designation', s.empDesig],
    ['Department', s.empDept], ['Start Date', joinDate],
  ];
  const rightRows = [
    ['Bank Name', s.bankName], ['A/c No.', s.bankAcc], ['PAN No.', s.bankPan],
    ['Pay Type', emp.payType === 'monthly' ? 'Monthly' : 'Daily'],
  ];
  if (rateDisplay) rightRows.push(['Rate', rateDisplay]);
  rightRows.push(['Working Days', workingDaysVal]);

  const maxRows = Math.max(leftRows.length, rightRows.length);
  for (let i = 0; i < maxRows; i++) {
    if (leftRows[i]) drawRow(col1X, y, leftRows[i][0], leftRows[i][1], lLblW, leftW);
    if (rightRows[i]) drawRow(col2X, y, rightRows[i][0], rightRows[i][1], rLblW, rightW);
    y += rowH;
  }
  y += 4;

  // ===== EARNINGS & DEDUCTIONS =====
  fillRect(margin, y, contentW, 7, primary);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...white);
  doc.text('EARNINGS & DEDUCTIONS', margin + 4, y + 5);
  y += 9;

  // Earnings table header
  fillRect(margin, y, contentW, 6, headerBg);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...primary);
  doc.text('EARNINGS', margin + 3, y + 4);
  doc.text('AMOUNT (Rs.)', pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 8;

  // Consultancy Fees row
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text('Consultancy Fees', margin + 3, y + 3);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${fmt(earn.grossAmount)}`, pageW - margin - 3, y + 3, { align: 'right' });
  drawLine(margin, y + 5, pageW - margin, y + 5);
  y += 7;

  // Total Earnings row
  fillRect(margin, y, contentW, 6, headerBg);
  drawLine(margin, y, pageW - margin, y, primary, 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text('Total Earnings (A)', margin + 3, y + 4);
  doc.text(`Rs. ${fmt(earn.grossAmount)}`, pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 10;

  // Deductions table header
  fillRect(margin, y, contentW, 6, headerBg);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...primary);
  doc.text('DEDUCTIONS', margin + 3, y + 4);
  doc.text('AMOUNT (Rs.)', pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 8;

  // TDS row
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text(`TDS (${(earn.tdsRate * 100)}%)`, margin + 3, y + 3);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${fmt(earn.tdsAmount)}`, pageW - margin - 3, y + 3, { align: 'right' });
  drawLine(margin, y + 5, pageW - margin, y + 5);
  y += 7;

  // Total Deductions row
  fillRect(margin, y, contentW, 6, headerBg);
  drawLine(margin, y, pageW - margin, y, primary, 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text('Total Deductions (B)', margin + 3, y + 4);
  doc.text(`Rs. ${fmt(earn.tdsAmount)}`, pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 10;

  // ===== NET PAY BOX =====
  fillRect(margin, y, contentW, 12, primary);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...white);
  doc.text('Net Pay (A - B)', margin + 6, y + 8);
  doc.setFontSize(14);
  doc.text(`Rs. ${fmt(earn.netAmount)}`, pageW - margin - 6, y + 8, { align: 'right' });
  y += 15;

  // Amount in words
  fillRect(margin, y, contentW, 8, [249, 249, 249]);
  doc.setDrawColor(...lineColor); doc.setLineWidth(0.2);
  doc.rect(margin, y, contentW, 8, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...gray);
  doc.text('Amount in Words:', margin + 3, y + 5);
  doc.setFont('helvetica', 'italic');
  doc.text(numberToWords(earn.netAmount), margin + 30, y + 5);
  y += 14;

  // ===== FOOTER =====
  drawLine(margin, y, pageW - margin, y, lineColor, 0.3);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(170, 170, 170);
  doc.text('This is a system-generated payslip and does not require a physical signature.', pageW / 2, y, { align: 'center' });
  y += 3.5;
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageW / 2, y, { align: 'center' });

  // Save PDF
  const safeName = (emp.name || 'Employee').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const filename = `Payslip_${safeName}_${monthNames[data.month]}_${data.year}.pdf`;
  doc.save(filename);
  showToast('Payslip downloaded');
}

function EarningsCard({ data, title, onDownload, downloading }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-medium text-dark-400 mb-3">{title}</h3>
      {data ? (
        <>
          <p className="text-lg font-semibold text-dark-300">Gross: ₹{(data.earnings?.grossAmount || 0).toLocaleString()}</p>
          <p className="text-sm text-red-400 mt-1">TDS (2%): -₹{(data.earnings?.tdsAmount || 0).toLocaleString()}</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">Net: ₹{(data.earnings?.netAmount || data.earnings?.grossAmount || 0).toLocaleString()}</p>
          <p className="text-xs text-dark-500 mt-1">{data.earnings?.calculation}</p>
          {data.estimateNote && (
            <p className="text-xs text-amber-400/80 italic mt-1">{data.estimateNote}</p>
          )}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-dark-400">Total Hours</span><span className="font-medium text-white">{data.breakdown?.totalHours || 0}h</span></div>
            <div className="flex justify-between text-sm"><span className="text-dark-400">Working Days</span><span className="font-medium text-white">{data.breakdown?.totalWorkingDays || 0}</span></div>
            {data.breakdown?.paidLeave > 0 && (
              <div className="flex justify-between text-sm"><span className="text-dark-400">Paid Leave</span><span className="font-medium text-emerald-400">+{data.breakdown.paidLeave}</span></div>
            )}
            <div className="flex justify-between text-sm"><span className="text-dark-400">Leaves</span><span className="font-medium text-white">{data.breakdown?.totalLeaves || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-dark-400">Holidays</span><span className="font-medium text-white">{data.breakdown?.totalHolidays || 0}</span></div>
          </div>
          {data.timesheetStatus && (
            <div className="mt-3 flex items-center justify-between">
              <span className={`px-2 py-1 rounded text-xs font-medium inline-block ${
                data.timesheetStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                data.timesheetStatus === 'submitted' ? 'bg-amber-500/10 text-amber-400' :
                'bg-dark-700 text-dark-400'
              }`}>{data.timesheetStatus}</span>
              {data.month && data.year && data.timesheetStatus === 'approved' && (
                <button onClick={() => onDownload(data.month, data.year)} disabled={downloading === `${data.month}-${data.year}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50">
                  {downloading === `${data.month}-${data.year}` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Payslip
                </button>
              )}
            </div>
          )}
          {data.projectBreakdowns?.length > 1 && (
            <div className="mt-4 border-t border-dark-800 pt-3">
              <p className="text-xs font-medium text-dark-400 mb-2">Per Project</p>
              {data.projectBreakdowns.map((pb, i) => (
                <div key={i} className="flex justify-between text-xs py-1">
                  <span className="text-dark-300">{pb.project}</span>
                  <span className="font-medium text-white">{pb.totalHours || 0}h ({pb.workingDays} days)</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-dark-500">No data available</p>
      )}
    </div>
  );
}

export default function TimesheetEarnings() {
  const { timesheetUser } = useTimesheetContext();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();

  // Temporary: redirect confirmed+billable employees (pending payroll deductions)
  const hideEarnings = timesheetUser?.employmentType === 'confirmed' && timesheetUser?.billable;
  if (hideEarnings) return <Navigate to={orgPath('/timesheet/dashboard')} replace />;
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [history, setHistory] = useState([]);
  const [disbursement, setDisbursement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const sig = { signal: controller.signal };
    Promise.all([
      timesheetApi.get('/earnings/current', sig).then(r => setCurrent(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/previous', sig).then(r => setPrevious(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/history', sig).then(r => setHistory(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/disbursement-info', sig).then(r => setDisbursement(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const handleDownloadPayslip = async (month, year) => {
    setDownloading(`${month}-${year}`);
    await downloadPayslipPDF(month, year, showToast);
    setDownloading(null);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Earnings</h1>
        <p className="text-dark-400 text-sm">Track your income and payment schedule</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EarningsCard data={current} title={current ? `${monthNames[current.month]} ${current.year} (Current)` : 'Current Month'} onDownload={handleDownloadPayslip} downloading={downloading} />
        <EarningsCard data={previous} title={previous ? `${monthNames[previous.month]} ${previous.year} (Previous)` : 'Previous Month'} onDownload={handleDownloadPayslip} downloading={downloading} />
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-blue-400" />
          <h3 className="font-semibold text-white">Salary Disbursement Schedule</h3>
        </div>
        {disbursement?.nextDisbursementDate ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-lg font-bold text-white">
                {new Date(disbursement.nextDisbursementDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {disbursement.countdown && <p className="text-blue-400 font-medium mt-1">{disbursement.countdown}</p>}
              {disbursement.note && <p className="text-sm text-dark-400 mt-1">{disbursement.note}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm text-dark-400">Estimated Net Amount</p>
              <p className="text-xl font-bold text-emerald-400">₹{(disbursement.netEstimate || disbursement.estimatedAmount || 0).toLocaleString()}</p>
              {disbursement.tdsAmount > 0 && (
                <p className="text-xs text-dark-500 mt-0.5">After 2% TDS (₹{disbursement.tdsAmount.toLocaleString()})</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-dark-500">Disbursement schedule not configured</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-dark-800 flex items-center justify-between">
          <h3 className="font-semibold text-white">Earnings History</h3>
          <div className="flex items-center gap-1 text-xs text-dark-500">
            <FileText size={12} />
            Click download icon for payslip
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-dark-400">Month</th>
                <th className="text-right px-4 py-3 font-medium text-dark-400">Days</th>
                <th className="text-right px-4 py-3 font-medium text-dark-400">Gross</th>
                <th className="text-right px-4 py-3 font-medium text-dark-400">TDS (2%)</th>
                <th className="text-right px-4 py-3 font-medium text-dark-400">Net Pay</th>
                <th className="text-center px-4 py-3 font-medium text-dark-400">Status</th>
                <th className="text-center px-4 py-3 font-medium text-dark-400">Payment</th>
                <th className="text-center px-4 py-3 font-medium text-dark-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {history.map((h, i) => (
                <tr key={i} className={
                  h.paymentStatus === 'paid' ? 'bg-emerald-500/5' :
                  h.status === 'approved' ? 'bg-amber-500/5' : ''
                }>
                  <td className="px-4 py-3 font-medium text-white">{monthNames[h.month]} {h.year}</td>
                  <td className="px-4 py-3 text-right text-dark-300">{h.totalWorkingDays}</td>
                  <td className="px-4 py-3 text-right text-dark-300">₹{(h.grossAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-red-400">-₹{(h.tdsAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-400">₹{(h.netAmount || h.grossAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      h.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                      h.status === 'submitted' ? 'bg-amber-500/10 text-amber-400' :
                      h.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                      h.status === 'draft' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-dark-700 text-dark-500'
                    }`}>{h.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${h.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-dark-500'}`}>
                      {h.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {h.grossAmount > 0 && h.status === 'approved' ? (
                      <button
                        onClick={() => handleDownloadPayslip(h.month, h.year)}
                        disabled={downloading === `${h.month}-${h.year}`}
                        className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                        title="Download Payslip"
                      >
                        {downloading === `${h.month}-${h.year}` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      </button>
                    ) : h.grossAmount > 0 ? (
                      <span className="text-dark-600 text-xs" title="Payslip available after approval">—</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
