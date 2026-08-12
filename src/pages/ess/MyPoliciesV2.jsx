// ============================================================================
// MyPoliciesV2.jsx — ESS company policies, on ds (phase 6a)
// ============================================================================
// Same data flow and gating as MyPolicies.jsx: reachable by ANY authenticated
// member (no app / country gate), lists policies applying to the caller's
// employee record in the active company, grouped by category, with the reader
// modal handling preview / download / acknowledge.
//
// PolicyReaderModal is still the legacy component — it owns the read-then-
// acknowledge flow, and acknowledgement is a compliance record, so it moves in
// its own change rather than riding along with a layout pass.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, FileText, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePolicyAck } from '../../context/PolicyAckContext';
import { api } from '../../utils/api';
import PolicyReaderModal from './PolicyReaderModal';
import { Chip, EmptyState, PageHeader, Panel, Spinner } from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

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

export default function MyPoliciesV2() {
  const { orgSlug } = useOrg();
  const { showToast } = useToast();
  const { refresh: refreshPendingBadge } = usePolicyAck();
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [policies, setPolicies] = useState([]);
  const [reading, setReading] = useState(null);

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

  const acknowledgePolicy = useCallback(async (p) => {
    await api.request(`/api/org/${orgSlug}/policies/${p._id}/acknowledge`, { method: 'POST' });
    showToast('Policy acknowledged');
    await load();
    refreshPendingBadge(); // clear the home banner / avatar badge
  }, [orgSlug, showToast, load, refreshPendingBadge]);

  const pendingCount = policies.filter((p) => p.actionRequired).length;
  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: policies.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 880 }}>
      <PageHeader title="Company Policies" sub="Policies that apply to you" style={{ marginBottom: 16 }} />

      {pendingCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, padding: '10px 14px',
          borderRadius: 'var(--r-2)', background: 'var(--warn-soft)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--warn) 26%, transparent)',
        }}>
          <AlertTriangle size={16} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-2)' }}>
            You have <strong style={{ color: 'var(--fg)' }}>{pendingCount}</strong>{' '}
            {pendingCount === 1 ? 'policy' : 'policies'} awaiting your acknowledgment.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : !linked ? (
        <EmptyState icon={<FileText size={22} />} tone="warn" title="No employee profile found">
          Company policies are shown to linked employees. Contact your administrator if you believe this is an error.
        </EmptyState>
      ) : policies.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="No policies yet">
          No company policies have been published for you.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(({ cat, items }) => (
            <section key={cat}>
              <h2 style={{
                font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.08em',
                color: 'var(--fg-4)', marginBottom: 8,
              }}>
                {CATEGORY_LABELS[cat] || cat}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((p) => (
                  <Panel key={p._id} style={{ cursor: 'pointer' }}>
                    <button
                      type="button"
                      onClick={() => setReading(p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                        textAlign: 'left', padding: 4, background: 'transparent',
                      }}
                    >
                      <span style={{
                        width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center',
                        borderRadius: 'var(--r-1)', background: 'var(--surface-3)',
                      }}>
                        <FileText size={15} style={{ color: 'var(--danger)' }} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>{p.title}</span>
                          {p.acknowledged ? (
                            <Chip tone="brand"><CheckCircle2 size={11} /> Acknowledged</Chip>
                          ) : p.actionRequired ? (
                            <Chip tone="warn"><AlertTriangle size={11} /> Action required</Chip>
                          ) : null}
                        </span>
                        {p.description && (
                          <span style={{
                            display: 'block', font: `450 12.5px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {p.description}
                          </span>
                        )}
                        <span style={{ display: 'block', font: `450 11px/1.5 ${FONT}`, color: 'var(--fg-4)', marginTop: 3 }}>
                          {p.fileName}{p.size ? ` · ${formatBytes(p.size)}` : ''}
                          {p.updatedAt ? ` · Updated ${new Date(p.updatedAt).toLocaleDateString()}` : ''}
                        </span>
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        font: `500 12.5px/1 ${FONT}`, color: 'var(--fg-4)',
                      }}>
                        {p.actionRequired ? 'Read & acknowledge' : 'Read'}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  </Panel>
                ))}
              </div>
            </section>
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
