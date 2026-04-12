import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Loader2, Plus, Pencil, Trash2, Percent, X, Check,
  ToggleLeft, ToggleRight, Search,
} from 'lucide-react';

const TAX_TYPE_OPTIONS = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'group', label: 'Group' },
];

const SCOPE_OPTIONS = [
  { value: 'sale', label: 'Sale' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'both', label: 'Both' },
];

const SCOPE_STYLES = {
  sale:     { bg: 'bg-blue-500/10',    text: 'text-blue-400' },
  purchase: { bg: 'bg-amber-500/10',   text: 'text-amber-400' },
  both:     { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
};

const EMPTY_TAX = {
  name: '',
  rate: '',
  type: 'percentage',
  scope: 'both',
  inclusive: false,
  active: true,
};

export default function TaxesConfig() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_TAX });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicingApi.listTaxes(orgSlug);
      setTaxes(res.taxes || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load taxes', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  const filtered = useMemo(() => {
    if (!search.trim()) return taxes;
    const q = search.toLowerCase();
    return taxes.filter(t =>
      (t.name || '').toLowerCase().includes(q)
    );
  }, [taxes, search]);

  function startAdd() {
    setEditingId('new');
    setForm({ ...EMPTY_TAX });
  }

  function startEdit(tax) {
    setEditingId(tax._id);
    setForm({
      name: tax.name || '',
      rate: tax.rate ?? '',
      type: tax.type || 'percentage',
      scope: tax.scope || 'both',
      inclusive: tax.inclusive === true,
      active: tax.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_TAX });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('Tax name is required', 'error');
      return;
    }
    if (form.rate === '' || isNaN(Number(form.rate))) {
      showToast('A valid rate is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        rate: Number(form.rate),
        type: form.type,
        scope: form.scope,
        inclusive: form.inclusive,
        active: form.active,
      };

      if (editingId === 'new') {
        await invoicingApi.createTax(orgSlug, payload);
        showToast('Tax created');
      } else {
        await invoicingApi.updateTax(orgSlug, editingId, payload);
        showToast('Tax updated');
      }
      setEditingId(null);
      setForm({ ...EMPTY_TAX });
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save tax', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(taxId) {
    setDeletingId(taxId);
    try {
      await invoicingApi.deleteTax(orgSlug, taxId);
      showToast('Tax deleted');
      setTaxes(prev => prev.filter(t => t._id !== taxId));
      if (editingId === taxId) cancelEdit();
    } catch (err) {
      showToast(err.message || 'Failed to delete tax', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(tax) {
    try {
      await invoicingApi.updateTax(orgSlug, tax._id, { active: !tax.active });
      setTaxes(prev =>
        prev.map(t => t._id === tax._id ? { ...t, active: !t.active } : t)
      );
      showToast(tax.active ? 'Tax deactivated' : 'Tax activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  const inputCls = 'w-full px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500';
  const selectCls = 'px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500';

  function FormRow() {
    return (
      <tr className="border-b border-dark-700/50 bg-dark-800/80">
        <td className="px-4 py-3">
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Tax name *"
            autoFocus
            className={inputCls}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            min="0"
            step="any"
            value={form.rate}
            onChange={e => setForm(prev => ({ ...prev, rate: e.target.value }))}
            placeholder="0"
            className={`${inputCls} max-w-[90px] text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <select
            value={form.type}
            onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
            className={selectCls}
          >
            {TAX_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          <select
            value={form.scope}
            onChange={e => setForm(prev => ({ ...prev, scope: e.target.value }))}
            className={selectCls}
          >
            {SCOPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, inclusive: !prev.inclusive }))}
            className="text-dark-400 hover:text-white transition-colors"
          >
            {form.inclusive ? (
              <ToggleRight size={20} className="text-emerald-400" />
            ) : (
              <ToggleLeft size={20} className="text-dark-600" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))}
            className="text-dark-400 hover:text-white transition-colors"
          >
            {form.active ? (
              <ToggleRight size={20} className="text-emerald-400" />
            ) : (
              <ToggleLeft size={20} className="text-dark-600" />
            )}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white transition-colors disabled:opacity-50"
              title="Save"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              onClick={cancelEdit}
              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Taxes</h1>
          <p className="text-sm text-dark-400 mt-0.5">Configure tax rates for invoicing</p>
        </div>
        <button
          onClick={startAdd}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={16} /> Add Tax
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search taxes..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
        </div>
      ) : (
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Name</span>
                  </th>
                  <th className="text-right px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Rate (%)</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Type</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Scope</span>
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Inclusive</span>
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Status</span>
                  </th>
                  <th className="text-right px-4 py-3 w-[100px]">
                    <span className="text-xs font-medium text-dark-400">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && <FormRow />}

                {filtered.length === 0 && editingId !== 'new' ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16">
                      <Percent size={48} className="mx-auto mb-3 opacity-30 text-dark-500" />
                      <p className="text-sm text-dark-500">
                        {taxes.length === 0 ? 'No taxes configured yet' : 'No taxes match your search'}
                      </p>
                      {taxes.length === 0 && (
                        <button
                          onClick={startAdd}
                          className="mt-3 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
                        >
                          Add your first tax
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(tax => {
                    if (editingId === tax._id) {
                      return <FormRow key={tax._id} />;
                    }
                    const scopeSt = SCOPE_STYLES[tax.scope] || SCOPE_STYLES.both;
                    return (
                      <tr
                        key={tax._id}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{tax.name}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">
                          {tax.rate != null ? `${tax.rate}%` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-dark-300 capitalize">{tax.type || 'percentage'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${scopeSt.bg} ${scopeSt.text} capitalize`}>
                            {tax.scope || 'both'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium ${tax.inclusive ? 'text-emerald-400' : 'text-dark-500'}`}>
                            {tax.inclusive ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(tax)}
                            className="inline-flex items-center transition-colors"
                            title={tax.active !== false ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                          >
                            {tax.active !== false ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-dark-700 text-dark-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-dark-600" />
                                Inactive
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(tax)}
                              disabled={editingId !== null}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(tax._id)}
                              disabled={deletingId === tax._id}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Delete"
                            >
                              {deletingId === tax._id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
