/**
 * SettingsAts — ATS app settings section
 * Application defaults and candidate management config.
 * Only visible to users with admin role on the ATS app.
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { Save, Loader2, AlertCircle, UserSearch, BarChart3 } from 'lucide-react';
import atsApi from '../../utils/atsApi';

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors ${
        checked ? 'bg-rivvra-500' : 'bg-dark-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform shadow-sm ${
        checked ? 'translate-x-[18px]' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function SettingsAts() {
  const { currentOrg, isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const { showToast } = useToast();
  const isAdmin = getAppRole('ats') === 'admin' || isOrgAdmin || isOrgOwner;

  const [settings, setSettings] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!isAdmin || !currentOrg?.slug) { setLoading(false); return; }
    let cancelled = false;

    Promise.all([
      atsApi.getSettings(currentOrg.slug),
      atsApi.listStages(currentOrg.slug),
    ])
      .then(([settingsRes, stagesRes]) => {
        if (cancelled) return;
        if (settingsRes.success && settingsRes.settings) setSettings(settingsRes.settings);
        else setSettings(settingsRes);
        if (stagesRes.success) setStages(stagesRes.stages || []);
      })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isAdmin, currentOrg?.slug]);

  const handleSave = async () => {
    if (!settings) { showToast('No settings to save', 'error'); return; }
    setSaving(true);
    try {
      await atsApi.updateSettings(currentOrg.slug, settings);
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-purple-500 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage ATS settings.</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">Failed to load settings. Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  // Reporting thresholds live under settings.reportingThresholds. The
  // updater merges into that nested object so individual fields can be
  // edited without nuking the others.
  const updateThreshold = (key, value) => setSettings((prev) => ({
    ...prev,
    reportingThresholds: { ...(prev?.reportingThresholds || {}), [key]: value },
  }));
  // Defaults match ATS_REPORTING_THRESHOLD_DEFAULTS in the API
  // (src/ats.js). Keep these in sync if the server-side defaults
  // change so the placeholder text never lies.
  const thresholds = settings?.reportingThresholds || {};
  const staleDays = Number.isFinite(Number(thresholds.staleDays)) ? thresholds.staleDays : 14;
  const awaitingResultDays = Number.isFinite(Number(thresholds.awaitingResultDays)) ? thresholds.awaitingResultDays : 3;
  const pendingApprovalHours = Number.isFinite(Number(thresholds.pendingApprovalHours)) ? thresholds.pendingApprovalHours : 24;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Application Settings */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserSearch size={18} className="text-purple-400" />
            <h3 className="font-semibold text-white">Application Settings</h3>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Auto-Create Candidate</p>
                <p className="text-xs text-dark-500">Automatically create a candidate record when an application is received</p>
              </div>
              <ToggleSwitch
                checked={settings?.autoCreateCandidate ?? true}
                onChange={v => update('autoCreateCandidate', v)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Stage</label>
              <p className="text-xs text-dark-500 mb-2">Stage assigned to new applications when created</p>
              <select
                value={settings?.defaultStageOnApply ?? ''}
                onChange={e => update('defaultStageOnApply', e.target.value || null)}
                className="input-field w-auto">
                <option value="">First stage (default)</option>
                {stages.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Reporting Thresholds (Phase 2) */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-amber-400" />
            <h3 className="font-semibold text-white">Reporting Thresholds</h3>
          </div>
          <p className="text-xs text-dark-500 mb-4">
            Controls when records appear on the ATS Reporting "Needs attention" cards.
          </p>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Stale applications</label>
              <p className="text-xs text-dark-500 mb-2">Applications stuck in the same stage longer than this many days flag as stale.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={staleDays}
                  onChange={(e) => updateThreshold('staleDays', Number(e.target.value) || 14)}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Awaiting interview result</label>
              <p className="text-xs text-dark-500 mb-2">Interviews older than this without a captured Proceed / Reject result flag as awaiting.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={awaitingResultDays}
                  onChange={(e) => updateThreshold('awaitingResultDays', Number(e.target.value) || 3)}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Pending job approvals</label>
              <p className="text-xs text-dark-500 mb-2">Jobs awaiting approval longer than this flag as overdue.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={pendingApprovalHours}
                  onChange={(e) => updateThreshold('pendingApprovalHours', Number(e.target.value) || 24)}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">hours</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
        <Save size={16} /> {saving ? 'Saving...' : 'Save ATS Settings'}
      </button>
    </div>
  );
}
