import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getTaxDeclarations, upsertTaxDeclaration, getStatutoryConfigs } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { FileText, X, Search, Save } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

function getCurrentFY() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${(y + 1).toString().slice(2)}` : `${y - 1}-${y.toString().slice(2)}`;
}

const FY_OPTIONS = (() => {
  const now = new Date();
  const y = now.getFullYear();
  return [
    `${y - 1}-${y.toString().slice(2)}`,
    `${y}-${(y + 1).toString().slice(2)}`,
    `${y + 1}-${(y + 2).toString().slice(2)}`,
  ];
})();

export default function TaxDeclarationsPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [fy, setFy] = useState(getCurrentFY());
  const [declarations, setDeclarations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);

  const load = async () => {
    setLoading(true);
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

  useEffect(() => { load(); }, [orgSlug, fy]);

  const openEmployee = (emp) => {
    const decl = declarations.find(d => d.employeeId === emp._id.toString());
    const d = decl?.declarations || {};
    setForm({
      regime: decl?.regime || 'new',
      section80C: {
        epf: d.section80C?.epf || 0,
        ppf: d.section80C?.ppf || 0,
        elss: d.section80C?.elss || 0,
        lifeInsurance: d.section80C?.lifeInsurance || 0,
        housingLoan: d.section80C?.housingLoan || 0,
        tuitionFees: d.section80C?.tuitionFees || 0,
        nsc: d.section80C?.nsc || 0,
        others: d.section80C?.others || 0,
      },
      section80D: {
        selfFamily: d.section80D?.selfFamily || 0,
        parents: d.section80D?.parents || 0,
        parentsSenior: d.section80D?.parentsSenior || 0,
      },
      section80E: d.section80E || 0,
      section80G: d.section80G || 0,
      section24b: d.section24b || 0,
      hra: {
        rentPaidAnnual: d.hra?.rentPaidAnnual || 0,
        cityType: d.hra?.cityType || 'non-metro',
      },
    });
    setSelectedEmp(emp);
  };

  const handleSave = async () => {
    try {
      await upsertTaxDeclaration(orgSlug, selectedEmp._id.toString(), fy, {
        regime: form.regime,
        declarations: form,
      });
      showToast('Declarations saved');
      setSelectedEmp(null);
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const total80C = form ? Math.min(150000, Object.values(form.section80C).reduce((s, v) => s + (Number(v) || 0), 0)) : 0;
  const total80D = form ? Object.values(form.section80D).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const totalDecl = form ? total80C + total80D + (Number(form.section80E) || 0) + (Number(form.section80G) || 0) + (Number(form.section24b) || 0) : 0;

  const filtered = employees.filter(e => {
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
          <p className="text-sm text-dark-400 mt-1">80C, 80D, 80E, 80G, 24(b) declarations per employee</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={fy} onChange={e => setFy(e.target.value)}
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
            {FY_OPTIONS.map(f => <option key={f} value={f}>FY {f}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-56" placeholder="Search..." />
          </div>
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
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Total</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => {
              const decl = declarations.find(d => d.employeeId === emp._id.toString());
              const d = decl?.declarations || {};
              const t80c = d.section80CTotal || 0;
              const t80d = d.section80DTotal || 0;
              const total = d.totalDeclared || 0;
              return (
                <tr key={emp._id} className="border-b border-dark-700/50 hover:bg-dark-750">
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
                  <td className="px-4 py-3 text-center text-xs text-white font-medium">{total > 0 ? `₹${fmt(total)}` : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEmployee(emp)} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
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
                    {[
                      ['epf', 'Employee PF'], ['ppf', 'PPF'], ['elss', 'ELSS/Tax Saving MF'],
                      ['lifeInsurance', 'Life Insurance'], ['housingLoan', 'Housing Loan Principal'],
                      ['tuitionFees', 'Tuition Fees'], ['nsc', 'NSC'], ['others', 'Others'],
                    ].map(([key, label]) => (
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
                    {[['selfFamily', 'Self & Family'], ['parents', 'Parents'], ['parentsSenior', 'Parents (Senior)']].map(([key, label]) => (
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
