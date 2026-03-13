import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { Building2 } from 'lucide-react';
import AppGrid from '../components/platform/AppGrid';
import RivvraLogo from '../components/BrynsaLogo';
import api from '../utils/api';

function AppLauncherPage() {
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const firstName = user?.name?.split(' ')[0] || 'there';

  const companyLogoUrl = currentCompany?.hasLogo && currentCompany?._id
    ? `${api.baseUrl}/api/org-company/${currentCompany._id}/logo`
    : null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-3xl w-full">
        {/* Company Branding + Welcome — fade in + slide up */}
        <div className="text-center mb-10" style={{ animation: 'fadeSlideUp 0.5s ease-out both' }}>
          {/* Company Logo */}
          <div className="flex justify-center mb-4">
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={currentCompany?.name || ''}
                className="w-16 h-16 rounded-2xl object-contain bg-dark-800"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-rivvra-400" />
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {firstName}
          </h1>
          <p className="text-dark-400 text-lg">
            {currentCompany?.name || 'Your staffing agency command center'}
          </p>
        </div>

        {/* App Grid */}
        <AppGrid />

        {/* Powered by Rivvra */}
        <a
          href="https://rivvra.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 mt-12 opacity-40 hover:opacity-60 transition-opacity"
        >
          <RivvraLogo className="w-4 h-4" />
          <span className="text-xs text-dark-500">Powered by Rivvra</span>
        </a>
      </div>

      {/* Keyframes for animations */}
      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default AppLauncherPage;
