import{m as A,r as g,a9 as y,j as t,L as w,t as S,F as P,D,ad as T}from"./index-BKGvCJGe.js";import{p as L}from"./purify.es-B2vaJoXh.js";const p=e=>L.sanitize(String(e??""),{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}),j=["","January","February","March","April","May","June","July","August","September","October","November","December"];function E(e){if(e===0)return"Zero";const o=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],h=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],r=Math.floor(e),i=Math.round((e-r)*100);let a="";r>=1e7&&(a+=o[Math.floor(r/1e7)]+" Crore ");const d=Math.floor(r%1e7/1e5);d>0&&(a+=(d<20?o[d]:h[Math.floor(d/10)]+" "+o[d%10])+" Lakh ");const n=Math.floor(r%1e5/1e3);n>0&&(a+=(n<20?o[n]:h[Math.floor(n/10)]+" "+o[n%10])+" Thousand ");const m=Math.floor(r%1e3/100);m>0&&(a+=o[m]+" Hundred ");const c=r%100;return c>0&&(a&&(a+="and "),a+=c<20?o[c]:h[Math.floor(c/10)]+" "+o[c%10]),a=a.trim()+" Rupees",i>0&&(a+=" and "+(i<20?o[i]:h[Math.floor(i/10)]+" "+o[i%10]).trim()+" Paise"),a+" Only"}async function z(e,o,h){const i=(await y.get("/earnings/payslip",{params:{month:e,year:o}})).data,a=i.employee,d=i.company||{},n=i.breakdown,m=i.earnings,c=$=>Number($||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}),N=a.joiningDate?new Date(a.joiningDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—",l={coName:p(d.name)||"Company",coAddr:p(d.address),coPhone:p(d.phone),coWebsite:p(d.website),empName:p(a.name),empId:p(a.employeeId)||"—",empDesig:p(a.designation)||"—",empDept:p(a.department)||"—",bankName:p(a.bankDetails?.bankName)||"—",bankAcc:p(a.bankDetails?.accountNumber)||"—",bankPan:p(a.bankDetails?.pan)||"—"},b=d.logoUrl?`${T}${d.logoUrl}`:"",f=b?`<img src="${b}" style="max-height:50px;max-width:160px;object-fit:contain;" crossorigin="anonymous" />`:"",s=`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payslip - ${j[i.month]} ${i.year}</title>
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
    ${f}
    <div class="company-info">
      <h1>${l.coName}</h1>
      ${l.coAddr?`<p>${l.coAddr}</p>`:""}
      ${l.coPhone?`<p>Phone: ${l.coPhone}</p>`:""}
      ${l.coWebsite?`<p>${l.coWebsite}</p>`:""}
    </div>
  </div>
  <div class="header-right">
    <div class="slip-title">Payslip</div>
    <div class="slip-period">${j[i.month]} ${i.year}</div>
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
        <tr><td class="lbl">Date of Joining</td><td class="val">${N}</td></tr>
      </table>
    </div>
    <div>
      <table class="info-table">
        <tr><td class="lbl">Bank Name</td><td class="val">${l.bankName}</td></tr>
        <tr><td class="lbl">Bank A/c No.</td><td class="val">${l.bankAcc}</td></tr>
        <tr><td class="lbl">PAN No.</td><td class="val">${l.bankPan}</td></tr>
        <tr><td class="lbl">Pay Type</td><td class="val">${a.payType==="monthly"?"Monthly":"Daily"}</td></tr>
        <tr><td class="lbl">Working Days</td><td class="val">${n.totalWorkingDays} of ${n.totalWorkingDaysInMonth}${n.paidLeave?` (${n.paidLeave} paid leave)`:""}</td></tr>
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
      <tr><td>Consultancy Fees</td><td>₹ ${c(m.grossAmount)}</td></tr>
      <tr class="total-row"><td>Total Earnings (A)</td><td>₹ ${c(m.grossAmount)}</td></tr>
    </tbody>
  </table>
  <table class="earn-table" style="margin-top:10px">
    <thead><tr><th style="width:50%">Deductions</th><th style="width:50%;text-align:right">Amount (₹)</th></tr></thead>
    <tbody>
      <tr><td>TDS (${m.tdsRate*100}%)</td><td>₹ ${c(m.tdsAmount)}</td></tr>
      <tr class="total-row"><td>Total Deductions (B)</td><td>₹ ${c(m.tdsAmount)}</td></tr>
    </tbody>
  </table>
</div>

<!-- Net Pay -->
<div class="net-box">
  <span class="net-label">Net Pay (A − B)</span>
  <span class="net-amount">₹ ${c(m.netAmount)}</span>
</div>
<div class="words"><strong>Amount in Words:</strong> ${E(m.netAmount)}</div>

<!-- Footer -->
<div class="footer">
  <div class="footer-left">
    This is a system-generated payslip and does not require a physical signature.<br/>
    Generated on ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
  </div>
</div>

</body></html>`,x=new Blob([s],{type:"text/html"}),u=URL.createObjectURL(x),v=window.open(u,"_blank","noopener");v&&(v.onload=()=>{v.print()}),h("Payslip opened for printing")}function k({data:e,title:o,onDownload:h,downloading:r}){return t.jsxs("div",{className:"card p-5",children:[t.jsx("h3",{className:"text-sm font-medium text-dark-400 mb-3",children:o}),e?t.jsxs(t.Fragment,{children:[t.jsxs("p",{className:"text-lg font-semibold text-dark-300",children:["Gross: ₹",(e.earnings?.grossAmount||0).toLocaleString()]}),t.jsxs("p",{className:"text-sm text-red-400 mt-1",children:["TDS (2%): -₹",(e.earnings?.tdsAmount||0).toLocaleString()]}),t.jsxs("p",{className:"text-2xl font-bold text-emerald-400 mt-1",children:["Net: ₹",(e.earnings?.netAmount||e.earnings?.grossAmount||0).toLocaleString()]}),t.jsx("p",{className:"text-xs text-dark-500 mt-1",children:e.earnings?.calculation}),t.jsxs("div",{className:"mt-4 space-y-1.5",children:[t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Total Hours"}),t.jsxs("span",{className:"font-medium text-white",children:[e.breakdown?.totalHours||0,"h"]})]}),t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Working Days"}),t.jsx("span",{className:"font-medium text-white",children:e.breakdown?.totalWorkingDays||0})]}),t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Leaves"}),t.jsx("span",{className:"font-medium text-white",children:e.breakdown?.totalLeaves||0})]}),t.jsxs("div",{className:"flex justify-between text-sm",children:[t.jsx("span",{className:"text-dark-400",children:"Holidays"}),t.jsx("span",{className:"font-medium text-white",children:e.breakdown?.totalHolidays||0})]})]}),e.timesheetStatus&&t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsx("span",{className:`px-2 py-1 rounded text-xs font-medium inline-block ${e.timesheetStatus==="approved"?"bg-emerald-500/10 text-emerald-400":e.timesheetStatus==="submitted"?"bg-amber-500/10 text-amber-400":"bg-dark-700 text-dark-400"}`,children:e.timesheetStatus}),e.month&&e.year&&e.timesheetStatus==="approved"&&t.jsxs("button",{onClick:()=>h(e.month,e.year),disabled:r===`${e.month}-${e.year}`,className:"flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50",children:[r===`${e.month}-${e.year}`?t.jsx(w,{size:14,className:"animate-spin"}):t.jsx(D,{size:14}),"Payslip"]})]}),e.projectBreakdowns?.length>1&&t.jsxs("div",{className:"mt-4 border-t border-dark-800 pt-3",children:[t.jsx("p",{className:"text-xs font-medium text-dark-400 mb-2",children:"Per Project"}),e.projectBreakdowns.map((i,a)=>t.jsxs("div",{className:"flex justify-between text-xs py-1",children:[t.jsx("span",{className:"text-dark-300",children:i.project}),t.jsxs("span",{className:"font-medium text-white",children:[i.totalHours||0,"h (",i.workingDays," days)"]})]},a))]})]}):t.jsx("p",{className:"text-dark-500",children:"No data available"})]})}function F(){const{showToast:e}=A(),[o,h]=g.useState(null),[r,i]=g.useState(null),[a,d]=g.useState([]),[n,m]=g.useState(null),[c,N]=g.useState(!0),[l,b]=g.useState(null);g.useEffect(()=>{const s=new AbortController,x={signal:s.signal};return Promise.all([y.get("/earnings/current",x).then(u=>h(u.data)).catch(()=>{}),y.get("/earnings/previous",x).then(u=>i(u.data)).catch(()=>{}),y.get("/earnings/history",x).then(u=>d(u.data)).catch(()=>{}),y.get("/earnings/disbursement-info",x).then(u=>m(u.data)).catch(()=>{})]).finally(()=>N(!1)),()=>s.abort()},[]);const f=async(s,x)=>{b(`${s}-${x}`),await z(s,x,e),b(null)};return c?t.jsx("div",{className:"flex justify-center py-20",children:t.jsx(w,{className:"w-8 h-8 animate-spin text-dark-400"})}):t.jsxs("div",{className:"p-6 space-y-6",children:[t.jsxs("div",{children:[t.jsx("h1",{className:"text-2xl font-bold text-white",children:"My Earnings"}),t.jsx("p",{className:"text-dark-400 text-sm",children:"Track your income and payment schedule"})]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[t.jsx(k,{data:o,title:o?`${j[o.month]} ${o.year} (Current)`:"Current Month",onDownload:f,downloading:l}),t.jsx(k,{data:r,title:r?`${j[r.month]} ${r.year} (Previous)`:"Previous Month",onDownload:f,downloading:l})]}),t.jsxs("div",{className:"card p-5",children:[t.jsxs("div",{className:"flex items-center gap-2 mb-4",children:[t.jsx(S,{size:18,className:"text-blue-400"}),t.jsx("h3",{className:"font-semibold text-white",children:"Salary Disbursement Schedule"})]}),n?.nextDisbursementDate?t.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center gap-4",children:[t.jsxs("div",{className:"flex-1",children:[t.jsx("p",{className:"text-lg font-bold text-white",children:new Date(n.nextDisbursementDate).toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}),n.countdown&&t.jsx("p",{className:"text-blue-400 font-medium mt-1",children:n.countdown}),n.note&&t.jsx("p",{className:"text-sm text-dark-400 mt-1",children:n.note})]}),t.jsxs("div",{className:"text-right",children:[t.jsx("p",{className:"text-sm text-dark-400",children:"Estimated Net Amount"}),t.jsxs("p",{className:"text-xl font-bold text-emerald-400",children:["₹",(n.netEstimate||n.estimatedAmount||0).toLocaleString()]}),n.tdsAmount>0&&t.jsxs("p",{className:"text-xs text-dark-500 mt-0.5",children:["After 2% TDS (₹",n.tdsAmount.toLocaleString(),")"]})]})]}):t.jsx("p",{className:"text-dark-500",children:"Disbursement schedule not configured"})]}),t.jsxs("div",{className:"card overflow-hidden",children:[t.jsxs("div",{className:"p-4 border-b border-dark-800 flex items-center justify-between",children:[t.jsx("h3",{className:"font-semibold text-white",children:"Earnings History"}),t.jsxs("div",{className:"flex items-center gap-1 text-xs text-dark-500",children:[t.jsx(P,{size:12}),"Click download icon for payslip"]})]}),t.jsx("div",{className:"overflow-x-auto",children:t.jsxs("table",{className:"w-full text-sm",children:[t.jsx("thead",{className:"bg-dark-800",children:t.jsxs("tr",{children:[t.jsx("th",{className:"text-left px-4 py-3 font-medium text-dark-400",children:"Month"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"Days"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"Gross"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"TDS (2%)"}),t.jsx("th",{className:"text-right px-4 py-3 font-medium text-dark-400",children:"Net Pay"}),t.jsx("th",{className:"text-center px-4 py-3 font-medium text-dark-400",children:"Status"}),t.jsx("th",{className:"text-center px-4 py-3 font-medium text-dark-400",children:"Payment"}),t.jsx("th",{className:"text-center px-4 py-3 font-medium text-dark-400"})]})}),t.jsx("tbody",{className:"divide-y divide-dark-800",children:a.map((s,x)=>t.jsxs("tr",{className:s.paymentStatus==="paid"?"bg-emerald-500/5":s.status==="approved"?"bg-amber-500/5":"",children:[t.jsxs("td",{className:"px-4 py-3 font-medium text-white",children:[j[s.month]," ",s.year]}),t.jsx("td",{className:"px-4 py-3 text-right text-dark-300",children:s.totalWorkingDays}),t.jsxs("td",{className:"px-4 py-3 text-right text-dark-300",children:["₹",(s.grossAmount||0).toLocaleString()]}),t.jsxs("td",{className:"px-4 py-3 text-right text-red-400",children:["-₹",(s.tdsAmount||0).toLocaleString()]}),t.jsxs("td",{className:"px-4 py-3 text-right font-medium text-emerald-400",children:["₹",(s.netAmount||s.grossAmount||0).toLocaleString()]}),t.jsx("td",{className:"px-4 py-3 text-center",children:t.jsx("span",{className:`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${s.status==="approved"?"bg-emerald-500/10 text-emerald-400":s.status==="submitted"?"bg-amber-500/10 text-amber-400":s.status==="rejected"?"bg-red-500/10 text-red-400":s.status==="draft"?"bg-blue-500/10 text-blue-400":"bg-dark-700 text-dark-500"}`,children:s.status})}),t.jsx("td",{className:"px-4 py-3 text-center",children:t.jsx("span",{className:`text-xs font-medium ${s.paymentStatus==="paid"?"text-emerald-400":"text-dark-500"}`,children:s.paymentStatus==="paid"?"Paid":"Pending"})}),t.jsx("td",{className:"px-4 py-3 text-center",children:s.grossAmount>0&&s.status==="approved"?t.jsx("button",{onClick:()=>f(s.month,s.year),disabled:l===`${s.month}-${s.year}`,className:"text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50",title:"Download Payslip",children:l===`${s.month}-${s.year}`?t.jsx(w,{size:14,className:"animate-spin"}):t.jsx(D,{size:14})}):s.grossAmount>0?t.jsx("span",{className:"text-dark-600 text-xs",title:"Payslip available after approval",children:"—"}):null})]},x))})]})})]})]})}export{F as default};
