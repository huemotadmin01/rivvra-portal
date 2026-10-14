// ============================================================================
// LetterDefaultsPageV2.jsx — the figures the HR letters print by default,
// per employment type, per company (2026-10-14). Backed by
// GET/PUT /employee/letter-defaults. Read by the appointment letter, the
// consultancy letter, the contractor agreement, the rate confirmation, the
// ATS hire hand-off and the offer modal's notice/probation defaults.
// TDS % lives in Payroll settings and the signatory on the company record;
// both are shown here read-only so HR sees the whole picture in one place.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import { FileText, Save, AlertCircle, Shield } from 'lucide-react';
import { Button, EmptyState, Input, PageHeader, Panel, SettingRow, Spinner } from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

export default function LetterDefaultsPageV2() {
  const { orgSlug } = usePlatform();
  const { isOrgAdmin, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const canEdit = isOrgAdmin || getAppRole?.('employee') === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ fields: [], types: [], tdsByType: {}, updatedAt: null, updatedBy: null, stored: false });
  const [byType, setByType] = useState({});

  const load = async () => {
    try {
      setLoading(true); setError(null);
      const r = await employeeApi.getLetterDefaults(orgSlug);
      if (!r?.success) throw new Error(r?.error || 'Failed to load');
      setMeta({ fields: r.fields || [], types: r.types || [], tdsByType: r.tdsByType || {}, updatedAt: r.updatedAt, updatedBy: r.updatedBy, stored: !!r.stored });
      setByType(r.byType || {});
    } catch (e) { setError(e?.message || 'Failed to load letter defaults'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (orgSlug && canEdit) load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [orgSlug, canEdit, currentCompany?._id]);

  const save = async () => {
    try {
      setSaving(true);
      const r = await employeeApi.updateLetterDefaults(orgSlug, { byType });
      if (!r?.success) throw new Error(r?.error || 'Failed to save');
      setByType(r.byType || byType);
      setMeta((m) => ({ ...m, updatedAt: r.updatedAt, updatedBy: r.updatedBy, stored: true }));
      showToast('Letter defaults saved', 'success');
    } catch (e) { showToast(e?.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const set = (type, key, value) => setByType((b) => ({ ...b, [type]: { ...(b[type] || {}), [key]: value } }));
  const fieldsFor = useMemo(() => (type) => (meta.fields || []).filter((f) => (f.types || []).includes(type)), [meta.fields]);

  if (!canEdit) {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 760 }}>
        <EmptyState icon={<Shield size={22} />} tone="warn" title="Admin access required">Only Employee app admins can change the letter defaults.</EmptyState>
      </div>
    );
  }
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner label="Loading letter defaults…" /></div>;

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 760 }}>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><FileText size={18} style={{ color: 'var(--brand)' }} />Letter Defaults</span>}
        sub={`What the appointment letter, consultancy letter, contractor agreement and rate confirmation print unless the offer or the employee record says otherwise. Per company: ${currentCompany?.name || 'current company'}.`}
        actions={<Button size="sm" onClick={save} disabled={saving} iconLeft={<Save size={14} />}>{saving ? 'Saving…' : 'Save'}</Button>}
        style={{ marginBottom: 16 }}
      />
      {error && (
        <div style={{ display: 'flex', gap: 9, marginBottom: 16, padding: '10px 13px', borderRadius: 'var(--r-2)', background: 'var(--danger-soft)' }}>
          <AlertCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-2)' }}>{error}</p>
        </div>
      )}
      <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-3)', marginBottom: 14 }}>
        {meta.stored ? `Last saved ${meta.updatedAt ? new Date(meta.updatedAt).toLocaleString('en-GB') : ''}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}.` : 'Not saved yet — showing the built-in defaults.'}
        {' '}A saved offer or a value on the employee record always wins over these defaults.
      </p>

      {(meta.types || []).map((t) => (
        <Panel key={t.key} flush style={{ marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', font: `600 13px/1.4 ${FONT}`, color: 'var(--fg-1)' }}>
            {t.label}
            {meta.tdsByType?.[t.key] != null && <span style={{ marginLeft: 10, font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>TDS {meta.tdsByType[t.key]}% (Payroll settings)</span>}
          </div>
          {fieldsFor(t.key).map((f, i, arr) => (
            <SettingRow
              key={f.key}
              label={f.label}
              description={f.hint}
              style={i === arr.length - 1 ? { borderBottom: 'none' } : undefined}
              control={
                <Input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  min={f.kind === 'number' ? 0 : undefined}
                  max={f.kind === 'number' ? f.max : undefined}
                  value={byType?.[t.key]?.[f.key] ?? ''}
                  onChange={(e) => set(t.key, f.key, e.target.value)}
                  aria-label={`${t.label}: ${f.label}`}
                  style={{ width: f.kind === 'number' ? 96 : 220 }}
                />
              }
            />
          ))}
        </Panel>
      ))}
      <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>
        Not here on purpose: the TDS rate (Payroll → Settings), the signatory name and designation (company record), and the 24-month client clause, which is fixed text in the letters.
      </p>
    </div>
  );
}
