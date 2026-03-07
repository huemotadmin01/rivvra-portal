const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Convert number to words (Indian format) */
export function numberToWords(num) {
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

/**
 * Generate payslip PDF from data object.
 * @param {Object} data - Payslip data from /earnings/payslip or /payroll/payslip-data endpoint
 * @param {Object} options - { download: true (save file) | false (return blob) }
 * @returns {Blob|undefined} - Returns blob if download=false
 */
export async function generatePayslipPDF(data, options = { download: true }) {
  const { jsPDF } = await import('jspdf');

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

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;
  const primary = [26, 82, 118];
  const gray = [102, 102, 102];
  const lightGray = [136, 136, 136];
  const black = [26, 26, 26];
  const white = [255, 255, 255];
  const lineColor = [220, 220, 220];
  const headerBg = [247, 249, 252];

  const fillRect = (x, yy, w, h, color) => { doc.setFillColor(...color); doc.rect(x, yy, w, h, 'F'); };
  const drawLine = (x1, y1, x2, y2, color = lineColor, width = 0.3) => {
    doc.setDrawColor(...color); doc.setLineWidth(width); doc.line(x1, y1, x2, y2);
  };

  // ===== HEADER =====
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...primary);
  doc.text(s.coName, margin, y + 6);
  doc.setFontSize(15);
  doc.text('PAYSLIP', pageW - margin, y + 6, { align: 'right' });
  y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray);
  if (s.coAddr) { doc.text(s.coAddr, margin, y); y += 3.5; }
  if (s.coPhone) { doc.text('Phone: ' + s.coPhone, margin, y); y += 3.5; }
  if (s.coWebsite) { doc.text(s.coWebsite, margin, y); y += 3.5; }
  doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`${monthNames[data.month]} ${data.year}`, pageW - margin, margin + 12, { align: 'right' });
  y = Math.max(y, margin + 16);
  drawLine(margin, y, pageW - margin, y, primary, 0.8);
  y += 6;

  // ===== EMPLOYEE DETAILS =====
  fillRect(margin, y, contentW, 7, primary);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...white);
  doc.text('EMPLOYEE DETAILS', margin + 4, y + 5);
  y += 12;

  const rowH = 5.5;
  const truncate = (text, maxW) => {
    let val = String(text);
    if (doc.getTextWidth(val) <= maxW) return val;
    const dotW = doc.getTextWidth('..');
    while (doc.getTextWidth(val) + dotW > maxW && val.length > 1) val = val.slice(0, -1);
    return val.trim() + '..';
  };

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lightGray);
  doc.text('Employee Name', margin + 3, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text(truncate(s.empName, contentW - 30), margin + 30, y);
  drawLine(margin, y + 1.5, margin + contentW, y + 1.5);
  y += rowH;

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

  fillRect(margin, y, contentW, 6, headerBg);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...primary);
  doc.text('EARNINGS', margin + 3, y + 4);
  doc.text('AMOUNT (Rs.)', pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 8;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text('Consultancy Fees', margin + 3, y + 3);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${fmt(earn.grossAmount)}`, pageW - margin - 3, y + 3, { align: 'right' });
  drawLine(margin, y + 5, pageW - margin, y + 5);
  y += 7;

  fillRect(margin, y, contentW, 6, headerBg);
  drawLine(margin, y, pageW - margin, y, primary, 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text('Total Earnings (A)', margin + 3, y + 4);
  doc.text(`Rs. ${fmt(earn.grossAmount)}`, pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 10;

  fillRect(margin, y, contentW, 6, headerBg);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...primary);
  doc.text('DEDUCTIONS', margin + 3, y + 4);
  doc.text('AMOUNT (Rs.)', pageW - margin - 3, y + 4, { align: 'right' });
  drawLine(margin, y + 6, pageW - margin, y + 6, primary, 0.5);
  y += 8;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...black);
  doc.text(`TDS (${(earn.tdsRate * 100)}%)`, margin + 3, y + 3);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${fmt(earn.tdsAmount)}`, pageW - margin - 3, y + 3, { align: 'right' });
  drawLine(margin, y + 5, pageW - margin, y + 5);
  y += 7;

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

  fillRect(margin, y, contentW, 8, [249, 249, 249]);
  doc.setDrawColor(...lineColor); doc.setLineWidth(0.2);
  doc.rect(margin, y, contentW, 8, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...gray);
  doc.text('Amount in Words:', margin + 3, y + 5);
  doc.setFont('helvetica', 'italic');
  doc.text(numberToWords(earn.netAmount), margin + 30, y + 5);
  y += 14;

  // ===== PRO-RATA NOTE =====
  if (data.revisionData?.revisionApplied) {
    fillRect(margin, y, contentW, 8, [255, 251, 235]);
    doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.3);
    doc.rect(margin, y, contentW, 8, 'S');
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(146, 64, 14);
    doc.text('* Salary pro-rated due to rate revision during this month.', margin + 3, y + 5);
    y += 12;
  }

  // ===== FOOTER =====
  drawLine(margin, y, pageW - margin, y, lineColor, 0.3);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(170, 170, 170);
  doc.text('This is a system-generated payslip and does not require a physical signature.', pageW / 2, y, { align: 'center' });
  y += 3.5;
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageW / 2, y, { align: 'center' });

  if (options.download !== false) {
    const safeName = (emp.name || 'Employee').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
    const filename = `Payslip_${safeName}_${monthNames[data.month]}_${data.year}.pdf`;
    doc.save(filename);
    return filename;
  } else {
    return doc.output('blob');
  }
}
