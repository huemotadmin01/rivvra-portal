// ============================================================================
// JournalsConfigV2.jsx — Accounting journals on ds (phase 14, invoicing config)
// ============================================================================
// Copied from JournalsConfig.jsx onto ds `ConfigList`.
//
// Validation and payload preserved expression-for-expression from the legacy
// `handleSave`. The one that matters most is easy to lose in a rewrite:
//
//     code: form.code.trim().toUpperCase()
//
// The journal code is uppercased on save, and it is what invoice numbers are
// prefixed with (the list page filters by `journalCode`). Dropping the
// `.toUpperCase()` would let a lowercase code through and split a journal's
// numbering. It is kept verbatim.
//
// `makeDefault` also keeps its comment and its mirror of the server's
// behaviour: the backend unsets siblings of the same (company, type), so the
// optimistic update clears `isDefault` on same-TYPE journals only — not on all
// of them. That distinction is why the pass copies rather than re-derives.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import { BookOpen, Star, Power } from 'lucide-react';
import { Button, Chip, ConfigList, Select } from '../../components/ds';

const JOURNAL_TYPES = [
  { value: 'sale', label: 'Sale' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
];

export default function JournalsConfigV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setJournals([]);
    try {
      const res = await invoicingApi.listJournals(orgSlug);
      setJournals(res.journals || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load journals', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  const visible = useMemo(
    () => (typeFilter ? journals.filter(j => j.type === typeFilter) : journals),
    [journals, typeFilter]
  );

  // --- Validation + payload: preserved from the legacy handleSave ----------
  function buildPayload(values, isNew) {
    const name = String(values.name ?? '');
    const code = String(values.code ?? '');
    if (!name.trim()) {
      throw new Error('Journal name is required');
    }
    if (!code.trim()) {
      throw new Error('Short code is required');
    }
    if (isNew) {
      const nameLc = name.trim().toLowerCase();
      if (journals.some(j => (j.name || '').trim().toLowerCase() === nameLc)) {
        throw new Error('A journal with this name already exists');
      }
    }
    return {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      type: values.type,
      currency: values.currency || currentCompany?.currency || 'INR',
      active: values.active !== false,
      isDefault: !!values.isDefault,
    };
  }

  async function handleCreate(values) {
    await invoicingApi.createJournal(orgSlug, buildPayload(values, true));
    showToast('Journal created');
    await loadData();
  }

  async function handleUpdate(journal, values) {
    await invoicingApi.updateJournal(orgSlug, journal._id, buildPayload(values, false));
    showToast('Journal updated');
    await loadData();
  }

  async function handleDelete(journal) {
    await invoicingApi.deleteJournal(orgSlug, journal._id);
    showToast('Journal deleted');
    setJournals(prev => prev.filter(j => j._id !== journal._id));
  }

  async function toggleActive(journal) {
    const isActive = journal.active !== false;
    try {
      await invoicingApi.updateJournal(orgSlug, journal._id, { active: !isActive });
      setJournals(prev =>
        prev.map(j => j._id === journal._id ? { ...j, active: !isActive } : j)
      );
      showToast(isActive ? 'Journal deactivated' : 'Journal activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  async function makeDefault(journal) {
    try {
      await invoicingApi.updateJournal(orgSlug, journal._id, { isDefault: true });
      // Backend unsets siblings of the same (company, type). Mirror that here
      // so the UI reflects the change without a full reload.
      setJournals(prev => prev.map(j => {
        if (j._id === journal._id) return { ...j, isDefault: true };
        if (j.type === journal.type) return { ...j, isDefault: false };
        return j;
      }));
      showToast(`${journal.name} set as default ${journal.type} journal`);
    } catch (err) {
      showToast(err.message || 'Failed to set default', 'error');
    }
  }

  const columns = useMemo(() => [
    { key: 'name', header: 'Name',
      render: (j) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{j.name}</span>
          {j.isDefault && <Chip tone="brand" uppercase>Default</Chip>}
        </span>
      ) },
    { key: 'code', header: 'Code', width: 110,
      render: (j) => (
        <span style={{ font: '600 12px/1 var(--mono, ui-monospace, monospace)', color: 'var(--fg-2)', letterSpacing: '0.04em' }}>
          {j.code}
        </span>
      ) },
    { key: 'type', header: 'Type', width: 130, muted: true,
      render: (j) => JOURNAL_TYPES.find(t => t.value === j.type)?.label || j.type },
    { key: 'currency', header: 'Currency', width: 100, muted: true,
      render: (j) => j.currency || currentCompany?.currency || 'INR' },
    { key: 'active', header: 'Status', align: 'center', width: 110,
      render: (j) => (
        j.active !== false
          ? <Chip tone="brand" dot>Active</Chip>
          : <Chip tone="neutral" dot>Inactive</Chip>
      ) },
    // Depends on the company currency via the Currency cell's fallback — an
    // empty dep array would pin the first company's currency after a switch.
  ], [currentCompany?.currency]);

  return (
    <ConfigList
      icon={<BookOpen size={18} />}
      title="Journals"
      sub="Numbering sequences invoices and bills are booked against"
      noun="journal"
      items={visible}
      loading={loading}
      searchable
      searchKeys={['name', 'code']}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true, autoFocus: true, placeholder: 'Customer Invoices' },
        { key: 'code', label: 'Short code', type: 'text', required: true, placeholder: 'INV',
          hint: 'Prefixes every number issued from this journal. Saved in upper case.' },
        { key: 'type', label: 'Type', type: 'select', defaultValue: 'sale', options: JOURNAL_TYPES },
        // Legacy seeds a NEW journal with `currentCompany?.currency || 'INR'`,
        // not a hard 'INR' — on a USD company a hardcoded default would book
        // the journal in the wrong currency. Same class of bug as the incentive
        // formatINR hardcoding; caught by the write-path expression diff.
        { key: 'currency', label: 'Currency', type: 'select',
          defaultValue: currentCompany?.currency || 'INR',
          options: SUPPORTED_CURRENCIES.map(c => ({ value: c, label: c })) },
        { key: 'isDefault', label: 'Default for its type', type: 'toggle', defaultValue: false },
        { key: 'active', label: 'Active', type: 'toggle', defaultValue: true },
      ]}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      deleteConfirm={(j) => ({
        title: 'Delete journal?',
        // Copy unchanged. It is careful to say deletion will be REFUSED if
        // invoices reference it, rather than promising a cascade.
        message: `Delete "${j.name}" (${j.code})? This permanently removes the journal. If invoices reference it, deletion will be refused — deactivate the journal instead to hide it.`,
      })}
      toolbar={
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          {JOURNAL_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      }
      rowActions={(j) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => makeDefault(j)}
            disabled={!!j.isDefault}
            title={j.isDefault ? `Already the default ${j.type} journal` : `Set as default ${j.type} journal`}
            aria-label="Set as default"
          >
            <Star size={14} style={j.isDefault ? { color: 'var(--warn-ink)', fill: 'currentColor' } : undefined} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleActive(j)}
            title={j.active !== false ? 'Deactivate' : 'Activate'}
            aria-label={j.active !== false ? 'Deactivate' : 'Activate'}
          >
            <Power size={14} />
          </Button>
        </>
      )}
      emptyText={typeFilter ? 'No journals of this type' : 'No journals yet'}
    />
  );
}
