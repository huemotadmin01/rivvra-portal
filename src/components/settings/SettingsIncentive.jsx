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

export default function SettingsIncentive() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Award className="text-fuchsia-400" size={20} />
        <h2 className="text-lg font-semibold text-white">Incentive</h2>
        <span className="text-xs text-dark-500">— org-wide defaults & lifecycle behavior</span>
      </div>

      {loadError && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-900/40 text-red-300 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Settings failed to load
              </p>
              <p className="text-xs text-dark-400 mt-0.5">
                Save is disabled until reload succeeds — we won’t overwrite
                your real settings with the form’s built-in defaults.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-xs text-dark-200 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <div className="bg-dark-900 border border-dark-800 rounded-xl p-6 space-y-5">
        <Field
          label="Payout cut-off day"
          hint="If payment is received on/before this day, it pays in the same calendar month. After → next month."
        >
          <input
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
            className={inputCls}
          />
        </Field>

        <div className="text-xs text-dark-500 italic border-l-2 border-dark-800 pl-3">
          Looking for default Recruiter / AM rates? They moved to the{' '}
          <span className="text-dark-300">Rate Table → Org-wide</span> scope so
          you can version them with effective dates and override per tier or
          person from one place.
        </div>

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

      <div className="bg-dark-900 border border-dark-800 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white">FX conversion rates</h3>
          <p className="text-xs text-dark-400 mt-1">
            Used when an invoice is in a different currency than the company's
            functional currency. Recruiter / Account Manager commissions are
            always paid in the functional currency. Approved records lock their
            snapshot — changes here only affect future drafts and existing
            drafts (which re-snapshot on save).
          </p>
        </div>

        {(form.fxRates || []).length === 0 && (
          <div className="text-xs text-dark-400 italic">
            No rates configured. Cross-currency drafts will be flagged for
            review and cannot be approved until a rate is added.
          </div>
        )}

        <div className="space-y-2">
          {(form.fxRates || []).map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-2 items-center"
            >
              <CurrencySelect
                value={row.from || ''}
                onChange={(code) => updateFxRow(idx, { from: code })}
                placeholder="From"
              />
              <ArrowRight size={14} className="text-dark-500" />
              <CurrencySelect
                value={row.to || ''}
                onChange={(code) => updateFxRow(idx, { to: code })}
                placeholder="To"
              />
              <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Rate (e.g. 85)"
                value={row.rate ?? ''}
                onChange={(e) => updateFxRow(idx, { rate: e.target.value })}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => removeFxRow(idx)}
                className="p-2 text-dark-400 hover:text-red-400 hover:bg-dark-800 rounded-lg"
                title="Remove rate"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={addFxRow}
            className="text-xs text-fuchsia-300 hover:text-fuchsia-200 flex items-center gap-1"
          >
            <Plus size={12} /> Add rate
          </button>
          {(form.fxRates || []).some((r) => r.updatedAt) && (
            <span className="text-[11px] text-dark-500">
              Last update:{' '}
              {new Date(
                Math.max(
                  ...(form.fxRates || [])
                    .map((r) => (r.updatedAt ? new Date(r.updatedAt).getTime() : 0)),
                ),
              ).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving || loadError}
          title={loadError ? 'Reload settings before saving' : ''}
          className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-600';

function CurrencySelect({ value, onChange, placeholder }) {
  const val = String(value || '').toUpperCase();
  const isKnown = CURRENCY_OPTIONS.some((o) => o.code === val);
  return (
    <select
      value={val}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} appearance-none cursor-pointer`}
    >
      <option value="" disabled>
        {placeholder || 'Select currency'}
      </option>
      {!isKnown && val && <option value={val}>{val} (legacy)</option>}
      {CURRENCY_OPTIONS.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">{label}</label>
      {hint && <p className="text-xs text-dark-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function Toggle({ label, hint, value, onChange, danger }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <label
            className={`block text-sm font-medium ${
              danger ? 'text-amber-300' : 'text-white'
            }`}
          >
            {label}
          </label>
          {hint && <p className="text-xs text-dark-400 mt-1">{hint}</p>}
        </div>
        <button
          role="switch"
          aria-checked={value}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            value ? 'bg-fuchsia-600' : 'bg-dark-700'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform mt-0.5 ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
