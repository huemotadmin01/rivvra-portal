/**
 * SettingsContacts — Contacts app settings section (placeholder)
 * Settings will be functional once backend endpoints are created.
 * Only visible to users with admin role on the Contacts app.
 */
import { useOrg } from '../../context/OrgContext';
import { AlertCircle, Contact, Search } from 'lucide-react';
import { Panel, Chip, Select, Switch, SettingRow, EmptyState } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// Legacy dimmed each unbuilt card with `opacity-60` and each control with
// `opacity-50`. Container opacity is the one thing the contrast audit cannot
// see through — it reports those nodes as unmeasured, not as passing — so the
// "not yet available" signal is carried by the Coming Soon chip and by the
// controls being genuinely `disabled` (which IS exempt from AA by spec).
// Nothing here is interactive yet, so no behaviour changes.
//
// The local `ToggleSwitch` is gone: it was a byte-for-byte duplicate of the one
// in SettingsSign, and ds already ships `Switch`.
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsContactsV2() {
  const { isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const isAdmin = getAppRole('contacts') === 'admin' || isOrgAdmin || isOrgOwner;

  if (!isAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need admin access to manage Contacts settings." />
      </Panel>
    );
  }

  const soon = <Chip tone="info">Coming Soon</Chip>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
      {/* Contact Defaults (Coming Soon) */}
      <Panel
        icon={<Contact size={16} />}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Contact Defaults {soon}</span>}
      >
        <div style={{ padding: 6, display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor="contact-default-type" style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 3 }}>
              Default Contact Type
            </label>
            <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>
              Type pre-selected when creating new contacts
            </p>
            <Select id="contact-default-type" disabled defaultValue="Individual" style={{ width: 'auto' }}>
              <option>Individual</option>
              <option>Company</option>
            </Select>
          </div>
        </div>
      </Panel>

      {/* Duplicate Detection (Coming Soon) */}
      <Panel
        icon={<Search size={16} />}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Duplicate Detection {soon}</span>}
      >
        <div style={{ padding: 6, display: 'grid', gap: 4 }}>
          <SettingRow
            label="Detect Duplicates"
            description="Warn when creating contacts with matching email or phone"
            control={<Switch checked={false} onChange={() => {}} disabled label="Detect Duplicates" />}
          />
          <SettingRow
            label="Auto-Link to Company"
            description="Link individuals to companies by email domain"
            control={<Switch checked={false} onChange={() => {}} disabled label="Auto-Link to Company" />}
          />
        </div>
      </Panel>
    </div>
  );
}
