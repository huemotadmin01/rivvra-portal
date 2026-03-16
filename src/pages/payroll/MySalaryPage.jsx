import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getMySalary, getMyTax } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { IndianRupee, Briefcase, Shield, TrendingUp } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function MySalaryPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [salary, setSalary] = useState(null);
  const [statutory, setStatutory] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [tax, setTax] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [salRes, taxRes] = await Promise.all([
          getMySalary(orgSlug),
          getMyTax(orgSlug),
        ]);
        setSalary(salRes.salary);
        setStatutory(salRes.statutory);
        setEmployee(salRes.employee);
        setTax(taxRes.tax);
      } catch (err) {
        if (err.response?.status !== 404) showToast('Failed to load salary', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [orgSlug]);

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

  const basic = salary.components?.find(c => c.name === 'Basic');
  const hra = salary.components?.find(c => c.name === 'HRA');
  const special = salary.components?.find(c => c.name === 'Special Allowance');
  const pfBase = salary.pfCappedAt15K ? Math.min(basic?.amount || 0, 15000) : (basic?.amount || 0);
  const employeePf = salary.pfApplicable ? Math.round(pfBase * 0.12) : 0;
  const employeeEsi = salary.esiApplicable ? Math.round(salary.grossMonthly * 0.0075) : 0;
  const totalDeductions = employeePf + employeeEsi;
  const netMonthly = salary.grossMonthly - totalDeductions;

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
          <div className="text-xs text-dark-500 mt-1">Before TDS</div>
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
              <h2 className="text-sm font-semibold text-white">Employee Deductions</h2>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <tbody>
                  {salary.pfApplicable && (
                    <tr className="border-b border-dark-700/50">
                      <td className="py-2.5 text-dark-300">EPF (Employee 12%){salary.pfCappedAt15K ? ' — capped' : ''}</td>
                      <td className="py-2.5 text-right text-red-400 font-medium">₹{fmt(employeePf)}</td>
                    </tr>
                  )}
                  {salary.esiApplicable && (
                    <tr className="border-b border-dark-700/50">
                      <td className="py-2.5 text-dark-300">ESI (0.75%)</td>
                      <td className="py-2.5 text-right text-red-400 font-medium">₹{fmt(employeeEsi)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-2.5 text-dark-400 text-xs">PT & TDS deducted at payroll run time</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-dark-800 rounded-xl border border-dark-700">
            <div className="px-5 py-4 border-b border-dark-700">
              <h2 className="text-sm font-semibold text-white">Employer Contributions</h2>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <tbody>
                  {salary.pfApplicable && (
                    <tr className="border-b border-dark-700/50">
                      <td className="py-2.5 text-dark-300">EPF (Employer 12%)</td>
                      <td className="py-2.5 text-right text-dark-300">₹{fmt(salary.employerPf)}</td>
                    </tr>
                  )}
                  {salary.esiApplicable && (
                    <tr className="border-b border-dark-700/50">
                      <td className="py-2.5 text-dark-300">ESI (Employer 3.25%)</td>
                      <td className="py-2.5 text-right text-dark-300">₹{fmt(salary.employerEsi)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
