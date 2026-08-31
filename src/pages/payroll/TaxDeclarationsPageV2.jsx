import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import {
  getTaxDeclarations, upsertTaxDeclaration, approveTaxDeclaration, getStatutoryConfigs,
  SECTION_80C_KEYS, SECTION_80D_KEYS, normalize80CItems, normalize80D,
  read80CTotal, read80DTotal,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
import { FileText, X, Search, Save, Loader2, CheckCircle2, Ban, AlertTriangle } from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, Input, Select, Textarea, Modal, Callout, PageSpinner, EmptyState,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// The ADMIN twin of MyTaxDeclarationsPage (#78). Saving here makes the backend
// recalculate TDS and reprocess the latest payroll run, and approving marks
// every uploaded proof verified — so everything above `return (` is spliced in
// verbatim, including the workflow tables and the row derivation.
//
// ⚠️ Divergence from the ESS twin, carried across unchanged and written up in
// REDESIGN-QA.md: this page hardcodes the 80C cap as `Math.min(150000, …)` and
// labels it "(Max ₹1,50,000)", while the ESS page fetches the same limit from
// `getPublicPlatformSetting('tax_declaration_sections')`. Change that setting
// and the two pages cap differently — and both write the section80CTotal that
// payroll reads.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Declaration workflow states, exactly as the backend writes them
 * (payroll.js: `provisional` / `pending_approval` on the ESS save, and
 * `approved` / `rejected` on the admin approve route).
 *
 * `declared` is NOT a backend value — it is how we label a declaration document
 * that carries no `status` at all, which is what an admin save through THIS page
 * produces (the admin PUT only sets status when the caller sends one, and we do
 * not send one). Calling those "provisional" would be inventing a workflow state
 * the record does not claim.
 *
 * The legacy class strings become Chip tones; `declared` and `not_declared` were
 * distinguished only by text brightness, so `not_declared` keeps a muted ink.
 */
const DECL_STATUS = {
  approved: { label: 'Approved', tone: 'brand' },
  pending_approval: { label: 'Awaiting approval', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'danger' },
  provisional: { label: 'Provisional', tone: 'info' },
  declared: { label: 'Declared', tone: 'neutral' },
  not_declared: { label: 'Not declared', tone: 'neutral', muted: true },
};

/** Order the filter chips appear in. `all` is synthetic. */
const FILTER_ORDER = ['all', 'not_declared', 'pending_approval', 'provisional', 'declared', 'approved', 'rejected'];

/** Which state a row is in. No document at all → `not_declared`. */
function declStatusKey(decl) {
  if (!decl) return 'not_declared';
  const s = decl.status;
  if (s === 'approved' || s === 'pending_approval' || s === 'rejected' || s === 'provisional') return s;
  return 'declared';
}

/**
 * Which approve/reject actions an admin may take from a given state.
 *
 * - `pending_approval` — the employee has submitted and is waiting on us. Both.
 * - `rejected` — the admin can change their mind without forcing the employee
 *   to resubmit an identical declaration, so Approve stays available.
 * - `approved` — Reject is offered as a reversal for an approval made in
 *   error. It is NOT symmetric: the backend verifies proofs on approve but
 *   does not un-verify them on reject, so the modal says so out loud.
 * - `provisional` / `declared` — a draft the employee has not submitted, or an
 *   admin-entered record that never entered the workflow. Approving a draft
 *   would lock in numbers the employee is still editing, so neither action is
 *   offered; use Edit instead.
 * - `not_declared` — no document exists, the backend 404s. Nothing to offer.
 */
function approvalActionsFor(statusKey) {
  if (statusKey === 'pending_approval') return ['approved', 'rejected'];
  if (statusKey === 'rejected') return ['approved'];
  if (statusKey === 'approved') return ['rejected'];
  return [];
}

/** Status pill. Module-level so it is never redefined during a render. */
function StatusBadge({ statusKey }) {
  const meta = DECL_STATUS[statusKey] || DECL_STATUS.not_declared;
  return (
    <Chip tone={meta.tone} style={meta.muted ? { color: 'var(--fg-4)' } : undefined}>
      {meta.label}
    </Chip>
  );
}

/** Label + right-aligned number, the shape both dialogs use repeatedly. */
function KV({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, font: "400 11.5px/1.4 'Inter', system-ui, sans-serif" }}>
      <span style={{ color: strong ? 'var(--fg-2)' : 'var(--fg-4)', fontWeight: strong ? 500 : 400 }}>{label}</span>
      <span style={{ color: strong ? 'var(--fg)' : 'var(--fg-2)', fontWeight: strong ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** Section heading inside a dialog. */
function Legend({ children }) {
  return (
    <div style={{
      font: "500 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
      borderBottom: '1px solid var(--line-2)', paddingBottom: 6, marginBottom: 10,
    }}>{children}</div>
  );
}

/** Label + right-aligned number input, used by every amount field. */
// Declared amounts. Coerce on blur AND again in handleSave — never on
// keystroke, which forced a 0 into every field the moment it was cleared.
// The save path spreads the form wholesale into `declarations` and the admin
// backend sums section80C with Object.values(), so a raw string must never
// reach it. Negatives and blanks both read as 0, matching the old `|| 0`.
const amt = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

function AmountRow({ label, value, onChange, onBlur, labelWidth = 160 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <label style={{ font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', width: labelWidth, flexShrink: 0 }}>
        {label}
      </label>
      <Input type="number" value={value} onChange={onChange} onBlur={onBlur} aria-label={label} style={{ width: 128, textAlign: 'right' }} />
    </div>
  );
}

export default function TaxDeclarationsPageV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { fyApi: fy } = usePeriod();
  const [declarations, setDeclarations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState(null);
  // Guard against a double-click firing two upserts — each one makes the backend
  // recalculate TDS and reprocess the latest payroll run.
  const [saving, setSaving] = useState(false);
  // Approve/reject confirmation. `{ row, action }` — `action` is exactly the
  // status string the backend accepts.
  const [approval, setApproval] = useState(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  // Per-row in-flight guard, keyed by employee id, so a double-click cannot
  // fire two approvals and other rows stay usable.
  const [approvingId, setApprovingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setDeclarations([]);
    setEmployees([]);
    try {
      const [declRes, empRes] = await Promise.all([
        getTaxDeclarations(orgSlug, fy),
        getStatutoryConfigs(orgSlug),
      ]);
      setDeclarations(declRes.declarations || []);
      setEmployees((empRes.data || []).map(d => d.employee));
    } catch { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id, fy]);

  const openEmployee = (emp) => {
    const decl = declarations.find(d => d.employeeId === emp._id.toString());
    const d = decl?.declarations || {};
    setForm({
      regime: decl?.regime || 'new',
      // Read through the shared normalizers so a document written by the ESS
      // page (scalar 80C, 80D keyed `self`) opens with the real amounts instead
      // of all zeros — saving used to WIPE the employee's declared 80C to zero,
      // after which the backend recalculated TDS without the deduction.
      section80C: normalize80CItems(d),
      section80D: normalize80D(d),
      section80E: Number(d.section80E) || 0,
      section80G: Number(d.section80G) || 0,
      section24b: Number(d.section24b) || 0,
      hra: {
        ...(d.hra || {}),
        rentPaidAnnual: Number(d.hra?.rentPaidAnnual) || (Number(d.hra?.rentPaidMonthly) || 0) * 12,
        cityType: d.hra?.cityType || 'non-metro',
      },
      // Whatever was already stored, so an admin save merges rather than
      // replaces (the backend swaps `declarations` out wholesale, which would
      // otherwise drop ESS-only fields such as landlord name/PAN).
      _stored: d,
    });
    setSelectedEmp(emp);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { _stored, ...clean } = form;
      // Every declared amount goes through `amt` before it leaves this
      // function. A field still focused when Save is clicked holds the raw
      // string, and the backend sums section80C with Object.values() — one
      // string would turn the total into concatenation or NaN.
      const mapAmounts = (obj) => Object.fromEntries(
        Object.entries(obj || {}).map(([k, v]) => [k, amt(v)])
      );
      const items = mapAmounts(clean.section80C);
      await upsertTaxDeclaration(orgSlug, selectedEmp._id.toString(), fy, {
        regime: form.regime,
        declarations: {
          ...(_stored || {}),
          ...clean,
          section80E: amt(clean.section80E),
          section80G: amt(clean.section80G),
          section24b: amt(clean.section24b),
          // `section80C` stays an OBJECT because the admin backend route
          // (payroll.js ~1373) computes section80CTotal via Object.values().
          // `section80CItems` is the canonical breakdown both pages read.
          section80C: items,
          section80CItems: items,
          section80D: mapAmounts(clean.section80D),
          hra: {
            ...(_stored?.hra || {}),
            ...clean.hra,
            rentPaidAnnual: amt(clean.hra?.rentPaidAnnual),
          },
        },
      });
      showToast('Declarations saved — payroll TDS recalculated', 'success');
      setSelectedEmp(null);
      await load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const openApproval = (row, action) => {
    setApprovalRemarks('');
    setApproval({ row, action });
  };

  const handleApproval = async () => {
    if (!approval || approvingId) return;
    const { row, action } = approval;
    const remarks = approvalRemarks.trim();
    // A rejection with no reason tells the employee nothing about what to fix.
    if (action === 'rejected' && !remarks) {
      showToast('Add a reason — the employee sees this remark.', 'error');
      return;
    }
    setApprovingId(row.empId);
    try {
      const res = await approveTaxDeclaration(orgSlug, row.empId, fy, action, remarks);
      const updated = res.declaration;
      // Refresh from the server's copy rather than guessing, so the badge, the
      // filter counts and the "N awaiting approval" summary all move together.
      // Keep the existing `employee` enrichment — the approve route returns the
      // bare declaration document without it.
      if (updated) {
        setDeclarations(prev => {
          const idx = prev.findIndex(d => d.employeeId === row.empId && d.financialYear === fy);
          if (idx === -1) return [{ ...updated, employee: row.emp }, ...prev];
          const next = [...prev];
          next[idx] = { ...prev[idx], ...updated };
          return next;
        });
      } else {
        await load();
      }
      showToast(action === 'approved'
        ? 'Declaration approved — uploaded proofs marked verified'
        : 'Declaration rejected — the employee can revise and resubmit', 'success');
      setApproval(null);
      setApprovalRemarks('');
    } catch (err) {
      // Surface what the backend actually said (India gate, wrong company,
      // declaration not found) instead of a generic failure.
      showToast(err.response?.data?.message || err.message || 'Failed to update declaration', 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const total80C = form ? Math.min(150000, Object.values(form.section80C).reduce((s, v) => s + (Number(v) || 0), 0)) : 0;
  const total80D = form ? Object.values(form.section80D).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const totalDecl = form ? total80C + total80D + (Number(form.section80E) || 0) + (Number(form.section80G) || 0) + (Number(form.section24b) || 0) : 0;

  const confirmedEmployees = employees.filter(e => e.employmentType === 'confirmed' && e.status !== 'separated');

  // Build every row once — status, the three per-section totals and the `Other`
  // split — so the table body, the summary line and the filter counts all read
  // from the same derivation instead of re-deriving inside JSX.
  const rows = confirmedEmployees.map(emp => {
    const empId = emp._id.toString();
    const decl = declarations.find(d => d.employeeId === empId);
    const d = decl?.declarations || {};
    // Read defensively: a doc saved by the ESS page carries a scalar 80C, one
    // saved here carries an itemized object. Both resolve.
    const t80c = read80CTotal(d);
    const t80d = read80DTotal(d);
    const s80e = Number(d.section80E) || 0;
    const s80g = Number(d.section80G) || 0;
    const s24b = Number(d.section24b) || 0;
    const tOther = s80e + s80g + s24b;
    return {
      emp, empId, decl,
      statusKey: declStatusKey(decl),
      t80c, t80d, s80e, s80g, s24b, tOther,
      total: t80c + t80d + tOther,
    };
  });

  // Re-read the row being approved from the freshly derived `rows` so the
  // confirmation shows current totals rather than the snapshot taken when the
  // button was clicked. Falls back to the snapshot if the row has since been
  // filtered out of the employee list.
  const approvalRow = approval
    ? (rows.find(r => r.empId === approval.row.empId) || approval.row)
    : null;

  // Counts over EVERY confirmed employee, not the filtered view, so the summary
  // line and the chips keep meaning while a search is active.
  const statusCounts = rows.reduce((acc, r) => {
    acc[r.statusKey] = (acc[r.statusKey] || 0) + 1;
    return acc;
  }, {});
  const totalEmployees = rows.length;
  // "Declared" = a declaration document exists for this FY, whatever state it is
  // in. An employee on the new regime with nothing to claim still counts as
  // declared — they responded; only `not_declared` rows have no record at all.
  const declaredCount = totalEmployees - (statusCounts.not_declared || 0);
  const awaitingCount = statusCounts.pending_approval || 0;

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (statusFilter !== 'all' && r.statusKey !== statusFilter) return false;
    if (!q) return true;
    return (r.emp.fullName || r.emp.name || '').toLowerCase().includes(q)
      || (r.emp.email || '').toLowerCase().includes(q);
  });

  // Only offer chips for states that actually occur (plus the two that always
  // matter), so an org that never uses the approval flow isn't shown five
  // permanently-empty filters.
  const visibleFilters = FILTER_ORDER.filter(k => (
    k === 'all' || k === 'not_declared' || k === 'pending_approval' || (statusCounts[k] || 0) > 0
  ));

  if (loading) return <PageSpinner label="Loading tax declarations…" />;

  const th = { padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', font: "500 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
  const num = { padding: '8px 12px', textAlign: 'right', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Tax Declarations"
        sub={(
          <>
            <span style={{ display: 'block' }}>80C, 80D, 80E, 80G, 24(b) declarations per employee — FY {fy}</span>
            <span style={{ display: 'block', marginTop: 5, color: 'var(--fg-2)' }}>
              <strong style={{ color: 'var(--fg)' }}>{declaredCount}</strong>
              <span style={{ color: 'var(--fg-4)' }}> of {totalEmployees} declared</span>
              {awaitingCount > 0 && (
                <>
                  <span style={{ color: 'var(--fg-faint)', margin: '0 6px' }}>·</span>
                  <strong style={{ color: 'var(--warn-ink)' }}>{awaitingCount} awaiting approval</strong>
                </>
              )}
            </span>
          </>
        )}
        actions={(
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
            <Input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." aria-label="Search employees" style={{ paddingLeft: 30 }} />
          </div>
        )}
      />

      {/* Status filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {visibleFilters.map(key => {
          const count = key === 'all' ? totalEmployees : (statusCounts[key] || 0);
          const active = statusFilter === key;
          return (
            <Button key={key} type="button" size="sm" variant={active ? 'primary' : 'secondary'} onClick={() => setStatusFilter(key)}>
              {key === 'all' ? 'All' : DECL_STATUS[key].label}
              {/* No `opacity` here. Opacity on the count blends it toward the
                  button fill, which lowers real contrast AND hides it from the
                  audit — the anti-pattern recorded under my-attendance. It
                  inherits the button ink instead. */}
              <span style={{ marginLeft: 6 }}>{count}</span>
            </Button>
          );
        })}
      </div>

      <Panel flush>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Employee</th>
                <th style={{ ...th, textAlign: 'left' }}>Status</th>
                <th style={{ ...th, textAlign: 'center' }}>Regime</th>
                <th style={th}>80C</th>
                <th style={th}>80D</th>
                {/* Was labelled just "Other", which hid the fact that three
                    unrelated sections are added together. Named for what it sums;
                    the cell carries the split as a tooltip. */}
                <th style={th}>80E + 80G + 24(b)</th>
                <th style={th}>Total</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.empId} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ font: "600 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                      {r.emp.fullName || r.emp.name || r.emp.email}
                    </div>
                    <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{r.emp.email}</div>
                  </td>
                  <td style={{ padding: '8px 12px' }}><StatusBadge statusKey={r.statusKey} /></td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <Chip tone={r.decl?.regime === 'old' ? 'warn' : 'info'}>
                      {r.decl?.regime === 'old' ? 'Old' : 'New'}
                    </Chip>
                  </td>
                  <td style={num}>{r.t80c > 0 ? formatMoney(r.t80c) : '-'}</td>
                  <td style={num}>{r.t80d > 0 ? formatMoney(r.t80d) : '-'}</td>
                  <td
                    style={num}
                    title={r.tOther > 0
                      ? `80E ${formatMoney(r.s80e)} · 80G ${formatMoney(r.s80g)} · 24(b) ${formatMoney(r.s24b)}`
                      : undefined}>
                    {r.tOther > 0 ? formatMoney(r.tOther) : '-'}
                  </td>
                  <td style={{ ...num, color: 'var(--fg)', fontWeight: 500 }}>{r.total > 0 ? formatMoney(r.total) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      {approvalActionsFor(r.statusKey).includes('approved') && (
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => openApproval(r, 'approved')}
                          disabled={approvingId === r.empId}
                          style={{ color: 'var(--brand-ink)' }}>
                          {r.statusKey === 'rejected' ? 'Approve instead' : 'Approve'}
                        </Button>
                      )}
                      {approvalActionsFor(r.statusKey).includes('rejected') && (
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => openApproval(r, 'rejected')}
                          disabled={approvingId === r.empId}
                          style={{ color: 'var(--danger)' }}>
                          {r.statusKey === 'approved' ? 'Reverse' : 'Reject'}
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEmployee(r.emp)}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            totalEmployees === 0 ? (
              <EmptyState
                icon={<FileText size={22} />}
                title="No confirmed employees"
              >
                Tax declarations apply to confirmed employees only. Add or confirm employees to see them here.
              </EmptyState>
            ) : (
              <EmptyState
                icon={<Search size={22} />}
                title="No employee matches your search or filter"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                    Clear search and filters
                  </Button>
                }
              />
            )
          )}
        </div>
      </Panel>

      {/* ── Edit dialog ── */}
      <Modal
        open={!!(selectedEmp && form)}
        onClose={() => setSelectedEmp(null)}
        size="md"
        icon={<FileText size={18} />}
        title="Tax Declarations"
        sub={selectedEmp ? `${selectedEmp.fullName || selectedEmp.email} — FY ${fy}` : undefined}
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => setSelectedEmp(null)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}
              iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      >
        {selectedEmp && form && (
          <div style={{ display: 'grid', gap: 18 }}>
            <div>
              <StatusBadge statusKey={declStatusKey(declarations.find(d => d.employeeId === selectedEmp._id.toString()))} />
            </div>

            {/* Regime */}
            <div style={{ display: 'grid', gap: 10 }}>
              <Legend>Tax Regime</Legend>
              <div style={{ display: 'flex', gap: 18 }}>
                {[['new', 'New Regime'], ['old', 'Old Regime']].map(([value, label]) => (
                  <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
                    <input type="radio" name="regime" checked={form.regime === value}
                      onChange={() => setForm(f => ({ ...f, regime: value }))}
                      style={{ accentColor: 'var(--brand)' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {form.regime === 'old' && (
              <>
                {/* 80C */}
                <div style={{ display: 'grid', gap: 8 }}>
                  <Legend>
                    Section 80C <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>(Max ₹1,50,000)</span>
                  </Legend>
                  {SECTION_80C_KEYS.map(([key, label]) => (
                    <AmountRow key={key} label={label} value={form.section80C[key]}
                      onChange={e => setForm(f => ({ ...f, section80C: { ...f.section80C, [key]: e.target.value } }))}
                      onBlur={e => setForm(f => ({ ...f, section80C: { ...f.section80C, [key]: amt(e.target.value) } }))} />
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 8, borderTop: '1px solid var(--line-2)' }}>
                    <span style={{ font: "500 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Total 80C (capped)</span>
                    <span style={{ font: "700 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(total80C)}
                    </span>
                  </div>
                </div>

                {/* 80D */}
                <div style={{ display: 'grid', gap: 8 }}>
                  <Legend>Section 80D (Medical Insurance)</Legend>
                  {SECTION_80D_KEYS.map(([key, label]) => (
                    <AmountRow key={key} label={label} value={form.section80D[key]}
                      onChange={e => setForm(f => ({ ...f, section80D: { ...f.section80D, [key]: e.target.value } }))}
                      onBlur={e => setForm(f => ({ ...f, section80D: { ...f.section80D, [key]: amt(e.target.value) } }))} />
                  ))}
                </div>

                {/* Other sections */}
                <div style={{ display: 'grid', gap: 8 }}>
                  <Legend>Other Deductions</Legend>
                  {[['section80E', '80E (Education Loan Interest)'], ['section80G', '80G (Donations)'], ['section24b', '24(b) (Home Loan Interest)']].map(([key, label]) => (
                    <AmountRow key={key} label={label} labelWidth={192} value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      onBlur={e => setForm(f => ({ ...f, [key]: amt(e.target.value) }))} />
                  ))}
                </div>

                {/* HRA */}
                <div style={{ display: 'grid', gap: 8 }}>
                  <Legend>HRA Exemption</Legend>
                  <AmountRow label="Annual Rent Paid" value={form.hra.rentPaidAnnual}
                    onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, rentPaidAnnual: e.target.value } }))}
                    onBlur={e => setForm(f => ({ ...f, hra: { ...f.hra, rentPaidAnnual: amt(e.target.value) } }))} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <label htmlFor="td-city" style={{ font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', width: 160, flexShrink: 0 }}>City Type</label>
                    <Select id="td-city" value={form.hra.cityType}
                      onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, cityType: e.target.value } }))}
                      style={{ width: 128 }}>
                      <option value="metro">Metro</option>
                      <option value="non-metro">Non-Metro</option>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {form.regime === 'new' && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2)', padding: 16, textAlign: 'center' }}>
                <p style={{ font: "400 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 }}>
                  New Tax Regime does not allow most deductions.
                </p>
                <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '5px 0 0' }}>
                  Standard deduction of ₹75,000 is applied automatically.
                </p>
              </div>
            )}

            {/* Total */}
            <div style={{
              background: 'var(--brand-soft)', borderRadius: 'var(--r-2)', padding: 12,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <span style={{ font: "500 13px/1 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)' }}>Total Declared Deductions</span>
              <span style={{ font: "700 17px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(totalDecl)}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Approve / reject confirmation ── */}
      <Modal
        open={!!(approval && approvalRow)}
        onClose={() => { setApproval(null); setApprovalRemarks(''); }}
        size="sm"
        tone={approval?.action === 'approved' ? 'brand' : 'danger'}
        icon={approval?.action === 'approved' ? <CheckCircle2 size={18} /> : <Ban size={18} />}
        title={approval?.action === 'approved'
          ? 'Approve declaration'
          : (approvalRow?.statusKey === 'approved' ? 'Reverse approval' : 'Reject declaration')}
        sub={approvalRow ? `${approvalRow.emp.fullName || approvalRow.emp.name || approvalRow.emp.email} — FY ${fy}` : undefined}
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" type="button" disabled={!!approvingId}
              onClick={() => { setApproval(null); setApprovalRemarks(''); }}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={approval?.action === 'approved' ? 'primary' : 'danger'}
              onClick={handleApproval}
              disabled={!!approvingId || (approval?.action === 'rejected' && !approvalRemarks.trim())}
              iconLeft={approvingId
                ? <Loader2 size={14} className="animate-spin" />
                : (approval?.action === 'approved' ? <CheckCircle2 size={14} /> : <Ban size={14} />)}
            >
              {approvingId
                ? 'Saving…'
                : (approval?.action === 'approved'
                  ? `Approve ${formatMoney(approvalRow?.total || 0)}`
                  : (approvalRow?.statusKey === 'approved' ? 'Reverse approval' : 'Reject'))}
            </Button>
          </>
        )}
      >
        {approval && approvalRow && (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* What is actually being approved — the admin should not have to
                reopen the edit modal to see the numbers. */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2)', padding: 12, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', font: "400 11.5px/1.4 'Inter', system-ui, sans-serif" }}>
                <span style={{ color: 'var(--fg-4)' }}>Current status</span>
                <StatusBadge statusKey={approvalRow.statusKey} />
              </div>
              <KV label="Regime" value={approvalRow.decl?.regime === 'old' ? 'Old regime' : 'New regime'} />
              <KV label="Section 80C" value={formatMoney(approvalRow.t80c)} />
              <KV label="Section 80D" value={formatMoney(approvalRow.t80d)} />
              <KV label="80E + 80G + 24(b)" value={formatMoney(approvalRow.tOther)} />
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--line-2)' }}>
                <KV label="Total declared deductions" value={formatMoney(approvalRow.total)} strong />
              </div>
            </div>

            {approval.action === 'approved' ? (
              <Callout tone="warn" icon={<AlertTriangle size={14} />}>
                Approving accepts {formatMoney(approvalRow.total)} of declared deductions for FY {fy} and marks every
                proof this employee uploaded as <strong>verified</strong>. Payroll will compute their TDS on this basis.
                Check the proofs before you approve.
              </Callout>
            ) : (
              <Callout tone="warn" icon={<AlertTriangle size={14} />}>
                The employee will see this as rejected and can revise and resubmit.
                {approvalRow.statusKey === 'approved' && ' Note: proofs already marked verified by the earlier approval stay verified — re-check them manually.'}
              </Callout>
            )}

            <div>
              <label htmlFor="approval-remarks" style={{ display: 'block', font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 5 }}>
                {approval.action === 'rejected'
                  ? <>Reason for rejection <span style={{ color: 'var(--danger)' }}>*</span> — the employee sees this</>
                  : <>Remarks (optional) — the employee sees this</>}
              </label>
              <Textarea
                id="approval-remarks"
                rows={3}
                value={approvalRemarks}
                onChange={e => setApprovalRemarks(e.target.value)}
                placeholder={approval.action === 'rejected'
                  ? 'e.g. LIC premium receipt is for FY 2023-24, please upload the current year receipt'
                  : 'e.g. All proofs checked against originals'}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
