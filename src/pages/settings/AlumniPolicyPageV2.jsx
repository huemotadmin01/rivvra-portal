// ============================================================================
// AlumniPolicyPageV2.jsx — Admin config for the alumni (post-separation)
// lifecycle, on ds (phase 6a)
// ============================================================================
// Copied from AlumniPolicyPage.jsx. Unchanged: the `isOrgAdmin` gate (which
// also gates the fetch), the Number()/!! coercion on save, and the fact that
// the load error stays on the page while the form remains editable.
//
// Presentation moves to ds: `PageHeader`, a `Panel` of `SettingRow`s with
// `Input`/`Switch` controls, `EmptyState` for the no-access case. The tax
// window checkbox becomes a `Switch` — same boolean, same default.
// ============================================================================

import { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import alumniApi from '../../utils/alumniApi';
import { Shield, Save, AlertCircle } from 'lucide-react';
import {
  Button, EmptyState, Input, PageHeader, Panel, SettingRow, Spinner, Switch,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

export default function AlumniPolicyPageV2() {
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
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 680 }}>
        <EmptyState icon={<Shield size={22} />} tone="warn" title="Admin access required">
          Only organisation admins and owners can change the alumni policy.
        </EmptyState>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
        <Spinner label="Loading alumni policy…" />
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 680 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: 'var(--brand)' }} />
            Alumni Policy
          </span>
        }
        sub="How long separated employees keep read-only access to download payslips, tax reports and F&F receipts. Alumni do not count against your billing seats."
        style={{ marginBottom: 16 }}
      />

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 16, padding: '10px 13px',
          borderRadius: 'var(--r-2)', background: 'var(--danger-soft)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 26%, transparent)',
        }}>
          <AlertCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-2)' }}>{error}</p>
        </div>
      )}

      <Panel flush>
        <SettingRow
          label="Grace period (days)"
          description="Days after last working day an alumnus can still log in. Default: 90."
          control={
            <Input
              type="number"
              min={0}
              max={365}
              value={form.graceDays}
              onChange={(e) => setForm({ ...form, graceDays: e.target.value })}
              aria-label="Grace period in days"
              style={{ width: 96 }}
            />
          }
        />
        <SettingRow
          label="Extend to 30 Jun of next FY"
          description="When on, confirmed employees retain read-only access until they can file their ITR (tax filing window)."
          control={
            <Switch
              checked={!!form.taxWindowExtension}
              onChange={(next) => setForm({ ...form, taxWindowExtension: next })}
              label="Extend access for the tax filing window"
            />
          }
        />
        <SettingRow
          label="Reactivation default (days)"
          description="How long a one-click admin reactivation grants access to an archived alumnus. Default: 7."
          style={{ borderBottom: 'none' }}
          control={
            <Input
              type="number"
              min={1}
              max={90}
              value={form.reactivationDays}
              onChange={(e) => setForm({ ...form, reactivationDays: e.target.value })}
              aria-label="Reactivation default in days"
              style={{ width: 96 }}
            />
          }
        />
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Button onClick={save} disabled={saving} iconLeft={<Save size={15} />}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
