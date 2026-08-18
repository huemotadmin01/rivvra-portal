/**
 * SettingsSign — Sign app settings section (placeholder)
 * Settings will be functional once backend endpoints are created.
 * Only visible to users with admin role on the Sign app.
 */
import { useOrg } from '../../context/OrgContext';
import { AlertCircle, PenTool, Bell, ShieldCheck } from 'lucide-react';
import { Panel, Chip, Input, Switch, SettingRow, EmptyState } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// Same treatment as SettingsContacts (#88): the `opacity-60` dim on each
// unbuilt card is gone, because container opacity is invisible to the contrast
// audit — it reports those nodes as UNMEASURED rather than passing. "Not yet
// available" is carried by the Coming Soon chip and by genuinely `disabled`
// controls, which are exempt from AA by spec.
//
// The local `ToggleSwitch` here and the one in SettingsContacts were identical
// character for character, and ds already ships `Switch`. Both are gone.
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsSignV2() {
  const { isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const isAdmin = getAppRole('sign') === 'admin' || isOrgAdmin || isOrgOwner;

  if (!isAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need admin access to manage Sign settings." />
      </Panel>
    );
  }

  const soon = <Chip tone="info">Coming Soon</Chip>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
      {/* Request Defaults (Coming Soon) */}
      <Panel
        icon={<PenTool size={16} />}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Request Defaults {soon}</span>}
      >
        <div style={{ padding: 6 }}>
          <label htmlFor="sign-default-expiry" style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 3 }}>
            Default Expiration
          </label>
          <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>
            Number of days before sign requests expire
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Input id="sign-default-expiry" type="number" disabled value={30} readOnly
              style={{ width: 88, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
            <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>days</span>
          </span>
        </div>
      </Panel>

      {/* Reminders (Coming Soon) */}
      <Panel
        icon={<Bell size={16} />}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Reminders {soon}</span>}
      >
        <div style={{ padding: 6 }}>
          <SettingRow
            label="Auto-Send Reminders"
            description="Automatically remind signers of pending requests"
            control={<Switch checked={false} onChange={() => {}} disabled label="Auto-Send Reminders" />}
          />
        </div>
      </Panel>

      {/* Security (Coming Soon) */}
      <Panel
        icon={<ShieldCheck size={16} />}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Security {soon}</span>}
      >
        <div style={{ padding: 6 }}>
          <SettingRow
            label="Require Email Verification"
            description="Signers must verify their email before signing"
            control={<Switch checked={false} onChange={() => {}} disabled label="Require Email Verification" />}
          />
        </div>
      </Panel>
    </div>
  );
}
