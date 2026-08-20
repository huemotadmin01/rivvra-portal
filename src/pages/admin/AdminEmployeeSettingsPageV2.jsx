// ============================================================================
// AdminEmployeeSettingsPageV2.jsx — platform employee configuration, on ds
// ============================================================================
//
// Route: /admin/settings/employee, inside <SuperAdminRoute><AdminLayout />.
//
// Three platform-wide tables live here, and every tenant inherits them:
// employment types (which decide payroll mode, leave eligibility and whether
// someone is on attendance or ESS), separation reasons, and the per-country
// statutory ID fields with their validation regexes.
//
// ── This page is almost entirely render-resident ────────────────────────────
// Unlike every other page in this migration, there is very little standalone
// logic to splice: 11 of the state updates are written inline in the JSX, one
// per input. So the slices are small (options + the load/save shell) and the
// row editors were transcribed by hand — each immutable-update expression
// copied character for character and then asserted by string count, because a
// byte-diff cannot reach them.
//
// ── Carried across unchanged, and each one matters ──────────────────────────
//   • `item.isSystem` gating. On a system row the KEY input is disabled and
//     the delete button is disabled *and* short-circuits (`if (item.isSystem)
//     return;`) — belt and braces, because the key is the identifier every
//     employee record references.
//   • The deliberate asymmetry that `label` is NOT locked on a system row: you
//     may rename "Full Time" for display, but not re-key it.
//   • `payrollMode`'s null round-trip. The option value is the STRING 'null'
//     and the handler converts it back: `e.target.value === 'null' ? null :
//     e.target.value`. Get this wrong and "None (excluded)" starts writing the
//     string "null" as a payroll mode.
//   • `attendanceType` defaulting to `'full_time'` on read, and `pattern`
//     writing `e.target.value || null` so a cleared regex becomes null rather
//     than an empty string that would match nothing.
//
// ── Structural note (as phases 30, 34, 35, 36) ─────────────────────────────
// `PageSwitch` cannot gate `/admin/*` — outside `OrgProvider`, and `useOrg()`
// throws there. Ships directly; legacy kept unreferenced. Pins
// `data-theme="dark"` to match the AdminLayout shell.
//
// Not triggered: save employment types, save reasons, save ID fields.
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Loader2, Save, AlertCircle, CheckCircle, Plus, Trash2, Lock,
  Users, ClipboardList, Globe,
} from 'lucide-react';
import { getPlatformSetting, updatePlatformSetting } from '../../utils/payrollApi';
import {
  Button, Chip, Callout, Accordion, Checkbox,
  Input, Select, Spinner,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const colHead = { font: "550 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const cellInput = { height: 30, fontSize: 12 };
const monoInput = { ...cellInput, font: "450 12px/1.4 ui-monospace, SFMono-Regular, monospace" };

// ds `Accordion` is controlled; legacy's `Section` owned its own open state and
// each section opened independently. This keeps that rather than lifting three
// booleans into the page.
function Section({ title, icon, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Accordion
      icon={icon}
      open={open}
      onToggle={() => setOpen(!open)}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {title}
          {badge && <Chip tone="warn">{badge}</Chip>}
        </span>
      }
    >
      {children}
    </Accordion>
  );
}

/** A locked system row shows the padlock; a custom row keeps the same gutter so
 *  the columns do not shift between them. */
function SystemLock({ isSystem }) {
  return isSystem
    ? <Lock size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
    : <span style={{ width: 12, flexShrink: 0 }} />;
}

/** "Not configured" is the same message in all three sections. */
function NotConfigured() {
  return <p style={{ ...microStyle, padding: '16px 0' }}>Not configured. Run migration from Payroll Config page.</p>;
}

const PAYROLL_MODE_OPTIONS = [
  { value: 'statutory', label: 'Statutory' },
  { value: 'consultant_flat_tds', label: 'Flat TDS' },
  { value: 'intern_no_deduction', label: 'No Deductions' },
  { value: null, label: 'None (excluded)' },
];

const ATTENDANCE_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full Time (Attendance)' },
  { value: 'timesheet', label: 'ESS' },
];

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminEmployeeSettingsPageV2() {
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
      <div data-theme="dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Spinner size={28} />
      </div>
    );
  }

  const empGrid = { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) 40px', gap: 10, alignItems: 'center', minWidth: 620 };
  const idGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) 40px', gap: 10, alignItems: 'center', minWidth: 560 };

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute, so without this the page inherits
  // whatever a previous org-app visit left on <html>.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1024, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          Employee Configuration
        </h1>
        <p style={{ ...microStyle, marginTop: 4, fontSize: 12.5 }}>Platform-wide settings for employee management</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger" icon={<AlertCircle size={16} />}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError('')} aria-label="Dismiss error">×</Button>
            </span>
          </Callout>
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="brand" icon={<CheckCircle size={16} />}>{success}</Callout>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {/* ── Employment Types ────────────────────────────────────────────── */}
        <Section
          title="Employment Types"
          icon={<Users size={18} />}
          defaultOpen
          badge={empTypes?.items ? `${empTypes.items.length} types` : '0'}
        >
          <div style={{ display: 'grid', gap: 16, overflowX: 'auto' }}>
            <p style={microStyle}>
              Define employment types with their payroll mode, leave eligibility, and attendance tracking method.
              System types (locked) cannot be removed.
            </p>

            {empTypes?.items ? (
              <>
                <div style={{ ...empGrid, padding: '0 4px' }}>
                  <span style={colHead}>Key</span>
                  <span style={colHead}>Label</span>
                  <span style={colHead}>Payroll Mode</span>
                  <span style={{ ...colHead, textAlign: 'center' }}>Leave Eligible</span>
                  <span style={colHead}>Attendance</span>
                  <span />
                </div>

                {empTypes.items.map((item, idx) => (
                  <div key={idx} style={empGrid}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <SystemLock isSystem={item.isSystem} />
                      <Input value={item.key} disabled={item.isSystem}
                        aria-label={`Employment type ${idx + 1} key`}
                        onChange={e => {
                          const updated = [...empTypes.items];
                          updated[idx] = { ...updated[idx], key: e.target.value };
                          setEmpTypes({ ...empTypes, items: updated });
                        }}
                        style={monoInput} />
                    </div>
                    {/* label is editable even on a system row — display text,
                        not the identifier. */}
                    <Input value={item.label}
                      aria-label={`Employment type ${idx + 1} label`}
                      onChange={e => {
                        const updated = [...empTypes.items];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setEmpTypes({ ...empTypes, items: updated });
                      }}
                      style={cellInput} />
                    {/* The 'null' option round-trips as the STRING 'null' and is
                        converted back here. */}
                    <Select value={item.payrollMode ?? 'null'}
                      aria-label={`Employment type ${idx + 1} payroll mode`}
                      onChange={e => {
                        const updated = [...empTypes.items];
                        updated[idx] = { ...updated[idx], payrollMode: e.target.value === 'null' ? null : e.target.value };
                        setEmpTypes({ ...empTypes, items: updated });
                      }}
                      style={cellInput}>
                      {PAYROLL_MODE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </Select>
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      <Checkbox checked={item.leaveEligible || false}
                        label={`Leave eligible for ${item.label || item.key || `type ${idx + 1}`}`}
                        onChange={next => {
                          const updated = [...empTypes.items];
                          updated[idx] = { ...updated[idx], leaveEligible: next };
                          setEmpTypes({ ...empTypes, items: updated });
                        }} />
                    </span>
                    <Select value={item.attendanceType || 'full_time'}
                      aria-label={`Employment type ${idx + 1} attendance`}
                      onChange={e => {
                        const updated = [...empTypes.items];
                        updated[idx] = { ...updated[idx], attendanceType: e.target.value };
                        setEmpTypes({ ...empTypes, items: updated });
                      }}
                      style={cellInput}>
                      {ATTENDANCE_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (item.isSystem) return;
                        setEmpTypes({ ...empTypes, items: empTypes.items.filter((_, i) => i !== idx) });
                      }}
                      disabled={item.isSystem}
                      aria-label={`Remove employment type ${item.label || idx + 1}`}
                      style={{ color: 'var(--danger)', justifySelf: 'end' }}
                      iconLeft={<Trash2 size={16} />}
                    />
                  </div>
                ))}

                <div>
                  <Button variant="ghost" size="sm" iconLeft={<Plus size={14} />} onClick={() => {
                    setEmpTypes({
                      ...empTypes,
                      items: [...empTypes.items, {
                        key: '', label: '', payrollMode: 'statutory',
                        leaveEligible: false, attendanceType: 'full_time', isSystem: false,
                      }],
                    });
                  }}>
                    Add Custom Type
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                  <Button onClick={() => saveCategory('employment_types', empTypes)} disabled={saving}
                    iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                    Save Employment Types
                  </Button>
                </div>
              </>
            ) : <NotConfigured />}
          </div>
        </Section>

        {/* ── Separation Reasons ─────────────────────────────────────────── */}
        <Section
          title="Separation Reasons"
          icon={<ClipboardList size={18} />}
          badge={sepReasons?.items ? `${sepReasons.items.length} reasons` : '0'}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <p style={microStyle}>
              Default reasons for employee separation. System reasons cannot be removed. Tenants can add their own.
            </p>

            {sepReasons?.items ? (
              <>
                <div style={{ display: 'grid', gap: 8 }}>
                  {sepReasons.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <SystemLock isSystem={item.isSystem} />
                      <Input value={item.label}
                        aria-label={`Separation reason ${idx + 1} label`}
                        onChange={e => {
                          const updated = [...sepReasons.items];
                          updated[idx] = { ...updated[idx], label: e.target.value };
                          setSepReasons({ ...sepReasons, items: updated });
                        }}
                        style={{ ...cellInput, flex: 1 }} />
                      <Input value={item.key} disabled={item.isSystem}
                        aria-label={`Separation reason ${idx + 1} key`}
                        onChange={e => {
                          const updated = [...sepReasons.items];
                          updated[idx] = { ...updated[idx], key: e.target.value };
                          setSepReasons({ ...sepReasons, items: updated });
                        }}
                        style={{ ...monoInput, width: 160, flexShrink: 0 }} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (item.isSystem) return;
                          setSepReasons({ ...sepReasons, items: sepReasons.items.filter((_, i) => i !== idx) });
                        }}
                        disabled={item.isSystem}
                        aria-label={`Remove separation reason ${item.label || idx + 1}`}
                        style={{ color: 'var(--danger)' }}
                        iconLeft={<Trash2 size={16} />}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <Button variant="ghost" size="sm" iconLeft={<Plus size={14} />} onClick={() => {
                    setSepReasons({
                      ...sepReasons,
                      items: [...sepReasons.items, { key: '', label: '', isSystem: false }],
                    });
                  }}>
                    Add Reason
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button onClick={() => saveCategory('separation_reasons', sepReasons)} disabled={saving}
                    iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                    Save Reasons
                  </Button>
                </div>
              </>
            ) : <NotConfigured />}
          </div>
        </Section>

        {/* ── Country ID Fields ──────────────────────────────────────────── */}
        <Section title="Country ID Fields" icon={<Globe size={18} />} badge="India">
          <div style={{ display: 'grid', gap: 16, overflowX: 'auto' }}>
            <p style={microStyle}>
              Configure statutory ID fields per country. Currently active: India (IN).
              More countries can be added in the future.
            </p>

            {idSchemas?.schemas?.IN ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>India (IN)</span>
                  <Chip tone="brand">Active</Chip>
                </div>

                <div style={{ ...idGrid, padding: '0 4px' }}>
                  <span style={colHead}>Key</span>
                  <span style={colHead}>Label</span>
                  <span style={colHead}>Pattern (Regex)</span>
                  <span style={{ ...colHead, textAlign: 'center' }}>Required</span>
                  <span />
                </div>

                {idSchemas.schemas.IN.fields.map((field, idx) => (
                  <div key={idx} style={idGrid}>
                    <Input value={field.key}
                      aria-label={`ID field ${idx + 1} key`}
                      onChange={e => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields[idx] = { ...field, key: e.target.value };
                        setIdSchemas({ ...updated });
                      }}
                      style={monoInput} />
                    <Input value={field.label}
                      aria-label={`ID field ${idx + 1} label`}
                      onChange={e => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields[idx] = { ...field, label: e.target.value };
                        setIdSchemas({ ...updated });
                      }}
                      style={cellInput} />
                    {/* A cleared pattern writes null, not '' — an empty regex
                        would match nothing rather than mean "no pattern". */}
                    <Input value={field.pattern || ''} placeholder="No pattern"
                      aria-label={`ID field ${idx + 1} pattern`}
                      onChange={e => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields[idx] = { ...field, pattern: e.target.value || null };
                        setIdSchemas({ ...updated });
                      }}
                      style={monoInput} />
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      <Checkbox checked={field.required || false}
                        label={`${field.label || field.key || `Field ${idx + 1}`} required`}
                        onChange={next => {
                          const updated = { ...idSchemas };
                          updated.schemas.IN.fields[idx] = { ...field, required: next };
                          setIdSchemas({ ...updated });
                        }} />
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = { ...idSchemas };
                        updated.schemas.IN.fields = updated.schemas.IN.fields.filter((_, i) => i !== idx);
                        setIdSchemas({ ...updated });
                      }}
                      aria-label={`Remove ID field ${field.label || idx + 1}`}
                      style={{ color: 'var(--danger)', justifySelf: 'end' }}
                      iconLeft={<Trash2 size={16} />}
                    />
                  </div>
                ))}

                <div>
                  <Button variant="ghost" size="sm" iconLeft={<Plus size={14} />} onClick={() => {
                    const updated = { ...idSchemas };
                    updated.schemas.IN.fields = [...updated.schemas.IN.fields, { key: '', label: '', pattern: null, required: false }];
                    setIdSchemas({ ...updated });
                  }}>
                    Add Field
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button onClick={() => saveCategory('id_field_schemas', idSchemas)} disabled={saving}
                    iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                    Save ID Fields
                  </Button>
                </div>
              </>
            ) : <NotConfigured />}
          </div>
        </Section>
      </div>
    </div>
  );
}

export default AdminEmployeeSettingsPageV2;
