import { useState, useEffect } from 'react';
import {
  Loader2, Save, AlertCircle, CheckCircle, Plus, Trash2, Lock,
  Users, ClipboardList, Globe, ChevronDown, ChevronRight
} from 'lucide-react';
import { getPlatformSetting, updatePlatformSetting } from '../../utils/payrollApi';

// ── Collapsible Section Component ──────────────────────────────────────────
function Section({ title, icon: Icon, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-dark-800/30 transition-colors"
      >
        <Icon className="w-5 h-5 text-amber-400" />
        <span className="text-base font-semibold text-white flex-1 text-left">{title}</span>
        {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{badge}</span>}
        {open ? <ChevronDown className="w-4 h-4 text-dark-400" /> : <ChevronRight className="w-4 h-4 text-dark-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-dark-800/50">{children}</div>}
    </div>
  );
}

const PAYROLL_MODE_OPTIONS = [
  { value: 'statutory', label: 'Statutory' },
  { value: 'consultant_flat_tds', label: 'Flat TDS' },
  { value: 'intern_no_deduction', label: 'No Deductions' },
  { value: null, label: 'None (excluded)' },
];

const ATTENDANCE_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full Time (Attendance)' },
  { value: 'timesheet', label: 'Timesheet' },
];

function AdminEmployeeSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [empTypes, setEmpTypes] = useState(null);
  const [sepReasons, setSepReasons] = useState(null);
  const [idSchemas, setIdSchemas] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [empRes, sepRes, idRes] = await Promise.all([
        getPlatformSetting('employment_types').catch(() => null),
        getPlatformSetting('separation_reasons').catch(() => null),
        getPlatformSetting('id_field_schemas').catch(() => null),
      ]);
      if (empRes?.setting) setEmpTypes(empRes.setting);
      if (sepRes?.setting) setSepReasons(sepRes.setting);
      if (idRes?.setting) setIdSchemas(idRes.setting);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const saveCategory = async (category, data) => {
    try {
      setSaving(true);
      setError('');
      await updatePlatformSetting(category, data);
      showSuccess(`${category.replace('_', ' ')} saved successfully`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Employee Configuration</h1>
        <p className="text-dark-400 mt-1">Platform-wide settings for employee management</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-200">x</button>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      <div className="space-y-4">
        {/* ── Employment Types ────────────────────────────────────────────── */}
        <Section title="Employment Types" icon={Users} defaultOpen={true}
          badge={empTypes?.items ? `${empTypes.items.length} types` : '0'}>
          <div className="mt-4 space-y-4">
            <p className="text-xs text-dark-400">
              Define employment types with their payroll mode, leave eligibility, and attendance tracking method.
              System types (locked) cannot be removed.
            </p>

            {empTypes?.items ? (
              <>
                {/* Header */}
                <div className="grid grid-cols-6 gap-3 text-xs font-medium text-dark-400 px-1">
                  <span>Key</span>
                  <span>Label</span>
                  <span>Payroll Mode</span>
                  <span>Leave Eligible</span>
                  <span>Attendance</span>
                  <span></span>
                </div>

                {empTypes.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-6 gap-3 items-center">
                    <div className="flex items-center gap-1.5">
                      {item.isSystem && <Lock className="w-3 h-3 text-dark-500 flex-shrink-0" />}
                      <input value={item.key} disabled={item.isSystem}
                        onChange={e => {
                          const updated = [...empTypes.items];
                          updated[idx] = { ...updated[idx], key: e.target.value };
                          setEmpTypes({ ...empTypes, items: updated });
                        }}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-50 font-mono" />
                    </div>
                    <input value={item.label}
                      onChange={e => {
                        const updated = [...empTypes.items];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setEmpTypes({ ...empTypes, items: updated });
                      }}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                    <select value={item.payrollMode ?? 'null'}
                      onChange={e => {
                        const updated = [...empTypes.items];
                        updated[idx] = { ...updated[idx], payrollMode: e.target.value === 'null' ? null : e.target.value };
                        setEmpTypes({ ...empTypes, items: updated });
                      }}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white">
                      {PAYROLL_MODE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                    <label className="flex items-center justify-center cursor-pointer">
                      <input type="checkbox" checked={item.leaveEligible || false}
                        onChange={e => {
                          const updated = [...empTypes.items];
                          updated[idx] = { ...updated[idx], leaveEligible: e.target.checked };
                          setEmpTypes({ ...empTypes, items: updated });
                        }}
                        className="rounded bg-dark-800 border-dark-700 text-amber-500" />
                    </label>
                    <select value={item.attendanceType || 'full_time'}
                      onChange={e => {
                        const updated = [...empTypes.items];
                        updated[idx] = { ...updated[idx], attendanceType: e.target.value };
                        setEmpTypes({ ...empTypes, items: updated });
                      }}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white">
                      {ATTENDANCE_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (item.isSystem) return;
                        setEmpTypes({ ...empTypes, items: empTypes.items.filter((_, i) => i !== idx) });
                      }}
                      disabled={item.isSystem}
                      className="text-red-400 hover:text-red-300 p-1 disabled:opacity-20 disabled:cursor-not-allowed justify-self-end"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button onClick={() => {
                  setEmpTypes({
                    ...empTypes,
                    items: [...empTypes.items, {
                      key: '', label: '', payrollMode: 'statutory',
                      leaveEligible: false, attendanceType: 'full_time', isSystem: false,
                    }],
                  });
                }} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300">
                  <Plus className="w-3.5 h-3.5" /> Add Custom Type
                </button>

                <div className="flex justify-end pt-2">
                  <button onClick={() => saveCategory('employment_types', empTypes)} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-dark-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Employment Types
                  </button>
                </div>
              </>
            ) : (
              <p className="text-dark-400 text-sm py-4">Not configured. Run migration from Payroll Config page.</p>
            )}
          </div>
        </Section>

        {/* ── Separation Reasons ─────────────────────────────────────────── */}
        <Section title="Separation Reasons" icon={ClipboardList}
          badge={sepReasons?.items ? `${sepReasons.items.length} reasons` : '0'}>
          <div className="mt-4 space-y-4">
            <p className="text-xs text-dark-400">
              Default reasons for employee separation. System reasons cannot be removed. Tenants can add their own.
            </p>

            {sepReasons?.items ? (
              <>
                <div className="space-y-2">
                  {sepReasons.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      {item.isSystem && <Lock className="w-3.5 h-3.5 text-dark-500 flex-shrink-0" />}
                      {!item.isSystem && <div className="w-3.5" />}
                      <input value={item.label}
                        onChange={e => {
                          const updated = [...sepReasons.items];
                          updated[idx] = { ...updated[idx], label: e.target.value };
                          setSepReasons({ ...sepReasons, items: updated });
                        }}
                        className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white" />
                      <input value={item.key} disabled={item.isSystem}
                        onChange={e => {
                          const updated = [...sepReasons.items];
                          updated[idx] = { ...updated[idx], key: e.target.value };
                          setSepReasons({ ...sepReasons, items: updated });
                        }}
                        className="w-40 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-xs text-dark-400 font-mono disabled:opacity-50" />
                      <button
                        onClick={() => {
                          if (item.isSystem) return;
                          setSepReasons({ ...sepReasons, items: sepReasons.items.filter((_, i) => i !== idx) });
                        }}
                        disabled={item.isSystem}
                        className="text-red-400 hover:text-red-300 p-1 disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button onClick={() => {
                  setSepReasons({
                    ...sepReasons,
                    items: [...sepReasons.items, { key: '', label: '', isSystem: false }],
                  });
                }} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300">
                  <Plus className="w-3.5 h-3.5" /> Add Reason
                </button>

                <div className="flex justify-end">
                  <button onClick={() => saveCategory('separation_reasons', sepReasons)} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-dark-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Reasons
                  </button>
                </div>
              </>
            ) : (
              <p className="text-dark-400 text-sm py-4">Not configured. Run migration from Payroll Config page.</p>
            )}
          </div>
        </Section>

        {/* ── Country ID Fields ──────────────────────────────────────────── */}
        <Section title="Country ID Fields" icon={Globe} badge="India">
          <div className="mt-4 space-y-4">
            <p className="text-xs text-dark-400">
              Configure statutory ID fields per country. Currently active: India (IN).
              More countries can be added in the future.
            </p>

            {idSchemas?.schemas?.IN ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-white">India (IN)</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                </div>

                <div className="grid grid-cols-5 gap-3 text-xs font-medium text-dark-400 px-1">
                  <span>Key</span><span>Label</span><span>Pattern (Regex)</span><span>Required</span><span></span>
                </div>

                {idSchemas.schemas.IN.fields.map((field, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-3 items-center">
                    <input value={field.key}
                      onChange={e => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields[idx] = { ...field, key: e.target.value };
                        setIdSchemas({ ...updated });
                      }}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono" />
                    <input value={field.label}
                      onChange={e => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields[idx] = { ...field, label: e.target.value };
                        setIdSchemas({ ...updated });
                      }}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                    <input value={field.pattern || ''} placeholder="No pattern"
                      onChange={e => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields[idx] = { ...field, pattern: e.target.value || null };
                        setIdSchemas({ ...updated });
                      }}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono placeholder:text-dark-500" />
                    <label className="flex items-center justify-center cursor-pointer">
                      <input type="checkbox" checked={field.required || false}
                        onChange={e => {
                          const updated = { ...idSchemas };
                          updated.schemas.IN.fields[idx] = { ...field, required: e.target.checked };
                          setIdSchemas({ ...updated });
                        }}
                        className="rounded bg-dark-800 border-dark-700 text-amber-500" />
                    </label>
                    <button onClick={() => {
                      const updated = { ...idSchemas };
                      updated.schemas.IN.fields = updated.schemas.IN.fields.filter((_, i) => i !== idx);
                      setIdSchemas({ ...updated });
                    }} className="text-red-400 hover:text-red-300 p-1 justify-self-end">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button onClick={() => {
                  const updated = { ...idSchemas };
                  updated.schemas.IN.fields = [...updated.schemas.IN.fields, { key: '', label: '', pattern: null, required: false }];
                  setIdSchemas({ ...updated });
                }} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300">
                  <Plus className="w-3.5 h-3.5" /> Add Field
                </button>

                <div className="flex justify-end">
                  <button onClick={() => saveCategory('id_field_schemas', idSchemas)} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-dark-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save ID Fields
                  </button>
                </div>
              </>
            ) : (
              <p className="text-dark-400 text-sm py-4">Not configured. Run migration from Payroll Config page.</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

export default AdminEmployeeSettingsPage;
