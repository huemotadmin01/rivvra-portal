import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Loader2 } from 'lucide-react';

const METRICS = [
  { key: 'seats', label: 'Team members' },
  { key: 'records', label: 'Active records' },
  { key: 'outreachEmailsToday', label: 'Outreach emails (today)', limitKey: 'outreachEmailsPerDay' },
  { key: 'storageBytes', label: 'Storage', limitKey: 'storageGb', storage: true },
];

const GB = 1024 * 1024 * 1024;

function formatBytes(b) {
  if (!b) return '0 MB';
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${(b / (1024 * 1024)).toFixed(b >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * Shows the org's current usage vs plan limits as progress bars.
 * Self-fetches from GET /api/org/:slug/usage. Renders "Unlimited" for
 * exempt/legacy plans and null metric limits.
 */
export default function UsagePanel({ orgSlug }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgSlug) return;
    let alive = true;
    setLoading(true);
    api.getOrgUsage(orgSlug)
      .then((res) => { if (alive) setData(res); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orgSlug]);

  if (loading) {
    return (
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-6 mb-6 flex items-center gap-2 text-dark-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading usage…
      </div>
    );
  }
  if (!data) return null;

  const { limits, exempt, usage } = data;

  return (
    <div className="bg-dark-900 rounded-xl border border-dark-700 p-6 mb-6">
      <h2 className="text-sm font-semibold text-white mb-4">Your usage</h2>
      <div className="space-y-4">
        {METRICS.map((m) => {
          const used = usage?.[m.key] ?? 0;
          const rawLimit = exempt || !limits ? null : limits[m.limitKey || m.key];
          const unlimited = rawLimit === null || rawLimit === undefined;
          // Storage: used is bytes, limit is GB → normalize for the bar + labels.
          const limitForBar = m.storage && !unlimited ? rawLimit * GB : rawLimit;
          const pct = unlimited ? 0 : Math.min(100, Math.round((used / limitForBar) * 100));
          const over = !unlimited && used >= limitForBar;
          const usedLabel = m.storage ? formatBytes(used) : used.toLocaleString();
          const limitLabel = unlimited
            ? ' · Unlimited'
            : ` / ${m.storage ? `${rawLimit} GB` : rawLimit.toLocaleString()}`;
          return (
            <div key={m.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-dark-300">{m.label}</span>
                <span className={over ? 'text-red-400 font-medium' : 'text-dark-400'}>
                  {usedLabel}
                  {limitLabel}
                </span>
              </div>
              {!unlimited && (
                <div className="h-2 rounded-full bg-dark-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-rivvra-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {exempt && <p className="text-xs text-dark-500 mt-4">Your plan has no usage limits.</p>}
    </div>
  );
}
