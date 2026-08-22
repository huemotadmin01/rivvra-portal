// ============================================================================
// ExpenseCategoriesConfigV2.jsx — Expense categories on ds (phase 14, config)
// ============================================================================
// Copied from ExpenseCategoriesConfig.jsx onto ds `ConfigList`.
//
// Validation and payload are preserved expression-for-expression from the
// legacy `handleSave` (name required + create-only case-insensitive duplicate
// check; payload = trimmed name, trimmed description, active).
//
// ONE deliberate behaviour change, and it is a correction rather than a
// redesign: **the legacy row delete had no confirmation at all** — a single
// click deactivated the category. `ConfigList` confirms, matching the Slice-4
// ruling that legacy unconfirmed/window.confirm deletes get a ConfirmDialog.
//
// The confirm copy says DEACTIVATE, not delete, because that is what the
// endpoint does: `deleteExpenseCategory` soft-deletes, the legacy toast reads
// "Expense category deactivated", and with `showInactive` on, the row stays in
// the list flipped to inactive rather than disappearing. Promising deletion
// here would have been the same class of error as the CRM lost-reasons copy.
//
// `showInactive` is a FETCH parameter, not a client filter — it round-trips to
// the server via `includeInactive`, so it stays wired to loadData and is
// surfaced through the kit's `toolbar` slot.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { Tags, Power } from 'lucide-react';
import { Button, Chip, ConfigList, Switch } from '../../components/ds';

export default function ExpenseCategoriesConfigV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setCategories([]);
    try {
      const res = await invoicingApi.listExpenseCategories(orgSlug, {
        includeInactive: showInactive ? 1 : '',
      });
      setCategories(res.categories || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load expense categories', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, showInactive, currentCompany?._id]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  // --- Validation + payload: preserved from the legacy handleSave ----------
  function buildPayload(values, isNew) {
    const name = String(values.name ?? '');
    const description = String(values.description ?? '');
    if (!name.trim()) {
      throw new Error('Category name is required');
    }
    if (isNew) {
      const nameLc = name.trim().toLowerCase();
      if (categories.some(c => (c.name || '').trim().toLowerCase() === nameLc)) {
        throw new Error('An expense category with this name already exists');
      }
    }
    return {
      name: name.trim(),
      description: description.trim(),
      active: values.active !== false,
    };
  }

  async function handleCreate(values) {
    await invoicingApi.createExpenseCategory(orgSlug, buildPayload(values, true));
    showToast('Expense category created');
    await loadData();
  }

  async function handleUpdate(cat, values) {
    await invoicingApi.updateExpenseCategory(orgSlug, cat._id, buildPayload(values, false));
    showToast('Expense category updated');
    await loadData();
  }

  async function handleDelete(cat) {
    await invoicingApi.deleteExpenseCategory(orgSlug, cat._id);
    showToast('Expense category deactivated');
    // Same branch as legacy: with inactive rows visible the row stays and
    // flips; otherwise it leaves the list.
    if (showInactive) {
      setCategories(prev => prev.map(c => c._id === cat._id ? { ...c, active: false } : c));
    } else {
      setCategories(prev => prev.filter(c => c._id !== cat._id));
    }
  }

  async function toggleActive(cat) {
    const isActive = cat.active !== false;
    try {
      await invoicingApi.updateExpenseCategory(orgSlug, cat._id, { active: !isActive });
      setCategories(prev =>
        prev.map(c => c._id === cat._id ? { ...c, active: !isActive } : c)
      );
      showToast(isActive ? 'Category deactivated' : 'Category activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  const columns = useMemo(() => [
    { key: 'name', header: 'Name', width: 260,
      render: (c) => <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{c.name}</span> },
    { key: 'description', header: 'Description', wrap: true, muted: true,
      render: (c) => c.description || '—' },
    { key: 'active', header: 'Status', align: 'center', width: 110,
      render: (c) => (
        c.active !== false
          ? <Chip tone="brand" dot>Active</Chip>
          : <Chip tone="neutral" dot>Inactive</Chip>
      ) },
  ], []);

  return (
    <ConfigList
      icon={<Tags size={18} />}
      title="Expense Categories"
      sub="Categories available on expense claims and vendor bills"
      noun="expense category"
      items={categories}
      loading={loading}
      searchable
      searchKeys={['name', 'description']}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, autoFocus: true, placeholder: 'Travel' },
        { key: 'description', label: 'Description', type: 'text', placeholder: 'Optional' },
        { key: 'active', label: 'Active', type: 'toggle', defaultValue: true },
      ]}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      deleteConfirm={(c) => ({
        title: 'Deactivate category?',
        message: `Deactivate "${c.name}"? It stays on existing claims and bills but can no longer be picked on new ones. You can reactivate it from this page.`,
      })}
      toolbar={
        // ds `Switch`'s `label` is the ACCESSIBLE name, not a visible one —
        // passing it alone renders a bare unlabelled toggle. The visible text
        // has to sit beside it.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Switch
            checked={showInactive}
            onChange={setShowInactive}
            label="Show inactive categories"
          />
          <span style={{ font: 'var(--t-small)', color: 'var(--fg-2)' }}>Show inactive</span>
        </span>
      }
      rowActions={(c) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleActive(c)}
          title={c.active !== false ? 'Deactivate' : 'Activate'}
          aria-label={c.active !== false ? 'Deactivate' : 'Activate'}
        >
          <Power size={14} />
        </Button>
      )}
      emptyText="No expense categories yet"
    />
  );
}
