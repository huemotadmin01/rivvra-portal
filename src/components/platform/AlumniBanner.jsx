import { useOrg } from '../../context/OrgContext';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';

/**
 * AlumniBanner — Top-of-page notice for post-separation read-only users.
 *
 * Rendered alongside TrialBanner in the platform layout. Visible only to
 * users whose org_membership.status is 'alumni' or 'archived'. Drives
 * awareness of the cutoff date and the fact that the portal is now
 * read-only.
 *
 * Phases (see src/helpers/alumniHelper.js on the backend):
 *   'a'        — within 90 days of LWD (amber)
 *   'b'        — tax-filing window for confirmed employees (orange)
 *   'archived' — access ended (red — rarely rendered, auth blocks earlier)
 */
function AlumniBanner() {
  const { currentOrg, alumniPhase, alumniCutoffAt, alumniDaysRemaining } = useOrg();

  if (alumniPhase === 'active' || !currentOrg) return null;

  const orgName = currentOrg?.name || 'this organization';
  const cutoffStr = alumniCutoffAt
    ? alumniCutoffAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  if (alumniPhase === 'a') {
    return (
      <div className="px-4 py-2 flex items-center justify-center gap-3 text-sm bg-amber-500/20 border-b border-amber-500/30 text-amber-300">
        <Clock className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Read-only access to {orgName}.</strong>{' '}
          {cutoffStr && <>Your access ends on <strong>{cutoffStr}</strong>{alumniDaysRemaining !== null && ` (${alumniDaysRemaining} ${alumniDaysRemaining === 1 ? 'day' : 'days'} remaining)`}.</>}
          {' '}Download any payslips or documents you need before then.
        </span>
      </div>
    );
  }

  if (alumniPhase === 'b') {
    return (
      <div className="px-4 py-2 flex items-center justify-center gap-3 text-sm bg-orange-500/20 border-b border-orange-500/30 text-orange-300">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Tax-filing window.</strong>{' '}
          {cutoffStr && <>Your access to {orgName} ends on <strong>{cutoffStr}</strong>{alumniDaysRemaining !== null && ` (${alumniDaysRemaining} ${alumniDaysRemaining === 1 ? 'day' : 'days'} remaining)`}.</>}
          {' '}Password reset now goes to your registered personal email for security.
        </span>
      </div>
    );
  }

  if (alumniPhase === 'archived') {
    return (
      <div className="px-4 py-2 flex items-center justify-center gap-3 text-sm bg-red-500/20 border-b border-red-500/30 text-red-300">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>Access ended.</strong> Please contact the admin of {orgName} if you need historical documents.
        </span>
      </div>
    );
  }

  return null;
}

export default AlumniBanner;
