import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { getAppById } from '../config/apps';
import { Lock, Home } from 'lucide-react';

function NoAccessPage({ appId }) {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const app = getAppById(appId);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-6 text-center">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
        <Lock className="w-8 h-8 text-amber-400" />
      </div>

      {/* Heading */}
      <h1 className="text-xl font-bold text-white mb-2">
        No Access to {app?.name || 'this app'}
      </h1>

      {/* Description */}
      <p className="text-dark-400 text-sm max-w-md mb-8 leading-relaxed">
        You don't have permission to access {app?.name || 'this application'}.
        Contact your organization admin to request access.
      </p>

      {/* Go Home button */}
      <button
        onClick={() => navigate(orgPath('/home'))}
        className="flex items-center gap-2 px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
      >
        <Home className="w-4 h-4" />
        Go to Home
      </button>
    </div>
  );
}

export default NoAccessPage;
