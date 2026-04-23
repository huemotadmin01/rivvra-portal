// ============================================================================
// RecordForm.jsx — Create / edit an incentive record (admin only)
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

const INITIAL = {
  invoiceNumber: '',
  clientContactId: '',
  clientName: '',
  consultantEmployeeId: '',
  consultantName: '',
  serviceMonth: '',
  paymentReceivedDate: '',
  untaxedInvoicedValue: '',
  consultantSalarySnapshot: '',
  recruiterEmployeeId: '',
  accountManagerEmployeeId: '',
  recruiterAmountOverride: '',
  accountManagerAmountOverride: '',
  payoutMonth: '',
  remarks: '',
};

export default function RecordForm() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { recordId } = useParams();
  const orgSlug = currentOrg?.slug;
  const isEdit = !!recordId;

  const [form, setForm] = useState(INITIAL);
  const [employees, setEmployees] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [salaryMeta, setSalaryMeta] = useState({ source: null, original: null });

  useEffect(() => {
    if (!orgSlug) return;
    loadLookups();
    if (isEdit) loadRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, recordId]);

  async function loadLookups() {
    try {
      const [emps, cons, cl] = await Promise.all([
        incentiveApi.lookupEmployees(orgSlug),
        incentiveApi.lookupEmployees(orgSlug, { consultant: true }),
        incentiveApi.lookupClients(orgSlug),
      ]);
      setEmployees(emps?.employees || emps || []);
      setConsultants(cons?.employees || cons || []);
      setClients(cl?.clients || cl || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadRecord() {
    setLoading(true);
    try {
      const resp = await incentiveApi.getRecord(orgSlug, recordId);
      const r = resp?.record || resp || {};
      setForm({
        invoiceNumber: r.invoiceNumber || '',
        clientContactId: r.clientContactId || '',
        clientName: r.clientName || '',
        consultantEmployeeId: r.consultantEmployeeId || '',
        consultantName: r.consultantName || '',
        serviceMonth: r.serviceMonth || '',
        paymentReceivedDate: r.paymentReceivedDate
          ? r.paymentReceivedDate.slice(0, 10)
          : '',
        untaxedInvoicedValue: r.untaxedInvoicedValue ?? '',
        consultantSalarySnapshot: r.consultantSalarySnapshot ?? '',
        recruiterEmployeeId: r.recruiterEmployeeId || '',
        accountManagerEmployeeId: r.accountManagerEmployeeId || '',
        recruiterAmountOverride: r.recruiterAmountOverride ?? '',
        accountManagerAmountOverride: r.accountManagerAmountOverride ?? '',
        payoutMonth: r.payoutMonth || '',
        remarks: r.remarks || '',
      });
      setSalaryMeta({
        source: r.consultantSalarySource || null,
        original: r.consultantSalarySnapshot ?? null,
      });
    } catch (e) {
      showToast('Failed to load record', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSave() {
    if (!form.clientContactId && !form.clientName) {
      showToast('Client is required', 'error');
      return;
    }
    if (!form.consultantEmployeeId) {
      showToast('Consultant is required', 'error');
      return;
    }
    if (!form.serviceMonth) {
      showToast('Service month is required', 'error');
      return;
    }
    if (!form.untaxedInvoicedValue) {
      showToast('Untaxed invoice value is required', 'error');
      return;
    }
    if (!form.recruiterEmployeeId && !form.accountManagerEmployeeId) {
      showToast('At least one of Recruiter / AM is required', 'error');
      return;
    }

    const payload = {
      ...form,
      untaxedInvoicedValue: Number(form.untaxedInvoicedValue) || 0,
      consultantSalarySnapshot:
        form.consultantSalarySnapshot === '' || form.consultantSalarySnapshot == null
          ? null
          : Number(form.consultantSalarySnapshot),
      recruiterAmountOverride:
        form.recruiterAmountOverride === ''
          ? null
          : Number(form.recruiterAmountOverride),
      accountManagerAmountOverride:
        form.accountManagerAmountOverride === ''
          ? null
          : Number(form.accountManagerAmountOverride),
    };

    setSaving(true);
    try {
      const res = isEdit
        ? await incentiveApi.updateRecord(orgSlug, recordId, payload)
        : await incentiveApi.createRecord(orgSlug, payload);
      const id = res?.record?._id || res?._id || recordId;
      showToast(isEdit ? 'Record updated' : 'Record created', 'success');
      navigate(orgPath(`/incentive/records/${id}`));
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
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(orgPath('/incentive/records'))}
          className="text-dark-400 hover:text-white p-1"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">
          {isEdit ? 'Edit Record' : 'New Incentive Record'}
        </h1>
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl p-6 space-y-5">
        <Section title="Invoice">
          <Field label="Invoice #">
            <input
              type="text"
              value={form.invoiceNumber}
              onChange={(e) => setField('invoiceNumber', e.target.value)}
              className={inputCls}
              placeholder="INV/2026/0042"
            />
          </Field>
          <Field label="Client" required>
            <select
              value={form.clientContactId}
              onChange={(e) => {
                const id = e.target.value;
                const c = clients.find((x) => x._id === id);
                setField('clientContactId', id);
                setField('clientName', c?.name || '');
              }}
              className={inputCls}
            >
              <option value="">— Select —</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Untaxed invoice value (₹)" required>
            <input
              type="number"
              step="0.01"
              value={form.untaxedInvoicedValue}
              onChange={(e) => setField('untaxedInvoicedValue', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Service month" required>
            <input
              type="month"
              value={form.serviceMonth}
              onChange={(e) => setField('serviceMonth', e.target.value)}
              className={`${inputCls} [color-scheme:dark]`}
            />
          </Field>
          <Field label="Payment received date">
            <input
              type="date"
              value={form.paymentReceivedDate}
              onChange={(e) => setField('paymentReceivedDate', e.target.value)}
              className={`${inputCls} [color-scheme:dark]`}
            />
          </Field>
          <Field label="Payout month (override)">
            <input
              type="month"
              value={form.payoutMonth}
              onChange={(e) => setField('payoutMonth', e.target.value)}
              className={`${inputCls} [color-scheme:dark]`}
              placeholder="Auto-derived if blank"
            />
          </Field>
        </Section>

        <Section title="Consultant">
          <Field label="Consultant (whose work was invoiced)" required>
            <select
              value={form.consultantEmployeeId}
              onChange={(e) => {
                const id = e.target.value;
                const emp = consultants.find((x) => x._id === id);
                setField('consultantEmployeeId', id);
                setField('consultantName', emp?.name || '');
              }}
              className={inputCls}
            >
              <option value="">— Select —</option>
              {consultants.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Consultant salary snapshot (₹)"
            hint={salaryHint(salaryMeta.source, isEdit)}
          >
            <input
              type="number"
              step="0.01"
              value={form.consultantSalarySnapshot}
              onChange={(e) => setField('consultantSalarySnapshot', e.target.value)}
              className={inputCls}
              placeholder="Leave blank to pull from payroll"
            />
          </Field>
        </Section>

        <Section title="Recruiter / Account Manager">
          <Field label="Recruiter">
            <select
              value={form.recruiterEmployeeId}
              onChange={(e) => setField('recruiterEmployeeId', e.target.value)}
              className={inputCls}
            >
              <option value="">— None —</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recruiter amount override (₹)">
            <input
              type="number"
              step="0.01"
              value={form.recruiterAmountOverride}
              onChange={(e) =>
                setField('recruiterAmountOverride', e.target.value)
              }
              className={inputCls}
              placeholder="Leave blank to use % rate"
            />
          </Field>
          <Field label="Account Manager">
            <select
              value={form.accountManagerEmployeeId}
              onChange={(e) =>
                setField('accountManagerEmployeeId', e.target.value)
              }
              className={inputCls}
            >
              <option value="">— None —</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="AM amount override (₹)">
            <input
              type="number"
              step="0.01"
              value={form.accountManagerAmountOverride}
              onChange={(e) =>
                setField('accountManagerAmountOverride', e.target.value)
              }
              className={inputCls}
              placeholder="Leave blank to use % rate"
            />
          </Field>
        </Section>

        <Section title="Notes">
          <div className="col-span-2">
            <textarea
              value={form.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Internal notes…"
            />
          </div>
        </Section>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => navigate(orgPath('/incentive/records'))}
          className="px-4 py-2 rounded-lg bg-dark-800 text-dark-200 hover:bg-dark-700 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isEdit ? 'Save' : 'Create Draft'}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-600';

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-dark-400 uppercase mb-3">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs text-dark-300 block mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-dark-400 mt-1 block">{hint}</span>}
    </label>
  );
}

function salaryHint(source, isEdit) {
  if (!isEdit) return 'Leave blank to auto-pull from the paid payroll run.';
  if (source === 'admin_override') return 'Manually overridden by an admin.';
  if (source === 'payroll_run') return 'Pulled from the paid payroll run. Editing here overrides it.';
  if (source === 'pending_payroll' || source === 'salary_hold' || !source) {
    return 'Payroll not yet released — enter a value manually or leave blank until payslip is released.';
  }
  return null;
}
