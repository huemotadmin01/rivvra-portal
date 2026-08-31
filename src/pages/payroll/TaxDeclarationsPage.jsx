import React, { useState, useEffect } from 'react';
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
 */
const DECL_STATUS = {
  approved: { label: 'Approved', cls: 'bg-green-500/10 text-green-400 ring-green-500/20' },
  pending_approval: { label: 'Awaiting approval', cls: 'bg-amber-500/10 text-amber-400 ring-amber-500/20' },
  rejected: { label: 'Rejected', cls: 'bg-red-500/10 text-red-400 ring-red-500/20' },
  provisional: { label: 'Provisional', cls: 'bg-blue-500/10 text-blue-400 ring-blue-500/20' },
  declared: { label: 'Declared', cls: 'bg-dark-700 text-dark-200 ring-dark-600' },
  not_declared: { label: 'Not declared', cls: 'bg-dark-800 text-dark-500 ring-dark-700' },
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
    <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// Declared amounts. Coerce on blur AND again in handleSave — never on
// keystroke, which forced a 0 into every field the moment it was cleared.
// The save path spreads the form wholesale into `declarations` and the admin
// backend sums section80C with Object.values(), so a raw string must never
// reach it. Negatives and blanks both read as 0, matching the old `|| 0`.
const amt = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export default function TaxDeclarationsPage() {
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Tax Declarations</h1>
          <p className="text-sm text-dark-400 mt-1">80C, 80D, 80E, 80G, 24(b) declarations per employee — FY {fy}</p>
          <p className="text-sm text-dark-300 mt-1.5">
            <span className="text-white font-medium">{declaredCount}</span>
            <span className="text-dark-400"> of {totalEmployees} declared</span>
            {awaitingCount > 0 && (
              <>
                <span className="text-dark-600 mx-1.5">·</span>
                <span className="text-amber-400 font-medium">{awaitingCount} awaiting approval</span>
              </>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-full sm:w-56" placeholder="Search..." />
        </div>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {visibleFilters.map(key => {
          const count = key === 'all' ? totalEmployees : (statusCounts[key] || 0);
          const active = statusFilter === key;
          return (
            <button key={key} type="button" onClick={() => setStatusFilter(key)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                active
                  ? 'bg-rivvra-600/20 border-rivvra-500/40 text-white'
                  : 'bg-dark-800 border-dark-700 text-dark-400 hover:text-dark-200 hover:border-dark-600'
              }`}>
              {key === 'all' ? 'All' : DECL_STATUS[key].label}
              <span className={`ml-1.5 ${active ? 'text-rivvra-300' : 'text-dark-500'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-2 text-dark-400 font-medium">Employee</th>
              <th className="text-left px-3 py-2 text-dark-400 font-medium">Status</th>
              <th className="text-center px-3 py-2 text-dark-400 font-medium">Regime</th>
              <th className="text-right px-3 py-2 text-dark-400 font-medium">80C</th>
              <th className="text-right px-3 py-2 text-dark-400 font-medium">80D</th>
              {/* Was labelled just "Other", which hid the fact that three
                  unrelated sections are added together. Named for what it sums;
                  the cell carries the split as a tooltip. */}
              <th className="text-right px-3 py-2 text-dark-400 font-medium whitespace-nowrap">80E + 80G + 24(b)</th>
              <th className="text-right px-3 py-2 text-dark-400 font-medium">Total</th>
              <th className="text-right px-4 py-2 text-dark-400 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.empId} className="border-b border-dark-700/50 hover:bg-dark-750 transition-colors">
                <td className="px-4 py-2">
                  <div className="text-white font-medium leading-tight">{r.emp.fullName || r.emp.name || r.emp.email}</div>
                  <div className="text-xs text-dark-400 leading-tight">{r.emp.email}</div>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge statusKey={r.statusKey} />
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.decl?.regime === 'old' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {r.decl?.regime === 'old' ? 'Old' : 'New'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs text-dark-300 tabular-nums">{r.t80c > 0 ? formatMoney(r.t80c) : '-'}</td>
                <td className="px-3 py-2 text-right text-xs text-dark-300 tabular-nums">{r.t80d > 0 ? formatMoney(r.t80d) : '-'}</td>
                <td className="px-3 py-2 text-right text-xs text-dark-300 tabular-nums"
                  title={r.tOther > 0
                    ? `80E ${formatMoney(r.s80e)} · 80G ${formatMoney(r.s80g)} · 24(b) ${formatMoney(r.s24b)}`
                    : undefined}>
                  {r.tOther > 0 ? formatMoney(r.tOther) : '-'}
                </td>
                <td className="px-3 py-2 text-right text-xs text-white font-medium tabular-nums">{r.total > 0 ? formatMoney(r.total) : '-'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    {approvalActionsFor(r.statusKey).includes('approved') && (
                      <button type="button" onClick={() => openApproval(r, 'approved')}
                        disabled={approvingId === r.empId}
                        className="text-xs text-green-400 hover:text-green-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                        {r.statusKey === 'rejected' ? 'Approve instead' : 'Approve'}
                      </button>
                    )}
                    {approvalActionsFor(r.statusKey).includes('rejected') && (
                      <button type="button" onClick={() => openApproval(r, 'rejected')}
                        disabled={approvingId === r.empId}
                        className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                        {r.statusKey === 'approved' ? 'Reverse approval' : 'Reject'}
                      </button>
                    )}
                    <button onClick={() => openEmployee(r.emp)} className="text-xs text-rivvra-400 hover:text-rivvra-300 font-medium">Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            {totalEmployees === 0 ? (
              <p className="text-dark-500 text-sm">No confirmed employees in this company yet.</p>
            ) : (
              <>
                <p className="text-dark-400 text-sm">No employees match this view.</p>
                <p className="text-dark-500 text-xs mt-1">
                  {statusFilter === 'all'
                    ? 'Try a different search term.'
                    : <>None of the {totalEmployees} employees are “{DECL_STATUS[statusFilter].label}”{q ? ' under this search' : ''}.</>}
                </p>
                {(statusFilter !== 'all' || q) && (
                  <button type="button" onClick={() => { setStatusFilter('all'); setSearch(''); }}
                    className="mt-3 text-xs text-rivvra-400 hover:text-rivvra-300 font-medium">
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selectedEmp && form && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2"><FileText size={18} /> Tax Declarations</h2>
                <p className="text-xs text-dark-400 mt-0.5">{selectedEmp.fullName || selectedEmp.email} — FY {fy}</p>
                <div className="mt-1.5">
                  <StatusBadge statusKey={declStatusKey(declarations.find(d => d.employeeId === selectedEmp._id.toString()))} />
                </div>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Regime */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Tax Regime</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" checked={form.regime === 'new'} onChange={() => setForm(f => ({ ...f, regime: 'new' }))} /> New Regime
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input type="radio" name="regime" checked={form.regime === 'old'} onChange={() => setForm(f => ({ ...f, regime: 'old' }))} /> Old Regime
                  </label>
                </div>
              </fieldset>

              {form.regime === 'old' && (
                <>
                  {/* 80C */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">
                      Section 80C <span className="text-xs text-dark-500">(Max ₹1,50,000)</span>
                    </legend>
                    {SECTION_80C_KEYS.map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-xs text-dark-400 w-40">{label}</label>
                        <input type="number" value={form.section80C[key]} onChange={e => setForm(f => ({ ...f, section80C: { ...f.section80C, [key]: e.target.value } }))}
                          onBlur={e => setForm(f => ({ ...f, section80C: { ...f.section80C, [key]: amt(e.target.value) } }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1 border-t border-dark-700">
                      <span className="text-xs font-medium text-dark-300">Total 80C (capped)</span>
                      <span className="text-xs font-bold text-white tabular-nums">{formatMoney(total80C)}</span>
                    </div>
                  </fieldset>

                  {/* 80D */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Section 80D (Medical Insurance)</legend>
                    {SECTION_80D_KEYS.map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-xs text-dark-400 w-40">{label}</label>
                        <input type="number" value={form.section80D[key]} onChange={e => setForm(f => ({ ...f, section80D: { ...f.section80D, [key]: e.target.value } }))}
                          onBlur={e => setForm(f => ({ ...f, section80D: { ...f.section80D, [key]: amt(e.target.value) } }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                  </fieldset>

                  {/* Other sections */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">Other Deductions</legend>
                    {[['section80E', '80E (Education Loan Interest)'], ['section80G', '80G (Donations)'], ['section24b', '24(b) (Home Loan Interest)']].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-xs text-dark-400 w-48">{label}</label>
                        <input type="number" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          onBlur={e => setForm(f => ({ ...f, [key]: amt(e.target.value) }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                  </fieldset>

                  {/* HRA */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">HRA Exemption</legend>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-dark-400 w-40">Annual Rent Paid</label>
                      <input type="number" value={form.hra.rentPaidAnnual} onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, rentPaidAnnual: e.target.value } }))}
                          onBlur={e => setForm(f => ({ ...f, hra: { ...f.hra, rentPaidAnnual: amt(e.target.value) } }))}
                        className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-dark-400 w-40">City Type</label>
                      <select value={form.hra.cityType} onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, cityType: e.target.value } }))}
                        className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white focus:border-rivvra-500 focus:outline-none">
                        <option value="metro">Metro</option>
                        <option value="non-metro">Non-Metro</option>
                      </select>
                    </div>
                  </fieldset>
                </>
              )}

              {form.regime === 'new' && (
                <div className="bg-dark-900/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-dark-400">New Tax Regime does not allow most deductions.</p>
                  <p className="text-xs text-dark-500 mt-1">Standard deduction of ₹75,000 is applied automatically.</p>
                </div>
              )}

              {/* Total */}
              <div className="bg-rivvra-500/10 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm font-medium text-rivvra-400">Total Declared Deductions</span>
                <span className="text-lg font-bold text-white tabular-nums">{formatMoney(totalDecl)}</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedEmp(null)} disabled={saving}
                  className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve / reject confirmation.
          Rendered inline (never as a component declared in the render body) so
          the remarks textarea keeps focus between keystrokes. */}
      {approval && approvalRow && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  {approval.action === 'approved'
                    ? <><CheckCircle2 size={18} className="text-green-400" /> Approve declaration</>
                    : <><Ban size={18} className="text-red-400" /> {approvalRow.statusKey === 'approved' ? 'Reverse approval' : 'Reject declaration'}</>}
                </h2>
                <p className="text-xs text-dark-400 mt-0.5">
                  {approvalRow.emp.fullName || approvalRow.emp.name || approvalRow.emp.email} — FY {fy}
                </p>
              </div>
              <button onClick={() => { setApproval(null); setApprovalRemarks(''); }} disabled={!!approvingId}
                className="text-dark-400 hover:text-white disabled:opacity-50"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* What is actually being approved — the admin should not have to
                  reopen the edit modal to see the numbers. */}
              <div className="bg-dark-900/50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">Current status</span>
                  <StatusBadge statusKey={approvalRow.statusKey} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">Regime</span>
                  <span className="text-dark-300">{approvalRow.decl?.regime === 'old' ? 'Old regime' : 'New regime'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">Section 80C</span>
                  <span className="text-dark-300 tabular-nums">{formatMoney(approvalRow.t80c)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">Section 80D</span>
                  <span className="text-dark-300 tabular-nums">{formatMoney(approvalRow.t80d)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">80E + 80G + 24(b)</span>
                  <span className="text-dark-300 tabular-nums">{formatMoney(approvalRow.tOther)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1.5 border-t border-dark-700">
                  <span className="text-dark-300 font-medium">Total declared deductions</span>
                  <span className="text-white font-bold tabular-nums">{formatMoney(approvalRow.total)}</span>
                </div>
              </div>

              {approval.action === 'approved' ? (
                <div className="text-[11px] text-amber-300/90 bg-amber-900/20 border border-amber-700/40 rounded-md px-2.5 py-2 leading-snug flex gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    Approving accepts {formatMoney(approvalRow.total)} of declared deductions for FY {fy} and marks every
                    proof this employee uploaded as <strong>verified</strong>. Payroll will compute their TDS on this basis.
                    Check the proofs before you approve.
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-amber-300/90 bg-amber-900/20 border border-amber-700/40 rounded-md px-2.5 py-2 leading-snug flex gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    The employee will see this as rejected and can revise and resubmit.
                    {approvalRow.statusKey === 'approved' && ' Note: proofs already marked verified by the earlier approval stay verified — re-check them manually.'}
                  </span>
                </div>
              )}

              <div>
                <label htmlFor="approval-remarks" className="block text-[11px] text-dark-400 mb-1">
                  {approval.action === 'rejected'
                    ? <>Reason for rejection <span className="text-red-400">*</span> — the employee sees this</>
                    : <>Remarks (optional) — the employee sees this</>}
                </label>
                <textarea id="approval-remarks" rows={3} value={approvalRemarks}
                  onChange={e => setApprovalRemarks(e.target.value)}
                  placeholder={approval.action === 'rejected'
                    ? 'e.g. LIC premium receipt is for FY 2023-24, please upload the current year receipt'
                    : 'e.g. All proofs checked against originals'}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white placeholder:text-dark-600 focus:border-rivvra-500 focus:outline-none resize-y" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setApproval(null); setApprovalRemarks(''); }} disabled={!!approvingId}
                  className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  Cancel
                </button>
                <button type="button" onClick={handleApproval}
                  disabled={!!approvingId || (approval.action === 'rejected' && !approvalRemarks.trim())}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                    approval.action === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}>
                  {approvingId
                    ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                    : (approval.action === 'approved'
                      ? <><CheckCircle2 size={14} /> Approve {formatMoney(approvalRow.total)}</>
                      : <><Ban size={14} /> {approvalRow.statusKey === 'approved' ? 'Reverse approval' : 'Reject'}</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
