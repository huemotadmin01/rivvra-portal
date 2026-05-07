import { useOrg } from '../../context/OrgContext';
import { Clock, AlertTriangle, XCircle, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * TrialBanner — Displays trial status banner at top of the platform.
 * Shown only when org has an active trial, grace period, or archived status.
 * Hidden for 'none' (grandfathered) or 'converted' (paid) orgs.
 */
function TrialBanner() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  const trial = currentOrg?.trial;
  if (!trial || trial.status === 'none' || trial.status === 'converted') return null;

  const daysRemaining = trial.daysRemaining ?? 0;
  const slug = currentOrg?.slug;

  const handleUpgrade = () => {
    if (slug) navigate(`/org/${slug}/upgrade`);
  };

  // Active trial
  if (trial.status === 'active') {
    const isUrgent = daysRemaining <= 3;
    return (
      <div className={`px-4 py-2 flex items-center justify-center gap-3 text-sm ${
        isUrgent
          ? 'bg-red-500/20 border-b border-red-500/30 text-red-300'
          : 'bg-rivvra-500/15 border-b border-rivvra-500/30 text-rivvra-300'
      }`}>
        <Clock className="w-4 h-4 flex-shrink-0" />
        <span>
          {isUrgent ? (
            <strong>{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your trial!</strong>
          ) : (
            <>{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining in your free trial</>
          )}
        </span>
        <button
          onClick={handleUpgrade}
          className={`ml-2 px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            isUrgent
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-rivvra-500 hover:bg-rivvra-600 text-white'
          }`}
        >
          Upgrade Now
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Grace period (read-only)
  if (trial.status === 'grace') {
    return (
      <div className="px-4 py-2 flex items-center justify-center gap-3 text-sm bg-amber-500/20 border-b border-amber-500/30 text-amber-300">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Your trial has ended.</strong> Data is read-only.
          {daysRemaining > 0 && ` ${daysRemaining} days until archival.`}
          {' '}Upgrade to continue using all features.
        </span>
        <button
          onClick={handleUpgrade}
          className="ml-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-dark-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          Upgrade Now
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Archived
  if (trial.status === 'archived') {
    return (
      <div className="px-4 py-2 flex items-center justify-center gap-3 text-sm bg-red-500/20 border-b border-red-500/30 text-red-300">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Organization archived.</strong> Your data will be permanently deleted soon. Upgrade to restore access.
        </span>
        <button
          onClick={handleUpgrade}
          className="ml-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          Restore & Upgrade
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return null;
}

export default TrialBanner;
