// ============================================================================
// SettingsInvoicingV2.jsx — Invoicing settings on ds (phase 14, invoicing pass)
// ============================================================================
// Copied from SettingsInvoicing.jsx. Everything above `return (` is unchanged:
// the fetch (with its company-switch reset and `cancelled` guard), `update`,
// `saveSettings` and `handleSeedDefaults`.
//
// **This component is mounted at TWO routes** — `/invoicing/config/settings`
// and `/settings/invoicing`, the latter inside `SettingsPageWrapper`, which
// supplies its own "Settings" heading. That is why the legacy renders a bare
// stack of section cards with no page header of its own, and why this version
// does the same. Do not add a PageHeader here: it would double up on the
// settings route. Both routes are flag-switched together so the page cannot
// look like two different products depending on how you reached it.
//
// Three behaviours preserved that are easy to lose:
//
//  1. **Every Save button saves the WHOLE settings object.** `saveSettings`
//     takes a `section` argument, but it only drives which spinner shows —
//     the PUT body is the entire `settings` state. So pressing Save under
//     Defaults also persists unsaved Feature toggles. That is the existing
//     contract; changing it would be a behaviour change, not a layout one.
//
//  2. **`requireConsultantOnLines` is tri-state**, not a boolean:
//     `null` = auto-detect from staffing signals, `true` = always,
//     `false` = never. The select maps 'auto' → null and everything else
//     through `=== 'always'`. A checkbox here would silently collapse
//     auto into never.
//
//  3. **The sequence preview** — `prefix + String(next).padStart(padding,'0')`
//     — is what the next invoice number will actually look like. Read-only,
//     and copied verbatim.
//
// The Seed Defaults action is carried over untouched and was deliberately NOT
// triggered during verification: it writes payment terms, taxes, sequences and
// (when a company is selected) TDS sections in one go, then reloads the page.
// ============================================================================

import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { Settings2, Hash, Sparkles } from 'lucide-react';
import {
  Button, Field, PageSpinner, Panel, Select, SettingRow, Spinner, Switch,
} from '../ds';

const SEQUENCE_LABELS = {
  customer_invoice: 'Customer Invoice',
  vendor_bill: 'Vendor Bill',
  credit_note: 'Credit Note',
  payment: 'Payment',
};

// Multi-select over the tax list. Kept as a local control rather than a ds
// primitive: ds has no multi-select yet, and inventing one for a single call
// site is how kits get bloated. Presentational only — selection is still an
// array of tax ids owned by the page.
function TaxMultiSelect({ taxes, selected, onChange }) {
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);
  if (!taxes.length) {
    return <p style={{ font: 'var(--t-small)', color: 'var(--fg-4)' }}>No taxes configured yet.</p>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {taxes.map((t) => {
        const on = selected.includes(t._id);
        return (
          <button
            key={t._id}
            type="button"
            onClick={() => toggle(t._id)}
            aria-pressed={on}
            style={{
              height: 30, padding: '0 12px', borderRadius: 'var(--r-full, 999px)',
              font: "500 12.5px/1 'Inter', system-ui, sans-serif",
              background: on ? 'var(--brand-soft)' : 'var(--surface-2)',
              color: on ? 'var(--brand-ink)' : 'var(--fg-2)',
              boxShadow: on ? 'inset 0 0 0 1px var(--brand-line)' : 'inset 0 0 0 1px var(--line)',
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsInvoicingV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const companyId = currentCompany?._id;

  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const [settings, setSettings] = useState({
    defaultPaymentTermId: '',
    defaultTaxIds: [],
    // Currency is per-company (Settings → Companies), not org-wide. Field names
    // match the backend inv_settings schema so save/load round-trips.
    enableStripePayments: false,
    enableRecurring: false,
    enableFollowUps: false,
    // null = auto-detect from staffing signals; true = always; false = never.
    requireConsultantOnLines: null,
  });

  // Reference data
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [sequences, setSequences] = useState([]);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      // Reset on company switch so the previous company's settings and
      // reference data don't linger if the new fetch fails or returns nothing.
      setPaymentTerms([]);
      setTaxes([]);
      setSequences([]);
      setSettings(prev => ({
        ...prev,
        defaultPaymentTermId: '',
        defaultTaxIds: [],
      }));
      try {
        const [settingsRes, termsRes, taxesRes, seqRes] = await Promise.all([
          invoicingApi.getSettings(orgSlug),
          invoicingApi.listPaymentTerms(orgSlug),
          invoicingApi.listTaxes(orgSlug),
          invoicingApi.listSequences(orgSlug),
        ]);

        if (cancelled) return;

        const s = settingsRes.settings || settingsRes.data || settingsRes;
        setSettings(prev => ({
          ...prev,
          defaultPaymentTermId: s.defaultPaymentTermId || s.defaultPaymentTerm || '',
          defaultTaxIds: s.defaultTaxIds || s.defaultTaxes || [],
          enableStripePayments: s.enableStripePayments ?? false,
          enableRecurring: s.enableRecurring ?? false,
          enableFollowUps: s.enableFollowUps ?? false,
          requireConsultantOnLines: typeof s.requireConsultantOnLines === 'boolean' ? s.requireConsultantOnLines : null,
        }));

        setPaymentTerms(termsRes.paymentTerms || termsRes.data || []);
        setTaxes(taxesRes.taxes || taxesRes.data || []);
        setSequences(seqRes.sequences || seqRes.data || []);
      } catch (err) {
        if (!cancelled) {
          showToast(err.message || 'Failed to load invoicing settings', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  // companyId: settings / terms / taxes / sequences are all company-scoped —
  // refetch when the active company changes.
  }, [orgSlug, showToast, companyId]);

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const saveSettings = async (section) => {
    setSavingSection(section);
    try {
      await invoicingApi.updateSettings(orgSlug, settings);
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await invoicingApi.seedDefaults(orgSlug);
      // Also seed TDS sections when a company is selected (TDS is company-scoped)
      let tdsMsg = '';
      if (companyId) {
        try {
          const tdsRes = await invoicingApi.seedTdsDefaults(orgSlug, { companyId });
          if (tdsRes?.inserted) tdsMsg = ` + ${tdsRes.inserted} TDS section(s)`;
        } catch (tdsErr) {
          console.warn('TDS seed failed:', tdsErr);
        }
      }
      showToast(`Default data seeded${tdsMsg}. Reloading...`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showToast(err.message || 'Failed to seed defaults', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const SaveButton = ({ section }) => (
    <Button size="sm" onClick={() => saveSettings(section)} disabled={savingSection === section}>
      {savingSection === section ? 'Saving…' : 'Save'}
    </Button>
  );

  if (loading) return <PageSpinner minHeight="12rem" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Panel icon={<Settings2 size={18} />} title="Defaults" actions={<SaveButton section="defaults" />}>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <Field label="Default payment term">
            <Select
              value={settings.defaultPaymentTermId}
              onChange={(e) => update('defaultPaymentTermId', e.target.value)}
            >
              <option value="">-- None --</option>
              {paymentTerms.map((term) => (
                <option key={term._id || term.id} value={term._id || term.id}>
                  {term.name} ({term.days || 0} days)
                </option>
              ))}
            </Select>
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Default taxes">
              <TaxMultiSelect
                taxes={taxes}
                selected={settings.defaultTaxIds}
                onChange={(ids) => update('defaultTaxIds', ids)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel icon={<Settings2 size={18} />} title="Features" actions={<SaveButton section="features" />}>
        <SettingRow
          label="Stripe Payments"
          description="Allow customers to pay invoices online via Stripe"
          control={
            <Switch
              checked={settings.enableStripePayments}
              onChange={(v) => update('enableStripePayments', v)}
              label="Stripe Payments"
            />
          }
        />
        <SettingRow
          label="Recurring Invoices"
          description="Automatically generate invoices on a set schedule"
          control={
            <Switch
              checked={settings.enableRecurring}
              onChange={(v) => update('enableRecurring', v)}
              label="Recurring Invoices"
            />
          }
        />
        <SettingRow
          label="Automatic Follow-ups"
          description="Send automated follow-up emails for overdue invoices"
          control={
            <Switch
              checked={settings.enableFollowUps}
              onChange={(v) => update('enableFollowUps', v)}
              label="Automatic Follow-ups"
            />
          }
        />
        <div style={{ paddingTop: 16 }}>
          <Field
            label="Require consultant on invoice lines"
            hint="Staffing-augmentation billing requires a consultant and service dates on every customer-invoice line before it can be confirmed. Leave on Automatic unless you need to override."
          >
            {/* Tri-state, not a toggle: 'auto' maps to null. */}
            <Select
              value={settings.requireConsultantOnLines === null ? 'auto' : settings.requireConsultantOnLines ? 'always' : 'never'}
              onChange={(e) => update('requireConsultantOnLines', e.target.value === 'auto' ? null : e.target.value === 'always')}
              style={{ maxWidth: 320 }}
            >
              <option value="auto">Automatic (detect from staffing apps)</option>
              <option value="always">Always require</option>
              <option value="never">Never require (services-only)</option>
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel icon={<Hash size={18} />} title="Sequences" flush>
        {sequences.length === 0 ? (
          <p style={{ padding: 20, font: 'var(--t-small)', color: 'var(--fg-4)' }}>
            No sequences configured. Use &quot;Seed Defaults&quot; to create them.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Type', 'Prefix', 'Padding', 'Next Number', 'Preview'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 20px',
                      font: 'var(--t-micro)', letterSpacing: 'var(--tr-label)', textTransform: 'uppercase',
                      color: 'var(--fg-4)', borderBottom: '1px solid var(--line)', background: 'var(--surface-2)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sequences.map((seq) => {
                  const type = seq.type || seq.name;
                  const prefix = seq.prefix || '';
                  const padding = seq.padding || 4;
                  const next = seq.nextNumber || seq.next || 1;
                  const preview = `${prefix}${String(next).padStart(padding, '0')}`;

                  return (
                    <tr key={type} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px 20px', color: 'var(--fg)', fontWeight: 550 }}>
                        {SEQUENCE_LABELS[type] || type}
                      </td>
                      <td style={{ padding: '12px 20px' }}><Code>{prefix || '-'}</Code></td>
                      <td style={{ padding: '12px 20px', color: 'var(--fg-2)' }}>{padding}</td>
                      <td style={{ padding: '12px 20px', color: 'var(--fg-2)' }}>{next}</td>
                      <td style={{ padding: '12px 20px' }}><Code tone="brand">{preview}</Code></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Sparkles size={20} style={{ color: 'var(--warn-ink)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <h3 style={{ font: '600 14px/1.3 var(--font)', color: 'var(--fg)' }}>Seed Defaults</h3>
              <p style={{ font: 'var(--t-small)', color: 'var(--fg-3)', marginTop: 4, maxWidth: '60ch' }}>
                Populate default payment terms, tax rates, and sequences for first-time setup.
                This will not overwrite any existing data.
              </p>
            </div>
          </div>
          <Button
            onClick={handleSeedDefaults}
            disabled={seeding}
            iconLeft={seeding ? <Spinner size={14} /> : <Sparkles size={14} />}
          >
            Seed Defaults
          </Button>
        </div>
      </Panel>
    </div>
  );
}

// Monospace chip for prefixes and the number preview.
function Code({ children, tone }) {
  return (
    <code style={{
      background: 'var(--surface-3)', borderRadius: 6, padding: '2px 8px',
      font: "600 11.5px/1.6 var(--mono, ui-monospace, monospace)",
      color: tone === 'brand' ? 'var(--brand-ink)' : 'var(--fg-2)',
    }}>
      {children}
    </code>
  );
}
