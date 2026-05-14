/**
 * SettingsContacts — Contacts app settings section (placeholder)
 * Settings will be functional once backend endpoints are created.
 * Only visible to users with admin role on the Contacts app.
 */
import { useOrg } from '../../context/OrgContext';
import { AlertCircle, Contact, Users, Search } from 'lucide-react';

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

export default function SettingsContacts() {
  const { isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const isAdmin = getAppRole('contacts') === 'admin' || isOrgAdmin || isOrgOwner;

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage Contacts settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Contact Defaults (Coming Soon) */}
        <div className="card p-5 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <Contact size={18} className="text-cyan-400" />
            <h3 className="font-semibold text-white">Contact Defaults</h3>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Contact Type</label>
              <p className="text-xs text-dark-500 mb-2">Type pre-selected when creating new contacts</p>
              <select disabled className="input-field w-auto opacity-50 cursor-not-allowed">
                <option>Individual</option>
                <option>Company</option>
              </select>
            </div>
          </div>
        </div>

        {/* Duplicate Detection (Coming Soon) */}
        <div className="card p-5 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <Search size={18} className="text-amber-400" />
            <h3 className="font-semibold text-white">Duplicate Detection</h3>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Detect Duplicates</p>
                <p className="text-xs text-dark-500">Warn when creating contacts with matching email or phone</p>
              </div>
              <ToggleSwitch checked={false} onChange={() => {}} disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Auto-Link to Company</p>
                <p className="text-xs text-dark-500">Link individuals to companies by email domain</p>
              </div>
              <ToggleSwitch checked={false} onChange={() => {}} disabled />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
