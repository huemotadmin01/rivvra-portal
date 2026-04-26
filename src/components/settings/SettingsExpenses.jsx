import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import expensesApi from '../../utils/expensesApi';
import {
  Loader2, Save, Wallet, ExternalLink, Users, Info, Tag, ShieldCheck,
} from 'lucide-react';

export default function SettingsExpenses() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [approvers, setApprovers] = useState([]);
  const [categories, setCategories] = useState([]);

  const [autoApproveThreshold, setAutoApproveThreshold] = useState(0);
  const [requireReceiptAbove, setRequireReceiptAbove] = useState(0);
  const [defaultCurrency, setDefaultCurrency] = useState('INR');

  const load = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const [s, a, c] = await Promise.all([
        expensesApi.getSettings(orgSlug),
        expensesApi.listApprovers(orgSlug),
        expensesApi.listCategories(orgSlug),
      ]);
      setSettings(s?.settings || null);
      setApprovers(a?.approvers || []);
      setCategories(c?.categories || []);
      if (s?.settings) {
        setAutoApproveThreshold(s.settings.autoApproveThreshold || 0);
        setRequireReceiptAbove(s.settings.requireReceiptAbove || 0);
        setDefaultCurrency(s.settings.defaultCurrency || 'INR');
      }
    } catch (e) {
      showToast(e.message || 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await expensesApi.updateSettings(orgSlug, {
        autoApproveThreshold: Number(autoApproveThreshold) || 0,
        requireReceiptAbove: Number(requireReceiptAbove) || 0,
        defaultCurrency: (defaultCurrency || 'INR').toUpperCase(),
      });
      setSettings(res?.settings || settings);
      showToast('Settings saved');
    } catch (e) {
      showToast(e.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-dark-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Wallet size={18} className="text-rivvra-400" />
          Expense Settings
        </h2>
        <p className="text-sm text-dark-400">
          Configure how employee expenses are submitted, reviewed, and synced into Invoicing.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-rivvra-500/5 border border-rivvra-500/20 rounded-xl">
        <Info size={16} className="text-rivvra-400 mt-0.5 shrink-0" />
        <div className="text-xs text-dark-300 space-y-1">
          <p>On approval, an <span className="text-white font-medium">Employee Bill</span> (journal: <span className="font-mono text-rivvra-400">EMPBI</span>) is auto-created in Invoicing for the submitter.</p>
          <p>Anyone with <span className="text-white font-medium">admin</span> or <span className="text-white font-medium">team lead</span> role on the Expenses app can approve or reject submissions.</p>
        </div>
      </div>

      {/* Defaults */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5 space-y-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck size={16} className="text-rivvra-400" />
          Defaults & Policy
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">Default Currency</label>
            <select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500"
            >
              <option value="INR">INR — Indian Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="CAD">CAD — Canadian Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
            <p className="text-[11px] text-dark-500 mt-1">Pre-selected on the New Expense form.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">Auto-approve Below</label>
            <input
              type="number"
              min="0"
              step="1"
              value={autoApproveThreshold}
              onChange={(e) => setAutoApproveThreshold(e.target.value)}
              disabled={saving}
              placeholder="0 (off)"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500"
            />
            <p className="text-[11px] text-dark-500 mt-1">Reserved for future automation. Leave 0 to require approval for all expenses.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">Receipt Required Above</label>
            <input
              type="number"
              min="0"
              step="1"
              value={requireReceiptAbove}
              onChange={(e) => setRequireReceiptAbove(e.target.value)}
              disabled={saving}
              placeholder="0 (no requirement)"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500"
            />
            <p className="text-[11px] text-dark-500 mt-1">Approvers see a warning if receipt is missing above this amount.</p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Settings
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Tag size={16} className="text-rivvra-400" />
              Categories
            </h3>
            <p className="text-xs text-dark-400 mt-0.5">
              Categories are managed in Invoicing → Settings (single source of truth shared with Employee Bill lines).
            </p>
          </div>
          <Link
            to={`${orgPath}/invoicing/config/expense-categories`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-xs text-dark-200 whitespace-nowrap"
          >
            Manage
            <ExternalLink size={12} />
          </Link>
        </div>

        {categories.length === 0 ? (
          <p className="text-xs text-dark-500 italic">
            No categories yet. Add some in Invoicing settings so employees can categorize their expenses.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c._id}
                className="inline-flex items-center px-2.5 py-1 bg-dark-800 border border-dark-700 rounded-full text-xs text-dark-200"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Approvers */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users size={16} className="text-rivvra-400" />
              Approvers
            </h3>
            <p className="text-xs text-dark-400 mt-0.5">
              Anyone with admin or team lead role on the Expenses app can approve. Manage roles in Settings → Team.
            </p>
          </div>
          <Link
            to={`${orgPath}/settings/users`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-xs text-dark-200 whitespace-nowrap"
          >
            Manage Team
            <ExternalLink size={12} />
          </Link>
        </div>

        {approvers.length === 0 ? (
          <p className="text-xs text-dark-500 italic">No approvers configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-400 text-xs border-b border-dark-800">
                  <th className="text-left py-2 pr-3 font-medium">Name</th>
                  <th className="text-left py-2 pr-3 font-medium">Email</th>
                  <th className="text-left py-2 pr-3 font-medium">Org Role</th>
                  <th className="text-left py-2 font-medium">App Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {approvers.map((a) => (
                  <tr key={a.userId} className="text-dark-200">
                    <td className="py-2 pr-3 text-white">{a.name}</td>
                    <td className="py-2 pr-3 text-dark-400">{a.email}</td>
                    <td className="py-2 pr-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-800 text-dark-300 capitalize">
                        {a.orgRole}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rivvra-500/10 text-rivvra-400 capitalize">
                        {(a.appRole || '').replace('_', ' ') || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
