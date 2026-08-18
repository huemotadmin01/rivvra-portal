/**
 * SettingsCrm — CRM app settings section
 * Pipeline defaults and currency configuration.
 * Only visible to users with admin role on the CRM app.
 *
 * Sales Teams have moved to Platform Settings → Users & Teams (SettingsTeam.jsx)
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import {
  Save, AlertCircle, Briefcase,
} from 'lucide-react';
import crmApi from '../../utils/crmApi';
import { Panel, Button, Select, EmptyState, PageSpinner } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// `defaultCurrency` here is the currency every CRM deal's revenue is reported
// in, so everything above `return (` — the fetch, the cancellation guard, the
// save and `update` — is spliced in verbatim. The option list is carried across
// unchanged too: dropping or reordering a currency would silently re-denominate
// existing opportunities.
// ─────────────────────────────────────────────────────────────────────────────

/** Kept in the legacy order, value AND label. */
const CURRENCIES = [
  ['INR', 'INR — Indian Rupee'],
  ['USD', 'USD — US Dollar'],
  ['EUR', 'EUR — Euro'],
  ['GBP', 'GBP — British Pound'],
  ['AED', 'AED — UAE Dirham'],
  ['SGD', 'SGD — Singapore Dollar'],
  ['AUD', 'AUD — Australian Dollar'],
  ['CAD', 'CAD — Canadian Dollar'],
];

/** Label + hint above a control — the shape this tab repeats. */
function FieldBlock({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 3 }}>
        {label}
      </label>
      <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>{hint}</p>
      {children}
    </div>
  );
}

export default function SettingsCrmV2() {
  const { currentOrg, isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const { showToast } = useToast();
  const isAdmin = getAppRole('crm') === 'admin' || isOrgAdmin || isOrgOwner;
  const orgSlug = currentOrg?.slug;

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!isAdmin || !orgSlug) { setLoading(false); return; }
    let cancelled = false;
    crmApi.getSettings(orgSlug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.settings) setSettings(res.settings);
        else setSettings(res);
      })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, orgSlug]);

  // ─── CRM Settings ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!settings) { showToast('No settings to save', 'error'); return; }
    setSaving(true);
    try {
      await crmApi.updateSettings(orgSlug, settings);
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner label="Loading CRM settings…" />;

  if (!isAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need admin access to manage CRM settings." />
      </Panel>
    );
  }

  if (fetchError) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="danger" compact
          title="Failed to load settings.">
          Please try refreshing the page.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* Pipeline Settings */}
        <Panel icon={<Briefcase size={16} />} title="Pipeline Settings">
          <div style={{ padding: 6, display: 'grid', gap: 14 }}>
            <FieldBlock
              id="crm-default-currency"
              label="Default Currency"
              hint="Currency used for deal revenue and reporting"
            >
              <Select
                id="crm-default-currency"
                value={settings?.defaultCurrency ?? 'INR'}
                onChange={e => update('defaultCurrency', e.target.value)}
                style={{ width: 'auto' }}
              >
                {CURRENCIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
            </FieldBlock>

            <FieldBlock
              id="crm-pipeline-mode"
              label="Default Pipeline View"
              hint="View mode when opening the pipeline page"
            >
              <Select
                id="crm-pipeline-mode"
                value={settings?.pipelineMode ?? 'kanban'}
                onChange={e => update('pipelineMode', e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="kanban">Kanban Board</option>
                <option value="list">List View</option>
              </Select>
            </FieldBlock>
          </div>
        </Panel>
      </div>

      <div>
        <Button onClick={handleSave} disabled={saving} iconLeft={<Save size={15} />}>
          {saving ? 'Saving...' : 'Save CRM Settings'}
        </Button>
      </div>
    </div>
  );
}
