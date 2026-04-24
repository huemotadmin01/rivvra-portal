// ============================================================================
// IncentiveSettings.jsx — Admin settings for the Incentive app
// ============================================================================

import { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import {
  Loader2,
  Save,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  ArrowRight,
} from 'lucide-react';

const DEFAULTS = {
  paymentCutoffDay: 25,
  forfeitOnSeparation: true,
  rollForwardOnMissedPayslip: true,
  autoCreateOnPaid: true,
  defaultRecruiterRate: 0.06,
  defaultAccountManagerRate: 0.06,
  fxRates: [],
};

// Typed mostly by hand in the editor — we'll normalize on save.
const BLANK_FX_ROW = { from: '', to: '', rate: '' };

export default function IncentiveSettings() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULTS);

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  async function load() {
    setLoading(true);
    try {
      const res = await incentiveApi.getSettings(orgSlug);
      setForm({
        ...DEFAULTS,
        ...(res || {}),
        fxRates: Array.isArray(res?.fxRates) ? res.fxRates : [],
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    // Normalize fxRates before sending: uppercase codes, coerce rate to
    // number, drop fully-empty rows. The server validates shape; we only
    // guard the common typo paths here.
    const cleanedFx = (form.fxRates || [])
      .map((r) => ({
        from: String(r.from || '').toUpperCase().trim(),
        to: String(r.to || '').toUpperCase().trim(),
        rate: Number(r.rate),
      }))
      .filter((r) => r.from || r.to || Number.isFinite(r.rate));

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <SettingsIcon className="text-fuchsia-400" /> Incentive Settings
        </h1>
        <p className="text-sm text-dark-400 mt-1">
          Org-wide defaults and lifecycle behavior
        </p>
      </div>

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
            onChange={(e) =>
              setForm({ ...form, paymentCutoffDay: Number(e.target.value) || 25 })
            }
            className={inputCls}
          />
        </Field>

        <Field label="Default Recruiter rate (%)">
          <input
            type="number"
            step="0.01"
            value={(form.defaultRecruiterRate * 100).toFixed(2)}
            onChange={(e) =>
              setForm({
                ...form,
                defaultRecruiterRate: (Number(e.target.value) || 0) / 100,
              })
            }
            className={inputCls}
          />
        </Field>

        <Field label="Default Account Manager rate (%)">
          <input
            type="number"
            step="0.01"
            value={(form.defaultAccountManagerRate * 100).toFixed(2)}
            onChange={(e) =>
              setForm({
                ...form,
                defaultAccountManagerRate: (Number(e.target.value) || 0) / 100,
              })
            }
            className={inputCls}
          />
        </Field>

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

      {/* FX rates — convert invoice currency to company functional currency
          for cross-border deals (e.g. USD invoice paying INR commissions). */}
      <div className="bg-dark-900 border border-dark-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">FX conversion rates</h2>
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
              <input
                type="text"
                placeholder="USD"
                maxLength={3}
                value={row.from || ''}
                onChange={(e) =>
                  updateFxRow(idx, { from: e.target.value.toUpperCase() })
                }
                className={`${inputCls} uppercase tracking-wider`}
              />
              <ArrowRight size={14} className="text-dark-500" />
              <input
                type="text"
                placeholder="INR"
                maxLength={3}
                value={row.to || ''}
                onChange={(e) =>
                  updateFxRow(idx, { to: e.target.value.toUpperCase() })
                }
                className={`${inputCls} uppercase tracking-wider`}
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
          disabled={saving}
          className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
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
