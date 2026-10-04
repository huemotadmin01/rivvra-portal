import { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, AlertCircle, RotateCcw, Users } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { getPfWageCeiling, updatePfWageCeiling, getPfWageCeilingImpact, getPayrollSettings, updatePayrollSettings } from '../../utils/payrollApi';
import { Panel, Chip, Button, Input, Select, Callout, EmptyState } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// PF Wage Ceiling — the effective-dated EPFO statutory wage ceiling.
//
// The ceiling caps EPF wages (for capped members), the EPS pensionable wage and
// the EDLI wage. Government revises it by notification with effect from a
// DATE, e.g. ₹15,000 → ₹25,000 w.e.f. 17-Sep-2026 (S.O. 5109(E)). Payroll runs
// pick the ceiling in force for each day of the wage month; a month that
// straddles a revision is computed per period and filed in one ECR.
//
// Until an org saves its own schedule it follows the platform default, so a
// revision shipped by Rivvra reaches it automatically. Saving here pins the
// org to its own list; "Reset to platform default" undoes that.
// ─────────────────────────────────────────────────────────────────────────────

const th = { padding: '10px 18px', font: "500 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const td = { padding: '12px 18px', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif" };
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const todayIso = () => {
  const ist = new Date(Date.now() + 330 * 60000);
  return ist.toISOString().slice(0, 10);
};

export default function PfWageCeilingTab() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    setImpact(null);
    try {
      const res = await getPfWageCeiling(orgSlug);
      setData(res);
      setRows((res.schedule || []).map(r => ({ ...r, wageCeiling: String(r.wageCeiling) })));
    } catch (err) {
      setLoadError(err?.response?.data?.message || err?.message || 'Failed to load PF wage ceiling');
    } finally {
      setLoading(false);
    }
  };

  const loadImpact = async () => {
    setImpactLoading(true);
    try {
      setImpact(await getPfWageCeilingImpact(orgSlug));
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to load impact report', 'error');
    } finally {
      setImpactLoading(false);
    }
  };

  const updateRow = (idx, field, value) => setRows(rs => rs.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const addRow = () => setRows(rs => [...rs, { effectiveFrom: '', wageCeiling: '', reference: '' }]);
  const removeRow = (idx) => setRows(rs => rs.filter((_, i) => i !== idx));

  const validate = () => {
    if (!rows.length) return 'Add at least one ceiling.';
    const seen = new Set();
    for (const [i, r] of rows.entries()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom || '')) return `Row ${i + 1}: pick an effective date.`;
      const c = Number(r.wageCeiling);
      if (!Number.isFinite(c) || c <= 0) return `Row ${i + 1}: ceiling must be greater than 0.`;
      if (seen.has(r.effectiveFrom)) return `Two rows share the date ${fmtDate(r.effectiveFrom)}.`;
      seen.add(r.effectiveFrom);
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) return showToast(err, 'error');
    setSaving(true);
    try {
      await updatePfWageCeiling(orgSlug, {
        schedule: rows.map(r => ({
          effectiveFrom: r.effectiveFrom,
          wageCeiling: Number(r.wageCeiling),
          ...(r.reference ? { reference: r.reference } : {}),
        })),
      });
      showToast('PF wage ceiling saved', 'success');
      load();
    } catch (e) {
      showToast(e?.response?.data?.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await updatePfWageCeiling(orgSlug, { resetToDefault: true });
      showToast('Now following the platform default', 'success');
      load();
    } catch (e) {
      showToast(e?.response?.data?.message || 'Failed to reset', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
      </div>
    );
  }
  if (loadError) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="danger" compact title={loadError}
          actions={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>} />
      </Panel>
    );
  }

  const today = todayIso();
  const sorted = [...rows].filter(r => r.effectiveFrom).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const inForceDate = sorted.filter(r => r.effectiveFrom <= today).pop()?.effectiveFrom;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Callout tone="info" icon={<AlertCircle size={16} />}>
        The EPFO wage ceiling caps <strong>EPF wages</strong> (for employees with “Cap PF wages at the statutory
        ceiling” ticked), the <strong>EPS pensionable wage</strong> and the <strong>EDLI wage</strong>. Each payroll
        run applies the ceiling in force on each day of the month — if a revision falls mid-month, contributions
        are calculated separately for the two periods and combined into one ECR.
      </Callout>

      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 6 }}>
          <span style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>Ceiling in force today</span>
          <span style={{ font: "700 16px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{inr(data?.currentCeiling)}</span>
          <Chip tone={data?.isCustom ? 'warn' : 'brand'}>{data?.isCustom ? 'Custom schedule' : 'Platform default'}</Chip>
          {data?.isCustom && data?.updatedBy && (
            <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Last changed by {data.updatedBy}
            </span>
          )}
        </div>
      </Panel>

      <Panel
        flush
        title="Wage ceiling schedule"
        actions={<Button variant="ghost" size="sm" onClick={addRow} iconLeft={<Plus size={14} />}>Add revision</Button>}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Effective from</th>
                <th style={{ ...th, textAlign: 'right' }}>Wage ceiling (₹ / month)</th>
                <th style={{ ...th, textAlign: 'left' }}>Notification / reference</th>
                <th style={{ ...th, width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--line-2)' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Input type="date" value={r.effectiveFrom} aria-label={`Row ${idx + 1} effective date`}
                        onChange={(e) => updateRow(idx, 'effectiveFrom', e.target.value)} style={{ width: 160 }} />
                      {r.effectiveFrom && r.effectiveFrom === inForceDate && <Chip tone="brand">In force</Chip>}
                      {r.effectiveFrom && r.effectiveFrom > today && <Chip tone="info">Upcoming</Chip>}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Input type="number" min="1" step="1" value={r.wageCeiling} aria-label={`Row ${idx + 1} wage ceiling`}
                      onChange={(e) => updateRow(idx, 'wageCeiling', e.target.value)}
                      style={{ width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                  </td>
                  <td style={td}>
                    <Input type="text" value={r.reference || ''} aria-label={`Row ${idx + 1} reference`}
                      onChange={(e) => updateRow(idx, 'reference', e.target.value)} placeholder="e.g. S.O. 5109(E) dated 17-Sep-2026" />
                  </td>
                  <td style={{ ...td, padding: '12px 10px' }}>
                    <Button variant="ghost" size="sm" onClick={() => removeRow(idx)} disabled={rows.length <= 1}
                      aria-label={`Remove row ${idx + 1}`} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Callout tone="warn" icon={<AlertCircle size={16} />}>
        Changes apply to payroll runs processed or re-processed after you save. Runs already processed keep their
        figures until re-processed. Changing a past date changes PF for every month after it.
      </Callout>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        {data?.isCustom && (
          <Button variant="secondary" onClick={handleReset} disabled={saving} iconLeft={<RotateCcw size={15} />}>
            Reset to platform default
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving}
          iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}>
          Save PF Wage Ceiling
        </Button>
      </div>

      <Panel
        flush
        title="Who the latest revision affects"
        actions={<Button variant="ghost" size="sm" onClick={loadImpact} disabled={impactLoading}
          iconLeft={impactLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}>
          {impact ? 'Refresh' : 'Check employees'}
        </Button>}
      >
        {!impact ? (
          <EmptyState compact title="Lists active confirmed employees whose PF changes with the latest saved revision." />
        ) : !impact.revision ? (
          <EmptyState compact title="The schedule has no revision to compare against." />
        ) : (
          <div style={{ display: 'grid', gap: 0 }}>
            <p style={{ ...td, margin: 0, color: 'var(--fg-3)' }}>
              {inr(impact.revision.fromCeiling)} → {inr(impact.revision.toCeiling)} from {fmtDate(impact.revision.effectiveFrom)}.
              Figures are full-month, based on current CTC; the revision month itself is split by days.
            </p>
            <ImpactTable
              title={`PF rises — capped members with PF wage above ${inr(impact.revision.fromCeiling)} (${impact.cappedMembers.length})`}
              rows={impact.cappedMembers}
              cols={[
                ['PF wage', r => inr(r.pfWage)],
                ['Employee PF before', r => inr(r.employeePfBefore)],
                ['Employee PF after', r => inr(r.employeePfAfter)],
                ['Increase (each of employee & employer)', r => `+${inr(r.monthlyIncrease)}`],
              ]}
            />
            <ImpactTable
              title={`Must be enrolled — PF off, PF wage within ${inr(impact.revision.toCeiling)} (${impact.notCovered.length})`}
              hint={`Turn PF on in Statutory Config and set "PF applies from" to ${fmtDate(impact.revision.effectiveFrom)} so only days from that date are contributed.`}
              rows={impact.notCovered}
              cols={[
                ['PF wage', r => inr(r.pfWage)],
                ['PF applies from', r => fmtDate(r.pfEffectiveFrom)],
              ]}
            />
            <ImpactTable
              title={`Must join EPS — EPF-only members with PF wage within ${inr(impact.revision.toCeiling)} (${(impact.epsJoiners || []).length})`}
              hint={`In Statutory Config, tick "Member of the Employees' Pension Scheme" and set "EPS member from" to ${fmtDate(impact.revision.effectiveFrom)}.`}
              rows={impact.epsJoiners || []}
              cols={[
                ['PF wage', r => inr(r.pfWage)],
              ]}
            />
          </div>
        )}
      </Panel>

      <EmployerContribPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Employer PF & ESI inside CTC. Off: Gross = CTC/12 and the employer's PF/ESI
// are listed as deductions (legacy). On from a month: they are shown as
// employer cost within CTC, Gross = CTC/12 − employer PF − employer ESI, and
// only the employee's own share is deducted. Take-home is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
function EmployerContribPanel() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [from, setFrom] = useState('');
  const [saved, setSaved] = useState('');
  // This is per-company policy: saved on the active company, otherwise
  // inherited from the workspace default.
  const [ownValue, setOwnValue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getPayrollSettings(orgSlug);
        const v = res?.settings?.employerContribInCtcFrom || '';
        const own = (res?.settings?.companyOverrides || []).includes('employerContribInCtcFrom');
        if (alive) { setFrom(v); setSaved(v); setOwnValue(own); }
      } catch {
        if (alive) showToast('Failed to load payroll settings', 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  const save = async (value) => {
    setSaving(true);
    try {
      await updatePayrollSettings(orgSlug, { employerContribInCtcFrom: value || null });
      setFrom(value); setSaved(value); setOwnValue(true);
      showToast(value ? `Employer PF/ESI shown inside CTC from ${monthLabel(value)}` : 'Switched back to the current payslip format', 'success');
    } catch (e) {
      showToast(e?.response?.data?.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;
  const enabled = !!saved;

  return (
    <Panel title="Employer PF & ESI on payslips">
      <div style={{ display: 'grid', gap: 12, padding: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>Current format</span>
          <Chip tone={enabled ? 'brand' : 'neutral'}>
            {enabled ? `Included in CTC from ${monthLabel(saved)}` : 'Deducted from gross'}
          </Chip>
          <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
            {ownValue
              ? `Set for ${currentCompany?.name || 'this company'}`
              : 'Inherited from the workspace default'}
          </span>
        </div>
        <ExampleTable />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ font: "500 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>Use “included in CTC” from wage month</span>
            <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Effective wage month" style={{ width: 200 }}>
              <option value="">— Not enabled —</option>
              {monthOptions(saved).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </Select>
          </label>
          <Button onClick={() => save(from)} disabled={saving || from === saved}
            iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}>
            Save
          </Button>
        </div>
        <Callout tone="warn" icon={<AlertCircle size={16} />}>
          Pick the first month that has <strong>not</strong> been processed and paid yet. Earlier months keep their
          payslips as issued. Gross on the payslip becomes CTC minus the employer’s PF and ESI, so it will look lower,
          but take-home and company cost stay the same. A lower gross can bring a few employees under the ₹21,000
          ESI limit.
        </Callout>
      </div>
    </Panel>
  );
}

function ExampleTable() {
  const row = (label, a, b, opts = {}) => (
    <tr style={{ borderTop: '1px solid var(--line-2)' }}>
      <td style={{ ...td, fontWeight: opts.bold ? 600 : 400 }}>{label}</td>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a}</td>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b}</td>
    </tr>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Example: CTC ₹2,50,000 / month</th>
            <th style={{ ...th, textAlign: 'right' }}>Deducted from gross</th>
            <th style={{ ...th, textAlign: 'right' }}>Included in CTC</th>
          </tr>
        </thead>
        <tbody>
          {row('Gross on payslip', '₹2,50,000', '₹2,47,000')}
          {row('Employee PF (deduction)', '₹3,000', '₹3,000')}
          {row('Employer PF', '₹3,000 deduction', '₹3,000 company cost')}
          {row('Take-home before PT/TDS', '₹2,44,000', '₹2,44,000', { bold: true })}
        </tbody>
      </table>
    </div>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}
// Previous month through the next 12, plus the saved value if it is older.
function monthOptions(saved) {
  const now = new Date(Date.now() + 330 * 60000);
  const out = [];
  for (let i = -1; i <= 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  if (saved && !out.includes(saved)) out.unshift(saved);
  return out;
}

function ImpactTable({ title, hint, rows, cols }) {
  return (
    <div style={{ borderTop: '1px solid var(--line-2)' }}>
      <p style={{ ...td, margin: 0, fontWeight: 600, color: 'var(--fg)' }}>{title}</p>
      {hint && <p style={{ ...td, paddingTop: 0, margin: 0, color: 'var(--fg-4)', fontSize: 11.5 }}>{hint}</p>}
      {rows.length === 0 ? (
        <p style={{ ...td, paddingTop: 0, margin: 0, color: 'var(--fg-4)' }}>None.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Employee</th>
                {cols.map(([label]) => <th key={label} style={{ ...th, textAlign: 'right' }}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.employeeId} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td style={td}>
                    {r.name}
                    {r.employeeCode && <span style={{ color: 'var(--fg-4)', marginLeft: 6 }}>{r.employeeCode}</span>}
                  </td>
                  {cols.map(([label, fn]) => (
                    <td key={label} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fn(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
