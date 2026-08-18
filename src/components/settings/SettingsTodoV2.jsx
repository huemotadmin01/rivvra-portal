import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import {
  Loader2, CheckCircle2, XCircle, RefreshCw, Shield, X, Plus,
} from 'lucide-react';
import { Panel, Chip, Button, Input, Select, Callout, SettingRow, PageSpinner } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// Org-wide AI scan config. Note for anyone testing this tab: every control here
// saves IMMEDIATELY — the three selects call handleSaveConfig from onChange,
// and adding or removing a blocked sender writes on the spot. There is no Save
// button and no confirm step, so touching any control on a live org changes
// that org's scan behaviour for every member. Everything above `return (` is
// spliced in verbatim, including the domain-vs-sender classification.
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Scan-log status glyph. Anything unrecognised renders nothing, as in legacy. */
function LogStatus({ status }) {
  if (status === 'completed') return <CheckCircle2 size={14} style={{ color: 'var(--acc-emerald)' }} />;
  if (status === 'failed') return <XCircle size={14} style={{ color: 'var(--danger)' }} />;
  if (status === 'running') return <Loader2 size={14} className="animate-spin" style={{ color: 'var(--warn-ink)' }} />;
  return null;
}

/** Removable blocklist pill. `mono` keeps addresses and domains scannable. */
function BlockPill({ text, accent, onRemove, removeLabel }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 6px 3px 10px', borderRadius: 99,
      background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
      font: "400 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
      color: accent || 'var(--fg-2)',
    }}>
      {text}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        style={{ display: 'grid', placeItems: 'center', background: 'none', border: 0, padding: 2, cursor: 'pointer', color: 'var(--fg-4)' }}
      >
        <X size={12} />
      </button>
    </span>
  );
}

const numTd = { padding: '7px 10px', textAlign: 'right', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", fontVariantNumeric: 'tabular-nums' };

export default function SettingsTodoV2() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgConfig, setOrgConfig] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);

  // Blocklist input state
  const [blockedInput, setBlockedInput] = useState('');

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  async function load() {
    try {
      setLoading(true);
      const [configRes, logsRes] = await Promise.all([
        todoApi.getOrgConfig(orgSlug),
        todoApi.getScanLogs(orgSlug),
      ]);
      if (configRes.success) setOrgConfig(configRes.config);
      if (logsRes.success) setScanLogs(logsRes.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig(updates) {
    setSaving(true);
    try {
      const res = await todoApi.updateOrgConfig(orgSlug, updates);
      if (res.success) {
        setOrgConfig(res.config);
        showToast('Settings saved', 'success');
      }
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleAddBlocked() {
    if (!blockedInput.trim()) return;
    const value = blockedInput.trim().toLowerCase();

    // If it looks like a domain (has no @, or starts with @)
    const isDomain = !value.includes('@') || value.startsWith('@');

    if (isDomain) {
      const domain = value.replace(/^@/, '');
      const existing = orgConfig?.blockedDomains || [];
      if (existing.includes(domain)) {
        showToast('Domain already blocked', 'error');
        return;
      }
      handleSaveConfig({ blockedDomains: [...existing, domain] });
    } else {
      const existing = orgConfig?.blockedSenders || [];
      if (existing.includes(value)) {
        showToast('Sender already blocked', 'error');
        return;
      }
      handleSaveConfig({ blockedSenders: [...existing, value] });
    }
    setBlockedInput('');
  }

  function handleRemoveBlocked(type, value) {
    if (type === 'sender') {
      handleSaveConfig({ blockedSenders: (orgConfig?.blockedSenders || []).filter(s => s !== value) });
    } else {
      handleSaveConfig({ blockedDomains: (orgConfig?.blockedDomains || []).filter(d => d !== value) });
    }
  }

  if (loading) return <PageSpinner label="Loading To-Do settings…" />;

  const blockedSenders = orgConfig?.blockedSenders || [];
  const blockedDomains = orgConfig?.blockedDomains || [];

  const th = { padding: '7px 10px', font: "500 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>To-Do Settings</h2>
        <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
          Org-wide AI scan configuration. These settings apply to all members.
        </p>
      </div>

      <Callout tone="info">
        These settings are <strong>org-wide</strong> and controlled by admins. Each member connects
        their own Gmail and toggles auto-scan from the To-Do Dashboard.
      </Callout>

      {/* Scan Configuration */}
      <Panel icon={<RefreshCw size={16} />} title="Scan Configuration">
        <div style={{ padding: 6, display: 'grid', gap: 4 }}>
          <SettingRow
            label="Scan frequency"
            description="How often to check members' inboxes for tasks"
            control={(
              <Select
                value={orgConfig?.frequencyMinutes || 60}
                onChange={e => handleSaveConfig({ frequencyMinutes: parseInt(e.target.value) })}
                disabled={saving}
                aria-label="Scan frequency"
                style={{ width: 'auto' }}
              >
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
                <option value={120}>Every 2 hours</option>
              </Select>
            )}
          />
          <SettingRow
            label="Scan window"
            description="How far back in the inbox each scan looks (already-processed emails are always skipped)"
            control={(
              <Select
                value={orgConfig?.scanWindowDays || 1}
                onChange={e => handleSaveConfig({ scanWindowDays: parseInt(e.target.value) })}
                disabled={saving}
                aria-label="Scan window"
                style={{ width: 'auto' }}
              >
                <option value={1}>Last 24 hours</option>
                <option value={2}>Last 2 days</option>
                <option value={3}>Last 3 days</option>
                <option value={7}>Last 7 days</option>
              </Select>
            )}
          />
          <SettingRow
            label="Max tasks per scan"
            description="Maximum AI-extracted tasks per scan cycle per member"
            control={(
              <Select
                value={orgConfig?.topN || 10}
                onChange={e => handleSaveConfig({ topN: parseInt(e.target.value) })}
                disabled={saving}
                aria-label="Max tasks per scan"
                style={{ width: 'auto' }}
              >
                {[5, 10, 15, 20, 25].map(n => (
                  <option key={n} value={n}>{n} tasks</option>
                ))}
              </Select>
            )}
          />
        </div>
      </Panel>

      {/* Blocked Senders / Domains */}
      <Panel icon={<Shield size={16} />} title="Blocked Senders & Domains">
        <div style={{ padding: 6, display: 'grid', gap: 12 }}>
          <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
            Emails from these senders/domains will be skipped before AI analysis for all members — saving API costs.
            Common sources like noreply, GitHub, Slack, etc. are already blocked automatically.
          </p>

          {/* Add input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              type="text"
              value={blockedInput}
              onChange={e => setBlockedInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBlocked(); } }}
              placeholder="e.g. alerts@company.com or marketing.com"
              aria-label="Sender address or domain to block"
              disabled={saving}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button onClick={handleAddBlocked} disabled={saving || !blockedInput.trim()} iconLeft={<Plus size={14} />}>
              Add
            </Button>
          </div>

          {/* Current blocked list */}
          {(blockedSenders.length > 0 || blockedDomains.length > 0) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {blockedDomains.map(d => (
                <BlockPill
                  key={`d-${d}`}
                  text={`@${d}`}
                  accent="var(--warn-ink)"
                  removeLabel={`Unblock domain ${d}`}
                  onRemove={() => handleRemoveBlocked('domain', d)}
                />
              ))}
              {blockedSenders.map(s => (
                <BlockPill
                  key={`s-${s}`}
                  text={s}
                  removeLabel={`Unblock sender ${s}`}
                  onRemove={() => handleRemoveBlocked('sender', s)}
                />
              ))}
            </div>
          ) : (
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic', margin: 0 }}>
              No custom blocks added. Built-in filters (noreply, GitHub, Slack, newsletters, etc.) are always active.
            </p>
          )}
        </div>
      </Panel>

      {/* Scan Logs */}
      {scanLogs.length > 0 && (
        <Panel title="Recent Scan Logs" flush>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Time</th>
                  <th style={{ ...th, textAlign: 'left' }}>Trigger</th>
                  <th style={{ ...th, textAlign: 'left' }}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Emails</th>
                  <th style={{ ...th, textAlign: 'right' }}>Filtered</th>
                  <th style={{ ...th, textAlign: 'right' }}>&rarr; AI</th>
                  <th style={{ ...th, textAlign: 'right' }}>Tasks</th>
                  <th style={{ ...th, textAlign: 'right' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {scanLogs.map(log => (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                    <td style={{ padding: '7px 10px', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{formatDate(log.startedAt)}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <Chip tone={log.trigger === 'manual' ? 'info' : 'neutral'}>{log.trigger}</Chip>
                    </td>
                    <td style={{ padding: '7px 10px' }}><LogStatus status={log.status} /></td>
                    <td style={{ ...numTd, color: 'var(--fg-3)' }}>{log.emailsScanned || 0}</td>
                    <td style={{ ...numTd, color: 'var(--warn-ink)' }}>
                      {(log.emailsFiltered || 0) + (log.skippedAlreadyProcessed || 0) > 0
                        ? `-${(log.emailsFiltered || 0) + (log.skippedAlreadyProcessed || 0)}`
                        : '-'}
                    </td>
                    <td style={{ ...numTd, color: 'var(--acc-teal)' }}>{log.emailsSentToAI ?? log.emailsScanned ?? 0}</td>
                    <td style={{ ...numTd, color: 'var(--fg-3)' }}>{log.tasksExtracted || 0}</td>
                    <td style={{ ...numTd, color: 'var(--fg-4)' }}>
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
