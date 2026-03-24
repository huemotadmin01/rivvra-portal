import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { useAuth } from '../context/AuthContext';
import { usePlatform } from '../context/PlatformContext';
import employeeApi from '../utils/employeeApi';
import { Loader2 } from 'lucide-react';

/**
 * OnboardingGate — wraps the AppLauncherPage route.
 * Checks if the authenticated user has a linked employee record
 * with onboardingStatus !== 'completed'. If so, redirects to the
 * onboarding wizard. Non-employee users pass through unaffected.
 */
export default function OnboardingGate({ children }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (!currentOrg?.slug || !user) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    employeeApi
      .checkOnboarding(currentOrg.slug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.needsOnboarding) {
          setNeedsOnboarding(true);
          navigate(orgPath('/employee/onboarding'), { replace: true });
        }
      })
      .catch(() => {
        // Not an employee or error — proceed normally
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrg?.slug, user?._id]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={28} className="animate-spin text-dark-400" />
      </div>
    );
  }

  if (needsOnboarding) return null;
  return children;
}
