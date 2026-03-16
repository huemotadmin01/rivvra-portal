import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getSalaryStructures, createSalaryStructure, updateSalaryStructure, deleteSalaryStructure, setDefaultStructure } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Plus, Edit2, Trash2, Star, X } from 'lucide-react';

const EMPTY_COMPONENT = { name: '', percentOfGross: '', isTaxable: true, isPfApplicable: false };

export default function SalaryStructuresPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', components: [
    { name: 'Basic', percentOfGross: 50, isTaxable: true, isPfApplicable: true },
    { name: 'HRA', percentOfGross: 20, isTaxable: true, isPfApplicable: false },
    { name: 'Special Allowance', percentOfGross: 30, isTaxable: true, isPfApplicable: false },
  ]});

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSalaryStructures(orgSlug);
      setStructures(res.structures || []);
    } catch { showToast('Failed to load structures', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [orgSlug]);

  const resetForm = () => {
    setForm({ name: '', components: [
      { name: 'Basic', percentOfGross: 50, isTaxable: true, isPfApplicable: true },
      { name: 'HRA', percentOfGross: 20, isTaxable: true, isPfApplicable: false },
      { name: 'Special Allowance', percentOfGross: 30, isTaxable: true, isPfApplicable: false },
    ]});
    setEditing(null);
    setShowForm(false);
  };

  const totalPercent = form.components.reduce((s, c) => s + (Number(c.percentOfGross) || 0), 0);
  const basicComp = form.components.find(c => c.name === 'Basic');
  const isValid = form.name && totalPercent === 100 && basicComp && Number(basicComp.percentOfGross) >= 50;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return showToast('Total must be 100%, Basic >= 50%.', 'error');
    const data = { name: form.name, components: form.components.map(c => ({ ...c, percentOfGross: Number(c.percentOfGross) })) };
    try {
      if (editing) {
        await updateSalaryStructure(orgSlug, editing, data);
        showToast('Updated');
      } else {
        await createSalaryStructure(orgSlug, data);
        showToast('Created');
      }
      resetForm();
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this salary structure?')) return;
    try { await deleteSalaryStructure(orgSlug, id); showToast('Deleted'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Cannot delete', 'error'); }
  };

  const handleSetDefault = async (id) => {
    try { await setDefaultStructure(orgSlug, id); showToast('Set as default'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Failed'); }
  };

  const startEdit = (s) => { setForm({ name: s.name, components: s.components.map(c => ({ ...c })) }); setEditing(s._id); setShowForm(true); };
  const addComponent = () => setForm(f => ({ ...f, components: [...f.components, { ...EMPTY_COMPONENT }] }));
  const removeComponent = (idx) => setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }));
  const updateComponent = (idx, field, value) => setForm(f => ({ ...f, components: f.components.map((c, i) => i === idx ? { ...c, [field]: value } : c) }));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Salary Structures</h1>
          <p className="text-sm text-dark-400 mt-1">Define how CTC is split into salary components</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
          <Plus size={16} /> New Structure
        </button>
      </div>

      <div className="space-y-4">
        {structures.map(s => (
          <div key={s._id} className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">{s.name}</h3>
                {s.isDefault && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs font-medium rounded-full flex items-center gap-1">
                    <Star size={12} /> Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!s.isDefault && <button onClick={() => handleSetDefault(s._id)} className="text-xs text-rivvra-400 hover:text-rivvra-300">Set Default</button>}
                <button onClick={() => startEdit(s)} className="p-1.5 text-dark-400 hover:text-rivvra-400"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(s._id)} className="p-1.5 text-dark-400 hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {s.components.map((c, i) => (
                <div key={i} className="bg-dark-900/50 rounded-lg px-3 py-2">
                  <div className="text-xs text-dark-400">{c.name}</div>
                  <div className="text-sm font-medium text-white">{c.percentOfGross}%</div>
                  <div className="flex gap-2 mt-1">
                    {c.isTaxable && <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 rounded">Taxable</span>}
                    {c.isPfApplicable && <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 rounded">PF</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {structures.length === 0 && <div className="text-center py-12 text-dark-500">No salary structures yet. Create one to get started.</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <h2 className="text-lg font-semibold text-white">{editing ? 'Edit Structure' : 'New Salary Structure'}</h2>
              <button onClick={resetForm} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Structure Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none" placeholder="e.g. Standard, Senior" required />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-dark-300">Components</label>
                  <span className={`text-xs font-medium ${totalPercent === 100 ? 'text-green-400' : 'text-red-400'}`}>Total: {totalPercent}%</span>
                </div>
                {form.components.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input type="text" value={c.name} onChange={e => updateComponent(i, 'name', e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-white" placeholder="Component name" required />
                    <div className="flex items-center gap-1">
                      <input type="number" value={c.percentOfGross} onChange={e => updateComponent(i, 'percentOfGross', e.target.value)}
                        className="w-16 px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-white text-right" min="0" max="100" required />
                      <span className="text-sm text-dark-500">%</span>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-dark-400">
                      <input type="checkbox" checked={c.isPfApplicable} onChange={e => updateComponent(i, 'isPfApplicable', e.target.checked)} className="rounded border-dark-600" /> PF
                    </label>
                    {form.components.length > 1 && (
                      <button type="button" onClick={() => removeComponent(i)} className="text-dark-400 hover:text-red-400"><X size={14} /></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addComponent} className="text-xs text-rivvra-400 hover:text-rivvra-300 mt-1">+ Add component</button>
              </div>

              {basicComp && Number(basicComp.percentOfGross) < 50 && (
                <div className="bg-red-500/10 text-red-400 text-xs p-2 rounded">Basic must be >= 50% (New Wage Code compliance)</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetForm} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button type="submit" disabled={!isValid} className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-50">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
