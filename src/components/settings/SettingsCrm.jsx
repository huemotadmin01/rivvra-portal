/**
 * SettingsCrm — CRM app settings section
 * Pipeline defaults and currency configuration.
 * Only visible to users with admin role on the CRM app.
 *
 * Sales Teams have moved to Platform Settings → Users & Teams (SettingsTeam.jsx)
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import {
  Save, Loader2, AlertCircle, Briefcase,
} from 'lucide-react';
import crmApi from '../../utils/crmApi';

export default function SettingsCrm() {
  const { currentOrg, isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const { showToast } = useToast();
  const isAdmin = getAppRole('crm') === 'admin' || isOrgAdmin || isOrgOwner;
  const orgSlug = currentOrg?.slug;

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!isAdmin || !orgSlug) { setLoading(false); return; }
    let cancelled = false;
    crmApi.getSettings(orgSlug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.settings) setSettings(res.settings);
        else setSettings(res);
      })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, orgSlug]);

  // ─── CRM Settings ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!settings) { showToast('No settings to save', 'error'); return; }
    setSaving(true);
    try {
      await crmApi.updateSettings(orgSlug, settings);
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage CRM settings.</p>
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Settings */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-emerald-400" />
            <h3 className="font-semibold text-white">Pipeline Settings</h3>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Currency</label>
              <p className="text-xs text-dark-500 mb-2">Currency used for deal revenue and reporting</p>
              <select
                value={settings?.defaultCurrency ?? 'INR'}
                onChange={e => update('defaultCurrency', e.target.value)}
                className="input-field w-auto">
                <option value="INR">INR — Indian Rupee</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="SGD">SGD — Singapore Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="CAD">CAD — Canadian Dollar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Pipeline View</label>
              <p className="text-xs text-dark-500 mb-2">View mode when opening the pipeline page</p>
              <select
                value={settings?.pipelineMode ?? 'kanban'}
                onChange={e => update('pipelineMode', e.target.value)}
                className="input-field w-auto">
                <option value="kanban">Kanban Board</option>
                <option value="list">List View</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
        <Save size={16} /> {saving ? 'Saving...' : 'Save CRM Settings'}
      </button>
    </div>
  );
}
