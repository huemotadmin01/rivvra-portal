import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getMyPayslips, downloadMyPayslipPdf, downloadImportedPayslipPdf, bulkDownloadMyPayslips } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { FileText, ChevronDown, ChevronUp, Download, CheckSquare, Square, Package } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MyPayslipsPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [downloading, setDownloading] = useState(false);

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

  const payslipKey = (p) => `${p.year}-${p.month}`;

  const toggleSelect = (p, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      const key = payslipKey(p);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === payslips.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(payslips.map(payslipKey)));
    }
  };

  const handleDownloadPdf = async (p, e) => {
    if (e) e.stopPropagation();
    try {
      const isImported = p.status === 'imported';
      const blob = isImported
        ? await downloadImportedPayslipPdf(orgSlug, p.year, p.month)
        : await downloadMyPayslipPdf(orgSlug, p.runId);
      triggerDownload(blob, `Payslip_${MONTH_FULL[p.month]}_${p.year}.pdf`);
      showToast('Payslip downloaded');
    } catch {
      showToast('Download failed', 'error');
    }
  };

  const handleBulkDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const selections = payslips
        .filter(p => selected.has(payslipKey(p)))
        .map(p => ({
          year: p.year,
          month: p.month,
          type: p.status === 'imported' ? 'imported' : 'run',
          runId: p.runId || undefined,
        }));
      const blob = await bulkDownloadMyPayslips(orgSlug, selections);
      triggerDownload(blob, 'My_Payslips.zip');
      showToast(`${selected.size} payslips downloaded`);
      setSelected(new Set());
    } catch {
      showToast('Bulk download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  const allSelected = payslips.length > 0 && selected.size === payslips.length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">My Payslips</h1>
          <p className="text-sm text-dark-400 mt-1">Monthly payslip history</p>
        </div>
        {payslips.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-300 hover:text-white transition-colors"
            >
              {allSelected ? <CheckSquare size={14} className="text-rivvra-400" /> : <Square size={14} />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {selected.size > 0 && (
              <button
                onClick={handleBulkDownload}
                disabled={downloading}
                className="flex items-center gap-1.5 px-4 py-2 bg-rivvra-600 hover:bg-rivvra-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Package size={14} />
                {downloading ? 'Downloading...' : `Download ${selected.size} as ZIP`}
              </button>
            )}
          </div>
        )}
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
            const isImported = p.status === 'imported';
            const isSelected = selected.has(payslipKey(p));
            const statusColor = p.status === 'paid' ? 'text-green-400 bg-green-500/10' :
              p.status === 'finalized' ? 'text-blue-400 bg-blue-500/10' :
              isImported ? 'text-purple-400 bg-purple-500/10' : 'text-amber-400 bg-amber-500/10';

            return (
              <div key={idx} className={`bg-dark-800 rounded-xl border overflow-hidden transition-colors ${isSelected ? 'border-rivvra-500/50' : 'border-dark-700'}`}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      onClick={(e) => toggleSelect(p, e)}
                      className="flex-shrink-0 cursor-pointer"
                    >
                      {isSelected
                        ? <CheckSquare size={18} className="text-rivvra-400" />
                        : <Square size={18} className="text-dark-500 hover:text-dark-300" />
                      }
                    </div>
                    <div className="text-left">
                      <div className="text-white font-medium text-sm">{MONTH_NAMES[p.month]} {p.year}</div>
                      <div className="text-xs text-dark-400">
                        {p.daysWorked}/{p.totalWorkingDays} days
                        {p.lopDays > 0 && <span className="text-red-400 ml-1">(LOP: {p.lopDays})</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                      {isImported ? (p.source === 'greythr' ? 'GreytHR' : 'Imported') : p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => handleDownloadPdf(p, e)}
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
                            {(p.components || []).length > 0 ? (p.components || []).map((c, ci) => (
                              <tr key={ci} className="border-b border-dark-700/30 last:border-0">
                                <td className="py-1.5 text-dark-300">{c.name}</td>
                                <td className="py-1.5 text-right text-white">₹{fmt(c.proratedAmount || c.amount)}</td>
                              </tr>
                            )) : p.grossSalary > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">{p.payrollMode === 'consultant_flat_tds' ? 'Consultancy Fees' : 'Gross Salary'}</td>
                                <td className="py-1.5 text-right text-white">₹{fmt(p.grossSalary)}</td>
                              </tr>
                            )}
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
                            {p.employerPf > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">Employer PF</td>
                                <td className="py-1.5 text-right text-red-400">₹{fmt(p.employerPf)}</td>
                              </tr>
                            )}
                            {p.employerEsi > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">Employer ESI</td>
                                <td className="py-1.5 text-right text-red-400">₹{fmt(p.employerEsi)}</td>
                              </tr>
                            )}
                            {p.tds > 0 && (
                              <tr className="border-b border-dark-700/30">
                                <td className="py-1.5 text-dark-300">{p.payrollMode === 'consultant_flat_tds' ? 'TDS (2%)' : 'TDS'}</td>
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
