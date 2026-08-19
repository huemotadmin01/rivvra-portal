// ============================================================================
// RecordFormV2.jsx — Edit an existing incentive draft (admin only), on ds
// ============================================================================
// This form is edit-only. The "create draft" path is intentionally gone —
// drafts now originate from the server (invoice auto-create hook, the
// `from-invoice` admin endpoint, or migration scripts). See incentiveApi.js.
// The /records/:recordId/edit route is the only way into this component.
//
// `INITIAL`, the loaders, `setField`, `onSave` (with its `'' -> null` vs
// `Number(...)` coercions for the two override amounts and the salary
// snapshot), and `salaryHint` are all spliced in byte-identically. Those
// coercions decide whether an override is *cleared* or *set to zero*, which are
// very different things on a commission record.
//
// Reported, not fixed: the salary-snapshot field is labelled `(₹)` hardcoded,
// while the three money fields either side of it interpolate the record's own
// `currency`. Carried across exactly as-is.
//
// Not triggered: save.
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import { validateRecordForm } from '../../utils/incentiveValidate';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Panel, Button, Input, Select, Textarea, Field, PageSpinner } from '../../components/ds';

function FormSection({ title, children }) {
  return (
    <div>
      <h3 style={{
        font: "600 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em',
        textTransform: 'uppercase', color: 'var(--fg-4)', margin: '0 0 12px',
      }}>
        {title}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

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

export default function RecordFormV2() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { recordId } = useParams();
  const orgSlug = currentOrg?.slug;

  const [form, setForm] = useState(INITIAL);
  // Single employee pool — Recruiter / AM / Consultant all pick from the same
  // list so the search experience is consistent.
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salaryMeta, setSalaryMeta] = useState({ source: null, original: null });
  // Record-level currency (display only — backend owns the value).
  const [currency, setCurrency] = useState('INR');

  useEffect(() => {
    if (!orgSlug || !recordId) return;
    loadLookups();
    loadRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, recordId]);

  async function loadLookups() {
    try {
      const [emps, cl] = await Promise.all([
        incentiveApi.lookupEmployees(orgSlug),
        incentiveApi.lookupClients(orgSlug),
      ]);
      setEmployees(emps?.employees || emps || []);
      setClients(cl?.clients || cl || []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load employees / clients', 'error');
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
      setCurrency(r.currency || 'INR');
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
    try {
      validateRecordForm(form);
    } catch (e) {
      showToast(e.message, 'error');
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
      const res = await incentiveApi.updateRecord(orgSlug, recordId, payload);
      const id = res?.record?._id || res?._id || recordId;
      showToast('Record updated', 'success');
      navigate(orgPath(`/incentive/records/${id}`));
    } catch (e) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner label="Loading record…" />;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button variant="ghost" size="sm" aria-label="Back to records"
          onClick={() => navigate(orgPath('/incentive/records'))} iconLeft={<ArrowLeft size={17} />} />
        <h1 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
          Edit Record
        </h1>
      </div>

      <Panel>
        <div style={{ display: 'grid', gap: 20, padding: 4 }}>
          <FormSection title="Invoice">
            <Field label="Invoice #" htmlFor="rf-invno">
              <Input id="rf-invno" type="text" value={form.invoiceNumber} placeholder="INV/2026/0042"
                onChange={(e) => setField('invoiceNumber', e.target.value)} />
            </Field>
            <Field label="Client" required htmlFor="rf-client">
              <Select
                id="rf-client"
                value={form.clientContactId}
                onChange={(e) => {
                  const id = e.target.value;
                  const c = clients.find((x) => x._id === id);
                  setField('clientContactId', id);
                  setField('clientName', c?.name || '');
                }}
              >
                <option value="">— Select —</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={`Untaxed invoice value (${currency})`} required htmlFor="rf-untaxed">
              <Input id="rf-untaxed" type="number" step="0.01" value={form.untaxedInvoicedValue}
                onChange={(e) => setField('untaxedInvoicedValue', e.target.value)} />
            </Field>
            <Field label="Service month" required htmlFor="rf-svcmonth">
              <Input id="rf-svcmonth" type="month" value={form.serviceMonth}
                onChange={(e) => setField('serviceMonth', e.target.value)} />
            </Field>
            <Field label="Payment received date" htmlFor="rf-paydate">
              <Input id="rf-paydate" type="date" value={form.paymentReceivedDate}
                onChange={(e) => setField('paymentReceivedDate', e.target.value)} />
            </Field>
            <Field label="Payout month (override)" htmlFor="rf-payoutmonth">
              <Input id="rf-payoutmonth" type="month" value={form.payoutMonth} placeholder="Auto-derived if blank"
                onChange={(e) => setField('payoutMonth', e.target.value)} />
            </Field>
          </FormSection>

          <FormSection title="Consultant">
            <Field label="Consultant (whose work was invoiced)" required htmlFor="rf-consultant">
              <Select
                id="rf-consultant"
                value={form.consultantEmployeeId}
                onChange={(e) => {
                  const id = e.target.value;
                  const emp = employees.find((x) => x._id === id);
                  setField('consultantEmployeeId', id);
                  setField('consultantName', emp?.name || '');
                }}
              >
                <option value="">— Select —</option>
                {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </Select>
            </Field>
            {/* Label hardcodes ₹ while its neighbours interpolate `currency`.
                Carried across verbatim — see the header note. */}
            <Field label="Consultant salary snapshot (₹)" hint={salaryHint(salaryMeta.source)} htmlFor="rf-salary">
              <Input id="rf-salary" type="number" step="0.01" value={form.consultantSalarySnapshot}
                placeholder="Leave blank to pull from payroll"
                onChange={(e) => setField('consultantSalarySnapshot', e.target.value)} />
            </Field>
          </FormSection>

          <FormSection title="Recruiter / Account Manager">
            <Field label="Recruiter" htmlFor="rf-recruiter">
              <Select id="rf-recruiter" value={form.recruiterEmployeeId}
                onChange={(e) => setField('recruiterEmployeeId', e.target.value)}>
                <option value="">— None —</option>
                {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label={`Recruiter amount override (${currency})`} htmlFor="rf-recoverride">
              <Input id="rf-recoverride" type="number" step="0.01" value={form.recruiterAmountOverride}
                placeholder="Leave blank to use % rate"
                onChange={(e) => setField('recruiterAmountOverride', e.target.value)} />
            </Field>
            <Field label="Account Manager" htmlFor="rf-am">
              <Select id="rf-am" value={form.accountManagerEmployeeId}
                onChange={(e) => setField('accountManagerEmployeeId', e.target.value)}>
                <option value="">— None —</option>
                {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label={`AM amount override (${currency})`} htmlFor="rf-amoverride">
              <Input id="rf-amoverride" type="number" step="0.01" value={form.accountManagerAmountOverride}
                placeholder="Leave blank to use % rate"
                onChange={(e) => setField('accountManagerAmountOverride', e.target.value)} />
            </Field>
          </FormSection>

          <FormSection title="Notes">
            <div style={{ gridColumn: '1 / -1' }}>
              <Textarea id="rf-remarks" aria-label="Internal notes" rows={3} value={form.remarks}
                placeholder="Internal notes…"
                onChange={(e) => setField('remarks', e.target.value)} />
            </div>
          </FormSection>
        </div>
      </Panel>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <Button variant="secondary" size="sm" onClick={() => navigate(orgPath('/incentive/records'))}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving}
          iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}>
          Save
        </Button>
      </div>
    </div>
  );
}

function salaryHint(source) {
  if (source === 'admin_override') return 'Manually overridden by an admin.';
  if (source === 'payroll_run') return 'Pulled from the paid payroll run. Editing here overrides it.';
  if (source === 'pending_payroll' || source === 'salary_hold' || !source) {
    return 'Payroll not yet released — enter a value manually or leave blank until payslip is released.';
  }
  return null;
}
