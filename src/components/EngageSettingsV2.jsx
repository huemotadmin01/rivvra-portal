import { useState, useEffect, useRef } from 'react';
import { Info, Shield, RotateCcw, Save, Check, Loader2, AlertCircle } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import {
  Panel, Button, Input, Textarea, Switch, SettingRow, Callout, PageSpinner,
} from './ds';

// ─────────────────────────────────────────────────────────────────────────────
// Outreach send settings. Two things here are load-bearing and are spliced in
// verbatim rather than retyped:
//
//   1. The send-limit clamps — `Math.min(200, Math.max(1, val))` daily and
//      `Math.min(50, Math.max(1, val))` hourly, with the NaN early-return.
//      These are what stop someone typing 5000 into a field that governs how
//      many emails leave a real mailbox, which is a deliverability and
//      domain-reputation problem, not a UI one.
//   2. `starterSignature` and the `savedSig ? … : starterSignature` guard in
//      loadSettings — the starter is a PREFILL for empty signatures only. It
//      must never overwrite a signature a rep has already saved.
//
// `handleReset` writes the defaults to the backend immediately; it is not a
// local form reset. Both it and Save were left untouched during verification.
//
// The signature preview iframe keeps `sandbox="allow-same-origin"` and NO
// allow-scripts: the preview renders HTML the user pasted, so granting scripts
// would turn a settings field into stored XSS against its own author.
// ─────────────────────────────────────────────────────────────────────────────

/** Hover hint beside a label. Replaces the hand-rolled opacity tooltip. */
function Hint({ children }) {
  return (
    <span title={children} style={{ display: 'inline-grid', placeItems: 'center', color: 'var(--fg-4)', cursor: 'help' }}>
      <Info size={13} />
    </span>
  );
}

/** Label + optional hint, as the left side of a SettingRow. */
function RowLabel({ children, hint }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </span>
  );
}

function EngageSettingsV2({ gmailStatus }) {
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  // A plain-text starter signature built from data we already have (name,
  // title, company) — no Gmail scope needed. Only ever PREFILLED when the
  // saved signature is empty (see loadSettings); never overwrites an
  // existing one, and only persists if the user clicks Save.
  const starterSignature = (() => {
    const name = (user?.name || '').trim();
    if (!name) return '';
    const line2 = [user?.senderTitle, currentCompany?.name].filter(Boolean).join(', ');
    return [name, line2].filter(Boolean).join('\n');
  })();
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
        const savedSig = (res.settings?.signature || '').trim();
        setSettings(prev => ({
          ...prev,
          ...res.settings,
          // Prefill the starter ONLY when the saved signature is empty. Users
          // with a real signature keep it untouched; this is just a helpful
          // default for new reps that they can edit and Save.
          signature: savedSig ? res.settings.signature : starterSignature,
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

  if (loading) return <PageSpinner label="Loading outreach settings…" />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* General */}
      <Panel title="General">
        <div style={{ padding: 6, display: 'grid', gap: 4 }}>
          <SettingRow
            label="Emails sent from:"
            control={gmailStatus.connected ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--brand)' }} />
                <span style={{ font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{gmailStatus.email}</span>
              </span>
            ) : (
              <span style={{ font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Not connected</span>
            )}
          />

          <SettingRow
            label={<RowLabel hint={'Name shown in the "From" field. Leave empty to use your profile name.'}>Display name:</RowLabel>}
            control={(
              <Input
                type="text"
                value={settings.fromName || ''}
                onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                placeholder="e.g., John from Acme"
                aria-label="Display name"
                maxLength={100}
                style={{ width: 200, textAlign: 'right' }}
              />
            )}
          />

          <SettingRow
            label={<RowLabel hint="Maximum emails sent per day">Daily send limit:</RowLabel>}
            description="The recommended daily limit is 50 emails."
            control={(
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Input
                  type="number"
                  min="1"
                  max="200"
                  value={settings.dailySendLimit}
                  aria-label="Daily send limit"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val)) return;
                    setSettings({ ...settings, dailySendLimit: Math.min(200, Math.max(1, val)) });
                  }}
                  style={{ width: 78, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
                <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>per day</span>
              </span>
            )}
          />

          <SettingRow
            label={<RowLabel hint="Maximum emails sent per hour">Hourly send limit:</RowLabel>}
            description="The recommended hourly limit is 6 emails."
            control={(
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.hourlySendLimit}
                  aria-label="Hourly send limit"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val)) return;
                    setSettings({ ...settings, hourlySendLimit: Math.min(50, Math.max(1, val)) });
                  }}
                  style={{ width: 78, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
                <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>per hour</span>
              </span>
            )}
          />

          {/* Domain health banner */}
          <Callout tone="brand" icon={<Shield size={15} />} title="Protect your domain health with email limit recommendations" style={{ marginTop: 8 }}>
            Rivvra recommends up to 50 daily email sends to maintain deliverability and prevent spam flags.
          </Callout>

          {/* Error message */}
          {saveError && (
            <Callout tone="danger" icon={<AlertCircle size={15} />} style={{ marginTop: 8 }}>{saveError}</Callout>
          )}

          {/* Save/Reset buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
            <Button variant="ghost" size="sm" onClick={handleReset} iconLeft={<RotateCcw size={14} />}>Reset</Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Unsubscribe settings */}
      <Panel title="Automatic unsubscribe link">
        <div style={{ padding: 6, display: 'grid', gap: 4 }}>
          <SettingRow
            label="Add an unsubscribe link to every sequence email"
            description="An unsubscribe option will be automatically added to your email header and below your signature in every sequence email. This makes it easy for recipients to opt out and ensures you stay compliant."
            control={(
              <Switch
                checked={settings.unsubscribe?.enabled || false}
                label="Automatic unsubscribe link"
                onChange={(val) => setSettings({
                  ...settings,
                  unsubscribe: { ...settings.unsubscribe, enabled: val }
                })}
              />
            )}
          />

          {settings.unsubscribe?.enabled && (
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
              <label htmlFor="unsub-message" style={{ display: 'block', font: "500 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 6 }}>
                Unsubscribe message:
              </label>
              <Textarea
                id="unsub-message"
                value={settings.unsubscribe?.message || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  unsubscribe: { ...settings.unsubscribe, message: e.target.value }
                })}
                rows={2}
                maxLength={500}
                style={{ resize: 'none' }}
              />
            </div>
          )}
        </div>
      </Panel>

      {/* Setting details */}
      <Panel title="Setting details">
        <div style={{ padding: 6, display: 'grid', gap: 10, font: "400 12.5px/1.6 'Inter', system-ui, sans-serif" }}>
          <div>
            <span style={{ color: 'var(--fg-4)' }}>Completed: </span>
            <span style={{ color: 'var(--fg-2)' }}>When all scheduled emails in a sequence are sent, the sequence is marked as “completed”.</span>
          </div>
          <div>
            <span style={{ color: 'var(--fg-4)' }}>Engagement history: </span>
            <span style={{ color: 'var(--fg-2)' }}>Each contact will receive a status based on your latest interaction with them.</span>
          </div>
        </div>
      </Panel>

      {/* Email signature */}
      <SignatureSection
        signature={settings.signature || ''}
        onChange={(val) => setSettings({ ...settings, signature: val })}
      />
    </div>
  );
}

// ========================== SIGNATURE SECTION ==========================

function SignatureSection({ signature, onChange }) {
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
    <Panel title="Email signature">
      <div style={{ padding: 6 }}>
        <p style={{ font: "400 11.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>
          This signature is appended to all sequence emails. Paste it here — plain text or HTML
          (copy it from your Gmail settings if you’d like to match).
        </p>

        <Textarea
          value={signature}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          aria-label="Email signature"
          placeholder={'e.g.\n\nJane Doe\nTalent Partner, Acme Staffing\njane@acme.com · +1 415 555 0100'}
          style={{ font: "400 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace", resize: 'vertical' }}
        />

        {signature && (
          <div style={{ marginTop: 12 }}>
            <p style={{ font: "500 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
              Preview
            </p>
            {/* `sandbox="allow-same-origin"` with NO allow-scripts: this renders
                HTML the user pasted, so granting scripts would turn a settings
                field into stored XSS against its own author. */}
            <div style={{ borderRadius: 'var(--r-2)', overflow: 'hidden', boxShadow: '0 0 0 1px var(--line)' }}>
              <iframe
                ref={iframeRef}
                title="Email signature preview"
                style={{ width: '100%', border: 0, background: '#fff', minHeight: '80px', display: 'block' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}
        <p style={{ font: "400 10.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '8px 0 0' }}>
          Remember to click Save settings above after editing.
        </p>
      </div>
    </Panel>
  );
}

export default EngageSettingsV2;
