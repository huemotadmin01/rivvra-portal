import { Outlet } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTimesheetContext } from '../context/TimesheetContext';
import { Loader2, Building2 } from 'lucide-react';

/**
 * ESSCompanyGate — Route-level gate that ensures ESS (Timesheet) only shows
 * data for the employee's assigned company.
 *
 * Option A: ESS ignores the company switcher entirely.
 * - If the currently selected company matches the employee's companyId → render routes
 * - If mismatched → show "ESS is available under [Company Name]" message
 * - Admins bypass this gate (they manage all employees)
 * - If employee has no companyId → allow through (legacy / org-level employees)
 */
function ESSCompanyGate() {
  const { currentCompany, companies, loading: companyLoading } = useCompany();
  const { timesheetUser, loading: tsLoading } = useTimesheetContext();

  // Still loading → show spinner
  if (companyLoading || tsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  // No timesheetUser yet (not in timesheet routes or no employee record) → pass through
  if (!timesheetUser) return <Outlet />;

  // Admins bypass company gate — they need access across all companies
  if (timesheetUser.role === 'admin') return <Outlet />;

  // No companyId on employee → legacy/org-level employee, allow through
  if (!timesheetUser.companyId) return <Outlet />;

  // No current company selected (single company orgs) → allow through
  if (!currentCompany) return <Outlet />;

  // Company match → render ESS
  const empCompanyId = String(timesheetUser.companyId);
  const selectedCompanyId = String(currentCompany._id);
  if (empCompanyId === selectedCompanyId) return <Outlet />;

  // Mismatch — find the employee's company name
  const empCompany = companies.find(c => String(c._id) === empCompanyId);
  const empCompanyName = empCompany?.name || 'your assigned company';

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="bg-dark-800 border border-dark-700 rounded-2xl p-8 max-w-md text-center space-y-4">
        <div className="w-14 h-14 bg-dark-700 rounded-full flex items-center justify-center mx-auto">
          <Building2 size={24} className="text-dark-400" />
        </div>
        <h2 className="text-xl font-bold text-white">ESS Not Available</h2>
        <p className="text-dark-400 text-sm leading-relaxed">
          Employee Self Service is available under <strong className="text-white">{empCompanyName}</strong>.
          Please switch to that company from the company selector to access your ESS data.
        </p>
      </div>
    </div>
  );
}

export default ESSCompanyGate;
