// ============================================================================
// ProductCatalogV2.jsx — Product catalogue on ds (phase 14, invoicing config)
// ============================================================================
// Copied from ProductCatalog.jsx onto ds `ConfigList`. Validation and payload
// are preserved expression-for-expression from the legacy `handleSave`, with
// two details that a rewrite would quietly flatten:
//
//  1. **A blank price sends `undefined`, not `0`.**
//         defaultPrice: form.defaultPrice !== '' ? Number(form.defaultPrice) : undefined
//     "No default price" and "priced at zero" are different states — the first
//     leaves the line open for the invoice to set, the second asserts free.
//     Coercing blank to 0 would silently price every unpriced product.
//
//  2. **`description` is NOT trimmed** while every other string field is.
//     Kept as-is rather than "tidied" into consistency; whitespace in a
//     description is the author's, and changing it is not this pass's business.
//
// `taxName`'s rate-badge rule is carried over verbatim, regex and comment
// included: the "(18%)" suffix appears ONLY when the tax name does not already
// contain its rate. That rule is what the money-parity capture pins — the
// percentages in it come from here, not from the rate column.
//
// The price cell keeps both fallbacks: `defaultPrice ?? price` and
// `currency || currentCompany?.currency`.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Package, Power } from 'lucide-react';
import { Button, Chip, ConfigList, Select } from '../../components/ds';

const PRODUCT_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'product', label: 'Product' },
];

const TYPE_TONE = { service: 'info', consumable: 'warn', product: 'brand' };

export default function ProductCatalogV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    // Reset on company switch so the previous company's products don't linger
    // if the new fetch returns nothing.
    setProducts([]);
    setTaxes([]);
    try {
      const [prodRes, taxRes] = await Promise.all([
        invoicingApi.listProducts(orgSlug, { limit: 500 }),
        invoicingApi.listTaxes(orgSlug),
      ]);
      const list = prodRes.products || prodRes.data || [];
      setProducts(list);
      setTaxes(taxRes.taxes || taxRes.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  const visible = useMemo(
    () => (typeFilter ? products.filter(p => p.type === typeFilter) : products),
    [products, typeFilter]
  );

  function taxName(taxId) {
    const tax = taxes.find(t => t._id === taxId);
    if (!tax) return taxId;
    // Q5/B — show the rate badge ONLY when the tax name doesn't already
    // contain the rate.  Standard Rivvra taxes ("IGST 18%", "GST 12%",
    // "GST 5%") already have the rate inline → showing "(18%)" again is
    // redundant.  Custom taxes named just "Service Tax" or "Cess" with
    // rate 14 still get the "(14%)" badge so the rate stays visible.
    const ratePat = new RegExp(`\\b${tax.rate}\\s*%`);
    return ratePat.test(tax.name) ? tax.name : `${tax.name} (${tax.rate}%)`;
  }

  // --- Validation + payload: preserved from the legacy handleSave ----------
  function buildPayload(values, isNew) {
    const name = String(values.name ?? '');
    if (!name.trim()) {
      throw new Error('Product name is required');
    }
    if (isNew) {
      const nameLc = name.trim().toLowerCase();
      if (products.some(p => (p.name || '').trim().toLowerCase() === nameLc)) {
        throw new Error('A product with this name already exists');
      }
    }
    const defaultPrice = values.defaultPrice ?? '';
    return {
      name: name.trim(),
      type: values.type,
      // deliberately NOT trimmed — matches legacy
      description: values.description ?? '',
      // blank -> undefined, NOT 0. See the header note.
      defaultPrice: defaultPrice !== '' ? Number(defaultPrice) : undefined,
      hsnSacCode: String(values.hsnSacCode ?? '').trim(),
      unit: String(values.unit ?? '').trim(),
      internalRef: String(values.internalRef ?? '').trim(),
      taxIds: values.taxIds || [],
      active: values.active !== false,
    };
  }

  async function handleCreate(values) {
    await invoicingApi.createProduct(orgSlug, buildPayload(values, true));
    showToast('Product created');
    await loadData();
  }

  async function handleUpdate(product, values) {
    await invoicingApi.updateProduct(orgSlug, product._id, buildPayload(values, false));
    showToast('Product updated');
    await loadData();
  }

  async function handleDelete(product) {
    await invoicingApi.deleteProduct(orgSlug, product._id);
    showToast('Product deleted');
    setProducts(prev => prev.filter(p => p._id !== product._id));
  }

  async function toggleActive(product) {
    const isActive = product.active !== false;
    try {
      await invoicingApi.updateProduct(orgSlug, product._id, { active: !isActive });
      setProducts(prev => prev.map(p => p._id === product._id ? { ...p, active: !isActive } : p));
      showToast(isActive ? 'Product deactivated' : 'Product activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  const columns = useMemo(() => [
    { key: 'name', header: 'Name', wrap: true,
      render: (p) => (
        <span>
          <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{p.name}</span>
          {p.description && (
            <span style={{ display: 'block', font: 'var(--t-small)', color: 'var(--fg-4)', marginTop: 2 }}>
              {p.description}
            </span>
          )}
        </span>
      ) },
    { key: 'type', header: 'Type', width: 120,
      render: (p) => (
        <Chip tone={TYPE_TONE[p.type] || 'neutral'}>
          {PRODUCT_TYPES.find(t => t.value === p.type)?.label || p.type}
        </Chip>
      ) },
    { key: 'internalRef', header: 'Internal Ref', width: 130, muted: true,
      render: (p) => p.internalRef || '—' },
    { key: 'hsnSacCode', header: 'HSN/SAC', width: 120, muted: true,
      render: (p) => p.hsnSacCode || '—' },
    { key: 'unit', header: 'Unit', width: 90, muted: true,
      render: (p) => p.unit || '—' },
    { key: 'defaultPrice', header: 'Default Price', align: 'right', width: 130,
      render: (p) => (
        <span style={{ color: 'var(--fg)', fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(p.defaultPrice ?? p.price, p.currency || currentCompany?.currency)}
        </span>
      ) },
    { key: 'taxIds', header: 'Taxes', wrap: true, width: 180,
      render: (p) => {
        const ids = p.taxIds || p.defaultTaxIds || [];
        if (!ids.length) return <span style={{ color: 'var(--fg-4)' }}>None</span>;
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {ids.map(tId => <Chip key={tId} tone="neutral">{taxName(tId)}</Chip>)}
          </span>
        );
      } },
    { key: 'active', header: 'Status', align: 'center', width: 110,
      render: (p) => (
        p.active !== false
          ? <Chip tone="brand" dot>Active</Chip>
          : <Chip tone="neutral" dot>Inactive</Chip>
      ) },
  // taxName closes over `taxes`, and the price cell over the company currency.
  ], [taxes, currentCompany?.currency]);

  return (
    <ConfigList
      icon={<Package size={18} />}
      title="Products"
      sub="Catalogue of services and goods invoice lines are built from"
      noun="product"
      items={visible}
      loading={loading}
      searchable
      searchKeys={['name', 'description', 'internalRef', 'hsnSacCode']}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, autoFocus: true, placeholder: 'Contract staffing' },
        { key: 'type', label: 'Type', type: 'select', defaultValue: 'service', options: PRODUCT_TYPES },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'defaultPrice', label: 'Default price', type: 'number',
          hint: 'Leave blank for no default — that is not the same as 0.' },
        { key: 'hsnSacCode', label: 'HSN/SAC code', type: 'text' },
        { key: 'unit', label: 'Unit', type: 'text', placeholder: 'Hour, Day, Nos' },
        { key: 'internalRef', label: 'Internal reference', type: 'text' },
        { key: 'taxIds', label: 'Default taxes', type: 'checkboxList', defaultValue: [],
          options: taxes.map(t => ({ value: t._id, label: taxName(t._id) })) },
        { key: 'active', label: 'Active', type: 'toggle', defaultValue: true },
      ]}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      deleteConfirm={(p) => ({
        title: 'Delete product?',
        message: `Delete "${p.name}"? This cannot be undone. If any invoice references this product, deletion will be refused — deactivate it instead.`,
      })}
      toolbar={
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All Types</option>
          {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      }
      rowActions={(p) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleActive(p)}
          title={p.active !== false ? 'Active - click to deactivate' : 'Inactive - click to activate'}
          aria-label={p.active !== false ? 'Deactivate' : 'Activate'}
        >
          <Power size={14} />
        </Button>
      )}
      emptyText={typeFilter ? 'No products of this type' : 'No products yet'}
    />
  );
}
