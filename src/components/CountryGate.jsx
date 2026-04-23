// ============================================================================
// CountryGate — Route-level gate for country-specific apps
// ============================================================================
//
// Blocks access to apps whose logic is only implemented for a subset of
// countries (e.g. Payroll + ESS today are India-only because tax rules,
// leave policy, and statutory components are baked against Indian law).
//
// Usage:
//   <Route element={<CountryGate allowed={['IN']} appName="Payroll" />}>
//     <Route path="/payroll/..." element={...} />
//   </Route>
//
// When the current company's country isn't in the `allowed` list, renders
// a friendly empty state telling the user to switch companies. Otherwise
// renders the nested routes via <Outlet />.
// ============================================================================

import { Outlet } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { Loader2, Globe } from 'lucide-react';

const COUNTRY_LABELS = {
  IN: 'India',
  US: 'the United States',
  CA: 'Canada',
  GB: 'the United Kingdom',
};

export default function CountryGate({ allowed = ['IN'], appName = 'This app' }) {
  const { currentCompany, companyCountry, loading } = useCompany();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  // No company context yet (single-company org, or still initializing) → allow through
  if (!currentCompany) return <Outlet />;

  if (allowed.includes(companyCountry)) return <Outlet />;

  const countryLabel = COUNTRY_LABELS[companyCountry] || companyCountry || 'your country';
  const companyName = currentCompany?.name || 'this company';

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="bg-dark-800 border border-dark-700 rounded-2xl p-8 max-w-md text-center space-y-4">
        <div className="w-14 h-14 bg-dark-700 rounded-full flex items-center justify-center mx-auto">
          <Globe size={24} className="text-dark-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{appName} is not available yet</h2>
        <p className="text-dark-400 text-sm leading-relaxed">
          {appName} currently supports {allowed.map(c => COUNTRY_LABELS[c] || c).join(', ')} only.
          <br />
          <strong className="text-white">{companyName}</strong> is based in {countryLabel}, so {appName.toLowerCase()} features
          aren't enabled for it yet. Switch to a supported company from the header to use this app.
        </p>
      </div>
    </div>
  );
}
