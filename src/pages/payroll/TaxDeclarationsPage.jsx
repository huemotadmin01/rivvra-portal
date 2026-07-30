import React, { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import {
  getTaxDeclarations, upsertTaxDeclaration, getStatutoryConfigs,
  SECTION_80C_KEYS, SECTION_80D_KEYS, normalize80CItems, normalize80D,
  read80CTotal, read80DTotal,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
import { FileText, X, Search, Save, Loader2 } from 'lucide-react';

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

/** Status pill. Module-level so it is never redefined during a render. */
function StatusBadge({ statusKey }) {
  const meta = DECL_STATUS[statusKey] || DECL_STATUS.not_declared;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

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
      const items = clean.section80C;
      await upsertTaxDeclaration(orgSlug, selectedEmp._id.toString(), fy, {
        regime: form.regime,
        declarations: {
          ...(_stored || {}),
          ...clean,
          // `section80C` stays an OBJECT because the admin backend route
          // (payroll.js ~1373) computes section80CTotal via Object.values().
          // `section80CItems` is the canonical breakdown both pages read.
          section80C: items,
          section80CItems: items,
          section80D: clean.section80D,
          hra: { ...(_stored?.hra || {}), ...clean.hra },
        },
      });
      showToast('Declarations saved — payroll TDS recalculated', 'success');
      setSelectedEmp(null);
      await load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
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
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
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
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-56" placeholder="Search..." />
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

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <table className="w-full text-sm">
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
                  <button onClick={() => openEmployee(r.emp)} className="text-xs text-rivvra-400 hover:text-rivvra-300 font-medium">Edit</button>
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
                        <input type="number" value={form.section80C[key]} onChange={e => setForm(f => ({ ...f, section80C: { ...f.section80C, [key]: Number(e.target.value) || 0 } }))}
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
                        <input type="number" value={form.section80D[key]} onChange={e => setForm(f => ({ ...f, section80D: { ...f.section80D, [key]: Number(e.target.value) || 0 } }))}
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
                        <input type="number" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))}
                          className="w-32 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-white text-right focus:border-rivvra-500 focus:outline-none" />
                      </div>
                    ))}
                  </fieldset>

                  {/* HRA */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-dark-300 border-b border-dark-700 pb-1 mb-2">HRA Exemption</legend>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-dark-400 w-40">Annual Rent Paid</label>
                      <input type="number" value={form.hra.rentPaidAnnual} onChange={e => setForm(f => ({ ...f, hra: { ...f.hra, rentPaidAnnual: Number(e.target.value) || 0 } }))}
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
    </div>
  );
}
