// ============================================================================
// IncentiveSettings.jsx — Admin settings for the Incentive app
// ============================================================================

import { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import { Loader2, Save, Settings as SettingsIcon } from 'lucide-react';

const DEFAULTS = {
  paymentCutoffDay: 25,
  forfeitOnSeparation: true,
  rollForwardOnMissedPayslip: true,
  autoCreateOnPaid: true,
  defaultRecruiterRate: 0.06,
  defaultAccountManagerRate: 0.06,
};

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
      setForm({ ...DEFAULTS, ...(res || {}) });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      await incentiveApi.updateSettings(orgSlug, form);
      showToast('Settings saved', 'success');
    } catch (e) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
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
