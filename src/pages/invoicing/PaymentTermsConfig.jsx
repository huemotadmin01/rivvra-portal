import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Loader2, Plus, Pencil, Trash2, Clock, X, Check,
  ToggleLeft, ToggleRight, Star, Search,
} from 'lucide-react';

const EMPTY_TERM = {
  name: '',
  days: '',
  isDefault: false,
  active: true,
};

export default function PaymentTermsConfig() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_TERM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicingApi.listPaymentTerms(orgSlug);
      setTerms(res.paymentTerms || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load payment terms', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  const filtered = useMemo(() => {
    if (!search.trim()) return terms;
    const q = search.toLowerCase();
    return terms.filter(t =>
      (t.name || '').toLowerCase().includes(q)
    );
  }, [terms, search]);

  function startAdd() {
    setEditingId('new');
    setForm({ ...EMPTY_TERM });
  }

  function startEdit(term) {
    setEditingId(term._id);
    setForm({
      name: term.name || '',
      days: term.days ?? '',
      isDefault: term.isDefault === true,
      active: term.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_TERM });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('Payment term name is required', 'error');
      return;
    }
    if (form.days === '' || isNaN(Number(form.days)) || Number(form.days) < 0) {
      showToast('A valid number of days is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        days: Number(form.days),
        isDefault: form.isDefault,
        active: form.active,
      };

      if (editingId === 'new') {
        await invoicingApi.createPaymentTerm(orgSlug, payload);
        showToast('Payment term created');
      } else {
        await invoicingApi.updatePaymentTerm(orgSlug, editingId, payload);
        showToast('Payment term updated');
      }
      setEditingId(null);
      setForm({ ...EMPTY_TERM });
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save payment term', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(termId) {
    setDeletingId(termId);
    try {
      await invoicingApi.deletePaymentTerm(orgSlug, termId);
      showToast('Payment term deleted');
      setTerms(prev => prev.filter(t => t._id !== termId));
      if (editingId === termId) cancelEdit();
    } catch (err) {
      showToast(err.message || 'Failed to delete payment term', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(term) {
    try {
      await invoicingApi.updatePaymentTerm(orgSlug, term._id, { active: !term.active });
      setTerms(prev =>
        prev.map(t => t._id === term._id ? { ...t, active: !t.active } : t)
      );
      showToast(term.active ? 'Payment term deactivated' : 'Payment term activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  async function toggleDefault(term) {
    try {
      await invoicingApi.updatePaymentTerm(orgSlug, term._id, { isDefault: !term.isDefault });
      // If setting as default, unmark others
      setTerms(prev =>
        prev.map(t => {
          if (t._id === term._id) return { ...t, isDefault: !t.isDefault };
          if (!term.isDefault) return { ...t, isDefault: false }; // unmark others when setting new default
          return t;
        })
      );
      showToast(term.isDefault ? 'Default removed' : 'Set as default');
    } catch (err) {
      showToast(err.message || 'Failed to update default', 'error');
    }
  }

  const inputCls = 'w-full px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500';

  function FormRow() {
    return (
      <tr className="border-b border-dark-700/50 bg-dark-800/80">
        <td className="px-4 py-3">
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Net 30 *"
            autoFocus
            className={inputCls}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            min="0"
            value={form.days}
            onChange={e => setForm(prev => ({ ...prev, days: e.target.value }))}
            placeholder="0"
            className={`${inputCls} max-w-[90px] text-right`}
          />
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, isDefault: !prev.isDefault }))}
            className="transition-colors"
          >
            <Star
              size={18}
              className={form.isDefault ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
            />
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
          <h1 className="text-xl font-bold text-white">Payment Terms</h1>
          <p className="text-sm text-dark-400 mt-0.5">Configure payment terms for invoices and bills</p>
        </div>
        <button
          onClick={startAdd}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={16} /> Add Payment Term
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search payment terms..."
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
                    <span className="text-xs font-medium text-dark-400">Days</span>
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Default</span>
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
                    <td colSpan={5} className="text-center py-16">
                      <Clock size={48} className="mx-auto mb-3 opacity-30 text-dark-500" />
                      <p className="text-sm text-dark-500">
                        {terms.length === 0 ? 'No payment terms yet' : 'No payment terms match your search'}
                      </p>
                      {terms.length === 0 && (
                        <button
                          onClick={startAdd}
                          className="mt-3 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
                        >
                          Add your first payment term
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(term => {
                    if (editingId === term._id) {
                      return <FormRow key={term._id} />;
                    }
                    return (
                      <tr
                        key={term._id}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{term.name}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">
                          {term.days != null ? term.days : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleDefault(term)}
                            className="transition-colors"
                            title={term.isDefault ? 'Default - click to remove' : 'Set as default'}
                          >
                            <Star
                              size={16}
                              className={term.isDefault ? 'text-amber-400 fill-amber-400' : 'text-dark-600 hover:text-dark-400'}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(term)}
                            className="inline-flex items-center transition-colors"
                            title={term.active !== false ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                          >
                            {term.active !== false ? (
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
                              onClick={() => startEdit(term)}
                              disabled={editingId !== null}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(term._id)}
                              disabled={deletingId === term._id}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Delete"
                            >
                              {deletingId === term._id ? (
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
