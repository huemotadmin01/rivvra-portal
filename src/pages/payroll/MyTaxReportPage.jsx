import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getMyTaxReport, getMyTaxAvailableFYs, updateMyTaxRegime } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { BarChart3, ChevronDown, ChevronUp, TrendingDown, TrendingUp, IndianRupee, Calendar, ArrowRightLeft } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCurrentFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

export default function MyTaxReportPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [fys, setFys] = useState([]);
  const [selectedFY, setSelectedFY] = useState(getCurrentFY());
  const [showDetails, setShowDetails] = useState(true);
  const [showMonthly, setShowMonthly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getMyTaxAvailableFYs(orgSlug);
        setFys(res.financialYears || []);
      } catch { /* ignore */ }
    })();
  }, [orgSlug]);

  useEffect(() => { loadReport(); }, [orgSlug, selectedFY]);

  async function loadReport() {
    setLoading(true);
    try {
      const res = await getMyTaxReport(orgSlug, selectedFY);
      setReport(res.report);
    } catch (err) {
      if (err.response?.status !== 404) showToast('Failed to load tax report', 'error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchRegime(newRegime) {
    try {
      await updateMyTaxRegime(orgSlug, newRegime);
      showToast(`Switched to ${newRegime === 'old' ? 'Old' : 'New'} Regime`);
      loadReport();
    } catch {
      showToast('Failed to switch regime', 'error');
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BarChart3 size={20} className="text-rivvra-400" /> Income Tax Report</h1>
          <p className="text-sm text-dark-400 mt-1">Detailed tax computation and TDS breakdown</p>
        </div>
        <select value={selectedFY} onChange={e => setSelectedFY(e.target.value)}
          className="bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-sm text-white focus:border-rivvra-500 outline-none">
          {fys.map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
        </select>
      </div>

      {!report ? (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-12 text-center">
          <BarChart3 size={32} className="text-dark-500 mx-auto mb-3" />
          <p className="text-dark-400">No tax data available for FY {selectedFY}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SummaryCard label="Gross Annual Income" value={report.grossAnnualIncome} icon={TrendingUp} />
            <SummaryCard label="Total Deductions" value={report.totalDeductions} icon={TrendingDown} color="text-green-400" />
            <SummaryCard label="Taxable Income" value={report.taxableIncome} icon={IndianRupee} />
            <SummaryCard label="Total Tax Liability" value={report.totalTax} icon={IndianRupee} color="text-red-400" />
            <SummaryCard label="YTD TDS Paid" value={report.ytdTdsPaid} icon={Calendar} color="text-blue-400" />
            <SummaryCard label="Remaining Tax" value={report.remainingTax} icon={IndianRupee} color={report.remainingTax > 0 ? 'text-amber-400' : 'text-green-400'} />
          </div>

          {/* Regime & Monthly TDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
              <div className="text-xs text-dark-400 mb-1">Current Regime</div>
              <div className="text-lg font-bold text-white capitalize">{report.regime} Regime</div>
              <div className="text-xs text-dark-400 mt-1">Standard Deduction: ₹{fmt(report.standardDeduction)}</div>
            </div>
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
              <div className="text-xs text-dark-400 mb-1">Est. Monthly TDS</div>
              <div className="text-lg font-bold text-white">₹{fmt(report.estimatedMonthlyTds)}</div>
              <div className="text-xs text-dark-400 mt-1">{report.monthsProcessed} months processed • {report.monthsRemaining} remaining</div>
            </div>
          </div>

          {/* Regime Comparison */}
          {report.comparison && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><ArrowRightLeft size={16} /> Regime Comparison</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border ${report.comparison.betterRegime === 'new' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
                  <div className="text-xs text-dark-400 mb-1">New Regime</div>
                  <div className="text-lg font-bold text-white">₹{fmt(report.comparison.newRegime.totalTax)}</div>
                  <div className="text-xs text-dark-400 mt-1">Taxable: ₹{fmt(report.comparison.newRegime.taxableIncome)}</div>
                  {report.comparison.betterRegime === 'new' && <span className="text-[10px] text-green-400 font-medium">✓ Better by ₹{fmt(report.comparison.savings)}</span>}
                </div>
                <div className={`p-4 rounded-lg border ${report.comparison.betterRegime === 'old' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
                  <div className="text-xs text-dark-400 mb-1">Old Regime</div>
                  <div className="text-lg font-bold text-white">₹{fmt(report.comparison.oldRegime.totalTax)}</div>
                  <div className="text-xs text-dark-400 mt-1">Taxable: ₹{fmt(report.comparison.oldRegime.taxableIncome)}</div>
                  {report.comparison.betterRegime === 'old' && <span className="text-[10px] text-green-400 font-medium">✓ Better by ₹{fmt(report.comparison.savings)}</span>}
                </div>
              </div>
              {report.comparison.betterRegime !== report.regime && (
                <button onClick={() => handleSwitchRegime(report.comparison.betterRegime)}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 text-xs font-medium rounded-lg hover:bg-green-600/30 transition-colors border border-green-500/20">
                  <ArrowRightLeft size={14} /> Switch to {report.comparison.betterRegime === 'old' ? 'Old' : 'New'} Regime to save ₹{fmt(report.comparison.savings)}
                </button>
              )}
            </div>
          )}

          {/* Detailed Computation */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            <button onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-750 transition-colors">
              <h2 className="text-sm font-semibold text-white">Detailed Tax Computation</h2>
              {showDetails ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
            </button>

            {showDetails && (
              <div className="border-t border-dark-700 px-5 py-4">
                <table className="w-full text-sm">
                  <tbody>
                    <Row label="Gross Annual Income" value={report.grossAnnualIncome} />
                    <Row label={`Less: Standard Deduction (${report.regime === 'new' ? '₹75K' : '₹50K'})`} value={-report.standardDeduction} negative />

                    {report.regime === 'old' && report.totalDeductions > 0 && (
                      <>
                        <tr><td colSpan={2} className="pt-3 pb-1 text-xs text-dark-500 font-semibold uppercase">Deductions</td></tr>
                        {report.declarations?.section80CTotal > 0 && <Row label="  Section 80C" value={-report.declarations.section80CTotal} negative sub />}
                        {report.declarations?.section80DTotal > 0 && <Row label="  Section 80D" value={-report.declarations.section80DTotal} negative sub />}
                        {Number(report.declarations?.section80E) > 0 && <Row label="  Section 80E" value={-Number(report.declarations.section80E)} negative sub />}
                        {Number(report.declarations?.section80G) > 0 && <Row label="  Section 80G" value={-Number(report.declarations.section80G)} negative sub />}
                        {Number(report.declarations?.section24b) > 0 && <Row label="  Section 24(b)" value={-Number(report.declarations.section24b)} negative sub />}
                        {report.hraExemption > 0 && <Row label="  HRA Exemption" value={-report.hraExemption} negative sub />}
                      </>
                    )}

                    <Row label="Taxable Income" value={report.taxableIncome} bold />

                    <tr><td colSpan={2} className="pt-4 pb-1 text-xs text-dark-500 font-semibold uppercase">Tax Slab Breakdown</td></tr>
                    {(report.slabBreakdown || []).map((s, i) => (
                      <tr key={i} className="border-b border-dark-700/20">
                        <td className="py-1.5 text-dark-300 text-xs pl-4">{s.range} @ {(s.rate * 100).toFixed(0)}%</td>
                        <td className="py-1.5 text-right text-white text-xs">₹{fmt(s.tax)}</td>
                      </tr>
                    ))}

                    <Row label="Gross Tax" value={report.grossTax} />
                    {report.surcharge > 0 && <Row label="Surcharge" value={report.surcharge} />}
                    <Row label="Cess (4%)" value={report.cess} />
                    {report.rebate > 0 && <Row label="Less: Rebate u/s 87A" value={-report.rebate} negative />}
                    <Row label="Total Tax Liability" value={report.totalTax} bold highlight />

                    <tr><td colSpan={2} className="pt-3" /></tr>
                    <Row label="YTD TDS Paid" value={report.ytdTdsPaid} color="text-blue-400" />
                    <Row label="Remaining Tax" value={report.remainingTax} bold color={report.remainingTax > 0 ? 'text-amber-400' : 'text-green-400'} />
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Monthly TDS Breakdown */}
          {report.monthlyBreakdown?.length > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
              <button onClick={() => setShowMonthly(!showMonthly)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-750 transition-colors">
                <h2 className="text-sm font-semibold text-white">Monthly TDS Breakdown</h2>
                {showMonthly ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
              </button>

              {showMonthly && (
                <div className="border-t border-dark-700 px-5 py-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-dark-400 border-b border-dark-600">
                        <th className="text-left pb-2 font-medium">Month</th>
                        <th className="text-right pb-2 font-medium">Gross</th>
                        <th className="text-right pb-2 font-medium">TDS</th>
                        <th className="text-right pb-2 font-medium">Cumulative TDS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let cumTds = 0;
                        return report.monthlyBreakdown.map((m, i) => {
                          cumTds += m.tds || 0;
                          return (
                            <tr key={i} className="border-b border-dark-700/20">
                              <td className="py-2 text-dark-300">
                                {MONTH_NAMES[m.month]} {m.year}
                                {m.source === 'imported' && <span className="text-[10px] text-purple-400 ml-1.5">GreytHR</span>}
                              </td>
                              <td className="py-2 text-right text-white">₹{fmt(m.gross)}</td>
                              <td className="py-2 text-right text-red-400">₹{fmt(m.tds)}</td>
                              <td className="py-2 text-right text-blue-400">₹{fmt(cumTds)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color = 'text-white' }) {
  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
      <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
        <Icon size={14} /> {label}
      </div>
      <div className={`text-xl font-bold ${color}`}>₹{fmt(value)}</div>
    </div>
  );
}

function Row({ label, value, bold, negative, sub, highlight, color }) {
  const absVal = Math.abs(value || 0);
  const textColor = color || (negative ? 'text-red-400' : 'text-white');
  return (
    <tr className={`border-b border-dark-700/20 ${highlight ? 'bg-dark-750' : ''}`}>
      <td className={`py-2 ${sub ? 'pl-6 text-dark-400 text-xs' : bold ? 'text-white font-semibold' : 'text-dark-300'}`}>{label}</td>
      <td className={`py-2 text-right ${bold ? 'font-bold' : 'font-medium'} ${textColor}`}>
        {negative ? '-' : ''}₹{fmt(absVal)}
      </td>
    </tr>
  );
}
