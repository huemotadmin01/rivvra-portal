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
import { FileText, X, Search, Save, Loader2 } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

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
  const [form, setForm] = useState(null);

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
    } catch (err) { showToast('Failed to load', 'error'); }
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
  };

  const total80C = form ? Math.min(150000, Object.values(form.section80C).reduce((s, v) => s + (Number(v) || 0), 0)) : 0;
  const total80D = form ? Object.values(form.section80D).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const totalDecl = form ? total80C + total80D + (Number(form.section80E) || 0) + (Number(form.section80G) || 0) + (Number(form.section24b) || 0) : 0;

  const confirmedEmployees = employees.filter(e => e.employmentType === 'confirmed' && e.status !== 'separated');
  const filtered = confirmedEmployees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.fullName || e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Tax Declarations</h1>
          <p className="text-sm text-dark-400 mt-1">80C, 80D, 80E, 80G, 24(b) declarations per employee — FY {fy}</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-56" placeholder="Search..." />
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Regime</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">80C</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">80D</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Other</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Total</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => {
              const empId = emp._id.toString();
              const decl = declarations.find(d => d.employeeId === empId);
              const d = decl?.declarations || {};
              // Read defensively: a doc saved by the ESS page carries a scalar
              // 80C, one saved here carries an itemized object. Both resolve.
              const t80c = read80CTotal(d);
              const t80d = read80DTotal(d);
              const tOther = (Number(d.section80E) || 0) + (Number(d.section80G) || 0) + (Number(d.section24b) || 0);
              const total = t80c + t80d + tOther;
              return (
                <tr key={empId} className="border-b border-dark-700/50 hover:bg-dark-750 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{emp.fullName || emp.name || emp.email}</div>
                    <div className="text-xs text-dark-400">{emp.email}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${decl?.regime === 'old' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {decl?.regime === 'old' ? 'Old' : 'New'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-dark-300">{t80c > 0 ? `₹${fmt(t80c)}` : '-'}</td>
                  <td className="px-4 py-3 text-center text-xs text-dark-300">{t80d > 0 ? `₹${fmt(t80d)}` : '-'}</td>
                  <td className="px-4 py-3 text-center text-xs text-dark-300">{tOther > 0 ? `₹${fmt(tOther)}` : '-'}</td>
                  <td className="px-4 py-3 text-center text-xs text-white font-medium">{total > 0 ? `₹${fmt(total)}` : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEmployee(emp)} className="text-xs text-rivvra-400 hover:text-rivvra-300 font-medium">Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-12 text-dark-500">No employees found.</div>}
      </div>

      {/* Edit Modal */}
      {selectedEmp && form && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2"><FileText size={18} /> Tax Declarations</h2>
                <p className="text-xs text-dark-400 mt-0.5">{selectedEmp.fullName || selectedEmp.email} — FY {fy}</p>
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
                      <span className="text-xs font-bold text-white">₹{fmt(total80C)}</span>
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
                <span className="text-lg font-bold text-white">₹{fmt(totalDecl)}</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedEmp(null)} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button onClick={handleSave} className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 flex items-center justify-center gap-2">
                  <Save size={14} /> Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
