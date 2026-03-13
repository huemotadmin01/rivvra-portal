import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import {
  Loader2, CheckCircle2, XCircle, RefreshCw, Shield, X, Plus, Info,
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
  const [orgConfig, setOrgConfig] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);

  // Blocklist input state
  const [blockedInput, setBlockedInput] = useState('');

  useEffect(() => {
    if (orgSlug) load();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-dark-400 animate-spin" />
      </div>
    );
  }

  const blockedSenders = orgConfig?.blockedSenders || [];
  const blockedDomains = orgConfig?.blockedDomains || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">To-Do Settings</h2>
        <p className="text-sm text-dark-400">Org-wide AI scan configuration. These settings apply to all members.</p>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
        <Info size={16} className="text-teal-400 mt-0.5 shrink-0" />
        <div className="text-xs text-dark-300 space-y-1">
          <p>These settings are <span className="text-white font-medium">org-wide</span> and controlled by admins.</p>
          <p>Each member connects their own Gmail and toggles auto-scan from the <span className="text-teal-400">To-Do Dashboard</span>.</p>
        </div>
      </div>

      {/* Scan Configuration */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <RefreshCw size={16} className="text-teal-400" />
          Scan Configuration
        </h3>

        <div className="space-y-4">
          {/* Frequency */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Scan frequency</p>
              <p className="text-xs text-dark-400">How often to check members' inboxes for tasks</p>
            </div>
            <select
              value={orgConfig?.frequencyMinutes || 60}
              onChange={e => handleSaveConfig({ frequencyMinutes: parseInt(e.target.value) })}
              disabled={saving}
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
              <p className="text-xs text-dark-400">Maximum AI-extracted tasks per scan cycle per member</p>
            </div>
            <select
              value={orgConfig?.topN || 10}
              onChange={e => handleSaveConfig({ topN: parseInt(e.target.value) })}
              disabled={saving}
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
          Emails from these senders/domains will be skipped before AI analysis for all members — saving API costs. Common sources like noreply, GitHub, Slack, etc. are already blocked automatically.
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
                  <th className="text-right py-2 pr-3">&rarr; AI</th>
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
