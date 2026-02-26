import{a8 as S,a as P,m as T,j as t,ad as L,r as b,a9 as j,L as D,t as E,F as z,D as A,ae as M}from"./index-CF9E6EeS.js";import{p as C}from"./purify.es-B2vaJoXh.js";const h=e=>C.sanitize(String(e??""),{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}),N=["","January","February","March","April","May","June","July","August","September","October","November","December"];function F(e){if(e===0)return"Zero";const o=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],u=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],d=Math.floor(e),n=Math.round((e-d)*100);let a="";d>=1e7&&(a+=o[Math.floor(d/1e7)]+" Crore ");const i=Math.floor(d%1e7/1e5);i>0&&(a+=(i<20?o[i]:u[Math.floor(i/10)]+" "+o[i%10])+" Lakh ");const c=Math.floor(d%1e5/1e3);c>0&&(a+=(c<20?o[c]:u[Math.floor(c/10)]+" "+o[c%10])+" Thousand ");const m=Math.floor(d%1e3/100);m>0&&(a+=o[m]+" Hundred ");const r=d%100;return r>0&&(a&&(a+="and "),a+=r<20?o[r]:u[Math.floor(r/10)]+" "+o[r%10]),a=a.trim()+" Rupees",n>0&&(a+=" and "+(n<20?o[n]:u[Math.floor(n/10)]+" "+o[n%10]).trim()+" Paise"),a+" Only"}async function W(e,o,u){const n=(await j.get("/earnings/payslip",{params:{month:e,year:o}})).data,a=n.employee,i=n.company||{},c=n.breakdown,m=n.earnings,r=p=>Number(p||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}),x=a.joiningDate?new Date(a.joiningDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—",l={coName:h(i.name)||"Company",coAddr:h(i.address),coPhone:h(i.phone),coWebsite:h(i.website),empName:h(a.name),empId:h(a.employeeId)||"—",empDesig:h(a.designation)||"—",empDept:h(a.department)||"—",bankName:h(a.bankDetails?.bankName)||"—",bankAcc:h(a.bankDetails?.accountNumber)||"—",bankPan:h(a.bankDetails?.pan)||"—"},v=i.logoUrl?`${M}${i.logoUrl}`:"",k=v?`<img src="${v}" style="max-height:50px;max-width:160px;object-fit:contain;" crossorigin="anonymous" />`:"",f=`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payslip - ${N[n.month]} ${n.year}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:40px 50px;max-width:800px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1a5276}
  .header-left{display:flex;align-items:center;gap:16px}
  .company-info h1{font-size:20px;font-weight:700;color:#1a5276;margin-bottom:2px}
  .company-info p{font-size:10px;color:#666;line-height:1.5}
  .header-right{text-align:right}
  .slip-title{font-size:18px;font-weight:700;color:#1a5276;text-transform:uppercase;letter-spacing:1px}
  .slip-period{font-size:12px;color:#555;margin-top:4px}
  .section{margin-top:20px}
  .section-title{font-size:11px;font-weight:700;color:#fff;background:#1a5276;padding:6px 12px;text-transform:uppercase;letter-spacing:0.5px}
  .info-table{width:100%;border-collapse:collapse}
  .info-table td{padding:7px 12px;font-size:11px;border-bottom:1px solid #eee}
  .info-table .lbl{color:#888;width:140px;font-weight:500}
  .info-table .val{color:#1a1a1a;font-weight:600}
  .earn-table{width:100%;border-collapse:collapse;margin-top:0}
  .earn-table th{background:#f7f9fc;color:#1a5276;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:8px 12px;border-bottom:2px solid #1a5276;text-align:left}
  .earn-table th:last-child{text-align:right}
  .earn-table td{padding:8px 12px;font-size:11px;border-bottom:1px solid #eee}
  .earn-table td:last-child{text-align:right;font-weight:600}
  .earn-table .total-row{background:#f7f9fc;font-weight:700}
  .earn-table .total-row td{border-top:2px solid #1a5276;border-bottom:2px solid #1a5276}
  .net-box{background:#1a5276;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:0}
  .net-box .net-label{font-size:13px;font-weight:600}
  .net-box .net-amount{font-size:20px;font-weight:700;letter-spacing:0.5px}
  .words{font-size:10px;color:#555;padding:8px 12px;background:#f9f9f9;border:1px solid #eee;margin-top:10px;font-style:italic}
  .footer{margin-top:30px;padding-top:15px;border-top:1px solid #ddd;text-align:center}
  .footer-left{font-size:9px;color:#aaa;line-height:1.6}
  .two-col{display:flex;gap:0}
  .two-col > div{flex:1}
  @media print{body{padding:20px 30px}}
</style></head><body>

<!-- Header -->
<div class="header">
  <div class="header-left">
    ${k}
    <div class="company-info">
      <h1>${l.coName}</h1>
      ${l.coAddr?`<p>${l.coAddr}</p>`:""}
      ${l.coPhone?`<p>Phone: ${l.coPhone}</p>`:""}
      ${l.coWebsite?`<p>${l.coWebsite}</p>`:""}
    </div>
  </div>
  <div class="header-right">
    <div class="slip-title">Payslip</div>
    <div class="slip-period">${N[n.month]} ${n.year}</div>
  </div>
</div>

<!-- Employee Details -->
<div class="section">
  <div class="section-title">Employee Details</div>
  <div class="two-col">
    <div>
      <table class="info-table">
        <tr><td class="lbl">Employee Name</td><td class="val">${l.empName}</td></tr>
        <tr><td class="lbl">Employee ID</td><td class="val">${l.empId}</td></tr>
        <tr><td class="lbl">Designation</td><td class="val">${l.empDesig}</td></tr>
        <tr><td class="lbl">Department</td><td class="val">${l.empDept}</td></tr>
        <tr><td class="lbl">Date of Joining</td><td class="val">${x}</td></tr>
      </table>
    </div>
    <div>
      <table class="info-table">
        <tr><td class="lbl">Bank Name</td><td class="val">${l.bankName}</td></tr>
        <tr><td class="lbl">Bank A/c No.</td><td class="val">${l.bankAcc}</td></tr>
        <tr><td class="lbl">PAN No.</td><td class="val">${l.bankPan}</td></tr>
        <tr><td class="lbl">Pay Type</td><td class="val">${a.payType==="monthly"?"Monthly":"Daily"}</td></tr>
        <tr><td class="lbl">Working Days</td><td class="val">${c.totalWorkingDays} of ${c.totalWorkingDaysInMonth}${c.paidLeave?` (${c.paidLeave} paid leave)`:""}</td></tr>
      </table>
    </div>
  </div>
</div>

<!-- Earnings & Deductions -->
<div class="section">
  <div class="section-title">Earnings & Deductions</div>
  <table class="earn-table">
    <thead><tr><th style="width:50%">Earnings</th><th style="width:50%;text-align:right">Amount (₹)</th></tr></thead>
    <tbody>
      <tr><td>Consultancy Fees</td><td>₹ ${r(m.grossAmount)}</td></tr>
      <tr class="total-row"><td>Total Earnings (A)</td><td>₹ ${r(m.grossAmount)}</td></tr>
    </tbody>
  </table>
  <table class="earn-table" style="margin-top:10px">
    <thead><tr><th style="width:50%">Deductions</th><th style="width:50%;text-align:right">Amount (₹)</th></tr></thead>
    <tbody>
      <tr><td>TDS (${m.tdsRate*100}%)</td><td>₹ ${r(m.tdsAmount)}</td></tr>
      <tr class="total-row"><td>Total Deductions (B)</td><td>₹ ${r(m.tdsAmount)}</td></tr>
    </tbody>
  </table>
</div>

<!-- Net Pay -->
<div class="net-box">
  <span class="net-label">Net Pay (A − B)</span>
  <span class="net-amount">₹ ${r(m.netAmount)}</span>
</div>
<div class="words"><strong>Amount in Words:</strong> ${F(m.netAmount)}</div>

<!-- Footer -->
<div class="footer">
  <div class="footer-left">
    This is a system-generated payslip and does not require a physical signature.<br/>
    Generated on ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
  </div>
</div>

</body></html>`,w=new Blob([f],{type:"text/html"}),y=URL.createObjectURL(w),s=window.open(y,"_blank","noopener");s&&(s.onload=()=>{s.print()}),u("Payslip opened for printing")}function $({data:e,title:o,onDownload:u,downloading:d}){return t.jsxs("div",{className:"card p-5",children:[t.jsx("h3",{className:"text-sm font-medium text-dark-400 mb-3",children:o}),e?t.jsxs(t.Fragment,{children:[t.jsxs("p",{className:"text-lg font-semibold text-dark-300",children:["Gross: ₹",(e.earnings?.grossAmount||0).toLocaleString()]}),t.jsxs("p",{className:"text-sm text-red-400 mt-1",children:["TDS (2%): -₹",(e.earnings?.tdsAmount||0).toLocaleString()]}),t.jsxs("p",{className:"text-2xl font-bold text-emerald-400 mt-1",children:["Net: ₹",(e.earnings?.netAmount||e.earnings?.grossAmount||0).toLocaleString()]}),t.jsx("p",{className:"text-xs text-dark-500 mt-1",children:e.earnings?.calculation}),t.jsxs("div",{className:"mt-4 space-y-1.5",children:[t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Total Hours"}),t.jsxs("span",{className:"font-medium text-white",children:[e.breakdown?.totalHours||0,"h"]})]}),t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Working Days"}),t.jsx("span",{className:"font-medium text-white",children:e.breakdown?.totalWorkingDays||0})]}),t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Leaves"}),t.jsx("span",{className:"font-medium text-white",children:e.breakdown?.totalLeaves||0})]}),t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Holidays"}),t.jsx("span",{className:"font-medium text-white",children:e.breakdown?.totalHolidays||0})]})]}),e.timesheetStatus&&t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsx("span",{className:`px-2 py-1 rounded text-xs font-medium inline-block ${e.timesheetStatus==="approved"?"bg-emerald-500/10 text-emerald-400":e.timesheetStatus==="submitted"?"bg-amber-500/10 text-amber-400":"bg-dark-700 text-dark-400"}`,children:e.timesheetStatus}),e.month&&e.year&&e.timesheetStatus==="approved"&&t.jsxs("button",{onClick:()=>u(e.month,e.year),disabled:d===`${e.month}-${e.year}`,className:"flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50",children:[d===`${e.month}-${e.year}`?t.jsx(D,{size:14,className:"animate-spin"}):t.jsx(A,{size:14}),"Payslip"]})]}),e.projectBreakdowns?.length>1&&t.jsxs("div",{className:"mt-4 border-t border-dark-800 pt-3",children:[t.jsx("p",{className:"text-xs font-medium text-dark-400 mb-2",children:"Per Project"}),e.projectBreakdowns.map((n,a)=>t.jsxs("div",{className:"flex justify-between text-xs py-1",children:[t.jsx("span",{className:"text-dark-300",children:n.project}),t.jsxs("span",{className:"font-medium text-white",children:[n.totalHours||0,"h (",n.workingDays," days)"]})]},a))]})]}):t.jsx("p",{className:"text-dark-500",children:"No data available"})]})}function B(){const{timesheetUser:e}=S(),{orgPath:o}=P(),{showToast:u}=T();if(e?.employmentType==="confirmed"&&e?.billable)return t.jsx(L,{to:o("/timesheet/dashboard"),replace:!0});const[n,a]=b.useState(null),[i,c]=b.useState(null),[m,r]=b.useState([]),[x,l]=b.useState(null),[v,k]=b.useState(!0),[f,w]=b.useState(null);b.useEffect(()=>{const s=new AbortController,p={signal:s.signal};return Promise.all([j.get("/earnings/current",p).then(g=>a(g.data)).catch(()=>{}),j.get("/earnings/previous",p).then(g=>c(g.data)).catch(()=>{}),j.get("/earnings/history",p).then(g=>r(g.data)).catch(()=>{}),j.get("/earnings/disbursement-info",p).then(g=>l(g.data)).catch(()=>{})]).finally(()=>k(!1)),()=>s.abort()},[]);const y=async(s,p)=>{w(`${s}-${p}`),await W(s,p,u),w(null)};return v?t.jsx("div",{className:"flex justify-center py-20",children:t.jsx(D,{className:"w-8 h-8 animate-spin text-dark-400"})}):t.jsxs("div",{className:"p-6 space-y-6",children:[t.jsxs("div",{children:[t.jsx("h1",{className:"text-2xl font-bold text-white",children:"My Earnings"}),t.jsx("p",{className:"text-dark-400 text-sm",children:"Track your income and payment schedule"})]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[t.jsx($,{data:n,title:n?`${N[n.month]} ${n.year} (Current)`:"Current Month",onDownload:y,downloading:f}),t.jsx($,{data:i,title:i?`${N[i.month]} ${i.year} (Previous)`:"Previous Month",onDownload:y,downloading:f})]}),t.jsxs("div",{className:"card p-5",children:[t.jsxs("div",{className:"flex items-center gap-2 mb-4",children:[t.jsx(E,{size:18,className:"text-blue-400"}),t.jsx("h3",{className:"font-semibold text-white",children:"Salary Disbursement Schedule"})]}),x?.nextDisbursementDate?t.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center gap-4",children:[t.jsxs("div",{className:"flex-1",children:[t.jsx("p",{className:"text-lg font-bold text-white",children:new Date(x.nextDisbursementDate).toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}),x.countdown&&t.jsx("p",{className:"text-blue-400 font-medium mt-1",children:x.countdown}),x.note&&t.jsx("p",{className:"text-sm text-dark-400 mt-1",children:x.note})]}),t.jsxs("div",{className:"text-right",children:[t.jsx("p",{className:"text-sm text-dark-400",children:"Estimated Net Amount"}),t.jsxs("p",{className:"text-xl font-bold text-emerald-400",children:["₹",(x.netEstimate||x.estimatedAmount||0).toLocaleString()]}),x.tdsAmount>0&&t.jsxs("p",{className:"text-xs text-dark-500 mt-0.5",children:["After 2% TDS (₹",x.tdsAmount.toLocaleString(),")"]})]})]}):t.jsx("p",{className:"text-dark-500",children:"Disbursement schedule not configured"})]}),t.jsxs("div",{className:"card overflow-hidden",children:[t.jsxs("div",{className:"p-4 border-b border-dark-800 flex items-center justify-between",children:[t.jsx("h3",{className:"font-semibold text-white",children:"Earnings History"}),t.jsxs("div",{className:"flex items-center gap-1 text-xs text-dark-500",children:[t.jsx(z,{size:12}),"Click download icon for payslip"]})]}),t.jsx("div",{className:"overflow-x-auto",children:t.jsxs("table",{className:"w-full text-sm",children:[t.jsx("thead",{className:"bg-dark-800",children:t.jsxs("tr",{children:[t.jsx("th",{className:"text-left px-4 py-3 font-medium text-dark-400",children:"Month"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"Days"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"Gross"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"TDS (2%)"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"Net Pay"}),t.jsx("th",{className:"text-center px-4 py-3 font-medium text-dark-400",children:"Status"}),t.jsx("th",{className:"text-center px-4 py-3 font-medium text-dark-400",children:"Payment"}),t.jsx("th",{className:"text-center px-4 py-3 font-medium text-dark-400"})]})}),t.jsx("tbody",{className:"divide-y divide-dark-800",children:m.map((s,p)=>t.jsxs("tr",{className:s.paymentStatus==="paid"?"bg-emerald-500/5":s.status==="approved"?"bg-amber-500/5":"",children:[t.jsxs("td",{className:"px-4 py-3 font-medium text-white",children:[N[s.month]," ",s.year]}),t.jsx("td",{className:"px-4 py-3 text-right text-dark-300",children:s.totalWorkingDays}),t.jsxs("td",{className:"px-4 py-3 text-right text-dark-300",children:["₹",(s.grossAmount||0).toLocaleString()]}),t.jsxs("td",{className:"px-4 py-3 text-right text-red-400",children:["-₹",(s.tdsAmount||0).toLocaleString()]}),t.jsxs("td",{className:"px-4 py-3 text-right font-medium text-emerald-400",children:["₹",(s.netAmount||s.grossAmount||0).toLocaleString()]}),t.jsx("td",{className:"px-4 py-3 text-center",children:t.jsx("span",{className:`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${s.status==="approved"?"bg-emerald-500/10 text-emerald-400":s.status==="submitted"?"bg-amber-500/10 text-amber-400":s.status==="rejected"?"bg-red-500/10 text-red-400":s.status==="draft"?"bg-blue-500/10 text-blue-400":"bg-dark-700 text-dark-500"}`,children:s.status})}),t.jsx("td",{className:"px-4 py-3 text-center",children:t.jsx("span",{className:`text-xs font-medium ${s.paymentStatus==="paid"?"text-emerald-400":"text-dark-500"}`,children:s.paymentStatus==="paid"?"Paid":"Pending"})}),t.jsx("td",{className:"px-4 py-3 text-center",children:s.grossAmount>0&&s.status==="approved"?t.jsx("button",{onClick:()=>y(s.month,s.year),disabled:f===`${s.month}-${s.year}`,className:"text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50",title:"Download Payslip",children:f===`${s.month}-${s.year}`?t.jsx(D,{size:14,className:"animate-spin"}):t.jsx(A,{size:14})}):s.grossAmount>0?t.jsx("span",{className:"text-dark-600 text-xs",title:"Payslip available after approval",children:"—"}):null})]},p))})]})})]})]})}export{B as default};
