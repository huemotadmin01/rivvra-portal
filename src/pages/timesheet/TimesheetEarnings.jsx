import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useTimesheetContext } from '../../context/TimesheetContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { generatePayslipPDF } from '../../utils/payslipPdf';
import { Clock, Loader2, Download, FileText, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Download payslip as PDF — fetches data from ESS endpoint then generates PDF */
async function downloadPayslipPDF(month, year, showToast) {
  const res = await timesheetApi.get('/earnings/payslip', { params: { month, year } });
  await generatePayslipPDF(res.data);
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
          {data.revisionData?.revisionApplied && (
            <div className="mt-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 mb-1">
                <TrendingUp size={11} />
                Pro-rated: Rate revised mid-month
              </div>
              {data.revisionData.ratePeriods?.map((p, pi) => (
                <div key={pi} className="text-xs text-dark-400">
                  Day {p.startDay}–{p.endDay}: ₹{(p.billingRate?.monthly || p.billingRate?.daily || 0).toLocaleString('en-IN')}
                  {p.periodAmount ? ` → ₹${Math.round(p.periodAmount).toLocaleString('en-IN')}` : ''}
                </div>
              ))}
            </div>
          )}
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
  const [rateHistory, setRateHistory] = useState([]);
  const [showRateHistory, setShowRateHistory] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const sig = { signal: controller.signal };
    Promise.all([
      timesheetApi.get('/earnings/current', sig).then(r => setCurrent(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/previous', sig).then(r => setPrevious(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/history', sig).then(r => setHistory(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/disbursement-info', sig).then(r => setDisbursement(r.data)).catch(() => {}),
      timesheetApi.get('/earnings/rate-history', sig).then(r => setRateHistory(r.data?.revisions || [])).catch(() => {}),
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

      {/* Rate Revision History */}
      {rateHistory.length > 0 && (
        <div className="card p-5">
          <button
            onClick={() => setShowRateHistory(prev => !prev)}
            className="flex items-center gap-2 w-full"
          >
            <TrendingUp size={18} className="text-amber-400" />
            <h3 className="font-semibold text-white flex-1 text-left">Rate Revisions</h3>
            <span className="text-xs text-dark-400 mr-1">{rateHistory.length} {rateHistory.length === 1 ? 'revision' : 'revisions'}</span>
            {showRateHistory ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
          </button>
          {showRateHistory && (
            <div className="mt-4 space-y-3 border-l-2 border-amber-500/30 pl-4 ml-2">
              {rateHistory.map((rev, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-dark-800" />
                  <div className="text-sm">
                    <span className="text-white font-medium">
                      {rev.effectiveDate ? new Date(rev.effectiveDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                    <span className="text-dark-500 mx-2">•</span>
                    <span className="text-dark-300">{rev.projectName || 'Assignment'}</span>
                  </div>
                  <div className="text-xs text-dark-400 mt-0.5">
                    {rev.previousRate?.monthly ? `₹${Number(rev.previousRate.monthly).toLocaleString('en-IN')}` : rev.previousRate?.daily ? `₹${Number(rev.previousRate.daily).toLocaleString('en-IN')}/day` : '—'}
                    <span className="mx-1.5 text-dark-600">→</span>
                    <span className="text-emerald-400 font-medium">
                      {rev.newRate?.monthly ? `₹${Number(rev.newRate.monthly).toLocaleString('en-IN')}/month` : rev.newRate?.daily ? `₹${Number(rev.newRate.daily).toLocaleString('en-IN')}/day` : '—'}
                    </span>
                  </div>
                  {rev.reason && <div className="text-xs text-dark-500 italic mt-0.5">{rev.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
