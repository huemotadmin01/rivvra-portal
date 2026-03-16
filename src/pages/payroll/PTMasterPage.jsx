import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getPTMaster, seedPTMaster, updatePTMasterConfig, getPayrollSettings, updatePayrollSettings } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { MapPin, Plus, Save, X, ChevronDown, ChevronRight, Settings2, Loader2 } from 'lucide-react';

const CURRENT_FY = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
})();

export default function PTMasterPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [fy, setFy] = useState(CURRENT_FY);
  const [expandedState, setExpandedState] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [defaultPtState, setDefaultPtState] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        getPTMaster(orgSlug, fy),
        getPayrollSettings(orgSlug),
      ]);
      setConfigs(res.configs || []);
      setDefaultPtState(settingsRes.settings?.defaultPtState || '');
    } catch { showToast('Failed to load PT Master', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [orgSlug, fy]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await seedPTMaster(orgSlug, fy);
      showToast(res.message || 'Seeded successfully', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to seed', 'error');
    } finally { setSeeding(false); }
  };

  const startEdit = (config) => {
    setEditingId(config._id);
    setEditForm({
      slabs: config.slabs.map(s => ({ ...s })),
      februaryAdjustment: config.februaryAdjustment,
      februaryExtraTax: config.februaryExtraTax ? { ...config.februaryExtraTax } : null,
      annualCap: config.annualCap,
      isActive: config.isActive,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePTMasterConfig(orgSlug, editingId, editForm);
      showToast('PT config updated', 'success');
      setEditingId(null);
      load();
    } catch { showToast('Failed to update', 'error'); }
    finally { setSaving(false); }
  };

  const saveDefaultState = async () => {
    setSavingSettings(true);
    try {
      await updatePayrollSettings(orgSlug, { defaultPtState });
      showToast('Default PT state saved', 'success');
    } catch { showToast('Failed to save', 'error'); }
    finally { setSavingSettings(false); }
  };

  const fmtCurrency = (n) => n === null ? 'No limit' : `₹${Number(n).toLocaleString('en-IN')}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-rivvra-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-rivvra-500" />
          <h1 className="text-xl font-bold text-white">PT Master</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={fy}
            onChange={e => setFy(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-200"
          >
            <option value="2024-25">FY 2024-25</option>
            <option value="2025-26">FY 2025-26</option>
            <option value="2026-27">FY 2026-27</option>
          </select>
        </div>
      </div>

      {/* Default PT State Setting */}
      <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <Settings2 className="w-4 h-4 text-dark-400" />
          <span className="text-sm font-medium text-dark-200">Default PT State</span>
          <span className="text-xs text-dark-500">(Used when employee's PT state is not configured)</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={defaultPtState}
            onChange={e => setDefaultPtState(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-200 w-64"
          >
            <option value="">-- Not Set --</option>
            {configs.map(c => (
              <option key={c.stateCode} value={c.stateCode}>{c.stateName} ({c.stateCode})</option>
            ))}
          </select>
          <button
            onClick={saveDefaultState}
            disabled={savingSettings}
            className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Empty state — seed */}
      {configs.length === 0 && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-8 text-center">
          <MapPin className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-300 mb-4">No PT slabs configured for FY {fy}</p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {seeding ? 'Loading...' : 'Load Default PT Slabs'}
          </button>
        </div>
      )}

      {/* PT Configs list */}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map(config => {
            const isExpanded = expandedState === config._id;
            const isEditing = editingId === config._id;

            return (
              <div key={config._id} className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
                {/* State header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-dark-850"
                  onClick={() => setExpandedState(isExpanded ? null : config._id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-dark-400" /> : <ChevronRight className="w-4 h-4 text-dark-400" />}
                    <span className="font-medium text-dark-200">{config.stateName}</span>
                    <span className="text-xs text-dark-500 bg-dark-800 px-2 py-0.5 rounded">{config.stateCode}</span>
                    {!config.isActive && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded">Inactive</span>}
                    {config.februaryAdjustment && <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">Feb Adj</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dark-500">Cap: {fmtCurrency(config.annualCap)}/yr</span>
                    <span className="text-xs text-dark-500">{config.slabs.length} slabs</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-dark-800">
                    {/* Slab table */}
                    <table className="w-full mt-3 text-sm">
                      <thead>
                        <tr className="text-dark-500 text-xs">
                          <th className="text-left py-2 font-medium">Monthly Gross Min</th>
                          <th className="text-left py-2 font-medium">Monthly Gross Max</th>
                          <th className="text-right py-2 font-medium">PT Amount (₹/month)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(isEditing ? editForm.slabs : config.slabs).map((slab, idx) => (
                          <tr key={idx} className="border-t border-dark-800/50">
                            <td className="py-2 text-dark-300">
                              {isEditing ? (
                                <input type="number" value={slab.min} onChange={e => {
                                  const slabs = [...editForm.slabs];
                                  slabs[idx].min = Number(e.target.value);
                                  setEditForm(f => ({ ...f, slabs }));
                                }} className="bg-dark-800 border border-dark-700 rounded px-2 py-1 w-28 text-sm" />
                              ) : fmtCurrency(slab.min)}
                            </td>
                            <td className="py-2 text-dark-300">
                              {isEditing ? (
                                <input type="number" value={slab.max ?? ''} placeholder="No limit" onChange={e => {
                                  const slabs = [...editForm.slabs];
                                  slabs[idx].max = e.target.value === '' ? null : Number(e.target.value);
                                  setEditForm(f => ({ ...f, slabs }));
                                }} className="bg-dark-800 border border-dark-700 rounded px-2 py-1 w-28 text-sm" />
                              ) : fmtCurrency(slab.max)}
                            </td>
                            <td className="py-2 text-right text-dark-200 font-medium">
                              {isEditing ? (
                                <input type="number" value={slab.tax} onChange={e => {
                                  const slabs = [...editForm.slabs];
                                  slabs[idx].tax = Number(e.target.value);
                                  setEditForm(f => ({ ...f, slabs }));
                                }} className="bg-dark-800 border border-dark-700 rounded px-2 py-1 w-24 text-sm text-right" />
                              ) : `₹${slab.tax}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* February adjustment */}
                    {(isEditing ? editForm.februaryAdjustment : config.februaryAdjustment) && (
                      <div className="mt-3 p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                        <span className="text-xs text-amber-400 font-medium">February Adjustment</span>
                        <div className="text-sm text-dark-300 mt-1">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <span>Min salary:</span>
                              <input type="number" value={editForm.februaryExtraTax?.minSalary || ''} onChange={e => {
                                setEditForm(f => ({ ...f, februaryExtraTax: { ...f.februaryExtraTax, minSalary: Number(e.target.value) } }));
                              }} className="bg-dark-800 border border-dark-700 rounded px-2 py-1 w-28 text-sm" />
                              <span>Tax:</span>
                              <input type="number" value={editForm.februaryExtraTax?.tax || ''} onChange={e => {
                                setEditForm(f => ({ ...f, februaryExtraTax: { ...f.februaryExtraTax, tax: Number(e.target.value) } }));
                              }} className="bg-dark-800 border border-dark-700 rounded px-2 py-1 w-24 text-sm" />
                            </div>
                          ) : (
                            <>Gross ≥ {fmtCurrency(config.februaryExtraTax?.minSalary)} → ₹{config.februaryExtraTax?.tax}/month</>
                          )}
                        </div>
                      </div>
                    )}

                    {config.notes && <p className="mt-2 text-xs text-dark-500 italic">{config.notes}</p>}

                    {/* Action buttons */}
                    <div className="mt-3 flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 inline-flex items-center gap-1">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-dark-800 text-dark-300 rounded-lg text-sm hover:bg-dark-700 inline-flex items-center gap-1">
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(config)} className="px-3 py-1.5 bg-dark-800 text-dark-300 rounded-lg text-sm hover:bg-dark-700">
                          Edit Slabs
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
