import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getStatutoryConfigs, updateStatutoryConfig, getPTStates } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Shield, Search, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, Input, Select, Modal, Callout, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Per-employee PF / ESI / PT / tax-regime — read by every payroll run. Logic
// above `return (` is spliced in verbatim, and that matters more here than
// usual because of one deliberate exception to the house rule:
//
//   esiDisabilityCeiling: s.esiDisabilityCeiling === true
//
// NOT `?? true`. The rule elsewhere is that a policy checkbox defaults on, but
// this flag raises the ESI wage ceiling from ₹21,000 to ₹25,000 — defaulting it
// on would start deducting ESI from employees earning ₹21K–₹25K who are not
// entitled to it. The legacy comment says so; both survive byte-identical.
//
// Dual-use, like PT Master: a /payroll/statutory-config route AND the
// `statutory` tab in SettingsPayroll. Both switch on the shared PageSwitch.
// ─────────────────────────────────────────────────────────────────────────────

/** Small status pill. Kept at module scope for the reason legacy gives: a
 *  component declared in the render body is a new type every render, which
 *  remounts it and would drop focus from any input it holds. */
function StatusBadge({ enabled, label, title }) {
  return (
    <span title={title}>
      <Chip tone={enabled ? 'brand' : 'neutral'}>
        {enabled ? <CheckCircle size={10} /> : <XCircle size={10} />} {label}
      </Chip>
    </span>
  );
}

// Client-side filters over already-loaded rows — no extra API calls.
const FILTERS = [
  { key: 'all', label: 'All employees' },
  { key: 'pf', label: 'PF applicable' },
  { key: 'noPf', label: 'PF not applicable' },
  { key: 'esi', label: 'ESI applicable' },
  { key: 'stopped', label: 'Salary processing stopped' },
];

/** Read-only row inside the "From Employee Record" block. */
function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, font: "400 11.5px/1.4 'Inter', system-ui, sans-serif" }}>
      <span style={{ color: 'var(--fg-4)' }}>{label}</span>
      <span style={{ color: 'var(--fg-2)' }}>{value}</span>
    </div>
  );
}

/** Checkbox + label + helper text, the shape this form uses eight times. */
function CheckRow({ checked, onChange, title, help, titleStyle }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 2, accentColor: 'var(--brand)', flexShrink: 0 }}
      />
      <span style={{ font: "400 13px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', ...(titleStyle || {}) }}>
        {title}
        {help && (
          <span style={{ display: 'block', font: "400 11px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>
            {help}
          </span>
        )}
      </span>
    </label>
  );
}

/** Section heading inside the edit dialog. */
function Legend({ children }) {
  return (
    <div style={{
      font: "500 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
      borderBottom: '1px solid var(--line-2)', paddingBottom: 6, marginBottom: 10,
    }}>{children}</div>
  );
}

export default function StatutoryConfigPageV2({ embedded = false }) {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [data, setData] = useState([]);
  const [ptStates, setPtStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({});
  // In-flight guard — this writes PF/ESI/PT/tax-regime for an employee.
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setData([]);
    setPtStates([]);
    try {
      const [res, stRes] = await Promise.all([
        getStatutoryConfigs(orgSlug),
        getPTStates(orgSlug),
      ]);
      setData(res.data || []);
      setPtStates(stRes.states || []);
    } catch (err) { showToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id]);

  const openEdit = (item) => {
    const s = item.statutory || {};
    setForm({
      pfEnabled: s.pfEnabled ?? true,
      pfCappedAt15K: s.pfCappedAt15K ?? true,
      esiEnabled: s.esiEnabled || false,
      // Deliberately NOT the platform's `?? true` policy default. This raises
      // the ESI wage ceiling from ₹21,000 to ₹25,000, and defaulting it on
      // would start deducting ESI from employees earning ₹21K–₹25K who are not
      // entitled to the higher ceiling. Absent value must mean off.
      esiDisabilityCeiling: s.esiDisabilityCeiling === true,
      ptEnabled: s.ptEnabled ?? true,
      ptState: s.ptState || 'MH',
      taxRegime: s.taxRegime || 'new',
      stopSalaryProcessing: s.stopSalaryProcessing || false,
    });
    setEditing(item);
  };

  const handleSave = async () => {
    if (saving || !editing?.employee?._id) return;
    setSaving(true);
    try {
      await updateStatutoryConfig(orgSlug, editing.employee._id, form);
      showToast('Updated');
      setEditing(null);
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const filtered = data.filter(d => {
    const s = d.statutory || {};
    // Mirror the same policy defaults the edit form uses (?? true), so the
    // filter agrees with what the row badges show.
    const pfOn = s.pfEnabled ?? true;
    if (filter === 'pf' && !pfOn) return false;
    if (filter === 'noPf' && pfOn) return false;
    if (filter === 'esi' && !(s.esiEnabled || false)) return false;
    if (filter === 'stopped' && !(s.stopSalaryProcessing || false)) return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const e = d.employee || {};
    return [e.fullName, e.name, e.email, e.employeeId, e.employeeCode, e.code]
      .some(v => (v || '').toString().toLowerCase().includes(q));
  });

  if (loading) return <PageSpinner label="Loading statutory settings for every employee…" />;

  // Helper to get employee-level data
  const getPan = (item) => item.employee?.bankDetails?.pan || item.employee?.statutory?.pan || '-';
  const getBank = (item) => {
    const b = item.employee?.bankDetails;
    if (!b?.bankName && !b?.accountNumber) return '-';
    return b.bankName || 'Set';
  };

  const th = {
    padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap',
    font: "500 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
  };
  const td = { padding: '10px 14px', textAlign: 'center', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

  return (
    <div style={embedded ? {} : { maxWidth: 1100, margin: '0 auto' }}>
      {!embedded && (
        <PageHeader
          title="Statutory Configuration"
          sub="Per-employee Provident Fund (PF), Employee State Insurance (ESI), Professional Tax (PT) and income-tax regime used by every payroll run"
        />
      )}

      {/* Search + filters — both operate on the rows already loaded */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 290 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email or employee code…"
            aria-label="Search employees"
            style={{ paddingLeft: 30 }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {FILTERS.map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'primary' : 'secondary'}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
          {filtered.length} of {data.length} employee{data.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Panel flush>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Employee</th>
                <th style={th} title="Provident Fund — deducted from the employee and matched by the employer">Provident&nbsp;Fund</th>
                <th style={th} title="Employee State Insurance — medical cover for employees under the wage ceiling">ESI&nbsp;(insurance)</th>
                <th style={th} title="Professional Tax — a state levy; the state decides the slab">Professional&nbsp;Tax</th>
                <th style={th} title="Income-tax regime used when computing TDS">Tax&nbsp;Regime</th>
                <th style={th} title="Permanent Account Number, from the employee record">PAN</th>
                <th style={th} title="Salary bank account, from the employee record">Salary&nbsp;Bank</th>
                <th style={{ ...th, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const s = item.statutory || {};
                // Same `?? true` policy defaults as the edit form, so the row
                // never claims PF/PT is off when the record simply has no
                // explicit value stored yet.
                const pfOn = s.pfEnabled ?? true;
                const ptOn = s.ptEnabled ?? true;
                return (
                  <tr key={item.employee._id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                          {item.employee.fullName || item.employee.name || item.employee.email}
                        </span>
                        {s.stopSalaryProcessing && (
                          <span title="Excluded from payroll runs"><Chip tone="danger">Salary on hold</Chip></span>
                        )}
                      </div>
                      <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 3 }}>
                        {item.employee.email}
                      </div>
                    </td>
                    <td style={td}><StatusBadge enabled={pfOn} label={pfOn ? 'Applicable' : 'Not applicable'} title="Provident Fund" /></td>
                    <td style={td}>
                      <StatusBadge enabled={s.esiEnabled || false} label={s.esiEnabled ? 'Applicable' : 'Not applicable'} title="Employee State Insurance" />
                      {/* Explicit `=== true`, not `?? true` — an unset flag means
                          the standard ₹21,000 ceiling. See openEdit(). Only shown
                          when ESI is actually on, because the ceiling is
                          meaningless otherwise. */}
                      {(s.esiEnabled || false) && s.esiDisabilityCeiling === true && (
                        <span
                          style={{ display: 'block', marginTop: 4, font: "400 10px/1.3 'Inter', system-ui, sans-serif", color: 'var(--acc-blue)' }}
                          title="Higher ESI wage ceiling of ₹25,000/month applied (ESI Act provision for employees with disability) instead of the standard ₹21,000">
                          ₹25,000 ceiling
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {ptOn
                        ? <span style={{ color: 'var(--fg-2)' }}>{s.ptState || 'MH'} slab</span>
                        : <span style={{ color: 'var(--fg-4)' }}>Not applicable</span>}
                    </td>
                    <td style={td}>
                      <Chip tone={s.taxRegime === 'old' ? 'warn' : 'info'}>
                        {s.taxRegime === 'old' ? 'Old regime' : 'New regime'}
                      </Chip>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{getPan(item)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{getBank(item)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          data.length === 0 ? (
            <EmptyState
              title="No employees to configure yet"
            >
              {"Statutory settings appear here once employees exist for this company. Add employees in the Employee app and they will show up with the default PF, PT and New-regime settings."}
            </EmptyState>
          ) : (
            <EmptyState
              title="No employee matches your search or filter"
              actions={<Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilter('all'); }}>Clear search and filters</Button>}
            />
          )
        )}
      </Panel>

      {/* ── Edit dialog — only payroll-specific settings ── */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="md"
        icon={<Shield size={18} />}
        title="Statutory Config"
        sub={editing ? (editing.employee.fullName || editing.employee.email) : undefined}
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}
              iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </>
        )}
      >
        {editing && (
          <div style={{ display: 'grid', gap: 18 }}>

            {/* Employee data (read-only) */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2)', padding: 12, display: 'grid', gap: 6 }}>
              <p style={{
                font: "500 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
                textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px',
              }}>From Employee Record</p>
              <InfoRow label="PAN" value={getPan(editing)} />
              <InfoRow label="UAN" value={editing.employee?.statutory?.uan || '-'} />
              <InfoRow label="ESI Number" value={editing.employee?.statutory?.esicNumber || '-'} />
              <InfoRow label="Bank" value={editing.employee?.bankDetails?.bankName || '-'} />
              <InfoRow label="Account" value={editing.employee?.bankDetails?.accountNumber ? '••••' + editing.employee.bankDetails.accountNumber.slice(-4) : '-'} />
              <InfoRow label="IFSC" value={editing.employee?.bankDetails?.ifsc || '-'} />
            </div>

            {/* PF */}
            <div style={{ display: 'grid', gap: 10 }}>
              <Legend>Provident Fund (PF)</Legend>
              <CheckRow
                checked={form.pfEnabled}
                onChange={e => setForm(f => ({ ...f, pfEnabled: e.target.checked }))}
                title="Deduct PF for this employee"
                help="Employee contribution is deducted from salary and the employer share is added to cost."
              />
              <CheckRow
                checked={form.pfCappedAt15K}
                onChange={e => setForm(f => ({ ...f, pfCappedAt15K: e.target.checked }))}
                title="Cap PF wages at ₹15,000/month"
                help="The statutory ceiling. Leave ticked unless you know this employee must contribute on full Basic."
              />
              {form.pfEnabled && !form.pfCappedAt15K && (
                <Callout tone="warn">
                  ⚠️ PF will be calculated on the full Basic salary, not capped at ₹15,000. Employer cost rises significantly. Only uncheck this if the employee was never a PF member at any prior employer AND their Basic exceeds ₹15K. Most employees should stay capped.
                </Callout>
              )}
            </div>

            {/* ESI */}
            <div style={{ display: 'grid', gap: 10 }}>
              <Legend>Employee State Insurance (ESI)</Legend>
              <CheckRow
                checked={form.esiEnabled}
                onChange={e => setForm(f => ({ ...f, esiEnabled: e.target.checked }))}
                title="Deduct ESI for this employee"
                help="Applies only to employees earning at or below the ESI wage ceiling (₹21,000/month gross by default)."
              />
              <CheckRow
                checked={form.esiDisabilityCeiling}
                onChange={e => setForm(f => ({ ...f, esiDisabilityCeiling: e.target.checked }))}
                titleStyle={form.esiEnabled ? undefined : { color: 'var(--fg-4)' }}
                title="Apply the higher ESI wage ceiling (₹25,000) — for employees with disability under the ESI Act"
                help="The ESI Act sets a ceiling of ₹25,000/month instead of the standard ₹21,000 for employees with disability. With this on, an employee earning between ₹21,000 and ₹25,000 gross stays ESI-eligible (0.75% employee, 3.25% employer) instead of falling out of scope. Leave off unless the employee is entitled to it."
              />
              {!form.esiEnabled && form.esiDisabilityCeiling && (
                <Callout>
                  No effect right now — ESI is switched off for this employee, so no ceiling is applied at all. Tick “Deduct ESI” above for this to do anything.
                </Callout>
              )}
              <p style={{ font: "400 11px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                ESI is only computed for confirmed employees included in a payroll run.
              </p>
            </div>

            {/* PT */}
            <div style={{ display: 'grid', gap: 10 }}>
              <Legend>Professional Tax (PT)</Legend>
              <CheckRow
                checked={form.ptEnabled}
                onChange={e => setForm(f => ({ ...f, ptEnabled: e.target.checked }))}
                title="Deduct Professional Tax for this employee"
                help="A state levy. Some states do not charge it at all."
              />
              <div>
                <label htmlFor="sc-ptstate" style={{ display: 'block', font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 5 }}>
                  State whose PT slab applies (usually the work location)
                </label>
                <Select id="sc-ptstate" value={form.ptState} onChange={e => setForm(f => ({ ...f, ptState: e.target.value }))}>
                  {ptStates.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                </Select>
              </div>
            </div>

            {/* Tax regime */}
            <div style={{ display: 'grid', gap: 10 }}>
              <Legend>Income-tax regime (used for TDS)</Legend>
              <div style={{ display: 'flex', gap: 18 }}>
                {[['new', 'New regime'], ['old', 'Old regime']].map(([value, label]) => (
                  <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
                    <input
                      type="radio"
                      name="regime"
                      value={value}
                      checked={form.taxRegime === value}
                      onChange={() => setForm(f => ({ ...f, taxRegime: value }))}
                      style={{ accentColor: 'var(--brand)' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p style={{ font: "400 11px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                The employee's declared choice for the year. It changes the slabs and deductions used to compute monthly TDS.
              </p>
            </div>

            {/* Payroll processing */}
            <div style={{ display: 'grid', gap: 10 }}>
              <Legend>Payroll processing</Legend>
              <CheckRow
                checked={form.stopSalaryProcessing}
                onChange={e => setForm(f => ({ ...f, stopSalaryProcessing: e.target.checked }))}
                titleStyle={form.stopSalaryProcessing ? { color: 'var(--danger)' } : undefined}
                title="Hold salary — skip this employee in payroll runs"
                help="Use for absconding, unpaid-leave or dispute cases. No payslip is generated while this is on."
              />
              {form.stopSalaryProcessing && (
                <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: 0 }}>
                  This employee will be excluded from every payroll run until you untick this.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
