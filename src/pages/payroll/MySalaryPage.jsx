import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getMySalary, getMyTax } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { IndianRupee, Briefcase, Shield, TrendingUp, FileText } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function MySalaryPage() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [salary, setSalary] = useState(null);
  const [statutory, setStatutory] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [tax, setTax] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setSalary(null);
      setStatutory(null);
      setEmployee(null);
      setTax(null);

      // /my-salary and /my-tax are fetched INDEPENDENTLY on purpose.
      // /my-tax is India-gated in the backend (payroll.js ~3908 → 403
      // NON_INDIA_COMPANY, or 400 when there's no active company) while
      // /my-salary is not. Under the old Promise.all the tax 403 rejected the
      // whole batch, so a US/CA employee saw "Failed to load salary" and
      // "No salary configured yet" even though their salary had loaded fine.
      const [salResult, taxResult] = await Promise.allSettled([
        getMySalary(orgSlug),
        getMyTax(orgSlug),
      ]);

      if (salResult.status === 'fulfilled') {
        setSalary(salResult.value.salary);
        setStatutory(salResult.value.statutory);
        setEmployee(salResult.value.employee);
      } else if (salResult.reason?.response?.status !== 404) {
        showToast('Failed to load salary', 'error');
      }

      if (taxResult.status === 'fulfilled') {
        setTax(taxResult.value.tax);
      }
      // A rejected /my-tax is never a page failure: 403/NON_INDIA_COMPANY, 400
      // (no active company) and 404 (no linked employee) all just mean "this
      // employee has no tax section" — the Tax Summary card stays hidden.

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  if (!salary) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold text-white mb-6">My Salary</h1>
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-12 text-center">
          <IndianRupee size={32} className="text-dark-500 mx-auto mb-3" />
          <p className="text-dark-400">No salary configured yet. Contact your HR admin.</p>
        </div>
      </div>
    );
  }

  const isConsultant = salary.payrollMode === 'consultant_flat_tds';
  const flatTdsRate = salary.flatTdsRate || 0;

  // For consultants: simple calculation (no PF/ESI)
  // For statutory: full PF/ESI calculation
  const basic = salary.components?.find(c => c.name === 'Basic');
  const pfBase = salary.pfCappedAt15K ? Math.min(basic?.amount || 0, 15000) : (basic?.amount || 0);
  const employeePf = !isConsultant && salary.pfApplicable ? Math.round(pfBase * 0.12) : 0;
  const employerPf = !isConsultant && salary.pfApplicable ? Math.round(pfBase * 0.12) : 0;
  const employeeEsi = !isConsultant && salary.esiApplicable ? Math.round(salary.grossMonthly * 0.0075) : 0;
  const employerEsi = !isConsultant && salary.esiApplicable ? Math.round(salary.grossMonthly * 0.0325) : 0;

  // Calculate TDS for consultants
  const estimatedTds = isConsultant ? Math.round(salary.grossMonthly * flatTdsRate) : 0;

  // Professional Tax. The old code read `statutory.ptEnabled` — a field
  // /my-salary (payroll.js ~3660) never returns — so the check was always true
  // and a hardcoded Madhya-Pradesh slab was shown to every employee in every
  // state. PT slabs are state-specific and not available client-side, so we no
  // longer fabricate a number: we surface the employee's PT state (the field
  // the backend DOES return) and say the real figure lands on the payslip.
  const ptState = (!isConsultant && statutory?.ptState) ? statutory.ptState : '';

  // Deductions = what actually comes OUT of the employee's gross.
  // The backend (payroll.js ~3240) computes
  //   totalDeductions = employeePf + employeeEsi + PT + TDS + otherDeductions
  // and treats employer PF/ESI as `totalEmployerCost` ON TOP of gross — never
  // as a deduction. This page used to subtract the employer share too, which
  // understated Net Take-Home by ~₹1,800+/month and directly contradicted the
  // employee's own payslip.
  const totalDeductions = employeePf + employeeEsi + estimatedTds;
  const employerContributions = employerPf + employerEsi;
  const netMonthly = salary.grossMonthly - totalDeductions;

  if (isConsultant) {
    return <ConsultantView salary={salary} tax={tax} statutory={statutory} employee={employee} flatTdsRate={flatTdsRate} estimatedTds={estimatedTds} netMonthly={netMonthly} />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">My Salary</h1>
        <p className="text-sm text-dark-400 mt-1">Your CTC breakdown and statutory details</p>
      </div>

      {/* CTC Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
            <Briefcase size={14} /> Annual CTC
          </div>
          <div className="text-2xl font-bold text-white">₹{fmt(salary.ctcAnnual)}</div>
          <div className="text-xs text-dark-500 mt-1">₹{fmt(salary.ctcMonthly)}/month</div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
            <TrendingUp size={14} /> Monthly Gross
          </div>
          <div className="text-2xl font-bold text-white">₹{fmt(salary.grossMonthly)}</div>
          <div className="text-xs text-dark-500 mt-1">{salary.structureName}</div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
            <IndianRupee size={14} /> Net Take-Home (est.)
          </div>
          <div className="text-2xl font-bold text-green-400">₹{fmt(netMonthly)}</div>
          <div className="text-xs text-dark-500 mt-1">Before PT &amp; TDS</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Earnings */}
        <div className="bg-dark-800 rounded-xl border border-dark-700">
          <div className="px-5 py-4 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-white">Monthly Earnings</h2>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <tbody>
                {(salary.components || []).map((c, i) => (
                  <tr key={i} className="border-b border-dark-700/50 last:border-0">
                    <td className="py-2.5 text-dark-300">{c.name}</td>
                    <td className="py-2.5 text-right text-white font-medium">₹{fmt(c.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-dark-600">
                  <td className="py-2.5 text-white font-semibold">Gross Salary</td>
                  <td className="py-2.5 text-right text-white font-bold">₹{fmt(salary.grossMonthly)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Deductions & Employer */}
        <div className="space-y-6">
          <div className="bg-dark-800 rounded-xl border border-dark-700">
            <div className="px-5 py-4 border-b border-dark-700">
              <h2 className="text-sm font-semibold text-white">Your Deductions (excl. PT &amp; TDS)</h2>
              <p className="text-xs text-dark-400 mt-1">Amounts withheld from your gross salary</p>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <tbody>
                  {salary.pfApplicable && (
                    <tr className="border-b border-dark-700/50">
                      <td className="py-2.5 text-dark-300">EPF — Employee (12%){salary.pfCappedAt15K ? ' — capped' : ''}</td>
                      <td className="py-2.5 text-right text-red-400 font-medium">₹{fmt(employeePf)}</td>
                    </tr>
                  )}
                  {salary.esiApplicable && (
                    <tr className="border-b border-dark-700/50">
                      <td className="py-2.5 text-dark-300">ESI — Employee (0.75%)</td>
                      <td className="py-2.5 text-right text-red-400 font-medium">₹{fmt(employeeEsi)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-dark-600">
                    <td className="py-2.5 text-white font-medium">Total</td>
                    <td className="py-2.5 text-right text-red-400 font-bold">₹{fmt(totalDeductions)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 text-dark-400 text-xs" colSpan={2}>
                      Professional Tax{ptState ? ` (${ptState} slab)` : ''} and TDS are computed during the payroll run and appear on your payslip — they are not estimated here.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Employer contributions — paid BY the company on top of gross.
              These are not withheld from the employee and must never be shown
              inside the deductions total (see payroll.js totalEmployerCost). */}
          {employerContributions > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700">
              <div className="px-5 py-4 border-b border-dark-700">
                <h2 className="text-sm font-semibold text-white">Employer Contributions (not deducted)</h2>
                <p className="text-xs text-dark-400 mt-1">Paid by the company on top of your gross — part of CTC, not of your take-home</p>
              </div>
              <div className="p-5">
                <table className="w-full text-sm">
                  <tbody>
                    {salary.pfApplicable && (
                      <tr className="border-b border-dark-700/50">
                        <td className="py-2.5 text-dark-300">EPF — Employer (12%){salary.pfCappedAt15K ? ' — capped' : ''}</td>
                        <td className="py-2.5 text-right text-dark-200 font-medium">₹{fmt(employerPf)}</td>
                      </tr>
                    )}
                    {salary.esiApplicable && (
                      <tr className="border-b border-dark-700/50">
                        <td className="py-2.5 text-dark-300">ESI — Employer (3.25%)</td>
                        <td className="py-2.5 text-right text-dark-200 font-medium">₹{fmt(employerEsi)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-dark-600">
                      <td className="py-2.5 text-white font-medium">Total Employer Cost</td>
                      <td className="py-2.5 text-right text-white font-bold">₹{fmt(employerContributions)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tax Summary */}
      {tax && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 mt-6">
          <div className="px-5 py-4 border-b border-dark-700 flex items-center gap-2">
            <Shield size={16} className="text-rivvra-400" />
            <h2 className="text-sm font-semibold text-white">Tax Summary — FY {tax.financialYear}</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-dark-400 mb-1">Regime</div>
                <div className="text-sm text-white font-medium capitalize">{tax.regime} Regime</div>
              </div>
              <div>
                <div className="text-xs text-dark-400 mb-1">YTD Gross</div>
                <div className="text-sm text-white font-medium">₹{fmt(tax.ytdGross)}</div>
              </div>
              <div>
                <div className="text-xs text-dark-400 mb-1">YTD TDS Paid</div>
                <div className="text-sm text-white font-medium">₹{fmt(tax.ytdTds)}</div>
              </div>
              <div>
                <div className="text-xs text-dark-400 mb-1">Months Processed</div>
                <div className="text-sm text-white font-medium">{tax.monthsProcessed}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statutory Details */}
      {statutory && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 mt-6">
          <div className="px-5 py-4 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-white">Statutory Details</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {statutory.panNumber && (
                <div>
                  <div className="text-xs text-dark-400 mb-1">PAN</div>
                  <div className="text-white">{statutory.panNumber}</div>
                </div>
              )}
              {statutory.pfNumber && (
                <div>
                  <div className="text-xs text-dark-400 mb-1">UAN</div>
                  <div className="text-white">{statutory.pfNumber}</div>
                </div>
              )}
              {statutory.esiNumber && (
                <div>
                  <div className="text-xs text-dark-400 mb-1">ESI Number</div>
                  <div className="text-white">{statutory.esiNumber}</div>
                </div>
              )}
              {statutory.ptState && (
                <div>
                  <div className="text-xs text-dark-400 mb-1">PT State</div>
                  <div className="text-white">{statutory.ptState}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Consultant-specific view ─── */
function ConsultantView({ salary, tax, statutory, employee, flatTdsRate, estimatedTds, netMonthly }) {
  const tdsPercentLabel = `${(flatTdsRate * 100).toFixed(flatTdsRate * 100 % 1 === 0 ? 0 : 1)}%`;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">My Compensation</h1>
        <p className="text-sm text-dark-400 mt-1">Your consultancy fee breakdown and TDS details</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
            <Briefcase size={14} /> Annual Compensation
          </div>
          <div className="text-2xl font-bold text-white">₹{fmt(salary.ctcAnnual)}</div>
          <div className="text-xs text-dark-500 mt-1">₹{fmt(salary.grossMonthly)}/month</div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
            <FileText size={14} /> TDS Deduction
          </div>
          <div className="text-2xl font-bold text-orange-400">₹{fmt(estimatedTds)}</div>
          <div className="text-xs text-dark-500 mt-1">Flat {tdsPercentLabel} on gross</div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
            <IndianRupee size={14} /> Net Take-Home (est.)
          </div>
          <div className="text-2xl font-bold text-green-400">₹{fmt(netMonthly)}</div>
          <div className="text-xs text-dark-500 mt-1">After TDS deduction</div>
        </div>
      </div>

      {/* Fee Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl border border-dark-700">
          <div className="px-5 py-4 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-white">Monthly Fee Breakdown</h2>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <tbody>
                {(salary.components || []).map((c, i) => (
                  <tr key={i} className="border-b border-dark-700/50 last:border-0">
                    <td className="py-2.5 text-dark-300">{c.name}</td>
                    <td className="py-2.5 text-right text-white font-medium">₹{fmt(c.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-dark-600">
                  <td className="py-2.5 text-white font-semibold">Gross Fee</td>
                  <td className="py-2.5 text-right text-white font-bold">₹{fmt(salary.grossMonthly)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Deductions */}
        <div className="bg-dark-800 rounded-xl border border-dark-700">
          <div className="px-5 py-4 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-white">Deductions</h2>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dark-700/50">
                  <td className="py-2.5 text-dark-300">TDS ({tdsPercentLabel})</td>
                  <td className="py-2.5 text-right text-red-400 font-medium">₹{fmt(estimatedTds)}</td>
                </tr>
                <tr className="border-t border-dark-600">
                  <td className="py-2.5 text-white font-semibold">Net Payable</td>
                  <td className="py-2.5 text-right text-green-400 font-bold">₹{fmt(netMonthly)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-3 bg-dark-900/50 rounded-lg px-3 py-2">
              <p className="text-xs text-dark-400">
                TDS is deducted at source under Section 194C/194J. No PF, ESI, or PT applicable for consultants.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* YTD Tax Summary */}
      {tax && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 mt-6">
          <div className="px-5 py-4 border-b border-dark-700 flex items-center gap-2">
            <Shield size={16} className="text-rivvra-400" />
            <h2 className="text-sm font-semibold text-white">TDS Summary — FY {tax.financialYear}</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-dark-400 mb-1">YTD Gross Paid</div>
                <div className="text-sm text-white font-medium">₹{fmt(tax.ytdGross)}</div>
              </div>
              <div>
                <div className="text-xs text-dark-400 mb-1">YTD TDS Deducted</div>
                <div className="text-sm text-white font-medium">₹{fmt(tax.ytdTds)}</div>
              </div>
              <div>
                <div className="text-xs text-dark-400 mb-1">Months Processed</div>
                <div className="text-sm text-white font-medium">{tax.monthsProcessed}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAN */}
      {statutory?.panNumber && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 mt-6">
          <div className="px-5 py-4 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-white">Tax Details</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-dark-400 mb-1">PAN</div>
                <div className="text-white">{statutory.panNumber}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
