/**
 * SettingsOutreach — Outreach app settings section
 * Shows Gmail connection status and EngageSettings (send limits, unsubscribe, signature).
 */
import { useState, useEffect } from 'react';
import { Mail, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import api from '../../utils/api';
import EngageSettingsV2 from '../EngageSettingsV2';
import { Panel, Button, PageSpinner } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// A 71-line shell around a 408-line child, which is why the two were migrated
// together — a redesigned shell wrapping a legacy body is a worse outcome than
// leaving both alone.
//
// `EngageSettings` has a SECOND consumer, `pages/EngagePage.jsx`, which is
// still legacy and un-switched. That is deliberate and consistent: legacy page
// renders the legacy child, v2 tab renders the v2 child. When EngagePage is
// migrated it should switch to EngageSettingsV2 in the same change.
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsOutreachV2() {
  const [gmailStatus, setGmailStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGmailStatus()
      .then(res => { if (res.success) setGmailStatus(res); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner label="Loading outreach settings…" />;

  const connected = !!gmailStatus?.connected;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Gmail Connection Status */}
      <Panel title="Gmail Connection">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 12,
          background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
        }}>
          <span style={{
            width: 38, height: 38, borderRadius: 'var(--r-2)', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: connected
              ? 'color-mix(in srgb, var(--acc-emerald) 14%, transparent)'
              : 'var(--danger-soft)',
            color: connected ? 'var(--acc-emerald)' : 'var(--danger)',
          }}>
            <Mail size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {connected
                ? <CheckCircle2 size={14} style={{ color: 'var(--acc-emerald)' }} />
                : <XCircle size={14} style={{ color: 'var(--danger)' }} />}
              <span style={{ font: "600 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                {connected ? 'Connected' : 'Not Connected'}
              </span>
            </span>
            <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
              {connected
                ? `Sending from ${gmailStatus.email || 'your Gmail account'}`
                : 'Connect Gmail to send emails from your account'}
            </p>
          </div>
          {!connected && (
            <Button as="a" href="#/outreach/engage" size="sm" iconLeft={<ExternalLink size={14} />}>
              Connect
            </Button>
          )}
        </div>
      </Panel>

      {/* Engage Settings (send limits, unsubscribe, signature) */}
      <EngageSettingsV2 gmailStatus={gmailStatus} />
    </div>
  );
}
