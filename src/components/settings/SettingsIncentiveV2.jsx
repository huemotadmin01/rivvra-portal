// ============================================================================
// SettingsIncentive.jsx — Incentive app settings, hosted in the global
// Settings hub (/org/:slug/settings/incentive).
//
// Migrated out of pages/incentive/IncentiveSettings.jsx so all app settings
// live in one place, matching the pattern used by SettingsInvoicing,
// SettingsEmployee, etc.
//
// Removed in this migration: the standalone "Default Recruiter rate" and
// "Default Account Manager rate" fields. They duplicated the Rate Table's
// org-wide scope (which is now the canonical place to set role-wide
// defaults). The persisted values stay in the DB as a hidden Layer-4
// fallback for the resolver — admins just don't see/edit them here.
// ============================================================================

import { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import {
  Loader2,
  Save,
  Award,
  Plus,
  Trash2,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import {
  Panel, Button, Input, Select, Switch, Callout, PageSpinner,
} from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// This is a money surface: the FX table decides what a recruiter or account
// manager is actually paid when an invoice is raised in a currency other than
// the company's functional one. Everything from `const { currentOrg }` down to
// `removeFxRow` is spliced in verbatim — 131 lines — and so are the three
// module-level tables and `CurrencySelect`.
//
// Three details that are easy to lose and expensive to lose:
//
//   · `DEFAULTS` still carries `defaultRecruiterRate` / `defaultAccountManagerRate`
//     at 0.06. They are deliberately NOT rendered — the Rate Table owns them
//     now — but they must stay in the object, because `onSave` PUTs `...form`
//     and dropping them would erase the resolver's Layer-4 fallback.
//   · The `loadError` guard exists so a failed fetch cannot render built-in
//     DEFAULTS and let a Save click overwrite the org's real settings. It
//     disables Save and says why.
//   · `CurrencySelect` re-offers an unknown stored code as "(legacy)" instead
//     of silently resetting it to blank — which would drop an FX pair on the
//     next save.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  paymentCutoffDay: 25,
  forfeitOnSeparation: true,
  rollForwardOnMissedPayslip: true,
  autoCreateOnPaid: true,
  // Kept in shape so the server round-trips them; not exposed in the UI any
  // longer (the Rate Table's org-wide scope is the canonical default).
  defaultRecruiterRate: 0.06,
  defaultAccountManagerRate: 0.06,
  fxRates: [],
};

const BLANK_FX_ROW = { from: '', to: '', rate: '' };

const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
];

/** Label + hint above a control. */
function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 4 }}>
        {label}
      </label>
      {hint && <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Labelled toggle. `danger` marks a setting with a legal consequence — the
 * label takes the warn ink so it does not read like the other two.
 */
function Toggle({ label, hint, value, onChange, danger }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ display: 'block', font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", color: danger ? 'var(--warn-ink)' : 'var(--fg)' }}>
          {label}
        </span>
        {hint && <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>{hint}</p>}
      </div>
      <Switch label={label} checked={value} onChange={onChange} />
    </div>
  );
}

function CurrencySelect({ value, onChange, placeholder, ...rest }) {
  const val = String(value || '').toUpperCase();
  const isKnown = CURRENCY_OPTIONS.some((o) => o.code === val);
  return (
    <Select value={val} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="" disabled>
        {placeholder || 'Select currency'}
      </option>
      {!isKnown && val && <option value={val}>{val} (legacy)</option>}
      {CURRENCY_OPTIONS.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export default function SettingsIncentiveV2() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  // We only allow Save when the most-recent load actually returned data.
  // Otherwise a fetch failure would render the form with built-in DEFAULTS
  // and a Save click would silently overwrite the org's real settings.
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  async function load() {
    setLoading(true);
    try {
      const res = await incentiveApi.getSettings(orgSlug);
      const s = res?.settings || res || {};
      setForm({
        ...DEFAULTS,
        ...s,
        fxRates: Array.isArray(s.fxRates) ? s.fxRates : [],
      });
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
      showToast(
        e?.message ||
          'Failed to load incentive settings. Save is disabled until reload succeeds — your existing settings are safe.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (loadError) {
      showToast(
        'Settings failed to load. Reload the page before saving so we don’t overwrite your real settings with built-in defaults.',
        'error',
      );
      return;
    }

    const cutoff = Number(form.paymentCutoffDay);
    if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 31) {
      showToast('Payout cut-off day must be a whole number 1..31', 'error');
      return;
    }

    // ---- Normalise + validate FX rate rows --------------------------------
    const rawRows = (form.fxRates || []).map((r) => ({
      ...r,
      from: String(r.from || '').toUpperCase().trim(),
      to: String(r.to || '').toUpperCase().trim(),
      rate: Number(r.rate),
    }));
    const partial = rawRows.filter(
      (r) =>
        (r.from || r.to || r.rate) &&
        (!r.from || !r.to || !Number.isFinite(r.rate) || r.rate <= 0),
    );
    if (partial.length) {
      showToast(
        'Please complete all FX rate rows (From, To, and a positive Rate) before saving.',
        'error',
      );
      return;
    }

    const sameCcy = rawRows.filter((r) => r.from && r.to && r.from === r.to);
    if (sameCcy.length) {
      showToast(
        `Removed ${sameCcy.length} same-currency row${sameCcy.length === 1 ? '' : 's'} (FX rates only apply across currencies).`,
        'warning',
      );
    }

    const cleanedFx = rawRows.filter(
      (r) => r.from && r.to && r.from !== r.to && Number.isFinite(r.rate) && r.rate > 0,
    );
    const seen = new Set();
    for (const r of cleanedFx) {
      const key = `${r.from}->${r.to}`;
      if (seen.has(key)) {
        showToast(
          `Duplicate FX pair ${r.from} → ${r.to}. Keep one row per pair.`,
          'error',
        );
        return;
      }
      seen.add(key);
    }

    setSaving(true);
    try {
      await incentiveApi.updateSettings(orgSlug, { ...form, fxRates: cleanedFx });
      showToast('Settings saved', 'success');
      await load();
    } catch (e) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateFxRow(idx, patch) {
    setForm((prev) => {
      const next = Array.isArray(prev.fxRates) ? [...prev.fxRates] : [];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, fxRates: next };
    });
  }
  function addFxRow() {
    setForm((prev) => ({
      ...prev,
      fxRates: [...(prev.fxRates || []), { ...BLANK_FX_ROW }],
    }));
  }
  function removeFxRow(idx) {
    setForm((prev) => ({
      ...prev,
      fxRates: (prev.fxRates || []).filter((_, i) => i !== idx),
    }));
  }

  if (loading) return <PageSpinner label="Loading incentive settings…" />;

  const fxRows = form.fxRates || [];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Award size={18} style={{ color: 'var(--acc-fuchsia)' }} />
        <h2 style={{ font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>Incentive</h2>
        <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>— org-wide defaults &amp; lifecycle behavior</span>
      </div>

      {loadError && (
        <Callout
          tone="danger"
          icon={<AlertTriangle size={16} />}
          title="Settings failed to load"
          actions={<Button variant="secondary" size="sm" type="button" onClick={load}>Retry</Button>}
        >
          Save is disabled until reload succeeds — we won’t overwrite your real
          settings with the form’s built-in defaults.
        </Callout>
      )}

      <Panel>
        <div style={{ padding: 6, display: 'grid', gap: 18 }}>
          <Field
            id="inc-cutoff"
            label="Payout cut-off day"
            hint="If payment is received on/before this day, it pays in the same calendar month. After → next month."
          >
            <Input
              id="inc-cutoff"
              type="number"
              min={1}
              max={31}
              value={form.paymentCutoffDay}
              onChange={(e) => {
                const raw = e.target.value;
                setForm({
                  ...form,
                  paymentCutoffDay: raw === '' ? '' : Number(raw),
                });
              }}
              style={{ width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
            />
          </Field>

          <p style={{
            font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic',
            borderLeft: '2px solid var(--line-2)', paddingLeft: 12, margin: 0,
          }}>
            Looking for default Recruiter / AM rates? They moved to the{' '}
            <span style={{ color: 'var(--fg-2)', fontStyle: 'normal' }}>Rate Table → Org-wide</span> scope so
            you can version them with effective dates and override per tier or
            person from one place.
          </p>

          <Toggle
            label="Auto-create on invoice paid"
            hint="When an invoice is marked fully paid, auto-create Draft incentive records for each consultant line. Recruiter is pulled from the consultant's Sourced By; AM from the client's Salesperson. Skipped groups raise an admin notification."
            value={form.autoCreateOnPaid}
            onChange={(v) => setForm({ ...form, autoCreateOnPaid: v })}
          />

          <Toggle
            label="Roll forward on missed payslip"
            hint="If a payslip is released without this incentive included, auto-bump its payout month +1."
            value={form.rollForwardOnMissedPayslip}
            onChange={(v) => setForm({ ...form, rollForwardOnMissedPayslip: v })}
          />

          <Toggle
            label="Forfeit on separation"
            hint="If an employee separates before the incentive is paid, auto-cancel the record. Review your local labour law (Payment of Wages Act in India) before enabling."
            value={form.forfeitOnSeparation}
            onChange={(v) => setForm({ ...form, forfeitOnSeparation: v })}
            danger
          />
        </div>
      </Panel>

      <Panel title="FX conversion rates">
        <div style={{ padding: 6, display: 'grid', gap: 14 }}>
          <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
            Used when an invoice is in a different currency than the company's
            functional currency. Recruiter / Account Manager commissions are
            always paid in the functional currency. Approved records lock their
            snapshot — changes here only affect future drafts and existing
            drafts (which re-snapshot on save).
          </p>

          {fxRows.length === 0 && (
            <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic', margin: 0 }}>
              No rates configured. Cross-currency drafts will be flagged for
              review and cannot be approved until a rate is added.
            </p>
          )}

          {fxRows.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {fxRows.map((row, idx) => (
                <div
                  key={idx}
                  style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr 1fr auto', gap: 8, alignItems: 'center' }}
                >
                  <CurrencySelect
                    value={row.from || ''}
                    onChange={(code) => updateFxRow(idx, { from: code })}
                    placeholder="From"
                    aria-label={`FX row ${idx + 1} from currency`}
                  />
                  <ArrowRight size={14} style={{ color: 'var(--fg-4)' }} />
                  <CurrencySelect
                    value={row.to || ''}
                    onChange={(code) => updateFxRow(idx, { to: code })}
                    placeholder="To"
                    aria-label={`FX row ${idx + 1} to currency`}
                  />
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="Rate (e.g. 85)"
                    aria-label={`FX row ${idx + 1} rate`}
                    value={row.rate ?? ''}
                    onChange={(e) => updateFxRow(idx, { rate: e.target.value })}
                    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => removeFxRow(idx)}
                    title="Remove rate"
                    aria-label={`Remove FX row ${idx + 1}`}
                    iconLeft={<Trash2 size={14} />}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Button variant="ghost" size="sm" type="button" onClick={addFxRow} iconLeft={<Plus size={12} />}>
              Add rate
            </Button>
            {fxRows.some((r) => r.updatedAt) && (
              <span style={{ font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                Last update:{' '}
                {new Date(
                  Math.max(
                    ...fxRows
                      .map((r) => (r.updatedAt ? new Date(r.updatedAt).getTime() : 0)),
                  ),
                ).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          onClick={onSave}
          disabled={saving || loadError}
          title={loadError ? 'Reload settings before saving' : ''}
          iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
