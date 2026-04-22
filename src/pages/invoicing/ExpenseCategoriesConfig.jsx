import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Loader2, Plus, Pencil, Trash2, Tag, X, Check,
  ToggleLeft, ToggleRight, Search,
} from 'lucide-react';

const EMPTY_CATEGORY = {
  name: '',
  description: '',
  active: true,
};

export default function ExpenseCategoriesConfig() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_CATEGORY });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicingApi.listExpenseCategories(orgSlug, {
        includeInactive: showInactive ? 1 : '',
      });
      setCategories(res.categories || []);
    } catch (err) {
      showToast(err.message || 'Failed to load expense categories', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showInactive]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    );
  }, [categories, search]);

  function startAdd() {
    setEditingId('new');
    setForm({ ...EMPTY_CATEGORY });
  }

  function startEdit(cat) {
    setEditingId(cat._id);
    setForm({
      name: cat.name || '',
      description: cat.description || '',
      active: cat.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_CATEGORY });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('Category name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        active: form.active,
      };

      if (editingId === 'new') {
        await invoicingApi.createExpenseCategory(orgSlug, payload);
        showToast('Expense category created');
      } else {
        await invoicingApi.updateExpenseCategory(orgSlug, editingId, payload);
        showToast('Expense category updated');
      }
      setEditingId(null);
      setForm({ ...EMPTY_CATEGORY });
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save category', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(catId) {
    setDeletingId(catId);
    try {
      await invoicingApi.deleteExpenseCategory(orgSlug, catId);
      showToast('Expense category deactivated');
      if (showInactive) {
        setCategories(prev => prev.map(c => c._id === catId ? { ...c, active: false } : c));
      } else {
        setCategories(prev => prev.filter(c => c._id !== catId));
      }
      if (editingId === catId) cancelEdit();
    } catch (err) {
      showToast(err.message || 'Failed to delete category', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(cat) {
    try {
      await invoicingApi.updateExpenseCategory(orgSlug, cat._id, { active: !cat.active });
      setCategories(prev =>
        prev.map(c => c._id === cat._id ? { ...c, active: !c.active } : c)
      );
      showToast(cat.active ? 'Category deactivated' : 'Category activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
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
            placeholder="e.g. Travel *"
            autoFocus
            className={inputCls}
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Short description"
            className={inputCls}
          />
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
          <h1 className="text-xl font-bold text-white">Expense Categories</h1>
          <p className="text-sm text-dark-400 mt-0.5">
            Tag vendor bill line items for expense reporting (Travel, Software, Rent, etc.)
          </p>
        </div>
        <button
          onClick={startAdd}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories..."
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
        <label className="flex items-center gap-2 cursor-pointer text-sm text-dark-300 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
          />
          Show inactive
        </label>
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
                  <th className="text-left px-4 py-3 w-[25%]">
                    <span className="text-xs font-medium text-dark-400">Name</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Description</span>
                  </th>
                  <th className="text-center px-4 py-3 w-[100px]">
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
                    <td colSpan={4} className="text-center py-16">
                      <Tag size={48} className="mx-auto mb-3 opacity-30 text-dark-500" />
                      <p className="text-sm text-dark-500">
                        {categories.length === 0 ? 'No expense categories yet' : 'No categories match your search'}
                      </p>
                      {categories.length === 0 && (
                        <button
                          onClick={startAdd}
                          className="mt-3 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
                        >
                          Add your first category
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(cat => {
                    if (editingId === cat._id) {
                      return <FormRow key={cat._id} />;
                    }
                    return (
                      <tr
                        key={cat._id}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{cat.name}</p>
                        </td>
                        <td className="px-4 py-3 text-dark-300">
                          {cat.description || <span className="text-dark-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(cat)}
                            className="inline-flex items-center transition-colors"
                            title={cat.active !== false ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                          >
                            {cat.active !== false ? (
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
                              onClick={() => startEdit(cat)}
                              disabled={editingId !== null}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(cat._id)}
                              disabled={deletingId === cat._id || cat.active === false}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title={cat.active === false ? 'Already inactive' : 'Deactivate'}
                            >
                              {deletingId === cat._id ? (
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
