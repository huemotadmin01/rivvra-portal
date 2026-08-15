// ============================================================================
// TaxesConfigV2.jsx — Tax rates on ds (phase 14, invoicing statutory config)
// ============================================================================
// Copied from TaxesConfig.jsx onto ds `ConfigList`.
//
// These rates are multiplied into every invoice line, so validation and payload
// are preserved expression-for-expression from the legacy `handleSave`. The
// guard that matters most is the one a rewrite would flatten:
//
//     if (form.type === 'percentage' && rateNum > 100)
//
// The 100 cap is conditional on TYPE. A fixed-amount tax can legitimately
// exceed 100 — it is money, not a percent — and capping it would silently
// block valid configuration. Kept verbatim, comment and all.
//
// Order matters too and is preserved: name → rate present/numeric → negative →
// the type-conditional 100 cap → create-only duplicate name. A reordering that
// checked the cap before "is it a number" would report the wrong message for
// junk input.
//
// The rate CELL renders `12%` for percentage and a bare number otherwise,
// matching legacy — the money-parity capture is what pins this, since a
// percent sign appearing on a fixed tax would be a real misstatement.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { Percent, Power } from 'lucide-react';
import { Button, Chip, ConfigList } from '../../components/ds';

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

// Scope tones, ported from the legacy Tailwind map to status tokens.
const SCOPE_TONE = { sale: 'info', purchase: 'warn', both: 'brand' };

export default function TaxesConfigV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setTaxes([]);
    try {
      const res = await invoicingApi.listTaxes(orgSlug);
      setTaxes(res.taxes || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load taxes', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  // --- Validation + payload: preserved from the legacy handleSave, in order --
  function buildPayload(values, isNew) {
    const name = String(values.name ?? '');
    const rate = values.rate ?? '';
    if (!name.trim()) {
      throw new Error('Tax name is required');
    }
    if (rate === '' || isNaN(Number(rate))) {
      throw new Error('A valid rate is required');
    }
    const rateNum = Number(rate);
    if (rateNum < 0) {
      throw new Error('Rate cannot be negative');
    }
    // The 100 cap only makes sense for percentage taxes — a fixed-amount tax
    // can legitimately exceed 100 (it's money, not a percent).
    if (values.type === 'percentage' && rateNum > 100) {
      throw new Error('Rate cannot exceed 100%');
    }
    if (isNew) {
      const nameLc = name.trim().toLowerCase();
      if (taxes.some(t => (t.name || '').trim().toLowerCase() === nameLc)) {
        throw new Error('A tax with this name already exists');
      }
    }
    return {
      name: name.trim(),
      rate: Number(rate),
      type: values.type,
      scope: values.scope,
      inclusive: !!values.inclusive,
      active: values.active !== false,
    };
  }

  async function handleCreate(values) {
    await invoicingApi.createTax(orgSlug, buildPayload(values, true));
    showToast('Tax created');
    await loadData();
  }

  async function handleUpdate(tax, values) {
    await invoicingApi.updateTax(orgSlug, tax._id, buildPayload(values, false));
    showToast('Tax updated');
    await loadData();
  }

  async function handleDelete(tax) {
    await invoicingApi.deleteTax(orgSlug, tax._id);
    showToast('Tax deactivated');
    setTaxes(prev => prev.filter(t => t._id !== tax._id));
  }

  async function toggleActive(tax) {
    const isActive = tax.active !== false;
    try {
      await invoicingApi.updateTax(orgSlug, tax._id, { active: !isActive });
      setTaxes(prev => prev.map(t => t._id === tax._id ? { ...t, active: !isActive } : t));
      showToast(isActive ? 'Tax deactivated' : 'Tax activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  const columns = useMemo(() => [
    { key: 'name', header: 'Name',
      render: (t) => <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{t.name}</span> },
    // Percentage taxes print a % sign; fixed/group ones must NOT — a percent
    // sign on a fixed-amount tax misstates the charge.
    { key: 'rate', header: 'Rate', align: 'right', width: 100,
      render: (t) => (
        <span style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {t.type === 'percentage' ? `${t.rate}%` : t.rate}
        </span>
      ) },
    { key: 'type', header: 'Type', width: 120, muted: true,
      render: (t) => TAX_TYPE_OPTIONS.find(o => o.value === t.type)?.label || t.type },
    { key: 'scope', header: 'Scope', width: 120,
      render: (t) => (
        <Chip tone={SCOPE_TONE[t.scope] || 'neutral'}>
          {SCOPE_OPTIONS.find(o => o.value === t.scope)?.label || t.scope}
        </Chip>
      ) },
    { key: 'inclusive', header: 'Inclusive', align: 'center', width: 100, muted: true,
      render: (t) => (t.inclusive ? 'Yes' : 'No') },
    { key: 'active', header: 'Status', align: 'center', width: 110,
      render: (t) => (
        t.active !== false
          ? <Chip tone="brand" dot>Active</Chip>
          : <Chip tone="neutral" dot>Inactive</Chip>
      ) },
  ], []);

  return (
    <ConfigList
      icon={<Percent size={18} />}
      title="Taxes"
      sub="Rates applied to invoice and bill lines"
      noun="tax"
      items={taxes}
      loading={loading}
      searchable
      searchKeys={['name']}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, autoFocus: true, placeholder: 'GST 18%' },
        { key: 'rate', label: 'Rate', type: 'number', required: true,
          hint: 'A percentage for percentage taxes, an amount for fixed ones.' },
        { key: 'type', label: 'Type', type: 'select', defaultValue: 'percentage', options: TAX_TYPE_OPTIONS },
        { key: 'scope', label: 'Scope', type: 'select', defaultValue: 'both', options: SCOPE_OPTIONS },
        { key: 'inclusive', label: 'Tax-inclusive pricing', type: 'toggle', defaultValue: false,
          hint: 'On: the line amount already contains this tax.' },
        { key: 'active', label: 'Active', type: 'toggle', defaultValue: true },
      ]}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      // COPY CORRECTED against observed server behaviour. The legacy dialog said
      // "This permanently removes the tax. If invoices reference it, deletion
      // will be refused" — neither half holds. DELETE returns 200 and flips
      // `active: false`; a brand-new, unreferenced tax was soft-deleted just
      // the same, and the row stays in the list. Same class of error as the CRM
      // lost-reasons copy fixed in Slice 4: never promise an outcome the server
      // does not produce.
      deleteConfirm={(t) => ({
        title: 'Deactivate tax?',
        message: `Deactivate "${t.name}"? It can no longer be applied to new invoice or bill lines. Invoices already using it keep the tax they were issued with.`,
      })}
      rowActions={(t) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleActive(t)}
          title={t.active !== false ? 'Deactivate' : 'Activate'}
          aria-label={t.active !== false ? 'Deactivate' : 'Activate'}
        >
          <Power size={14} />
        </Button>
      )}
      emptyText="No taxes configured yet"
    />
  );
}
