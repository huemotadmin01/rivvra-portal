import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { usePlatform } from '../context/PlatformContext';
import api from '../utils/api';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';

/**
 * Shown to org owners/admins when any plan-capped metric (records / seats /
 * storage) is at ≥90% of its limit. Pairs with the daily usage-warning email
 * cron — this is the in-app nudge. Fetches usage once per session; legacy
 * (uncapped) plans never render anything. Dismissible per session.
 */
export default function UsageWarningBanner() {
  const { orgSlug, isOrgOwner, isOrgAdmin } = useOrg();
  const { orgPath } = usePlatform();
  const [dismissed, setDismissed] = useState(false);
  const [worst, setWorst] = useState(null); // { label, pct, atLimit }

  const canSee = isOrgOwner || isOrgAdmin;

  useEffect(() => {
    if (!orgSlug || !canSee) return;
    let cancelled = false;
    api.getOrgUsage(orgSlug)
      .then((res) => {
        if (cancelled || !res?.success || res.exempt || !res.limits) return;
        const u = res.usage || {};
        const l = res.limits || {};
        const metrics = [
          { label: 'records', used: u.records, limit: l.records },
          { label: 'seats', used: u.seats, limit: l.seats },
          { label: 'storage', used: u.storageBytes, limit: l.storageGb ? l.storageGb * 1024 * 1024 * 1024 : null },
        ];
        let top = null;
        for (const m of metrics) {
          if (!m.limit) continue;
          const pct = (m.used || 0) / m.limit;
          if (pct >= 0.9 && (!top || pct > top.pct)) top = { label: m.label, pct, atLimit: pct >= 1 };
        }
        if (top) setWorst(top);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug, canSee]);

  if (!worst || dismissed || !canSee) return null;

  const pctDisplay = Math.min(100, Math.round(worst.pct * 100));
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm ${
      worst.atLimit ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'
    }`}>
      <AlertTriangle className={`w-4 h-4 shrink-0 ${worst.atLimit ? 'text-red-400' : 'text-amber-400'}`} />
      <span className="text-dark-200 flex-1">
        {worst.atLimit
          ? <>Your workspace has <span className="font-medium text-white">reached its {worst.label} limit</span> — new {worst.label} can't be added until you upgrade or free up space.</>
          : <>Your workspace has used <span className="font-medium text-white">{pctDisplay}% of its {worst.label} limit</span>.</>}
      </span>
      <Link
        to={orgPath('/upgrade')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
          worst.atLimit ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-amber-500 hover:bg-amber-400 text-dark-950'
        }`}
      >
        View plans <ArrowRight className="w-3.5 h-3.5" />
      </Link>
      <button onClick={() => setDismissed(true)} className="text-dark-400 hover:text-white p-1" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
