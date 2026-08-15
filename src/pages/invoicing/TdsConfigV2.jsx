// ============================================================================
// TdsConfigV2.jsx — TDS sections on ds (phase 14, invoicing statutory config)
// ============================================================================
// Copied from TdsConfig.jsx onto ds `ConfigList`. This page configures statutory
// deduction rates under the Indian IT Act, so three things are preserved
// exactly, not approximately:
//
//  1. **The India gate.** `companyCountry !== 'IN'` returns the India-only
//     screen, and it stays AFTER all hooks so hook order is stable across
//     renders — the legacy comment says so and it is load-bearing. Showing TDS
//     configuration on a non-Indian company would be wrong, not just untidy.
//
//  2. **The rate guard.** Blank is skipped (it falls back to the defaults
//     below); anything present must be finite and within 0–100. Applied to all
//     three rates through the same loop, in the same order.
//
//  3. **The payload defaults.** `Number(x) || 0` for the two rates and both
//     thresholds, and `Number(ratePanMissing) || 20` — twenty being the
//     statutory no-PAN rate, not an arbitrary placeholder. `|| 0` and `|| 20`
//     are kept rather than `??`: a blank string must fall through to the
//     default, which `??` would not do.
//
//  Plus `sectionCode.trim().toUpperCase()` — section codes are matched against
//  elsewhere and a lowercase one would not match.
//
// The "Seed standard sections" action is carried over as a header action with
// its handler untouched. **It was deliberately NOT triggered during
// verification** — it bulk-inserts the standard Indian sections, and firing it
// on staging would write a pile of rows to prove a button works.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { Percent, Sparkles, ShieldCheck } from 'lucide-react';
import { Button, Chip, ConfigList, EmptyState, Spinner } from '../../components/ds';

const APPLICABLE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
];

const APPLICABLE_TONE = { all: 'brand', individual: 'info', company: 'warn' };

function formatAmount(n) {
  if (n == null || n === 0) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export default function TdsConfigV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany, companyCountry } = useCompany();
  const { showToast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const companyId = currentCompany?._id;

  const loadData = useCallback(async () => {
    setLoading(true);
    setRows([]);
    try {
      const res = await invoicingApi.listTdsConfig(orgSlug);
      setRows(res.rows || []);
    } catch (err) {
      showToast(err.message || 'Failed to load TDS sections', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, companyId]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  // --- Validation + payload: preserved from the legacy handleSave ----------
  function buildPayload(values) {
    const sectionCode = String(values.sectionCode ?? '');
    if (!sectionCode.trim()) {
      throw new Error('Section code is required (e.g. 194C)');
    }
    if (!companyId) {
      throw new Error('Select a company from the header first');
    }
    // Rates are percentages — reject junk / out-of-range values before save.
    const rateChecks = [
      ['Individual rate', values.rateIndividual],
      ['Company rate', values.rateCompany],
      ['No-PAN rate', values.ratePanMissing],
    ];
    for (const [label, raw] of rateChecks) {
      if (raw === '' || raw == null) continue; // blank falls back to 0 / 20 defaults
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new Error(`${label} must be a number between 0 and 100`);
      }
    }
    return {
      sectionCode: sectionCode.trim().toUpperCase(),
      description: String(values.description ?? '').trim(),
      rateIndividual: Number(values.rateIndividual) || 0,
      rateCompany: Number(values.rateCompany) || 0,
      ratePanMissing: Number(values.ratePanMissing) || 20,
      thresholdPerInvoice: Number(values.thresholdPerInvoice) || 0,
      thresholdAnnual: Number(values.thresholdAnnual) || 0,
      applicableTo: values.applicableTo,
      active: values.active !== false,
    };
  }

  async function handleCreate(values) {
    await invoicingApi.createTdsConfig(orgSlug, buildPayload(values));
    showToast('TDS section added');
    await loadData();
  }

  async function handleUpdate(row, values) {
    await invoicingApi.updateTdsConfig(orgSlug, row._id, buildPayload(values));
    showToast('TDS section updated');
    await loadData();
  }

  async function handleDelete(row) {
    await invoicingApi.deleteTdsConfig(orgSlug, row._id);
    showToast('TDS section deleted');
    setRows(prev => prev.filter(r => r._id !== row._id));
  }

  async function handleSeed() {
    if (!companyId) {
      showToast('Select a company from the header first', 'error');
      return;
    }
    setSeeding(true);
    try {
      const res = await invoicingApi.seedTdsDefaults(orgSlug);
      showToast(`Seeded ${res.inserted} section(s), ${res.skipped} already existed`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to seed defaults', 'error');
    } finally {
      setSeeding(false);
    }
  }

  const columns = useMemo(() => [
    { key: 'sectionCode', header: 'Section', width: 110,
      render: (r) => (
        <span style={{ font: '600 12.5px/1 var(--mono, ui-monospace, monospace)', color: 'var(--fg)' }}>
          {r.sectionCode}
        </span>
      ) },
    { key: 'description', header: 'Description', wrap: true, muted: true,
      render: (r) => r.description || '—' },
    // The `?? 0` / `?? 20` fallbacks match legacy: a missing rate reads as the
    // default it will be saved with, not as blank.
    { key: 'rateIndividual', header: 'Indiv %', align: 'right', width: 92,
      render: (r) => <span style={{ color: 'var(--fg)' }}>{r.rateIndividual ?? 0}%</span> },
    { key: 'rateCompany', header: 'Company %', align: 'right', width: 104,
      render: (r) => <span style={{ color: 'var(--fg)' }}>{r.rateCompany ?? 0}%</span> },
    { key: 'ratePanMissing', header: 'No PAN %', align: 'right', width: 100,
      render: (r) => <span style={{ color: 'var(--warn-ink)' }}>{r.ratePanMissing ?? 20}%</span> },
    { key: 'thresholdPerInvoice', header: 'Per Invoice ₹', align: 'right', width: 120, muted: true,
      render: (r) => formatAmount(r.thresholdPerInvoice) },
    { key: 'thresholdAnnual', header: 'Annual ₹', align: 'right', width: 110, muted: true,
      render: (r) => formatAmount(r.thresholdAnnual) },
    { key: 'applicableTo', header: 'Applies To', width: 120,
      render: (r) => (
        <Chip tone={APPLICABLE_TONE[r.applicableTo] || 'brand'}>
          {APPLICABLE_OPTIONS.find(o => o.value === r.applicableTo)?.label || r.applicableTo}
        </Chip>
      ) },
    { key: 'active', header: 'Status', align: 'center', width: 104,
      render: (r) => (
        r.active !== false
          ? <Chip tone="brand" dot>Active</Chip>
          : <Chip tone="neutral" dot>Inactive</Chip>
      ) },
  ], []);

  // TDS (tax deducted at source under the Indian IT Act) only applies to
  // Indian companies — mirror GstReconciliation's India-only screen. Placed
  // after all hooks so hook order stays stable across renders.
  if (companyCountry !== 'IN') {
    return (
      <EmptyState
        icon={<ShieldCheck size={22} />}
        tone="warn"
        title="India-only feature"
      >
        TDS sections are available only for companies registered in India.
        Switch to an Indian company to use them.
      </EmptyState>
    );
  }

  return (
    <ConfigList
      icon={<Percent size={18} />}
      title="TDS Sections"
      sub="Deduction rates and thresholds under the Indian IT Act"
      noun="TDS section"
      modalTitle="TDS section"
      items={rows}
      loading={loading}
      searchable
      searchKeys={['sectionCode', 'description']}
      columns={columns}
      fields={[
        { key: 'sectionCode', label: 'Section code', type: 'text', required: true, autoFocus: true,
          placeholder: '194C', hint: 'Saved in upper case.' },
        { key: 'description', label: 'Description', type: 'text', placeholder: 'Payments to contractors' },
        { key: 'rateIndividual', label: 'Individual rate %', type: 'number', defaultValue: '' },
        { key: 'rateCompany', label: 'Company rate %', type: 'number', defaultValue: '' },
        { key: 'ratePanMissing', label: 'No-PAN rate %', type: 'number', defaultValue: 20,
          hint: 'Statutory rate when the deductee has no PAN. Defaults to 20.' },
        { key: 'thresholdPerInvoice', label: 'Per-invoice threshold ₹', type: 'number', defaultValue: 0 },
        { key: 'thresholdAnnual', label: 'Annual threshold ₹', type: 'number', defaultValue: 0 },
        { key: 'applicableTo', label: 'Applies to', type: 'select', defaultValue: 'all', options: APPLICABLE_OPTIONS },
        { key: 'active', label: 'Active', type: 'toggle', defaultValue: true },
      ]}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      deleteConfirm={(r) => ({
        title: 'Delete TDS section?',
        message: `Delete TDS section "${r.sectionCode}"? Existing payments already tagged with it are unaffected, but new entries can no longer use it.`,
      })}
      headerActions={
        <Button
          variant="secondary"
          onClick={handleSeed}
          disabled={seeding || !companyId}
          iconLeft={seeding ? <Spinner size={14} /> : <Sparkles size={14} />}
          title="Insert the standard Indian TDS sections"
        >
          Seed defaults
        </Button>
      }
      emptyText={
        rows.length === 0 && companyId
          ? 'No TDS sections configured yet — seed the standard Indian sections or add one manually.'
          : 'No TDS sections configured yet'
      }
    />
  );
}
