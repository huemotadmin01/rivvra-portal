// ============================================================================
// PaymentTermsConfigV2.jsx — Payment terms on ds (phase 14, invoicing config)
// ============================================================================
// Copied from PaymentTermsConfig.jsx and moved onto ds `ConfigList`, the same
// master-data archetype the CRM config pages use.
//
// This is a WRITE surface, and unlike the lists the kit owns the form — so the
// money-pass rule is applied to the part that matters: **validation and payload
// construction are preserved expression-for-expression**, lifted out of
// `handleSave` into `buildPayload` and called from the kit's onCreate/onUpdate.
// Nothing about what reaches the server changed:
//
//   name  : form.name.trim()          (required)
//   days  : Number(form.days)         (required, numeric, >= 0)
//   isDefault / active                (booleans, passed straight through)
//   + the create-only duplicate-name check, case-insensitive on trimmed name
//
// `ConfigList` surfaces a thrown Error inline, which is why the validation
// throws rather than toasting — the message lands next to the field instead of
// in a corner, and the modal stays open with the user's input intact.
//
// The two row-level quick actions are kept as `rowActions`: activate/deactivate
// and set-as-default. Both PATCH a single field and optimistically patch local
// state exactly as before — including toggleDefault's unmark-others pass, which
// mirrors what the server does so the list doesn't briefly show two defaults.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { Clock, Star, Power } from 'lucide-react';
import { Button, Chip, ConfigList } from '../../components/ds';

export default function PaymentTermsConfigV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setTerms([]);
    try {
      const res = await invoicingApi.listPaymentTerms(orgSlug);
      setTerms(res.paymentTerms || res.data || []);
    } catch (err) {
      setLoadError(err.message || 'Failed to load payment terms');
      showToast(err.message || 'Failed to load payment terms', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  // --- Validation + payload: preserved from the legacy handleSave ----------
  function buildPayload(values, isNew) {
    const name = String(values.name ?? '');
    const days = values.days ?? '';
    if (!name.trim()) {
      throw new Error('Payment term name is required');
    }
    if (days === '' || isNaN(Number(days)) || Number(days) < 0) {
      throw new Error('A valid number of days is required');
    }
    if (isNew) {
      const nameLc = name.trim().toLowerCase();
      if (terms.some(t => (t.name || '').trim().toLowerCase() === nameLc)) {
        throw new Error('A payment term with this name already exists');
      }
    }
    return {
      name: name.trim(),
      days: Number(days),
      isDefault: !!values.isDefault,
      active: values.active !== false,
    };
  }

  async function handleCreate(values) {
    await invoicingApi.createPaymentTerm(orgSlug, buildPayload(values, true));
    showToast('Payment term created');
    await loadData();
  }

  async function handleUpdate(term, values) {
    await invoicingApi.updatePaymentTerm(orgSlug, term._id, buildPayload(values, false));
    showToast('Payment term updated');
    await loadData();
  }

  async function handleDelete(term) {
    await invoicingApi.deletePaymentTerm(orgSlug, term._id);
    showToast('Payment term deleted');
    setTerms(prev => prev.filter(t => t._id !== term._id));
  }

  async function toggleActive(term) {
    const isActive = term.active !== false;
    try {
      await invoicingApi.updatePaymentTerm(orgSlug, term._id, { active: !isActive });
      setTerms(prev =>
        prev.map(t => t._id === term._id ? { ...t, active: !isActive } : t)
      );
      showToast(isActive ? 'Payment term deactivated' : 'Payment term activated');
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

  const columns = useMemo(() => [
    { key: 'name', header: 'Name',
      render: (t) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{t.name}</span>
          {t.isDefault && <Chip tone="brand" uppercase>Default</Chip>}
        </span>
      ) },
    { key: 'days', header: 'Days', align: 'right', width: 90,
      render: (t) => <span style={{ color: 'var(--fg-2)' }}>{t.days}</span> },
    { key: 'active', header: 'Status', align: 'center', width: 110,
      render: (t) => (
        t.active !== false
          ? <Chip tone="brand" dot>Active</Chip>
          : <Chip tone="neutral" dot>Inactive</Chip>
      ) },
  ], []);

  return (
    <ConfigList
      icon={<Clock size={18} />}
      title="Payment Terms"
      sub="Due-date rules invoices can be issued on"
      noun="payment term"
      items={terms}
      loading={loading}
      searchable
      searchKeys={['name']}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, autoFocus: true, placeholder: 'Net 30' },
        { key: 'days', label: 'Days', type: 'number', required: true, hint: 'Days from the invoice date until payment is due. 0 means due immediately.' },
        { key: 'isDefault', label: 'Default for new invoices', type: 'toggle', defaultValue: false },
        { key: 'active', label: 'Active', type: 'toggle', defaultValue: true },
      ]}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      deleteConfirm={(t) => ({
        title: 'Delete payment term?',
        // Copy unchanged: it is careful about what delete does and does not do,
        // and it steers to deactivate — which is the reversible option.
        message: `Delete "${t.name}"? This permanently removes the payment term. Invoices already using it are unaffected, but new invoices can no longer select it — deactivate it instead to hide it.`,
      })}
      rowActions={(t) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleDefault(t)}
            title={t.isDefault ? 'Remove default' : 'Set as default'}
            aria-label={t.isDefault ? 'Remove default' : 'Set as default'}
          >
            <Star size={14} style={t.isDefault ? { color: 'var(--warn-ink)', fill: 'currentColor' } : undefined} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleActive(t)}
            title={t.active !== false ? 'Deactivate' : 'Activate'}
            aria-label={t.active !== false ? 'Deactivate' : 'Activate'}
          >
            <Power size={14} />
          </Button>
        </>
      )}
      emptyText={loadError || 'No payment terms yet'}
    />
  );
}
