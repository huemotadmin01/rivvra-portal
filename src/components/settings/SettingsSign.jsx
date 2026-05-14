/**
 * SettingsSign — Sign app settings section (placeholder)
 * Settings will be functional once backend endpoints are created.
 * Only visible to users with admin role on the Sign app.
 */
import { useOrg } from '../../context/OrgContext';
import { AlertCircle, PenTool, Clock, Bell, ShieldCheck } from 'lucide-react';

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

export default function SettingsSign() {
  const { isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const isAdmin = getAppRole('sign') === 'admin' || isOrgAdmin || isOrgOwner;

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage Sign settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Request Defaults (Coming Soon) */}
        <div className="card p-5 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <PenTool size={18} className="text-indigo-400" />
            <h3 className="font-semibold text-white">Request Defaults</h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Expiration</label>
              <p className="text-xs text-dark-500 mb-2">Number of days before sign requests expire</p>
              <input type="number" disabled value={30}
                className="input-field w-24 opacity-50 cursor-not-allowed" />
              <span className="text-xs text-dark-500 ml-2">days</span>
            </div>
          </div>
        </div>

        {/* Reminders (Coming Soon) */}
        <div className="card p-5 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-amber-400" />
            <h3 className="font-semibold text-white">Reminders</h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Auto-Send Reminders</p>
                <p className="text-xs text-dark-500">Automatically remind signers of pending requests</p>
              </div>
              <ToggleSwitch checked={false} onChange={() => {}} disabled />
            </div>
          </div>
        </div>

        {/* Security (Coming Soon) */}
        <div className="card p-5 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-cyan-400" />
            <h3 className="font-semibold text-white">Security</h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Require Email Verification</p>
                <p className="text-xs text-dark-500">Signers must verify their email before signing</p>
              </div>
              <ToggleSwitch checked={false} onChange={() => {}} disabled />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
