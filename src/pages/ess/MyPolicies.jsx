// ============================================================================
// MyPolicies.jsx — ESS: company policies the logged-in employee can view
// ============================================================================
// Reachable from the TopBar user menu by ANY authenticated member (no app /
// country gate). Lists policies that apply to the caller's employee record in
// the active company, grouped by category, with inline PDF preview, download,
// and optional click-to-acknowledge.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, FileText, CheckCircle2, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePolicyAck } from '../../context/PolicyAckContext';
import { api } from '../../utils/api';
import PolicyReaderModal from './PolicyReaderModal';

const CATEGORY_LABELS = {
  HR: 'HR',
  Payroll: 'Payroll',
  Leave: 'Leave & Attendance',
  Conduct: 'Code of Conduct',
  IT_Security: 'IT & Data Security',
  Statutory: 'Statutory & Compliance',
  Other: 'Other',
};
const CATEGORY_ORDER = ['Conduct', 'HR', 'Leave', 'Payroll', 'IT_Security', 'Statutory', 'Other'];

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function MyPolicies() {
  const { orgSlug } = useOrg();
  const { showToast } = useToast();
  const { refresh: refreshPendingBadge } = usePolicyAck();
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [policies, setPolicies] = useState([]);
  const [reading, setReading] = useState(null); // the policy open in the reader modal

  const load = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await api.request(`/api/org/${orgSlug}/policies/mine`);
      setPolicies(res.policies || []);
      setLinked(res.linked !== false);
    } catch {
      showToast('Failed to load policies', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { load(); }, [load]);

  // Called by the reader modal once the user has read + acknowledged.
  const acknowledgePolicy = useCallback(async (p) => {
    await api.request(`/api/org/${orgSlug}/policies/${p._id}/acknowledge`, { method: 'POST' });
    showToast('Policy acknowledged');
    await load();
    refreshPendingBadge(); // clear the home banner / avatar badge
  }, [orgSlug, showToast, load, refreshPendingBadge]);

  const pendingCount = policies.filter((p) => p.actionRequired).length;

  // Group by category, in a stable display order.
  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: policies.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rivvra-500/15 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-rivvra-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Company Policies</h1>
          <p className="text-dark-400 text-sm mt-0.5">Policies that apply to you</p>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            You have <span className="font-semibold">{pendingCount}</span> {pendingCount === 1 ? 'policy' : 'policies'} awaiting your acknowledgment.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-dark-500" />
        </div>
      ) : !linked ? (
        <div className="card p-8 text-center">
          <FileText className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-300 font-medium">No employee profile found</p>
          <p className="text-dark-500 text-sm mt-1">
            Company policies are shown to linked employees. Contact your administrator if you believe this is an error.
          </p>
        </div>
      ) : policies.length === 0 ? (
        <div className="card p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-300 font-medium">No policies yet</p>
          <p className="text-dark-500 text-sm mt-1">No company policies have been published for you.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2.5">
                {CATEGORY_LABELS[cat] || cat}
              </h2>
              <div className="space-y-2.5">
                {items.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => setReading(p)}
                    className="w-full text-left card p-4 flex items-center gap-4 hover:border-dark-600 hover:bg-dark-800/60 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4.5 h-4.5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-medium truncate">{p.title}</p>
                        {p.acknowledged ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Acknowledged
                          </span>
                        ) : p.actionRequired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-300">
                            <AlertTriangle className="w-3 h-3" /> Action required
                          </span>
                        ) : null}
                      </div>
                      {p.description && (
                        <p className="text-dark-400 text-sm mt-0.5 line-clamp-1">{p.description}</p>
                      )}
                      <p className="text-dark-500 text-xs mt-1.5">
                        {p.fileName} {p.size ? `· ${formatBytes(p.size)}` : ''}
                        {p.updatedAt ? ` · Updated ${new Date(p.updatedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 flex-shrink-0 text-sm text-dark-400 group-hover:text-white transition-colors">
                      <span className="hidden sm:inline">{p.actionRequired ? 'Read & acknowledge' : 'Read'}</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {reading && (
        <PolicyReaderModal
          policy={reading}
          orgSlug={orgSlug}
          onAcknowledge={acknowledgePolicy}
          onClose={() => setReading(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
