/**
 * SettingsPayroll — Unified Payroll settings page
 * Consolidates TDS Config, Salary Structures, Statutory Config, PT Master, and FY Rates
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getOrgTdsConfig, updateOrgTdsConfig } from '../../utils/payrollApi';
import { Save, Plus, Trash2, Loader2, Star, AlertCircle } from 'lucide-react';

const SalaryStructuresPage = lazy(() => import('../../pages/payroll/SalaryStructuresPage'));
const StatutoryConfigPage = lazy(() => import('../../pages/payroll/StatutoryConfigPage'));
const PTMasterPage = lazy(() => import('../../pages/payroll/PTMasterPage'));
const PayrollSettingsPage = lazy(() => import('../../pages/payroll/PayrollSettingsPage'));

const TABS = [
  { id: 'tds', label: 'TDS Configuration' },
  { id: 'structures', label: 'Salary Structures' },
  { id: 'statutory', label: 'Statutory Config' },
  { id: 'pt', label: 'PT Master' },
  { id: 'fy', label: 'FY Rates', superAdminOnly: true },
];

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-dark-400" size={24} />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TDS Configuration Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TdsConfigTab() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [orgSlug]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await getOrgTdsConfig(orgSlug);
      setConfig(res.tdsConfig || { defaultSection: '194C', sections: [] });
    } catch {
      showToast('Failed to load TDS config', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.sections.length) return showToast('Add at least one TDS section', 'error');
    const hasDefault = config.sections.some(s => s.code === config.defaultSection);
    if (!hasDefault) return showToast('Default section must be one of the configured sections', 'error');

    setSaving(true);
    try {
      await updateOrgTdsConfig(orgSlug, config);
      showToast('TDS configuration saved', 'success');
    } catch {
      showToast('Failed to save TDS config', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateSection = (idx, field, value) => {
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], [field]: value };
    setConfig({ ...config, sections });
  };

  const addSection = () => {
    setConfig({
      ...config,
      sections: [...config.sections, { code: '', label: '', rate: 0 }],
    });
  };

  const removeSection = (idx) => {
    const sections = config.sections.filter((_, i) => i !== idx);
    setConfig({ ...config, sections });
  };

  const setDefault = (code) => {
    setConfig({ ...config, defaultSection: code });
  };

  if (loading) return <TabLoader />;

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="text-sm text-dark-300">
          <p>Configure TDS sections and rates for consultant payroll. The <strong className="text-white">default section</strong> determines the TDS rate applied to all <strong className="text-white">Internal Consultant</strong> employees during payroll processing.</p>
        </div>
      </div>

      {/* Default section display */}
      {config.defaultSection && config.sections.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
          <div className="text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">Current Default</div>
          {(() => {
            const def = config.sections.find(s => s.code === config.defaultSection);
            if (!def) return <p className="text-dark-400">Not set</p>;
            return (
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-lg">{def.code}</span>
                <span className="text-dark-300">—</span>
                <span className="text-dark-300">{def.label}</span>
                <span className="px-2.5 py-0.5 bg-rivvra-500/10 text-rivvra-400 text-sm font-semibold rounded-full">
                  {(def.rate * 100).toFixed(1)}% TDS
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Sections table */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">TDS Sections</h3>
          <button onClick={addSection} className="flex items-center gap-1.5 text-xs font-medium text-rivvra-400 hover:text-rivvra-300">
            <Plus size={14} /> Add Section
          </button>
        </div>

        {config.sections.length === 0 ? (
          <div className="p-8 text-center text-dark-400 text-sm">
            No TDS sections configured. Click "Add Section" to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Section Code</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Label</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Rate (%)</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Default</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {config.sections.map((section, idx) => (
                <tr key={idx} className="hover:bg-dark-750/30">
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      value={section.code}
                      onChange={(e) => updateSection(idx, 'code', e.target.value)}
                      placeholder="e.g. 194C"
                      className="w-24 px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      value={section.label}
                      onChange={(e) => updateSection(idx, 'label', e.target.value)}
                      placeholder="e.g. Section 194C - Contractor"
                      className="w-full px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number"
                      step="0.1"
                      value={section.rate ? (section.rate * 100).toFixed(1) : ''}
                      onChange={(e) => updateSection(idx, 'rate', parseFloat(e.target.value) / 100 || 0)}
                      placeholder="2.0"
                      className="w-20 px-2.5 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white text-right focus:border-rivvra-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => setDefault(section.code)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        config.defaultSection === section.code
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-dark-500 hover:text-dark-300'
                      }`}
                      title={config.defaultSection === section.code ? 'Default section' : 'Set as default'}
                    >
                      <Star size={16} fill={config.defaultSection === section.code ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => removeSection(idx)} className="p-1.5 text-dark-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save TDS Configuration
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Settings Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function SettingsPayroll() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const initialTab = searchParams.get('tab') || 'tds';
  const [activeTab, setActiveTab] = useState(initialTab);

  const visibleTabs = TABS.filter(t => !t.superAdminOnly || isSuperAdmin);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Payroll</h2>
      <p className="text-dark-400 text-sm mb-6">TDS, salary structures, statutory configuration & compliance</p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-700 mb-6 overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-rivvra-500 text-white'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'tds' && <TdsConfigTab />}
        {activeTab === 'structures' && <SalaryStructuresPage embedded />}
        {activeTab === 'statutory' && <StatutoryConfigPage embedded />}
        {activeTab === 'pt' && <PTMasterPage embedded />}
        {activeTab === 'fy' && isSuperAdmin && <PayrollSettingsPage embedded />}
      </Suspense>
    </div>
  );
}
