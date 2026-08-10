import React, { useState, useEffect, useRef } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import { getStatutoryConfigs, getEmployeeTaxReport } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
import {
  BarChart3, Search, ChevronDown, ChevronUp, Loader2, AlertTriangle, RefreshCw,
  TrendingUp, TrendingDown, IndianRupee, Calendar, ArrowRightLeft, X,
} from 'lucide-react';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function TaxRow({ label, value, bold, negative, sub, highlight, color }) {
  const absVal = Math.abs(value || 0);
  const textColor = color || (negative ? 'text-red-400' : 'text-white');
  return (
    <tr className={`border-b border-dark-700/20 ${highlight ? 'bg-dark-750' : ''}`}>
      <td className={`py-2 ${sub ? 'pl-6 text-dark-400 text-xs' : bold ? 'text-white font-semibold' : 'text-dark-300'}`}>{label}</td>
      <td className={`py-2 text-right ${bold ? 'font-bold' : 'font-medium'} ${textColor}`}>
        {negative ? '-' : ''}{formatMoney(absVal)}
      </td>
    </tr>
  );
}

export default function TaxReportsPage() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { fyApi: fy } = usePeriod();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [taxReport, setTaxReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [fullReportEmp, setFullReportEmp] = useState(null);
  // A failed load used to fall through to the same "No employees found." as a
  // genuinely empty company, so an admin could not tell an outage from an empty
  // list. Tracked separately for the list and for the expanded row.
  const [loadError, setLoadError] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // `taxReport` is a single shared slot. Rapidly expanding two rows fired two
  // overlapping fetches and whichever resolved last won — employee A's numbers
  // could land under employee B. Every fetch takes a ticket; only the newest
  // one is allowed to write state.
  const reqIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setEmployees([]);
      setExpandedEmp(null);
      setTaxReport(null);
      setLoadError(false);
      try {
        const res = await getStatutoryConfigs(orgSlug);
        setEmployees((res.data || []).map(d => d.employee));
      } catch {
        setLoadError(true);
        showToast('Failed to load employees', 'error');
      }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, reloadKey]);

  /** Fetch a report into the shared slot, discarding any stale response. */
  const fetchReport = async (empId) => {
    const reqId = ++reqIdRef.current;
    setReportLoading(true);
    setTaxReport(null);
    setReportError(false);
    try {
      const res = await getEmployeeTaxReport(orgSlug, empId, fy);
      if (reqIdRef.current !== reqId) return; // superseded — do not write
      setTaxReport(res.report);
    } catch {
      if (reqIdRef.current !== reqId) return;
      setTaxReport(null);
      setReportError(true);
    } finally {
      if (reqIdRef.current === reqId) setReportLoading(false);
    }
  };

  const toggleReport = async (empId) => {
    if (expandedEmp === empId) {
      reqIdRef.current++; // invalidate any in-flight fetch for this row
      setExpandedEmp(null);
      setTaxReport(null);
      setReportLoading(false);
      setReportError(false);
      return;
    }
    setExpandedEmp(empId);
    await fetchReport(empId);
  };

  // Re-fetch report when FY changes (if an employee is expanded)
  useEffect(() => {
    if (!expandedEmp) return;
    fetchReport(expandedEmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  const confirmedEmployees = employees.filter(e => e.employmentType === 'confirmed' && e.status !== 'separated');
  const filtered = confirmedEmployees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.fullName || e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-rivvra-400" /> Tax Reports
          </h1>
          <p className="text-sm text-dark-400 mt-1">Income tax summary & detailed computation per employee — FY {fy}</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-full sm:w-56" placeholder="Search employee..." />
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
              <th className="text-right px-3 py-3 text-dark-400 font-medium">Gross Annual</th>
              <th className="text-right px-3 py-3 text-dark-400 font-medium">Total Tax</th>
              <th className="text-right px-3 py-3 text-dark-400 font-medium">YTD TDS</th>
              <th className="text-right px-3 py-3 text-dark-400 font-medium">Remaining</th>
              <th className="w-8 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => {
              const empId = emp._id.toString();
              const isExpanded = expandedEmp === empId;
              const r = isExpanded ? taxReport : null;
              return (
                <React.Fragment key={empId}>
                  <tr onClick={() => toggleReport(empId)}
                    className={`border-b border-dark-700/50 hover:bg-dark-750 cursor-pointer transition-colors ${isExpanded ? 'bg-dark-750' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{emp.fullName || emp.name || emp.email}</div>
                      <div className="text-xs text-dark-400">{emp.email}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-dark-300">
                      {r ? formatMoney(r.grossAnnualIncome) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-red-400">
                      {r ? formatMoney(r.totalTax) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-blue-400">
                      {r ? formatMoney(r.ytdTdsPaid) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-xs">
                      {r ? (
                        <span className={r.remainingTax > 0 ? 'text-amber-400' : 'text-green-400'}>{formatMoney(r.remainingTax)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-3">
                      {isExpanded ? <ChevronUp size={14} className="text-dark-400" /> : <ChevronDown size={14} className="text-dark-400" />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-0 py-0 border-b border-dark-700/50">
                        <div className="bg-dark-950/50 p-5">
                          {reportLoading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-dark-400 text-sm">
                              <Loader2 size={16} className="animate-spin" /> Loading tax report...
                            </div>
                          ) : reportError ? (
                            <div className="py-6 text-center">
                              <p className="text-sm text-red-400 flex items-center justify-center gap-2">
                                <AlertTriangle size={14} /> Couldn’t load this tax report.
                              </p>
                              <button
                                onClick={(e) => { e.stopPropagation(); fetchReport(empId); }}
                                className="mt-2 inline-flex items-center gap-1.5 text-xs text-rivvra-400 hover:text-rivvra-300 font-medium"
                              >
                                <RefreshCw size={12} /> Retry
                              </button>
                            </div>
                          ) : !taxReport ? (
                            <div className="text-center py-6">
                              <p className="text-dark-400 text-sm">No tax data for FY {fy}.</p>
                              <p className="text-dark-500 text-xs mt-1">Nothing has been processed for this employee in this financial year yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {/* Summary Cards */}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {[
                                  { label: 'Gross Annual', value: taxReport.grossAnnualIncome, color: 'text-white' },
                                  { label: 'Total Deductions', value: taxReport.totalDeductions, color: 'text-green-400' },
                                  { label: 'Taxable Income', value: taxReport.taxableIncome, color: 'text-white' },
                                  { label: 'Total Tax', value: taxReport.totalTax, color: 'text-red-400' },
                                  { label: 'YTD TDS Paid', value: taxReport.ytdTdsPaid, color: 'text-blue-400' },
                                  { label: 'Remaining Tax', value: taxReport.remainingTax, color: taxReport.remainingTax > 0 ? 'text-amber-400' : 'text-green-400' },
                                ].map(card => (
                                  <div key={card.label} className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                    <p className="text-[10px] text-dark-500 uppercase">{card.label}</p>
                                    <p className={`text-sm font-semibold ${card.color} mt-0.5`}>{formatMoney(card.value)}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Regime + Monthly TDS + Comparison */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                  <p className="text-[10px] text-dark-500">REGIME</p>
                                  <p className="text-sm font-semibold text-white capitalize mt-0.5">{taxReport.regime} Regime</p>
                                  <p className="text-[10px] text-dark-500 mt-0.5">Std Deduction: {formatMoney(taxReport.standardDeduction)}</p>
                                </div>
                                <div className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                  <p className="text-[10px] text-dark-500">EST. MONTHLY TDS</p>
                                  <p className="text-sm font-semibold text-white mt-0.5">{formatMoney(taxReport.estimatedMonthlyTds)}</p>
                                  <p className="text-[10px] text-dark-500 mt-0.5">{taxReport.monthsProcessed} processed • {taxReport.monthsRemaining} remaining</p>
                                </div>
                                {taxReport.comparison && (
                                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                    <p className="text-[10px] text-dark-500">REGIME COMPARISON</p>
                                    <p className="text-xs text-dark-300 mt-1">Old: {formatMoney(taxReport.comparison.oldRegime.totalTax)} | New: {formatMoney(taxReport.comparison.newRegime.totalTax)}</p>
                                    <p className="text-[10px] mt-0.5">
                                      <span className="text-green-400">{taxReport.comparison.betterRegime === 'old' ? 'Old' : 'New'} saves {formatMoney(taxReport.comparison.savings)}</span>
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Monthly Breakdown */}
                              {taxReport.monthlyBreakdown?.length > 0 && (
                                <div className="bg-dark-900 rounded-lg border border-dark-800 overflow-x-auto">
                                  <p className="text-[10px] text-dark-500 uppercase px-3 pt-3 pb-1">Monthly Breakdown</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-dark-500 border-b border-dark-800">
                                        <th className="text-left px-3 py-1.5">Month</th>
                                        <th className="text-right px-3 py-1.5">Gross</th>
                                        <th className="text-right px-3 py-1.5">TDS</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {taxReport.monthlyBreakdown.map((m, i) => (
                                        <tr key={i} className="border-b border-dark-800/50">
                                          <td className="px-3 py-1.5 text-dark-300">{MONTH_NAMES[m.month]} {m.year} {m.source === 'imported' ? <span className="text-[9px] text-dark-500">(imported)</span> : ''}</td>
                                          <td className="px-3 py-1.5 text-right text-dark-200">{formatMoney(m.gross)}</td>
                                          <td className="px-3 py-1.5 text-right text-red-400">{formatMoney(m.tds)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* View Full Tax Report Button */}
                              <div className="flex justify-center pt-1">
                                <button
                                  onClick={() => setFullReportEmp(emp)}
                                  className="flex items-center gap-2 px-4 py-2 bg-rivvra-600/20 text-rivvra-400 text-xs font-medium rounded-lg hover:bg-rivvra-600/30 transition-colors border border-rivvra-500/20"
                                >
                                  <BarChart3 size={14} /> View Full Tax Report
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            {loadError ? (
              <>
                <p className="text-sm text-red-400 flex items-center justify-center gap-2">
                  <AlertTriangle size={14} /> Couldn’t load employees.
                </p>
                <button onClick={() => setReloadKey(k => k + 1)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-rivvra-400 hover:text-rivvra-300 font-medium">
                  <RefreshCw size={12} /> Retry
                </button>
              </>
            ) : confirmedEmployees.length === 0 ? (
              <p className="text-dark-500 text-sm">No confirmed employees in this company yet.</p>
            ) : (
              <>
                <p className="text-dark-400 text-sm">No employees match “{search}”.</p>
                <button onClick={() => setSearch('')}
                  className="mt-3 text-xs text-rivvra-400 hover:text-rivvra-300 font-medium">Clear search</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Full Tax Report Modal */}
      {fullReportEmp && taxReport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setFullReportEmp(null)}>
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-dark-700 sticky top-0 bg-dark-800 z-10">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2"><BarChart3 size={18} className="text-rivvra-400" /> Income Tax Report</h2>
                <p className="text-xs text-dark-400 mt-0.5">{fullReportEmp.fullName || fullReportEmp.name || fullReportEmp.email} — FY {fy}</p>
              </div>
              <button onClick={() => setFullReportEmp(null)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Gross Annual Income', value: taxReport.grossAnnualIncome, icon: TrendingUp, color: 'text-white' },
                  { label: 'Total Deductions', value: taxReport.totalDeductions, icon: TrendingDown, color: 'text-green-400' },
                  { label: 'Taxable Income', value: taxReport.taxableIncome, icon: IndianRupee, color: 'text-white' },
                  { label: 'Total Tax Liability', value: taxReport.totalTax, icon: IndianRupee, color: 'text-red-400' },
                  { label: 'YTD TDS Paid', value: taxReport.ytdTdsPaid, icon: Calendar, color: 'text-blue-400' },
                  { label: 'Remaining Tax', value: taxReport.remainingTax, icon: IndianRupee, color: taxReport.remainingTax > 0 ? 'text-amber-400' : 'text-green-400' },
                ].map(card => (
                  <div key={card.label} className="bg-dark-900 rounded-lg border border-dark-700/50 p-3">
                    <div className="flex items-center gap-1.5 text-dark-400 text-[10px] mb-1">
                      <card.icon size={12} /> {card.label}
                    </div>
                    <div className={`text-lg font-bold ${card.color}`}>{formatMoney(card.value)}</div>
                  </div>
                ))}
              </div>

              {/* Regime & Monthly TDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 p-4">
                  <div className="text-xs text-dark-400 mb-1">Current Regime</div>
                  <div className="text-lg font-bold text-white capitalize">{taxReport.regime} Regime</div>
                  <div className="text-xs text-dark-400 mt-1">Standard Deduction: {formatMoney(taxReport.standardDeduction)}</div>
                </div>
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 p-4">
                  <div className="text-xs text-dark-400 mb-1">Est. Monthly TDS</div>
                  <div className="text-lg font-bold text-white">{formatMoney(taxReport.estimatedMonthlyTds)}</div>
                  <div className="text-xs text-dark-400 mt-1">{taxReport.monthsProcessed} months processed • {taxReport.monthsRemaining} remaining</div>
                </div>
              </div>

              {/* Regime Comparison */}
              {taxReport.comparison && (
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 p-4">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ArrowRightLeft size={14} /> Regime Comparison</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg border ${taxReport.comparison.betterRegime === 'new' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
                      <div className="text-xs text-dark-400 mb-1">New Regime</div>
                      <div className="text-lg font-bold text-white">{formatMoney(taxReport.comparison.newRegime.totalTax)}</div>
                      <div className="text-xs text-dark-400 mt-1">Taxable: {formatMoney(taxReport.comparison.newRegime.taxableIncome)}</div>
                      {taxReport.comparison.betterRegime === 'new' && <span className="text-[10px] text-green-400 font-medium">✓ Better by {formatMoney(taxReport.comparison.savings)}</span>}
                    </div>
                    <div className={`p-3 rounded-lg border ${taxReport.comparison.betterRegime === 'old' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
                      <div className="text-xs text-dark-400 mb-1">Old Regime</div>
                      <div className="text-lg font-bold text-white">{formatMoney(taxReport.comparison.oldRegime.totalTax)}</div>
                      <div className="text-xs text-dark-400 mt-1">Taxable: {formatMoney(taxReport.comparison.oldRegime.taxableIncome)}</div>
                      {taxReport.comparison.betterRegime === 'old' && <span className="text-[10px] text-green-400 font-medium">✓ Better by {formatMoney(taxReport.comparison.savings)}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Tax Computation */}
              <div className="bg-dark-900 rounded-lg border border-dark-700/50 overflow-x-auto">
                <div className="px-4 py-3 border-b border-dark-700/50">
                  <h3 className="text-sm font-semibold text-white">Detailed Tax Computation</h3>
                </div>
                <div className="px-4 py-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <TaxRow label="Gross Annual Income" value={taxReport.grossAnnualIncome} />
                      {/* The label used to hardcode "₹75K / ₹50K" from the
                          regime, but the standard deduction is an FY-configurable
                          amount (fyStatutoryConfig) — so the caption could
                          disagree with the figure in the very next column. The
                          real amount is already shown; don't restate it wrongly. */}
                      <TaxRow label="Less: Standard Deduction" value={-taxReport.standardDeduction} negative />

                      {taxReport.regime === 'old' && taxReport.totalDeductions > 0 && (
                        <>
                          <tr><td colSpan={2} className="pt-3 pb-1 text-xs text-dark-500 font-semibold uppercase">Deductions</td></tr>
                          {taxReport.declarations?.section80CTotal > 0 && <TaxRow label="  Section 80C" value={-taxReport.declarations.section80CTotal} negative sub />}
                          {taxReport.declarations?.section80DTotal > 0 && <TaxRow label="  Section 80D" value={-taxReport.declarations.section80DTotal} negative sub />}
                          {Number(taxReport.declarations?.section80E) > 0 && <TaxRow label="  Section 80E" value={-Number(taxReport.declarations.section80E)} negative sub />}
                          {Number(taxReport.declarations?.section80G) > 0 && <TaxRow label="  Section 80G" value={-Number(taxReport.declarations.section80G)} negative sub />}
                          {Number(taxReport.declarations?.section24b) > 0 && <TaxRow label="  Section 24(b)" value={-Number(taxReport.declarations.section24b)} negative sub />}
                          {taxReport.hraExemption > 0 && <TaxRow label="  HRA Exemption" value={-taxReport.hraExemption} negative sub />}
                        </>
                      )}

                      <TaxRow label="Taxable Income" value={taxReport.taxableIncome} bold />

                      <tr><td colSpan={2} className="pt-4 pb-1 text-xs text-dark-500 font-semibold uppercase">Tax Slab Breakdown</td></tr>
                      {(taxReport.slabBreakdown || []).map((s, i) => (
                        <tr key={i} className="border-b border-dark-700/20">
                          <td className="py-1.5 text-dark-300 text-xs pl-4">{s.range} @ {(s.rate * 100).toFixed(0)}%</td>
                          <td className="py-1.5 text-right text-white text-xs">{formatMoney(s.tax)}</td>
                        </tr>
                      ))}

                      <TaxRow label="Gross Tax" value={taxReport.grossTax} />
                      {taxReport.surcharge > 0 && <TaxRow label="Surcharge" value={taxReport.surcharge} />}
                      {/* `cessRate` is per-FY configurable and is NOT part of the
                          tax-report payload, so "(4%)" was an assumption. */}
                      <TaxRow label="Health & Education Cess" value={taxReport.cess} />
                      {taxReport.rebate > 0 && <TaxRow label="Less: Rebate u/s 87A" value={-taxReport.rebate} negative />}
                      <TaxRow label="Total Tax Liability" value={taxReport.totalTax} bold highlight />

                      <tr><td colSpan={2} className="pt-3" /></tr>
                      <TaxRow label="YTD TDS Paid" value={taxReport.ytdTdsPaid} color="text-blue-400" />
                      <TaxRow label="Remaining Tax" value={taxReport.remainingTax} bold color={taxReport.remainingTax > 0 ? 'text-amber-400' : 'text-green-400'} />
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monthly TDS Breakdown with Cumulative */}
              {taxReport.monthlyBreakdown?.length > 0 && (
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 overflow-x-auto">
                  <div className="px-4 py-3 border-b border-dark-700/50">
                    <h3 className="text-sm font-semibold text-white">Monthly TDS Breakdown</h3>
                  </div>
                  <div className="px-4 py-3">
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
                          return taxReport.monthlyBreakdown.map((m, i) => {
                            cumTds += m.tds || 0;
                            return (
                              <tr key={i} className="border-b border-dark-700/20">
                                <td className="py-2 text-dark-300 text-xs">
                                  {MONTH_NAMES[m.month]} {m.year}
                                  {/* The report sets `source: 'imported'` (payroll.js ~4547);
                                      the originating system isn't carried through, so this
                                      said "GreytHR" on faith. Say what we actually know. */}
                                  {m.source === 'imported' && (
                                    <span className="text-[10px] text-purple-400 ml-1.5" title="Carried over from imported payslip data, not processed in a Rivvra payroll run">
                                      Imported
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-right text-white text-xs">{formatMoney(m.gross)}</td>
                                <td className="py-2 text-right text-red-400 text-xs">{formatMoney(m.tds)}</td>
                                <td className="py-2 text-right text-blue-400 text-xs">{formatMoney(cumTds)}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
