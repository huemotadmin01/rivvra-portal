import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import fnfApi from '../../utils/fnfApi';
import { formatMoney } from '../../utils/formatCurrency';
import {
  Calculator, AlertTriangle,
  ArrowRight, User, Calendar,
} from 'lucide-react';
import { Button, Chip, EmptyState, PageHeader, SearchInput, Spinner, Stat } from '../../components/ds';

// Settlement statuses in the order an admin walks through them.
/* ============================================================================
 * FnFDashboardV2 — Full & Final settlements on ds (phase 7)
 * ============================================================================
 * Byte-identical copy of FnFDashboard.jsx with only presentation rewritten.
 * Nothing that decides a number or a state was touched:
 *
 *   - `fmtINR` still returns an em-dash for null/undefined and otherwise
 *     defers to the shared `formatMoney`. A settlement that has not been
 *     calculated must not render as ₹0 — "Not calculated" and ₹0 mean
 *     different things to the person being paid.
 *   - the sign of `netSettlement` still drives both its colour and the
 *     "Recoverable from employee" note. A negative settlement means the
 *     employee owes the company, and that has to stay unmistakable.
 *   - the merge of pending employees with settlements, the backend
 *     `fnfStage` with its local fallback, and the load-error branch that
 *     stops an API failure masquerading as an empty list, all carry over
 *     unchanged.
 *
 * Money parity proven with scripts/money-parity.js against staging.
 * ========================================================================== */

// Tone by meaning. `finalized` and `paid` are both settled outcomes; the Chip
// label distinguishes them, so both take `brand` rather than inventing an
// accent for one status.
const STATUS_CONFIG = {
  not_started: { label: 'Not started', tone: 'neutral' },
  draft:       { label: 'Draft',       tone: 'warn' },
  finalized:   { label: 'Finalized',   tone: 'brand' },
  // 'paid' was missing and fell back to the "Not started" label.
  paid:        { label: 'Paid',        tone: 'brand' },
};

// draft → finalized → paid, so the row shows how far along a settlement is and
// what the next action is.
const PROGRESS_STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'finalized', label: 'Finalized' },
  { key: 'paid', label: 'Paid' },
];

const NEXT_ACTION = {
  not_started: 'Calculate settlement',
  draft: 'Review & finalize',
  finalized: 'Mark as paid',
  paid: null,
};

// Module scope — never declare a component inside a render body.
function SettlementProgress({ status }) {
  const reached = PROGRESS_STEPS.findIndex(s => s.key === status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      title={`Settlement progress: ${(STATUS_CONFIG[status] || STATUS_CONFIG.not_started).label}`}>
      {PROGRESS_STEPS.map((step, i) => (
        <span key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: i <= reached ? 'var(--brand)' : 'var(--surface-4)',
          }} />
          <span style={{
            font: `450 10px/1.3 ${FONT}`,
            color: i <= reached ? 'var(--fg-2)' : 'var(--fg-4)',
          }}>
            {step.label}
          </span>
          {i < PROGRESS_STEPS.length - 1 && (
            <span style={{
              width: 12, height: 1,
              background: i < reached ? 'var(--brand)' : 'var(--line-2)',
            }} />
          )}
        </span>
      ))}
    </div>
  );
}

// Stage = backend-computed lifecycle category for the row
const STAGE_CONFIG = {
  scheduled: { label: 'Exit scheduled',      tone: 'info' },
  pending:   { label: 'Awaiting settlement', tone: 'warn' },
  settled:   { label: 'Settled',             tone: 'brand' },
};

const FONT = "'Inter', system-ui, sans-serif";
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtINR(n) {
  if (n === null || n === undefined) return '—';
  return formatMoney(n);
}

export default function FnFDashboardV2() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const [pending, setPending] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // all | scheduled | pending | settled
  const [loadError, setLoadError] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, [orgSlug, currentCompany?._id]);

  async function loadAll() {
    setLoading(true);
    setPending([]);
    setSettlements([]);
    setLoadError(null);
    try {
      const [pendingRes, settRes] = await Promise.all([
        fnfApi.getPending(orgSlug),
        fnfApi.listSettlements(orgSlug),
      ]);
      setPending(pendingRes.data || []);
      setSettlements(settRes.data || []);
    } catch (e) {
      // Without this, an auth/API failure rendered the "No separated confirmed
      // employees" empty state with zeroed stat cards — indistinguishable from
      // a genuinely empty list.
      console.error(e);
      setLoadError(e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Failed to load F&F settlements');
    }
    finally { setLoading(false); }
  }

  // Merge pending (employees) with settlements
  const merged = pending.map(emp => {
    const sett = settlements.find(s => s.employeeId === emp._id?.toString());
    // Use backend-provided fnfStage when available; otherwise derive locally for safety
    const status = sett?.status || emp.fnfStatus || 'not_started';
    let stage = emp.fnfStage;
    if (!stage) {
      if (status === 'finalized' || status === 'paid') stage = 'settled';
      else if (emp.status === 'active' && emp.lastWorkingDate) stage = 'scheduled';
      else stage = 'pending';
    }
    return {
      ...emp,
      fnfStatus: status,
      fnfStage: stage,
      netSettlement: sett?.netSettlement,
      finalizedAt: sett?.finalizedAt,
      updatedAt: sett?.updatedAt,
    };
  });

  const filtered = merged.filter(e => {
    if (tab !== 'all' && e.fnfStage !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (e.fullName || '').toLowerCase().includes(q) ||
        (e.employeeId || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: merged.length,
    scheduled: merged.filter(e => e.fnfStage === 'scheduled').length,
    pending: merged.filter(e => e.fnfStage === 'pending').length,
    settled: merged.filter(e => e.fnfStage === 'settled').length,
  };

  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
      <Spinner label="Loading exits and settlements…" />
    </div>
  );

  // Distinct from the empty state on purpose: a failed load must never look
  // like "nobody is awaiting settlement".
  if (loadError) return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 620 }}>
      <EmptyState
        icon={<AlertTriangle size={22} />}
        tone="danger"
        title="Couldn't load F&F settlements"
        actions={<Button variant="secondary" onClick={loadAll}>Retry</Button>}
      >
        {loadError} — the list could not be loaded, so this is not an empty result.
      </EmptyState>
    </div>
  );

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Calculator size={18} /> Full &amp; Final Settlements
          </span>
        }
        sub="Final dues for employees who are leaving or have left. Each settlement moves draft → finalized → paid."
      />

      {/* Stats — each tile filters the list below it. */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          { key: 'all',       label: 'All exits',           hint: 'Everyone listed below',     value: stats.total,     color: 'var(--fg-3)' },
          { key: 'scheduled', label: 'Exit scheduled',      hint: 'Still working, LWD is set', value: stats.scheduled, color: 'var(--info)' },
          { key: 'pending',   label: 'Awaiting settlement', hint: 'Needs your action',         value: stats.pending,   color: 'var(--warn)' },
          { key: 'settled',   label: 'Settled',             hint: 'Finalized or paid',         value: stats.settled,   color: 'var(--brand)' },
        ].map(s => (
          <Stat
            key={s.key}
            label={s.label}
            value={s.value}
            note={s.hint}
            color={s.color}
            title={`Show only: ${s.label}`}
            onClick={() => setTab(s.key)}
            style={tab === s.key
              ? { boxShadow: '0 0 0 1px var(--brand-line), var(--lift)' }
              : undefined}
          />
        ))}
      </div>

      {/* Search — client-side over the rows already loaded */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, employee code or email…"
          width={320}
        />
        <span style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>
          Showing {filtered.length} of {merged.length}
          {tab !== 'all' && ` · ${(STAGE_CONFIG[tab] || {}).label || tab} only`}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        merged.length === 0 ? (
          <EmptyState icon={<Calculator size={22} />} title="No exits to settle">
            Employees appear here once they have a last working day set or have been marked as
            separated. Their final dues — unpaid salary, leave encashment, notice recovery — are
            then settled from this page.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Calculator size={22} />}
            title="No employee matches your search or filter"
            actions={
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTab('all'); }}>
                Clear search and filters
              </Button>
            }
          />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(emp => {
            const st = STATUS_CONFIG[emp.fnfStatus] || STATUS_CONFIG.not_started;
            const stage = STAGE_CONFIG[emp.fnfStage] || STAGE_CONFIG.pending;
            const hasSettlement = emp.netSettlement !== undefined && emp.netSettlement !== null;
            return (
              <button
                key={emp._id}
                type="button"
                onClick={() => navigate(orgPath(`/employee/${emp._id}`))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                  padding: 14, border: 'none', borderRadius: 'var(--r-3)', cursor: 'pointer',
                  background: 'var(--surface-1)',
                  boxShadow: '0 0 0 1px var(--line), var(--lift)',
                }}
              >
                <span style={{
                  width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: 999, background: 'var(--surface-3)',
                }}>
                  <User size={17} style={{ color: 'var(--fg-4)' }} />
                </span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{
                      font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)', minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {emp.fullName}
                    </span>
                    <Chip tone={stage.tone} dot>{stage.label}</Chip>
                    {emp.fnfStatus !== 'not_started' && <Chip tone={st.tone} dot>{st.label}</Chip>}
                  </span>

                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 3,
                    font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)',
                  }}>
                    <span style={{ textTransform: 'capitalize' }}>{emp.status}</span>
                    {emp.lastWorkingDate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Last working day">
                        <Calendar size={10} /> Last working day: {fmtDate(emp.lastWorkingDate)}
                      </span>
                    )}
                    {emp.separationReason && <span>{emp.separationReason}</span>}
                  </span>

                  <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                    <SettlementProgress status={emp.fnfStatus} />
                    {NEXT_ACTION[emp.fnfStatus] && (
                      <span style={{ font: `450 10px/1.3 ${FONT}`, color: 'var(--warn-ink)' }}>
                        Next: {NEXT_ACTION[emp.fnfStatus]}
                      </span>
                    )}
                  </span>
                </span>

                {/* A negative net settlement means the employee owes the
                    company. Sign drives the colour AND the note — both kept. */}
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  {hasSettlement ? (
                    <>
                      <span style={{ display: 'block', font: `450 10px/1.3 ${FONT}`, color: 'var(--fg-4)' }}>
                        Net settlement
                      </span>
                      <span style={{
                        display: 'block', font: `550 13px/1.4 ${FONT}`, marginTop: 2,
                        fontVariantNumeric: 'tabular-nums',
                        color: emp.netSettlement >= 0 ? 'var(--brand-ink)' : 'var(--danger)',
                      }}>
                        {fmtINR(emp.netSettlement)}
                      </span>
                      {emp.netSettlement < 0 && (
                        <span style={{ display: 'block', font: `450 10px/1.3 ${FONT}`, color: 'var(--danger)', marginTop: 1 }}>
                          Recoverable from employee
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)' }}
                      title="No settlement calculated yet">
                      Not calculated
                    </span>
                  )}
                </span>

                <ArrowRight size={16} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
