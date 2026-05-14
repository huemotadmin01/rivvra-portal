import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useNavigate } from 'react-router-dom';
import todoApi from '../../utils/todoApi';
import {
  Mail, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Settings, Trash2, Power,
} from 'lucide-react';

function formatTimeAgo(date) {
  if (!date) return 'Never';
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ScanStatus({ orgSlug, gmailStatus: initialGmailStatus, lastScan, onScanComplete }) {
  const { showToast } = useToast();
  const { isOrgAdmin } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();

  const [scanning, setScanning] = useState(false);
  const [gmailStatus, setGmailStatus] = useState(initialGmailStatus || { connected: false });
  const [scanEnabled, setScanEnabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (initialGmailStatus) setGmailStatus(initialGmailStatus);
  }, [initialGmailStatus]);

  // Load per-user settings (scanEnabled)
  useEffect(() => {
    if (orgSlug) {
      todoApi.getSettings(orgSlug).then(res => {
        if (res.success) {
          setScanEnabled(!!res.settings?.scanEnabled);
        }
      }).catch(() => {});
    }
  }, [orgSlug]);

  async function handleScan() {
    if (!gmailStatus?.connected) {
      showToast('Connect Gmail first', 'error');
      return;
    }
    setScanning(true);
    try {
      const res = await todoApi.triggerScan(orgSlug);
      if (res.success) {
        if (res.tasksExtracted > 0) {
          showToast(`Scan complete: ${res.tasksExtracted} new task(s) found`, 'success');
        } else {
          showToast('Scan complete: No new actionable tasks found', 'info');
        }
        onScanComplete?.();
      }
    } catch (err) {
      showToast('Scan failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setScanning(false);
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
        setScanEnabled(false);
        showToast('Gmail disconnected', 'success');
        onScanComplete?.();
      }
    } catch {
      showToast('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleToggleScan() {
    const newVal = !scanEnabled;
    setSavingToggle(true);
    try {
      const res = await todoApi.updateSettings(orgSlug, { scanEnabled: newVal });
      if (res.success) {
        setScanEnabled(newVal);
        showToast(newVal ? 'Auto-scan enabled' : 'Auto-scan disabled', 'success');
      }
    } catch {
      showToast('Failed to update', 'error');
    } finally {
      setSavingToggle(false);
    }
  }

  return (
    <div className="bg-dark-900 rounded-xl border border-dark-800">
      <div className="flex items-center justify-between p-4 border-b border-dark-800">
        <h3 className="text-sm font-semibold text-white">AI Inbox Scanner</h3>
        {isOrgAdmin && (
          <button
            onClick={() => navigate(orgPath('/settings/todo'))}
            className="p-1 text-dark-400 hover:text-white"
            title="Org Settings"
          >
            <Settings size={14} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Gmail Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={16} className={gmailStatus?.connected ? 'text-emerald-400' : 'text-dark-500'} />
            <span className="text-sm text-dark-300">Gmail</span>
          </div>
          {gmailStatus?.connected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-xs text-emerald-400">{gmailStatus.email || 'Connected'}</span>
              </div>
              <button
                onClick={handleDisconnectGmail}
                disabled={disconnecting}
                className="p-1 text-dark-500 hover:text-red-400 transition-colors"
                title="Disconnect Gmail"
              >
                {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGmail}
              className="text-xs text-teal-400 hover:text-teal-300 font-medium"
            >
              Connect
            </button>
          )}
        </div>

        {/* Auto-Scan Toggle (per-user) */}
        {gmailStatus?.connected && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Power size={16} className={scanEnabled ? 'text-teal-400' : 'text-dark-500'} />
              <span className="text-sm text-dark-300">Auto-scan</span>
            </div>
            <button
              onClick={handleToggleScan}
              disabled={savingToggle}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                scanEnabled ? 'bg-teal-600' : 'bg-dark-700'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                scanEnabled ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>
        )}

        {/* Last Scan */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-dark-400">Last Scan</span>
          <span className="text-xs text-dark-300">
            {lastScan ? (
              <span className="flex items-center gap-1">
                {lastScan.status === 'completed' && <CheckCircle2 size={12} className="text-emerald-400" />}
                {lastScan.status === 'failed' && <XCircle size={12} className="text-red-400" />}
                {formatTimeAgo(lastScan.completedAt || lastScan.startedAt)}
              </span>
            ) : (
              'Never'
            )}
          </span>
        </div>

        {/* Last scan stats */}
        {lastScan?.status === 'completed' && (
          <div className="text-xs text-dark-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Emails scanned</span>
              <span>{lastScan.emailsScanned || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Tasks extracted</span>
              <span>{lastScan.tasksExtracted || 0}</span>
            </div>
          </div>
        )}

        {/* Scan Button */}
        <button
          onClick={handleScan}
          disabled={scanning || !gmailStatus?.connected}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-dark-700 disabled:text-dark-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Scan Now
            </>
          )}
        </button>

        {!gmailStatus?.connected && (
          <p className="text-[11px] text-dark-500 text-center">
            Connect your Gmail to enable AI task extraction from your inbox
          </p>
        )}
      </div>
    </div>
  );
}
