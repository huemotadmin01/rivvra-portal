import React, { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { usePeriod } from '../../context/PeriodContext';
import { getTaxDeclarations, upsertTaxDeclaration, getStatutoryConfigs, getEmployeeTaxReport } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { FileText, X, Search, Save, ChevronDown, ChevronUp, BarChart3, Loader2, TrendingUp, TrendingDown, IndianRupee, Calendar, ArrowRightLeft, Eye } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function TaxRow({ label, value, bold, negative, sub, highlight, color }) {
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

export default function TaxDeclarationsPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const { fyApi: fy } = usePeriod();
  const [declarations, setDeclarations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [expandedEmp, setExpandedEmp] = useState(null); // employeeId
  const [taxReport, setTaxReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [fullReportEmp, setFullReportEmp] = useState(null); // employee object for full report modal

  const load = async () => {
    setLoading(true);
    try {
      const [declRes, empRes] = await Promise.all([
        getTaxDeclarations(orgSlug, fy),
        getStatutoryConfigs(orgSlug),
      ]);
      setDeclarations(declRes.declarations || []);
      setEmployees((empRes.data || []).map(d => d.employee));
    } catch (err) { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [orgSlug, fy]);

  const openEmployee = (emp) => {
    const decl = declarations.find(d => d.employeeId === emp._id.toString());
    const d = decl?.declarations || {};
    setForm({
      regime: decl?.regime || 'new',
      section80C: {
        epf: d.section80C?.epf || 0,
        ppf: d.section80C?.ppf || 0,
        elss: d.section80C?.elss || 0,
        lifeInsurance: d.section80C?.lifeInsurance || 0,
        housingLoan: d.section80C?.housingLoan || 0,
        tuitionFees: d.section80C?.tuitionFees || 0,
        nsc: d.section80C?.nsc || 0,
        others: d.section80C?.others || 0,
      },
      section80D: {
        selfFamily: d.section80D?.selfFamily || 0,
        parents: d.section80D?.parents || 0,
        parentsSenior: d.section80D?.parentsSenior || 0,
      },
      section80E: d.section80E || 0,
      section80G: d.section80G || 0,
      section24b: d.section24b || 0,
      hra: {
        rentPaidAnnual: d.hra?.rentPaidAnnual || 0,
        cityType: d.hra?.cityType || 'non-metro',
      },
    });
    setSelectedEmp(emp);
  };

  const handleSave = async () => {
    try {
      await upsertTaxDeclaration(orgSlug, selectedEmp._id.toString(), fy, {
        regime: form.regime,
        declarations: form,
      });
      showToast('Declarations saved — payroll TDS recalculated', 'success');
      const savedEmpId = selectedEmp._id.toString();
      setSelectedEmp(null);
      await load();
      // Auto-refresh the tax report if this employee was expanded
      if (expandedEmp === savedEmpId) {
        setReportLoading(true);
        try {
          const res = await getEmployeeTaxReport(orgSlug, savedEmpId, fy);
          setTaxReport(res.report);
        } catch (err) { /* ignore */ }
        finally { setReportLoading(false); }
      }
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const toggleTaxReport = async (empId) => {
    if (expandedEmp === empId) { setExpandedEmp(null); setTaxReport(null); return; }
    setExpandedEmp(empId);
    setReportLoading(true);
    setTaxReport(null);
    try {
      const res = await getEmployeeTaxReport(orgSlug, empId, fy);
      setTaxReport(res.report);
    } catch (err) { setTaxReport(null); }
    finally { setReportLoading(false); }
  };

  const total80C = form ? Math.min(150000, Object.values(form.section80C).reduce((s, v) => s + (Number(v) || 0), 0)) : 0;
  const total80D = form ? Object.values(form.section80D).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const totalDecl = form ? total80C + total80D + (Number(form.section80E) || 0) + (Number(form.section80G) || 0) + (Number(form.section24b) || 0) : 0;

  // Tax declarations only apply to active confirmed employees (not consultants/contractors/interns — they have flat TDS)
  const confirmedEmployees = employees.filter(e => e.employmentType === 'confirmed' && e.status !== 'separated');
  const filtered = confirmedEmployees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.fullName || e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Tax Declarations</h1>
          <p className="text-sm text-dark-400 mt-1">80C, 80D, 80E, 80G, 24(b) declarations per employee</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-56" placeholder="Search..." />
          </div>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Regime</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">80C</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">80D</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Total</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => {
              const empId = emp._id.toString();
              const decl = declarations.find(d => d.employeeId === empId);
              const d = decl?.declarations || {};
              const t80c = d.section80CTotal || 0;
              const t80d = d.section80DTotal || 0;
              const total = d.totalDeclared || 0;
              const isExpanded = expandedEmp === empId;
              return (
                <React.Fragment key={empId}>
                  <tr onClick={() => toggleTaxReport(empId)} className={`border-b border-dark-700/50 hover:bg-dark-750 cursor-pointer transition-colors ${isExpanded ? 'bg-dark-750' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{emp.fullName || emp.name || emp.email}</div>
                      <div className="text-xs text-dark-400">{emp.email}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${decl?.regime === 'old' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {decl?.regime === 'old' ? 'Old' : 'New'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-dark-300">{t80c > 0 ? `₹${fmt(t80c)}` : '-'}</td>
                    <td className="px-4 py-3 text-center text-xs text-dark-300">{t80d > 0 ? `₹${fmt(t80d)}` : '-'}</td>
                    <td className="px-4 py-3 text-center text-xs text-white font-medium">{total > 0 ? `₹${fmt(total)}` : '-'}</td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                      <button onClick={(e) => { e.stopPropagation(); openEmployee(emp); }} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
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
                          ) : !taxReport ? (
                            <div className="text-center py-6 text-dark-500 text-sm">No tax data for FY {fy}</div>
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
                                    <p className={`text-sm font-semibold ${card.color} mt-0.5`}>₹{fmt(card.value)}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Regime + Monthly TDS */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                  <p className="text-[10px] text-dark-500">REGIME</p>
                                  <p className="text-sm font-semibold text-white capitalize mt-0.5">{taxReport.regime} Regime</p>
                                  <p className="text-[10px] text-dark-500 mt-0.5">Std Deduction: ₹{fmt(taxReport.standardDeduction)}</p>
                                </div>
                                <div className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                  <p className="text-[10px] text-dark-500">EST. MONTHLY TDS</p>
                                  <p className="text-sm font-semibold text-white mt-0.5">₹{fmt(taxReport.estimatedMonthlyTds)}</p>
                                  <p className="text-[10px] text-dark-500 mt-0.5">{taxReport.monthsProcessed} processed • {taxReport.monthsRemaining} remaining</p>
                                </div>
                                {taxReport.comparison && (
                                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-800">
                                    <p className="text-[10px] text-dark-500">REGIME COMPARISON</p>
                                    <p className="text-xs text-dark-300 mt-1">Old: ₹{fmt(taxReport.comparison.oldRegime.totalTax)} | New: ₹{fmt(taxReport.comparison.newRegime.totalTax)}</p>
                                    <p className="text-[10px] mt-0.5">
                                      <span className="text-green-400">{taxReport.comparison.betterRegime === 'old' ? 'Old' : 'New'} saves ₹{fmt(taxReport.comparison.savings)}</span>
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Monthly Breakdown */}
                              {taxReport.monthlyBreakdown?.length > 0 && (
                                <div className="bg-dark-900 rounded-lg border border-dark-800 overflow-hidden">
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
                                          <td className="px-3 py-1.5 text-right text-dark-200">₹{fmt(m.gross)}</td>
                                          <td className="px-3 py-1.5 text-right text-red-400">₹{fmt(m.tds)}</td>
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
                                  <Eye size={14} /> View Full Tax Report
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
        {filtered.length === 0 && <div className="text-center py-12 text-dark-500">No employees found.</div>}
      </div>

      {/* Full Tax Report Modal */}
      {fullReportEmp && taxReport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setFullReportEmp(null)}>
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
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
                    <div className={`text-lg font-bold ${card.color}`}>₹{fmt(card.value)}</div>
                  </div>
                ))}
              </div>

              {/* Regime & Monthly TDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 p-4">
                  <div className="text-xs text-dark-400 mb-1">Current Regime</div>
                  <div className="text-lg font-bold text-white capitalize">{taxReport.regime} Regime</div>
                  <div className="text-xs text-dark-400 mt-1">Standard Deduction: ₹{fmt(taxReport.standardDeduction)}</div>
                </div>
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 p-4">
                  <div className="text-xs text-dark-400 mb-1">Est. Monthly TDS</div>
                  <div className="text-lg font-bold text-white">₹{fmt(taxReport.estimatedMonthlyTds)}</div>
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
                      <div className="text-lg font-bold text-white">₹{fmt(taxReport.comparison.newRegime.totalTax)}</div>
                      <div className="text-xs text-dark-400 mt-1">Taxable: ₹{fmt(taxReport.comparison.newRegime.taxableIncome)}</div>
                      {taxReport.comparison.betterRegime === 'new' && <span className="text-[10px] text-green-400 font-medium">✓ Better by ₹{fmt(taxReport.comparison.savings)}</span>}
                    </div>
                    <div className={`p-3 rounded-lg border ${taxReport.comparison.betterRegime === 'old' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
                      <div className="text-xs text-dark-400 mb-1">Old Regime</div>
                      <div className="text-lg font-bold text-white">₹{fmt(taxReport.comparison.oldRegime.totalTax)}</div>
                      <div className="text-xs text-dark-400 mt-1">Taxable: ₹{fmt(taxReport.comparison.oldRegime.taxableIncome)}</div>
                      {taxReport.comparison.betterRegime === 'old' && <span className="text-[10px] text-green-400 font-medium">✓ Better by ₹{fmt(taxReport.comparison.savings)}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Tax Computation */}
              <div className="bg-dark-900 rounded-lg border border-dark-700/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-700/50">
                  <h3 className="text-sm font-semibold text-white">Detailed Tax Computation</h3>
                </div>
                <div className="px-4 py-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <TaxRow label="Gross Annual Income" value={taxReport.grossAnnualIncome} />
                      <TaxRow label={`Less: Standard Deduction (${taxReport.regime === 'new' ? '₹75K' : '₹50K'})`} value={-taxReport.standardDeduction} negative />

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
                          <td className="py-1.5 text-right text-white text-xs">₹{fmt(s.tax)}</td>
                        </tr>
                      ))}

                      <TaxRow label="Gross Tax" value={taxReport.grossTax} />
                      {taxReport.surcharge > 0 && <TaxRow label="Surcharge" value={taxReport.surcharge} />}
                      <TaxRow label="Cess (4%)" value={taxReport.cess} />
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
                <div className="bg-dark-900 rounded-lg border border-dark-700/50 overflow-hidden">
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
                                  {m.source === 'imported' && <span className="text-[10px] text-purple-400 ml-1.5">GreytHR</span>}
                                </td>
                                <td className="py-2 text-right text-white text-xs">₹{fmt(m.gross)}</td>
                                <td className="py-2 text-right text-red-400 text-xs">₹{fmt(m.tds)}</td>
                                <td className="py-2 text-right text-blue-400 text-xs">₹{fmt(cumTds)}</td>
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

      {/* Edit Modal */}
      {selectedEmp && form && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2"><FileText size={18} /> Tax Declarations</h2>
                <p className="text-xs text-dark-400 mt-0.5">{selectedEmp.fullName || selectedEmp.email} — FY {fy}</p>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Regime */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Tax Regime</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" checked={form.regime === 'new'} onChange={() => setForm(f => ({ ...f, regime: 'new' }))} /> New Regime
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" checked={form.regime === 'old'} onChange={() => setForm(f => ({ ...f, regime: 'old' }))} /> Old Regime
                  </label>
                </div>
              </fieldset>

              {form.regime === 'old' && (
                <>
                  {/* 80C */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">
                      Section 80C <span className="text-xs text-dark-500">(Max ₹1,50,000)</span>
                    </legend>
                    {[
                      ['epf', 'Employee PF'], ['ppf', 'PPF'], ['elss', 'ELSS/Tax Saving MF'],
                      ['lifeInsurance', 'Life Insurance'], ['housingLoan', 'Housing Loan Principal'],
                      ['tuitionFees', 'Tuition Fees'], ['nsc', 'NSC'], ['others', 'Others'],
                    ].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-xs text-dark-400 w-40">{label}</label>
                        <input type="number" value={form.section80C[key]} onChange={e => setForm(f => ({ ...f, section80C: { ...f.section80C, [key]: Number(e.target.value) || 0 } }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1 border-t border-dark-700">
                      <span className="text-xs font-medium text-dark-300">Total 80C (capped)</span>
                      <span className="text-xs font-bold text-white">₹{fmt(total80C)}</span>
                    </div>
                  </fieldset>

                  {/* 80D */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Section 80D (Medical Insurance)</legend>
                    {[['selfFamily', 'Self & Family'], ['parents', 'Parents'], ['parentsSenior', 'Parents (Senior)']].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-xs text-dark-400 w-40">{label}</label>
                        <input type="number" value={form.section80D[key]} onChange={e => setForm(f => ({ ...f, section80D: { ...f.section80D, [key]: Number(e.target.value) || 0 } }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                  </fieldset>

                  {/* Other sections */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Other Deductions</legend>
                    {[['section80E', '80E (Education Loan Interest)'], ['section80G', '80G (Donations)'], ['section24b', '24(b) (Home Loan Interest)']].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-xs text-dark-400 w-48">{label}</label>
                        <input type="number" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                  </fieldset>

                  {/* HRA */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">HRA Exemption</legend>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-dark-400 w-40">Annual Rent Paid</label>
                      <input type="number" value={form.hra.rentPaidAnnual} onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, rentPaidAnnual: Number(e.target.value) || 0 } }))}
                        className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-dark-400 w-40">City Type</label>
                      <select value={form.hra.cityType} onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, cityType: e.target.value } }))}
                        className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white focus:border-rivvra-500 focus:outline-none">
                        <option value="metro">Metro</option>
                        <option value="non-metro">Non-Metro</option>
                      </select>
                    </div>
                  </fieldset>
                </>
              )}

              {form.regime === 'new' && (
                <div className="bg-dark-900/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-dark-400">New Tax Regime does not allow most deductions.</p>
                  <p className="text-xs text-dark-500 mt-1">Standard deduction of ₹75,000 is applied automatically.</p>
                </div>
              )}

              {/* Total */}
              <div className="bg-rivvra-500/10 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm font-medium text-rivvra-400">Total Declared Deductions</span>
                <span className="text-lg font-bold text-white">₹{fmt(totalDecl)}</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedEmp(null)} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button onClick={handleSave} className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 flex items-center justify-center gap-2">
                  <Save size={14} /> Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
