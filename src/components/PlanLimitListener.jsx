import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';

/**
 * Listens for the global `rivvra:plan-limit` event (dispatched by the API
 * client on a 402 with a known plan-cap code) and surfaces an "upgrade to
 * continue" warning toast. Mount once inside ToastProvider.
 */
export default function PlanLimitListener() {
  const { showToast } = useToast();
  useEffect(() => {
    const handler = (e) => {
      const base = e?.detail?.error || "You've reached a plan limit.";
      showToast(`${base} Open Billing → Upgrade to continue.`, 'warning');
    };
    window.addEventListener('rivvra:plan-limit', handler);
    return () => window.removeEventListener('rivvra:plan-limit', handler);
  }, [showToast]);
  return null;
}
