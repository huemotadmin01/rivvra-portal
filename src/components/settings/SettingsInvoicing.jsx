import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Loader2, Save, Building2, Settings2, ToggleLeft, ToggleRight,
  Hash, Sparkles, AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

function Toggle({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        {description && <p className="text-dark-500 text-xs mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className="relative flex-shrink-0"
      >
        {enabled ? (
          <ToggleRight size={32} className="text-rivvra-500" />
        ) : (
          <ToggleLeft size={32} className="text-dark-500" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------

function SectionCard({ icon: Icon, title, children, onSave, saving }) {
  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
        <div className="flex items-center gap-2.5">
          <Icon size={18} className="text-rivvra-400" />
          <h3 className="text-white font-semibold">{title}</h3>
        </div>
        {onSave && (
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select for Taxes
// ---------------------------------------------------------------------------

function TaxMultiSelect({ taxes, selected, onChange }) {
  const selectedIds = selected || [];

  const toggleTax = (taxId) => {
    if (selectedIds.includes(taxId)) {
      onChange(selectedIds.filter(id => id !== taxId));
    } else {
      onChange([...selectedIds, taxId]);
    }
  };

  if (!taxes || taxes.length === 0) {
    return <p className="text-dark-500 text-sm">No taxes configured yet.</p>;
  }

  return (
    <div className="space-y-2 max-h-40 overflow-y-auto">
      {taxes.map((tax) => {
        const taxId = tax._id || tax.id;
        const isChecked = selectedIds.includes(taxId);
        return (
          <label
            key={taxId}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggleTax(taxId)}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
            />
            <span className="text-sm text-dark-300 group-hover:text-white transition-colors">
              {tax.name} ({tax.rate}%)
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sequence display type labels
// ---------------------------------------------------------------------------

const SEQUENCE_LABELS = {
  customer_invoice: 'Customer Invoice',
  vendor_bill: 'Vendor Bill',
  credit_note: 'Credit Note',
  payment: 'Payment',
};

// ---------------------------------------------------------------------------
// Currency options
// ---------------------------------------------------------------------------

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SettingsInvoicing() {
  const { orgSlug } = useOrg();
  const { showToast } = useToast();

  // ─── State ──────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [seeding, setSeeding] = useState(false);

  // Settings data
  const [settings, setSettings] = useState({
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    companyTaxId: '',
    defaultPaymentTermId: '',
    defaultTaxIds: [],
    defaultCurrency: 'USD',
    enableStripePayments: false,
    enableRecurringInvoices: false,
    enableFollowUps: false,
  });

  // Reference data
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [sequences, setSequences] = useState([]);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [settingsRes, termsRes, taxesRes, seqRes] = await Promise.all([
          invoicingApi.getSettings(orgSlug),
          invoicingApi.listPaymentTerms(orgSlug),
          invoicingApi.listTaxes(orgSlug),
          invoicingApi.listSequences(orgSlug),
        ]);

        if (cancelled) return;

        // Settings
        const s = settingsRes.settings || settingsRes.data || settingsRes;
        setSettings(prev => ({
          ...prev,
          companyName: s.companyName || '',
          companyAddress: s.companyAddress || '',
          companyPhone: s.companyPhone || '',
          companyEmail: s.companyEmail || '',
          companyWebsite: s.companyWebsite || '',
          companyTaxId: s.companyTaxId || '',
          defaultPaymentTermId: s.defaultPaymentTermId || s.defaultPaymentTerm || '',
          defaultTaxIds: s.defaultTaxIds || s.defaultTaxes || [],
          defaultCurrency: s.defaultCurrency || 'USD',
          enableStripePayments: s.enableStripePayments ?? false,
          enableRecurringInvoices: s.enableRecurringInvoices ?? false,
          enableFollowUps: s.enableFollowUps ?? false,
        }));

        // Payment terms
        setPaymentTerms(termsRes.paymentTerms || termsRes.data || []);

        // Taxes
        setTaxes(taxesRes.taxes || taxesRes.data || []);

        // Sequences
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
  }, [orgSlug, showToast]);

  // ─── Update helpers ─────────────────────────────────────────────────────────

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  // ─── Save ───────────────────────────────────────────────────────────────────

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

  // ─── Seed Defaults ──────────────────────────────────────────────────────────

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await invoicingApi.seedDefaults(orgSlug);
      showToast('Default data seeded successfully. Reloading...');
      // Reload all data after seeding
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showToast(err.message || 'Failed to seed defaults', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ──── Section 1: Company Details ──── */}
      <SectionCard
        icon={Building2}
        title="Company Details"
        onSave={() => saveSettings('company')}
        saving={savingSection === 'company'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-dark-300 mb-1">Company Name</label>
            <input
              type="text"
              value={settings.companyName}
              onChange={e => update('companyName', e.target.value)}
              placeholder="Acme Inc."
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1">Tax ID / VAT Number</label>
            <input
              type="text"
              value={settings.companyTaxId}
              onChange={e => update('companyTaxId', e.target.value)}
              placeholder="e.g. US12-3456789"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-dark-300 mb-1">Address</label>
            <textarea
              value={settings.companyAddress}
              onChange={e => update('companyAddress', e.target.value)}
              rows={2}
              placeholder="123 Business St, Suite 100, City, State, ZIP"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1">Phone</label>
            <input
              type="tel"
              value={settings.companyPhone}
              onChange={e => update('companyPhone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1">Email</label>
            <input
              type="email"
              value={settings.companyEmail}
              onChange={e => update('companyEmail', e.target.value)}
              placeholder="billing@company.com"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-dark-300 mb-1">Website</label>
            <input
              type="url"
              value={settings.companyWebsite}
              onChange={e => update('companyWebsite', e.target.value)}
              placeholder="https://www.company.com"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            />
          </div>
        </div>
      </SectionCard>

      {/* ──── Section 2: Defaults ──── */}
      <SectionCard
        icon={Settings2}
        title="Defaults"
        onSave={() => saveSettings('defaults')}
        saving={savingSection === 'defaults'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm text-dark-300 mb-1">Default Payment Term</label>
            <select
              value={settings.defaultPaymentTermId}
              onChange={e => update('defaultPaymentTermId', e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            >
              <option value="">-- None --</option>
              {paymentTerms.map((term) => (
                <option key={term._id || term.id} value={term._id || term.id}>
                  {term.name} ({term.days || 0} days)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1">Default Currency</label>
            <select
              value={settings.defaultCurrency}
              onChange={e => update('defaultCurrency', e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-dark-300 mb-2">Default Taxes</label>
            <TaxMultiSelect
              taxes={taxes}
              selected={settings.defaultTaxIds}
              onChange={(ids) => update('defaultTaxIds', ids)}
            />
          </div>
        </div>
      </SectionCard>

      {/* ──── Section 3: Features ──── */}
      <SectionCard
        icon={Settings2}
        title="Features"
        onSave={() => saveSettings('features')}
        saving={savingSection === 'features'}
      >
        <div className="divide-y divide-dark-700">
          <Toggle
            label="Stripe Payments"
            description="Allow customers to pay invoices online via Stripe"
            enabled={settings.enableStripePayments}
            onChange={(v) => update('enableStripePayments', v)}
          />
          <Toggle
            label="Recurring Invoices"
            description="Automatically generate invoices on a set schedule"
            enabled={settings.enableRecurringInvoices}
            onChange={(v) => update('enableRecurringInvoices', v)}
          />
          <Toggle
            label="Automatic Follow-ups"
            description="Send automated follow-up emails for overdue invoices"
            enabled={settings.enableFollowUps}
            onChange={(v) => update('enableFollowUps', v)}
          />
        </div>
      </SectionCard>

      {/* ──── Section 4: Sequences ──── */}
      <SectionCard icon={Hash} title="Sequences">
        {sequences.length === 0 ? (
          <p className="text-dark-500 text-sm">No sequences configured. Use "Seed Defaults" to create them.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-400 text-xs uppercase tracking-wider">
                  <th className="text-left pb-2.5 font-medium">Type</th>
                  <th className="text-left pb-2.5 font-medium">Prefix</th>
                  <th className="text-left pb-2.5 font-medium">Padding</th>
                  <th className="text-left pb-2.5 font-medium">Next Number</th>
                  <th className="text-left pb-2.5 font-medium">Preview</th>
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
                    <tr key={type} className="border-b border-dark-700/50">
                      <td className="py-3 text-white font-medium">
                        {SEQUENCE_LABELS[type] || type}
                      </td>
                      <td className="py-3">
                        <code className="bg-dark-800 text-rivvra-400 px-2 py-0.5 rounded text-xs">{prefix || '-'}</code>
                      </td>
                      <td className="py-3 text-dark-300">{padding}</td>
                      <td className="py-3 text-dark-300">{next}</td>
                      <td className="py-3">
                        <code className="bg-dark-800 text-emerald-400 px-2 py-0.5 rounded text-xs">{preview}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ──── Seed Defaults ──── */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-white font-semibold">Seed Defaults</h3>
              <p className="text-dark-400 text-sm mt-1">
                Populate default payment terms, tax rates, and sequences for first-time setup.
                This will not overwrite any existing data.
              </p>
            </div>
          </div>
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 self-start flex-shrink-0"
          >
            {seeding ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Seed Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
