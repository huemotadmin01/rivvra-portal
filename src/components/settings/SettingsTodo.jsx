import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import {
  Loader2, Mail, CheckCircle2, XCircle, RefreshCw, Trash2, Shield, X, Plus,
} from 'lucide-react';

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function SettingsTodo() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [gmailStatus, setGmailStatus] = useState({ connected: false });
  const [scanLogs, setScanLogs] = useState([]);
  const [disconnecting, setDisconnecting] = useState(false);

  // Blocklist input state
  const [blockedInput, setBlockedInput] = useState('');

  useEffect(() => {
    if (orgSlug) load();
  }, [orgSlug]);

  async function load() {
    try {
      setLoading(true);
      const [settingsRes, gmailRes, logsRes] = await Promise.all([
        todoApi.getSettings(orgSlug),
        todoApi.getGmailStatus(orgSlug),
        todoApi.getScanLogs(orgSlug),
      ]);
      if (settingsRes.success) setSettings(settingsRes.settings);
      if (gmailRes.success) setGmailStatus(gmailRes);
      if (logsRes.success) setScanLogs(logsRes.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGmail() {
    try {
      const res = await todoApi.getGmailOAuthUrl(orgSlug);
      if (res.success && res.url) {
        window.location.href = res.url;
      }
    } catch {
      showToast('Failed to start Gmail connection', 'error');
    }
  }

  async function handleDisconnectGmail() {
    setDisconnecting(true);
    try {
      const res = await todoApi.disconnectGmail(orgSlug);
      if (res.success) {
        setGmailStatus({ connected: false });
        showToast('Gmail disconnected', 'success');
        load();
      }
    } catch {
      showToast('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSaveConfig(key, value) {
    setSaving(true);
    try {
      const update = { scanConfig: { [key]: value } };
      const res = await todoApi.updateSettings(orgSlug, update);
      if (res.success) {
        setSettings(res.settings);
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
    const scanConfig = settings?.scanConfig || {};

    // If it looks like a domain (has no @, or starts with @)
    const isDomain = !value.includes('@') || value.startsWith('@');

    if (isDomain) {
      const domain = value.replace(/^@/, '');
      const existing = scanConfig.blockedDomains || [];
      if (existing.includes(domain)) {
        showToast('Domain already blocked', 'error');
        return;
      }
      handleSaveConfig('blockedDomains', [...existing, domain]);
    } else {
      const existing = scanConfig.blockedSenders || [];
      if (existing.includes(value)) {
        showToast('Sender already blocked', 'error');
        return;
      }
      handleSaveConfig('blockedSenders', [...existing, value]);
    }
    setBlockedInput('');
  }

  function handleRemoveBlocked(type, value) {
    const scanConfig = settings?.scanConfig || {};
    if (type === 'sender') {
      handleSaveConfig('blockedSenders', (scanConfig.blockedSenders || []).filter(s => s !== value));
    } else {
      handleSaveConfig('blockedDomains', (scanConfig.blockedDomains || []).filter(d => d !== value));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-dark-400 animate-spin" />
      </div>
    );
  }

  const scanConfig = settings?.scanConfig || {};
  const blockedSenders = scanConfig.blockedSenders || [];
  const blockedDomains = scanConfig.blockedDomains || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">To-Do Settings</h2>
        <p className="text-sm text-dark-400">Configure Gmail integration and AI task extraction</p>
      </div>

      {/* Gmail Connection */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Mail size={16} className="text-teal-400" />
          Gmail Connection
        </h3>
        <p className="text-xs text-dark-400 mb-4">
          Connect your Gmail to let AI scan your inbox for actionable tasks. Only read-only access is needed — we never send emails from this connection.
        </p>

        {gmailStatus.connected ? (
          <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <div>
                <p className="text-sm text-white">{gmailStatus.email}</p>
                <p className="text-xs text-dark-400">Connected (gmail.readonly scope)</p>
              </div>
            </div>
            <button
              onClick={handleDisconnectGmail}
              disabled={disconnecting}
              className="flex items-center gap-1 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-sm"
            >
              {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectGmail}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Mail size={16} />
            Connect Gmail
          </button>
        )}
      </div>

      {/* Scan Configuration */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <RefreshCw size={16} className="text-teal-400" />
          Scan Configuration
        </h3>

        <div className="space-y-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Auto-scan inbox</p>
              <p className="text-xs text-dark-400">Periodically scan your Gmail for actionable tasks</p>
            </div>
            <button
              onClick={() => handleSaveConfig('enabled', !scanConfig.enabled)}
              disabled={saving || !gmailStatus.connected}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                scanConfig.enabled ? 'bg-teal-600' : 'bg-dark-700'
              } ${!gmailStatus.connected ? 'opacity-50' : ''}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                scanConfig.enabled ? 'translate-x-5' : ''
              }`} />
            </button>
          </div>

          {/* Frequency */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Scan frequency</p>
              <p className="text-xs text-dark-400">How often to check your inbox</p>
            </div>
            <select
              value={scanConfig.frequencyMinutes || 60}
              onChange={e => handleSaveConfig('frequencyMinutes', parseInt(e.target.value))}
              disabled={saving || !gmailStatus.connected}
              className="px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
            >
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={120}>Every 2 hours</option>
            </select>
          </div>

          {/* Top N */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Max tasks per scan</p>
              <p className="text-xs text-dark-400">Maximum AI-extracted tasks per scan cycle</p>
            </div>
            <select
              value={scanConfig.topN || 10}
              onChange={e => handleSaveConfig('topN', parseInt(e.target.value))}
              disabled={saving || !gmailStatus.connected}
              className="px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
            >
              {[5, 10, 15, 20, 25].map(n => (
                <option key={n} value={n}>{n} tasks</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Blocked Senders / Domains */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Shield size={16} className="text-teal-400" />
          Blocked Senders & Domains
        </h3>
        <p className="text-xs text-dark-400 mb-4">
          Emails from these senders/domains will be skipped before AI analysis — saving API costs. Common sources like noreply, GitHub, Slack, etc. are already blocked automatically.
        </p>

        {/* Add input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={blockedInput}
            onChange={e => setBlockedInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBlocked(); } }}
            placeholder="e.g. alerts@company.com or marketing.com"
            className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-teal-500"
            disabled={saving}
          />
          <button
            onClick={handleAddBlocked}
            disabled={saving || !blockedInput.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {/* Current blocked list */}
        {(blockedSenders.length > 0 || blockedDomains.length > 0) ? (
          <div className="flex flex-wrap gap-2">
            {blockedDomains.map(d => (
              <span key={`d-${d}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-dark-800 border border-dark-700 rounded-full text-xs text-dark-300">
                <span className="text-amber-400 font-mono">@{d}</span>
                <button
                  onClick={() => handleRemoveBlocked('domain', d)}
                  className="text-dark-500 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {blockedSenders.map(s => (
              <span key={`s-${s}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-dark-800 border border-dark-700 rounded-full text-xs text-dark-300">
                <span className="font-mono">{s}</span>
                <button
                  onClick={() => handleRemoveBlocked('sender', s)}
                  className="text-dark-500 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-dark-500 italic">No custom blocks added. Built-in filters (noreply, GitHub, Slack, newsletters, etc.) are always active.</p>
        )}
      </div>

      {/* Scan Logs */}
      {scanLogs.length > 0 && (
        <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Recent Scan Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-400 text-xs border-b border-dark-800">
                  <th className="text-left py-2 pr-3">Time</th>
                  <th className="text-left py-2 pr-3">Trigger</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-right py-2 pr-3">Emails</th>
                  <th className="text-right py-2 pr-3">Filtered</th>
                  <th className="text-right py-2 pr-3">→ AI</th>
                  <th className="text-right py-2 pr-3">Tasks</th>
                  <th className="text-right py-2">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {scanLogs.map(log => (
                  <tr key={log._id} className="text-dark-300">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(log.startedAt)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        log.trigger === 'manual' ? 'bg-blue-500/10 text-blue-400' : 'bg-dark-700 text-dark-400'
                      }`}>
                        {log.trigger}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {log.status === 'completed' && <CheckCircle2 size={14} className="text-emerald-400" />}
                      {log.status === 'failed' && <XCircle size={14} className="text-red-400" />}
                      {log.status === 'running' && <Loader2 size={14} className="text-amber-400 animate-spin" />}
                    </td>
                    <td className="py-2 pr-3 text-right">{log.emailsScanned || 0}</td>
                    <td className="py-2 pr-3 text-right text-amber-400/70">
                      {(log.emailsFiltered || 0) + (log.skippedAlreadyProcessed || 0) > 0
                        ? `-${(log.emailsFiltered || 0) + (log.skippedAlreadyProcessed || 0)}`
                        : '-'}
                    </td>
                    <td className="py-2 pr-3 text-right text-teal-400/70">{log.emailsSentToAI ?? log.emailsScanned ?? 0}</td>
                    <td className="py-2 pr-3 text-right">{log.tasksExtracted || 0}</td>
                    <td className="py-2 text-right text-dark-500">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
