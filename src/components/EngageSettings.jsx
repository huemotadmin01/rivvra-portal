import { useState, useEffect, useRef } from 'react';
import { Info, Shield, RotateCcw, Save, Check, Loader2, AlertCircle } from 'lucide-react';
import api from '../utils/api';
import ToggleSwitch from './ToggleSwitch';

function EngageSettings({ gmailStatus }) {
  const [settings, setSettings] = useState({
    dailySendLimit: 50,
    hourlySendLimit: 6,
    unsubscribe: { enabled: false, message: 'If you no longer wish to receive emails from me, you can unsubscribe at any time' },
    signature: '',
    fromName: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadSettings();
  }, [gmailStatus?.connected]);

  async function loadSettings() {
    try {
      const res = await api.getEngageSettings();
      if (res.success) {
        setSettings(prev => ({
          ...prev,
          ...res.settings,
          unsubscribe: {
            ...prev.unsubscribe,
            ...(res.settings?.unsubscribe || {})
          }
        }));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.updateEngageSettings(settings);
      if (res.success) {
        setSettings(res.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(res.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveError(err.message || 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const defaults = {
      dailySendLimit: 50,
      hourlySendLimit: 6,
      unsubscribe: { enabled: false, message: 'If you no longer wish to receive emails from me, you can unsubscribe at any time' },
      signature: '',
      fromName: ''
    };
    setSettings(defaults);
    setSaveError('');
    // Persist default settings to backend
    setSaving(true);
    try {
      const res = await api.updateEngageSettings(defaults);
      if (res.success) {
        setSettings(res.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to reset settings:', err);
      setSaveError(err.message || 'Failed to reset settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-dark-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* General */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-white mb-6">General</h3>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-400">Emails sent from:</span>
            <div className="flex items-center gap-2">
              {gmailStatus.connected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rivvra-500" />
                  <span className="text-sm text-white">{gmailStatus.email}</span>
                </>
              ) : (
                <span className="text-sm text-dark-500">Not connected</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-400">Display name:</span>
              <div className="group relative">
                <Info className="w-3.5 h-3.5 text-dark-500 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-700 text-xs text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  Name shown in the "From" field. Leave empty to use your profile name.
                </div>
              </div>
            </div>
            <input
              type="text"
              value={settings.fromName || ''}
              onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
              placeholder="e.g., John from Acme"
              maxLength={100}
              className="w-48 px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 text-right focus:outline-none focus:border-rivvra-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-400">Daily send limit:</span>
              <div className="group relative">
                <Info className="w-3.5 h-3.5 text-dark-500 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-700 text-xs text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  Maximum emails sent per day
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="200"
                value={settings.dailySendLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val)) return;
                  setSettings({ ...settings, dailySendLimit: Math.min(200, Math.max(1, val)) });
                }}
                className="w-20 px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-rivvra-500"
              />
              <span className="text-sm text-dark-500">per day</span>
            </div>
          </div>

          <p className="text-xs text-dark-500 -mt-2 pl-0">The recommended daily limit is 50 emails.</p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-400">Hourly send limit:</span>
              <div className="group relative">
                <Info className="w-3.5 h-3.5 text-dark-500 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-700 text-xs text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  Maximum emails sent per hour
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="50"
                value={settings.hourlySendLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val)) return;
                  setSettings({ ...settings, hourlySendLimit: Math.min(50, Math.max(1, val)) });
                }}
                className="w-20 px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-rivvra-500"
              />
              <span className="text-sm text-dark-500">per hour</span>
            </div>
          </div>

          <p className="text-xs text-dark-500 -mt-2 pl-0">The recommended hourly limit is 6 emails.</p>

          {/* Domain health banner */}
          <div className="flex items-start gap-3 p-4 bg-rivvra-500/5 border border-rivvra-500/20 rounded-xl">
            <Shield className="w-5 h-5 text-rivvra-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">Protect your domain health with email limit recommendations</p>
              <p className="text-xs text-dark-400 mt-1">
                Rivvra recommends up to 50 daily email sends to maintain deliverability and prevent spam flags.
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {saveError && (
          <div className="flex items-center gap-2 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-400">{saveError}</span>
          </div>
        )}

        {/* Save/Reset buttons */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-dark-800">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Unsubscribe settings */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Automatic unsubscribe link</h3>
            <p className="text-xs text-dark-400 mt-1">
              An unsubscribe option will be automatically added to your email header and below your signature in every sequence email. This makes it easy for recipients to opt out and ensures you stay compliant.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.unsubscribe?.enabled || false}
            onChange={(val) => setSettings({
              ...settings,
              unsubscribe: { ...settings.unsubscribe, enabled: val }
            })}
          />
        </div>

        {settings.unsubscribe?.enabled && (
          <div className="mt-4 pt-4 border-t border-dark-800">
            <label className="block text-xs text-dark-400 mb-2">Unsubscribe message:</label>
            <textarea
              value={settings.unsubscribe?.message || ''}
              onChange={(e) => setSettings({
                ...settings,
                unsubscribe: { ...settings.unsubscribe, message: e.target.value }
              })}
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-rivvra-500"
            />
          </div>
        )}
      </div>

      {/* Setting details */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Setting details</h3>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-dark-400">Completed: </span>
            <span className="text-dark-300">When all scheduled emails in a sequence are sent, the sequence is marked as "completed".</span>
          </div>
          <div>
            <span className="text-dark-400">Engagement history: </span>
            <span className="text-dark-300">Each contact will receive a status based on your latest interaction with them.</span>
          </div>
        </div>
      </div>

      {/* Email signature */}
      <SignatureSection
        signature={settings.signature || ''}
        gmailConnected={gmailStatus.connected}
      />
    </div>
  );
}

// ========================== SIGNATURE SECTION ==========================

function SignatureSection({ signature, gmailConnected }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!signature || !iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 16px 20px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222; line-height: 1.5; background: #fff; }
  img { max-width: 100%; height: auto; }
  a { color: inherit; }
  table { border-collapse: collapse; }
</style></head><body>${signature}</body></html>`);
    doc.close();

    // Auto-resize iframe to fit content
    const resizeObserver = new ResizeObserver(() => {
      if (doc.body) {
        iframe.style.height = doc.body.scrollHeight + 'px';
      }
    });

    // Wait for images to load before measuring
    const checkHeight = () => {
      if (doc.body) {
        iframe.style.height = doc.body.scrollHeight + 'px';
      }
    };

    // Initial size + watch for changes
    const t1 = setTimeout(checkHeight, 50);
    const t2 = setTimeout(checkHeight, 300);
    const t3 = setTimeout(checkHeight, 1000);
    if (doc.body) resizeObserver.observe(doc.body);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      resizeObserver.disconnect();
    };
  }, [signature]);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-white">Email signature</h3>
        {gmailConnected && signature && (
          <span className="text-xs text-rivvra-400">Synced from Gmail</span>
        )}
      </div>
      <p className="text-xs text-dark-400 mb-4">This signature will be appended to all sequence emails. It is automatically fetched from your connected Gmail account.</p>

      {signature ? (
        <div className="rounded-lg overflow-hidden border border-dark-700">
          <iframe
            ref={iframeRef}
            title="Email signature preview"
            className="w-full border-0 bg-white"
            style={{ minHeight: '120px' }}
            sandbox="allow-same-origin"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center py-8 px-4 bg-dark-800/50 border border-dark-700 border-dashed rounded-lg">
          <p className="text-sm text-dark-500 text-center">
            {gmailConnected
              ? 'No signature found. Disconnect and reconnect Gmail to re-sync.'
              : 'Connect your Gmail account to auto-import your email signature.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default EngageSettings;
