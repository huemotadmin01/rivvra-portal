import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getSalaryStructures, createSalaryStructure, updateSalaryStructure, deleteSalaryStructure, setDefaultStructure, getPublicPlatformSetting } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Plus, Edit2, Trash2, Star, X, Search, Layers } from 'lucide-react';

const EMPTY_COMPONENT = { name: '', percentOfGross: '', isTaxable: true, isPfApplicable: false };

// Show a search box only once the list is long enough that scanning it is work.
const SEARCH_THRESHOLD = 6;

// Stable palette for the proportion bar — index-based so a structure's bar
// keeps the same colours between renders.
const BAR_COLORS = ['bg-rivvra-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];

// Trim float dust off a percentage for display without rounding a real value away.
const pctDisplay = (v) => {
  const n = Number(v) || 0;
  return String(Math.round(n * 100) / 100);
};

const FALLBACK_COMPONENTS = [
  { name: 'Basic', percentOfGross: 50, isTaxable: true, isPfApplicable: true },
  { name: 'HRA', percentOfGross: 20, isTaxable: true, isPfApplicable: false },
  { name: 'Special Allowance', percentOfGross: 30, isTaxable: true, isPfApplicable: false },
];

export default function SalaryStructuresPage({ embedded = false }) {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultComponents, setDefaultComponents] = useState(FALLBACK_COMPONENTS);
  const [form, setForm] = useState({ name: '', components: FALLBACK_COMPONENTS });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Client-side filter over already-loaded structures — no extra API calls.
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setStructures([]);
    setLoadError(null);
    try {
      const res = await getSalaryStructures(orgSlug);
      setStructures(res.structures || []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load salary structures');
      showToast('Failed to load structures', 'error');
    }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id]);

  // Fetch default structure template from platform settings
  useEffect(() => {
    getPublicPlatformSetting('default_salary_structure')
      .then(res => {
        if (res?.components?.length) {
          setDefaultComponents(res.components);
          setForm(f => ({ ...f, components: res.components }));
        }
      })
      .catch(() => {});
  }, []);

  const resetForm = () => {
    setForm({ name: '', components: defaultComponents });
    setEditing(null);
    setShowForm(false);
  };

  const totalPercent = form.components.reduce((s, c) => s + (Number(c.percentOfGross) || 0), 0);
  // Float equality would reject a legitimate 33.33/33.33/33.34 split
  // (sums to 100.00000000000001) and print the artifact in the badge.
  const EPSILON = 0.001;
  const totalIs100 = Math.abs(totalPercent - 100) < EPSILON;
  const totalPercentDisplay = Math.round(totalPercent * 100) / 100;
  const basicComp = form.components.find(c => c.name === 'Basic');
  const isValid = form.name && totalIs100 && basicComp && Number(basicComp.percentOfGross) >= 50;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return showToast('Total must be 100%, Basic >= 50%.', 'error');
    if (saving) return;
    const data = { name: form.name, components: form.components.map(c => ({ ...c, percentOfGross: Number(c.percentOfGross) })) };
    setSaving(true);
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
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this salary structure?')) return;
    try { await deleteSalaryStructure(orgSlug, id); showToast('Deleted'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Cannot delete', 'error'); }
  };

  const handleSetDefault = async (id) => {
    try { await setDefaultStructure(orgSlug, id); showToast('Set as default'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const showSearch = structures.length >= SEARCH_THRESHOLD;
  const q = search.trim().toLowerCase();
  const visibleStructures = !q ? structures : structures.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.components || []).some(c => (c.name || '').toLowerCase().includes(q))
  );

  const startEdit = (s) => { setForm({ name: s.name, components: s.components.map(c => ({ ...c })) }); setEditing(s._id); setShowForm(true); };
  const addComponent = () => setForm(f => ({ ...f, components: [...f.components, { ...EMPTY_COMPONENT }] }));
  const removeComponent = (idx) => setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }));
  const updateComponent = (idx, field, value) => setForm(f => ({ ...f, components: f.components.map((c, i) => i === idx ? { ...c, [field]: value } : c) }));

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" />
      <p className="text-xs text-dark-500">Loading salary structures…</p>
    </div>
  );

  if (loadError) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm text-red-400">{loadError}</p>
      <button onClick={load} className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200 hover:bg-dark-700">Retry</button>
    </div>
  );

  return (
    <div className={embedded ? '' : 'max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6'}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Salary Structures</h1>
            <p className="text-sm text-dark-400 mt-1">Reusable templates that split an employee's gross salary into components such as Basic and HRA</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
            <Plus size={16} /> New Structure
          </button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end mb-4">
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
            <Plus size={16} /> New Structure
          </button>
        </div>
      )}

      {showSearch && (
        <div className="relative mb-4 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none"
            placeholder="Search by structure or component name…"
          />
        </div>
      )}

      <div className="space-y-4">
        {visibleStructures.map(s => {
          const comps = s.components || [];
          const compTotal = comps.reduce((sum, c) => sum + (Number(c.percentOfGross) || 0), 0);
          return (
          <div key={s._id} className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-base font-semibold text-white truncate">{s.name}</h3>
                {s.isDefault && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">Default</span>}
                <span className="text-[10px] text-dark-400">{comps.length} component{comps.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => !s.isDefault && handleSetDefault(s._id)}
                  className={`p-1.5 ${s.isDefault ? 'text-amber-400 cursor-default' : 'text-dark-400 hover:text-amber-400'}`}
                  title={s.isDefault ? 'Default structure' : 'Set as default'}
                >
                  <Star size={16} fill={s.isDefault ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => startEdit(s)} className="p-1.5 text-dark-400 hover:text-rivvra-400"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(s._id)} className="p-1.5 text-dark-400 hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
            {/* Proportion bar — the whole split readable in one glance */}
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-dark-900 mb-1">
              {comps.map((c, i) => {
                const pct = Number(c.percentOfGross) || 0;
                if (pct <= 0) return null;
                return <div key={i} className={BAR_COLORS[i % BAR_COLORS.length]} style={{ width: `${Math.min(pct, 100)}%` }} title={`${c.name}: ${pctDisplay(pct)}% of gross`} />;
              })}
            </div>
            <div className="text-[10px] text-dark-500 mb-3">
              Percentages are shares of monthly gross · total {pctDisplay(compTotal)}%
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {comps.map((c, i) => (
                <div key={i} className="bg-dark-900/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                    <div className="text-xs text-dark-400 truncate">{c.name}</div>
                  </div>
                  <div className="text-sm font-medium text-white tabular-nums">{pctDisplay(c.percentOfGross)}% of gross</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {c.isTaxable && <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 rounded" title="Included in taxable income">Taxable</span>}
                    {c.isPfApplicable && <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 rounded" title="Counts towards Provident Fund wages">Counts for PF</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          );
        })}

        {structures.length === 0 && (
          <div className="bg-dark-800 border border-dark-700 rounded-xl px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-dark-900 border border-dark-700 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-6 h-6 text-dark-400" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">No salary structures yet</h3>
            <p className="text-sm text-dark-400 leading-relaxed max-w-md mx-auto">
              A salary structure is a reusable template that says how an employee's monthly gross
              is divided — for example Basic 50%, HRA 20%, Special Allowance 30%. Payroll uses it to
              work out each component from the gross, and to decide which parts count towards PF and tax.
            </p>
            <p className="text-xs text-dark-500 mt-3 max-w-md mx-auto">
              Create one structure per pay band you use. Components must add up to 100%, and Basic must be
              at least 50% of gross to stay compliant with the New Wage Code. Mark one structure as the
              default and new employees will pick it up automatically.
            </p>
            <button onClick={() => { resetForm(); setShowForm(true); }} className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
              <Plus size={16} /> Create your first structure
            </button>
          </div>
        )}

        {structures.length > 0 && visibleStructures.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-dark-300">No structure matches “{search}”</p>
            <button onClick={() => setSearch('')} className="mt-2 text-xs text-rivvra-400 hover:text-rivvra-300">Clear search</button>
          </div>
        )}
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
                  <label className="text-sm font-medium text-dark-300">Components (% of monthly gross)</label>
                  <span className={`text-xs font-medium ${totalIs100 ? 'text-green-400' : 'text-red-400'}`}>Total: {totalPercentDisplay}% {totalIs100 ? '' : '— must be 100%'}</span>
                </div>
                <p className="text-[11px] text-dark-500 mb-2">Tick “PF” for components that count towards Provident Fund wages.</p>
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
                <div className="bg-red-500/10 text-red-400 text-xs p-2 rounded">{"Basic must be >= 50% (New Wage Code compliance)"}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetForm} className="flex-1 px-4 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700">Cancel</button>
                <button type="submit" disabled={!isValid || saving} className="flex-1 px-4 py-2 bg-rivvra-600 text-white rounded-lg text-sm hover:bg-rivvra-700 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
