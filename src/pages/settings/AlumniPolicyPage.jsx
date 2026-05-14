// ============================================================================
// AlumniPolicyPage.jsx — Admin config for the alumni (post-separation) lifecycle
// ============================================================================
import { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import alumniApi from '../../utils/alumniApi';
import { Shield, Save, AlertCircle } from 'lucide-react';

export default function AlumniPolicyPage() {
  const { orgSlug } = usePlatform();
  const { isOrgAdmin } = useOrg();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    graceDays: 90,
    taxWindowExtension: true,
    reactivationDays: 7,
  });

  useEffect(() => {
    if (!orgSlug || !isOrgAdmin) return;
    (async () => {
      try {
        setLoading(true);
        const res = await alumniApi.getPolicy(orgSlug);
        if (res?.data) setForm({
          graceDays: res.data.graceDays,
          taxWindowExtension: res.data.taxWindowExtension,
          reactivationDays: res.data.reactivationDays,
        });
      } catch (err) {
        setError(err.message || 'Failed to load alumni policy');
      } finally {
        setLoading(false);
      }
    })();
  }, [orgSlug, isOrgAdmin]);

  const save = async () => {
    if (!orgSlug) return;
    try {
      setSaving(true);
      await alumniApi.updatePolicy(orgSlug, {
        graceDays: Number(form.graceDays),
        taxWindowExtension: !!form.taxWindowExtension,
        reactivationDays: Number(form.reactivationDays),
      });
      showToast('Alumni policy saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOrgAdmin) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> Admin access required
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-sm text-dark-500">Loading alumni policy...</div>;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-rivvra-400" />
        <h1 className="text-xl font-bold text-white">Alumni Policy</h1>
      </div>
      <p className="text-sm text-dark-400">
        Controls how long separated employees keep read-only access to the portal to download
        payslips, tax reports and F&F receipts. Alumni do not count against your billing seats.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="space-y-5 border border-dark-700 rounded-lg p-5 bg-dark-900/40">
        {/* Grace days */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">
            Grace period (days)
          </label>
          <input
            type="number"
            min={0}
            max={365}
            value={form.graceDays}
            onChange={(e) => setForm({ ...form, graceDays: e.target.value })}
            className="w-32 px-3 py-2 bg-dark-900 border border-dark-700 rounded text-sm text-white focus:outline-none focus:border-rivvra-500"
          />
          <p className="text-xs text-dark-500 mt-1">
            Days after last working day an alumnus can still log in. Default: 90.
          </p>
        </div>

        {/* Tax window extension */}
        <div>
          <label className="flex items-center gap-2 text-sm text-dark-200">
            <input
              type="checkbox"
              checked={form.taxWindowExtension}
              onChange={(e) => setForm({ ...form, taxWindowExtension: e.target.checked })}
              className="w-4 h-4 rounded accent-rivvra-500"
            />
            Extend access to 30 Jun of next FY for confirmed employees (tax filing window)
          </label>
          <p className="text-xs text-dark-500 mt-1 ml-6">
            When on, confirmed employees retain read-only access until they can file their ITR.
          </p>
        </div>

        {/* Reactivation days */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">
            Reactivation default (days)
          </label>
          <input
            type="number"
            min={1}
            max={90}
            value={form.reactivationDays}
            onChange={(e) => setForm({ ...form, reactivationDays: e.target.value })}
            className="w-32 px-3 py-2 bg-dark-900 border border-dark-700 rounded text-sm text-white focus:outline-none focus:border-rivvra-500"
          />
          <p className="text-xs text-dark-500 mt-1">
            How long a one-click admin reactivation grants access to an archived alumnus. Default: 7.
          </p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 rounded text-sm font-medium text-white"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  );
}
