import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Search, Plus, Loader2, Package, Trash2, Pencil, X,
  Check, ToggleLeft, ToggleRight, Layers, Wrench,
} from 'lucide-react';

const TYPE_STYLES = {
  service:     { bg: 'bg-blue-500/10',    text: 'text-blue-400',    label: 'Service' },
  consumable:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Consumable' },
  product:     { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', label: 'Product' },
};

function TypeBadge({ type }) {
  const st = TYPE_STYLES[type] || TYPE_STYLES.service;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${st.bg} ${st.text}`}>
      {type === 'service' ? <Wrench size={11} /> : <Layers size={11} />}
      {st.label}
    </span>
  );
}

function formatCurrency(amount) {
  if (amount == null || amount === '') return '-';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

const EMPTY_PRODUCT = {
  name: '',
  type: 'service',
  description: '',
  defaultPrice: '',
  taxIds: [],
  active: true,
};

export default function ProductCatalog() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Edit / add state
  const [editingId, setEditingId] = useState(null); // null = not editing, 'new' = adding
  const [form, setForm] = useState({ ...EMPTY_PRODUCT });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, taxRes] = await Promise.all([
        invoicingApi.listProducts(orgSlug, { limit: 500 }),
        invoicingApi.listTaxes(orgSlug),
      ]);
      setProducts(prodRes.products || prodRes.data || []);
      setTaxes(taxRes.taxes || taxRes.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  // Filtered products
  const filtered = useMemo(() => {
    let list = products;
    if (typeFilter) list = list.filter(p => p.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, typeFilter, search]);

  function startAdd() {
    setEditingId('new');
    setForm({ ...EMPTY_PRODUCT });
  }

  function startEdit(product) {
    setEditingId(product._id);
    setForm({
      name: product.name || '',
      type: product.type || 'service',
      description: product.description || '',
      defaultPrice: product.defaultPrice ?? product.price ?? '',
      taxIds: product.taxIds || product.defaultTaxIds || [],
      active: product.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_PRODUCT });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('Product name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        description: form.description,
        defaultPrice: form.defaultPrice !== '' ? Number(form.defaultPrice) : undefined,
        taxIds: form.taxIds,
        active: form.active,
      };

      if (editingId === 'new') {
        await invoicingApi.createProduct(orgSlug, payload);
        showToast('Product created');
      } else {
        await invoicingApi.updateProduct(orgSlug, editingId, payload);
        showToast('Product updated');
      }
      setEditingId(null);
      setForm({ ...EMPTY_PRODUCT });
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save product', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(productId) {
    setDeletingId(productId);
    try {
      await invoicingApi.deleteProduct(orgSlug, productId);
      showToast('Product deleted');
      setProducts(prev => prev.filter(p => p._id !== productId));
      if (editingId === productId) cancelEdit();
    } catch (err) {
      showToast(err.message || 'Failed to delete product', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(product) {
    try {
      await invoicingApi.updateProduct(orgSlug, product._id, { active: !product.active });
      setProducts(prev =>
        prev.map(p => p._id === product._id ? { ...p, active: !p.active } : p)
      );
      showToast(product.active ? 'Product deactivated' : 'Product activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  function taxName(taxId) {
    const tax = taxes.find(t => t._id === taxId);
    return tax ? `${tax.name} (${tax.rate}%)` : taxId;
  }

  // Inline form row
  function FormRow() {
    return (
      <tr className="border-b border-dark-700/50 bg-dark-800/80">
        <td className="px-4 py-3">
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Product name *"
            autoFocus
            className="w-full px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </td>
        <td className="px-4 py-3">
          <select
            value={form.type}
            onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
            className="px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
          >
            <option value="service">Service</option>
            <option value="consumable">Consumable</option>
            <option value="product">Product</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            min="0"
            step="any"
            value={form.defaultPrice}
            onChange={e => setForm(prev => ({ ...prev, defaultPrice: e.target.value }))}
            placeholder="0.00"
            className="w-full px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white text-right placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500 max-w-[120px]"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {taxes.map(tax => {
              const selected = form.taxIds.includes(tax._id);
              return (
                <button
                  key={tax._id}
                  type="button"
                  onClick={() => {
                    setForm(prev => ({
                      ...prev,
                      taxIds: selected
                        ? prev.taxIds.filter(t => t !== tax._id)
                        : [...prev.taxIds, tax._id],
                    }));
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    selected
                      ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
                      : 'bg-dark-900 border-dark-700 text-dark-500 hover:border-dark-600'
                  }`}
                >
                  {tax.name} ({tax.rate}%)
                </button>
              );
            })}
            {taxes.length === 0 && <span className="text-xs text-dark-600">No taxes</span>}
          </div>
        </td>
        <td className="px-4 py-3">
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
          <h1 className="text-xl font-bold text-white">Product Catalog</h1>
          <p className="text-sm text-dark-400 mt-0.5">Manage products and services for invoicing</p>
        </div>
        <button
          onClick={startAdd}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 focus:outline-none focus:border-rivvra-500"
        >
          <option value="">All Types</option>
          <option value="service">Service</option>
          <option value="consumable">Consumable</option>
          <option value="product">Product</option>
        </select>
        {(search || typeFilter) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); }}
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
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Type</span>
                  </th>
                  <th className="text-right px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Default Price</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Taxes</span>
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
                {/* New product row at top */}
                {editingId === 'new' && <FormRow />}

                {filtered.length === 0 && editingId !== 'new' ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Package size={48} className="mx-auto mb-3 opacity-30 text-dark-500" />
                      <p className="text-sm text-dark-500">
                        {products.length === 0 ? 'No products yet' : 'No products match your filters'}
                      </p>
                      {products.length === 0 && (
                        <button
                          onClick={startAdd}
                          className="mt-3 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
                        >
                          Add your first product
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(product => {
                    if (editingId === product._id) {
                      return <FormRow key={product._id} />;
                    }
                    return (
                      <tr
                        key={product._id}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-white">{product.name}</p>
                            {product.description && (
                              <p className="text-xs text-dark-500 mt-0.5 truncate max-w-[250px]">{product.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={product.type} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">
                          {formatCurrency(product.defaultPrice ?? product.price)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(product.taxIds || product.defaultTaxIds || []).map(tId => (
                              <span
                                key={tId}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-700 text-dark-300"
                              >
                                {taxName(tId)}
                              </span>
                            ))}
                            {!(product.taxIds || product.defaultTaxIds || []).length && (
                              <span className="text-xs text-dark-600">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(product)}
                            className="inline-flex items-center transition-colors"
                            title={product.active !== false ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                          >
                            {product.active !== false ? (
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
                              onClick={() => startEdit(product)}
                              disabled={editingId !== null}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(product._id)}
                              disabled={deletingId === product._id}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Delete"
                            >
                              {deletingId === product._id ? (
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
