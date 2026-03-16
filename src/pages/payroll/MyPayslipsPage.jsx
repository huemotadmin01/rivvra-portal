import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getMyPayslips, downloadMyPayslipPdf } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { FileText, ChevronDown, ChevronUp, Download } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MyPayslipsPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getMyPayslips(orgSlug);
        setPayslips(res.payslips || []);
      } catch (err) {
        if (err.response?.status !== 404) showToast('Failed to load payslips', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [orgSlug]);

  const handleDownloadPdf = async (p) => {
    try {
      const blob = await downloadMyPayslipPdf(orgSlug, p.runId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Payslip_${MONTH_FULL[p.month]}_${p.year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Payslip downloaded');
    } catch {
      showToast('Download failed', 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">My Payslips</h1>
        <p className="text-sm text-dark-400 mt-1">Monthly payslip history</p>
      </div>

      {payslips.length === 0 ? (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-12 text-center">
          <FileText size={32} className="text-dark-500 mx-auto mb-3" />
          <p className="text-dark-400">No payslips available yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payslips.map((p, idx) => {
            const isExpanded = expanded === idx;
            const statusColor = p.status === 'paid' ? 'text-green-400 bg-green-500/10' :
              p.status === 'finalized' ? 'text-blue-400 bg-blue-500/10' : 'text-amber-400 bg-amber-500/10';

            return (
              <div key={idx} className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-750 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <div className="text-white font-medium text-sm">{MONTH_NAMES[p.month]} {p.year}</div>
                      <div className="text-xs text-dark-400">
                        {p.daysWorked}/{p.totalWorkingDays} days
                        {p.lopDays > 0 && <span className="text-red-400 ml-1">(LOP: {p.lopDays})</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadPdf(p); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
                      title="Download PDF"
                    >
                      <Download size={12} /> PDF
                    </button>
                    <div className="text-right">
                      <div className="text-xs text-dark-400">Net Pay</div>
                      <div className="text-white font-bold">₹{fmt(p.netSalary)}</div>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-dark-700 px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Earnings */}
                      <div>
                        <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Earnings</h3>
                        <table className="w-full text-sm">
                          <tbody>
                            {(p.components || []).map((c, ci) => (
                              <tr key={ci} className="border-b border-dark-700/30 last:border-0">
                                <td className="py-1.5 text-dark-300">{c.name}</td>
                                <td className="py-1.5 text-right text-white">₹{fmt(c.proratedAmount || c.amount)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-dark-600">
                              <td className="py-1.5 text-white font-semibold">Gross</td>
                              <td className="py-1.5 text-right text-white font-bold">₹{fmt(p.grossSalary)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Deductions */}
                      <div>
                        <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Deductions</h3>
                        <table className="w-full text-sm">
                          <tbody>
                            {p.employeePf > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">EPF</td>
                                <td className="py-1.5 text-right text-red-400">₹{fmt(p.employeePf)}</td>
                              </tr>
                            )}
                            {p.employeeEsi > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">ESI</td>
                                <td className="py-1.5 text-right text-red-400">₹{fmt(p.employeeEsi)}</td>
                              </tr>
                            )}
                            {p.professionalTax > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">Professional Tax</td>
                                <td className="py-1.5 text-right text-red-400">₹{fmt(p.professionalTax)}</td>
                              </tr>
                            )}
                            {p.tds > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">TDS</td>
                                <td className="py-1.5 text-right text-red-400">₹{fmt(p.tds)}</td>
                              </tr>
                            )}
                            <tr className="border-t border-dark-600">
                              <td className="py-1.5 text-white font-semibold">Total</td>
                              <td className="py-1.5 text-right text-red-400 font-bold">₹{fmt(p.totalDeductions)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Summary */}
                      <div>
                        <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Summary</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-300">Gross Salary</span>
                            <span className="text-white">₹{fmt(p.grossSalary)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-300">Total Deductions</span>
                            <span className="text-red-400">-₹{fmt(p.totalDeductions)}</span>
                          </div>
                          <div className="border-t border-dark-600 pt-3 flex justify-between">
                            <span className="text-white font-semibold">Net Pay</span>
                            <span className="text-green-400 font-bold text-lg">₹{fmt(p.netSalary)}</span>
                          </div>
                          {(p.employerPf > 0 || p.employerEsi > 0) && (
                            <div className="border-t border-dark-700 pt-3 space-y-1">
                              <div className="text-xs text-dark-500 mb-1">Employer Contributions</div>
                              {p.employerPf > 0 && <div className="flex justify-between text-xs"><span className="text-dark-400">EPF</span><span className="text-dark-300">₹{fmt(p.employerPf)}</span></div>}
                              {p.employerEsi > 0 && <div className="flex justify-between text-xs"><span className="text-dark-400">ESI</span><span className="text-dark-300">₹{fmt(p.employerEsi)}</span></div>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
